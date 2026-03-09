"use client";

interface SkeletonBaseProps {
  className?: string;
}

const shimmerStyle =
  "bg-gradient-to-r from-trap-border/20 via-trap-border/40 to-trap-border/20 bg-[length:200%_100%] animate-shimmer";

export function SkeletonBox({
  className = "",
  width,
  height,
}: SkeletonBaseProps & { width?: string; height?: string }) {
  return (
    <div
      className={`rounded-lg ${shimmerStyle} ${className}`}
      style={{ width, height }}
    />
  );
}

export function SkeletonText({
  className = "",
  width = "100%",
  lines = 1,
}: SkeletonBaseProps & { width?: string; lines?: number }) {
  if (lines === 1) {
    return (
      <div
        className={`h-4 rounded ${shimmerStyle} ${className}`}
        style={{ width }}
      />
    );
  }

  return (
    <div className="space-y-2">
      {Array.from({ length: lines }, (_, i) => (
        <div
          key={i}
          className={`h-4 rounded ${shimmerStyle} ${className}`}
          style={{
            width: i === lines - 1 ? "75%" : width,
          }}
        />
      ))}
    </div>
  );
}

export function SkeletonCircle({
  className = "",
  size = 40,
}: SkeletonBaseProps & { size?: number }) {
  return (
    <div
      className={`rounded-full ${shimmerStyle} ${className}`}
      style={{ width: size, height: size }}
    />
  );
}

export function ActivePuzzleSkeleton() {
  return (
    <div className="space-y-12">
      {/* Hero Header skeleton */}
      <div className="text-center space-y-4">
        <div className="space-y-3">
          <SkeletonBox className="h-10 sm:h-12 mx-auto max-w-xs" />
          <SkeletonBox className="h-8 sm:h-10 mx-auto max-w-sm" />
        </div>
        <SkeletonText className="mx-auto max-w-lg" />
      </div>

      {/* Main Content Grid skeleton */}
      <div className="grid gap-8 lg:grid-cols-3">
        {/* Left Column: Clue + Intent */}
        <div className="lg:col-span-2 space-y-8">
          {/* Clue Display skeleton */}
          <div className="glass-panel noise-overlay rounded-xl overflow-hidden">
            <div className="border-b border-trap-border/50 px-6 py-4">
              <div className="flex items-center gap-3">
                <SkeletonBox className="h-8 w-8 rounded-lg" />
                <div className="space-y-1.5">
                  <SkeletonText width="80px" />
                  <SkeletonText width="140px" className="h-3" />
                </div>
              </div>
            </div>
            <div className="p-6">
              <div
                className={`w-full rounded-lg ${shimmerStyle}`}
                style={{ aspectRatio: "4/3" }}
              />
            </div>
          </div>

          {/* Intent Visualizer skeleton */}
          <div className="glass-panel noise-overlay rounded-xl overflow-hidden">
            <div className="border-b border-trap-border/50 px-6 py-4">
              <div className="flex items-center gap-3">
                <SkeletonBox className="h-8 w-8 rounded-lg" />
                <div className="space-y-1.5">
                  <SkeletonText width="120px" />
                  <SkeletonText width="100px" className="h-3" />
                </div>
              </div>
            </div>
            <div className="p-6">
              <div className="flex items-center justify-center gap-8">
                <div className="text-center space-y-3">
                  <SkeletonBox className="w-16 h-20 rounded-lg" />
                  <SkeletonText width="48px" className="mx-auto h-3" />
                </div>
                <SkeletonBox className="w-16 h-1 rounded-full" />
                <div className="text-center space-y-3">
                  <SkeletonBox className="w-16 h-20 rounded-lg" />
                  <SkeletonText width="48px" className="mx-auto h-3" />
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Right Column: Prize + Actions */}
        <div className="space-y-8">
          {/* Prize Display skeleton */}
          <div className="glass-panel noise-overlay rounded-xl overflow-hidden">
            <div className="border-b border-trap-border/50 px-6 py-4">
              <div className="flex items-center gap-3">
                <SkeletonBox className="h-8 w-8 rounded-lg" />
                <div className="space-y-1.5">
                  <SkeletonText width="80px" />
                  <SkeletonText width="100px" className="h-3" />
                </div>
              </div>
            </div>
            <div className="p-6 text-center space-y-4">
              <SkeletonBox className="h-14 sm:h-16 mx-auto max-w-[200px]" />
              <SkeletonText width="100px" className="mx-auto" />
            </div>
          </div>

          {/* Buy Tickets skeleton */}
          <div className="glass-panel noise-overlay rounded-xl overflow-hidden">
            <div className="border-b border-trap-border/50 px-6 py-4">
              <div className="flex items-center gap-3">
                <SkeletonBox className="h-8 w-8 rounded-lg" />
                <div className="space-y-1.5">
                  <SkeletonText width="90px" />
                  <SkeletonText width="130px" className="h-3" />
                </div>
              </div>
            </div>
            <div className="p-6 space-y-5">
              <div className="grid grid-cols-2 gap-3">
                <SkeletonBox className="h-16 rounded-lg" />
                <SkeletonBox className="h-16 rounded-lg" />
              </div>
              <SkeletonBox className="h-12 rounded-lg" />
              <SkeletonBox className="h-12 rounded-lg" />
            </div>
          </div>

          {/* Submit Guess skeleton */}
          <div className="glass-panel noise-overlay rounded-xl overflow-hidden">
            <div className="border-b border-trap-border/50 px-6 py-4">
              <div className="flex items-center gap-3">
                <SkeletonBox className="h-8 w-8 rounded-lg" />
                <div className="space-y-1.5">
                  <SkeletonText width="100px" />
                  <SkeletonText width="140px" className="h-3" />
                </div>
              </div>
            </div>
            <div className="p-6 space-y-5">
              <SkeletonBox className="h-12 rounded-lg" />
              <SkeletonBox className="h-12 rounded-lg" />
              <SkeletonBox className="h-12 rounded-lg" />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
