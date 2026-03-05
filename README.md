# Bear Trap

An ERC-7710 delegation puzzle game on Base. Players burn $OSO tokens to buy guess tickets, then submit their answer to a backend prover. The backend burns a ticket on-chain, generates a ZK proof via RISC0/Boundless, and returns it. If the answer is correct, the player calls `redeemDelegations` to claim the ETH prize. If wrong, the proof fails and the ticket is already consumed.

**The first real-money ERC-7710 puzzle game.**

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

- **Frontend (Vercel):** Next.js static frontend only. No API routes. Calls the Rust backend.
- **Backend (Railway):** Rust axum API server with SQLite. Handles proving, ticket burns, puzzle data.
- **Admin CLI:** Separate Rust binary for puzzle/delegation management via `railway run`.

### How It Works

1. **Buy Tickets**: Players burn $OSO tokens (sent to `0xdead`) to purchase guess tickets on the BearTrap contract
2. **Submit Guess**: Player enters their passphrase in the frontend and clicks "Solve Puzzle"
3. **Ticket Burn**: The backend operator wallet calls `useTicket()` on-chain, consuming one ticket before proof generation begins
4. **Proof Generation**: The backend passes the guess + the correct answer hash (stored server-side in SQLite, never on-chain) to the RISC0 guest program via Boundless. If the guess is wrong, the guest assertion fails and no proof is generated — but the ticket is already burned
5. **Claim Prize**: If the proof succeeds, the frontend receives the seal + journal + delegation and calls `redeemDelegations()` on the DelegationManager. The ZKPEnforcer verifies the proof on-chain and the ETH prize transfers to the winner


### Delegation Structure

Each puzzle uses an **open delegation** (anyone can redeem) with three caveat enforcers:

```
Delegation {
  delegate:  0x0000000000000000000000000000000000000a11  (ANY_DELEGATE)
  delegator: <puzzle creator's wallet>
  authority: 0xfff...fff  (ROOT_AUTHORITY)
  caveats: [
    ZKPEnforcer           — verifies ZK proof + operator attestation
    NativeTokenTransfer   — limits ETH transfer to prize amount
    ExactCalldata         — ensures empty calldata (ETH-only)
  ]
}
```

The delegator funds their wallet with the prize ETH. When a player solves the puzzle, they call `redeemDelegations()` which:
1. ZKPEnforcer checks: valid proof, correct solver, correct puzzle, trusted operator signature
2. NativeTokenTransferAmountEnforcer checks: transfer ≤ prize amount
3. ExactCalldataEnforcer checks: calldata is empty (pure ETH transfer)

### Key Design: Private Answer + On-Chain Ticket Burn

The answer hash is never stored on-chain — it lives only in a SQLite database on the backend. This prevents users from checking their guess offline without paying. Tickets are burned on-chain before proof generation, ensuring every attempt has an economic cost regardless of outcome.

```
Wrong guess: ticket burned → proof fails → no prize
Right guess: ticket burned → proof generated → redeemDelegations → ETH prize
```

## Tech Stack

| Component | Technology |
|-----------|-----------|
| Smart Contracts | Solidity 0.8.23, Foundry |
| ZK Circuit | Rust, RISC0 zkVM |
| Proof Market | Boundless Network (Base) |
| On-chain Verifier | Boundless verifier contract (IRiscZeroVerifier) |
| Delegation Framework | MetaMask Delegation Framework (ERC-7710) |
| Token | $OSO on Base (`0xc78fabc2cb5b9cf59e0af3da8e3bc46d47753a4e`) |
| Frontend | Next.js 14, viem, wagmi, Web3Auth Modal (Vercel) |
| Backend | Rust, axum, SQLite (Railway) |
| Admin CLI | Rust, clap (via `railway run`) |

## Project Structure

```
bear-trap/
├── contracts/                # Solidity contracts (Foundry)
│   ├── src/
│   │   ├── BearTrap.sol           # Ticket sales, owner-controlled burn, puzzle lifecycle
│   │   ├── IBearTrap.sol          # Interface + events + errors
│   │   ├── ZKPEnforcer.sol        # Custom ERC-7710 caveat enforcer
│   │   └── ImageID.sol            # Auto-generated RISC0 image ID
│   ├── test/BearTrap.t.sol
│   └── scripts/Deploy.s.sol
├── guests/                   # RISC0 guest programs (Rust)
│   └── puzzle-solver/
│       └── src/main.rs            # ZK circuit: hash + assert + commit
├── backend/                  # Rust workspace — API + admin + shared
│   ├── Cargo.toml                 # Workspace root
│   ├── api/                       # axum HTTP server
│   │   └── src/main.rs
│   ├── admin/                     # CLI tool for puzzle/delegation management
│   │   └── src/main.rs
│   ├── prover/                    # Boundless proof logic (library)
│   │   └── src/lib.rs
│   └── shared/                    # DB schema, models, queries (library)
│       └── src/
│           ├── lib.rs
│           └── db.rs
├── frontend/                 # Next.js frontend (Vercel) — NO API routes
│   ├── src/
│   │   ├── app/
│   │   │   ├── page.tsx
│   │   │   ├── layout.tsx
│   │   │   └── providers.tsx
│   │   ├── components/
│   │   │   ├── BuyTickets.tsx     # $OSO approve + burn for tickets
│   │   │   ├── SubmitGuess.tsx    # Calls BACKEND_URL/api/prove
│   │   │   ├── PuzzleList.tsx     # Fetches from BACKEND_URL/api/puzzles
│   │   │   ├── PuzzleCard.tsx     # Individual puzzle card with prize
│   │   │   ├── Leaderboard.tsx    # PuzzleSolved/TicketUsed events
│   │   │   └── WalletButton.tsx
│   │   └── lib/
│   │       ├── abi/               # Contract ABIs
│   │       ├── contracts.ts       # Addresses + BACKEND_URL
│   │       └── wagmi.ts
│   └── package.json
├── Dockerfile                # Builds api + admin binaries for Railway
├── SPEC.md                   # Full architecture specification
├── AGENTS.md                 # Refactor specification
└── README.md                 # This file
```

## Development

### Prerequisites

- [Foundry](https://book.getfoundry.sh/getting-started/installation) (for Solidity)
- [Rust](https://rustup.rs/) (for backend + RISC0 guests)
- [Node.js](https://nodejs.org/) 18+ (for frontend)

### Smart Contracts

```bash
# Run tests (40 tests)
cd contracts && forge test

# Deploy
source .env
forge script contracts/scripts/Deploy.s.sol --rpc-url $RPC_URL --broadcast -vv
```

### Backend (Rust API Server)

```bash
cd backend

# Build all crates
cargo build

# Run the API server (development)
DATABASE_PATH=./data/puzzles.db cargo run --bin bear-trap-api

# Run admin CLI
DATABASE_PATH=./data/puzzles.db cargo run --bin bear-trap-admin -- --help
```

Environment variables for the API server:

| Variable | Description | Default |
|----------|-------------|---------|
| `DATABASE_PATH` | Path to SQLite database file | `./data/puzzles.db` |
| `PORT` | Server listen port | `3001` |
| `FRONTEND_URL` | Allowed CORS origin | `*` (all origins) |
| `RPC_URL` | Base RPC endpoint | (required for on-chain calls) |
| `OPERATOR_PRIVATE_KEY` | Wallet for useTicket calls | (required) |
| `BOUNDLESS_PRIVATE_KEY` | Wallet for Boundless proof requests | (required) |
| `PINATA_JWT` | For uploading guest ELF to IPFS | (optional) |
| `BEAR_TRAP_ADDRESS` | Deployed BearTrap contract | (required) |
| `ENVIRONMENT` | `testnet` or `mainnet` — controls mock proving and DB scoping | `testnet` |
| `ZKP_ENFORCER_ADDRESS` | Deployed ZKPEnforcer contract | (required for mark-solved) |

### Frontend (Next.js)

```bash
cd frontend
npm install
npm run dev     # Development server at localhost:3000
npm run build   # Production build
```

Frontend `.env.local`:

```env
NEXT_PUBLIC_BEAR_TRAP_ADDRESS=0x...
NEXT_PUBLIC_WEB3AUTH_CLIENT_ID=your_web3auth_client_id_here
NEXT_PUBLIC_BACKEND_URL=http://localhost:3001
```

## Puzzle Management (Admin CLI)

The admin CLI manages puzzles and delegations in the SQLite database. On Railway, run it via `railway run`.

```bash
# Initialize the database
bear-trap-admin init

# Create a puzzle (auto-computes SHA-256 of the answer)
bear-trap-admin create-puzzle --answer "secret passphrase" --clue-uri "ipfs://..."

# Create an open delegation with all 3 caveat enforcers
bear-trap-admin create-delegation \
  --puzzle-id 0 \
  --private-key 0x<delegator_key> \
  --enforcer 0x<ZKPEnforcer> \
  --native-transfer-enforcer 0x<NativeTokenTransferAmountEnforcer> \
  --calldata-enforcer 0x<ExactCalldataEnforcer> \
  --image-id 0x<risc0_image_id> \
  --operator 0x<backend_operator_address> \
  --prize "0.1"

# Update prize amount (can increase over time)
bear-trap-admin update-prize --puzzle-id 0 --prize "0.5"

# Update delegation JSON (e.g., after signing on-chain)
bear-trap-admin update-prize --puzzle-id 0 --delegation '<signed json>'

# Add a raw signed delegation (alternative to create-delegation)
bear-trap-admin add-delegation \
  --puzzle-id 0 \
  --delegation '{"delegate":"0x...","delegator":"0x...",...}' \
  --prize "1.0"

# List all puzzles
bear-trap-admin list-puzzles

# Mark a puzzle as solved
bear-trap-admin mark-solved --puzzle-id 0 --winner "0xabc..."
```

Via Railway:

```bash
railway run bear-trap-admin create-puzzle --answer "secret" --clue-uri "ipfs://..."
railway run bear-trap-admin list-puzzles
```

> **Note:** `create-delegation` generates a delegation with a placeholder signature (`0x`).
> You must sign the delegation via `DelegationManager.delegate()` on-chain, then update
> the stored delegation JSON with the real signature using `update-prize --delegation`.

## Deployment

### Backend (Railway)

The backend is deployed as a Docker container on Railway:

1. The `Dockerfile` builds both `bear-trap-api` and `bear-trap-admin` binaries
2. Railway persistent volume maps to `/data` for the SQLite database
3. Set all required environment variables in Railway dashboard

### Frontend (Vercel)

The frontend is a static Next.js app deployed on Vercel:

1. Set `NEXT_PUBLIC_BACKEND_URL` to the Railway backend URL
2. Set other `NEXT_PUBLIC_*` environment variables
3. Deploy via `vercel` or Git integration

## Contracts

| Contract | Description |
|----------|-------------|
| `BearTrap.sol` | Ticket sales (`buyTickets`), owner-controlled ticket burn (`useTicket`), puzzle lifecycle (`createPuzzle`, `markSolved`). Uses OpenZeppelin Ownable. |
| `ZKPEnforcer.sol` | Custom ERC-7710 caveat enforcer — validates RISC0 proofs and binds them to the solver's address |
| `IBearTrap.sol` | Interface defining Puzzle struct, events, errors |
| `ImageID.sol` | Auto-generated RISC0 guest program image ID |

### Contract Addresses

| Contract | Address |
|----------|---------|
| BearTrap | `TBD` |
| ZKPEnforcer | `TBD` |
| $OSO Token | `0xc78fabc2cb5b9cf59e0af3da8e3bc46d47753a4e` |
| Treasury Safe | `0x78201183f67A82f687e4033Be5Af66e62a1c41e6` |
| DelegationManager | `0xdb9B1e94B5b69Df7e401DDbedE43491141047dB3` |
| RiscZeroVerifierRouter | `0x0b144e07a0826182b6b59788c34b32bfa86fb711` |
| BoundlessMarket | `0xfd152dadc5183870710fe54f939eae3ab9f0fe82` |

## Testing on Base Sepolia

The project supports full testnet deployment on Base Sepolia for end-to-end testing without real funds.

### Environment Separation

All components support `testnet` and `mainnet` modes:

| Component | Config | Default |
|-----------|--------|---------|
| Backend API | `ENVIRONMENT` env var | `testnet` |
| Admin CLI | `--env <testnet\|mainnet>` flag | `testnet` |
| Frontend | `NEXT_PUBLIC_ENVIRONMENT` env var | `testnet` |

The database stores an `environment` column on both `puzzles` and `delegations` tables, scoping all queries to the active environment. Puzzle IDs remain globally unique.

### Testnet Deployment

1. **Deploy mock contracts to Base Sepolia:**

```bash
forge script contracts/scripts/DeployTestnet.s.sol \
  --rpc-url https://sepolia.base.org \
  --broadcast -vv
```

This deploys:
- `MockRiscZeroVerifier` — always-passing verifier (accepts any proof)
- `MockOSO` — mintable ERC20 (anyone can call `mint()`)
- `ZKPEnforcer` — using the mock verifier
- `BearTrap` — using MockOSO, ticket price 1000 OSO

2. **Set environment variables:**

```bash
# Backend
export ENVIRONMENT=testnet
export BEAR_TRAP_ADDRESS=0x...  # from deployment output
export RPC_URL=https://sepolia.base.org

# Frontend (.env.local)
NEXT_PUBLIC_ENVIRONMENT=testnet
NEXT_PUBLIC_BEAR_TRAP_ADDRESS=0x...
NEXT_PUBLIC_OSO_TOKEN_ADDRESS=0x...  # MockOSO address
```

3. **Mint test tokens:**

```bash
# Using cast (Foundry)
cast send $MOCK_OSO_ADDRESS "mint(address,uint256)" $YOUR_ADDRESS 1000000000000000000000000 \
  --rpc-url https://sepolia.base.org --private-key $PRIVATE_KEY
```

4. **Create puzzles via admin CLI:**

```bash
bear-trap-admin --env testnet create-puzzle --answer "test answer" --clue-uri "ipfs://..."
bear-trap-admin --env testnet list-puzzles
```

### Mock Proving

When `ENVIRONMENT=testnet`, the backend skips Boundless SDK and returns mock proofs:
- Mock seal: 32 zero bytes (accepted by MockRiscZeroVerifier)
- Mock journal: properly ABI-encoded `(solverAddress, solutionHash, puzzleId, operatorSig)` so ZKPEnforcer can decode it
- The guess hash is still verified locally — wrong guesses still fail

### Testnet Faucets

- **Base Sepolia ETH**: [Coinbase Faucet](https://www.coinbase.com/faucets/base-ethereum-sepolia-faucet) or [Alchemy Faucet](https://sepoliafaucet.com/)
- **Mock $OSO**: Mint directly via the MockOSO contract (`mint()` is public)


## Security

1. **Private answers**: Solution hashes are stored in a SQLite database on the backend — never on-chain. Users cannot check guesses offline.
2. **Front-running protection**: The actual answer is never visible in the mempool or on-chain. Only the ZK proof is submitted.
3. **Proof bound to solver**: Journal commits the solver's address, preventing proof theft.
4. **Operator attestation**: Backend signs `(solverAddress, puzzleId, solutionHash)` with the operator key. The signature is committed to the journal and verified on-chain via `ECDSA.recover`. Prevents generating valid proofs without going through the backend.
5. **imageId protection**: The RISC0 guest binary hash (imageId) is committed in delegation terms. Modifying the guest program produces a different imageId, invalidating all existing delegations.
6. **Economic deterrent**: Tickets are burned on-chain by the operator before proof generation begins. Every attempt costs $OSO.
7. **Execution mode guards**: ZKPEnforcer enforces `onlySingleCallTypeMode` + `onlyDefaultExecutionMode` — batch and try execution modes are rejected.
8. **Signature authentication**: `/api/prove` requires an EIP-191 signature proving the caller owns the solver address (prevents ticket griefing).
9. **Rate limiting**: IP-based rate limiting on `/api/prove` (5 req/min) with proxy-aware IP extraction (X-Forwarded-For).
10. **Trustless mark-solved**: `/api/mark-solved` accepts a transaction hash, verifies the `ProofVerified` event on-chain, and only then marks the puzzle solved. No authentication needed — the on-chain event is the proof.
11. **Prize limits**: `NativeTokenTransferAmountEnforcer` caps the ETH transfer to the prize amount. `ExactCalldataEnforcer` ensures empty calldata (ETH-only transfer, no contract calls).

## References

- [ERC-7710](https://eips.ethereum.org/EIPS/eip-7710) — Delegation standard
- [MetaMask Delegation Framework](https://github.com/MetaMask/delegation-framework)
- [RISC0 zkVM](https://dev.risczero.com/api/zkvm/guest-code-101)
- [Boundless Network](https://docs.boundless.network/developers/quick-start)
- [Boundless SDK](https://docs.boundless.network/developers/tooling/sdk)

## License

MIT
