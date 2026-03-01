# AGENTS.md — Bear Trap v2 Refactor: Full Architecture Overhaul

## Overview
Major refactor: remove solutionHash from on-chain, move answer verification to backend + ZKP, split ticket buying/burning, remove submitGuess entirely. Users claim prizes via redeemDelegations directly.

## Architecture

### Flow
1. User calls `buyTickets(amount)` on BearTrap contract (burns $OSO, increments tickets[user])
2. User enters passphrase in frontend, clicks "Solve Puzzle"
3. Frontend calls `/api/prove` with `{ passphrase, solverAddress, puzzleId }`
4. Backend calls `useTicket(user, puzzleId)` on-chain via operator wallet (decrements ticket)
5. Backend reads the CORRECT answer hash from server-side config (NOT from chain)
6. Backend passes `(guess, solverAddress, expectedHash)` as private input to RISC0 guest via Boundless
7. If wrong answer → guest assertion fails → proof generation fails → return error "Wrong guess" → ticket already burned
8. If right answer → proof generated → return `{ seal, journal }` to frontend
9. Frontend calls `redeemDelegations()` on DelegationManager directly with the proof
10. ZKPEnforcer verifies proof → delegation executes → ETH prize to solver

### Key Design Decisions
- solutionHash is NEVER stored on-chain (prevents free offline checking)
- Tickets tracked on-chain (transparent, verifiable)
- Backend is the only entity that can burn tickets (operator role)
- submitGuess() is REMOVED — users call redeemDelegations directly
- The ZKP proves the user knew the answer without revealing it

## Contract Changes (`contracts/src/BearTrap.sol`)

### Remove
- `submitGuess()` function entirely
- `solutionHash` from the `Puzzle` struct (keep puzzleId, clueURI, prize amount, solved, winner)
- All delegation-related imports and references (IDelegationManager, etc.)
- The try/catch pattern

### Add
- `address public operator;` — backend wallet that can call useTicket
- `function setOperator(address _operator) external onlyOwner;`
- `function useTicket(address user, uint256 puzzleId) external;` — only callable by operator
  - Requires `tickets[user] > 0`
  - Requires puzzle exists and is not solved
  - Decrements `tickets[user]`
  - Emits `TicketUsed(uint256 indexed puzzleId, address indexed user, uint256 remainingTickets)`
- `function markSolved(uint256 puzzleId, address winner) external;` — only callable by operator
  - Marks puzzle as solved with winner address
  - Emits `PuzzleSolved(uint256 indexed puzzleId, address indexed winner)`
  - This is called by backend after confirming the redeemDelegations tx succeeded

### Keep
- `buyTickets(uint256 amount)` — burns $OSO to dead address, increments tickets
- `createPuzzle(...)` — owner creates puzzles (remove solutionHash param, keep clueURI and prize)
- `tickets` mapping
- `puzzles` mapping (updated struct)
- `Puzzle` struct: `{ uint256 prizeAmount, string clueURI, bool solved, address winner }`
- `puzzleCount`
- All events (adjust as needed)

### Remove from interface (`IBearTrap.sol`)
- `submitGuess` function signature
- Any delegation-related types
- Update Puzzle struct
- Update events

## Contract Changes (`contracts/src/ZKPEnforcer.sol`)

### Update terms encoding
- Old: `abi.encode(bytes32 solutionHash, bytes32 imageId)`
- New: `abi.encode(bytes32 imageId)` — just the image ID, no solution hash
- Remove the `SolutionHashMismatch` error and the hash comparison check
- The enforcer now ONLY verifies:
  1. The RISC0 proof is valid: `verifier.verify(seal, imageId, sha256(journal))`
  2. The solver address matches the redeemer
- The correctness of the answer was already guaranteed by the guest program assertion during proof generation

### Updated beforeHook logic
```solidity
function beforeHook(...) public override {
    bytes32 imageId = abi.decode(_terms, (bytes32));
    (bytes memory seal, bytes memory journal) = abi.decode(_args, (bytes, bytes));
    
    // Verify RISC0 proof
    verifier.verify(seal, imageId, sha256(journal));
    
    // Decode journal and verify solver
    (address solverAddress, bytes32 solutionHash) = abi.decode(journal, (address, bytes32));
    if (solverAddress != _redeemer) revert SolverAddressMismatch();
    
    emit ProofVerified(_redeemer, solutionHash, imageId);
}
```

## Guest Program Changes (`guests/puzzle-solver/src/main.rs`)
- NO CHANGES NEEDED — the guest already:
  1. Takes `(guess, solverAddress, expectedHash)` as private input
  2. Hashes guess with SHA-256
  3. Asserts hash matches expectedHash
  4. Commits `(solverAddress, solutionHash)` to journal
- The only difference is that `expectedHash` now comes from the backend, not from on-chain

## Rust App Changes (`apps/src/main.rs`)
- Remove the `--puzzle-id` arg (not needed for proof generation)
- Keep: `--guess`, `--solver-address`
- Add: `--expected-hash` (the backend passes the correct answer hash)
- The app receives the correct hash from the backend, NOT from chain
- Output: JSON `{ "seal": "0x...", "journal": "0x...", "solverAddress": "0x...", "solutionHash": "0x..." }`
- On proof failure (wrong answer), exit with non-zero code and error on stderr

## Frontend API Route (`frontend/src/app/api/prove/route.ts`)

### Flow
1. Receive POST `{ passphrase, solverAddress, puzzleId }`
2. Verify puzzle exists and isn't solved (read from contract)
3. Call `useTicket(solverAddress, puzzleId)` on BearTrap via operator wallet
4. Wait for useTicket tx to confirm
5. Read the correct answer hash from server-side config: `PUZZLE_ANSWERS` env var or a JSON file
   - Format: `{ "0": "0xabcdef...", "1": "0x123456..." }` mapping puzzleId to answer hash
6. Call the Rust binary: `bear-trap-app --guess "..." --solver-address "..." --expected-hash "0x..."`
7. If binary succeeds → return `{ seal, journal, solverAddress, solutionHash }`
8. If binary fails → return `{ error: "Wrong guess. Your ticket has been consumed." }`

### Env vars needed
- `PROVER_BINARY_PATH` — path to compiled bear-trap-app
- `OPERATOR_PRIVATE_KEY` — wallet key for calling useTicket (funded with ETH for gas)
- `RPC_URL` — Base RPC
- `PINATA_JWT` — for Boundless proof uploads
- `BOUNDLESS_PRIVATE_KEY` — wallet key for submitting proof requests to Boundless market
- `PUZZLE_ANSWERS` — JSON string mapping puzzleId to answer hash, e.g. `{"0":"0xabc..."}`
- `BEAR_TRAP_ADDRESS` — contract address
- `NEXT_PUBLIC_BEAR_TRAP_ADDRESS` — same, for frontend
- `NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID`
- `NEXT_PUBLIC_DELEGATION_MANAGER_ADDRESS` — DelegationManager on Base

### Important: The API route needs to use viem for calling useTicket
```typescript
import { createWalletClient, http, createPublicClient } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import { base } from 'viem/chains';
```

## Frontend Changes (`frontend/src/components/SubmitGuess.tsx`)

### Rewrite the flow
1. `idle` — Puzzle selector + passphrase input + "Solve Puzzle" button
   - Show ticket balance
   - Show info: "Enter the secret passphrase. A ZK proof will verify your answer. Each attempt costs one ticket."
2. `proving` — "Burning ticket & generating proof..." with spinner
   - Calls `/api/prove` (which handles ticket burn + proof generation)
   - May take 1-3 minutes
   - Show "Your ticket has been consumed. Generating zero-knowledge proof..."
3. `proof-ready` — "Proof generated! Submit to claim your prize."
   - Auto-constructs the `redeemDelegations` call
   - User signs the wallet tx
4. `confirming` — Waiting for tx confirmation
5. `success` — "Puzzle Solved! Prize claimed."
6. `wrong` — "Wrong guess. Your ticket was consumed." with option to try again
7. `error` — Generic error with retry

### Key change: redeemDelegations instead of submitGuess
The frontend now calls `redeemDelegations` on the DelegationManager contract directly.
You'll need the DelegationManager ABI for `redeemDelegations(bytes[] permissionContexts, ModeCode[] modes, bytes[] executionCallDatas)`.

Import the DelegationManager address from contracts.ts:
```typescript
export const DELEGATION_MANAGER_ADDRESS = process.env.NEXT_PUBLIC_DELEGATION_MANAGER_ADDRESS as `0x${string}` || "0xdb9B1e94B5b69Df7e401DDbedE43491141047dB3";
```

The permissionContexts, modes, and executionCallDatas construction stays similar to what was there before — the proof data (seal + journal) goes into the caveat args.

### Remove
- All references to submitGuess contract call
- Import of bearTrapAbi for submitGuess (keep for ticket reading)

## Frontend Changes (`frontend/src/lib/contracts.ts`)
- Add `DELEGATION_MANAGER_ADDRESS`
- Keep `BEAR_TRAP_ADDRESS` and `BASE_CHAIN_ID`

## Frontend Changes (`frontend/src/lib/abi/`)
- Add `delegationManager.ts` with the `redeemDelegations` ABI
- Keep `bearTrap.ts` but update to match new contract (remove submitGuess, add useTicket events)

## Test Changes (`contracts/test/BearTrap.t.sol`)
- Update tests to match new contract:
  - Remove submitGuess tests
  - Add useTicket tests (operator only, ticket decrement, event emission)
  - Add setOperator tests
  - Add markSolved tests
  - Keep buyTickets tests
  - Test that non-operator can't call useTicket
  - Test that useTicket fails with 0 tickets
  - Test that useTicket fails on solved puzzle

## Update .env.local.example
```
# Frontend (public)
NEXT_PUBLIC_BEAR_TRAP_ADDRESS=0x...
NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID=...
NEXT_PUBLIC_DELEGATION_MANAGER_ADDRESS=0xdb9B1e94B5b69Df7e401DDbedE43491141047dB3

# Backend (server-side only)
PROVER_BINARY_PATH=/path/to/bear-trap-app
OPERATOR_PRIVATE_KEY=0x...
RPC_URL=https://mainnet.base.org
BOUNDLESS_PRIVATE_KEY=0x...
PINATA_JWT=...
PUZZLE_ANSWERS={"0":"0xabcdef..."}
```

## Build Verification
After ALL changes:
1. `cd contracts && forge build` must pass
2. `cd contracts && forge test` must pass (update tests!)
3. `cd frontend && npm run build` must pass
4. No TypeScript errors

## File Summary
```
contracts/src/BearTrap.sol      — Major: remove submitGuess, add operator/useTicket/markSolved
contracts/src/IBearTrap.sol     — Update interface
contracts/src/ZKPEnforcer.sol   — Simplify: terms = imageId only, remove hash check
contracts/test/BearTrap.t.sol   — Rewrite tests for new API
apps/src/main.rs                — Add --expected-hash, remove --puzzle-id
frontend/src/app/api/prove/route.ts    — Major: add useTicket call, puzzle answers config
frontend/src/components/SubmitGuess.tsx — Major: new flow, redeemDelegations
frontend/src/lib/contracts.ts          — Add DELEGATION_MANAGER_ADDRESS
frontend/src/lib/abi/delegationManager.ts — NEW: redeemDelegations ABI
frontend/src/lib/abi/bearTrap.ts       — Update for new contract
frontend/.env.local.example            — Update
```
