export const bearTrapAbi = [
  // -- Read functions --
  {
    type: "function",
    name: "puzzleCount",
    inputs: [],
    outputs: [{ name: "", type: "uint256", internalType: "uint256" }],
    stateMutability: "view",
  },
  {
    type: "function",
    name: "puzzles",
    inputs: [{ name: "puzzleId", type: "uint256", internalType: "uint256" }],
    outputs: [
      { name: "creator", type: "address", internalType: "address" },
      { name: "prize", type: "uint256", internalType: "uint256" },
      { name: "clueURI", type: "string", internalType: "string" },
      { name: "solutionHash", type: "bytes32", internalType: "bytes32" },
      { name: "solved", type: "bool", internalType: "bool" },
      { name: "winner", type: "address", internalType: "address" },
    ],
    stateMutability: "view",
  },
  {
    type: "function",
    name: "tickets",
    inputs: [{ name: "player", type: "address", internalType: "address" }],
    outputs: [{ name: "", type: "uint256", internalType: "uint256" }],
    stateMutability: "view",
  },
  {
    type: "function",
    name: "ticketPrice",
    inputs: [],
    outputs: [{ name: "", type: "uint256", internalType: "uint256" }],
    stateMutability: "view",
  },

  // -- Write functions --
  {
    type: "function",
    name: "buyTickets",
    inputs: [{ name: "amount", type: "uint256", internalType: "uint256" }],
    outputs: [],
    stateMutability: "nonpayable",
  },
  {
    type: "function",
    name: "submitGuess",
    inputs: [
      { name: "puzzleId", type: "uint256", internalType: "uint256" },
      { name: "seal", type: "bytes", internalType: "bytes" },
      { name: "journalDigest", type: "bytes32", internalType: "bytes32" },
    ],
    outputs: [],
    stateMutability: "nonpayable",
  },
  {
    type: "function",
    name: "createPuzzle",
    inputs: [
      { name: "clueURI", type: "string", internalType: "string" },
      { name: "solutionHash", type: "bytes32", internalType: "bytes32" },
    ],
    outputs: [{ name: "puzzleId", type: "uint256", internalType: "uint256" }],
    stateMutability: "payable",
  },

  // -- Events --
  {
    type: "event",
    name: "PuzzleCreated",
    inputs: [
      {
        name: "puzzleId",
        type: "uint256",
        indexed: true,
        internalType: "uint256",
      },
      {
        name: "creator",
        type: "address",
        indexed: true,
        internalType: "address",
      },
      {
        name: "prize",
        type: "uint256",
        indexed: false,
        internalType: "uint256",
      },
    ],
    anonymous: false,
  },
  {
    type: "event",
    name: "TicketsPurchased",
    inputs: [
      {
        name: "buyer",
        type: "address",
        indexed: true,
        internalType: "address",
      },
      {
        name: "amount",
        type: "uint256",
        indexed: false,
        internalType: "uint256",
      },
    ],
    anonymous: false,
  },
  {
    type: "event",
    name: "GuessSubmitted",
    inputs: [
      {
        name: "player",
        type: "address",
        indexed: true,
        internalType: "address",
      },
      {
        name: "puzzleId",
        type: "uint256",
        indexed: true,
        internalType: "uint256",
      },
      {
        name: "correct",
        type: "bool",
        indexed: false,
        internalType: "bool",
      },
    ],
    anonymous: false,
  },
  {
    type: "event",
    name: "PuzzleSolved",
    inputs: [
      {
        name: "puzzleId",
        type: "uint256",
        indexed: true,
        internalType: "uint256",
      },
      {
        name: "winner",
        type: "address",
        indexed: true,
        internalType: "address",
      },
      {
        name: "prize",
        type: "uint256",
        indexed: false,
        internalType: "uint256",
      },
    ],
    anonymous: false,
  },
] as const;
