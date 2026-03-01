// SPDX-License-Identifier: MIT
pragma solidity 0.8.23;

import {CaveatEnforcer} from "delegation-framework/enforcers/CaveatEnforcer.sol";
import {ModeCode} from "delegation-framework/utils/Types.sol";
import {IRiscZeroVerifier} from "risc0/IRiscZeroVerifier.sol";

/// @title ZKPEnforcer
/// @author Bear Trap
/// @notice A custom ERC-7710 caveat enforcer that validates RISC0 ZK proofs during
///         delegation redemption. Used to gate ETH prize payouts behind valid ZKP solutions.
///
/// @dev Encoding conventions:
///   terms (set by delegator, signed, immutable):
///     abi.encode(bytes32 imageId)
///     - imageId: RISC0 guest program image ID
///
///   args (set by redeemer at call time, NOT signed):
///     abi.encode(bytes seal, bytes journal)
///     - seal: RISC0 Groth16/SetVerifier proof bytes
///     - journal: ABI-encoded guest program public outputs (address solverAddress, bytes32 solutionHash)
///
///   The enforcer verifies:
///     1. The RISC0 proof is valid via IRiscZeroVerifier.verify(seal, imageId, sha256(journal))
///     2. The journal's solverAddress matches the _redeemer parameter
///
///   Answer correctness is guaranteed by the guest program assertion during proof generation.
///   The backend provides the correct expectedHash as private input to the guest. If the guess
///   is wrong, the guest assertion fails and no proof is generated.
contract ZKPEnforcer is CaveatEnforcer {
    /// @notice The RISC Zero verifier contract (RiscZeroVerifierRouter on Base)
    IRiscZeroVerifier public immutable verifier;

    /// @notice Emitted when a proof is successfully verified
    event ProofVerified(address indexed redeemer, bytes32 indexed solutionHash, bytes32 indexed imageId);

    /// @dev Error thrown when journal's solver address doesn't match redeemer
    error SolverAddressMismatch();

    /// @param _verifier Address of the IRiscZeroVerifier (RiscZeroVerifierRouter)
    constructor(IRiscZeroVerifier _verifier) {
        verifier = _verifier;
    }

    /// @notice Validates a RISC0 ZK proof before delegation execution proceeds.
    /// @dev Reverts if the proof is invalid or solver address mismatches.
    /// @param _terms ABI-encoded (bytes32 imageId)
    /// @param _args ABI-encoded (bytes seal, bytes journal)
    /// @param _mode ERC-7579 execution mode
    /// @param _executionCalldata The execution payload being authorized
    /// @param _delegationHash EIP-712 hash of the delegation being redeemed
    /// @param _delegator Address that created the delegation
    /// @param _redeemer Address that called redeemDelegations (the puzzle solver)
    function beforeHook(
        bytes calldata _terms,
        bytes calldata _args,
        ModeCode _mode,
        bytes calldata _executionCalldata,
        bytes32 _delegationHash,
        address _delegator,
        address _redeemer
    )
        public
        override
    {
        // Decode delegator-set terms: just the guest image ID
        bytes32 imageId = abi.decode(_terms, (bytes32));

        // Decode redeemer-set args: the proof seal and journal
        (bytes memory seal, bytes memory journal) = abi.decode(_args, (bytes, bytes));

        // Step 1: Verify the RISC0 proof on-chain
        // verify() reverts with VerificationFailed() if the proof is invalid
        verifier.verify(seal, imageId, sha256(journal));

        // Step 2: Decode the journal to extract solver address and solution hash
        // Journal format matches guest output: abi.encode(address solverAddress, bytes32 solutionHash)
        (address solverAddress, bytes32 solutionHash) = abi.decode(journal, (address, bytes32));

        // Step 3: Verify the solver address in the proof matches the redeemer
        // This prevents proof theft — someone can't take another player's proof
        if (solverAddress != _redeemer) {
            revert SolverAddressMismatch();
        }

        emit ProofVerified(_redeemer, solutionHash, imageId);
    }
}
