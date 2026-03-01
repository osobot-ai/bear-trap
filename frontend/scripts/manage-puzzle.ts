#!/usr/bin/env tsx
/**
 * manage-puzzle.ts — CLI script for managing Bear Trap puzzles in the SQLite database.
 *
 * Usage:
 *   npx tsx scripts/manage-puzzle.ts init
 *   npx tsx scripts/manage-puzzle.ts create --answer "secret passphrase" --prize "1.0" --delegation '{"chain":...}'
 *   npx tsx scripts/manage-puzzle.ts update --id 0 --prize "2.0" --delegation '{"chain":...}'
 *   npx tsx scripts/manage-puzzle.ts list
 */

import Database from "better-sqlite3";
import { createHash } from "crypto";
import path from "path";
import fs from "fs";

const DB_DIR = path.resolve(__dirname, "..", "..", "data");
const DB_PATH = path.join(DB_DIR, "puzzles.db");

function getDb(): Database.Database {
  // Ensure data/ directory exists
  if (!fs.existsSync(DB_DIR)) {
    fs.mkdirSync(DB_DIR, { recursive: true });
  }
  return new Database(DB_PATH);
}

function sha256Hex(input: string): string {
  return "0x" + createHash("sha256").update(input).digest("hex");
}

// ==================== Commands ====================

function initDb(): void {
  const db = getDb();
  db.exec(`
    CREATE TABLE IF NOT EXISTS puzzles (
      id INTEGER PRIMARY KEY,
      solution_hash TEXT NOT NULL,
      answer TEXT,
      prize_eth TEXT NOT NULL,
      delegation TEXT NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );
  `);
  db.close();
  console.log(`Database initialized at ${DB_PATH}`);
}

function createPuzzle(answer: string, prizeEth: string, delegation: string): void {
  const db = getDb();

  // Ensure table exists
  db.exec(`
    CREATE TABLE IF NOT EXISTS puzzles (
      id INTEGER PRIMARY KEY,
      solution_hash TEXT NOT NULL,
      answer TEXT,
      prize_eth TEXT NOT NULL,
      delegation TEXT NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );
  `);

  const solutionHash = sha256Hex(answer);

  // Get next ID (matches on-chain puzzleId which is 0-indexed)
  const maxRow = db.prepare("SELECT MAX(id) as maxId FROM puzzles").get() as { maxId: number | null };
  const nextId = maxRow.maxId !== null ? maxRow.maxId + 1 : 0;

  db.prepare(
    "INSERT INTO puzzles (id, solution_hash, answer, prize_eth, delegation) VALUES (?, ?, ?, ?, ?)"
  ).run(nextId, solutionHash, answer, prizeEth, delegation);

  db.close();

  console.log(`Puzzle created:`);
  console.log(`  ID:            ${nextId}`);
  console.log(`  Solution Hash: ${solutionHash}`);
  console.log(`  Prize:         ${prizeEth} ETH`);
  console.log(`  Answer:        ${answer}`);
}

function updatePuzzle(id: number, prizeEth?: string, delegation?: string): void {
  const db = getDb();

  const existing = db.prepare("SELECT * FROM puzzles WHERE id = ?").get(id);
  if (!existing) {
    console.error(`Error: No puzzle found with id ${id}`);
    db.close();
    process.exit(1);
  }

  const updates: string[] = [];
  const params: (string | number)[] = [];

  if (prizeEth !== undefined) {
    updates.push("prize_eth = ?");
    params.push(prizeEth);
  }
  if (delegation !== undefined) {
    updates.push("delegation = ?");
    params.push(delegation);
  }

  if (updates.length === 0) {
    console.error("Error: Nothing to update. Provide --prize and/or --delegation");
    db.close();
    process.exit(1);
  }

  updates.push("updated_at = CURRENT_TIMESTAMP");
  params.push(id);

  db.prepare(`UPDATE puzzles SET ${updates.join(", ")} WHERE id = ?`).run(...params);
  db.close();

  console.log(`Puzzle ${id} updated successfully`);
}

interface PuzzleListRow {
  id: number;
  prize_eth: string;
  solution_hash: string;
  created_at: string;
}

function listPuzzles(): void {
  const db = getDb();

  // Check if table exists
  const tableCheck = db.prepare(
    "SELECT name FROM sqlite_master WHERE type='table' AND name='puzzles'"
  ).get();

  if (!tableCheck) {
    console.log("No puzzles table found. Run 'init' first.");
    db.close();
    return;
  }

  const rows = db.prepare("SELECT id, prize_eth, solution_hash, created_at FROM puzzles ORDER BY id").all() as PuzzleListRow[];
  db.close();

  if (rows.length === 0) {
    console.log("No puzzles found.");
    return;
  }

  console.log(`\nPuzzles (${rows.length} total):\n`);
  console.log("  ID  | Prize (ETH) | Hash (first 16)      | Created");
  console.log("  --- | ----------- | -------------------- | -------------------");

  for (const row of rows) {
    const hashShort = row.solution_hash.slice(0, 18) + "...";
    console.log(
      `  ${String(row.id).padEnd(3)} | ${row.prize_eth.padEnd(11)} | ${hashShort.padEnd(20)} | ${row.created_at}`
    );
  }
  console.log("");
}

// ==================== CLI Arg Parsing ====================

function parseArgs(argv: string[]): { command: string; flags: Record<string, string> } {
  const args = argv.slice(2); // Skip node + script path
  const command = args[0] || "";
  const flags: Record<string, string> = {};

  for (let i = 1; i < args.length; i++) {
    if (args[i].startsWith("--")) {
      const key = args[i].slice(2);
      const value = args[i + 1];
      if (value && !value.startsWith("--")) {
        flags[key] = value;
        i++; // skip next
      }
    }
  }

  return { command, flags };
}

// ==================== Main ====================

const { command, flags } = parseArgs(process.argv);

switch (command) {
  case "init":
    initDb();
    break;

  case "create":
    if (!flags.answer) {
      console.error("Error: --answer is required");
      console.error('Usage: npx tsx scripts/manage-puzzle.ts create --answer "secret" --prize "1.0" --delegation \'{"chain":...}\'');
      process.exit(1);
    }
    if (!flags.prize) {
      console.error("Error: --prize is required");
      process.exit(1);
    }
    if (!flags.delegation) {
      console.error("Error: --delegation is required");
      process.exit(1);
    }
    createPuzzle(flags.answer, flags.prize, flags.delegation);
    break;

  case "update":
    if (!flags.id) {
      console.error("Error: --id is required");
      console.error('Usage: npx tsx scripts/manage-puzzle.ts update --id 0 --prize "2.0" --delegation \'{"chain":...}\'');
      process.exit(1);
    }
    updatePuzzle(Number(flags.id), flags.prize, flags.delegation);
    break;

  case "list":
    listPuzzles();
    break;

  default:
    console.log("Bear Trap Puzzle Manager");
    console.log("");
    console.log("Commands:");
    console.log("  init     Initialize the database (create table if not exists)");
    console.log('  create   Create a new puzzle  --answer "..." --prize "1.0" --delegation \'...\'');
    console.log('  update   Update a puzzle      --id 0 [--prize "2.0"] [--delegation \'...\']');
    console.log("  list     List all puzzles");
    console.log("");
    console.log("Usage:");
    console.log("  npx tsx scripts/manage-puzzle.ts <command> [flags]");
    process.exit(command ? 1 : 0);
}
