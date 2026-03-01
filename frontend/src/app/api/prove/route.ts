import { NextRequest, NextResponse } from "next/server";
import { exec } from "child_process";
import {
  createWalletClient,
  createPublicClient,
  http,
  type Hex,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { base } from "viem/chains";
import { bearTrapAbi } from "@/lib/abi/bearTrap";

interface ProveRequest {
  passphrase: string;
  solverAddress: string;
  puzzleId: number;
}

interface ProveResult {
  seal: string;
  journal: string;
  solverAddress: string;
  solutionHash: string;
}

// Proof generation can take several minutes via Boundless
const PROOF_TIMEOUT_MS = 10 * 60 * 1000; // 10 minutes

/**
 * Load puzzle answers from PUZZLE_ANSWERS env var.
 * Format: JSON object mapping puzzleId (string) to answer hash (0x-prefixed hex string).
 * Example: {"0":"0xabcdef...","1":"0x123456..."}
 */
function getPuzzleAnswerHash(puzzleId: number): string | null {
  const answersJson = process.env.PUZZLE_ANSWERS;
  if (!answersJson) return null;

  try {
    const answers = JSON.parse(answersJson) as Record<string, string>;
    return answers[String(puzzleId)] ?? null;
  } catch {
    console.error("[prove] Failed to parse PUZZLE_ANSWERS env var");
    return null;
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as ProveRequest;

    // Validate request
    if (!body.passphrase || typeof body.passphrase !== "string") {
      return NextResponse.json(
        { error: "passphrase is required and must be a string" },
        { status: 400 }
      );
    }

    if (!body.solverAddress || typeof body.solverAddress !== "string") {
      return NextResponse.json(
        { error: "solverAddress is required and must be a string" },
        { status: 400 }
      );
    }

    if (body.puzzleId === undefined || typeof body.puzzleId !== "number") {
      return NextResponse.json(
        { error: "puzzleId is required and must be a number" },
        { status: 400 }
      );
    }

    // Validate server configuration
    const binaryPath = process.env.PROVER_BINARY_PATH;
    if (!binaryPath) {
      return NextResponse.json(
        { error: "Server misconfiguration: PROVER_BINARY_PATH not set" },
        { status: 500 }
      );
    }

    const operatorKey = process.env.OPERATOR_PRIVATE_KEY;
    if (!operatorKey) {
      return NextResponse.json(
        { error: "Server misconfiguration: OPERATOR_PRIVATE_KEY not set" },
        { status: 500 }
      );
    }

    const rpcUrl = process.env.RPC_URL;
    if (!rpcUrl) {
      return NextResponse.json(
        { error: "Server misconfiguration: RPC_URL not set" },
        { status: 500 }
      );
    }

    const bearTrapAddress = process.env.NEXT_PUBLIC_BEAR_TRAP_ADDRESS as Hex;
    if (!bearTrapAddress) {
      return NextResponse.json(
        { error: "Server misconfiguration: NEXT_PUBLIC_BEAR_TRAP_ADDRESS not set" },
        { status: 500 }
      );
    }

    // Look up the correct answer hash from server-side config
    const expectedHash = getPuzzleAnswerHash(body.puzzleId);
    if (!expectedHash) {
      return NextResponse.json(
        { error: `No answer configured for puzzle ${body.puzzleId}` },
        { status: 400 }
      );
    }

    // Step 1: Verify puzzle exists and isn't solved, then burn ticket via useTicket
    const account = privateKeyToAccount(operatorKey as Hex);

    const publicClient = createPublicClient({
      chain: base,
      transport: http(rpcUrl),
    });

    const walletClient = createWalletClient({
      account,
      chain: base,
      transport: http(rpcUrl),
    });

    // Verify puzzle state on-chain
    const puzzle = await publicClient.readContract({
      address: bearTrapAddress,
      abi: bearTrapAbi,
      functionName: "puzzles",
      args: [BigInt(body.puzzleId)],
    });

    // puzzle returns (uint256 prizeAmount, string clueURI, bool solved, address winner)
    const puzzleSolved = puzzle[2];
    if (puzzleSolved) {
      return NextResponse.json(
        { error: "This puzzle has already been solved" },
        { status: 400 }
      );
    }

    // Call useTicket on-chain (burns one ticket for the solver)
    console.log(`[prove] Calling useTicket for ${body.solverAddress} on puzzle ${body.puzzleId}`);
    const useTicketHash = await walletClient.writeContract({
      address: bearTrapAddress,
      abi: bearTrapAbi,
      functionName: "useTicket",
      args: [body.solverAddress as Hex, BigInt(body.puzzleId)],
    });

    // Wait for useTicket tx to confirm
    console.log(`[prove] Waiting for useTicket tx: ${useTicketHash}`);
    const useTicketReceipt = await publicClient.waitForTransactionReceipt({
      hash: useTicketHash,
    });

    if (useTicketReceipt.status !== "success") {
      return NextResponse.json(
        { error: "Failed to consume ticket on-chain" },
        { status: 500 }
      );
    }
    console.log("[prove] Ticket consumed successfully");

    // Step 2: Call the Rust binary to generate ZK proof
    const args = [
      `--guess "${body.passphrase.replace(/"/g, '\\"')}"`,
      `--solver-address "${body.solverAddress}"`,
      `--expected-hash "${expectedHash}"`,
    ].join(" ");

    const command = `${binaryPath} ${args}`;

    // Execute the Rust binary with timeout
    const result = await new Promise<ProveResult>((resolve, reject) => {
      const child = exec(
        command,
        {
          timeout: PROOF_TIMEOUT_MS,
          env: {
            ...process.env,
            // Ensure required env vars are forwarded
            RPC_URL: process.env.RPC_URL,
            PRIVATE_KEY: process.env.BOUNDLESS_PRIVATE_KEY,
            PINATA_JWT: process.env.PINATA_JWT,
          },
          maxBuffer: 10 * 1024 * 1024, // 10MB buffer for large proofs
        },
        (error, stdout, stderr) => {
          if (error) {
            // Log stderr for debugging
            if (stderr) {
              console.error("[prove] stderr:", stderr);
            }

            if (error.killed) {
              reject(
                new Error(
                  "Proof generation timed out. This can happen if the Boundless network is congested. Please try again."
                )
              );
              return;
            }

            // If proof generation fails, the guess was wrong
            reject(
              new Error(
                "Wrong guess. Your ticket has been consumed."
              )
            );
            return;
          }

          // Log informational stderr output
          if (stderr) {
            console.log("[prove] info:", stderr);
          }

          try {
            const parsed = JSON.parse(stdout.trim()) as ProveResult;

            // Validate required fields
            if (!parsed.seal || !parsed.journal || !parsed.solverAddress || !parsed.solutionHash) {
              reject(new Error("Invalid proof output: missing required fields"));
              return;
            }

            resolve(parsed);
          } catch {
            reject(
              new Error(
                `Failed to parse proof output: ${stdout.slice(0, 200)}`
              )
            );
          }
        }
      );

      // Handle child process errors
      child.on("error", (err) => {
        reject(new Error(`Failed to start prover: ${err.message}`));
      });
    });

    return NextResponse.json(result);
  } catch (err) {
    const message =
      err instanceof Error ? err.message : "An unknown error occurred";
    console.error("[prove] error:", message);

    return NextResponse.json({ error: message }, { status: 500 });
  }
}
