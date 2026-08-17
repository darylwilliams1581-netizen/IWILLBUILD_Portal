/**
 * Shared Lens types — imported by lens.tsx and Lens sub-components.
 */

export interface LensPhoto {
  id: number;
  jobId: number;
  jobNumber: string | null;
  jobName: string | null;
  jobAddress: string | null;
  label: string | null;
  caption: string | null;
  originalName: string | null;
  mimeType: string | null;
  imageWidth: number | null;
  imageHeight: number | null;
  uploadedByName: string | null;
  createdAt: string;
  status: string;
  lockedAt: string | null;
  lockedByName: string | null;
  mediaAssetId: number | null;
  thumbnailUrl: string;
  downloadUrl: string;
  /** width alias from SQL (same as imageWidth) */
  width: number | null;
  /** height alias from SQL (same as imageHeight) */
  height: number | null;
}

export interface LensResponse {
  photos: LensPhoto[];
  page: number;
  limit: number;
  total: number;
  hasMore: boolean;
}
