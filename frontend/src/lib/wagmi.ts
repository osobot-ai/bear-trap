import { createConfig } from "wagmi";
import { http } from "viem";
import { base, baseSepolia } from "viem/chains";
import { getDefaultConfig } from "connectkit";
import { ACTIVE_ENV } from "@/lib/contracts";

const chain = ACTIVE_ENV === "mainnet" ? base : baseSepolia;
const transport =
  ACTIVE_ENV === "mainnet"
    ? http("https://mainnet.base.org")
    : http("https://sepolia.base.org");

export const config = createConfig(
  getDefaultConfig({
    chains: [chain],
    transports: {
      [chain.id]: transport,
    },
    walletConnectProjectId:
      process.env.NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID ?? "",
    appName: "Bear Trap",
    appDescription: "ERC-7710 Puzzle Game with ZK Proof Verification",
    appUrl: "https://beartrap.xyz",
  })
);
