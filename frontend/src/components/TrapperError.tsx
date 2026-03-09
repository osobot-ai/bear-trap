"use client";

import { BearTrapSVG } from "./BearTrapSVG";
import { TrapperMessage } from "./TrapperMessage";

interface TrapperErrorProps {
  type: "network" | "transaction" | "proof" | "generic";
  message?: string;
  onRetry?: () => void;
}

const ERROR_MESSAGES: Record<TrapperErrorProps["type"], string> = {
  network: "The connection is unstable. The trap waits...",
  transaction: "The chain rejected your attempt. Try again.",
  proof: "The prover has gone silent. The trap grows restless...",
  generic: "Something went wrong in the wilderness...",
};

export function TrapperError({ type, message, onRetry }: TrapperErrorProps) {
  const displayMessage = message || ERROR_MESSAGES[type];

  return (
    <div className="glass-panel noise-overlay rounded-xl overflow-hidden border border-trap-rust/30 animate-ember-glow">
      <div className="p-6 sm:p-8 space-y-6">
        <div className="flex flex-col items-center text-center space-y-4">
          <div className="opacity-40">
            <BearTrapSVG state="closed" size={48} />
          </div>

          <TrapperMessage message={displayMessage} />
        </div>

        {onRetry && (
          <button
            onClick={onRetry}
            className="w-full rounded-lg bg-trap-rust/10 border border-trap-rust/30 px-4 py-3 min-h-12 font-mono text-sm font-medium text-trap-rust hover:bg-trap-rust/20 hover:border-trap-rust/50 transition-all"
          >
            Try Again
          </button>
        )}
      </div>
    </div>
  );
}
