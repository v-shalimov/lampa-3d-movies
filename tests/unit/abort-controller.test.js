import { afterEach, describe, expect, it, vi } from 'vitest';
import { createAbortController } from '../../src/utils/abort-controller.js';

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('createAbortController', () => {
  it('uses the native AbortController when available', () => {
    const controller = createAbortController();

    expect(controller).toBeInstanceOf(AbortController);
    expect(controller.signal.aborted).toBe(false);
  });

  it('provides abort and listener semantics when the native API is unavailable', () => {
    vi.stubGlobal('AbortController', undefined);
    const controller = createAbortController();
    const listener = vi.fn();

    controller.signal.addEventListener('abort', listener, { once: true });
    controller.abort('cancelled');

    expect(controller.signal.aborted).toBe(true);
    expect(controller.signal.reason).toBe('cancelled');
    expect(listener).toHaveBeenCalledOnce();
    expect(listener).toHaveBeenCalledWith({
      type: 'abort',
      target: controller.signal,
    });

    controller.abort('second reason');
    expect(listener).toHaveBeenCalledOnce();
  });

  it('supports removing an abort listener before cancellation', () => {
    vi.stubGlobal('AbortController', undefined);
    const controller = createAbortController();
    const listener = vi.fn();

    controller.signal.addEventListener('abort', listener);
    controller.signal.removeEventListener('abort', listener);
    controller.abort();

    expect(listener).not.toHaveBeenCalled();
  });
});
