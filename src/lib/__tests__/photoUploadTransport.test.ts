import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  fetch: vi.fn(),
  isNative: vi.fn(() => true),
}));

vi.mock('@/lib/capacitor-plugins', () => ({ isNative: mocks.isNative }));
vi.mock('@/lib/native-api', () => ({
  resolveDownloadUrl: (url: string) => `https://iwillbuild.com${url}`,
}));

import { uploadPhotoFile } from '@/lib/photoUploadTransport';

describe('native photo upload transport', () => {
  beforeEach(() => {
    mocks.fetch.mockReset();
    mocks.isNative.mockReturnValue(true);
    vi.stubGlobal('fetch', mocks.fetch);
  });

  it('copies native bytes into a real JPEG File and posts credentialed FormData', async () => {
    mocks.fetch.mockResolvedValue({
      ok: true,
      status: 201,
      text: vi.fn().mockResolvedValue(JSON.stringify({ photos: [{ id: 72 }] })),
    });
    const progress: number[] = [];
    const file = new File([new Uint8Array([0, 1, 2, 253, 254, 255])], 'capture.png', {
      type: 'image/png',
    });

    await expect(uploadPhotoFile({
      jobId: 9,
      file,
      clientId: 'client-9',
      onProgress: (value) => progress.push(value),
    })).resolves.toEqual({ id: 72 });

    expect(mocks.fetch).toHaveBeenCalledWith('https://iwillbuild.com/api/jobs/9/photos', expect.objectContaining({
      method: 'POST',
      credentials: 'include',
      headers: expect.objectContaining({ 'X-Client-Id': 'client-9' }),
    }));
    const request = mocks.fetch.mock.calls[0]?.[1] as {
      headers?: Record<string, string>;
      body?: unknown;
    };
    expect(request.headers).not.toHaveProperty('Content-Type');
    expect(request.body).toBeInstanceOf(FormData);
    const uploaded = (request.body as FormData).get('photos');
    expect(uploaded).toBeInstanceOf(File);
    expect((uploaded as File).name).toBe('capture.png');
    expect((uploaded as File).type).toBe('image/jpeg');
    expect(new Uint8Array(await (uploaded as File).arrayBuffer())).toEqual(
      new Uint8Array([0, 1, 2, 253, 254, 255]),
    );
    expect(progress).toEqual([5, 20, 100]);
  });

  it('keeps the server error for the retry card', async () => {
    mocks.fetch.mockResolvedValue({
      ok: false,
      status: 401,
      text: vi.fn().mockResolvedValue(JSON.stringify({ error: 'Session expired' })),
    });

    await expect(uploadPhotoFile({
      jobId: 9,
      file: new File(['jpeg'], 'capture.jpg', { type: 'image/jpeg' }),
      clientId: 'client-9',
      onProgress: () => undefined,
    })).rejects.toThrow('Session expired');
  });
});
