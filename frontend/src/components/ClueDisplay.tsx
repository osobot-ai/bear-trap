"use client";

import { useState } from "react";

interface ClueDisplayProps {
  clueURI: string;
}

export function ClueDisplay({ clueURI }: ClueDisplayProps) {
  const [isLoading, setIsLoading] = useState(true);
  const [hasError, setHasError] = useState(false);

  return (
    <div className="glass-panel noise-overlay rounded-xl overflow-hidden">
      {/* Header */}
      <div className="border-b border-trap-border/50 px-6 py-4">
        <div className="flex items-center gap-3">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-trap-ember/10 border border-trap-ember/20">
            <svg
              className="h-4 w-4 text-trap-ember"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <rect x="3" y="3" width="18" height="18" rx="2" ry="2"/>
              <circle cx="9" cy="9" r="2"/>
              <path d="m21 15-3.086-3.086a2 2 0 0 0-2.828 0L6 21"/>
            </svg>
          </div>
          <div>
            <h3 className="font-display text-lg text-white">The Clue</h3>
            <p className="text-xs text-trap-muted">
              Study the image carefully...
            </p>
          </div>
        </div>
      </div>

      {/* Image Container */}
      <div className="p-6">
        <div className="relative">
          <div 
            className="relative w-full overflow-hidden rounded-lg border-2 border-trap-dark/80 animate-border-glow"
            style={{ aspectRatio: "4/3" }}
          >
            {/* Loading Skeleton */}
            {isLoading && (
              <div className="absolute inset-0 bg-trap-black/90 flex items-center justify-center">
                <div className="space-y-3 w-full p-8">
                  <div className="h-4 bg-trap-border/30 rounded animate-pulse w-3/4 mx-auto" />
                  <div className="h-4 bg-trap-border/30 rounded animate-pulse w-1/2 mx-auto" />
                  <div className="h-8 bg-trap-border/30 rounded animate-pulse w-2/3 mx-auto" />
                </div>
              </div>
            )}

            {/* Error State */}
            {hasError && (
              <div className="absolute inset-0 bg-trap-black/90 flex flex-col items-center justify-center text-center p-8">
                <div className="text-trap-red text-4xl mb-4">⚠</div>
                <p className="font-mono text-sm text-trap-red">Failed to load clue</p>
                <p className="font-mono text-xs text-trap-muted mt-2">
                  The image could not be retrieved
                </p>
              </div>
            )}

            {/* Actual Image */}
            <img
              src={clueURI}
              alt="Puzzle clue"
              className="w-full h-full object-contain bg-trap-black/50"
              onLoad={() => setIsLoading(false)}
              onError={() => {
                setIsLoading(false);
                setHasError(true);
              }}
              style={{ 
                filter: hasError ? 'grayscale(100%)' : 'none',
                opacity: isLoading ? 0 : 1,
                transition: 'opacity 0.3s ease-in-out'
              }}
            />
          </div>

          {/* Overlay hint */}
          {!isLoading && !hasError && (
            <div className="absolute bottom-4 left-4 right-4">
              <div className="bg-trap-black/80 border border-trap-ember/30 rounded-lg px-3 py-2 backdrop-blur-sm">
                <p className="text-xs font-mono text-trap-ember italic text-center">
                  "Every detail matters. Trust nothing at first glance." — The Trapper
                </p>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}