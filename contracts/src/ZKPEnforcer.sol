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
///     abi.encode(bytes32 imageId, uint256 puzzleId)
///     - imageId: RISC0 guest program image ID
///     - puzzleId: the puzzle this delegation is for
///
///   args (set by redeemer at call time, NOT signed):
///     abi.encode(bytes seal, bytes journal)
///     - seal: RISC0 Groth16/SetVerifier proof bytes
///     - journal: ABI-encoded guest program public outputs (address solverAddress, bytes32 solutionHash, uint256 puzzleId)
///
///   The enforcer verifies:
///     1. The RISC0 proof is valid via IRiscZeroVerifier.verify(seal, imageId, sha256(journal))
///     2. The journal's solverAddress matches the _redeemer parameter
///     3. The journal's puzzleId matches the terms puzzleId
///
///   Operator signature verification happens inside the zkVM (proven by imageId),
///   so the enforcer doesn't need to verify it again.
contract ZKPEnforcer is CaveatEnforcer {
    IRiscZeroVerifier public immutable verifier;

    event ProofVerified(address indexed redeemer, bytes32 indexed solutionHash, bytes32 indexed imageId, uint256 puzzleId);

    error SolverAddressMismatch();
    error PuzzleIdMismatch();

    constructor(IRiscZeroVerifier _verifier) {
        verifier = _verifier;
    }

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
        (bytes32 imageId, uint256 termsPuzzleId) = abi.decode(_terms, (bytes32, uint256));

        (bytes memory seal, bytes memory journal) = abi.decode(_args, (bytes, bytes));

        verifier.verify(seal, imageId, sha256(journal));

        (address solverAddress, bytes32 solutionHash, uint256 journalPuzzleId) =
            abi.decode(journal, (address, bytes32, uint256));

        if (solverAddress != _redeemer) {
            revert SolverAddressMismatch();
        }

        if (journalPuzzleId != termsPuzzleId) {
            revert PuzzleIdMismatch();
        }

        emit ProofVerified(_redeemer, solutionHash, imageId, journalPuzzleId);
    }
}
