// Minimal first-party pub/sub store (no Redux — Mini policy / parent Appendix O).

import type { CompileResult } from "../compiler/types";

export interface AppState {
  lastResult: CompileResult | null;
  selectedContract: string | null;
  pragmaOk: boolean;
}

type Listener = (state: AppState) => void;

export class Store {
  private state: AppState = {
    lastResult: null,
    selectedContract: null,
    pragmaOk: true,
  };
  private listeners = new Set<Listener>();

  get(): AppState {
    return this.state;
  }

  set(patch: Partial<AppState>): void {
    this.state = { ...this.state, ...patch };
    for (const l of this.listeners) l(this.state);
  }

  subscribe(l: Listener): () => void {
    this.listeners.add(l);
    return () => this.listeners.delete(l);
  }
}
