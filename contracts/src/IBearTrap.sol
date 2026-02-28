// SPDX-License-Identifier: MIT
pragma solidity 0.8.23;

import {ModeCode} from "delegation-framework/utils/Types.sol";

/// @title IBearTrap
/// @notice Interface for the Bear Trap puzzle game contract
interface IBearTrap {
    /// @notice Puzzle data structure
    struct Puzzle {
        bytes32 solutionHash;
        uint256 prizeAmount;
        address winner;
        bool solved;
        string clueURI;
    }

    /// @notice Emitted when a player buys tickets
    /// @dev Error thrown when caller is not the owner
    error NotOwner();

    /// @dev Error thrown when player has no tickets
    error NoTickets();

    /// @dev Error thrown when ticket amount is zero
    error ZeroAmount();

    /// @dev Error thrown when puzzle is already solved
    error AlreadySolved();

    /// @dev Error thrown when puzzle ID is invalid
    error InvalidPuzzleId();

    event TicketsPurchased(address indexed buyer, uint256 amount);

    /// @notice Emitted when a puzzle is solved
    event PuzzleSolved(uint256 indexed puzzleId, address indexed solver);

    /// @notice Emitted when a wrong guess is made (delegation reverts, ticket still burned)
    event WrongGuess(uint256 indexed puzzleId, address indexed guesser);

    /// @notice Emitted when a new puzzle is created
    event PuzzleCreated(uint256 indexed puzzleId, bytes32 solutionHash, uint256 prizeAmount);

    /// @notice Buy guess tickets by burning $OSO tokens
    /// @param amount Number of tickets to purchase
    function buyTickets(uint256 amount) external;

    /// @notice Submit a guess attempt by redeeming a delegation with ZKP
    /// @param _permissionContexts Encoded delegation data with ZKP in caveat args
    /// @param _modes ERC-7579 execution modes
    /// @param _executionCallDatas Encoded execution data (ETH transfer to solver)
    function submitGuess(
        bytes[] calldata _permissionContexts,
        ModeCode[] calldata _modes,
        bytes[] calldata _executionCallDatas
    ) external;

    /// @notice Create a new puzzle (owner only)
    /// @param solutionHash SHA-256 hash of the puzzle solution
    /// @param prizeAmount ETH prize amount in wei
    /// @param clueURI URI pointing to puzzle clues
    function createPuzzle(bytes32 solutionHash, uint256 prizeAmount, string calldata clueURI) external;

    /// @notice Get the number of tickets a player has
    function tickets(address player) external view returns (uint256);

    /// @notice Get the total number of puzzles
    function puzzleCount() external view returns (uint256);

    /// @notice Get a puzzle by ID
    function puzzles(uint256 puzzleId) external view returns (
        bytes32 solutionHash,
        uint256 prizeAmount,
        address winner,
        bool solved,
        string memory clueURI
    );
}
