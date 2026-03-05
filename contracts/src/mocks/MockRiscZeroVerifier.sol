// SPDX-License-Identifier: MIT
pragma solidity 0.8.23;

import {IRiscZeroVerifier, Receipt} from "risc0/IRiscZeroVerifier.sol";

/// @title MockRiscZeroVerifier
/// @notice Always-passing verifier for testnet. verify() never reverts.
contract MockRiscZeroVerifier is IRiscZeroVerifier {
    /// @notice Always passes — any seal, imageId, journalDigest is accepted.
    function verify(bytes calldata, bytes32, bytes32) external view {}

    /// @notice Always passes — any receipt is accepted.
    function verifyIntegrity(Receipt calldata) external view {}
}
