// SPDX-License-Identifier: MIT
pragma solidity 0.8.23;

import {IDelegationManager} from "delegation-framework/interfaces/IDelegationManager.sol";
import {ModeCode} from "delegation-framework/utils/Types.sol";
import {IBearTrap} from "./IBearTrap.sol";

/// @title IERC20 — Minimal ERC20 interface for $OSO token interaction
interface IERC20 {
    function transferFrom(address from, address to, uint256 amount) external returns (bool);
    function balanceOf(address account) external view returns (uint256);
    function allowance(address owner, address spender) external view returns (uint256);
}

/// @title BearTrap
/// @author Bear Trap
/// @notice An ERC-7710 delegation puzzle game on Base. Players burn $OSO tokens to buy
///         guess tickets, then submit ZK proofs attempting to solve puzzles. The try/catch
///         pattern ensures ticket burns persist even on wrong guesses.
///
/// @dev Key design: tickets are decremented BEFORE the try block, so they persist even when
///      the ZKPEnforcer reverts on wrong answers. This creates an economic deterrent for
///      brute-force attempts.
///
///      Flow:
///      1. Player calls buyTickets() — $OSO transferred to burn address
///      2. Player generates ZK proof via Boundless (off-chain)
///      3. Player calls submitGuess() with delegation data including the proof
///      4. Contract decrements ticket count
///      5. try { delegationManager.redeemDelegations(...) }
///         - ZKPEnforcer validates proof in beforeHook
///         - If valid: NativeTokenTransferAmountEnforcer allows ETH transfer
///         - If invalid: ZKPEnforcer reverts → caught by catch
///      6. Success: PuzzleSolved event, winner recorded
///         Failure: WrongGuess event, ticket already consumed
contract BearTrap is IBearTrap {
    /// @notice The $OSO ERC20 token contract
    IERC20 public immutable osoToken;

    /// @notice The MetaMask Delegation Manager contract
    IDelegationManager public immutable delegationManager;

    /// @notice Price per ticket in $OSO tokens (in wei)
    uint256 public immutable ticketPrice;

    /// @notice Contract owner (can create puzzles)
    address public owner;

    /// @notice Burn address for $OSO tokens
    address public constant BURN_ADDRESS = 0x000000000000000000000000000000000000dEaD;

    /// @notice Number of guess tickets per player
    mapping(address => uint256) public tickets;

    /// @notice All puzzles
    mapping(uint256 => Puzzle) public puzzles;

    /// @notice Total number of puzzles created
    uint256 public puzzleCount;

    /// @dev Error thrown when caller is not the owner
    /// @param _osoToken Address of the $OSO ERC20 token
    /// @param _delegationManager Address of the MetaMask DelegationManager
    /// @param _ticketPrice Price per ticket in $OSO tokens (wei)
    constructor(
        IERC20 _osoToken,
        IDelegationManager _delegationManager,
        uint256 _ticketPrice
    ) {
        osoToken = _osoToken;
        delegationManager = _delegationManager;
        ticketPrice = _ticketPrice;
        owner = msg.sender;
    }

    /// @notice Buy guess tickets by burning $OSO tokens.
    /// @dev Transfers $OSO tokens to the burn address (0xdEaD). Requires prior ERC20 approval.
    /// @param amount Number of tickets to purchase
    function buyTickets(uint256 amount) external {
        if (amount == 0) revert ZeroAmount();

        uint256 cost = ticketPrice * amount;

        // Transfer $OSO to burn address — effectively burns them
        bool success = osoToken.transferFrom(msg.sender, BURN_ADDRESS, cost);
        require(success, "BearTrap: OSO transfer failed");

        tickets[msg.sender] += amount;

        emit TicketsPurchased(msg.sender, amount);
    }

    /// @notice Submit a guess attempt by redeeming a delegation with ZKP.
    /// @dev Critical: ticket is decremented BEFORE the try block so it persists on revert.
    ///      The delegation should include:
    ///        - ZKPEnforcer caveat with the proof in args
    ///        - NativeTokenTransferAmountEnforcer for the ETH prize
    ///        - LimitedCallsEnforcer to ensure only one winner
    /// @param _permissionContexts Encoded delegation data with ZKP in caveat args
    /// @param _modes ERC-7579 execution modes
    /// @param _executionCallDatas Encoded execution data (ETH transfer to solver)
    function submitGuess(
        bytes[] calldata _permissionContexts,
        ModeCode[] calldata _modes,
        bytes[] calldata _executionCallDatas
    ) external {
        // Require the player has at least one ticket
        if (tickets[msg.sender] == 0) revert NoTickets();

        // CRITICAL: Decrement ticket BEFORE try/catch
        // This ensures the ticket burn persists even if the delegation reverts
        tickets[msg.sender]--;

        // Attempt to redeem the delegation
        // If the ZKPEnforcer validates the proof, the delegation executes
        // (transferring ETH prize to the solver). If the proof is invalid,
        // the enforcer reverts and the catch block handles it.
        try delegationManager.redeemDelegations(
            _permissionContexts,
            _modes,
            _executionCallDatas
        ) {
            // Delegation redeemed successfully — puzzle is solved!
            // Note: In a full implementation, we'd extract the puzzle ID from
            // the delegation data. For now, we emit the event.
            emit PuzzleSolved(0, msg.sender);
        } catch {
            // Delegation failed — wrong guess or invalid proof
            // The ticket is already consumed above
            emit WrongGuess(0, msg.sender);
        }
    }

    /// @notice Create a new puzzle. Only callable by the contract owner.
    /// @param solutionHash SHA-256 hash of the puzzle solution
    /// @param prizeAmount ETH prize amount in wei
    /// @param clueURI URI pointing to puzzle clues (e.g., IPFS link)
    function createPuzzle(
        bytes32 solutionHash,
        uint256 prizeAmount,
        string calldata clueURI
    ) external {
        if (msg.sender != owner) revert NotOwner();

        uint256 puzzleId = puzzleCount++;

        puzzles[puzzleId] = Puzzle({
            solutionHash: solutionHash,
            prizeAmount: prizeAmount,
            winner: address(0),
            solved: false,
            clueURI: clueURI
        });

        emit PuzzleCreated(puzzleId, solutionHash, prizeAmount);
    }

    /// @notice Transfer ownership to a new address
    /// @param newOwner The new owner address
    function transferOwnership(address newOwner) external {
        if (msg.sender != owner) revert NotOwner();
        owner = newOwner;
    }

    /// @notice Receive ETH (for funding puzzles)
    receive() external payable {}
}
