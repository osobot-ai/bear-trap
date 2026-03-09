"use client";

interface TrapperMessageProps {
  message: string;
}

export function TrapperMessage({ message }: TrapperMessageProps) {
  return (
    <div className="glass-panel noise-overlay rounded-xl overflow-hidden border border-trap-ember/20">
      {/* Header */}
      <div className="border-b border-trap-border/50 px-6 py-4">
        <div className="flex items-center gap-3">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-trap-rust/10 border border-trap-rust/20">
            <svg
              className="h-4 w-4 text-trap-rust"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M14 9a2 2 0 0 1-2 2H6l-4 4V4c0-1.1.9-2 2-2h8a2 2 0 0 1 2 2z"/>
              <path d="M18 9h2a2 2 0 0 1 2 2v11l-4-4h-6a2 2 0 0 1-2-2v-1"/>
            </svg>
          </div>
          <div>
            <h3 className="font-display text-lg text-trap-ember">The Trapper Speaks</h3>
            <p className="text-xs text-trap-muted">
              Listen carefully...
            </p>
          </div>
        </div>
      </div>

      {/* Message Content */}
      <div className="p-6">
        <div className="relative">
          {/* Quote marks background */}
          <div className="absolute -top-2 -left-2 text-6xl text-trap-rust/20 leading-none font-serif">
            "
          </div>
          <div className="absolute -bottom-6 -right-2 text-6xl text-trap-rust/20 leading-none font-serif rotate-180">
            "
          </div>
          
          {/* Main message */}
          <blockquote className="relative z-10 text-center space-y-4">
            <p className="text-lg sm:text-xl font-display italic text-trap-rust leading-relaxed">
              {message}
            </p>
            
            {/* Attribution */}
            <footer className="flex items-center justify-center gap-2">
              <div className="h-px flex-1 bg-gradient-to-r from-transparent to-trap-ember/30" />
              <cite className="text-sm font-mono text-trap-ember/80 uppercase tracking-wider not-italic">
                The Trapper
              </cite>
              <div className="h-px flex-1 bg-gradient-to-l from-transparent to-trap-ember/30" />
            </footer>
          </blockquote>
        </div>

        {/* Mystical decoration */}
        <div className="mt-6 flex justify-center">
          <div className="flex items-center gap-2">
            <div className="w-2 h-2 rounded-full bg-trap-ember/40 animate-pulse" style={{ animationDelay: '0ms' }} />
            <div className="w-1 h-1 rounded-full bg-trap-ember/60 animate-pulse" style={{ animationDelay: '300ms' }} />
            <div className="w-3 h-3 rounded-full bg-trap-ember/30 animate-pulse" style={{ animationDelay: '600ms' }} />
            <div className="w-1 h-1 rounded-full bg-trap-ember/60 animate-pulse" style={{ animationDelay: '900ms' }} />
            <div className="w-2 h-2 rounded-full bg-trap-ember/40 animate-pulse" style={{ animationDelay: '1200ms' }} />
          </div>
        </div>
      </div>
    </div>
  );
}