/**
 * Mock data for demo mode.
 * Each demo state maps to realistic data shapes that the components expect.
 */

export const DEMO_STATES = [
  "countdown",
  "live",
  "proving",
  "wrong",
  "proof-ready",
  "claiming",
  "success",
  "completed",
  "loading",
  "error",
] as const;

export type DemoState = (typeof DEMO_STATES)[number];

export const DEMO_STATE_LABELS: Record<DemoState, { emoji: string; label: string }> = {
  countdown: { emoji: "⏳", label: "Countdown" },
  live: { emoji: "🟢", label: "Live" },
  proving: { emoji: "⚙️", label: "Proving" },
  wrong: { emoji: "🪤", label: "Wrong Guess" },
  "proof-ready": { emoji: "✅", label: "Proof Ready" },
  claiming: { emoji: "⛓️", label: "Claiming" },
  success: { emoji: "🎉", label: "Success!" },
  completed: { emoji: "👑", label: "Completed" },
  loading: { emoji: "💀", label: "Loading" },
  error: { emoji: "🔴", label: "Error" },
};

/** Shape matching ActivePuzzleData in ActivePuzzle.tsx */
export interface MockActivePuzzleData {
  id: number;
  clueURI: string;
  prizeEth: string | null;
  solved: boolean;
  winner: string | null;
  startsAt: string | null;
  status: "countdown" | "live" | "completed";
  delegation: Record<string, unknown> | null;
}

/** Shape matching ProveResult in SubmitGuess.tsx */
export interface MockProofData {
  seal: string;
  journal: string;
  solverAddress: string;
  solutionHash: string;
  delegation: {
    delegate: string;
    delegator: string;
    authority: string;
    caveats: { enforcer: string; terms: string; args: string }[];
    salt: string;
    signature: string;
  } | null;
  prizeEth: string | null;
}

const MOCK_ADDRESS = "0x742d35Cc6634C0532925a3b844Bc9e7595f2bD18";
const MOCK_DELEGATOR = "0x1234567890abcdef1234567890abcdef12345678";

function futureDate(hoursFromNow: number): string {
  const d = new Date();
  d.setHours(d.getHours() + hoursFromNow);
  return d.toISOString();
}

// ── Puzzle data per demo state ─────────────────────────────────────

export const MOCK_PUZZLE_DATA: Record<string, MockActivePuzzleData> = {
  countdown: {
    id: 4,
    clueURI: "",
    prizeEth: "0.5",
    solved: false,
    winner: null,
    startsAt: futureDate(5),
    status: "countdown",
    delegation: null,
  },
  live: {
    id: 3,
    clueURI: "ipfs://QmDemo123456789abcdef/clue.png",
    prizeEth: "0.25",
    solved: false,
    winner: null,
    startsAt: null,
    status: "live",
    delegation: {
      delegate: MOCK_ADDRESS,
      delegator: MOCK_DELEGATOR,
    },
  },
  completed: {
    id: 3,
    clueURI: "ipfs://QmDemo123456789abcdef/clue.png",
    prizeEth: "0.25",
    solved: true,
    winner: "0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045",
    startsAt: null,
    status: "completed",
    delegation: null,
  },
};

// For states that render the "live" puzzle layout (proving, wrong, proof-ready, claiming, success)
export function getPuzzleDataForState(state: DemoState): MockActivePuzzleData | null {
  if (state === "loading" || state === "error") return null;
  if (state === "countdown") return MOCK_PUZZLE_DATA.countdown;
  if (state === "completed") return MOCK_PUZZLE_DATA.completed;
  // All solve-flow states use the live puzzle
  return MOCK_PUZZLE_DATA.live;
}

// ── Proof data for proof-ready / claiming / success ────────────────

export const MOCK_PROOF_DATA: MockProofData = {
  seal: "0x" + "aa".repeat(32),
  journal: "0x" + "bb".repeat(64),
  solverAddress: MOCK_ADDRESS,
  solutionHash: "0x" + "cc".repeat(32),
  delegation: {
    delegate: MOCK_ADDRESS,
    delegator: MOCK_DELEGATOR,
    authority: "0x" + "00".repeat(32),
    caveats: [
      {
        enforcer: "0x" + "dd".repeat(20),
        terms: "0x",
        args: "0x",
      },
    ],
    salt: "0x1",
    signature: "0x" + "ee".repeat(65),
  },
  prizeEth: "0.25",
};

// ── Wallet mock data ──────────────────────────────────────────────

export const MOCK_WALLET = {
  address: MOCK_ADDRESS as `0x${string}`,
  isConnected: true,
  balance: "0.42",
};

export const MOCK_TICKETS = {
  balance: 5,
  osoBalance: "50000",
};

// ── Submit step mapping from DemoState ────────────────────────────

export type SubmitStep =
  | "idle"
  | "proving"
  | "proof-ready"
  | "confirming"
  | "success"
  | "wrong"
  | "error";

export function getSubmitStepForDemoState(state: DemoState): SubmitStep {
  switch (state) {
    case "proving":
      return "proving";
    case "wrong":
      return "wrong";
    case "proof-ready":
      return "proof-ready";
    case "claiming":
      return "confirming";
    case "success":
      return "success";
    default:
      return "idle";
  }
}

// ── IntentVisualizer prop mapping ─────────────────────────────────

export function getIntentPropsForDemoState(state: DemoState): {
  proofStatus: "locked" | "proving" | "verified" | "claimed" | "failed";
  prizeStatus: "locked" | "claimed";
} {
  switch (state) {
    case "proving":
      return { proofStatus: "proving", prizeStatus: "locked" };
    case "wrong":
      return { proofStatus: "failed", prizeStatus: "locked" };
    case "proof-ready":
      return { proofStatus: "verified", prizeStatus: "locked" };
    case "claiming":
      return { proofStatus: "verified", prizeStatus: "locked" };
    case "success":
      return { proofStatus: "claimed", prizeStatus: "claimed" };
    default:
      return { proofStatus: "locked", prizeStatus: "locked" };
  }
}
