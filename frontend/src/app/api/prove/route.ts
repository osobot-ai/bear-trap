import { NextRequest, NextResponse } from "next/server";
import { exec } from "child_process";

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

    const binaryPath = process.env.PROVER_BINARY_PATH;
    if (!binaryPath) {
      return NextResponse.json(
        { error: "Server misconfiguration: PROVER_BINARY_PATH not set" },
        { status: 500 }
      );
    }

    // Build command with proper argument escaping
    const args = [
      `--guess "${body.passphrase.replace(/"/g, '\\"')}"`,
      `--solver-address "${body.solverAddress}"`,
      `--puzzle-id ${body.puzzleId}`,
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
            PRIVATE_KEY: process.env.PRIVATE_KEY,
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

            reject(
              new Error(
                `Proof generation failed: ${error.message}${stderr ? ` — ${stderr.slice(-500)}` : ""}`
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
