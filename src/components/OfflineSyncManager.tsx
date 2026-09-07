import { useOfflineQueue } from '@/lib/useOfflineQueue';
import {
  type AttendanceOfflineAction,
  type FormOfflineAction,
  type SitePrestartOfflineAction,
  syncAttendanceAction,
  syncFormAction,
  syncSitePrestartAction,
} from '@/lib/offlineFieldActions';

/** Always-mounted owners for queues that must flush after restart or resume. */
export default function OfflineSyncManager() {
  useOfflineQueue<AttendanceOfflineAction>('job-attendance', syncAttendanceAction);
  useOfflineQueue<SitePrestartOfflineAction>('site-prestart', syncSitePrestartAction);
  useOfflineQueue<FormOfflineAction>('form-submit', syncFormAction);
  return null;
}
