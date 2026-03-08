"use client";

interface IntentVisualizerProps {
  proofStatus: 'locked' | 'verified' | 'failed';
  prizeStatus: 'locked' | 'claimed';
}

export function IntentVisualizer({ proofStatus, prizeStatus }: IntentVisualizerProps) {
  const getProofColor = () => {
    switch (proofStatus) {
      case 'verified': return 'text-trap-green';
      case 'failed': return 'text-trap-red';
      default: return 'text-trap-red';
    }
  };

  const getPrizeColor = () => {
    switch (prizeStatus) {
      case 'claimed': return 'text-trap-green';
      default: return 'text-trap-red';
    }
  };

  const getProofBorderColor = () => {
    switch (proofStatus) {
      case 'verified': return 'border-trap-green/30';
      case 'failed': return 'border-trap-red/30';
      default: return 'border-trap-red/30';
    }
  };

  const getPrizeBorderColor = () => {
    switch (prizeStatus) {
      case 'claimed': return 'border-trap-green/30';
      default: return 'border-trap-red/30';
    }
  };

  return (
    <div className="glass-panel noise-overlay rounded-xl overflow-hidden">
      {/* Header */}
      <div className="border-b border-trap-border/50 px-6 py-4">
        <div className="flex items-center gap-3">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-trap-chain/10 border border-trap-chain/20">
            <svg
              className="h-4 w-4 text-trap-chain"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M21 12A9 9 0 1 1 12 3a9 9 0 0 1 9 9z"/>
              <path d="M12 8V12l2 2"/>
            </svg>
          </div>
          <div>
            <h3 className="font-display text-lg text-white">ERC-7710 Intent</h3>
            <p className="text-xs text-trap-muted">
              Proof → Chain → Prize
            </p>
          </div>
        </div>
      </div>

      {/* Visualizer */}
      <div className="p-6">
        <div className="flex items-center justify-center gap-8">
          {/* Proof Lock */}
          <div className="text-center space-y-3">
            <div 
              className={`w-16 h-20 rounded-lg border-2 ${getProofBorderColor()} bg-trap-black/50 flex items-center justify-center ${
                proofStatus === 'failed' ? 'animate-shake' : ''
              }`}
            >
              <svg
                className={`w-8 h-8 ${getProofColor()}`}
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                {proofStatus === 'verified' ? (
                  /* Unlocked */
                  <>
                    <rect x="3" y="11" width="18" height="11" rx="2" ry="2"/>
                    <circle cx="12" cy="16" r="1"/>
                    <path d="M7 11V7a5 5 0 0 1 8.5-3.5"/>
                  </>
                ) : (
                  /* Locked */
                  <>
                    <rect x="3" y="11" width="18" height="11" rx="2" ry="2"/>
                    <circle cx="12" cy="16" r="1"/>
                    <path d="M7 11V7a5 5 0 0 1 10 0v4"/>
                  </>
                )}
              </svg>
            </div>
            <div className="space-y-1">
              <div className="text-xs font-mono text-trap-muted uppercase tracking-wider">
                PROOF
              </div>
              <div className={`text-xs font-mono font-medium ${getProofColor()}`}>
                {proofStatus === 'verified' ? 'VERIFIED' : proofStatus === 'failed' ? 'FAILED' : 'LOCKED'}
              </div>
            </div>
          </div>

          {/* Chain Connection */}
          <div className="flex items-center">
            <div 
              className={`w-16 h-1 border-t-2 border-dashed ${
                prizeStatus === 'claimed' ? 'border-trap-green/50 animate-chain-break' : 'border-trap-chain/50'
              }`}
            />
          </div>

          {/* Prize Lock */}
          <div className="text-center space-y-3">
            <div 
              className={`w-16 h-20 rounded-lg border-2 ${getPrizeBorderColor()} bg-trap-black/50 flex items-center justify-center`}
            >
              <svg
                className={`w-8 h-8 ${getPrizeColor()}`}
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                {prizeStatus === 'claimed' ? (
                  /* Unlocked */
                  <>
                    <rect x="3" y="11" width="18" height="11" rx="2" ry="2"/>
                    <circle cx="12" cy="16" r="1"/>
                    <path d="M7 11V7a5 5 0 0 1 8.5-3.5"/>
                  </>
                ) : (
                  /* Locked */
                  <>
                    <rect x="3" y="11" width="18" height="11" rx="2" ry="2"/>
                    <circle cx="12" cy="16" r="1"/>
                    <path d="M7 11V7a5 5 0 0 1 10 0v4"/>
                  </>
                )}
              </svg>
            </div>
            <div className="space-y-1">
              <div className="text-xs font-mono text-trap-muted uppercase tracking-wider">
                PRIZE
              </div>
              <div className={`text-xs font-mono font-medium ${getPrizeColor()}`}>
                {prizeStatus === 'claimed' ? 'CLAIMED' : 'LOCKED'}
              </div>
            </div>
          </div>
        </div>

        {/* Status Description */}
        <div className="mt-6 p-3 rounded-lg bg-trap-black/30 border border-trap-border/30">
          <p className="text-xs font-mono text-trap-muted text-center">
            {proofStatus === 'locked' && prizeStatus === 'locked' && (
              "Submit a guess to generate a proof and unlock the prize."
            )}
            {proofStatus === 'verified' && prizeStatus === 'locked' && (
              "Proof verified! Prize is now available to claim."
            )}
            {proofStatus === 'failed' && prizeStatus === 'locked' && (
              "Proof verification failed. Try a different guess."
            )}
            {prizeStatus === 'claimed' && (
              "Prize has been claimed. The trap has been sprung!"
            )}
          </p>
        </div>
      </div>
    </div>
  );
}