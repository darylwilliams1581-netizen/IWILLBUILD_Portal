/**
 * POST /api/safety/swms/import-docx
 * Upload a DOCX file and create a new SWMS template from its content.
 *
 * Multipart form: field "docx" = the .docx file
 *
 * Strategy:
 *  1. Parse DOCX → plain text via mammoth
 *  2. Split text into sections using common SWMS heading keywords
 *  3. Map sections to swms_templates columns
 *  4. INSERT and return the new template
 *
 * Returns: { swms: SwmsTemplate }
 */
import type { Request, Response } from 'express';
import { db } from '../../../../db/client.js';
import { sql } from 'drizzle-orm';
import { eq } from 'drizzle-orm';
import { getAuth } from '../../../../../lib/auth/auth.js';
import { profiles } from '../../../../db/schema.js';
import { parseMultipartForm } from '../../../../lib/file-upload.js';
import type { ResultSetHeader } from 'mysql2';

// ── Section keyword map ────────────────────────────────────────────────────────
// Each entry: [columnKey, [...matchKeywords]]
// The first heading whose text contains any keyword (case-insensitive) wins.

const SECTION_MAP: Array<[string, string[]]> = [
  ['title',                  ['safe work method', 'swms', 'title', 'document title']],
  ['work_activity',          ['work activity', 'scope of work', 'task description', 'description of work', 'activity']],
  ['hazards',                ['hazard', 'hazards identified', 'identified hazards']],
  ['risks',                  ['risk', 'risks', 'risk assessment', 'risk rating']],
  ['controls',               ['control', 'controls', 'control measures', 'risk controls', 'mitigation']],
  ['ppe',                    ['ppe', 'personal protective equipment', 'protective equipment']],
  ['plant_equipment',        ['plant', 'equipment', 'plant and equipment', 'tools and equipment', 'plant/equipment']],
  ['training_competency',    ['training', 'competency', 'training and competency', 'licences', 'qualifications']],
  ['emergency_controls',     ['emergency', 'emergency controls', 'emergency procedures', 'first aid']],
  ['environmental_controls', ['environmental', 'environment', 'environmental controls', 'environmental management']],
  ['sign_off_requirements',  ['sign', 'sign off', 'sign-off', 'sign on', 'signoff', 'worker acknowledgement', 'acknowledgement']],
];

// ── Parse DOCX text into SWMS field map ───────────────────────────────────────

function extractSections(text: string): Record<string, string> {
  const result: Record<string, string> = {};

  // Split on lines; treat short ALL-CAPS or bold-looking lines as headings
  const lines = text.split('\n').map((l) => l.trim()).filter(Boolean);

  let currentKey: string | null = null;
  const buffer: string[] = [];

  function flush() {
    if (currentKey && buffer.length > 0) {
      const existing = result[currentKey] ?? '';
      result[currentKey] = existing ? existing + '\n' + buffer.join('\n') : buffer.join('\n');
      buffer.length = 0;
    }
  }

  for (const line of lines) {
    // Detect heading: short line (≤80 chars) that matches a keyword
    const lower = line.toLowerCase().replace(/[^a-z0-9 /\-]/g, ' ');
    let matched: string | null = null;

    for (const [key, keywords] of SECTION_MAP) {
      if (keywords.some((kw) => lower.includes(kw))) {
        // Prefer longer keyword matches to avoid false positives
        matched = key;
        break;
      }
    }

    if (matched && line.length <= 100) {
      flush();
      currentKey = matched;
      // If the heading line itself contains content after a colon, capture it
      const colonIdx = line.indexOf(':');
      if (colonIdx !== -1 && colonIdx < line.length - 1) {
        buffer.push(line.slice(colonIdx + 1).trim());
      }
    } else {
      buffer.push(line);
    }
  }
  flush();

  return result;
}

// ── Handler ───────────────────────────────────────────────────────────────────

export default async function handler(req: Request, res: Response) {
  try {
    const auth = getAuth();
    const headers = new Headers();
    for (const [k, v] of Object.entries(req.headers)) {
      if (v) headers.set(k, Array.isArray(v) ? v[0] : v);
    }
    const session = await auth.api.getSession({ headers });
    if (!session?.user) return res.status(401).json({ error: 'Unauthorised' });

    const [profile] = await db.select().from(profiles).where(eq(profiles.userId, session.user.id)).limit(1);
    if (!profile?.companyId) return res.status(403).json({ error: 'No company' });

    // Parse multipart upload
    const { files } = await parseMultipartForm(req, { maxFileSize: 20 * 1024 * 1024 });
    const docxFile = files.find((f) => f.fieldname === 'docx' || f.originalname?.toLowerCase().endsWith('.docx'));
    if (!docxFile?.buffer) {
      return res.status(400).json({ error: 'No DOCX file uploaded. Send a .docx file in the "docx" field.' });
    }

    // Extract plain text via mammoth
    const mammoth = await import('mammoth');
    const result = await mammoth.extractRawText({ buffer: docxFile.buffer });
    const text = result.value ?? '';

    if (!text.trim()) {
      return res.status(422).json({ error: 'DOCX file appears to be empty or could not be read.' });
    }

    // Map text → SWMS fields
    const sections = extractSections(text);

    // Derive title: use mapped title section, or strip extension from filename
    const rawTitle = sections['title']
      ?? (docxFile.originalname ?? 'Imported SWMS').replace(/\.docx$/i, '').replace(/[-_]/g, ' ');
    const title = rawTitle.slice(0, 200).trim();

    // Insert new SWMS template
    const [insertResult] = await db.execute(sql`
      INSERT INTO swms_templates
        (company_id, title, work_activity, hazards, risks, controls, ppe,
         plant_equipment, training_competency, emergency_controls,
         environmental_controls, sign_off_requirements,
         revision_number, status, created_by_user_id)
      VALUES
        (${profile.companyId},
         ${title},
         ${sections['work_activity'] ?? ''},
         ${sections['hazards'] ?? ''},
         ${sections['risks'] ?? ''},
         ${sections['controls'] ?? ''},
         ${sections['ppe'] ?? ''},
         ${sections['plant_equipment'] ?? ''},
         ${sections['training_competency'] ?? ''},
         ${sections['emergency_controls'] ?? ''},
         ${sections['environmental_controls'] ?? ''},
         ${sections['sign_off_requirements'] ?? ''},
         ${'1'},
         ${'draft'},
         ${session.user.id})
    `) as unknown as [ResultSetHeader, unknown];

    const newId = insertResult.insertId;

    // Fetch and return the created record
    const [rows] = await db.execute(sql`
      SELECT * FROM swms_templates WHERE id = ${newId} LIMIT 1
    `) as unknown as [Array<Record<string, unknown>>, unknown];

    return res.status(201).json({ swms: rows?.[0] ?? null, warnings: result.messages.map((m) => m.message).slice(0, 5) });
  } catch (err) {
    console.error('POST /api/safety/swms/import-docx error:', err);
    return res.status(500).json({ error: 'Failed to import DOCX' });
  }
}
