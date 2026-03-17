// Type declarations for packages with broken/missing .d.ts exports
// These packages work at runtime but fail strict TypeScript type checking
// due to .d.cts / ESM resolution issues in @tanstack/query v5 and wagmi v2

declare module "@tanstack/react-query" {
  export class QueryClient {
    constructor(config?: {
      defaultOptions?: {
        queries?: {
          staleTime?: number;
          refetchOnWindowFocus?: boolean;
          enabled?: boolean;
          [key: string]: unknown;
        };
        [key: string]: unknown;
      };
    });
    invalidateQueries(filters?: { queryKey?: readonly unknown[] }): Promise<void>;
  }

  export function QueryClientProvider(props: {
    client: QueryClient;
    children: React.ReactNode;
  }): React.JSX.Element;

  export function useQueryClient(): QueryClient;
}

declare module "wagmi" {
  import type { ReactNode } from "react";

  export interface Config {
    [key: string]: unknown;
  }

  export function WagmiProvider(props: {
    config: Config;
    children: ReactNode;
  }): React.JSX.Element;

  export function useAccount(): {
    address: `0x${string}` | undefined;
    isConnected: boolean;
    chain?: { id: number };
  };


  export function useDisconnect(): {
    disconnect: () => void;
    isPending: boolean;
  };
  export function useReadContract(config: {
    address: `0x${string}`;
    abi: readonly any[];
    functionName: string;
    args?: readonly any[];
    chainId?: number;
    query?: { enabled?: boolean; staleTime?: number };
  }): {
    data: any;
    isLoading: boolean;
    isError: boolean;
    refetch: () => Promise<any>;
  };

  export function useReadContracts(config: {
    contracts: readonly {
      address: `0x${string}`;
      abi: readonly any[];
      functionName: string;
      args?: readonly any[];
      chainId?: number;
    }[];
    query?: { enabled?: boolean };
  }): {
    data:
      | readonly { status: string; result: any }[]
      | undefined;
    isLoading: boolean;
  };

  export function useWriteContract(): {
    data: `0x${string}` | undefined;
    writeContract: (config: {
      address: `0x${string}`;
      abi: readonly any[];
      functionName: string;
      args?: readonly any[];
      chainId?: number;
    }) => void;
    isPending: boolean;
    error: Error | null;
  };

  export function useSendTransaction(): {
    data: `0x${string}` | undefined;
    sendTransaction: (config: {
      to: `0x${string}`;
      data?: `0x${string}`;
      value?: bigint;
      chainId?: number;
    }) => void;
    isPending: boolean;
    error: Error | null;
  };

  export function useWaitForTransactionReceipt(config: {
    hash: `0x${string}` | undefined;
  }): {
    isLoading: boolean;
    isSuccess: boolean;
  };

  export function useSignMessage(): {
    signMessage: (config: { message: string }) => void;
    signMessageAsync: (config: { message: string }) => Promise<`0x${string}`>;
    data: `0x${string}` | undefined;
    isPending: boolean;
    error: Error | null;
  };

  export function usePublicClient(config?: {
    chainId?: number;
  }): {
    getBlockNumber: () => Promise<bigint>;
    getLogs: (config: {
      address: `0x${string}`;
      event: any;
      fromBlock: bigint | string;
      toBlock: bigint | string;
    }) => Promise<
      {
        args: any;
        blockNumber: bigint;
        transactionHash: string;
      }[]
    >;
  } | undefined;

  export function createConfig(config: unknown): Config;

  export interface Register {
    config: unknown;
  }
}

declare module "wagmi/chains" {
  export const base: {
    id: number;
    name: string;
    [key: string]: unknown;
  };
}

declare module "@web3auth/modal/react" {
  import type { ReactNode } from "react";

  export interface Web3AuthContextConfig {
    web3AuthOptions: any;
  }

  export function Web3AuthProvider(props: {
    config: Web3AuthContextConfig;
    children: ReactNode;
  }): React.JSX.Element;

  export function useWeb3AuthConnect(): {
    connect: () => Promise<void>;
    loading: boolean;
  };
}

declare module "@web3auth/modal/react/wagmi" {
  import type { ReactNode } from "react";

  export function WagmiProvider(props: {
    children: ReactNode;
  }): React.JSX.Element;
}

declare module "@web3auth/modal" {
  export enum WEB3AUTH_NETWORK {
    SAPPHIRE_DEVNET = "sapphire_devnet",
    SAPPHIRE_MAINNET = "sapphire_mainnet",
  }

  export interface Web3AuthOptions {
    clientId: string;
    web3AuthNetwork: WEB3AUTH_NETWORK;
  }
}
