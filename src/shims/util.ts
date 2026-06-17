/*
 * Minimal browser shim for Node's `util`. `quantumcoin` only pulls TextEncoder /
 * TextDecoder from it; both are standard Web Platform globals in the browser.
 */
export const TextEncoder = globalThis.TextEncoder;
export const TextDecoder = globalThis.TextDecoder;

export function inherits(ctor: any, superCtor: any): void {
  ctor.super_ = superCtor;
  Object.setPrototypeOf(ctor.prototype, superCtor.prototype);
}

export default { TextEncoder, TextDecoder, inherits };
