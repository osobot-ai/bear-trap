# AGENTS.md — Bear Trap Refactor: Option A (Server-side Proof Generation)

## Goal
Refactor Bear Trap so users never touch a CLI or paste hex. The flow becomes:
1. User enters passphrase in frontend
2. Frontend calls Next.js API route `/api/prove`
3. API route calls a Rust binary that submits proof request to Boundless, polls for fulfillment, returns seal + journal
4. Frontend receives proof data, auto-constructs the delegation redemption tx
5. User signs one wallet transaction → done

## What to change

### 1. Refactor `apps/src/main.rs` → Pure proof service CLI
- REMOVE all on-chain submission code (the IBearTrap interface, provider building, etc.)
- KEEP: input packaging (PuzzleInput ABI encoding), Boundless client setup, proof request submission, fulfillment polling
- Always output JSON to stdout: `{"seal": "0x...", "journal": "0x...", "solverAddress": "0x...", "solutionHash": "0x..."}`
- Env vars: `RPC_URL`, `PRIVATE_KEY` (for Boundless market tx), `PINATA_JWT` (for ELF upload)
- Args: `--guess <string> --solver-address <address> --puzzle-id <number>`
- Exit cleanly with JSON on stdout, errors on stderr

### 2. Create `frontend/src/app/api/prove/route.ts` — Next.js API route
- POST endpoint accepting `{ passphrase: string, solverAddress: string, puzzleId: number }`
- Shells out to compiled Rust binary: `./bear-trap-app --guess "..." --solver-address "..." --puzzle-id N`
- Binary path via env var `PROVER_BINARY_PATH`
- Returns JSON: `{ seal, journal, solverAddress, solutionHash }` or `{ error: string }`
- Add timeout handling (proof generation can take minutes)
- Server-side env vars: `RPC_URL`, `PRIVATE_KEY`, `PINATA_JWT`, `PROVER_BINARY_PATH`

### 3. Rewrite `frontend/src/components/SubmitGuess.tsx` — Single-flow UX
- REMOVE all "paste hex" UI (seal textarea, journal textarea, delegation textarea, CLI instructions)
- New flow:
  1. `idle` — Puzzle selector + passphrase input + "Solve Puzzle" button
  2. `proving` — "Generating ZK proof..." spinner (calls /api/prove, may take 1-3 min)
  3. `submitting` — Auto-constructs delegation redemption tx, prompts wallet
  4. `confirming` — Waiting for tx confirmation
  5. `success` — Result (solved or wrong guess)
  6. `error` — Error with retry
- Info callout: "Enter the secret passphrase. A zero-knowledge proof will be generated to verify your answer without revealing it on-chain."
- Keep: puzzle selector, ticket balance check, Basescan link on success

### 4. Update env examples
Frontend `.env.local`:
```
PROVER_BINARY_PATH=/path/to/bear-trap-app
RPC_URL=https://mainnet.base.org
PRIVATE_KEY=<key for Boundless market txs>
PINATA_JWT=<pinata jwt>
```

## Important context

### Boundless SDK (Rust-only)
- Crate: `boundless-market`
- Submits proof requests ON-CHAIN to BoundlessMarket on Base (`0xfd152dadc5183870710fe54f939eae3ab9f0fe82`)
- Provers pick up requests, prove, fulfill
- SDK polls for fulfillment, returns `seal` + `journal`
- Guest ELF uploaded to IPFS (Pinata) for prover access

### RiscZeroVerifierRouter on Base
`0x0b144e07a0826182b6b59788c34b32bfa86fb711`

### How proof verification works
- BearTrap.submitGuess() → delegationManager.redeemDelegations()
- Delegation chain includes ZKPEnforcer caveat
- ZKPEnforcer.beforeAllHook() → verifier.verify(seal, imageId, sha256(journal))
- Valid proof → delegation executes → ETH prize to solver

### What NOT to change
- `contracts/` — All Solidity as-is
- `guests/` — RISC0 guest program as-is
- Delegation redemption logic in SubmitGuess (permissionContexts, modes, executionCallDatas) — keep, just auto-fire after proof returns

## Build verification
- `cd frontend && npm run build` must pass
- `cargo build --bin bear-trap-app` must compile
- No TypeScript errors
