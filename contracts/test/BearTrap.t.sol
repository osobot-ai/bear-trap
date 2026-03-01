// SPDX-License-Identifier: MIT
pragma solidity 0.8.23;

import {Test, console2} from "forge-std/Test.sol";
import {BearTrap, IERC20} from "../src/BearTrap.sol";
import {ZKPEnforcer} from "../src/ZKPEnforcer.sol";
import {IBearTrap} from "../src/IBearTrap.sol";
import {IDelegationManager} from "delegation-framework/interfaces/IDelegationManager.sol";
import {ModeCode, Delegation} from "delegation-framework/utils/Types.sol";
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

/// @title MockDelegationManager — Simulates delegation redemption outcomes
contract MockDelegationManager is IDelegationManager {
    bool public shouldSucceed;

    function setShouldSucceed(bool _shouldSucceed) external {
        shouldSucceed = _shouldSucceed;
    }

    function redeemDelegations(
        bytes[] calldata,
        ModeCode[] calldata,
        bytes[] calldata
    ) external {
        if (!shouldSucceed) {
            revert("MockDelegationManager: redemption failed");
        }
    }

    // Stub implementations for the full interface
    function pause() external {}
    function unpause() external {}
    function enableDelegation(
        // solhint-disable-next-line
        Delegation calldata
    ) external {}
    function disableDelegation(
        // solhint-disable-next-line
        Delegation calldata
    ) external {}
    function disabledDelegations(bytes32) external view returns (bool) { return false; }
    function getDelegationHash(
        // solhint-disable-next-line
        Delegation calldata
    ) external pure returns (bytes32) { return bytes32(0); }
    function getDomainHash() external view returns (bytes32) { return bytes32(0); }
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

/// @title BearTrapTest — Test suite for the Bear Trap puzzle game
contract BearTrapTest is Test {
    MockERC20 osoToken;
    MockDelegationManager delegationManager;
    BearTrap bearTrap;
    MockRiscZeroVerifier mockVerifier;
    ZKPEnforcer zkpEnforcer;

    address owner = address(this);
    address player = address(0xBEEF);
    address burnAddress = 0x000000000000000000000000000000000000dEaD;

    uint256 ticketPrice = 1 ether;

    function setUp() public {
        osoToken = new MockERC20();
        delegationManager = new MockDelegationManager();
        bearTrap = new BearTrap(
            IERC20(address(osoToken)),
            IDelegationManager(address(delegationManager)),
            ticketPrice
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

    // ==================== Guess Submission Tests ====================

    function test_SubmitGuessNoTickets() public {
        bearTrap.createPuzzle(sha256("test"), 1 ether, "test");

        vm.prank(player);
        vm.expectRevert(IBearTrap.NoTickets.selector);
        bearTrap.submitGuess(
            0,
            new bytes[](0),
            new ModeCode[](0),
            new bytes[](0)
        );
    }

    function test_SubmitGuessCorrect() public {
        bearTrap.createPuzzle(sha256("test"), 1 ether, "test");

        // Give player a ticket
        _givePlayerTickets(1);

        // Configure delegation manager to succeed
        delegationManager.setShouldSucceed(true);

        // Submit guess
        vm.prank(player);
        vm.expectEmit(true, true, false, false);
        emit IBearTrap.PuzzleSolved(0, player);
        bearTrap.submitGuess(
            0,
            new bytes[](0),
            new ModeCode[](0),
            new bytes[](0)
        );

        // Ticket should be consumed
        assertEq(bearTrap.tickets(player), 0);
    }

    function test_SubmitGuessWrong() public {
        bearTrap.createPuzzle(sha256("test"), 1 ether, "test");

        // Give player a ticket
        _givePlayerTickets(1);

        // Configure delegation manager to fail
        delegationManager.setShouldSucceed(false);

        // Submit guess — should catch the revert
        vm.prank(player);
        vm.expectEmit(true, true, false, false);
        emit IBearTrap.WrongGuess(0, player);
        bearTrap.submitGuess(
            0,
            new bytes[](0),
            new ModeCode[](0),
            new bytes[](0)
        );

        // Ticket should still be consumed!
        assertEq(bearTrap.tickets(player), 0);
    }

    function test_TicketBurnedOnWrongGuess() public {
        bearTrap.createPuzzle(sha256("test"), 1 ether, "test");

        // Give player 3 tickets
        _givePlayerTickets(3);

        // Configure delegation to fail
        delegationManager.setShouldSucceed(false);

        // Submit wrong guess
        vm.prank(player);
        bearTrap.submitGuess(
            0,
            new bytes[](0),
            new ModeCode[](0),
            new bytes[](0)
        );

        // Should have 2 tickets (1 burned on wrong guess)
        assertEq(bearTrap.tickets(player), 2);
    }

    function test_MultipleGuessAttempts() public {
        bearTrap.createPuzzle(sha256("test"), 1 ether, "test");

        // Give player 3 tickets
        _givePlayerTickets(3);

        // Two wrong guesses
        delegationManager.setShouldSucceed(false);
        vm.startPrank(player);
        bearTrap.submitGuess(0, new bytes[](0), new ModeCode[](0), new bytes[](0));
        bearTrap.submitGuess(0, new bytes[](0), new ModeCode[](0), new bytes[](0));

        assertEq(bearTrap.tickets(player), 1);

        // Third guess is correct
        delegationManager.setShouldSucceed(true);
        bearTrap.submitGuess(0, new bytes[](0), new ModeCode[](0), new bytes[](0));
        vm.stopPrank();

        assertEq(bearTrap.tickets(player), 0);
    }

    function test_SubmitGuessInvalidPuzzleId() public {
        _givePlayerTickets(1);

        vm.prank(player);
        vm.expectRevert(IBearTrap.InvalidPuzzleId.selector);
        bearTrap.submitGuess(999, new bytes[](0), new ModeCode[](0), new bytes[](0));
    }

    function test_SubmitGuessAlreadySolved() public {
        bearTrap.createPuzzle(sha256("test"), 1 ether, "test");
        _givePlayerTickets(2);
        delegationManager.setShouldSucceed(true);

        vm.prank(player);
        bearTrap.submitGuess(0, new bytes[](0), new ModeCode[](0), new bytes[](0));

        vm.prank(player);
        vm.expectRevert(IBearTrap.AlreadySolved.selector);
        bearTrap.submitGuess(0, new bytes[](0), new ModeCode[](0), new bytes[](0));
    }

    function test_SubmitGuessPuzzleStateUpdated() public {
        bearTrap.createPuzzle(sha256("test"), 1 ether, "test");
        _givePlayerTickets(1);
        delegationManager.setShouldSucceed(true);

        vm.prank(player);
        bearTrap.submitGuess(0, new bytes[](0), new ModeCode[](0), new bytes[](0));

        (, , address winner, bool solved, ) = bearTrap.puzzles(0);
        assertTrue(solved);
        assertEq(winner, player);
    }

    // ==================== Puzzle Management Tests ====================

    function test_CreatePuzzle() public {
        bytes32 solutionHash = sha256("secret answer");
        uint256 prizeAmount = 1 ether;
        string memory clueURI = "ipfs://QmTest123";

        vm.expectEmit(true, false, false, true);
        emit IBearTrap.PuzzleCreated(0, solutionHash, prizeAmount);
        bearTrap.createPuzzle(solutionHash, prizeAmount, clueURI);

        assertEq(bearTrap.puzzleCount(), 1);

        (bytes32 hash, uint256 prize, address winner, bool solved, string memory uri) = bearTrap.puzzles(0);
        assertEq(hash, solutionHash);
        assertEq(prize, prizeAmount);
        assertEq(winner, address(0));
        assertFalse(solved);
        assertEq(uri, clueURI);
    }

    function test_CreatePuzzleNotOwner() public {
        vm.prank(player);
        vm.expectRevert(IBearTrap.NotOwner.selector);
        bearTrap.createPuzzle(bytes32(0), 1 ether, "test");
    }

    function test_MultiplePuzzles() public {
        bearTrap.createPuzzle(sha256("puzzle1"), 1 ether, "clue1");
        bearTrap.createPuzzle(sha256("puzzle2"), 2 ether, "clue2");
        bearTrap.createPuzzle(sha256("puzzle3"), 3 ether, "clue3");

        assertEq(bearTrap.puzzleCount(), 3);
    }

    // ==================== ZKPEnforcer Tests ====================

    function test_ZKPEnforcerValid() public {
        bytes32 solutionHash = sha256("correct answer");
        bytes32 imageId = bytes32(uint256(42));

        // Encode terms (delegator-set)
        bytes memory terms = abi.encode(solutionHash, imageId);

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

        bytes memory terms = abi.encode(solutionHash, imageId);
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

    function test_ZKPEnforcerWrongSolutionHash() public {
        bytes32 solutionHash = sha256("correct answer");
        bytes32 wrongHash = sha256("wrong answer");
        bytes32 imageId = bytes32(uint256(42));

        bytes memory terms = abi.encode(solutionHash, imageId);

        // Journal has wrong hash
        bytes memory journal = abi.encode(player, wrongHash);
        bytes memory seal = hex"deadbeef";
        bytes memory args = abi.encode(seal, journal);

        mockVerifier.setShouldVerify(true);

        vm.expectRevert(ZKPEnforcer.SolutionHashMismatch.selector);
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

        bytes memory terms = abi.encode(solutionHash, imageId);

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
        bytes32 testHash = sha256("test");
        vm.prank(player);
        bearTrap.createPuzzle(testHash, 1 ether, "test");
    }

    function test_TransferOwnershipNotOwner() public {
        vm.prank(player);
        vm.expectRevert(IBearTrap.NotOwner.selector);
        bearTrap.transferOwnership(player);
    }

    // ==================== Receive ETH Test ====================

    function test_ReceiveETH() public {
        vm.deal(address(this), 10 ether);
        (bool success,) = address(bearTrap).call{value: 1 ether}("");
        assertTrue(success);
        assertEq(address(bearTrap).balance, 1 ether);
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
