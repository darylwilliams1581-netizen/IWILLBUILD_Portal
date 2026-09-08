import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  fetch: vi.fn(),
  isNative: vi.fn(() => false),
  createObjectUrl: vi.fn(() => 'blob:progress-export'),
  revokeObjectUrl: vi.fn(),
  mkdir: vi.fn(),
  writeFile: vi.fn(() => Promise.resolve({ uri: 'file:///iwb-share/export.pdf' })),
  deleteFile: vi.fn(),
  share: vi.fn(),
}));

vi.mock('@/lib/capacitor-plugins', () => ({
  FilesystemDirectory: { Cache: 'CACHE' },
  getFilesystemPlugin: vi.fn(() => ({
    mkdir: mocks.mkdir,
    writeFile: mocks.writeFile,
    deleteFile: mocks.deleteFile,
  })),
  getSharePlugin: vi.fn(() => ({ share: mocks.share })),
  isNative: mocks.isNative,
}));

vi.mock('@/lib/native-api', () => ({
  resolveDownloadUrl: (url: string) => `https://iwillbuild.com${url}`,
}));

import { saveAuthenticatedExport } from '@/lib/authenticated-export';

describe('authenticated progress exports', () => {
  beforeEach(() => {
    mocks.fetch.mockReset();
    mocks.isNative.mockReturnValue(false);
    mocks.createObjectUrl.mockClear();
    mocks.revokeObjectUrl.mockClear();
    mocks.mkdir.mockReset();
    mocks.writeFile.mockReset();
    mocks.writeFile.mockResolvedValue({ uri: 'file:///iwb-share/export.pdf' });
    mocks.deleteFile.mockReset();
    mocks.share.mockReset();
    vi.stubGlobal('fetch', mocks.fetch);
    vi.stubGlobal('URL', {
      ...URL,
      createObjectURL: mocks.createObjectUrl,
      revokeObjectURL: mocks.revokeObjectUrl,
    });
  });

  it('downloads a successful response with credentials and the requested extension', async () => {
    mocks.fetch.mockResolvedValue(new Response('activity,progress\nBuild,50', {
      status: 200,
      headers: { 'Content-Type': 'text/csv' },
    }));
    let downloadedFilename = '';
    const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function captureFilename() {
      downloadedFilename = this.download;
    });

    await saveAuthenticatedExport({
      url: '/api/jobs/9/progress/export-csv',
      filename: 'job-9-program-of-works.csv',
      fileType: 'csv',
      title: 'Progress CSV',
    });

    expect(mocks.fetch).toHaveBeenCalledWith(
      'https://iwillbuild.com/api/jobs/9/progress/export-csv',
      { credentials: 'include' },
    );
    expect(mocks.createObjectUrl).toHaveBeenCalledOnce();
    expect(click).toHaveBeenCalledOnce();
    expect(downloadedFilename).toBe('job-9-program-of-works.csv');
    click.mockRestore();
  });

  it('writes a valid PDF to cache and opens the native share sheet', async () => {
    mocks.isNative.mockReturnValue(true);
    mocks.fetch.mockResolvedValue(new Response('%PDF-1.7 test', {
      status: 200,
      headers: { 'Content-Type': 'application/pdf' },
    }));

    await saveAuthenticatedExport({
      url: '/api/jobs/9/progress/report/pdf',
      filename: 'job-9-program-of-works.pdf',
      fileType: 'pdf',
      title: 'Progress PDF report',
    });

    expect(mocks.fetch).toHaveBeenCalledWith(
      'https://iwillbuild.com/api/jobs/9/progress/report/pdf',
      { credentials: 'include' },
    );
    expect(mocks.writeFile).toHaveBeenCalledWith(expect.objectContaining({
      path: 'iwb-share/job-9-program-of-works.pdf',
      directory: 'CACHE',
    }));
    expect(mocks.share).toHaveBeenCalledWith(expect.objectContaining({
      files: ['file:///iwb-share/export.pdf'],
    }));
    expect(mocks.deleteFile).toHaveBeenCalledWith({
      path: 'iwb-share/job-9-program-of-works.pdf',
      directory: 'CACHE',
    });
  });

  it('shows a 401 error instead of saving its JSON body', async () => {
    mocks.fetch.mockResolvedValue(new Response(JSON.stringify({ error: 'Session expired' }), {
      status: 401,
      headers: { 'Content-Type': 'application/json' },
    }));

    await expect(saveAuthenticatedExport({
      url: '/api/jobs/9/progress/report/pdf',
      filename: 'job-9-program-of-works.pdf',
      fileType: 'pdf',
      title: 'Progress PDF report',
    })).rejects.toThrow('Session expired');

    expect(mocks.createObjectUrl).not.toHaveBeenCalled();
  });

  it('rejects an unexpected JSON success response before saving it', async () => {
    mocks.fetch.mockResolvedValue(new Response(JSON.stringify({ error: 'Not signed in' }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    }));

    await expect(saveAuthenticatedExport({
      url: '/api/jobs/9/progress/export-csv',
      filename: 'job-9-program-of-works.csv',
      fileType: 'csv',
      title: 'Progress CSV',
    })).rejects.toThrow('did not return a valid export');

    expect(mocks.createObjectUrl).not.toHaveBeenCalled();
  });
});
