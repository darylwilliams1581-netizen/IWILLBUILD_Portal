import { describe, expect, it } from 'vitest';
import {
  PHOTO_STORE_CHANGED_EVENT,
  setPhotoRuntimeStatus,
} from '@/lib/offlinePhotoStore';

describe('photo store runtime status announcements', () => {
  it('announces durable states only and ignores duplicate status writes', () => {
    const clientId = `runtime-${Date.now()}`;
    let announcements = 0;
    const onChange = () => { announcements += 1; };
    window.addEventListener(PHOTO_STORE_CHANGED_EVENT, onChange);

    try {
      setPhotoRuntimeStatus(clientId, 'preparing');
      setPhotoRuntimeStatus(clientId, 'uploading');
      expect(announcements).toBe(0);

      setPhotoRuntimeStatus(clientId, 'saved');
      setPhotoRuntimeStatus(clientId, 'saved');
      setPhotoRuntimeStatus(clientId, 'failed');
      setPhotoRuntimeStatus(clientId, 'synced');
      expect(announcements).toBe(3);
    } finally {
      window.removeEventListener(PHOTO_STORE_CHANGED_EVENT, onChange);
    }
  });
});
