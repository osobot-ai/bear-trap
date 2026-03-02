// SPDX-License-Identifier: MIT
pragma solidity 0.8.23;

import {Test} from "forge-std/Test.sol";
import {MockRiscZeroVerifier} from "../src/mocks/MockRiscZeroVerifier.sol";
import {MockOSO} from "../src/mocks/MockOSO.sol";
import {IRiscZeroVerifier, Receipt as RiscZeroReceipt} from "risc0/IRiscZeroVerifier.sol";

/// @title MocksTest — Tests for MockRiscZeroVerifier and MockOSO
contract MocksTest is Test {
    MockRiscZeroVerifier verifier;
    MockOSO oso;

    function setUp() public {
        verifier = new MockRiscZeroVerifier();
        oso = new MockOSO();
    }

    // ==================== MockRiscZeroVerifier Tests ====================

    function test_VerifyNeverReverts() public view {
        // Any inputs should pass
        verifier.verify(hex"deadbeef", bytes32(uint256(42)), sha256("test"));
    }

    function test_VerifyEmptyInputs() public view {
        verifier.verify("", bytes32(0), bytes32(0));
    }

    function test_VerifyIntegrityNeverReverts() public view {
        RiscZeroReceipt memory receipt = RiscZeroReceipt({
            seal: hex"deadbeef",
            claimDigest: bytes32(uint256(1))
        });
        verifier.verifyIntegrity(receipt);
    }

    function test_VerifyIntegrityEmptyReceipt() public view {
        RiscZeroReceipt memory receipt = RiscZeroReceipt({
            seal: "",
            claimDigest: bytes32(0)
        });
        verifier.verifyIntegrity(receipt);
    }

    function test_ImplementsInterface() public view {
        // Verify the mock implements IRiscZeroVerifier
        IRiscZeroVerifier iface = IRiscZeroVerifier(address(verifier));
        iface.verify("", bytes32(0), bytes32(0));
    }

    // ==================== MockOSO Tests ====================

    function test_MintTokens() public {
        address recipient = address(0xBEEF);
        uint256 amount = 1000 * 1e18;

        oso.mint(recipient, amount);

        assertEq(oso.balanceOf(recipient), amount);
    }

    function test_MintMultipleTimes() public {
        address recipient = address(0xBEEF);

        oso.mint(recipient, 100 * 1e18);
        oso.mint(recipient, 200 * 1e18);

        assertEq(oso.balanceOf(recipient), 300 * 1e18);
    }

    function test_MintToMultipleAddresses() public {
        address alice = address(0xA);
        address bob = address(0xB);

        oso.mint(alice, 100 * 1e18);
        oso.mint(bob, 200 * 1e18);

        assertEq(oso.balanceOf(alice), 100 * 1e18);
        assertEq(oso.balanceOf(bob), 200 * 1e18);
    }

    function test_AnyoneCanMint() public {
        address minter = address(0xCAFE);
        address recipient = address(0xBEEF);

        vm.prank(minter);
        oso.mint(recipient, 500 * 1e18);

        assertEq(oso.balanceOf(recipient), 500 * 1e18);
    }

    function test_TokenMetadata() public view {
        assertEq(oso.name(), "Mock OSO");
        assertEq(oso.symbol(), "OSO");
        assertEq(oso.decimals(), 18);
    }

    function test_TransferAfterMint() public {
        address sender = address(0xA);
        address receiver = address(0xB);
        uint256 amount = 100 * 1e18;

        oso.mint(sender, amount);

        vm.prank(sender);
        oso.transfer(receiver, amount);

        assertEq(oso.balanceOf(sender), 0);
        assertEq(oso.balanceOf(receiver), amount);
    }
}
