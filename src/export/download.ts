/*
 * Client-side downloads (Mini §8). Uses Blob URLs only — no server upload.
 */
import { createZip, textEntry, type ZipEntry } from "./zip";
import type { CompiledContract } from "../compiler/types";

function triggerDownload(filename: string, blob: Blob): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  // Revoke on next tick to let the download start.
  setTimeout(() => URL.revokeObjectURL(url), 0);
}

export function downloadText(filename: string, content: string, mime = "text/plain"): void {
  triggerDownload(filename, new Blob([content], { type: mime }));
}

export function downloadHex(contractName: string, kind: "creation" | "runtime", hex: string): string {
  const filename = `${contractName}.${kind}.bytecode.hex`;
  downloadText(filename, hex, "text/plain");
  return filename;
}

export function downloadAbiJson(contractName: string, abi: unknown[]): string {
  const filename = `${contractName}.abi.json`;
  downloadText(filename, JSON.stringify(abi, null, 2), "application/json");
  return filename;
}

export function downloadMetadataJson(contractName: string, metadata: string): string {
  const filename = `${contractName}.metadata.json`;
  downloadText(filename, metadata || "{}", "application/json");
  return filename;
}

/** Bundle ABI + both bytecode files (+ metadata) into a single ZIP (Mini §8.2). */
export function downloadArtifactsZip(
  contract: CompiledContract,
  includeMetadata = true,
): string {
  const name = contract.contractName;
  const entries: ZipEntry[] = [
    textEntry(`${name}.abi.json`, JSON.stringify(contract.abi, null, 2)),
    textEntry(`${name}.creation.bytecode.hex`, contract.bytecode),
    textEntry(`${name}.runtime.bytecode.hex`, contract.deployedBytecode),
  ];
  if (includeMetadata && contract.metadata) {
    entries.push(textEntry(`${name}.metadata.json`, contract.metadata));
  }
  const filename = `${name}-artifacts.zip`;
  triggerDownload(filename, createZip(entries));
  return filename;
}

export async function copyToClipboard(text: string): Promise<void> {
  if (navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(text);
    return;
  }
  // Fallback for non-secure contexts.
  const ta = document.createElement("textarea");
  ta.value = text;
  ta.style.position = "fixed";
  ta.style.opacity = "0";
  document.body.appendChild(ta);
  ta.select();
  document.execCommand("copy");
  ta.remove();
}
