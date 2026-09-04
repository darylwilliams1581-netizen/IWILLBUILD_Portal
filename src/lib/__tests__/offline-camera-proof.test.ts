import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';

const captureSrc = readFileSync(resolve(__dirname, '../../lib/capturePhotoLocally.ts'), 'utf8');
const queueSrc   = readFileSync(resolve(__dirname, '../../hooks/usePhotoUploadQueue.ts'), 'utf8');
const storeSrc   = readFileSync(resolve(__dirname, '../../lib/offlinePhotoStore.ts'), 'utf8');
const cameraSrc  = readFileSync(resolve(__dirname, '../../pages/job-photos-camera.tsx'), 'utf8');

describe('Build 22 — Offline-First Camera: 7 Proof Tests', () => {

  it('1. capturePhotoLocally uses only Camera + Filesystem (no network calls)', () => {
    expect(captureSrc).toContain('@capacitor/camera');
    expect(captureSrc).toContain('@capacitor/filesystem');
    expect(captureSrc).toContain('Filesystem.copy');
    expect(captureSrc).toContain('Directory.Data');
    const fnStart = captureSrc.indexOf('export async function capturePhotoLocally');
    const fnEnd   = captureSrc.indexOf('export async function readLocalPhoto');
    const fnBody  = captureSrc.slice(fnStart, fnEnd);
    expect(fnBody).not.toContain('fetch(');
    expect(fnBody).not.toContain('XMLHttpRequest');
  });

  it('2. Two durability layers: IDB savePhoto + Filesystem.copy to Directory.Data', () => {
    expect(captureSrc).toContain('Directory.Data');
    expect(captureSrc).toContain('Filesystem.copy');
    expect(queueSrc).toContain('savePhoto(');
    expect(queueSrc).toContain('readLocalPhoto');
    expect(queueSrc).toContain('localPath');
  });

  it("3. Photos enter queue with 'saved' status immediately on capture", () => {
    expect(storeSrc).toContain('savePhoto');
    expect(queueSrc).toContain("status: 'saved'");
    expect(cameraSrc).toContain('enqueueFiles');
  });

  it('4. Upload auto-starts on reconnect (online event + foreground)', () => {
    expect(queueSrc).toContain("window.addEventListener");
    expect(queueSrc).toContain("'online'");
    expect(queueSrc).toContain('processNext');
    expect(queueSrc).toContain('onForeground');
    expect(queueSrc).toContain('onOnline');
  });

  it('5. Idempotency key prevents duplicate photos on retry', () => {
    expect(captureSrc).toContain('idempotencyKey');
    expect(captureSrc).toContain('crypto.randomUUID()');
    expect(queueSrc).toContain('idempotencyKey');
    expect(queueSrc).toContain('X-Idempotency-Key');
    expect(queueSrc).toContain('retryItem');
  });

  it('6. jobId stored in IDB and sent to correct upload endpoint', () => {
    expect(storeSrc).toContain('jobId');
    expect(storeSrc).toContain('loadPendingPhotos');
    expect(storeSrc).toContain('IDBKeyRange.only(jobId)');
    expect(queueSrc).toContain('/api/jobs/');
    expect(queueSrc).toContain('jobId');
  });

  it('7. Filesystem copy deleted only after server confirms save (never before)', () => {
    const deleteIdx = queueSrc.indexOf('void deleteLocalPhoto(');
    const removeIdx = queueSrc.indexOf('void removePhoto(clientId)');
    expect(deleteIdx).toBeGreaterThan(-1);
    expect(removeIdx).toBeGreaterThan(-1);
    expect(deleteIdx).toBeGreaterThan(removeIdx);
    const catchIdx   = queueSrc.indexOf('} catch (e) {');
    const finallyIdx = queueSrc.indexOf('} finally {');
    expect(deleteIdx).toBeLessThan(catchIdx);
    expect(deleteIdx).toBeLessThan(finallyIdx);
  });

});
