import type {
  CompileResult,
  CompileSettings,
  WorkerResponse,
} from "./types";
import { DEFAULT_SETTINGS } from "./types";

type Pending = {
  resolve: (r: CompileResult) => void;
  reject: (e: Error) => void;
  onProgress?: (stage: string) => void;
};

/**
 * Main-thread client for the classic soljson compiler worker (Mini §6.2).
 * The worker is a same-origin classic worker that importScripts the vendored
 * compiler; no compiler code runs on the main thread.
 */
export class CompilerClient {
  private worker: Worker | null = null;
  private seq = 0;
  private pending = new Map<number, Pending>();

  private ensureWorker(): Worker {
    if (this.worker) return this.worker;
    // Relative URL so it resolves under any base path; classic worker for importScripts.
    this.worker = new Worker("compiler-worker.js");
    this.worker.onmessage = (ev: MessageEvent<WorkerResponse>) =>
      this.handle(ev.data);
    this.worker.onerror = (ev) => {
      const err = new Error(ev.message || "Compiler worker error");
      for (const p of this.pending.values()) p.reject(err);
      this.pending.clear();
    };
    return this.worker;
  }

  private handle(msg: WorkerResponse): void {
    const p = this.pending.get(msg.id);
    if (!p) return;
    if (msg.type === "progress") {
      p.onProgress?.(msg.stage);
      return;
    }
    if (msg.type === "pong") {
      this.pending.delete(msg.id);
      p.resolve({ contracts: [], diagnostics: [], errorCount: 0, warningCount: 0 });
      return;
    }
    if (msg.type === "result") {
      this.pending.delete(msg.id);
      p.resolve(msg.result);
      return;
    }
    if (msg.type === "error") {
      this.pending.delete(msg.id);
      p.reject(new Error(msg.message));
      return;
    }
  }

  /** Load soljson and confirm it answers — used as the bootstrap readiness check. */
  ping(): Promise<void> {
    const worker = this.ensureWorker();
    const id = ++this.seq;
    return new Promise<void>((resolve, reject) => {
      this.pending.set(id, { resolve: () => resolve(), reject });
      worker.postMessage({ id, type: "ping" });
    });
  }

  compile(
    sources: Record<string, string>,
    settings: CompileSettings = DEFAULT_SETTINGS,
    onProgress?: (stage: string) => void,
  ): Promise<CompileResult> {
    const worker = this.ensureWorker();
    const id = ++this.seq;
    return new Promise<CompileResult>((resolve, reject) => {
      const pending: Pending = { resolve, reject };
      if (onProgress) pending.onProgress = onProgress;
      this.pending.set(id, pending);
      worker.postMessage({ id, type: "compile", sources, settings });
    });
  }

  dispose(): void {
    this.worker?.terminate();
    this.worker = null;
    this.pending.clear();
  }
}
