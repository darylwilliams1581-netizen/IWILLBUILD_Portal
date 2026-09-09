/**
 * form-pdf-photo-loader.ts
 * Loads and compresses photos for form PDF generation.
 * Supports company-file and job-photo URL shapes.
 *
 * Target size: 96px on the longest edge, JPEG q75.
 * This keeps 100-photo substation audits well under 1 MB embedded.
 * Full-resolution originals remain accessible via the portal report link.
 */
import { and, eq, inArray } from 'drizzle-orm';
import { db } from '../db/client.js';
import { companyFiles, jobPhotos } from '../db/schema.js';
import {
  BUCKET_COMPANY_FILES,
  BUCKET_JOB_PHOTOS,
  getDownloadBuffer,
} from '../storage/storage-service.js';
import { fileIdFromUrl, signatureDataUrls, imageFromDataUrl, answerUrls } from './form-pdf-document.js';
import { parseJobPhotoUrl } from '../../lib/string-scanners.js';
import type { FormPdfImage, FormPdfField } from './form-pdf-generator.js';

/** Downsample to max 96px longest edge, JPEG q75. Falls back to original on error. */
async function compressForPdf(
  bytes: Buffer,
  mime: string,
): Promise<{ bytes: Uint8Array; mimeType: string }> {
  try {
    const { Jimp } = await import('jimp');
    const img = await Jimp.read(bytes);
    const MAX = 96;
    if (img.width > MAX || img.height > MAX) {
      img.scaleToFit({ w: MAX, h: MAX });
    }
    const jpegBuf = await img.getBuffer('image/jpeg', { quality: 75 });
    return { bytes: Uint8Array.from(jpegBuf), mimeType: 'image/jpeg' };
  } catch {
    return { bytes: Uint8Array.from(bytes), mimeType: mime };
  }
}

/**
 * Build the fieldImages map for generateFormSubmissionPdf.
 *
 * @param companyId        Company that owns the submission.
 * @param submissionJobId  jobId from the submission (null for standalone forms).
 * @param fields           All form fields in order.
 * @param answers          Parsed answers map (fieldId string to value).
 */
export async function loadFieldImages(
  companyId: number,
  submissionJobId: number | null,
  fields: FormPdfField[],
  answers: Record<string, unknown>,
): Promise<Record<string, FormPdfImage[]>> {
  const allPhotoUrls = fields
    .filter((f) => f.fieldType === 'photo')
    .flatMap((f) => answerUrls(answers[String(f.id)]));

  const fileIds = Array.from(new Set(
    allPhotoUrls.map(fileIdFromUrl).filter((id): id is number => id !== null),
  ));
  const jobPhotoRefs = Array.from(new Set(
    allPhotoUrls
      .map(parseJobPhotoUrl)
      .filter((r): r is { jobId: number; photoId: number } => r !== null),
  ));

  const fileRecords = fileIds.length > 0
    ? await db.select().from(companyFiles).where(and(
        eq(companyFiles.companyId, companyId),
        inArray(companyFiles.id, fileIds),
      ))
    : [];
  const fileRecordById = new Map(fileRecords.map((r) => [r.id, r]));

  const jobPhotoRecordMap = new Map<number, typeof jobPhotos.$inferSelect>();
  if (jobPhotoRefs.length > 0) {
    const photoIds = jobPhotoRefs.map((r) => r.photoId);
    const conditions = [
      eq(jobPhotos.companyId, companyId),
      inArray(jobPhotos.id, photoIds),
    ];
    if (submissionJobId) conditions.push(eq(jobPhotos.jobId, submissionJobId));
    const rows = await db.select().from(jobPhotos).where(and(...conditions));
    for (const row of rows) jobPhotoRecordMap.set(row.id, row);
  }

  const fieldImages: Record<string, FormPdfImage[]> = {};

  for (const field of fields) {
    if (field.fieldType === 'photo') {
      const images = await Promise.all(
        answerUrls(answers[String(field.id)]).map(async (url): Promise<FormPdfImage | null> => {
          // Company-file path
          const fileId = fileIdFromUrl(url);
          if (fileId !== null) {
            const record = fileRecordById.get(fileId);
            if (!record) return null;
            try {
              const dl = await getDownloadBuffer(record.storedName, BUCKET_COMPANY_FILES);
              if (!/image\/(?:png|jpe?g)/i.test(record.mimeType)) return null;
              const compressed = await compressForPdf(dl.buffer, record.mimeType);
              return { bytes: compressed.bytes, mimeType: compressed.mimeType, label: field.label };
            } catch (err) {
              console.warn('[form-pdf-photo-loader] company file', record.id, err);
              return null;
            }
          }

          // Job-photo path
          const ref = parseJobPhotoUrl(url);
          if (ref !== null) {
            const record = jobPhotoRecordMap.get(ref.photoId);
            if (!record) return null;
            try {
              const thumbKey: string | null = record.thumbnailKey ?? null;
              const key = thumbKey ?? record.filename;
              const mime = thumbKey
                ? (record.thumbnailMimeType ?? record.mimeType ?? 'image/jpeg')
                : (record.mimeType ?? 'image/jpeg');
              const dl = await getDownloadBuffer(key, BUCKET_JOB_PHOTOS);
              if (!/image\/(?:png|jpe?g)/i.test(mime)) return null;
              const compressed = await compressForPdf(dl.buffer, mime);
              return { bytes: compressed.bytes, mimeType: compressed.mimeType, label: field.label };
            } catch (err) {
              console.warn('[form-pdf-photo-loader] job photo', record.id, err);
              return null;
            }
          }

          return null;
        }),
      );
      fieldImages[String(field.id)] = images.filter((img): img is FormPdfImage => img !== null);
    } else if (field.fieldType === 'signature') {
      fieldImages[String(field.id)] = signatureDataUrls(answers[String(field.id)])
        .map(imageFromDataUrl)
        .filter((img): img is FormPdfImage => img !== null);
    }
  }

  return fieldImages;
}
