"use client";

import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useDemo } from "@/lib/demo-context";
import { DEMO_STATES, DEMO_STATE_LABELS, type DemoState } from "@/lib/demo-data";

export function DemoControlPanel() {
  const { isDemo, demoState, setDemoState } = useDemo();
  const [collapsed, setCollapsed] = useState(false);

  if (!isDemo) return null;

  const current = DEMO_STATE_LABELS[demoState];

  return (
    <div className="fixed bottom-4 right-4 z-[9999]">
      <AnimatePresence mode="wait">
        {collapsed ? (
          <motion.button
            key="collapsed"
            initial={{ opacity: 0, scale: 0.8 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.8 }}
            onClick={() => setCollapsed(false)}
            className="flex items-center gap-2 rounded-xl border border-trap-green/30 bg-trap-black/90 backdrop-blur-xl px-4 py-3 font-mono text-sm text-trap-green shadow-2xl shadow-trap-green/10 hover:border-trap-green/50 transition-colors"
          >
            <span>{current.emoji}</span>
            <span className="font-medium">{current.label}</span>
            <svg
              className="h-3.5 w-3.5 text-trap-muted"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
            >
              <polyline points="18 15 12 9 6 15" />
            </svg>
          </motion.button>
        ) : (
          <motion.div
            key="expanded"
            initial={{ opacity: 0, y: 20, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 20, scale: 0.95 }}
            transition={{ duration: 0.2 }}
            className="w-72 rounded-2xl border border-trap-green/20 bg-trap-black/95 backdrop-blur-xl shadow-2xl shadow-trap-green/10 overflow-hidden"
          >
            <div className="flex items-center justify-between border-b border-trap-border/30 px-4 py-3">
              <div className="flex items-center gap-2">
                <div className="h-2 w-2 rounded-full bg-trap-green animate-pulse-slow" />
                <span className="font-mono text-xs font-medium text-trap-green uppercase tracking-wider">
                  Demo Mode
                </span>
              </div>
              <button
                onClick={() => setCollapsed(true)}
                className="flex h-6 w-6 items-center justify-center rounded-md text-trap-muted hover:text-trap-text hover:bg-trap-dark transition-colors"
              >
                <svg
                  className="h-3.5 w-3.5"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                >
                  <polyline points="6 9 12 15 18 9" />
                </svg>
              </button>
            </div>

            <div className="border-b border-trap-border/20 px-4 py-2.5">
              <p className="font-mono text-[10px] text-trap-muted uppercase tracking-wider">
                Current State
              </p>
              <p className="font-display text-lg text-white mt-0.5">
                {current.emoji} {current.label}
              </p>
            </div>

            <div className="p-2 grid grid-cols-2 gap-1.5 max-h-[320px] overflow-y-auto">
              {DEMO_STATES.map((state: DemoState) => {
                const meta = DEMO_STATE_LABELS[state];
                const isActive = state === demoState;
                return (
                  <button
                    key={state}
                    onClick={() => setDemoState(state)}
                    className={`flex items-center gap-2 rounded-lg px-3 py-2 text-left font-mono text-xs transition-all ${
                      isActive
                        ? "bg-trap-green/15 border border-trap-green/40 text-trap-green"
                        : "border border-transparent text-trap-muted hover:text-trap-text hover:bg-trap-dark/80"
                    }`}
                  >
                    <span className="text-sm">{meta.emoji}</span>
                    <span className="truncate">{meta.label}</span>
                  </button>
                );
              })}
            </div>

            <div className="border-t border-trap-border/20 px-4 py-2">
              <p className="font-mono text-[10px] text-trap-muted/60 text-center">
                ?demo parameter active
              </p>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
