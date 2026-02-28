import { createConfig, http } from "wagmi";
import { base } from "wagmi/chains";
import { getDefaultConfig } from "connectkit";

export const config = createConfig(
  getDefaultConfig({
    chains: [base],
    transports: {
      [base.id]: http("https://mainnet.base.org"),
    },
    walletConnectProjectId:
      process.env.NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID ?? "",
    appName: "Bear Trap",
    appDescription: "ERC-7710 Puzzle Game with ZK Proof Verification",
    appUrl: "https://beartrap.xyz",
  })
);

declare module "wagmi" {
  interface Register {
    config: typeof config;
  }
}
