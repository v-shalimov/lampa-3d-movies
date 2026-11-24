class FallbackAbortSignal {
  constructor() {
    this.aborted = false;
    this.reason = undefined;
    this.listeners = new Set();
  }

  addEventListener(type, listener, options = {}) {
    if (type !== 'abort' || typeof listener !== 'function' || this.aborted) return;
    this.listeners.add({ listener, once: options?.once === true });
  }

  removeEventListener(type, listener) {
    if (type !== 'abort') return;
    for (const entry of this.listeners) {
      if (entry.listener === listener) this.listeners.delete(entry);
    }
  }

  dispatchAbort() {
    for (const entry of [...this.listeners]) {
      entry.listener.call(this, { type: 'abort', target: this });
      if (entry.once) this.listeners.delete(entry);
    }
  }
}

class FallbackAbortController {
  constructor() {
    this.signal = new FallbackAbortSignal();
  }

  abort(reason) {
    if (this.signal.aborted) return;
    this.signal.aborted = true;
    this.signal.reason = reason;
    this.signal.dispatchAbort();
  }
}

/**
 * Uses the browser implementation when available and a minimal compatible
 * signal otherwise. The fallback covers the AbortSignal surface used by this
 * project; it does not implement DOM event dispatch in full.
 */
export function createAbortController() {
  if (typeof AbortController === 'function') {
    return new AbortController();
  }

  return new FallbackAbortController();
}
