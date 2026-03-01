
import { type Address } from "viem";

interface PuzzleCardProps {
  puzzleId: number;
  clueURI: string;
  solved: boolean;
  winner: Address;
}

const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000";

function truncateAddress(address: string): string {
  if (address === ZERO_ADDRESS) return "None";
  return `${address.slice(0, 6)}...${address.slice(-4)}`;
}

export function PuzzleCard({
  puzzleId,
  clueURI,
  solved,
  winner,
}: PuzzleCardProps) {
  return (
    <div
      className={`
        glass-panel noise-overlay rounded-xl p-6
        transition-all duration-500 hover:translate-y-[-2px]
        ${
          solved
            ? "border-trap-green/30 glow-green"
            : "border-trap-red/20 glow-red hover:border-trap-red/40"
        }
      `}
      style={{
        animationDelay: `${puzzleId * 0.1}s`,
      }}
    >
      {/* Header */}
      <div className="flex items-start justify-between mb-4">
        <div className="flex items-center gap-3">
          <div
            className={`
              flex h-10 w-10 items-center justify-center rounded-lg font-mono text-sm font-bold
              ${
                solved
                  ? "bg-trap-green/10 text-trap-green border border-trap-green/20"
                  : "bg-trap-red/10 text-trap-red border border-trap-red/20"
              }
            `}
          >
            #{puzzleId}
          </div>
          <div>
            <p className="text-xs font-mono text-trap-muted uppercase tracking-wider">
              Puzzle
            </p>
            <p className="text-sm font-medium text-trap-text">
              {solved ? "Solved" : "Unsolved"}
            </p>
          </div>
        </div>

        <div
          className={`
            rounded-full px-3 py-1 text-xs font-mono font-medium
            ${
              solved
                ? "bg-trap-green/10 text-trap-green border border-trap-green/20"
                : "bg-trap-red/10 text-trap-red border border-trap-red/20 animate-pulse-slow"
            }
          `}
        >
          {solved ? "CLAIMED" : "LIVE"}
        </div>
      </div>

      {/* Details */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <span className="text-xs font-mono text-trap-muted">Clue</span>
          {clueURI ? (
            <a
              href={clueURI}
              target="_blank"
              rel="noopener noreferrer"
              className="text-xs font-mono text-trap-green hover:text-trap-green-dim transition-colors underline decoration-trap-green/30 underline-offset-2"
            >
              View Clue
            </a>
          ) : (
            <span className="text-xs font-mono text-trap-muted italic">
              No clue URI
            </span>
          )}
        </div>

        {solved && winner !== ZERO_ADDRESS && (
          <div className="flex items-center justify-between pt-2 border-t border-trap-border/30">
            <span className="text-xs font-mono text-trap-green">Winner</span>
            <span className="text-xs font-mono text-trap-green font-medium">
              {truncateAddress(winner)}
            </span>
          </div>
        )}
      </div>
    </div>
  );
}
