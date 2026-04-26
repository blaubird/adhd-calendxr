'use client';
import React, { useState, useEffect } from 'react';
import { generateGrid, evaluateGrid, WinResult, SymbolType, SYMBOLS, getRandomSymbol, SPIN_COST, PAYOUTS } from './slot-logic';

const SPIN_DURATION_MS = 1500;
const REEL_DELAY_MS = 250;
const SLOT_SCORE_STORAGE_KEY = 'calendar-brain:slot-score';

export default function GamblingTab() {
  const [grid, setGrid] = useState<SymbolType[][]>(() => generateGrid());
  const [isSpinning, setIsSpinning] = useState(false);
  const [wins, setWins] = useState<WinResult[]>([]);
  const [totalPoints, setTotalPoints] = useState(1000);
  const [recentWin, setRecentWin] = useState(0);
  const [isClient, setIsClient] = useState(false);

  // Load from local storage on mount
  useEffect(() => {
    setIsClient(true);
    const saved = localStorage.getItem(SLOT_SCORE_STORAGE_KEY);
    if (saved !== null) {
      setTotalPoints(parseInt(saved, 10));
    }
  }, []);

  // Save to local storage when points change
  useEffect(() => {
    if (isClient) {
      localStorage.setItem(SLOT_SCORE_STORAGE_KEY, totalPoints.toString());
    }
  }, [totalPoints, isClient]);

  const spin = () => {
    if (isSpinning) return;
    setIsSpinning(true);
    setWins([]);
    setRecentWin(0);
    setTotalPoints(p => p - SPIN_COST);

    // Generate final outcome early so we can pass it down
    const finalGrid = generateGrid();
    setGrid(finalGrid);

    // After the last reel finishes its animation
    setTimeout(() => {
      const newWins = evaluateGrid(finalGrid);
      setWins(newWins);
      const totalPayout = newWins.reduce((sum, win) => sum + win.payout, 0);
      setRecentWin(totalPayout);
      if (totalPayout > 0) {
        setTotalPoints(p => p + totalPayout);
      }
      setIsSpinning(false);
    }, SPIN_DURATION_MS + (4 * REEL_DELAY_MS));
  };

  const resetScore = () => {
    setTotalPoints(1000);
    setRecentWin(0);
    setWins([]);
  };

  const getWinMessage = () => {
    if (isSpinning) return 'SPINNING...';
    if (wins.length === 0) return 'TRY YOUR LUCK!';
    if (recentWin >= PAYOUTS.jackpot) return '🎰 JACKPOT VIBE! 🎰';
    if (recentWin >= PAYOUTS.big) return '🔥 BIG WIN! 🔥';
    if (recentWin >= PAYOUTS.medium) return '✨ GREAT HIT ✨';
    return '✨ NICE WIN ✨';
  };

  const isPositionWinning = (reelIndex: number, rowIndex: number) => {
    return wins.some(win => win.positions.some(pos => pos.reel === reelIndex && pos.row === rowIndex));
  };

  // Prevent hydration mismatch
  if (!isClient) return null;

  return (
    <div className="gambling-tab animate-fade-in">
      <div className="gambling-stage">
        
        <div className="gambling-header">
          <div>
            {(totalPoints <= 0 || totalPoints < SPIN_COST) && !isSpinning && (
              <button 
                onClick={resetScore}
                className="gambling-refill"
              >
                Refill Chips
              </button>
            )}
          </div>
          <div>
            <h1 className="gambling-title drop-shadow-md">Cosmic Slots</h1>
            <p className="gambling-subtitle">Match 3+ consecutive symbols to win. {SPIN_COST} pts per spin.</p>
          </div>
        </div>

        {/* Score & Message Board */}
        <div className="gambling-scoreboard">
          <div className="gambling-score-row">
            <div className="flex flex-col items-start">
              <span className="gambling-score-label">Balance</span>
              <span className={`gambling-score-value ${totalPoints < 0 ? 'text-rose-400' : 'text-sky-400'}`}>
                {totalPoints}
              </span>
            </div>
            <div className="flex flex-col items-end">
              <span className="gambling-score-label">Last Win</span>
              <span className={`gambling-score-value transition-colors duration-300 ${recentWin > 0 ? 'text-emerald-400' : 'text-slate-600'}`}>
                {recentWin > 0 ? `+${recentWin}` : '0'}
              </span>
            </div>
          </div>
          <div className={`gambling-message transition-all duration-300 ${
            isSpinning ? 'text-slate-500 animate-pulse' :
            recentWin >= PAYOUTS.jackpot ? 'text-amber-400 drop-shadow-[0_0_10px_rgba(251,191,36,0.8)] animate-bounce' :
            recentWin >= PAYOUTS.big ? 'text-emerald-400 drop-shadow-[0_0_10px_rgba(52,211,153,0.5)]' :
            recentWin > 0 ? 'text-sky-300' :
            'text-slate-400'
          }`}>
            {getWinMessage()}
          </div>
        </div>

        {/* Slot Machine */}
        <div className="slot-machine">
          <div className="slot-reels">
            {grid.map((column, reelIndex) => (
              <div 
                key={reelIndex} 
                className="slot-reel relative"
              >
                <Reel 
                  isSpinning={isSpinning} 
                  delay={reelIndex * REEL_DELAY_MS} 
                  finalSymbols={column} 
                  reelIndex={reelIndex} 
                  isPositionWinning={isPositionWinning} 
                />
              </div>
            ))}
          </div>
        </div>

        <button
          onClick={spin}
          disabled={isSpinning}
          className={`gambling-spin-btn ${
            isSpinning
              ? 'gambling-spin-btn--busy'
              : 'gambling-spin-btn--ready'
          }`}
        >
          {isSpinning ? 'Spinning...' : `Spin (${SPIN_COST})`}
        </button>

      </div>
    </div>
  );
}

function Reel({ 
  isSpinning, 
  delay, 
  finalSymbols, 
  reelIndex, 
  isPositionWinning 
}: { 
  isSpinning: boolean;
  delay: number;
  finalSymbols: SymbolType[];
  reelIndex: number;
  isPositionWinning: (reel: number, row: number) => boolean;
}) {
  const [symbols, setSymbols] = useState<SymbolType[]>(finalSymbols);
  const [isLocallySpinning, setIsLocallySpinning] = useState(false);
  
  useEffect(() => {
    if (isSpinning) {
      setIsLocallySpinning(true);
      const interval = setInterval(() => {
        setSymbols([getRandomSymbol(), getRandomSymbol(), getRandomSymbol()]);
      }, 80);
      
      const timeout = setTimeout(() => {
        clearInterval(interval);
        setSymbols(finalSymbols);
        setIsLocallySpinning(false);
      }, SPIN_DURATION_MS + delay);
      
      return () => {
        clearInterval(interval);
        clearTimeout(timeout);
      };
    } else {
      setSymbols(finalSymbols);
      setIsLocallySpinning(false);
    }
  }, [isSpinning, finalSymbols, delay]);

  return (
    <>
      {symbols.map((symbol, rowIndex) => {
        const isWin = !isLocallySpinning && !isSpinning && isPositionWinning(reelIndex, rowIndex);
        return (
          <div 
            key={`${reelIndex}-${rowIndex}`}
            className={`slot-tile ${
              isLocallySpinning
                ? 'slot-tile--spinning'
                : isWin
                  ? 'slot-tile--win'
                  : 'opacity-90'
            }`}
          >
            <span 
              className={`slot-symbol ${
                isWin ? 'animate-bounce drop-shadow-[0_0_15px_rgba(255,255,255,0.6)]' : ''
              } ${isLocallySpinning ? 'animate-pulse' : ''}`}
            >
              {SYMBOLS[symbol].icon}
            </span>
          </div>
        );
      })}
    </>
  );
}
