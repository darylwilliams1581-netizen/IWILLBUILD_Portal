import { useOfflineQueue } from '@/lib/useOfflineQueue';
import {
  type AttendanceOfflineAction,
  type FormOfflineAction,
  type FleetPrestartOfflineAction,
  type SitePrestartOfflineAction,
  syncAttendanceAction,
  syncFormAction,
  syncFleetPrestartAction,
  syncSitePrestartAction,
} from '@/lib/offlineFieldActions';

/** Always-mounted owners for queues that must flush after restart or resume. */
export default function OfflineSyncManager() {
  useOfflineQueue<AttendanceOfflineAction>('job-attendance', syncAttendanceAction);
  useOfflineQueue<SitePrestartOfflineAction>('site-prestart', syncSitePrestartAction);
  useOfflineQueue<FleetPrestartOfflineAction>('fleet-prestart', syncFleetPrestartAction);
  useOfflineQueue<FormOfflineAction>('form-submit', syncFormAction);
  return null;
}
