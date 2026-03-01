# Bear Trap 🐻

An ERC-7710 delegation puzzle game on Base. Players burn $OSO tokens to buy guess tickets, then submit their answer to a backend prover. The backend burns a ticket on-chain, generates a ZK proof via RISC0/Boundless, and returns it. If the answer is correct, the player calls `redeemDelegations` to claim the ETH prize. If wrong, the proof fails and the ticket is already consumed.

**The first real-money ERC-7710 puzzle game.**

## Architecture

```
Player              Frontend / API           BearTrap         Boundless         DelegationManager
  │                      │                      │                │                     │
  │── 1. buyTickets(n) ────────────────────────>│                │                     │
  │    ($OSO burned)     │                      │                │                     │
  │                      │                      │                │                     │
  │── 2. Enter guess ──>│                      │                │                     │
  │                      │                      │                │                     │
  │                      │── 3. useTicket() ───>│                │                     │
  │                      │    (operator wallet)  │                │                     │
  │                      │    tickets[player]--  │                │                     │
  │                      │                      │                │                     │
  │                      │── 4. Submit proof ──────────────────>│                     │
  │                      │    request            │                │                     │
  │                      │    (guess + answer    │                │                     │
  │                      │     hash from server) │                │                     │
  │                      │                      │                │                     │
  │                      │<── 5. seal + journal ────────────────│                     │
  │                      │    (or proof failure  │                │                     │
  │                      │     = wrong answer)   │                │                     │
  │                      │                      │                │                     │
  │<── 6. proof data ───│                      │                │                     │
  │    (or "wrong guess")│                      │                │                     │
  │                      │                      │                │                     │
  │── 7. redeemDelegations(proof) ─────────────────────────────────────────────────>│
  │                      │                      │                │                     │
  │                      │                      │          ZKPEnforcer verifies        │
  │                      │                      │          proof + solver address      │
  │                      │                      │                │                     │
  │<──────────────────── 8. ETH prize ─────────────────────────────────────────────│
```

### How It Works

1. **Buy Tickets**: Players burn $OSO tokens (sent to `0xdead`) to purchase guess tickets on the BearTrap contract
2. **Submit Guess**: Player enters their passphrase in the frontend and clicks "Solve Puzzle"
3. **Ticket Burn**: The backend operator wallet calls `useTicket()` on-chain, consuming one ticket before proof generation begins
4. **Proof Generation**: The backend passes the guess + the correct answer hash (stored server-side, never on-chain) to the RISC0 guest program via Boundless. If the guess is wrong, the guest assertion fails and no proof is generated — but the ticket is already burned
5. **Claim Prize**: If the proof succeeds, the frontend receives the seal + journal and calls `redeemDelegations()` on the DelegationManager. The ZKPEnforcer verifies the proof on-chain and the ETH prize transfers to the winner

### Key Design: Private Answer + On-Chain Ticket Burn

The answer hash is never stored on-chain — it lives only on the backend. This prevents users from checking their guess offline without paying. Tickets are burned on-chain before proof generation, ensuring every attempt has an economic cost regardless of outcome.

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
| Frontend | Next.js 14, viem, wagmi, ConnectKit |
| Backend | Next.js API routes + Rust prover binary |
| Deployment | Base mainnet (chainId: 8453) |

## Project Structure

```
bear-trap/
├── contracts/                # Solidity contracts (Foundry)
│   ├── src/
│   │   ├── BearTrap.sol           # Ticket sales, operator-controlled burn, puzzle lifecycle
│   │   ├── IBearTrap.sol          # Interface + events + errors
│   │   ├── ZKPEnforcer.sol        # Custom ERC-7710 caveat enforcer (proof + solver verification)
│   │   └── ImageID.sol            # Auto-generated RISC0 image ID
│   ├── test/
│   │   ├── BearTrap.t.sol         # 27 tests (all passing)
│   │   └── Elf.sol                # Auto-generated ELF binary
│   └── scripts/
│       └── Deploy.s.sol           # Deployment script
├── guests/                   # RISC0 guest programs (Rust)
│   └── puzzle-solver/
│       └── src/main.rs            # ZK circuit: hash + assert + commit
├── apps/                     # Proof request CLI (Rust)
│   └── src/main.rs                # Boundless proof generation + JSON output
├── frontend/                 # Next.js web app
│   ├── src/
│   │   ├── app/
│   │   │   ├── api/prove/route.ts # Backend: ticket burn + proof generation
│   │   │   └── ...
│   │   ├── components/
│   │   │   ├── BuyTickets.tsx     # $OSO approve + burn for tickets
│   │   │   ├── SubmitGuess.tsx    # Passphrase input → proof → redeemDelegations
│   │   │   ├── PuzzleList.tsx     # Active puzzle display
│   │   │   ├── PuzzleCard.tsx     # Individual puzzle card
│   │   │   ├── Leaderboard.tsx    # PuzzleSolved/WrongGuess events
│   │   │   └── WalletButton.tsx   # ConnectKit wallet button
│   │   └── lib/
│   │       ├── abi/               # Contract ABIs
│   │       ├── contracts.ts       # Addresses + constants
│   │       └── wagmi.ts           # Wagmi config (Base)
│   └── package.json
├── lib/                      # Git submodules
│   ├── delegation-framework/      # MetaMask Delegation Framework
│   └── risc0-ethereum/            # RISC0 Ethereum contracts
├── SPEC.md                   # Full architecture specification
├── foundry.toml              # Foundry configuration
├── Cargo.toml                # Rust workspace root
└── README.md                 # This file
```

## How to Play

### Prerequisites

- Web3 wallet (MetaMask, etc.) connected to Base
- $OSO tokens on Base for ticket purchases

### Step 1: Buy Tickets

1. Connect your wallet on the Bear Trap frontend
2. Approve $OSO spend (1,000 $OSO per ticket)
3. Click "Buy Tickets" to burn $OSO and receive guess tickets

### Step 2: Solve a Puzzle

1. Select a puzzle from the list
2. Enter your passphrase guess
3. Click "Solve Puzzle"
4. Wait for ZK proof generation (1-3 minutes) — your ticket is consumed immediately
5. If correct: confirm the `redeemDelegations` transaction in your wallet to claim the ETH prize
6. If wrong: you'll see "Wrong guess" — your ticket was already consumed

## Development

### Prerequisites

- [Foundry](https://book.getfoundry.sh/getting-started/installation) (for Solidity)
- [Rust](https://rustup.rs/) (nightly, for RISC0)
- [Node.js](https://nodejs.org/) 18+ (for frontend)

### Smart Contracts

```bash
# Run tests (27 tests)
forge test

# Deploy
source .env
forge script contracts/scripts/Deploy.s.sol --rpc-url $RPC_URL --broadcast -vv
```

Required `.env` for deployment:

```env
VERIFIER_ADDRESS=0x0b144e07a0826182b6b59788c34b32bfa86fb711  # RiscZeroVerifierRouter on Base
OSO_TOKEN=0xc78fabc2cb5b9cf59e0af3da8e3bc46d47753a4e
TICKET_PRICE=1000000000000000000000   # 1000 * 1e18 (1000 $OSO)
RPC_URL=https://mainnet.base.org
PRIVATE_KEY=            # Deployer private key
```

### Frontend

```bash
cd frontend
npm install
npm run dev     # Development server at localhost:3000
npm run build   # Production build
```

Required `.env.local`:

```env
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

### Creating a Puzzle (Admin)

After deployment, the contract owner creates puzzles:

```bash
cast send $BEAR_TRAP_ADDRESS \
  "createPuzzle(string)" \
  "ipfs://QmClueData" \
  --rpc-url $RPC_URL \
  --private-key $PRIVATE_KEY
```

Then fund the contract with the prize ETH:

```bash
cast send $BEAR_TRAP_ADDRESS --value 1ether --rpc-url $RPC_URL --private-key $PRIVATE_KEY
```

Store the answer hash in the backend's `PUZZLE_ANSWERS` env var:

```bash
PUZZLE_ANSWERS='{"0":"0x<sha256-of-answer>"}'
```

Create an ERC-7710 delegation from the Treasury Safe with:
- **ZKPEnforcer** caveat (terms: `imageId`)
- **NativeTokenTransferAmountEnforcer** (maxAmount = prize ETH)
- **LimitedCallsEnforcer** (limit: 1)

## Contracts

| Contract | Description |
|----------|-------------|
| `BearTrap.sol` | Ticket sales (`buyTickets`), operator-controlled ticket burn (`useTicket`), puzzle lifecycle (`createPuzzle`, `markSolved`) |
| `ZKPEnforcer.sol` | Custom ERC-7710 caveat enforcer — validates RISC0 proofs and binds them to the solver's address |
| `IBearTrap.sol` | Interface defining Puzzle struct, events, errors |
| `ImageID.sol` | Auto-generated RISC0 guest program image ID |

### Contract Addresses

_Placeholder — update after deployment:_

| Contract | Address |
|----------|---------|
| BearTrap | `TBD` |
| ZKPEnforcer | `TBD` |
| $OSO Token | `0xc78fabc2cb5b9cf59e0af3da8e3bc46d47753a4e` |
| Treasury Safe | `0x78201183f67A82f687e4033Be5Af66e62a1c41e6` |
| DelegationManager | `0xdb9B1e94B5b69Df7e401DDbedE43491141047dB3` |
| RiscZeroVerifierRouter | `0x0b144e07a0826182b6b59788c34b32bfa86fb711` |
| BoundlessMarket | `0xfd152dadc5183870710fe54f939eae3ab9f0fe82` |

## Security

1. **Private answers**: Solution hashes are stored server-side only — never on-chain. Users cannot check guesses offline.
2. **Front-running protection**: The actual answer is never visible in the mempool or on-chain. Only the ZK proof (which reveals nothing about the answer) is submitted.
3. **Proof bound to solver**: Journal commits the solver's address, preventing proof theft.
4. **Economic deterrent**: Tickets are burned on-chain by the operator before proof generation begins. Every attempt costs $OSO regardless of outcome.
5. **Single winner**: LimitedCallsEnforcer on the delegation ensures only the first correct solver claims the prize.
6. **On-chain verification**: Proofs are verified by the Boundless verifier contract (IRiscZeroVerifier) via the ZKPEnforcer during delegation redemption.

## References

- [ERC-7710](https://eips.ethereum.org/EIPS/eip-7710) — Delegation standard
- [MetaMask Delegation Framework](https://github.com/MetaMask/delegation-framework)
- [RISC0 zkVM](https://dev.risczero.com/api/zkvm/guest-code-101)
- [Boundless Network](https://docs.boundless.network/developers/quick-start)
- [Boundless SDK](https://docs.boundless.network/developers/tooling/sdk)

## License

MIT
