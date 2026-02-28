# AGENTS.md

## Project: Bear Trap 🐻

An ERC-7710 delegation puzzle game with RISC0/Boundless ZKP verification on Base.

## Key Files
- `SPEC.md` — Full architecture specification (READ THIS FIRST)

## Build Instructions

Read SPEC.md thoroughly. It contains the complete architecture, flow diagrams, component specs, and directory structure.

## Reference Docs to Fetch

Before building, fetch and read these docs for the latest API details:

- https://dev.risczero.com/api/zkvm/guest-code-101
- https://dev.risczero.com/api/zkvm/quickstart  
- https://dev.risczero.com/api/generating-proofs/remote-proving
- https://github.com/risc0/risc0/tree/release-3.0/examples/json
- https://github.com/inversebrah/awesome-risc0
- https://docs.boundless.network/developers/tooling/sdk
- https://docs.boundless.network/developers/quick-start
- https://github.com/boundless-xyz/boundless-foundry-template
- https://github.com/MetaMask/delegation-framework

## Smart Accounts Kit Reference

The MetaMask Smart Accounts Kit skill at ~/.openclaw/workspace/skills/smart-accounts-kit/SKILL.md contains comprehensive documentation on the Delegation Framework, caveats, enforcers, and ERC-7710 lifecycle. READ IT for accurate contract interfaces and patterns.

## Rules
- Use Foundry for Solidity contracts
- Use the Boundless Foundry Template as the base for RISC0 integration
- Follow the directory structure in SPEC.md
- All contracts target Base (chainId: 8453)
- The ZKPEnforcer must implement ICaveatEnforcer from the delegation framework
