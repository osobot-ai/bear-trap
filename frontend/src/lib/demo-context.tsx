"use client";

import {
  createContext,
  useContext,
  useState,
  useCallback,
  useMemo,
  type ReactNode,
} from "react";
import { useSearchParams } from "next/navigation";
import {
  type DemoState,
  getPuzzleDataForState,
  getSubmitStepForDemoState,
  getIntentPropsForDemoState,
  MOCK_PROOF_DATA,
  MOCK_WALLET,
  MOCK_TICKETS,
  type MockActivePuzzleData,
  type MockProofData,
  type SubmitStep,
} from "./demo-data";

interface DemoConfig {
  puzzleData: MockActivePuzzleData | null;
  submitStep: SubmitStep;
  proofData: MockProofData | null;
  intentProps: {
    proofStatus: "locked" | "proving" | "verified" | "claimed" | "failed";
    prizeStatus: "locked" | "claimed";
  };
  wallet: typeof MOCK_WALLET;
  tickets: typeof MOCK_TICKETS;
}

interface DemoContextValue {
  isDemo: boolean;
  demoState: DemoState;
  setDemoState: (state: DemoState) => void;
  demoConfig: DemoConfig;
}

const DemoContext = createContext<DemoContextValue>({
  isDemo: false,
  demoState: "live",
  setDemoState: () => {},
  demoConfig: {
    puzzleData: null,
    submitStep: "idle",
    proofData: null,
    intentProps: { proofStatus: "locked", prizeStatus: "locked" },
    wallet: MOCK_WALLET,
    tickets: MOCK_TICKETS,
  },
});

export function useDemo() {
  return useContext(DemoContext);
}

export function DemoProvider({ children }: { children: ReactNode }) {
  const searchParams = useSearchParams();
  const isDemo = searchParams.has("demo");
  const [demoState, setDemoStateRaw] = useState<DemoState>("live");

  const setDemoState = useCallback((state: DemoState) => {
    setDemoStateRaw(state);
  }, []);

  const demoConfig = useMemo<DemoConfig>(() => {
    const submitStep = getSubmitStepForDemoState(demoState);
    const needsProofData =
      demoState === "proof-ready" ||
      demoState === "claiming" ||
      demoState === "success";

    return {
      puzzleData: getPuzzleDataForState(demoState),
      submitStep,
      proofData: needsProofData ? MOCK_PROOF_DATA : null,
      intentProps: getIntentPropsForDemoState(demoState),
      wallet: MOCK_WALLET,
      tickets: MOCK_TICKETS,
    };
  }, [demoState]);

  const value = useMemo<DemoContextValue>(
    () => ({ isDemo, demoState, setDemoState, demoConfig }),
    [isDemo, demoState, setDemoState, demoConfig],
  );

  return <DemoContext.Provider value={value}>{children}</DemoContext.Provider>;
}
