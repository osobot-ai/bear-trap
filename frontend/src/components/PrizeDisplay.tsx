"use client";

interface PrizeDisplayProps {
  prizeEth: string | null;
}

export function PrizeDisplay({ prizeEth }: PrizeDisplayProps) {
  const formatPrizeAmount = (amount: string | null): string => {
    if (!amount) return "0";
    
    // Parse the ETH amount and format it nicely
    const num = parseFloat(amount);
    if (num === 0) return "0";
    
    // For small amounts, show more decimals
    if (num < 0.001) {
      return num.toFixed(6);
    } else if (num < 1) {
      return num.toFixed(4);
    } else {
      return num.toFixed(3);
    }
  };

  const formattedAmount = formatPrizeAmount(prizeEth);

  return (
    <div className="glass-panel noise-overlay rounded-xl overflow-hidden">
      {/* Header */}
      <div className="border-b border-trap-border/50 px-6 py-4">
        <div className="flex items-center gap-3">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-trap-gold/10 border border-trap-gold/20">
            <svg
              className="h-4 w-4 text-trap-gold"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M6 9H4.5a2.5 2.5 0 0 1 0-5H6"/>
              <path d="M18 9h1.5a2.5 2.5 0 0 0 0-5H18"/>
              <path d="M4 22h16"/>
              <path d="M10 14.66V17c0 .55.47.98.97 1.21C12.15 18.75 14 20 16 20s3.85-1.25 5.03-1.79c.5-.23.97-.66.97-1.21v-2.34"/>
              <path d="M14 14.66V17c0 .55-.47.98-.97 1.21C11.85 18.75 10 20 8 20s-3.85-1.25-5.03-1.79C2.47 17.98 2 17.55 2 17v-2.34"/>
              <circle cx="12" cy="9" r="5"/>
            </svg>
          </div>
          <div>
            <h3 className="font-display text-lg text-white">Prize Pool</h3>
            <p className="text-xs text-trap-muted">
              Winner takes all
            </p>
          </div>
        </div>
      </div>

      {/* Prize Amount Display */}
      <div className="p-6">
        <div className="text-center space-y-4">
          {/* Main Prize Display */}
          <div className="relative">
            <div className="font-display text-5xl sm:text-6xl lg:text-7xl text-trap-gold animate-glow-gold font-bold">
              {formattedAmount}
            </div>
            
            {/* Subtle shimmer effect overlay */}
            <div className="absolute inset-0 opacity-30">
              <div className="font-display text-5xl sm:text-6xl lg:text-7xl text-transparent bg-clip-text bg-gradient-to-r from-transparent via-trap-gold/50 to-transparent animate-pulse">
                {formattedAmount}
              </div>
            </div>
          </div>
          
          {/* ETH Label */}
          <div className="space-y-2">
            <div className="text-xl font-display text-trap-gold/80 uppercase tracking-wider">
              ETH TRAPPED
            </div>
            
            {/* Additional visual effect - particle dots */}
            <div className="flex justify-center items-center gap-2">
              <div className="w-1 h-1 rounded-full bg-trap-gold animate-pulse" style={{ animationDelay: '0ms' }} />
              <div className="w-1 h-1 rounded-full bg-trap-gold animate-pulse" style={{ animationDelay: '200ms' }} />
              <div className="w-1 h-1 rounded-full bg-trap-gold animate-pulse" style={{ animationDelay: '400ms' }} />
              <div className="w-1 h-1 rounded-full bg-trap-gold animate-pulse" style={{ animationDelay: '600ms' }} />
              <div className="w-1 h-1 rounded-full bg-trap-gold animate-pulse" style={{ animationDelay: '800ms' }} />
            </div>
          </div>

          {/* Prize description */}
          <div className="mt-6 p-4 rounded-lg bg-trap-black/30 border border-trap-gold/20">
            <p className="text-sm font-mono text-trap-gold/60 italic">
              "First to solve claims everything. The trap rewards only the clever."
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}