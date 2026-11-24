import { describe, expect, it, vi } from 'vitest';
import { createLampaFetch } from '../../src/lampa/lampa-fetch.js';

describe('createLampaFetch', () => {
  it('adapts Lampa.Reguest native text responses to the Fetch response contract', async () => {
    const native = vi.fn((url, success) => success('<rss/>'));
    const Request = vi.fn(function Request() {
      this.native = native;
      this.timeout = vi.fn();
      this.clear = vi.fn();
    });

    const fetch = createLampaFetch(Request);
    const response = await fetch('https://indexer.example/api?t=search');

    expect(Request.mock.instances[0].timeout).toHaveBeenCalledWith(20_000);
    expect(native).toHaveBeenCalledWith(
      'https://indexer.example/api?t=search',
      expect.any(Function),
      expect.any(Function),
      null,
      { dataType: 'text' },
    );
    expect(response.ok).toBe(true);
    expect(response.status).toBe(200);
    await expect(response.text()).resolves.toBe('<rss/>');
  });

  it('rejects immediately when the signal is already aborted', async () => {
    const Request = vi.fn();
    const controller = new AbortController();
    controller.abort();

    const fetch = createLampaFetch(Request);

    await expect(fetch('https://indexer.example/api', {
      signal: controller.signal,
    })).rejects.toMatchObject({ name: 'AbortError' });
    expect(Request).not.toHaveBeenCalled();
  });

  it('suppresses late LAMPA callbacks and rejects when aborted in flight', async () => {
    let onSuccess;
    const request = {
      native: vi.fn((url, success) => { onSuccess = success; }),
      clear: vi.fn(),
    };
    const Request = vi.fn(function Request() { return request; });
    const controller = new AbortController();
    const fetch = createLampaFetch(Request);
    const pending = fetch('https://indexer.example/api', {
      signal: controller.signal,
    });

    controller.abort();

    await expect(pending).rejects.toMatchObject({ name: 'AbortError' });
    expect(request.clear).toHaveBeenCalledOnce();

    // A late callback after abort must not settle the promise again.
    onSuccess?.('<rss/>');
  });

  it('converts Lampa request failures into rejected promises', async () => {
    const Request = vi.fn(function Request() {
      this.native = (url, success, failure) => failure({ status: 503 }, 'error');
      this.clear = vi.fn();
    });
    const fetch = createLampaFetch(Request);

    await expect(fetch('https://indexer.example/api')).rejects.toMatchObject({
      name: 'LampaNetworkError',
      status: 503,
    });
  });

  it('adapts JSON responses for the Jackett provider', async () => {
    const Request = vi.fn(function Request() {
      this.native = (url, success) => success('{"Results":[]}');
      this.clear = vi.fn();
    });
    const fetch = createLampaFetch(Request);
    const response = await fetch('https://jackett.example/api');

    await expect(response.json()).resolves.toEqual({ Results: [] });
  });

  it('rejects if the request constructor is missing', () => {
    expect(() => createLampaFetch()).toThrow(TypeError);
  });
});
