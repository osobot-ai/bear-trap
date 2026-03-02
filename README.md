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
| Frontend | Next.js 14, viem, wagmi, ConnectKit (Vercel) |
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
│   │   │   ├── Leaderboard.tsx    # PuzzleSolved/WrongGuess events
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
# Run tests (25 tests)
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
NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID=...
NEXT_PUBLIC_DELEGATION_MANAGER_ADDRESS=0xdb9B1e94B5b69Df7e401DDbedE43491141047dB3
NEXT_PUBLIC_BACKEND_URL=http://localhost:3001
```

## Puzzle Management (Admin CLI)

The admin CLI manages puzzles and delegations in the SQLite database. On Railway, run it via `railway run`.

```bash
# Initialize the database
bear-trap-admin init

# Create a puzzle (auto-computes SHA-256 of the answer)
bear-trap-admin create-puzzle --answer "secret passphrase" --clue-uri "ipfs://..."

# Add a signed delegation for a puzzle
bear-trap-admin add-delegation \
  --puzzle-id 0 \
  --delegation '{"chain":8453,...}' \
  --prize "1.0"

# Update the active delegation
bear-trap-admin update-delegation \
  --puzzle-id 0 \
  --delegation '{"chain":8453,...}' \
  --prize "2.0"

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
- Mock journal: properly ABI-encoded `(solverAddress, solutionHash)` so ZKPEnforcer can decode it
- The guess hash is still verified locally — wrong guesses still fail

### Testnet Faucets

- **Base Sepolia ETH**: [Coinbase Faucet](https://www.coinbase.com/faucets/base-ethereum-sepolia-faucet) or [Alchemy Faucet](https://sepoliafaucet.com/)
- **Mock $OSO**: Mint directly via the MockOSO contract (`mint()` is public)


## Security

1. **Private answers**: Solution hashes are stored in a SQLite database on the backend — never on-chain. Users cannot check guesses offline.
2. **Front-running protection**: The actual answer is never visible in the mempool or on-chain. Only the ZK proof is submitted.
3. **Proof bound to solver**: Journal commits the solver's address, preventing proof theft.
4. **Economic deterrent**: Tickets are burned on-chain by the operator before proof generation begins. Every attempt costs $OSO.
5. **Single winner**: LimitedCallsEnforcer on the delegation ensures only the first correct solver claims the prize.
6. **On-chain verification**: Proofs are verified by the Boundless verifier contract via the ZKPEnforcer during delegation redemption.

## References

- [ERC-7710](https://eips.ethereum.org/EIPS/eip-7710) — Delegation standard
- [MetaMask Delegation Framework](https://github.com/MetaMask/delegation-framework)
- [RISC0 zkVM](https://dev.risczero.com/api/zkvm/guest-code-101)
- [Boundless Network](https://docs.boundless.network/developers/quick-start)
- [Boundless SDK](https://docs.boundless.network/developers/tooling/sdk)

## License

MIT
