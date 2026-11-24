function createAbortError() {
  const error = new Error('The request was aborted');
  error.name = 'AbortError';
  return error;
}

function createNetworkError(xhr, exception) {
  const status = Number.isInteger(xhr?.status) ? xhr.status : 0;
  const error = new Error(
    typeof exception === 'string' && exception
      ? `LAMPA request failed: ${exception}`
      : `LAMPA request failed with status ${status}`,
  );

  error.name = 'LampaNetworkError';
  error.status = status;

  return error;
}

/**
 * Creates a Fetch-compatible transport backed by Lampa.Reguest.
 *
 * The adapter intentionally accepts the request constructor as a dependency
 * so it can be tested without loading the LAMPA runtime.
 *
 * @param {Function} RequestConstructor Usually Lampa.Reguest
 * @returns {(url: string, options?: { signal?: AbortSignal }) => Promise<object>}
 */
export function createLampaFetch(RequestConstructor) {
  if (typeof RequestConstructor !== 'function') {
    throw new TypeError('RequestConstructor must be a constructor');
  }

  return function lampaFetch(url, options = {}) {
    const signal = options.signal;

    if (signal?.aborted) {
      return Promise.reject(createAbortError());
    }

    return new Promise((resolve, reject) => {
      const request = new RequestConstructor();
      let settled = false;

      const cleanup = () => {
        if (signal && typeof signal.removeEventListener === 'function') {
          signal.removeEventListener('abort', onAbort);
        }
      };

      const settle = (callback, value) => {
        if (settled) return;

        settled = true;
        cleanup();
        callback(value);
      };

      const onAbort = () => {
        if (settled) return;

        // Settle before clear(): the request wrapper may synchronously invoke
        // its error callback while cancelling the underlying XHR.
        settle(reject, createAbortError());
        request.clear();
      };

      if (signal && typeof signal.addEventListener === 'function') {
        signal.addEventListener('abort', onAbort, { once: true });
      }

      try {
        request.native(
          url,
          (body) => {
            const text = typeof body === 'string' ? body : String(body ?? '');

            settle(resolve, {
              ok: true,
              status: 200,
              text: async () => text,
              json: async () => JSON.parse(text),
            });
          },
          (xhr, exception) => {
            settle(reject, createNetworkError(xhr, exception));
          },
          null,
          { dataType: 'text' },
        );
      } catch (error) {
        settle(reject, error);
      }
    });
  };
}
