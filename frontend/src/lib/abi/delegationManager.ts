export const delegationManagerAbi = [
  {
    type: "function",
    name: "redeemDelegations",
    inputs: [
      {
        name: "_permissionContexts",
        type: "bytes[]",
        internalType: "bytes[]",
      },
      {
        name: "_modes",
        type: "bytes32[]",
        internalType: "ModeCode[]",
      },
      {
        name: "_executionCallDatas",
        type: "bytes[]",
        internalType: "bytes[]",
      },
    ],
    outputs: [],
    stateMutability: "nonpayable",
  },
] as const;
