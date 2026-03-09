"use client";

import { motion, AnimatePresence } from "framer-motion";
import { useMemo } from "react";

interface IntentVisualizerProps {
  proofStatus: 'locked' | 'proving' | 'verified' | 'claimed' | 'failed';
  prizeStatus: 'locked' | 'claimed';
}

export function IntentVisualizer({ proofStatus, prizeStatus }: IntentVisualizerProps) {
  // Generate stable random particle positions for shatter effect
  const particles = useMemo(
    () =>
      Array.from({ length: 8 }, () => ({
        x: (Math.random() - 0.5) * 80,
        y: (Math.random() - 0.5) * 40,
      })),
    []
  );

  const getProofColor = () => {
    switch (proofStatus) {
      case 'proving': return 'text-trap-amber';
      case 'verified':
      case 'claimed': return 'text-trap-green';
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
      case 'proving': return 'border-trap-amber/30';
      case 'verified':
      case 'claimed': return 'border-trap-green/30';
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

  const isProofUnlocked = proofStatus === 'verified' || proofStatus === 'claimed';

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
        <AnimatePresence mode="wait">
          <motion.div
            key={`${proofStatus}-${prizeStatus}`}
            initial={{ opacity: 0.8 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0.8 }}
            transition={{ duration: 0.3 }}
            className="flex items-center justify-center gap-8"
          >
            {/* Proof Lock */}
            <div className="text-center space-y-3">
              <motion.div
                className={`w-16 h-20 rounded-lg border-2 ${getProofBorderColor()} bg-trap-black/50 flex items-center justify-center ${
                  proofStatus === 'failed' ? 'animate-shake' : ''
                } ${proofStatus === 'proving' ? 'animate-pulse' : ''}`}
                layout
              >
                {proofStatus === 'proving' ? (
                  /* Spinning gear for proving state */
                  <motion.svg
                    animate={{ rotate: 360 }}
                    transition={{ duration: 2, repeat: Infinity, ease: "linear" }}
                    className="w-6 h-6 text-trap-amber"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                  >
                    <circle cx="12" cy="12" r="3"/>
                    <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"/>
                  </motion.svg>
                ) : (
                  /* Lock icon with animated shackle */
                  <svg
                    className={`w-8 h-8 ${getProofColor()}`}
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  >
                    <rect x="3" y="11" width="18" height="11" rx="2" ry="2"/>
                    <circle cx="12" cy="16" r="1"/>
                    <motion.path
                      d={isProofUnlocked
                        ? "M7 11V7a5 5 0 0 1 8.5-3.5"
                        : "M7 11V7a5 5 0 0 1 10 0v4"
                      }
                      initial={false}
                      animate={{ d: isProofUnlocked
                        ? "M7 11V7a5 5 0 0 1 8.5-3.5"
                        : "M7 11V7a5 5 0 0 1 10 0v4"
                      }}
                      transition={{ duration: 0.5, ease: "easeInOut" }}
                    />
                  </svg>
                )}
              </motion.div>
              <div className="space-y-1">
                <div className="text-xs font-mono text-trap-muted uppercase tracking-wider">
                  PROOF
                </div>
                <div className={`text-xs font-mono font-medium ${getProofColor()}`}>
                  {proofStatus === 'verified' || proofStatus === 'claimed'
                    ? 'VERIFIED'
                    : proofStatus === 'proving'
                    ? 'PROVING'
                    : proofStatus === 'failed'
                    ? 'FAILED'
                    : 'LOCKED'}
                </div>
              </div>
            </div>

            {/* Chain Connection */}
            <div className="flex items-center">
              <AnimatePresence mode="wait">
                {/* Claimed: particle shatter */}
                {prizeStatus === 'claimed' ? (
                  <div className="relative w-16 h-4" key="chain-shatter">
                    {particles.map((p, i) => (
                      <motion.div
                        key={i}
                        className="absolute w-1.5 h-1.5 rounded-full bg-trap-chain"
                        style={{ left: '50%', top: '50%' }}
                        initial={{ x: 0, y: 0, opacity: 1 }}
                        animate={{
                          x: p.x,
                          y: p.y,
                          opacity: 0,
                          scale: 0,
                        }}
                        transition={{ duration: 0.8, delay: i * 0.05, ease: "easeOut" }}
                      />
                    ))}
                  </div>
                ) : proofStatus === 'proving' ? (
                  /* Proving: amber glow traveling along the chain */
                  <motion.div
                    key="chain-proving"
                    className="w-16 h-1 rounded-full overflow-hidden relative"
                    style={{ background: 'rgba(42,42,42,0.5)' }}
                  >
                    <motion.div
                      className="absolute inset-y-0 w-4 rounded-full"
                      style={{ background: 'linear-gradient(90deg, transparent, #f59e0b, transparent)' }}
                      animate={{ x: [-16, 64] }}
                      transition={{ duration: 1.5, repeat: Infinity, ease: "linear" }}
                    />
                  </motion.div>
                ) : proofStatus === 'verified' ? (
                  /* Verified: left half green, right half grey */
                  <div key="chain-verified" className="flex w-16 h-1 rounded-full overflow-hidden">
                    <motion.div
                      className="w-1/2 h-full bg-trap-green/60"
                      initial={{ scaleX: 0 }}
                      animate={{ scaleX: 1 }}
                      transition={{ duration: 0.4, ease: "easeOut" }}
                      style={{ transformOrigin: 'left' }}
                    />
                    <div className="w-1/2 h-full bg-trap-chain/30" />
                  </div>
                ) : proofStatus === 'failed' ? (
                  /* Failed: chain flashes red */
                  <motion.div
                    key="chain-failed"
                    className="w-16 h-1 rounded-full"
                    animate={{
                      backgroundColor: ['rgba(169,169,169,0.3)', 'rgba(239,68,68,0.6)', 'rgba(169,169,169,0.3)'],
                    }}
                    transition={{ duration: 0.6, repeat: 3, ease: "easeInOut" }}
                  />
                ) : (
                  /* Locked: subtle pulse on chain dashes */
                  <motion.div
                    key="chain-locked"
                    className="w-16 h-0 border-t-2 border-dashed border-trap-chain/50"
                    animate={{ opacity: [0.4, 0.8, 0.4] }}
                    transition={{ duration: 2.5, repeat: Infinity, ease: "easeInOut" }}
                  />
                )}
              </AnimatePresence>
            </div>

            {/* Prize Lock */}
            <div className="text-center space-y-3">
              <motion.div
                className={`w-16 h-20 rounded-lg border-2 ${getPrizeBorderColor()} bg-trap-black/50 flex items-center justify-center`}
                layout
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
                  <rect x="3" y="11" width="18" height="11" rx="2" ry="2"/>
                  <circle cx="12" cy="16" r="1"/>
                  <motion.path
                    d={prizeStatus === 'claimed'
                      ? "M7 11V7a5 5 0 0 1 8.5-3.5"
                      : "M7 11V7a5 5 0 0 1 10 0v4"
                    }
                    initial={false}
                    animate={{ d: prizeStatus === 'claimed'
                      ? "M7 11V7a5 5 0 0 1 8.5-3.5"
                      : "M7 11V7a5 5 0 0 1 10 0v4"
                    }}
                    transition={{ duration: 0.5, ease: "easeInOut" }}
                  />
                </svg>
              </motion.div>
              <div className="space-y-1">
                <div className="text-xs font-mono text-trap-muted uppercase tracking-wider">
                  PRIZE
                </div>
                <div className={`text-xs font-mono font-medium ${getPrizeColor()}`}>
                  {prizeStatus === 'claimed' ? 'CLAIMED' : 'LOCKED'}
                </div>
              </div>
            </div>
          </motion.div>
        </AnimatePresence>

        {/* Status Description */}
        <div className="mt-6 p-3 rounded-lg bg-trap-black/30 border border-trap-border/30">
          <p className="text-xs font-mono text-trap-muted text-center">
            {proofStatus === 'locked' && prizeStatus === 'locked' && (
              "Submit a guess to generate a proof and unlock the prize."
            )}
            {proofStatus === 'proving' && prizeStatus === 'locked' && (
              "Generating zero-knowledge proof..."
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
