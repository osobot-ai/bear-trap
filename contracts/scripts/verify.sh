#!/usr/bin/env bash
set -euo pipefail

# Verify Bear Trap contracts on Basescan.
# Usage: source .env && bash contracts/scripts/verify.sh
#
# Required env vars:
#   BEAR_TRAP_ADDRESS, ZKP_ENFORCER_ADDRESS, VERIFIER_ADDRESS,
#   OSO_TOKEN, TICKET_PRICE, OWNER_ADDRESS, BASESCAN_API_KEY
#
# Optional:
#   CHAIN (default: base). Use "base-sepolia" for testnet.

CHAIN="${CHAIN:-base}"

: "${BEAR_TRAP_ADDRESS:?Set BEAR_TRAP_ADDRESS}"
: "${ZKP_ENFORCER_ADDRESS:?Set ZKP_ENFORCER_ADDRESS}"
: "${VERIFIER_ADDRESS:?Set VERIFIER_ADDRESS}"
: "${OSO_TOKEN:?Set OSO_TOKEN}"
: "${TICKET_PRICE:?Set TICKET_PRICE}"
: "${OWNER_ADDRESS:?Set OWNER_ADDRESS}"
: "${BASESCAN_API_KEY:?Set BASESCAN_API_KEY}"

echo "=== Verifying ZKPEnforcer at $ZKP_ENFORCER_ADDRESS ==="
forge verify-contract "$ZKP_ENFORCER_ADDRESS" \
  contracts/src/ZKPEnforcer.sol:ZKPEnforcer \
  --constructor-args "$(cast abi-encode 'constructor(address)' "$VERIFIER_ADDRESS")" \
  --chain "$CHAIN" \
  --etherscan-api-key "$BASESCAN_API_KEY" \
  --watch

echo ""
echo "=== Verifying BearTrap at $BEAR_TRAP_ADDRESS ==="
forge verify-contract "$BEAR_TRAP_ADDRESS" \
  contracts/src/BearTrap.sol:BearTrap \
  --constructor-args "$(cast abi-encode 'constructor(address,uint256,address)' "$OSO_TOKEN" "$TICKET_PRICE" "$OWNER_ADDRESS")" \
  --chain "$CHAIN" \
  --etherscan-api-key "$BASESCAN_API_KEY" \
  --watch

echo ""
echo "✅ Both contracts verified on $CHAIN"
