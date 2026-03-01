# AGENTS.md — Bear Trap Major Refactor: Rust API Backend + Frontend Separation

## Overview
Restructure Bear Trap into a clean frontend/backend split:
- **Frontend (Vercel):** Next.js static frontend only. No API routes. Calls the Rust backend.
- **Backend (Railway):** Rust axum API server with SQLite. Handles proving, ticket burns, puzzle data.
- **Admin CLI:** Separate Rust binary for puzzle/delegation management via `railway run`.

## Architecture

```
Vercel (Next.js)              Railway (Rust axum)
  │                               │
  │  GET /api/puzzles ───────────>│──> SQLite
  │  GET /api/puzzles/:id ───────>│──> SQLite
  │  POST /api/prove ────────────>│──> useTicket on-chain
  │                               │──> Boundless proof
  │<── { seal, journal, delegation }
  │
  │  redeemDelegations() ────────> DelegationManager (on-chain)
```

## Repo Structure (Target)

```
bear-trap/
├── contracts/                    # Unchanged — Solidity (Foundry)
│   ├── src/
│   │   ├── BearTrap.sol          # Ownable, buyTickets, useTicket, markSolved, createPuzzle
│   │   ├── IBearTrap.sol
│   │   ├── ZKPEnforcer.sol
│   │   └── ImageID.sol
│   ├── test/BearTrap.t.sol
│   └── scripts/Deploy.s.sol
├── guests/                       # Unchanged — RISC0 guest program
│   └── puzzle-solver/src/main.rs
├── backend/                      # NEW — Rust workspace for API + admin + shared
│   ├── Cargo.toml                # Workspace root
│   ├── api/                      # axum HTTP server
│   │   ├── Cargo.toml
│   │   └── src/main.rs
│   ├── admin/                    # CLI tool for puzzle/delegation management
│   │   ├── Cargo.toml
│   │   └── src/main.rs
│   ├── prover/                   # Boundless proof logic (library)
│   │   ├── Cargo.toml
│   │   └── src/lib.rs
│   └── shared/                   # DB schema, models, queries (library)
│       ├── Cargo.toml
│       └── src/
│           ├── lib.rs
│           └── db.rs
├── frontend/                     # Next.js — frontend ONLY, no API routes
│   ├── src/
│   │   ├── app/
│   │   │   ├── page.tsx
│   │   │   ├── layout.tsx
│   │   │   └── providers.tsx     # NO api/ directory anymore
│   │   ├── components/
│   │   │   ├── BuyTickets.tsx
│   │   │   ├── SubmitGuess.tsx   # Calls BACKEND_URL/api/prove
│   │   │   ├── PuzzleList.tsx    # Calls BACKEND_URL/api/puzzles
│   │   │   ├── PuzzleCard.tsx
│   │   │   ├── Leaderboard.tsx
│   │   │   └── WalletButton.tsx
│   │   └── lib/
│   │       ├── abi/
│   │       │   ├── bearTrap.ts
│   │       │   └── delegationManager.ts  # For redeemDelegations
│   │       ├── contracts.ts
│   │       └── wagmi.ts
│   └── package.json
├── Dockerfile                    # Builds api + admin binaries for Railway
├── README.md
└── SPEC.md
```

## Backend Implementation Details

### shared/ (library crate)
**Cargo.toml deps:** `rusqlite` (with `bundled` feature), `serde`, `serde_json`

**src/db.rs:**
```rust
// Database initialization and queries

pub struct Db { conn: rusqlite::Connection }

impl Db {
    pub fn open(path: &str) -> Result<Self>;
    pub fn init(&self) -> Result<()>;  // CREATE TABLE IF NOT EXISTS
    
    // Puzzles
    pub fn create_puzzle(&self, solution_hash: &str, clue_uri: &str) -> Result<i64>;
    pub fn get_puzzle(&self, id: i64) -> Result<Option<Puzzle>>;
    pub fn list_puzzles(&self) -> Result<Vec<Puzzle>>;
    pub fn mark_solved(&self, id: i64, winner: &str) -> Result<()>;
    
    // Delegations
    pub fn add_delegation(&self, puzzle_id: i64, delegation_json: &str, prize_eth: &str) -> Result<i64>;
    pub fn update_delegation(&self, puzzle_id: i64, delegation_json: &str, prize_eth: &str) -> Result<()>;
    pub fn get_active_delegation(&self, puzzle_id: i64) -> Result<Option<Delegation>>;
}

pub struct Puzzle {
    pub id: i64,
    pub solution_hash: String,
    pub clue_uri: String,
    pub solved: bool,
    pub winner: Option<String>,
    pub prize_eth: Option<String>,      // from active delegation
    pub created_at: String,
}

pub struct Delegation {
    pub id: i64,
    pub puzzle_id: i64,
    pub delegation_json: String,
    pub prize_eth: String,
    pub active: bool,
    pub created_at: String,
}
```

**SQL Schema:**
```sql
CREATE TABLE IF NOT EXISTS puzzles (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    solution_hash TEXT NOT NULL,
    clue_uri TEXT NOT NULL DEFAULT '',
    solved INTEGER NOT NULL DEFAULT 0,
    winner TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS delegations (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    puzzle_id INTEGER NOT NULL REFERENCES puzzles(id),
    delegation_json TEXT NOT NULL,
    prize_eth TEXT NOT NULL,
    active INTEGER NOT NULL DEFAULT 1,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
```

### api/ (binary crate — axum server)
**Cargo.toml deps:** `axum`, `tokio`, `tower-http` (cors), `serde`, `serde_json`, shared (path dep), prover (path dep)

**Endpoints:**

1. `GET /api/puzzles` — Returns JSON array of puzzles with prize info from active delegation
   ```json
   [{ "id": 0, "clueURI": "ipfs://...", "prizeEth": "1.0", "solved": false, "winner": null }]
   ```

2. `GET /api/puzzles/:id` — Returns single puzzle with delegation prize
   ```json
   { "id": 0, "clueURI": "ipfs://...", "prizeEth": "1.0", "solved": false, "winner": null }
   ```

3. `POST /api/prove` — Main proving endpoint
   - Request: `{ "passphrase": "...", "solverAddress": "0x...", "puzzleId": 0 }`
   - Flow:
     1. Read puzzle from DB, check not solved
     2. Read active delegation from DB
     3. Call `useTicket(solverAddress, puzzleId)` on BearTrap contract via operator wallet
     4. Wait for tx confirmation
     5. Call prover with (guess, solverAddress, solutionHash)
     6. If proof fails → return `{ "error": "Wrong guess. Your ticket has been consumed.", "ticketBurned": true }`
     7. If proof succeeds → return `{ "seal": "0x...", "journal": "0x...", "delegation": {...}, "solverAddress": "0x...", "solutionHash": "0x..." }`
   - The `delegation` field contains the full signed delegation JSON so the frontend can construct the redeemDelegations call

**Environment variables (set in Railway):**
- `DATABASE_PATH` — path to SQLite file (default: `./data/puzzles.db`)
- `RPC_URL` — Base RPC endpoint
- `OPERATOR_PRIVATE_KEY` — wallet for useTicket calls
- `BOUNDLESS_PRIVATE_KEY` — wallet for Boundless market proof requests  
- `PINATA_JWT` — for uploading guest ELF to IPFS
- `BEAR_TRAP_ADDRESS` — deployed BearTrap contract
- `PORT` — server port (default: 3001)

**CORS:** Allow requests from the Vercel frontend domain (configurable via `FRONTEND_URL` env var, default `*` for dev).

**Important:** For the prover integration, since the Boundless SDK is Rust-native, we can call it directly as a library — no need to shell out to a binary anymore. The prover/ crate wraps the Boundless client logic.

### prover/ (library crate)
**Cargo.toml deps:** `boundless-market`, `alloy`, `risc0-zkvm`, `sha2`, `tokio`

**src/lib.rs:**
```rust
pub struct ProverConfig {
    pub rpc_url: String,
    pub private_key: String,
    pub pinata_jwt: Option<String>,
}

pub struct ProofResult {
    pub seal: Vec<u8>,
    pub journal: Vec<u8>,
    pub solver_address: String,
    pub solution_hash: String,
}

pub async fn generate_proof(
    config: &ProverConfig,
    guess: &str,
    solver_address: &str,
    expected_hash: &str,
) -> Result<ProofResult>;
```

This is essentially the logic from the old `apps/src/main.rs` but as a library function.
Import the guest ELF via the risc0-build generated code.

### admin/ (binary crate — CLI)
**Cargo.toml deps:** `clap`, shared (path dep), `sha2`, `hex`

**Commands:**
```
bear-trap-admin init
    Initialize the database (create tables)

bear-trap-admin create-puzzle --answer "secret passphrase" --clue-uri "ipfs://..."
    Creates puzzle, auto-computes SHA-256 of answer, inserts into DB
    Prints: "Created puzzle #0 (hash: 0xabc...)"

bear-trap-admin add-delegation --puzzle-id 0 --delegation '{"chain":8453,...}' --prize "1.0"
    Stores signed delegation for a puzzle
    Deactivates any existing active delegation for that puzzle

bear-trap-admin update-delegation --puzzle-id 0 --delegation '{"chain":8453,...}' --prize "2.0"
    Replaces the active delegation (deactivates old, inserts new)

bear-trap-admin list-puzzles
    Lists all puzzles with their active delegation prize

bear-trap-admin mark-solved --puzzle-id 0 --winner "0xabc..."
    Marks puzzle as solved in DB
```

**Environment:** Uses `DATABASE_PATH` env var (same as api/).
Usage via Railway: `railway run bear-trap-admin create-puzzle --answer "..." --clue-uri "..."`

## Frontend Changes

### Remove
- Delete `frontend/src/app/api/` directory entirely (no more API routes)
- Remove `better-sqlite3` and `@types/better-sqlite3` from package.json
- Remove `tsx` from package.json if it was added
- Remove any server-side env vars from `.env.local.example` (OPERATOR_PRIVATE_KEY, PINATA_JWT, etc.)

### Update
- `SubmitGuess.tsx`: Change fetch URL from `/api/prove` to `${NEXT_PUBLIC_BACKEND_URL}/api/prove`
  - The response now includes `delegation` field — use it for constructing redeemDelegations
- `PuzzleList.tsx`: Fetch puzzles from `${NEXT_PUBLIC_BACKEND_URL}/api/puzzles` instead of reading on-chain
  - This gives us prize info from the backend (which knows the delegation amount)
- `PuzzleCard.tsx`: Can now display prize amount again (comes from backend API, not contract)
- `contracts.ts`: Add `NEXT_PUBLIC_BACKEND_URL` constant
- `.env.local.example`: Simplify to just:
  ```
  NEXT_PUBLIC_BEAR_TRAP_ADDRESS=0x...
  NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID=...
  NEXT_PUBLIC_DELEGATION_MANAGER_ADDRESS=0xdb9B1e94B5b69Df7e401DDbedE43491141047dB3
  NEXT_PUBLIC_BACKEND_URL=http://localhost:3001
  ```

### Keep
- All contract ABIs
- BuyTickets component (still calls contract directly from user's wallet)
- Leaderboard (reads events from chain)
- WalletButton

## Old Code Cleanup
- Delete `apps/` directory (old Rust CLI prover — absorbed into backend/prover/)
- Delete `frontend/scripts/manage-puzzle.ts` (replaced by backend/admin/)
- Delete the old root `Cargo.toml` workspace that referenced `apps/` and `guests/`
- Update root `Cargo.toml` to point to `backend/` workspace (or make backend/ self-contained)
- Actually: keep `guests/` at root level since it's the RISC0 guest program. The backend/prover/ will reference it.

## Dockerfile

```dockerfile
FROM rust:1.75-slim AS builder
WORKDIR /app
COPY backend/ ./backend/
COPY guests/ ./guests/
RUN cd backend && cargo build --release --bin bear-trap-api --bin bear-trap-admin
# Note: guests/ needs to be available for risc0-build to compile the guest ELF

FROM debian:bookworm-slim
RUN apt-get update && apt-get install -y ca-certificates && rm -rf /var/lib/apt/lists/*
COPY --from=builder /app/backend/target/release/bear-trap-api /usr/local/bin/
COPY --from=builder /app/backend/target/release/bear-trap-admin /usr/local/bin/
RUN mkdir -p /data
ENV DATABASE_PATH=/data/puzzles.db
EXPOSE 3001
CMD ["bear-trap-api"]
```

## README Updates
- Completely rewrite architecture section for the new split
- Document Railway deployment
- Document admin CLI usage via `railway run`
- Update env vars for both frontend (Vercel) and backend (Railway)
- Remove any references to Next.js API routes
- Remove old "How to Play" step about CLI prover

## Build Verification
1. `cd contracts && forge build` — must pass
2. `cd contracts && forge test` — must pass
3. `cd backend && cargo build` — must compile api, admin, prover, shared
4. `cd frontend && npm run build` — must pass (after removing api/ route and server deps)

## Important Notes
- You are on branch `feat/option-b-refactor`
- The prover/ crate integration with Boundless SDK may have complex deps. If the Boundless SDK crate isn't easily installable (it may need git dep from boundless repo), create the prover crate structure with TODO comments for the Boundless integration and focus on getting the rest compiling.
- For the axum server, the prove endpoint can initially return a mock response while we get Boundless SDK integrated later. The important thing is the architecture is correct.
- The on-chain useTicket call in the API should use alloy/ethers to send the transaction.
- Make sure CORS is configured properly in the axum server.
- SQLite file should be in a `data/` directory that Railway's persistent volume maps to.
- Commit everything to the branch when done.
