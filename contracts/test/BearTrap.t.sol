// SPDX-License-Identifier: MIT
pragma solidity 0.8.23;

import {Test, console2} from "forge-std/Test.sol";
import {BearTrap, IERC20} from "../src/BearTrap.sol";
import {ZKPEnforcer} from "../src/ZKPEnforcer.sol";
import {IBearTrap} from "../src/IBearTrap.sol";
import {Ownable} from "openzeppelin/contracts/access/Ownable.sol";
import {ModeCode} from "delegation-framework/utils/Types.sol";
import {IRiscZeroVerifier, Receipt, VerificationFailed} from "risc0/IRiscZeroVerifier.sol";

/// @title MockERC20 — Simple mock for $OSO token
contract MockERC20 is IERC20 {
    mapping(address => uint256) public balances;
    mapping(address => mapping(address => uint256)) public allowances;

    function mint(address to, uint256 amount) external {
        balances[to] += amount;
    }

    function transferFrom(address from, address to, uint256 amount) external returns (bool) {
        require(balances[from] >= amount, "Insufficient balance");
        require(allowances[from][msg.sender] >= amount, "Insufficient allowance");
        balances[from] -= amount;
        allowances[from][msg.sender] -= amount;
        balances[to] += amount;
        return true;
    }

    function balanceOf(address account) external view returns (uint256) {
        return balances[account];
    }

    function allowance(address owner, address spender) external view returns (uint256) {
        return allowances[owner][spender];
    }

    function approve(address spender, uint256 amount) external returns (bool) {
        allowances[msg.sender][spender] = amount;
        return true;
    }
}

/// @title MockRiscZeroVerifier — Simulates RISC0 proof verification
contract MockRiscZeroVerifier is IRiscZeroVerifier {
    bool public shouldVerify;

    constructor() {
        shouldVerify = true;
    }

    function setShouldVerify(bool _shouldVerify) external {
        shouldVerify = _shouldVerify;
    }

    function verify(bytes calldata, bytes32, bytes32) external view {
        if (!shouldVerify) {
            revert VerificationFailed();
        }
    }

    function verifyIntegrity(Receipt calldata) external view {
        if (!shouldVerify) {
            revert VerificationFailed();
        }
    }
}

/// @title BearTrapTest — Test suite for the Bear Trap puzzle game (v2 refactor)
contract BearTrapTest is Test {
    MockERC20 osoToken;
    BearTrap bearTrap;
    MockRiscZeroVerifier mockVerifier;
    ZKPEnforcer zkpEnforcer;

    address ownerAddr = address(this);
    address player = address(0xBEEF);
    address burnAddress = 0x000000000000000000000000000000000000dEaD;

    uint256 ticketPrice = 1 ether;

    function setUp() public {
        osoToken = new MockERC20();
        bearTrap = new BearTrap(
            IERC20(address(osoToken)),
            ticketPrice,
            ownerAddr
        );
        mockVerifier = new MockRiscZeroVerifier();
        zkpEnforcer = new ZKPEnforcer(IRiscZeroVerifier(address(mockVerifier)));
    }

    // ==================== Ticket Tests ====================

    function test_BuyTickets() public {
        // Mint OSO tokens to player and approve
        osoToken.mint(player, 10 ether);
        vm.startPrank(player);
        osoToken.approve(address(bearTrap), 10 ether);

        // Buy 3 tickets
        bearTrap.buyTickets(3);
        vm.stopPrank();

        // Verify tickets
        assertEq(bearTrap.tickets(player), 3);

        // Verify OSO burned (sent to dead address)
        assertEq(osoToken.balanceOf(burnAddress), 3 ether);
        assertEq(osoToken.balanceOf(player), 7 ether);
    }

    function test_BuyTicketsZeroAmount() public {
        vm.prank(player);
        vm.expectRevert(IBearTrap.ZeroAmount.selector);
        bearTrap.buyTickets(0);
    }

    function test_BuyTicketsInsufficientBalance() public {
        osoToken.mint(player, 0.5 ether);
        vm.startPrank(player);
        osoToken.approve(address(bearTrap), 1 ether);

        vm.expectRevert("Insufficient balance");
        bearTrap.buyTickets(1);
        vm.stopPrank();
    }

    function test_BuyTicketsInsufficientAllowance() public {
        osoToken.mint(player, 10 ether);
        vm.startPrank(player);
        osoToken.approve(address(bearTrap), 0.5 ether);

        vm.expectRevert("Insufficient allowance");
        bearTrap.buyTickets(1);
        vm.stopPrank();
    }

    function test_BuyTicketsEmitsEvent() public {
        osoToken.mint(player, 10 ether);
        vm.startPrank(player);
        osoToken.approve(address(bearTrap), 10 ether);

        vm.expectEmit(true, false, false, true);
        emit IBearTrap.TicketsPurchased(player, 2);
        bearTrap.buyTickets(2);
        vm.stopPrank();
    }

    // ==================== useTicket Tests ====================

    function test_UseTicket() public {
        bearTrap.createPuzzle("test");
        _givePlayerTickets(3);

        vm.expectEmit(true, true, false, true);
        emit IBearTrap.TicketUsed(0, player, 2);
        bearTrap.useTicket(player, 0);

        assertEq(bearTrap.tickets(player), 2);
    }

    function test_UseTicketNotOwner() public {
        bearTrap.createPuzzle("test");
        _givePlayerTickets(1);

        vm.prank(player);
        vm.expectRevert(abi.encodeWithSelector(Ownable.OwnableUnauthorizedAccount.selector, player));
        bearTrap.useTicket(player, 0);
    }

    function test_UseTicketNoTickets() public {
        bearTrap.createPuzzle("test");

        vm.expectRevert(IBearTrap.NoTickets.selector);
        bearTrap.useTicket(player, 0);
    }

    function test_UseTicketInvalidPuzzleId() public {
        _givePlayerTickets(1);

        vm.expectRevert(IBearTrap.InvalidPuzzleId.selector);
        bearTrap.useTicket(player, 999);
    }

    function test_UseTicketAlreadySolved() public {
        bearTrap.createPuzzle("test");
        _givePlayerTickets(2);

        // Solve the puzzle first
        bearTrap.useTicket(player, 0);
        bearTrap.markSolved(0, player);

        // Try to use ticket on solved puzzle
        vm.expectRevert(IBearTrap.AlreadySolved.selector);
        bearTrap.useTicket(player, 0);
    }

    function test_UseTicketMultiple() public {
        bearTrap.createPuzzle("test");
        _givePlayerTickets(3);

        bearTrap.useTicket(player, 0);
        bearTrap.useTicket(player, 0);

        assertEq(bearTrap.tickets(player), 1);
    }

    // ==================== markSolved Tests ====================

    function test_MarkSolved() public {
        bearTrap.createPuzzle("test");

        vm.expectEmit(true, true, false, false);
        emit IBearTrap.PuzzleSolved(0, player);
        bearTrap.markSolved(0, player);

        (string memory clueURI, bool solved, address winner) = bearTrap.puzzles(0);
        assertTrue(solved);
        assertEq(winner, player);
        assertEq(keccak256(bytes(clueURI)), keccak256(bytes("test")));
    }

    function test_MarkSolvedNotOwner() public {
        bearTrap.createPuzzle("test");

        vm.prank(player);
        vm.expectRevert(abi.encodeWithSelector(Ownable.OwnableUnauthorizedAccount.selector, player));
        bearTrap.markSolved(0, player);
    }

    function test_MarkSolvedInvalidPuzzleId() public {
        vm.expectRevert(IBearTrap.InvalidPuzzleId.selector);
        bearTrap.markSolved(999, player);
    }

    function test_MarkSolvedAlreadySolved() public {
        bearTrap.createPuzzle("test");

        bearTrap.markSolved(0, player);

        vm.expectRevert(IBearTrap.AlreadySolved.selector);
        bearTrap.markSolved(0, player);
    }

    // ==================== Puzzle Management Tests ====================

    function test_CreatePuzzle() public {
        string memory clueURI = "ipfs://QmTest123";

        vm.expectEmit(true, false, false, true);
        emit IBearTrap.PuzzleCreated(0);
        bearTrap.createPuzzle(clueURI);

        assertEq(bearTrap.puzzleCount(), 1);

        (string memory uri, bool solved, address winner) = bearTrap.puzzles(0);
        assertEq(uri, clueURI);
        assertEq(winner, address(0));
        assertFalse(solved);
    }

    function test_CreatePuzzleNotOwner() public {
        vm.prank(player);
        vm.expectRevert(abi.encodeWithSelector(Ownable.OwnableUnauthorizedAccount.selector, player));
        bearTrap.createPuzzle("test");
    }

    function test_MultiplePuzzles() public {
        bearTrap.createPuzzle("clue1");
        bearTrap.createPuzzle("clue2");
        bearTrap.createPuzzle("clue3");

        assertEq(bearTrap.puzzleCount(), 3);
    }

    // ==================== ZKPEnforcer Tests ====================

    function test_ZKPEnforcerValid() public {
        bytes32 solutionHash = sha256("correct answer");
        bytes32 imageId = bytes32(uint256(42));

        // Encode terms (delegator-set): just imageId
        bytes memory terms = abi.encode(imageId);

        // Encode journal (guest output): (address solver, bytes32 hash)
        bytes memory journal = abi.encode(player, solutionHash);

        // Encode args (redeemer-set)
        bytes memory seal = hex"deadbeef"; // Mock seal — verifier will accept anything
        bytes memory args = abi.encode(seal, journal);

        // Call beforeHook — should succeed
        mockVerifier.setShouldVerify(true);
        zkpEnforcer.beforeHook(
            terms,
            args,
            ModeCode.wrap(bytes32(0)),
            "",
            bytes32(0),
            address(0),
            player // redeemer
        );
    }

    function test_ZKPEnforcerInvalidProof() public {
        bytes32 solutionHash = sha256("correct answer");
        bytes32 imageId = bytes32(uint256(42));

        bytes memory terms = abi.encode(imageId);
        bytes memory journal = abi.encode(player, solutionHash);
        bytes memory seal = hex"baadbeef";
        bytes memory args = abi.encode(seal, journal);

        // Set verifier to reject
        mockVerifier.setShouldVerify(false);

        vm.expectRevert(abi.encodeWithSignature("VerificationFailed()"));
        zkpEnforcer.beforeHook(
            terms,
            args,
            ModeCode.wrap(bytes32(0)),
            "",
            bytes32(0),
            address(0),
            player
        );
    }

    function test_ZKPEnforcerWrongRedeemer() public {
        bytes32 solutionHash = sha256("correct answer");
        bytes32 imageId = bytes32(uint256(42));

        bytes memory terms = abi.encode(imageId);

        // Journal has different solver address
        address wrongSolver = address(0xDEAD);
        bytes memory journal = abi.encode(wrongSolver, solutionHash);
        bytes memory seal = hex"deadbeef";
        bytes memory args = abi.encode(seal, journal);

        mockVerifier.setShouldVerify(true);

        vm.expectRevert(ZKPEnforcer.SolverAddressMismatch.selector);
        zkpEnforcer.beforeHook(
            terms,
            args,
            ModeCode.wrap(bytes32(0)),
            "",
            bytes32(0),
            address(0),
            player // redeemer doesn't match journal
        );
    }

    // ==================== Ownership Tests ====================

    function test_TransferOwnership() public {
        bearTrap.transferOwnership(player);
        assertEq(bearTrap.owner(), player);

        // New owner can create puzzles
        vm.prank(player);
        bearTrap.createPuzzle("test");
    }

    function test_TransferOwnershipNotOwner() public {
        vm.prank(player);
        vm.expectRevert(abi.encodeWithSelector(Ownable.OwnableUnauthorizedAccount.selector, player));
        bearTrap.transferOwnership(player);
    }

    // ==================== Integration: Full Flow ====================

    function test_FullFlow() public {
        // Create puzzle
        bearTrap.createPuzzle("ipfs://clue");

        // Player buys tickets
        _givePlayerTickets(2);
        assertEq(bearTrap.tickets(player), 2);

        // Owner burns a ticket (wrong guess)
        bearTrap.useTicket(player, 0);
        assertEq(bearTrap.tickets(player), 1);

        // Owner burns another ticket (correct guess this time)
        bearTrap.useTicket(player, 0);
        assertEq(bearTrap.tickets(player), 0);

        // Owner marks solved after redeemDelegations succeeds
        bearTrap.markSolved(0, player);

        (string memory clueURI, bool solved, address winner) = bearTrap.puzzles(0);
        assertTrue(solved);
        assertEq(winner, player);
        assertEq(keccak256(bytes(clueURI)), keccak256(bytes("ipfs://clue")));
    }

    // ==================== Helpers ====================

    function _givePlayerTickets(uint256 amount) internal {
        osoToken.mint(player, ticketPrice * amount);
        vm.startPrank(player);
        osoToken.approve(address(bearTrap), ticketPrice * amount);
        bearTrap.buyTickets(amount);
        vm.stopPrank();
    }
}
