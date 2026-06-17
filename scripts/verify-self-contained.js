#!/usr/bin/env node
/**
 * verify:self-contained (Mini §13.1 / §13.3)
 *
 * Scans dist/ for references to external origins in HTML/JS/CSS. The build must
 * not fetch any application asset from a third-party host at runtime — in
 * particular it must never reference downloads.quantumcoin.org or any CDN.
 */
import { readFileSync, existsSync, readdirSync, statSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const dist = join(root, "dist");

// Forbidden external asset hosts (§13.1/§13.3). We flag hosts that would imply a
// runtime fetch of an APPLICATION ASSET from a third party (CDNs, font hosts) or
// the build-time-only icon host. Benign string literals such as the default RPC
// endpoint are NOT asset references and are intentionally not matched here.
const FORBIDDEN_HOSTS = [
  "downloads.quantumcoin.org", // §9.2: icon must be vendored, never runtime-fetched
  "cdn.jsdelivr.net",
  "unpkg.com",
  "esm.sh",
  "fonts.googleapis.com",
  "fonts.gstatic.com",
  "cdnjs.cloudflare.com",
];

const URL_RE = /\bhttps?:\/\/[^\s"'`)]+/gi;

let failed = false;
const fail = (msg) => {
  console.error(`  \u2717 ${msg}`);
  failed = true;
};

console.log("verify:self-contained");

if (!existsSync(dist)) {
  console.error("  \u2717 dist/ not found — run `npm run build` first");
  process.exit(1);
}

const files = walk(dist).filter((f) => /\.(html|js|css|map)$/.test(f));
for (const file of files) {
  const content = readFileSync(file, "utf8");
  const matches = content.match(URL_RE) || [];
  for (const url of matches) {
    const host = FORBIDDEN_HOSTS.find((h) => url.includes(h));
    if (host) {
      fail(`Forbidden external asset host "${host}" referenced in ${rel(file)}: ${url}`);
    }
  }

  // Defense-in-depth: catch external asset references regardless of host.
  for (const m of content.matchAll(/<(?:script|link)[^>]+(?:src|href)\s*=\s*["']https?:\/\/[^"']+/gi)) {
    fail(`External <script>/<link> asset reference in ${rel(file)}: ${m[0].slice(0, 120)}`);
  }
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
  console.error("verify:self-contained FAILED");
  process.exit(1);
}
console.log(`  \u2713 scanned ${files.length} files; no external asset references`);
console.log("verify:self-contained OK");
