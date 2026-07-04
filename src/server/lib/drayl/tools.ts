/**
 * drayl/tools.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * OpenAI function-calling tool definitions for Dazza AI.
 *
 * Tools give the model live access to portal data during a streaming response.
 * Each tool is a pure async function that queries the DB directly.
 * Security: companyId is always injected server-side — never from the model.
 */

import { db } from '../../db/client.js';
import { sql } from 'drizzle-orm';

// ── Tool schemas (sent to OpenAI) ─────────────────────────────────────────────

export const TOOL_DEFINITIONS = [
  {
    type: 'function' as const,
    function: {
      name: 'lookup_jobs',
      description: 'Look up active jobs for the company. Returns job names, status, client, value, and progress.',
      parameters: {
        type: 'object',
        properties: {
          status_filter: {
            type: 'string',
            enum: ['all', 'active', 'completed', 'on_hold'],
            description: 'Filter by job status. Default: active.',
          },
          limit: {
            type: 'number',
            description: 'Max number of jobs to return (1–50). Default: 20.',
          },
        },
        required: [],
      },
    },
  },
  {
    type: 'function' as const,
    function: {
      name: 'lookup_job_costs',
      description: 'Get cost summary for a specific job or all jobs. Returns estimate totals, invoice totals, and ledger entries.',
      parameters: {
        type: 'object',
        properties: {
          job_id: {
            type: 'number',
            description: 'Specific job ID to look up. Omit for all jobs.',
          },
          include_lines: {
            type: 'boolean',
            description: 'Include individual estimate line items. Default: false.',
          },
        },
        required: [],
      },
    },
  },
  {
    type: 'function' as const,
    function: {
      name: 'lookup_fleet',
      description: 'Look up fleet assets (vehicles, plant, tools). Returns asset name, type, status, rego, and service dates.',
      parameters: {
        type: 'object',
        properties: {
          asset_type: {
            type: 'string',
            description: 'Filter by asset type (Vehicle, Truck, Plant, Trailer, Tool, Other). Omit for all.',
          },
          overdue_service_only: {
            type: 'boolean',
            description: 'Only return assets with overdue service. Default: false.',
          },
        },
        required: [],
      },
    },
  },
  {
    type: 'function' as const,
    function: {
      name: 'lookup_estimates',
      description: 'Look up estimates for the company. Returns estimate name, status, job, and calculated total.',
      parameters: {
        type: 'object',
        properties: {
          job_id: {
            type: 'number',
            description: 'Filter estimates by job ID. Omit for all.',
          },
          status_filter: {
            type: 'string',
            enum: ['all', 'draft', 'sent', 'approved', 'rejected'],
            description: 'Filter by estimate status. Default: all.',
          },
        },
        required: [],
      },
    },
  },
  {
    type: 'function' as const,
    function: {
      name: 'lookup_open_todos',
      description: 'Look up open to-do items across all jobs. Returns to-do title, job, assignee, due date, and status.',
      parameters: {
        type: 'object',
        properties: {
          overdue_only: {
            type: 'boolean',
            description: 'Only return overdue to-dos. Default: false.',
          },
          job_id: {
            type: 'number',
            description: 'Filter to-dos by job ID. Omit for all jobs.',
          },
        },
        required: [],
      },
    },
  },
] as const;

export type ToolName = typeof TOOL_DEFINITIONS[number]['function']['name'];

// ── Tool argument types ───────────────────────────────────────────────────────

interface LookupJobsArgs {
  status_filter?: 'all' | 'active' | 'completed' | 'on_hold';
  limit?: number;
}

interface LookupJobCostsArgs {
  job_id?: number;
  include_lines?: boolean;
}

interface LookupFleetArgs {
  asset_type?: string;
  overdue_service_only?: boolean;
}

interface LookupEstimatesArgs {
  job_id?: number;
  status_filter?: 'all' | 'draft' | 'sent' | 'approved' | 'rejected';
}

interface LookupOpenTodosArgs {
  overdue_only?: boolean;
  job_id?: number;
}

// ── Tool executor ─────────────────────────────────────────────────────────────

export async function executeTool(
  name: string,
  args: Record<string, unknown>,
  companyId: number,
  seeDollars: boolean,
): Promise<string> {
  try {
    switch (name as ToolName) {
      case 'lookup_jobs':
        return await toolLookupJobs(args as LookupJobsArgs, companyId, seeDollars);
      case 'lookup_job_costs':
        return await toolLookupJobCosts(args as LookupJobCostsArgs, companyId, seeDollars);
      case 'lookup_fleet':
        return await toolLookupFleet(args as LookupFleetArgs, companyId);
      case 'lookup_estimates':
        return await toolLookupEstimates(args as LookupEstimatesArgs, companyId, seeDollars);
      case 'lookup_open_todos':
        return await toolLookupOpenTodos(args as LookupOpenTodosArgs, companyId);
      default:
        return JSON.stringify({ error: `Unknown tool: ${name}` });
    }
  } catch (err) {
    return JSON.stringify({ error: String(err instanceof Error ? err.message : err) });
  }
}

// ── Individual tool implementations ──────────────────────────────────────────

async function toolLookupJobs(
  args: LookupJobsArgs,
  companyId: number,
  seeDollars: boolean,
): Promise<string> {
  const statusFilter = args.status_filter ?? 'active';
  const limit = Math.min(args.limit ?? 20, 50);

  const whereStatus = statusFilter === 'all'
    ? ''
    : `AND LOWER(j.status) = ${JSON.stringify(statusFilter)}`;

  const valueCol = seeDollars
    ? ', j.contract_value, j.value'
    : '';

  const [rows] = await db.execute(sql.raw(
    `SELECT j.id, j.title, j.status, j.client_name, j.address, j.start_date, j.end_date,
            j.progress_percent, j.risk_level, j.high_risk ${valueCol}
     FROM jobs j
     WHERE j.company_id = ${companyId} ${whereStatus}
     ORDER BY j.updated_at DESC
     LIMIT ${limit}`
  )) as unknown as [Array<Record<string, unknown>>, unknown];

  if (!rows?.length) return JSON.stringify({ jobs: [], count: 0 });

  const jobs = rows.map((r) => ({
    id: r.id,
    title: r.title,
    status: r.status,
    client: r.client_name,
    address: r.address,
    startDate: r.start_date,
    endDate: r.end_date,
    progress: r.progress_percent,
    riskLevel: r.risk_level,
    highRisk: Boolean(r.high_risk),
    ...(seeDollars ? { contractValue: r.contract_value ?? r.value } : {}),
  }));

  return JSON.stringify({ jobs, count: jobs.length });
}

async function toolLookupJobCosts(
  args: LookupJobCostsArgs,
  companyId: number,
  seeDollars: boolean,
): Promise<string> {
  if (!seeDollars) {
    return JSON.stringify({ error: 'You do not have permission to view financial data.' });
  }

  const jobFilter = args.job_id ? `AND e.job_id = ${args.job_id}` : '';

  const [rows] = await db.execute(sql.raw(
    `SELECT e.id, e.title, e.status, e.job_id, e.markup_percent, e.gst_mode,
            j.title AS job_title,
            COALESCE(SUM(el.quantity * el.rate), 0) AS subtotal,
            COUNT(el.id) AS line_count
     FROM estimates e
     LEFT JOIN estimate_lines el ON el.estimate_id = e.id
     LEFT JOIN jobs j ON j.id = e.job_id
     WHERE e.company_id = ${companyId} ${jobFilter}
     GROUP BY e.id
     ORDER BY e.updated_at DESC
     LIMIT 30`
  )) as unknown as [Array<Record<string, unknown>>, unknown];

  if (!rows?.length) return JSON.stringify({ estimates: [], count: 0 });

  const estimates = rows.map((r) => {
    const subtotal = Number(r.subtotal ?? 0);
    const markup = Number(r.markup_percent ?? 0);
    const withMarkup = subtotal * (1 + markup / 100);
    const gst = r.gst_mode === 'inclusive' ? 0 : withMarkup * 0.1;
    return {
      id: r.id,
      title: r.title,
      status: r.status,
      jobId: r.job_id,
      jobTitle: r.job_title,
      lineCount: Number(r.line_count),
      subtotal: Math.round(subtotal * 100) / 100,
      totalWithMarkup: Math.round(withMarkup * 100) / 100,
      gst: Math.round(gst * 100) / 100,
      total: Math.round((withMarkup + gst) * 100) / 100,
    };
  });

  return JSON.stringify({ estimates, count: estimates.length });
}

async function toolLookupFleet(
  args: LookupFleetArgs,
  companyId: number,
): Promise<string> {
  const typeFilter = args.asset_type
    ? `AND LOWER(a.asset_type) = ${JSON.stringify(args.asset_type.toLowerCase())}`
    : '';

  const overdueFilter = args.overdue_service_only
    ? `AND a.next_service_date IS NOT NULL AND a.next_service_date < CURDATE()`
    : '';

  const [rows] = await db.execute(sql.raw(
    `SELECT a.id, a.name, a.asset_type, a.status, a.rego, a.vin,
            a.next_service_date, a.last_service_date, a.odometer_km,
            a.notes
     FROM assets a
     WHERE a.company_id = ${companyId} ${typeFilter} ${overdueFilter}
     ORDER BY a.name ASC
     LIMIT 50`
  )) as unknown as [Array<Record<string, unknown>>, unknown];

  if (!rows?.length) return JSON.stringify({ assets: [], count: 0 });

  const today = new Date();
  const assets = rows.map((r) => {
    const nextService = r.next_service_date ? new Date(String(r.next_service_date)) : null;
    const serviceOverdue = nextService ? nextService < today : false;
    const daysUntilService = nextService
      ? Math.round((nextService.getTime() - today.getTime()) / 86400000)
      : null;
    return {
      id: r.id,
      name: r.name,
      type: r.asset_type,
      status: r.status,
      rego: r.rego,
      nextServiceDate: r.next_service_date,
      lastServiceDate: r.last_service_date,
      odometerKm: r.odometer_km,
      serviceOverdue,
      daysUntilService,
    };
  });

  return JSON.stringify({ assets, count: assets.length });
}

async function toolLookupEstimates(
  args: LookupEstimatesArgs,
  companyId: number,
  seeDollars: boolean,
): Promise<string> {
  const jobFilter = args.job_id ? `AND e.job_id = ${args.job_id}` : '';
  const statusFilter = args.status_filter && args.status_filter !== 'all'
    ? `AND LOWER(e.status) = ${JSON.stringify(args.status_filter)}`
    : '';

  const [rows] = await db.execute(sql.raw(
    `SELECT e.id, e.title, e.status, e.job_id, e.markup_percent,
            j.title AS job_title,
            ${seeDollars ? 'COALESCE(SUM(el.quantity * el.rate), 0) AS subtotal,' : ''}
            COUNT(el.id) AS line_count
     FROM estimates e
     LEFT JOIN estimate_lines el ON el.estimate_id = e.id
     LEFT JOIN jobs j ON j.id = e.job_id
     WHERE e.company_id = ${companyId} ${jobFilter} ${statusFilter}
     GROUP BY e.id
     ORDER BY e.updated_at DESC
     LIMIT 30`
  )) as unknown as [Array<Record<string, unknown>>, unknown];

  if (!rows?.length) return JSON.stringify({ estimates: [], count: 0 });

  const estimates = rows.map((r) => ({
    id: r.id,
    title: r.title,
    status: r.status,
    jobId: r.job_id,
    jobTitle: r.job_title,
    lineCount: Number(r.line_count),
    ...(seeDollars ? {
      subtotal: Math.round(Number(r.subtotal ?? 0) * 100) / 100,
    } : {}),
  }));

  return JSON.stringify({ estimates, count: estimates.length });
}

async function toolLookupOpenTodos(
  args: LookupOpenTodosArgs,
  companyId: number,
): Promise<string> {
  const jobFilter = args.job_id ? `AND t.job_id = ${args.job_id}` : '';
  const overdueFilter = args.overdue_only
    ? `AND t.due_date IS NOT NULL AND t.due_date < CURDATE()`
    : '';

  const [rows] = await db.execute(sql.raw(
    `SELECT t.id, t.title, t.status, t.due_date, t.job_id,
            j.title AS job_title,
            t.assigned_to_name
     FROM job_todos t
     LEFT JOIN jobs j ON j.id = t.job_id AND j.company_id = ${companyId}
     WHERE t.company_id = ${companyId}
       AND LOWER(t.status) NOT IN ('done','complete','completed')
       ${jobFilter} ${overdueFilter}
     ORDER BY t.due_date ASC, t.created_at DESC
     LIMIT 50`
  )) as unknown as [Array<Record<string, unknown>>, unknown];

  if (!rows?.length) return JSON.stringify({ todos: [], count: 0 });

  const today = new Date();
  const todos = rows.map((r) => {
    const due = r.due_date ? new Date(String(r.due_date)) : null;
    return {
      id: r.id,
      title: r.title,
      status: r.status,
      dueDate: r.due_date,
      overdue: due ? due < today : false,
      jobId: r.job_id,
      jobTitle: r.job_title,
      assignedTo: r.assigned_to_name,
    };
  });

  return JSON.stringify({ todos, count: todos.length });
}
