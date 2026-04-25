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
    <div className="flex flex-col items-center w-full h-full p-8 overflow-y-auto bg-[var(--bg-root)] animate-fade-in">
      <div className="max-w-4xl w-full flex flex-col items-center gap-10 mt-4">
        
        <div className="text-center space-y-3 relative w-full flex justify-center items-center">
          <div className="absolute left-0 top-1/2 -translate-y-1/2">
            {(totalPoints <= 0 || totalPoints < SPIN_COST) && !isSpinning && (
              <button 
                onClick={resetScore}
                className="text-xs uppercase tracking-widest text-sky-400 border border-sky-500/30 bg-sky-950/30 px-4 py-2 rounded-xl hover:bg-sky-900/50 transition-colors"
              >
                Refill Chips
              </button>
            )}
          </div>
          <div>
            <h1 className="text-4xl font-bold text-white tracking-widest uppercase drop-shadow-md">Cosmic Slots</h1>
            <p className="text-sm text-slate-400 font-medium mt-3">Match 3+ consecutive symbols to win. {SPIN_COST} pts per spin.</p>
          </div>
        </div>

        {/* Score & Message Board */}
        <div className="flex flex-col items-center gap-3 bg-[var(--bg-surface)] border border-[var(--border-subtle)] rounded-2xl px-10 py-6 shadow-soft w-full max-w-md">
          <div className="flex justify-between w-full items-center">
            <div className="flex flex-col items-start">
              <span className="text-[10px] text-slate-500 uppercase tracking-widest font-semibold">Balance</span>
              <span className={`text-2xl font-semibold font-mono tracking-tight ${totalPoints < 0 ? 'text-rose-400' : 'text-sky-400'}`}>
                {totalPoints}
              </span>
            </div>
            <div className="flex flex-col items-end">
              <span className="text-[10px] text-slate-500 uppercase tracking-widest font-semibold">Last Win</span>
              <span className={`text-2xl font-semibold font-mono tracking-tight transition-colors duration-300 ${recentWin > 0 ? 'text-emerald-400' : 'text-slate-600'}`}>
                {recentWin > 0 ? `+${recentWin}` : '0'}
              </span>
            </div>
          </div>
          <div className="h-px w-full bg-[var(--border-subtle)] my-1" />
          <div className={`text-lg font-bold tracking-widest uppercase transition-all duration-300 text-center ${
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
        <div className="relative p-8 rounded-[2rem] bg-slate-900 border border-[var(--border-default)] shadow-[0_20px_50px_rgba(0,0,0,0.5),inset_0_2px_15px_rgba(255,255,255,0.05)]">
          <div className="flex gap-4">
            {grid.map((column, reelIndex) => (
              <div 
                key={reelIndex} 
                className="flex flex-col gap-4 relative"
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
          className={`px-16 py-5 rounded-2xl font-bold text-xl tracking-widest uppercase transition-all duration-200 focus:outline-none focus:ring-4 focus:ring-sky-500/50 ${
            isSpinning 
              ? 'bg-slate-800 text-slate-500 cursor-not-allowed shadow-none border border-slate-700' 
              : 'bg-sky-500 text-white hover:bg-sky-400 hover:scale-105 active:scale-95 shadow-[0_0_30px_rgba(56,189,248,0.4)] border border-sky-400'
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
            className={`w-28 h-28 flex items-center justify-center bg-[var(--bg-card)] rounded-2xl border-2 transition-all duration-300 overflow-hidden ${
              isLocallySpinning 
                ? 'border-[var(--border-subtle)] opacity-40 blur-[3px] scale-[0.98]' 
                : isWin 
                  ? 'border-sky-400 shadow-[0_0_20px_rgba(56,189,248,0.5),inset_0_0_30px_rgba(56,189,248,0.3)] bg-sky-950/40 scale-105 z-10' 
                  : 'border-[var(--border-subtle)] opacity-90 shadow-inner'
            }`}
          >
            <span 
              className={`text-6xl transition-all duration-300 ${
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
