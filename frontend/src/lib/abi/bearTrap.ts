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
    name: "operator",
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
        name: "prizeAmount",
        type: "uint256",
        internalType: "uint256",
      },
      { name: "clueURI", type: "string", internalType: "string" },
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
    name: "useTicket",
    inputs: [
      { name: "user", type: "address", internalType: "address" },
      { name: "puzzleId", type: "uint256", internalType: "uint256" },
    ],
    outputs: [],
    stateMutability: "nonpayable",
  },
  {
    type: "function",
    name: "markSolved",
    inputs: [
      { name: "puzzleId", type: "uint256", internalType: "uint256" },
      { name: "winner", type: "address", internalType: "address" },
    ],
    outputs: [],
    stateMutability: "nonpayable",
  },
  {
    type: "function",
    name: "setOperator",
    inputs: [
      { name: "_operator", type: "address", internalType: "address" },
    ],
    outputs: [],
    stateMutability: "nonpayable",
  },
  {
    type: "function",
    name: "createPuzzle",
    inputs: [
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
        name: "winner",
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
    name: "TicketUsed",
    inputs: [
      {
        name: "puzzleId",
        type: "uint256",
        indexed: true,
        internalType: "uint256",
      },
      {
        name: "user",
        type: "address",
        indexed: true,
        internalType: "address",
      },
      {
        name: "remainingTickets",
        type: "uint256",
        indexed: false,
        internalType: "uint256",
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
    name: "NotOperator",
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
