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

  export function useReadContract(config: {
    address: `0x${string}`;
    abi: readonly any[];
    functionName: string;
    args?: readonly any[];
    chainId?: number;
    query?: { enabled?: boolean };
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

  export function useWaitForTransactionReceipt(config: {
    hash: `0x${string}` | undefined;
  }): {
    isLoading: boolean;
    isSuccess: boolean;
  };

  export function usePublicClient(config?: {
    chainId?: number;
  }): {
    getLogs: (config: {
      address: `0x${string}`;
      event: any;
      fromBlock: string;
      toBlock: string;
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

declare module "connectkit" {
  import type { ReactNode } from "react";

  export function ConnectKitProvider(props: {
    theme?: string;
    customTheme?: Record<string, string>;
    children: ReactNode;
  }): React.JSX.Element;

  export const ConnectKitButton: {
    Custom: (props: {
      children: (renderProps: {
        isConnected: boolean;
        show: (() => void) | undefined;
        truncatedAddress: string | undefined;
        ensName: string | undefined;
      }) => React.ReactNode;
    }) => React.JSX.Element;
  };

  export function getDefaultConfig(config: {
    chains: readonly unknown[];
    transports: Record<number, unknown>;
    walletConnectProjectId: string;
    appName: string;
    appDescription?: string;
    appUrl?: string;
  }): unknown;
}
