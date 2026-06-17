#!/usr/bin/env node
/**
 * vendor:icon (Mini §9.2)
 *
 * Fetches the QuantumCoin brand icon at BUILD TIME and writes it to
 * public/assets/icons/quantum-coin-icon.png (served same-origin). The canonical
 * URL is NEVER loaded at runtime.
 */
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const ICON_URL = "https://downloads.quantumcoin.org/quantum-coin-icon.png";
const OUT_DIR = join(root, "public", "assets", "icons");
const OUT_FILE = join(OUT_DIR, "quantum-coin-icon.png");
const SHA_FILE = join(root, "scripts", "icon-sha256.txt");

const sha256 = (buf) => createHash("sha256").update(buf).digest("hex");

function readPinnedHash() {
  if (!existsSync(SHA_FILE)) return null;
  for (const line of readFileSync(SHA_FILE, "utf8").split(/\r?\n/)) {
    const t = line.trim();
    if (!t || t.startsWith("#")) continue;
    const h = t.split(/\s+/)[0];
    if (/^[0-9a-f]{64}$/i.test(h)) return h.toLowerCase();
  }
  return null;
}

async function main() {
  if (existsSync(OUT_FILE)) {
    console.log("vendor:icon: already present — skipping download");
    return;
  }
  mkdirSync(OUT_DIR, { recursive: true });
  console.log(`vendor:icon: fetching ${ICON_URL} …`);
  try {
    const res = await fetch(ICON_URL, { redirect: "follow" });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const buf = Buffer.from(await res.arrayBuffer());
    const pinned = readPinnedHash();
    const h = sha256(buf);
    if (pinned && h !== pinned) {
      console.error(`vendor:icon FAILED — checksum mismatch\n  expected ${pinned}\n  got ${h}`);
      process.exit(1);
    }
    writeFileSync(OUT_FILE, buf);
    console.log(`vendor:icon: wrote ${OUT_FILE} (${buf.length} bytes, sha256 ${h})`);
  } catch (err) {
    // Non-fatal in dev: fall back to the bundled placeholder SVG favicon if present.
    console.warn(`vendor:icon: could not download icon (${err.message}).`);
    if (existsSync(join(OUT_DIR, "quantum-coin-icon.placeholder.png"))) {
      console.warn("  using committed placeholder.");
    } else {
      console.warn("  no placeholder available; favicon link may 404 until vendored.");
    }
  }
}

main();
