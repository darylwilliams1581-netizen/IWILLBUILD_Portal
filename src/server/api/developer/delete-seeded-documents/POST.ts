/**
 * POST /api/developer/delete-seeded-documents
 *
 * Platform-owner only. Hardcoded to darylwilliams1581@gmail.com.
 *
 * Deletes ONLY the document_templates and form_templates rows that were
 * inserted by the seed endpoint — matched by name against the canonical
 * seed source lists. Does NOT touch any other rows.
 *
 * ?dryRun=1  — reports what would be deleted; zero DB writes.
 * (no flag)  — deletes inside a transaction.
 */

import type { Request, Response } from 'express';
import mysql from 'mysql2/promise';
import { getDatabaseCredentials } from '../../../db/config.js';

const TARGET_EMAIL = 'darylwilliams1581@gmail.com';

// Canonical seeded SWMS names (must match seed source exactly)
const SEEDED_SWMS_NAMES = [
  // flat
  'General Site Safety — High Risk Construction Work',
  'Working at Heights',
  'Excavation and Trenching',
  'Working with Hazardous Substances',
  'Balustrade and Handrail Installation',
  'Carpenter — Cladding',
  'Concrete Placement and Finishing',
  'Demolition — Minor Works',
  'Electrical Work — General',
  'Plumbing and Drainage',
  'Roofing — Metal and Tile',
  'Crane and Rigging Operations',
  'Confined Space Entry',
  'Hot Works — Welding, Cutting and Grinding',
  'Demolition — Structural and Non-Structural',
  'Asbestos Awareness — Incidental Disturbance',
  // oc
  'Bricklaying',
  'Building Inspection',
  'Cabinets Installation',
  'Carpenter Fixing',
  'Carpenter Framing',
  'Carpenter Lockup',
  'Ceramic Tiling',
  'Concreting Slab',
  'Delivery, Loading & Unloading',
  'Environmental Controls & Spill Response',
  'Elevated Work Platform (EWP)',
  'Excavations in a Live Substation',
  'Fencing Installation',
  'Heat Stress, Remote Conditions & Fitness for Work',
  'Landscaping & Maintenance',
  'Working On or Near Exposed Live Parts',
  'Manual Handling and Housekeeping',
  'Moving Powered Plant',
  'Painting Internal / External',
  'Use of Power Tools',
  'Silica Dust Exposure',
  'Traffic Management / Working Near Roads',
  'Working Near Underground Services',
  'Vacuum Excavation',
];

const SEEDED_PLAN_NAMES = [
  'Site Safety Management Plan — Starter Template',
  'Construction Site Safety Management Plan',
  'WHS & Environmental Management Plan — Civil Works',
  'Subcontractor Safety Management Plan',
];

const SEEDED_FORM_NAMES = [
  'Daily Prestart',
  'Toolbox Talk',
  'Incident / Injury / Near Miss Report',
  'Site Inspection',
  'Worker Sign On / Attendance Register',
  'Photo Record',
  'Variation Request',
  'Completion Sign Off',
  'Daily Prestart — Vehicle & Plant',
  'Toolbox Talk Record',
  'Site Safety Inspection',
  'Practical Completion Sign Off',
  'Subcontractor Induction',
  'Concrete Pour Checklist',
  'Defect Inspection Report',
  'Material Delivery Docket',
];

export default async function handler(req: Request, res: Response) {
  const dryRun = req.query.dryRun === '1';

  const creds = getDatabaseCredentials();
  const pool = mysql.createPool({
    host: creds.host,
    port: creds.port,
    user: creds.username,
    password: creds.password,
    database: creds.database,
    ssl: { rejectUnauthorized: false },
    connectionLimit: 3,
  });

  try {
    // Resolve company_id for target email
    const [profileRows] = await pool.execute<mysql.RowDataPacket[]>(
      `SELECT p.company_id, c.name AS company_name
       FROM profiles p
       JOIN companies c ON c.id = p.company_id
       WHERE p.user_id = (SELECT id FROM user WHERE email = ? LIMIT 1)
       LIMIT 1`,
      [TARGET_EMAIL],
    );
    if (!profileRows.length) {
      res.status(404).json({ error: 'Target account not found', targetEmail: TARGET_EMAIL });
      return;
    }
    const { company_id: companyId, company_name: companyName } = profileRows[0];

    // Find matching rows
    const allDocNames = [...SEEDED_SWMS_NAMES, ...SEEDED_PLAN_NAMES];
    const placeholders = allDocNames.map(() => '?').join(',');
    const [docRows] = await pool.execute<mysql.RowDataPacket[]>(
      `SELECT id, name, template_type FROM document_templates
       WHERE company_id = ? AND name IN (${placeholders})`,
      [companyId, ...allDocNames],
    );

    const formPlaceholders = SEEDED_FORM_NAMES.map(() => '?').join(',');
    const [formRows] = await pool.execute<mysql.RowDataPacket[]>(
      `SELECT id, name FROM form_templates
       WHERE company_id = ? AND name IN (${formPlaceholders})`,
      [companyId, ...SEEDED_FORM_NAMES],
    );

    const docIds = (docRows as Array<{ id: number; name: string; template_type: string }>).map(r => r.id);
    const formIds = (formRows as Array<{ id: number; name: string }>).map(r => r.id);

    const foundDocs = (docRows as Array<{ id: number; name: string; template_type: string }>).map(r => `[${r.template_type}] ${r.name}`);
    const foundForms = (formRows as Array<{ id: number; name: string }>).map(r => r.name);
    const notFoundDocs = allDocNames.filter(n => !(docRows as Array<{ name: string }>).find(r => r.name === n));
    const notFoundForms = SEEDED_FORM_NAMES.filter(n => !(formRows as Array<{ name: string }>).find(r => r.name === n));

    if (dryRun) {
      res.json({
        mode: 'dry-run',
        ok: true,
        targetEmail: TARGET_EMAIL,
        companyId,
        companyName,
        wouldDelete: {
          documentTemplates: { count: docIds.length, names: foundDocs },
          formTemplates: { count: formIds.length, names: foundForms },
        },
        notFound: {
          documentTemplates: notFoundDocs,
          formTemplates: notFoundForms,
        },
        message: `Dry run: would delete ${docIds.length} document templates and ${formIds.length} form templates. No changes made.`,
      });
      return;
    }

    // Live delete — inside a transaction
    const conn = await pool.getConnection();
    try {
      await conn.beginTransaction();

      let deletedDocs = 0;
      let deletedForms = 0;

      if (docIds.length > 0) {
        const docPlaceholders = docIds.map(() => '?').join(',');
        const [docResult] = await conn.execute(
          `DELETE FROM document_templates WHERE id IN (${docPlaceholders}) AND company_id = ?`,
          [...docIds, companyId],
        ) as [mysql.ResultSetHeader, unknown];
        deletedDocs = docResult.affectedRows;
      }

      if (formIds.length > 0) {
        const fPlaceholders = formIds.map(() => '?').join(',');
        const [formResult] = await conn.execute(
          `DELETE FROM form_templates WHERE id IN (${fPlaceholders}) AND company_id = ?`,
          [...formIds, companyId],
        ) as [mysql.ResultSetHeader, unknown];
        deletedForms = formResult.affectedRows;
      }

      await conn.commit();

      res.json({
        mode: 'live',
        ok: true,
        targetEmail: TARGET_EMAIL,
        companyId,
        companyName,
        deleted: {
          documentTemplates: { count: deletedDocs, names: foundDocs },
          formTemplates: { count: deletedForms, names: foundForms },
        },
        notFound: {
          documentTemplates: notFoundDocs,
          formTemplates: notFoundForms,
        },
        message: `Deleted ${deletedDocs} document templates and ${deletedForms} form templates. Ready to re-seed.`,
      });
    } catch (err) {
      await conn.rollback();
      throw err;
    } finally {
      conn.release();
    }
  } finally {
    await pool.end();
  }
}
