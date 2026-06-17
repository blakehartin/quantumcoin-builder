/* eslint-disable @typescript-eslint/no-explicit-any */
import { createInterface, encodeFunctionData, hashId } from "./sdk";

export interface AbiParam {
  name: string;
  type: string;
}

export interface AbiFunctionInfo {
  name: string;
  inputs: AbiParam[];
  outputs: AbiParam[];
  selector: string;
  stateMutability: string;
  kind: "read" | "write";
}

export interface AbiEventInfo {
  name: string;
  signature: string;
  topic0: string;
}

export interface AbiCatalog {
  read: AbiFunctionInfo[];
  write: AbiFunctionInfo[];
  events: AbiEventInfo[];
  iface: any;
}

function params(list: any[] | undefined): AbiParam[] {
  if (!list) return [];
  return list.map((p: any, i: number) => ({
    name: p?.name || `arg${i}`,
    type: typeof p?.type === "string" ? p.type : String(p?.type ?? "?"),
  }));
}

/** Canonical type for signatures: expands tuples to `(t1,t2)` and keeps array suffixes. */
function canonicalType(p: any): string {
  const type: string = p?.type ?? "";
  if (type.startsWith("tuple")) {
    const inner = (p.components ?? []).map(canonicalType).join(",");
    const suffix = type.slice("tuple".length); // e.g. "", "[]", "[2]"
    return `(${inner})${suffix}`;
  }
  return type;
}

function signatureOf(name: string, inputs: any[]): string {
  return `${name}(${(inputs ?? []).map(canonicalType).join(",")})`;
}

function selectorOf(name: string, inputs: any[]): string {
  try {
    return hashId(signatureOf(name, inputs)).slice(0, 10); // 0x + 4 bytes
  } catch {
    return "";
  }
}

function topic0Of(name: string, inputs: any[]): string {
  try {
    return hashId(signatureOf(name, inputs)); // full 32-byte topic
  } catch {
    return "";
  }
}

/**
 * Build a normalized read/write/event catalog from a compiled ABI using the
 * SDK `Interface` (Mini §7.1). Works with the ethers v6-compatible surface.
 */
export function buildCatalog(abi: unknown[]): AbiCatalog {
  // `createInterface` validates the ABI through the SDK and provides the encoder.
  const iface = createInterface(abi);
  const read: AbiFunctionInfo[] = [];
  const write: AbiFunctionInfo[] = [];
  const events: AbiEventInfo[] = [];

  const fragments = (Array.isArray(abi) ? abi : []) as any[];
  for (const f of fragments) {
    if (!f || typeof f !== "object") continue;

    if (f.type === "function") {
      const mutability: string = f.stateMutability || "nonpayable";
      const kind: "read" | "write" =
        mutability === "view" || mutability === "pure" ? "read" : "write";
      const info: AbiFunctionInfo = {
        name: f.name,
        inputs: params(f.inputs),
        outputs: params(f.outputs),
        selector: selectorOf(f.name, f.inputs),
        stateMutability: mutability,
        kind,
      };
      (kind === "read" ? read : write).push(info);
    } else if (f.type === "event") {
      events.push({
        name: f.name,
        signature: signatureOf(f.name, f.inputs),
        topic0: topic0Of(f.name, f.inputs),
      });
    }
  }

  return { read, write, events, iface };
}

/** Light argument coercion for local calldata preview (MVP scope). */
export function coerceArg(type: string, raw: string): unknown {
  if (type === "bool") return raw.trim() === "true";
  if (/^u?int/.test(type)) return raw.trim();
  return raw;
}

export function encodeCall(
  catalog: AbiCatalog,
  name: string,
  rawArgs: { type: string; value: string }[],
): string {
  const args = rawArgs.map((a) => coerceArg(a.type, a.value));
  return encodeFunctionData(catalog.iface, name, args);
}
