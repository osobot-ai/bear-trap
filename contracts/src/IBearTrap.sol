// SPDX-License-Identifier: MIT
pragma solidity 0.8.23;

/// @title IBearTrap
/// @notice Interface for the Bear Trap puzzle game contract
interface IBearTrap {
    /// @notice Puzzle data structure
    struct Puzzle {
        uint256 prizeAmount;
        string clueURI;
        bool solved;
        address winner;
    }

    // -- Errors --

    /// @dev Error thrown when caller is not the owner
    error NotOwner();

    /// @dev Error thrown when caller is not the operator
    error NotOperator();

    /// @dev Error thrown when player has no tickets
    error NoTickets();

    /// @dev Error thrown when ticket amount is zero
    error ZeroAmount();

    /// @dev Error thrown when puzzle is already solved
    error AlreadySolved();

    /// @dev Error thrown when puzzle ID is invalid
    error InvalidPuzzleId();

    // -- Events --

    event TicketsPurchased(address indexed buyer, uint256 amount);

    /// @notice Emitted when a ticket is consumed by the operator
    event TicketUsed(uint256 indexed puzzleId, address indexed user, uint256 remainingTickets);

    /// @notice Emitted when a puzzle is solved
    event PuzzleSolved(uint256 indexed puzzleId, address indexed winner);

    /// @notice Emitted when a new puzzle is created
    event PuzzleCreated(uint256 indexed puzzleId, uint256 prizeAmount);

    // -- Functions --

    /// @notice Buy guess tickets by burning $OSO tokens
    /// @param amount Number of tickets to purchase
    function buyTickets(uint256 amount) external;

    /// @notice Consume a ticket for a guess attempt (operator only)
    /// @param user The player whose ticket to consume
    /// @param puzzleId The puzzle being attempted
    function useTicket(address user, uint256 puzzleId) external;

    /// @notice Mark a puzzle as solved (operator only)
    /// @param puzzleId The puzzle that was solved
    /// @param winner The address that solved it
    function markSolved(uint256 puzzleId, address winner) external;

    /// @notice Set the operator address (owner only)
    /// @param _operator The new operator address
    function setOperator(address _operator) external;

    /// @notice Create a new puzzle (owner only)
    /// @param prizeAmount ETH prize amount in wei
    /// @param clueURI URI pointing to puzzle clues
    function createPuzzle(uint256 prizeAmount, string calldata clueURI) external;

    /// @notice Get the number of tickets a player has
    function tickets(address player) external view returns (uint256);

    /// @notice Get the total number of puzzles
    function puzzleCount() external view returns (uint256);

    /// @notice Get a puzzle by ID
    function puzzles(uint256 puzzleId) external view returns (
        uint256 prizeAmount,
        string memory clueURI,
        bool solved,
        address winner
    );
}
