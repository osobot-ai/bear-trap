export const bearTrapAbi = [
  // -- Read functions --
  {
    type: "function",
    name: "BURN_ADDRESS",
    inputs: [],
    outputs: [{ name: "", type: "address", internalType: "address" }],
    stateMutability: "view",
  },
  {
    type: "function",
    name: "delegationManager",
    inputs: [],
    outputs: [
      {
        name: "",
        type: "address",
        internalType: "contract IDelegationManager",
      },
    ],
    stateMutability: "view",
  },
  {
    type: "function",
    name: "osoToken",
    inputs: [],
    outputs: [
      { name: "", type: "address", internalType: "contract IERC20" },
    ],
    stateMutability: "view",
  },
  {
    type: "function",
    name: "owner",
    inputs: [],
    outputs: [{ name: "", type: "address", internalType: "address" }],
    stateMutability: "view",
  },
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
      {
        name: "solutionHash",
        type: "bytes32",
        internalType: "bytes32",
      },
      {
        name: "prizeAmount",
        type: "uint256",
        internalType: "uint256",
      },
      { name: "winner", type: "address", internalType: "address" },
      { name: "solved", type: "bool", internalType: "bool" },
      { name: "clueURI", type: "string", internalType: "string" },
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
      {
        name: "_permissionContexts",
        type: "bytes[]",
        internalType: "bytes[]",
      },
      { name: "_modes", type: "bytes32[]", internalType: "ModeCode[]" },
      {
        name: "_executionCallDatas",
        type: "bytes[]",
        internalType: "bytes[]",
      },
    ],
    outputs: [],
    stateMutability: "nonpayable",
  },
  {
    type: "function",
    name: "createPuzzle",
    inputs: [
      {
        name: "solutionHash",
        type: "bytes32",
        internalType: "bytes32",
      },
      {
        name: "prizeAmount",
        type: "uint256",
        internalType: "uint256",
      },
      { name: "clueURI", type: "string", internalType: "string" },
    ],
    outputs: [],
    stateMutability: "nonpayable",
  },
  {
    type: "function",
    name: "transferOwnership",
    inputs: [
      { name: "newOwner", type: "address", internalType: "address" },
    ],
    outputs: [],
    stateMutability: "nonpayable",
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
        name: "solutionHash",
        type: "bytes32",
        indexed: false,
        internalType: "bytes32",
      },
      {
        name: "prizeAmount",
        type: "uint256",
        indexed: false,
        internalType: "uint256",
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
        name: "solver",
        type: "address",
        indexed: true,
        internalType: "address",
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
    name: "WrongGuess",
    inputs: [
      {
        name: "puzzleId",
        type: "uint256",
        indexed: true,
        internalType: "uint256",
      },
      {
        name: "guesser",
        type: "address",
        indexed: true,
        internalType: "address",
      },
    ],
    anonymous: false,
  },

  // -- Errors --
  {
    type: "error",
    name: "AlreadySolved",
    inputs: [],
  },
  {
    type: "error",
    name: "InvalidPuzzleId",
    inputs: [],
  },
  {
    type: "error",
    name: "NoTickets",
    inputs: [],
  },
  {
    type: "error",
    name: "NotOwner",
    inputs: [],
  },
  {
    type: "error",
    name: "ZeroAmount",
    inputs: [],
  },

  // -- Receive --
  {
    type: "receive",
    stateMutability: "payable",
  },
] as const;
