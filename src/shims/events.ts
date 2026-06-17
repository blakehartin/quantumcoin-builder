/*
 * Minimal browser shim for Node's `events` (Mini self-containment policy).
 *
 * `quantumcoin` providers do `class Provider extends EventEmitter`, so the class
 * must exist for the module to evaluate. Mini never opens a provider, so this only
 * needs to be a structurally valid EventEmitter — no first-party dependency.
 */
type Handler = (...args: unknown[]) => void;

export class EventEmitter {
  private handlers = new Map<string, Set<Handler>>();

  on(event: string, fn: Handler): this {
    let set = this.handlers.get(event);
    if (!set) this.handlers.set(event, (set = new Set()));
    set.add(fn);
    return this;
  }
  addListener(event: string, fn: Handler): this {
    return this.on(event, fn);
  }
  once(event: string, fn: Handler): this {
    const wrap: Handler = (...args) => {
      this.off(event, wrap);
      fn(...args);
    };
    return this.on(event, wrap);
  }
  off(event: string, fn: Handler): this {
    this.handlers.get(event)?.delete(fn);
    return this;
  }
  removeListener(event: string, fn: Handler): this {
    return this.off(event, fn);
  }
  removeAllListeners(event?: string): this {
    if (event) this.handlers.delete(event);
    else this.handlers.clear();
    return this;
  }
  emit(event: string, ...args: unknown[]): boolean {
    const set = this.handlers.get(event);
    if (!set || set.size === 0) return false;
    for (const fn of [...set]) fn(...args);
    return true;
  }
  listenerCount(event: string): number {
    return this.handlers.get(event)?.size ?? 0;
  }
  listeners(event: string): Handler[] {
    return [...(this.handlers.get(event) ?? [])];
  }
}

export default EventEmitter;
