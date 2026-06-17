/*
 * Minimal browser shim for Node's `net`. `quantumcoin` references it only inside
 * IPC provider methods, which Mini never invokes (no live RPC). The export must
 * exist so the providers module evaluates; calling it surfaces a clear error.
 */
export function createConnection(): never {
  throw new Error("net.createConnection is not available in the browser build");
}

export class Socket {}

export default { createConnection, Socket };
