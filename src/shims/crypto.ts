/*
 * Minimal browser shim for Node's `crypto`, scoped to what `quantumcoin` and
 * `quantum-coin-js-sdk` touch in the browser (Mini self-containment policy — no
 * third-party dependency):
 *
 *  - getHashes(): []      -> routes the SDK's keccak256 through its bundled pure-JS
 *                            Keccak (used for ABI function selectors / event topics).
 *  - createHash('sha256') -> first-party pure-JS SHA-256, required by the SDK's WASM
 *                            integrity check during Initialize().
 *  - randomBytes()        -> Web Crypto CSPRNG.
 *
 * Other Node-crypto APIs (HMAC, pbkdf2, scrypt) are wallet/key paths Mini never
 * exercises and throw a clear error if called.
 */

export function getHashes(): string[] {
  return [];
}

export function randomBytes(size: number): Uint8Array {
  const out = new Uint8Array(size);
  globalThis.crypto.getRandomValues(out);
  return out;
}

// ---- Pure-JS SHA-256 ----

const K = new Uint32Array([
  0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5,
  0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174,
  0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
  0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967,
  0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85,
  0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
  0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3,
  0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2,
]);

function rotr(x: number, n: number): number {
  return (x >>> n) | (x << (32 - n));
}

function sha256Bytes(msg: Uint8Array): Uint8Array {
  const H = new Uint32Array([
    0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a, 0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19,
  ]);

  const bitLen = msg.length * 8;
  const withPad = ((msg.length + 8) >> 6) + 1;
  const buf = new Uint8Array(withPad * 64);
  buf.set(msg);
  buf[msg.length] = 0x80;
  // 64-bit big-endian length (high word is 0 for our sizes).
  const dv = new DataView(buf.buffer);
  dv.setUint32(buf.length - 4, bitLen >>> 0, false);
  dv.setUint32(buf.length - 8, Math.floor(bitLen / 0x100000000), false);

  const w = new Uint32Array(64);
  for (let off = 0; off < buf.length; off += 64) {
    for (let i = 0; i < 16; i++) w[i] = dv.getUint32(off + i * 4, false);
    for (let i = 16; i < 64; i++) {
      const s0 = rotr(w[i - 15]!, 7) ^ rotr(w[i - 15]!, 18) ^ (w[i - 15]! >>> 3);
      const s1 = rotr(w[i - 2]!, 17) ^ rotr(w[i - 2]!, 19) ^ (w[i - 2]! >>> 10);
      w[i] = (w[i - 16]! + s0 + w[i - 7]! + s1) >>> 0;
    }
    let [a, b, c, d, e, f, g, h] = H;
    for (let i = 0; i < 64; i++) {
      const S1 = rotr(e!, 6) ^ rotr(e!, 11) ^ rotr(e!, 25);
      const ch = (e! & f!) ^ (~e! & g!);
      const t1 = (h! + S1 + ch + K[i]! + w[i]!) >>> 0;
      const S0 = rotr(a!, 2) ^ rotr(a!, 13) ^ rotr(a!, 22);
      const maj = (a! & b!) ^ (a! & c!) ^ (b! & c!);
      const t2 = (S0 + maj) >>> 0;
      h = g; g = f; f = e; e = (d! + t1) >>> 0; d = c; c = b; b = a; a = (t1 + t2) >>> 0;
    }
    H[0] = (H[0]! + a!) >>> 0; H[1] = (H[1]! + b!) >>> 0; H[2] = (H[2]! + c!) >>> 0; H[3] = (H[3]! + d!) >>> 0;
    H[4] = (H[4]! + e!) >>> 0; H[5] = (H[5]! + f!) >>> 0; H[6] = (H[6]! + g!) >>> 0; H[7] = (H[7]! + h!) >>> 0;
  }

  const out = new Uint8Array(32);
  new DataView(out.buffer);
  for (let i = 0; i < 8; i++) {
    out[i * 4] = (H[i]! >>> 24) & 0xff;
    out[i * 4 + 1] = (H[i]! >>> 16) & 0xff;
    out[i * 4 + 2] = (H[i]! >>> 8) & 0xff;
    out[i * 4 + 3] = H[i]! & 0xff;
  }
  return out;
}

function toBytes(data: unknown): Uint8Array {
  if (data instanceof Uint8Array) return data;
  if (typeof data === "string") return new globalThis.TextEncoder().encode(data);
  if (data && typeof (data as ArrayBufferView).byteLength === "number") {
    const v = data as ArrayBufferView;
    return new Uint8Array(v.buffer, v.byteOffset, v.byteLength);
  }
  throw new Error("Unsupported data for hashing");
}

function toHex(bytes: Uint8Array): string {
  let s = "";
  for (let i = 0; i < bytes.length; i++) s += bytes[i]!.toString(16).padStart(2, "0");
  return s;
}

class Hash {
  private algo: string;
  private chunks: Uint8Array[] = [];
  constructor(algo: string) {
    this.algo = algo.toLowerCase();
  }
  update(data: unknown): this {
    this.chunks.push(toBytes(data));
    return this;
  }
  private digestBytes(): Uint8Array {
    const total = this.chunks.reduce((n, c) => n + c.length, 0);
    const merged = new Uint8Array(total);
    let o = 0;
    for (const c of this.chunks) {
      merged.set(c, o);
      o += c.length;
    }
    if (this.algo === "sha256" || this.algo === "sha-256") return sha256Bytes(merged);
    throw new Error(`crypto digest '${this.algo}' is not available in the browser build`);
  }
  digest(encoding?: string): Uint8Array | string {
    const bytes = this.digestBytes();
    return encoding === "hex" ? toHex(bytes) : bytes;
  }
}

export function createHash(algo: string): Hash {
  return new Hash(algo);
}

function unsupported(name: string): never {
  throw new Error(
    `crypto.${name} is not available in the browser build (wallet/key paths Mini does not exercise)`,
  );
}
export function createHmac(): never {
  return unsupported("createHmac");
}
export function pbkdf2Sync(): never {
  return unsupported("pbkdf2Sync");
}
export function scrypt(): never {
  return unsupported("scrypt");
}
export function scryptSync(): never {
  return unsupported("scryptSync");
}

export default { getHashes, randomBytes, createHash, createHmac, pbkdf2Sync, scrypt, scryptSync };
