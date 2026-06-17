#!/usr/bin/env node
/**
 * vendor:compiler (Mini §6.1.1)
 *
 * Fetches the pinned QuantumCoin Solidity 7.6 compiler release asset (soljson.js)
 * at BUILD TIME and writes it to public/assets/compilers/soljson-v32b.8.12.js so
 * it is served same-origin. Never fetched at runtime.
 *
 * If scripts/compiler-sha256.txt contains a real hash (not the placeholder), the
 * downloaded file is verified against it and the build fails on mismatch.
 */
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const RELEASE_URL =
  "https://github.com/quantumcoinproject/Solidity/releases/download/v32b.8.12/soljson.js";
const OUT_DIR = join(root, "public", "assets", "compilers");
const OUT_FILE = join(OUT_DIR, "soljson-v32b.8.12.js");
const SHA_FILE = join(root, "scripts", "compiler-sha256.txt");

const sha256 = (buf) => createHash("sha256").update(buf).digest("hex");

function readPinnedHash() {
  if (!existsSync(SHA_FILE)) return null;
  const lines = readFileSync(SHA_FILE, "utf8").split(/\r?\n/);
  for (const line of lines) {
    const t = line.trim();
    if (!t || t.startsWith("#")) continue;
    const hash = t.split(/\s+/)[0];
    if (/^[0-9a-f]{64}$/i.test(hash)) return hash.toLowerCase();
  }
  return null;
}

async function main() {
  const pinned = readPinnedHash();

  if (existsSync(OUT_FILE)) {
    const existing = readFileSync(OUT_FILE);
    const h = sha256(existing);
    if (pinned && h !== pinned) {
      console.error(`vendor:compiler FAILED — existing file hash ${h} != pinned ${pinned}`);
      process.exit(1);
    }
    console.log(`vendor:compiler: already present (${(existing.length / 1e6).toFixed(1)} MB) — skipping download`);
    return;
  }

  mkdirSync(OUT_DIR, { recursive: true });
  console.log(`vendor:compiler: fetching ${RELEASE_URL} …`);

  let buf;
  try {
    const res = await fetch(RELEASE_URL, { redirect: "follow" });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    buf = Buffer.from(await res.arrayBuffer());
  } catch (err) {
    console.error(`vendor:compiler FAILED — could not download compiler: ${err.message}`);
    console.error("  (network access is required at build time; the asset is never fetched at runtime)");
    process.exit(1);
  }

  const h = sha256(buf);
  if (pinned) {
    if (h !== pinned) {
      console.error(`vendor:compiler FAILED — checksum mismatch\n  expected ${pinned}\n  got      ${h}`);
      process.exit(1);
    }
    console.log(`vendor:compiler: checksum verified (${h})`);
  } else {
    console.warn(`vendor:compiler: no pinned checksum found. Computed SHA-256:\n  ${h}`);
    console.warn(`  Add this to scripts/compiler-sha256.txt to enable the CI integrity gate.`);
  }

  writeFileSync(OUT_FILE, buf);
  console.log(`vendor:compiler: wrote ${OUT_FILE} (${(buf.length / 1e6).toFixed(1)} MB)`);
}

main();
