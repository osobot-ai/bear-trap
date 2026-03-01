// SPDX-License-Identifier: MIT
pragma solidity 0.8.23;

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
///         guess tickets. The backend operator burns tickets on guess attempts and generates
///         ZK proofs. Users claim prizes by calling redeemDelegations on the DelegationManager
///         directly with the proof.
///
/// @dev Key design: solutionHash is NEVER stored on-chain (prevents free offline checking).
///      Tickets are tracked on-chain for transparency. The backend operator is the only
///      entity that can burn tickets via useTicket().
///
///      Flow:
///      1. Player calls buyTickets() — $OSO transferred to burn address
///      2. Player submits passphrase to backend API
///      3. Backend calls useTicket() to consume a ticket
///      4. Backend generates ZK proof via Boundless (expectedHash from server config)
///      5. If proof succeeds, frontend calls redeemDelegations() on DelegationManager
///      6. Backend calls markSolved() after confirming the redemption tx
contract BearTrap is IBearTrap {
    /// @notice The $OSO ERC20 token contract
    IERC20 public immutable osoToken;

    /// @notice Price per ticket in $OSO tokens (in wei)
    uint256 public immutable ticketPrice;

    /// @notice Contract owner (can create puzzles, set operator)
    address public owner;

    /// @notice Backend operator wallet (can call useTicket, markSolved)
    address public operator;

    /// @notice Burn address for $OSO tokens
    address public constant BURN_ADDRESS = 0x000000000000000000000000000000000000dEaD;

    /// @notice Number of guess tickets per player
    mapping(address => uint256) public tickets;

    /// @notice All puzzles
    mapping(uint256 => Puzzle) public puzzles;

    /// @notice Total number of puzzles created
    uint256 public puzzleCount;

    /// @param _osoToken Address of the $OSO ERC20 token
    /// @param _ticketPrice Price per ticket in $OSO tokens (wei)
    constructor(
        IERC20 _osoToken,
        uint256 _ticketPrice
    ) {
        osoToken = _osoToken;
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

    /// @notice Consume a ticket for a guess attempt. Only callable by operator.
    /// @param user The player whose ticket to consume
    /// @param puzzleId The puzzle being attempted
    function useTicket(address user, uint256 puzzleId) external {
        if (msg.sender != operator) revert NotOperator();
        if (puzzleId >= puzzleCount) revert InvalidPuzzleId();
        if (puzzles[puzzleId].solved) revert AlreadySolved();
        if (tickets[user] == 0) revert NoTickets();

        tickets[user]--;

        emit TicketUsed(puzzleId, user, tickets[user]);
    }

    /// @notice Mark a puzzle as solved with the winner's address. Only callable by operator.
    /// @dev Called by the backend after confirming the redeemDelegations tx succeeded.
    /// @param puzzleId The puzzle that was solved
    /// @param winner The address that solved it
    function markSolved(uint256 puzzleId, address winner) external {
        if (msg.sender != operator) revert NotOperator();
        if (puzzleId >= puzzleCount) revert InvalidPuzzleId();
        if (puzzles[puzzleId].solved) revert AlreadySolved();

        puzzles[puzzleId].solved = true;
        puzzles[puzzleId].winner = winner;

        emit PuzzleSolved(puzzleId, winner);
    }

    /// @notice Set the operator address. Only callable by owner.
    /// @param _operator The new operator address
    function setOperator(address _operator) external {
        if (msg.sender != owner) revert NotOwner();
        operator = _operator;
    }

    /// @notice Create a new puzzle. Only callable by the contract owner.
    /// @param prizeAmount ETH prize amount in wei
    /// @param clueURI URI pointing to puzzle clues (e.g., IPFS link)
    function createPuzzle(
        uint256 prizeAmount,
        string calldata clueURI
    ) external {
        if (msg.sender != owner) revert NotOwner();

        uint256 puzzleId = puzzleCount++;

        puzzles[puzzleId] = Puzzle({
            prizeAmount: prizeAmount,
            clueURI: clueURI,
            solved: false,
            winner: address(0)
        });

        emit PuzzleCreated(puzzleId, prizeAmount);
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
