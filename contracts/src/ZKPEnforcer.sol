// SPDX-License-Identifier: MIT
pragma solidity 0.8.23;

import {CaveatEnforcer} from "delegation-framework/enforcers/CaveatEnforcer.sol";
import {ModeCode} from "delegation-framework/utils/Types.sol";
import {IRiscZeroVerifier} from "risc0/IRiscZeroVerifier.sol";
import {ECDSA} from "openzeppelin/contracts/utils/cryptography/ECDSA.sol";

/// @title ZKPEnforcer
/// @author Bear Trap
/// @notice A custom ERC-7710 caveat enforcer that validates RISC0 ZK proofs during
///         delegation redemption. Used to gate ETH prize payouts behind valid ZKP solutions.
///
/// @dev Encoding conventions:
///   terms (set by delegator, signed, immutable):
///     abi.encode(bytes32 imageId, uint256 puzzleId, address operatorAddress)
///     - imageId: RISC0 guest program image ID
///     - puzzleId: the puzzle this delegation is for
///     - operatorAddress: trusted backend operator whose signature must appear in the journal
///
///   args (set by redeemer at call time, NOT signed):
///     abi.encode(bytes seal, bytes journal)
///     - seal: RISC0 Groth16/SetVerifier proof bytes
///     - journal: ABI-encoded guest program public outputs
///       (address solverAddress, bytes32 solutionHash, uint256 puzzleId, bytes operatorSig)
///
///   The enforcer verifies:
///     1. The RISC0 proof is valid via IRiscZeroVerifier.verify(seal, imageId, sha256(journal))
///     2. The journal's solverAddress matches the _redeemer parameter
///     3. The journal's puzzleId matches the terms puzzleId
///     4. The operatorSig in the journal recovers to the operatorAddress in terms (via ecrecover)
///
///   The imageId protects the guest binary from modification, so an attacker cannot bypass
///   the signature check inside the guest. By also verifying operator identity on-chain,
///   we prevent an attacker from running the guest with their own operator key.
contract ZKPEnforcer is CaveatEnforcer {
    IRiscZeroVerifier public immutable verifier;

    event ProofVerified(
        address indexed redeemer,
        bytes32 indexed solutionHash,
        bytes32 indexed imageId,
        uint256 puzzleId,
        address operatorAddress
    );

    error SolverAddressMismatch();
    error PuzzleIdMismatch();
    error OperatorMismatch();

    constructor(IRiscZeroVerifier _verifier) {
        verifier = _verifier;
    }

    function beforeHook(
        bytes calldata _terms,
        bytes calldata _args,
        ModeCode _mode,
        bytes calldata,
        bytes32,
        address,
        address _redeemer
    )
        public
        override
        onlySingleCallTypeMode(_mode)
        onlyDefaultExecutionMode(_mode)
    {
        (bytes32 imageId, uint256 termsPuzzleId, address operatorAddress) =
            abi.decode(_terms, (bytes32, uint256, address));

        (bytes memory seal, bytes memory journal) = abi.decode(_args, (bytes, bytes));

        verifier.verify(seal, imageId, sha256(journal));

        (address solverAddress, bytes32 solutionHash, uint256 journalPuzzleId, bytes memory operatorSig) =
            abi.decode(journal, (address, bytes32, uint256, bytes));

        if (solverAddress != _redeemer) revert SolverAddressMismatch();
        if (journalPuzzleId != termsPuzzleId) revert PuzzleIdMismatch();

        _verifyOperator(solverAddress, journalPuzzleId, solutionHash, operatorSig, operatorAddress);

        emit ProofVerified(_redeemer, solutionHash, imageId, journalPuzzleId, operatorAddress);
    }

    /// @dev Recover operator address from signature and verify it matches the trusted operator.
    /// The operator signs keccak256(abi.encodePacked(solverAddress, puzzleId, solutionHash))
    /// using raw hash signing (no EIP-191 prefix).
    function _verifyOperator(
        address solverAddress,
        uint256 puzzleId,
        bytes32 solutionHash,
        bytes memory operatorSig,
        address operatorAddress
    ) internal pure {
        bytes32 messageHash = keccak256(abi.encodePacked(solverAddress, puzzleId, solutionHash));
        address recovered = ECDSA.recover(messageHash, operatorSig);
        if (recovered != operatorAddress) revert OperatorMismatch();
    }
}
