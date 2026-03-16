"use client";

import {
  createContext,
  useContext,
  useState,
  useCallback,
  useMemo,
  type ReactNode,
} from "react";

/**
 * Shared solve-flow state so IntentVisualizer can react to real gameplay,
 * not just demo mode. SubmitGuess writes; ActivePuzzle reads.
 */

type SolveStep =
  | "idle"
  | "proving"
  | "proof-ready"
  | "confirming"
  | "success"
  | "wrong"
  | "error";

interface PuzzleFlowContextValue {
  solveStep: SolveStep;
  setSolveStep: (step: SolveStep) => void;
}

const PuzzleFlowContext = createContext<PuzzleFlowContextValue>({
  solveStep: "idle",
  setSolveStep: () => {},
});

export function usePuzzleFlow() {
  return useContext(PuzzleFlowContext);
}

export function PuzzleFlowProvider({ children }: { children: ReactNode }) {
  const [solveStep, setSolveStepRaw] = useState<SolveStep>("idle");

  const setSolveStep = useCallback((step: SolveStep) => {
    setSolveStepRaw(step);
  }, []);

  const value = useMemo(
    () => ({ solveStep, setSolveStep }),
    [solveStep, setSolveStep],
  );

  return (
    <PuzzleFlowContext.Provider value={value}>
      {children}
    </PuzzleFlowContext.Provider>
  );
}

/**
 * Maps SolveStep → IntentVisualizer props.
 * Kept here so both ActivePuzzle and tests can reuse the mapping.
 */
export function getIntentPropsFromSolveStep(step: SolveStep): {
  proofStatus: "locked" | "proving" | "verified" | "claimed" | "failed";
  prizeStatus: "locked" | "claimed";
} {
  switch (step) {
    case "proving":
      return { proofStatus: "proving", prizeStatus: "locked" };
    case "wrong":
    case "error":
      return { proofStatus: "failed", prizeStatus: "locked" };
    case "proof-ready":
      return { proofStatus: "verified", prizeStatus: "locked" };
    case "confirming":
      return { proofStatus: "verified", prizeStatus: "locked" };
    case "success":
      return { proofStatus: "claimed", prizeStatus: "claimed" };
    default:
      return { proofStatus: "locked", prizeStatus: "locked" };
  }
}

export type { SolveStep };
