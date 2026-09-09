import { describe, expect, it } from 'vitest';
import { PDFDocument } from 'pdf-lib';
import { generateFormSubmissionPdf, type FormPdfImage } from '../form-pdf-generator';

const ONE_PIXEL_PNG = Uint8Array.from(Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Y9Zl1sAAAAASUVORK5CYII=',
  'base64',
));

describe('generateFormSubmissionPdf photo reports', () => {
  it('keeps 100 photo thumbnails below the email attachment limit and links the report', async () => {
    const photo: FormPdfImage = { bytes: ONE_PIXEL_PNG, mimeType: 'image/png' };
    const pdfBytes = await generateFormSubmissionPdf({
      title: 'Variation Request',
      status: 'Completed',
      companyName: 'IWILLBUILD',
      jobId: 42,
      formInstanceId: 77,
      fields: [{ id: 1, label: 'Site photos', fieldType: 'photo' }],
      answers: { '1': 'photos' },
      fieldImages: { '1': Array.from({ length: 100 }, () => photo) },
    });

    expect(pdfBytes.byteLength).toBeLessThan(2 * 1024 * 1024);

    const document = await PDFDocument.load(pdfBytes);
    const pages = document.getPages();
    expect(pages.length).toBeGreaterThan(1);
    expect(pages[0].node.Annots()?.size()).toBe(1);
  });
});
