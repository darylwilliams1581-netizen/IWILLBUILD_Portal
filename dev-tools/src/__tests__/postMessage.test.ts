/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { safePostMessage, getTargetOrigin, isOriginAllowed } from '../utils/postMessage';

function makeEvent(origin: string): MessageEvent {
  return { origin } as MessageEvent;
}

function makeTargetWindow(postMessage: (message: unknown, origin: string) => void): Window {
  return { postMessage } as unknown as Window;
}

function withMockParent(mockParent: object, run: () => void): void {
  const original = window.parent;
  Object.defineProperty(window, 'parent', { value: mockParent, configurable: true });
  try {
    run();
  } finally {
    Object.defineProperty(window, 'parent', { value: original, configurable: true });
  }
}

function setReferrer(value: string): void {
  Object.defineProperty(document, 'referrer', { value, configurable: true });
}

describe('safePostMessage', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('forwards a cloneable payload verbatim to the target window', () => {
    const post = vi.fn();
    const target = makeTargetWindow(post);
    safePostMessage(target, { type: 'EDIT_WITH_AI', data: { className: 'card' } });
    expect(post).toHaveBeenCalledTimes(1);
    expect(post.mock.calls[0][0]).toEqual({ type: 'EDIT_WITH_AI', data: { className: 'card' } });
  });

  it('retries with a JSON-sanitized copy when the first attempt throws DataCloneError', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    let calls = 0;
    const post = vi.fn().mockImplementation((message: unknown) => {
      calls += 1;
      if (calls === 1) {
        const err = new DOMException('could not be cloned', 'DataCloneError');
        throw err;
      }
      return message;
    });
    const target = makeTargetWindow(post);
    // Date coerces to an ISO string through JSON round-trip; `undefined`
    // is dropped entirely. Both are observable, so the retry can't secretly
    // skip sanitization.
    const when = new Date('2026-04-28T12:00:00.000Z');
    safePostMessage(target, { type: 'EDIT_WITH_AI', when, skipped: undefined });
    expect(post).toHaveBeenCalledTimes(2);
    const retryPayload = post.mock.calls[1][0] as { type: string; when: unknown; skipped?: unknown };
    expect(retryPayload.type).toBe('EDIT_WITH_AI');
    expect(typeof retryPayload.when).toBe('string');
    expect(retryPayload.when).toBe('2026-04-28T12:00:00.000Z');
    expect('skipped' in retryPayload).toBe(false);
    expect(warn).toHaveBeenCalledWith(
      expect.stringContaining('JSON-sanitized'),
      'EDIT_WITH_AI',
    );
  });

  it('drops the payload with a warning when JSON sanitization also fails', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const post = vi.fn().mockImplementation(() => {
      throw new DOMException('could not be cloned', 'DataCloneError');
    });
    const target = makeTargetWindow(post);
    const circular: Record<string, unknown> = { type: 'CIRCULAR' };
    circular.self = circular;
    expect(() => safePostMessage(target, circular)).not.toThrow();
    expect(post).toHaveBeenCalledTimes(1);
    expect(warn).toHaveBeenCalledWith(
      expect.stringContaining('dropped postMessage'),
      'CIRCULAR',
      expect.any(Error),
    );
  });

  it('logs a SecurityError-specific warning when the JSON-sanitized retry is blocked by origin policy', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    let calls = 0;
    const post = vi.fn().mockImplementation(() => {
      calls += 1;
      if (calls === 1) {
        throw new DOMException('could not be cloned', 'DataCloneError');
      }
      // Retry blocked by cross-origin policy.
      throw new DOMException('blocked a frame with origin ...', 'SecurityError');
    });
    const target = makeTargetWindow(post);
    expect(() => safePostMessage(target, { type: 'EDIT_WITH_AI' })).not.toThrow();
    expect(post).toHaveBeenCalledTimes(2);
    const calledWith = warn.mock.calls.map(args => args[0] as string);
    expect(calledWith.some(msg => msg.includes('SecurityError on retry'))).toBe(true);
    expect(calledWith.some(msg => msg.includes('non-cloneable'))).toBe(false);
  });

  it('rethrows non-DataCloneError exceptions from postMessage', () => {
    const post = vi.fn().mockImplementation(() => {
      throw new DOMException('blocked a frame with origin ...', 'SecurityError');
    });
    const target = makeTargetWindow(post);
    expect(() => safePostMessage(target, { type: 'NOPE' })).toThrow(DOMException);
  });
});

describe('getTargetOrigin', () => {
  beforeEach(() => {
    setReferrer('');
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  afterEach(() => {
    setReferrer('');
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  it('prefers a GoDaddy-owned referrer over a stale/mismatched VITE_PARENT_ORIGIN', () => {
    vi.stubEnv('VITE_PARENT_ORIGIN', 'https://airo-builder.test-godaddy.com');
    setReferrer('https://pre-test-airo-builder.test-godaddy.com/develop/abc123');
    expect(getTargetOrigin()).toBe('https://pre-test-airo-builder.test-godaddy.com');
  });

  it('falls back to VITE_PARENT_ORIGIN when there is no referrer', () => {
    vi.stubEnv('VITE_PARENT_ORIGIN', 'https://airo-builder.godaddy.com');
    expect(getTargetOrigin()).toBe('https://airo-builder.godaddy.com');
  });

  it('falls back to VITE_PARENT_ORIGIN when the referrer is not a GoDaddy domain', () => {
    vi.stubEnv('VITE_PARENT_ORIGIN', 'https://airo-builder.godaddy.com');
    setReferrer('https://evil.example.com/');
    expect(getTargetOrigin()).toBe('https://airo-builder.godaddy.com');
  });

  it('falls back to wildcard with a warning when neither referrer nor VITE_PARENT_ORIGIN is available', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    vi.stubEnv('VITE_PARENT_ORIGIN', '');
    expect(getTargetOrigin()).toBe('*');
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('VITE_PARENT_ORIGIN not set'));
  });

  it('falls back to VITE_PARENT_ORIGIN when the referrer is not a parseable URL', () => {
    vi.stubEnv('VITE_PARENT_ORIGIN', 'https://airo-builder.godaddy.com');
    setReferrer('not a url');
    expect(getTargetOrigin()).toBe('https://airo-builder.godaddy.com');
  });

  it('rejects a same-origin referrer (in-iframe full navigation, not a real parent) and falls back to VITE_PARENT_ORIGIN', () => {
    vi.stubEnv('VITE_PARENT_ORIGIN', 'https://local.gasket.dev-godaddy.com:8443');
    vi.stubGlobal('location', { origin: 'https://local.gasket.dev-godaddy.com:5173' });
    setReferrer('https://local.gasket.dev-godaddy.com:5173/previous-page');
    expect(getTargetOrigin()).toBe('https://local.gasket.dev-godaddy.com:8443');
  });
});

describe('isOriginAllowed', () => {
  beforeEach(() => {
    vi.unstubAllEnvs();
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('dev mode rejects a non-GoDaddy origin', () => {
    vi.stubEnv('VITE_PARENT_ORIGIN', '');
    expect(isOriginAllowed(makeEvent('https://evil.example.com'))).toBe(false);
  });

  it('accepts a GoDaddy origin from the direct parent frame when it differs from the configured VITE_PARENT_ORIGIN', () => {
    vi.stubEnv('VITE_PARENT_ORIGIN', 'https://airo-builder.godaddy.com');
    const mockParent = {};
    withMockParent(mockParent, () => {
      const event = { origin: 'https://pre-test-airo-builder.test-godaddy.com', source: mockParent } as unknown as MessageEvent;
      expect(isOriginAllowed(event)).toBe(true);
    });
  });

  it('rejects a matching GoDaddy origin whose source is not the direct parent frame', () => {
    vi.stubEnv('VITE_PARENT_ORIGIN', 'https://airo-builder.godaddy.com');
    withMockParent({}, () => {
      const event = { origin: 'https://pre-test-airo-builder.test-godaddy.com', source: {} } as unknown as MessageEvent;
      expect(isOriginAllowed(event)).toBe(false);
    });
  });

  it('rejects a lookalike domain that is not actually GoDaddy-owned', () => {
    vi.stubEnv('VITE_PARENT_ORIGIN', 'https://airo-builder.godaddy.com');
    const mockParent = {};
    withMockParent(mockParent, () => {
      const event = { origin: 'https://godaddy.com.evil.com', source: mockParent } as unknown as MessageEvent;
      expect(isOriginAllowed(event)).toBe(false);
    });
  });
});
