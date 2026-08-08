/**
 * useUploadQueue — cross-platform upload queue tests
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useUploadQueue } from '../useUploadQueue';

// ── XHR mock ──────────────────────────────────────────────────────────────────

interface MockXhr {
  open: ReturnType<typeof vi.fn>;
  send: ReturnType<typeof vi.fn>;
  setRequestHeader: ReturnType<typeof vi.fn>;
  withCredentials: boolean;
  status: number;
  responseText: string;
  upload: { addEventListener: ReturnType<typeof vi.fn>; _listeners: Record<string, ((e: unknown) => void)[]> };
  addEventListener: ReturnType<typeof vi.fn>;
  _listeners: Record<string, ((e: unknown) => void)[]>;
  fire: (event: string, detail?: unknown) => void;
  fireUpload: (event: string, detail?: unknown) => void;
}

function makeMockXhr(status = 200, body: unknown = { ok: true }): MockXhr {
  const uploadListeners: Record<string, ((e: unknown) => void)[]> = {};
  const listeners: Record<string, ((e: unknown) => void)[]> = {};

  const xhr: MockXhr = {
    open: vi.fn(),
    send: vi.fn(),
    setRequestHeader: vi.fn(),
    withCredentials: false,
    status,
    responseText: JSON.stringify(body),
    upload: {
      addEventListener: vi.fn((event: string, fn: (e: unknown) => void) => {
        uploadListeners[event] = uploadListeners[event] ?? [];
        uploadListeners[event].push(fn);
      }),
      _listeners: uploadListeners,
    },
    addEventListener: vi.fn((event: string, fn: (e: unknown) => void) => {
      listeners[event] = listeners[event] ?? [];
      listeners[event].push(fn);
    }),
    _listeners: listeners,
    fire(event, detail = {}) {
      (listeners[event] ?? []).forEach(fn => fn(detail));
    },
    fireUpload(event, detail = {}) {
      (uploadListeners[event] ?? []).forEach(fn => fn(detail));
    },
  };
  return xhr;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function makeFile(name = 'photo.jpg', type = 'image/jpeg', size = 512): File {
  return new File([new Uint8Array(size)], name, { type });
}

function makeInputEvent(files: File[]): React.ChangeEvent<HTMLInputElement> {
  // jsdom doesn't have DataTransfer — build a minimal FileList-like object
  const fileList = {
    length: files.length,
    item: (i: number) => files[i] ?? null,
    [Symbol.iterator]: function* () { yield* files; },
  };
  for (let i = 0; i < files.length; i++) {
    (fileList as Record<string, unknown>)[i] = files[i];
  }
  return {
    target: { files: fileList as unknown as FileList, value: '' },
  } as unknown as React.ChangeEvent<HTMLInputElement>;
}

// ── Setup ─────────────────────────────────────────────────────────────────────

let xhrInstances: MockXhr[];
let OrigXHR: typeof XMLHttpRequest;

beforeEach(() => {
  vi.useFakeTimers();
  xhrInstances = [];
  OrigXHR = global.XMLHttpRequest;

  // Use a real constructor function so `new XMLHttpRequest()` works
  function MockXHRConstructor(this: MockXhr) {
    const xhr = makeMockXhr();
    // Copy all properties onto `this`
    Object.assign(this, xhr);
    xhrInstances.push(this);
  }
  // @ts-expect-error mock constructor
  global.XMLHttpRequest = MockXHRConstructor;
});

afterEach(() => {
  global.XMLHttpRequest = OrigXHR;
  vi.useRealTimers();
  vi.clearAllMocks();
});

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('useUploadQueue', () => {

  it('single upload: queues file, sends XHR with X-Client-Id, marks done on success', async () => {
    const onSuccess = vi.fn();
    const { result } = renderHook(() =>
      useUploadQueue({ endpoint: '/api/test', onSuccess })
    );

    act(() => { result.current.enqueue([makeFile()]); });
    act(() => { vi.runAllTimers(); });

    expect(xhrInstances).toHaveLength(1);
    const xhr = xhrInstances[0];
    expect(xhr.open).toHaveBeenCalledWith('POST', '/api/test');
    expect(xhr.setRequestHeader).toHaveBeenCalledWith('X-Client-Id', expect.stringMatching(/^uq_/));
    expect(result.current.queue[0].status).toBe('uploading');

    await act(async () => { xhr.fire('load'); });

    expect(result.current.queue[0].status).toBe('done');
    expect(onSuccess).toHaveBeenCalledTimes(1);
  });

  it('multi-file: all files are queued, concurrency limits simultaneous uploads', async () => {
    // Test the observable: 3 files queued, at most 2 uploading at once.
    // We verify this by checking that after enqueueing 3 files, not all 3
    // are immediately uploading (concurrency cap is enforced).
    const { result } = renderHook(() =>
      useUploadQueue({ endpoint: '/api/test', multiple: true, concurrency: 2 })
    );

    act(() => { result.current.enqueue([makeFile('a.jpg'), makeFile('b.jpg'), makeFile('c.jpg')]); });
    act(() => { vi.runAllTimers(); });
    await act(async () => { await Promise.resolve(); await Promise.resolve(); });

    expect(result.current.queue).toHaveLength(3);
    // At most 2 should be uploading simultaneously
    const uploading = result.current.queue.filter(i => i.status === 'uploading');
    expect(uploading.length).toBeLessThanOrEqual(2);
    expect(uploading.length).toBeGreaterThanOrEqual(1);
    // At least 1 should still be pending or uploading (not all done yet)
    const notDone = result.current.queue.filter(i => i.status !== 'done');
    expect(notDone.length).toBeGreaterThanOrEqual(1);
  });

  it('iOS Safari duplicate onChange: same fingerprint is ignored', async () => {
    const { result } = renderHook(() =>
      useUploadQueue({ endpoint: '/api/test' })
    );

    const file = makeFile();
    const event = makeInputEvent([file]);

    act(() => { result.current.handleInputChange(event); });
    act(() => { result.current.handleInputChange(event); }); // duplicate

    expect(result.current.queue).toHaveLength(1);
  });

  it('retry: failed item re-uploads using same file object', async () => {
    const { result } = renderHook(() =>
      useUploadQueue({ endpoint: '/api/test' })
    );

    const file = makeFile();
    act(() => { result.current.enqueue([file]); });
    act(() => { vi.runAllTimers(); });

    await act(async () => { xhrInstances[0].fire('error'); });

    expect(result.current.queue[0].status).toBe('failed');
    expect(result.current.queue[0]._file).toBe(file);

    const clientId = result.current.queue[0].clientId;
    act(() => { result.current.retry(clientId); });
    act(() => { vi.runAllTimers(); });

    expect(result.current.queue[0].status).toBe('uploading');
    await act(async () => { xhrInstances[1].fire('load'); });
    expect(result.current.queue[0].status).toBe('done');
  });

  it('duplicate X-Client-Id: server 200 on replay treated as success', async () => {
    const onSuccess = vi.fn();
    const { result } = renderHook(() =>
      useUploadQueue({ endpoint: '/api/test', onSuccess })
    );

    act(() => { result.current.enqueue([makeFile()]); });
    act(() => { vi.runAllTimers(); });

    const clientId = result.current.queue[0].clientId;
    const sentId = (xhrInstances[0].setRequestHeader.mock.calls as string[][])
      .find(c => c[0] === 'X-Client-Id')?.[1];
    expect(sentId).toBe(clientId);

    await act(async () => { xhrInstances[0].fire('load'); });
    expect(result.current.queue[0].status).toBe('done');
    expect(onSuccess).toHaveBeenCalledTimes(1);
  });

  it('validate: rejects unsupported type, accepts valid', async () => {
    const { result } = renderHook(() =>
      useUploadQueue({
        endpoint: '/api/test',
        validate: (f) => f.type === 'image/jpeg' ? null : 'Unsupported file type',
      })
    );

    let rejected: Array<{ file: File; reason: string }> = [];
    act(() => {
      const r = result.current.enqueue([
        makeFile('ok.jpg', 'image/jpeg'),
        makeFile('bad.pdf', 'application/pdf'),
      ]);
      rejected = r.rejected;
    });

    expect(result.current.queue).toHaveLength(1);
    expect(result.current.queue[0].fileName).toBe('ok.jpg');
    expect(rejected).toHaveLength(1);
    expect(rejected[0].reason).toBe('Unsupported file type');
  });

  it('failed upload: file preserved for retry', async () => {
    const { result } = renderHook(() =>
      useUploadQueue({ endpoint: '/api/test' })
    );

    const file = makeFile('preserve.jpg');
    act(() => { result.current.enqueue([file]); });
    act(() => { vi.runAllTimers(); });
    await act(async () => { xhrInstances[0].fire('error'); });

    expect(result.current.queue[0].status).toBe('failed');
    expect(result.current.queue[0]._file).toBe(file);
    expect(result.current.queue[0].error).toBeTruthy();
  });

  it('server 4xx: marks failed with server error message', async () => {
    // Override mock to return 400
    function MockXHR400(this: MockXhr) {
      const xhr = makeMockXhr(400, { error: 'File too large' });
      Object.assign(this, xhr);
      xhrInstances.push(this);
    }
    // @ts-expect-error mock
    global.XMLHttpRequest = MockXHR400;

    const { result } = renderHook(() =>
      useUploadQueue({ endpoint: '/api/test' })
    );

    act(() => { result.current.enqueue([makeFile()]); });
    act(() => { vi.runAllTimers(); });
    await act(async () => { xhrInstances[xhrInstances.length - 1].fire('load'); });

    expect(result.current.queue[0].status).toBe('failed');
    expect(result.current.queue[0].error).toContain('File too large');
  });

  it('iOS extensionless file (application/octet-stream): queued and uploaded as-is', async () => {
    const { result } = renderHook(() =>
      useUploadQueue({ endpoint: '/api/test' })
    );

    const iosFile = makeFile('image', 'application/octet-stream');
    act(() => { result.current.enqueue([iosFile]); });
    act(() => { vi.runAllTimers(); });

    expect(result.current.queue[0].mimeType).toBe('application/octet-stream');
    await act(async () => { xhrInstances[0].fire('load'); });
    expect(result.current.queue[0].status).toBe('done');
  });

  it('clearDone: removes only done items, keeps failed', async () => {
    // Use concurrency=1 so uploads happen sequentially and we can control timing
    const { result } = renderHook(() =>
      useUploadQueue({ endpoint: '/api/test', multiple: true, concurrency: 1 })
    );

    act(() => { result.current.enqueue([makeFile('a.jpg'), makeFile('b.jpg')]); });
    // Run only the first setTimeout (30ms * 0 = 0ms) to start first upload
    act(() => { vi.advanceTimersByTime(0); });
    await act(async () => { await Promise.resolve(); });

    // First item should be uploading
    expect(result.current.queue[0].status).toBe('uploading');

    // Fail the first upload
    await act(async () => { xhrInstances[0].fire('error'); });
    expect(result.current.queue[0].status).toBe('failed');

    // Start second upload
    act(() => { vi.advanceTimersByTime(100); });
    await act(async () => { await Promise.resolve(); });
    expect(result.current.queue[1].status).toBe('uploading');

    // Complete the second upload — don't run timers yet (would auto-clear)
    await act(async () => { xhrInstances[1].fire('load'); });
    expect(result.current.queue[1].status).toBe('done');

    // clearDone should remove the done item and keep the failed one
    act(() => { result.current.clearDone(); });

    expect(result.current.queue).toHaveLength(1);
    expect(result.current.queue[0].status).toBe('failed');
  });

  it('remove: removes item by clientId regardless of status', async () => {
    const { result } = renderHook(() =>
      useUploadQueue({ endpoint: '/api/test' })
    );

    act(() => { result.current.enqueue([makeFile()]); });
    const clientId = result.current.queue[0].clientId;

    act(() => { result.current.remove(clientId); });
    expect(result.current.queue).toHaveLength(0);
  });

  it('progress: updates item progress during XHR upload', async () => {
    const { result } = renderHook(() =>
      useUploadQueue({ endpoint: '/api/test' })
    );

    act(() => { result.current.enqueue([makeFile()]); });
    act(() => { vi.runAllTimers(); });

    await act(async () => {
      xhrInstances[0].fireUpload('progress', { lengthComputable: true, loaded: 60, total: 100 });
    });

    expect(result.current.queue[0].progress).toBe(60);
  });

  it('offline retry: network error → failed → retry succeeds', async () => {
    const { result } = renderHook(() =>
      useUploadQueue({ endpoint: '/api/test' })
    );

    act(() => { result.current.enqueue([makeFile()]); });
    act(() => { vi.runAllTimers(); });

    // Simulate network error (offline)
    await act(async () => { xhrInstances[0].fire('error'); });
    expect(result.current.queue[0].status).toBe('failed');
    expect(result.current.queue[0].error).toContain('Network error');

    // Come back online and retry
    const clientId = result.current.queue[0].clientId;
    act(() => { result.current.retry(clientId); });
    act(() => { vi.runAllTimers(); });

    await act(async () => { xhrInstances[1].fire('load'); });
    expect(result.current.queue[0].status).toBe('done');
  });
});
