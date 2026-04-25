export type SymbolType = 'diamond' | 'crown' | 'frog' | 'moon' | 'sun' | 'eggplant' | 'banana' | 'peach' | 'star';

export const SYMBOLS: Record<SymbolType, { icon: string, weight: number }> = {
  diamond: { icon: '💎', weight: 3 },
  crown: { icon: '👑', weight: 3 },
  frog: { icon: '🐸', weight: 10 },
  moon: { icon: '🌙', weight: 9 },
  sun: { icon: '☀️', weight: 9 },
  star: { icon: '⭐', weight: 14 },
  eggplant: { icon: '🍆', weight: 18 },
  banana: { icon: '🍌', weight: 18 },
  peach: { icon: '🍑', weight: 18 },
};

const SYMBOL_KEYS = Object.keys(SYMBOLS) as SymbolType[];
const TOTAL_WEIGHT = SYMBOL_KEYS.reduce((sum, key) => sum + SYMBOLS[key].weight, 0);

export function getRandomSymbol(): SymbolType {
  let rand = Math.random() * TOTAL_WEIGHT;
  for (const key of SYMBOL_KEYS) {
    if (rand < SYMBOLS[key].weight) return key;
    rand -= SYMBOLS[key].weight;
  }
  return SYMBOL_KEYS[0];
}

export function generateGrid(): SymbolType[][] {
  const grid: SymbolType[][] = [];
  for (let reel = 0; reel < 5; reel++) {
    const column: SymbolType[] = [];
    for (let row = 0; row < 3; row++) {
      column.push(getRandomSymbol());
    }
    grid.push(column);
  }
  return grid;
}

export const PAYLINES = [
  { id: 'top', path: [0, 0, 0, 0, 0] },
  { id: 'middle', path: [1, 1, 1, 1, 1] },
  { id: 'bottom', path: [2, 2, 2, 2, 2] },
  { id: 'v-shape', path: [0, 1, 2, 1, 0] },
  { id: 'inverted-v', path: [2, 1, 0, 1, 2] },
  { id: 'zigzag-down', path: [0, 0, 1, 2, 2] },
  { id: 'zigzag-up', path: [2, 2, 1, 0, 0] },
  { id: 'wave-down', path: [1, 0, 1, 2, 1] },
  { id: 'wave-up', path: [1, 2, 1, 0, 1] },
];

export const SPIN_COST = 50;

export const PAYOUTS = {
  small: 80,
  medium: 180,
  big: 450,
  jackpot: 1500,
};

export interface WinResult {
  paylineId: string;
  symbol: SymbolType;
  count: number;
  payout: number;
  positions: { reel: number, row: number }[];
}

export function evaluateGrid(grid: SymbolType[][]): WinResult[] {
  const wins: WinResult[] = [];
  
  for (const payline of PAYLINES) {
    const { path, id } = payline;
    const lineSymbols = path.map((row, reel) => ({ symbol: grid[reel][row], reel, row }));
    
    let bestMatch: { symbol: SymbolType, count: number, positions: { reel: number, row: number }[] } | null = null;
    
    // Check all possible sliding windows of length >= 3
    for (let i = 0; i < lineSymbols.length; i++) {
      for (let j = i + 2; j < lineSymbols.length; j++) {
        const window = lineSymbols.slice(i, j + 1);
        const allMatch = window.every(s => s.symbol === window[0].symbol);
        
        if (allMatch) {
          if (!bestMatch || window.length > bestMatch.count) {
            bestMatch = {
              symbol: window[0].symbol,
              count: window.length,
              positions: window.map(w => ({ reel: w.reel, row: w.row }))
            };
          }
        }
      }
    }

    if (bestMatch && bestMatch.count >= 3) {
      const isJackpotTier = (bestMatch.symbol === 'diamond' || bestMatch.symbol === 'crown') && bestMatch.count === 5;
      const payout = isJackpotTier ? PAYOUTS.jackpot :
                     bestMatch.count === 5 ? PAYOUTS.big :
                     bestMatch.count === 4 ? PAYOUTS.medium :
                     PAYOUTS.small;
                     
      wins.push({
        paylineId: id,
        symbol: bestMatch.symbol,
        count: bestMatch.count,
        payout,
        positions: bestMatch.positions,
      });
    }
  }
  
  return wins;
}
