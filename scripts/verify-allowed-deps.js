#!/usr/bin/env node
/**
 * verify:allowed-deps (Mini §1.7 / §13.3)
 *
 * Fails (exit 1) if package.json `dependencies` contains anything other than the
 * two allowed QuantumCoin SDK packages. Also scans built JS for known forbidden
 * package signatures as a defense-in-depth check.
 *
 * NB: the repo/brand is "quantumcoin.js" but the npm package id is "quantumcoin".
 */
import { readFileSync, existsSync, readdirSync, statSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const ALLOWED = ["quantumcoin", "quantum-coin-js-sdk"];
const FORBIDDEN_SIGNATURES = [
  "monaco-editor",
  "codemirror",
  "ace-builds",
  "ethers",
  "web3",
  "hardhat",
  "jszip",
  "file-saver",
];

let failed = false;
const fail = (msg) => {
  console.error(`  \u2717 ${msg}`);
  failed = true;
};
const ok = (msg) => console.log(`  \u2713 ${msg}`);

console.log("verify:allowed-deps");

const pkg = JSON.parse(readFileSync(join(root, "package.json"), "utf8"));
const deps = Object.keys(pkg.dependencies ?? {});

const extra = deps.filter((d) => !ALLOWED.includes(d));
if (extra.length) {
  fail(`Forbidden runtime dependencies: ${extra.join(", ")}`);
} else {
  ok(`dependencies are limited to: ${deps.join(", ") || "(none)"}`);
}

const missing = ALLOWED.filter((a) => !deps.includes(a));
if (missing.length) {
  // Not a hard failure for the policy, but worth surfacing.
  console.warn(`  ! expected SDK packages not listed: ${missing.join(", ")}`);
}

// Optional: scan dist for forbidden package strings.
const distAssets = join(root, "dist", "assets");
if (existsSync(distAssets)) {
  const jsFiles = walk(distAssets).filter((f) => f.endsWith(".js"));
  for (const file of jsFiles) {
    const content = readFileSync(file, "utf8");
    for (const sig of FORBIDDEN_SIGNATURES) {
      if (content.includes(`node_modules/${sig}`) || content.includes(`"${sig}"`)) {
        fail(`Built asset references forbidden package "${sig}": ${rel(file)}`);
      }
    }
  }
  ok("scanned dist/assets for forbidden package signatures");
} else {
  console.log("  - dist/ not built yet; skipping bundle scan");
}

function walk(dir) {
  const out = [];
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) out.push(...walk(p));
    else out.push(p);
  }
  return out;
}
function rel(p) {
  return p.slice(root.length + 1);
}

if (failed) {
  console.error("verify:allowed-deps FAILED");
  process.exit(1);
}
console.log("verify:allowed-deps OK");
