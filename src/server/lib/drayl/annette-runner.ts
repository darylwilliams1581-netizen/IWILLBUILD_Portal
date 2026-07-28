/**
 * drayl/annette-runner.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Annette health-check runner — pure logic, no DB, no OpenAI.
 * Sourced from docs/persona.ts (uploaded 2026-07-02).
 *
 * Takes a DazzaContext (new modular shape) and returns AnnetteFinding[].
 */

import { daysUntil, isBeforeToday } from './date.js';
import type { AnnetteFinding, DazzaContext, Job, ModuleName, Severity } from './types.js';

function normalized(value: string | null | undefined): string {
  return (value ?? "").trim().toLowerCase();
}

function isClosed(status: string | null | undefined): boolean {
  return ["done", "complete", "completed", "closed", "cancelled", "canceled", "archived"].includes(normalized(status));
}

function isActiveJob(job: Job): boolean {
  return !isClosed(job.status) && !["draft", "quote", "lead"].includes(normalized(job.status));
}

function isApprovedStatus(status: string | null | undefined): boolean {
  return ["approved", "accepted", "won"].includes(normalized(status));
}

function isLocked(value: unknown): boolean {
  return value === true || normalized(String(value)) === "true" || normalized(String(value)) === "locked";
}

function jobLabel(job: Job): string {
  return job.name ?? job.title ?? `Job ${job.id}`;
}

function pushFinding(findings: AnnetteFinding[], finding: Omit<AnnetteFinding, "id"> & { id?: string }): void {
  const id = finding.id ?? `${finding.module.toLowerCase()}-${findings.length + 1}-${Date.now()}`;
  findings.push({ ...finding, id });
}

function sourceWarning(findings: AnnetteFinding[], module: ModuleName, checkName: string, error: unknown): void {
  const message = error instanceof Error ? error.message : String(error);
  pushFinding(findings, {
    id: `annette-check-warning-${module}-${checkName}`.replace(/\s+/g, "-"),
    severity: "warning",
    module,
    title: `${module} check could not complete`,
    detail: `Annette could not complete the ${checkName} check. ${message}`,
    sourceIds: [],
    recommendedAction: `Open ${module} and confirm the data manually.`
  });
}

function runCheck(findings: AnnetteFinding[], module: ModuleName, checkName: string, check: () => void): void {
  try {
    check();
  } catch (error) {
    sourceWarning(findings, module, checkName, error);
  }
}

function hasAnyFileForJob(jobId: string, context: DazzaContext): boolean {
  return context.modules.files.data.some((file: Record<string, unknown>) => file.jobId === jobId || file.job_id === jobId);
}

function hasPhotoForJob(jobId: string, context: DazzaContext): boolean {
  return context.modules.files.data.some((file: Record<string, unknown>) => {
    const type = normalized(String(file.fileType ?? file.kind ?? file.mimeType ?? file.name ?? ''));
    const fJobId = file.jobId ?? file.job_id;
    return fJobId === jobId && (type.includes("photo") || type.includes("image") || type.includes("jpg") || type.includes("png") || type.includes("jpeg"));
  });
}

function hasApprovedEstimate(job: Job, context: DazzaContext): boolean {
  if (job.approvedEstimateId) return true;
  if (isApprovedStatus(job.estimateStatus)) return true;
  return context.modules.estimates.data.some((estimate: Record<string, unknown>) => {
    const estJobId = estimate.jobId ?? estimate.job_id;
    return estJobId === job.id && isApprovedStatus(String(estimate.status ?? ''));
  });
}

function hasProgress(job: Job, context: DazzaContext): boolean {
  if ((job.progressPercent ?? 0) > 0) return true;
  if (normalized(job.progressStatus ?? '').length > 0 && normalized(job.progressStatus ?? '') !== "not started") return true;
  // Check job_progress from the jobs module data (progress is embedded in job rows)
  return false;
}

function isHighRiskOrLarge(job: Job): boolean {
  const risk = normalized(job.riskLevel ?? '');
  const value = job.value ?? job.contractValue ?? 0;
  return job.highRisk === true || risk === "high" || risk === "critical" || value >= 250000;
}

function priorityScore(finding: AnnetteFinding): number {
  if (finding.severity === "critical") return 100;
  if (finding.severity === "warning") return 50;
  return 10;
}

export function runAnnetteHealthCheck(context: DazzaContext): AnnetteFinding[] {
  const findings: AnnetteFinding[] = [];
  const modules = context.modules;

  // Module warnings first
  for (const warning of context.warnings) {
    const match = warning.match(/Module warning: ([A-Za-z]+)/);
    const module = (match?.[1] as ModuleName | undefined) ?? "Team";
    pushFinding(findings, {
      id: `module-warning-${module}`,
      severity: "warning",
      module,
      title: `${module} data warning`,
      detail: warning,
      sourceIds: [],
      recommendedAction: `Check the ${module} module connection or permissions.`
    });
  }

  // Normalise jobs to Job shape
  const jobs: Job[] = modules.jobs.data.map((j: Record<string, unknown>) => ({
    id:                String(j.id ?? ''),
    name:              j.name as string | null,
    title:             j.title as string | null,
    status:            j.status as string | null,
    clientName:        (j.clientName ?? j.client_name ?? j.customer_name) as string | null,
    client:            j.client as string | null,
    clientId:          j.clientId as string | null,
    location:          (j.location ?? j.address) as string | null,
    address:           j.address as string | null,
    startDate:         (j.startDate ?? j.start_date) as string | null,
    endDate:           (j.endDate ?? j.end_date) as string | null,
    progressPercent:   j.progressPercent as number | null,
    progressStatus:    j.progressStatus as string | null,
    highRisk:          j.highRisk as boolean | null,
    riskLevel:         j.riskLevel as string | null,
    value:             j.value as number | null,
    contractValue:     j.contractValue as number | null,
    approvedEstimateId: j.approvedEstimateId as string | null,
    estimateStatus:    j.estimateStatus as string | null,
  }));

  // Jobs missing core details
  runCheck(findings, "Jobs", "missing required job details", () => {
    const missingJobs = jobs.filter((job) => {
      if (!isActiveJob(job)) return false;
      return (!job.clientName && !job.client && !job.clientId) || (!job.location && !job.address) || !job.startDate || !job.endDate;
    });
    if (missingJobs.length > 0) {
      const examples = missingJobs.slice(0, 5).map(jobLabel).join(", ");
      pushFinding(findings, {
        id: "jobs-missing-core-details",
        severity: "warning",
        module: "Jobs",
        title: `${missingJobs.length} active job${missingJobs.length === 1 ? " is" : "s are"} missing key details`,
        detail: `Missing client, location, start date, or end date. Examples: ${examples}.`,
        sourceIds: missingJobs.map((job) => job.id),
        recommendedAction: "Open each active job and add the missing client, location, start date, and end date."
      });
    }
  });

  // Overdue to-dos
  runCheck(findings, "JobTodos", "overdue job to-dos", () => {
    const overdueTodos = modules.jobTodos.data.filter((todo: Record<string, unknown>) => {
      const dueDate = String(todo.dueDate ?? todo.due_date ?? '');
      return !isClosed(String(todo.status ?? '')) && isBeforeToday(dueDate);
    });
    if (overdueTodos.length > 0) {
      pushFinding(findings, {
        id: "jobs-overdue-todos",
        severity: overdueTodos.length >= 5 ? "critical" : "warning",
        module: "JobTodos",
        title: `${overdueTodos.length} overdue job to-do${overdueTodos.length === 1 ? "" : "s"}`,
        detail: `Open to-dos are past their due date. First item: ${String((overdueTodos[0] as Record<string, unknown>)?.title ?? (overdueTodos[0] as Record<string, unknown>)?.id ?? '')}.`,
        sourceIds: overdueTodos.map((todo: Record<string, unknown>) => String(todo.id ?? '')),
        recommendedAction: "Review overdue to-dos and either complete, reassign, or update their due dates."
      });
    }
  });

  // Jobs without approved estimate
  runCheck(findings, "Jobs", "jobs without approved estimate", () => {
    if (!context.permissions.canViewEstimating) return;
    const jobsWithoutEstimate = jobs.filter((job) => isActiveJob(job) && !hasApprovedEstimate(job, context));
    if (jobsWithoutEstimate.length > 0) {
      pushFinding(findings, {
        id: "jobs-no-approved-estimate",
        severity: "warning",
        module: "Jobs",
        title: `${jobsWithoutEstimate.length} active job${jobsWithoutEstimate.length === 1 ? " has" : "s have"} no approved estimate`,
        detail: `Annette could not find an approved estimate against these active jobs. Examples: ${jobsWithoutEstimate.slice(0, 5).map(jobLabel).join(", ")}.`,
        sourceIds: jobsWithoutEstimate.map((job) => job.id),
        recommendedAction: "Attach or approve an estimate before progressing commercial work."
      });
    }
  });

  // Approved jobs with no progress
  runCheck(findings, "Jobs", "approved jobs with no progress", () => {
    const approvedNoProgress = jobs.filter((job) => isActiveJob(job) && hasApprovedEstimate(job, context) && !hasProgress(job, context));
    if (approvedNoProgress.length > 0) {
      pushFinding(findings, {
        id: "approved-jobs-no-progress",
        severity: "info",
        module: "Jobs",
        title: `${approvedNoProgress.length} approved job${approvedNoProgress.length === 1 ? " has" : "s have"} no progress recorded`,
        detail: `These jobs look approved but have no progress record yet. Examples: ${approvedNoProgress.slice(0, 5).map(jobLabel).join(", ")}.`,
        sourceIds: approvedNoProgress.map((job) => job.id),
        recommendedAction: "Add a progress update or mark the job as not started if it is waiting."
      });
    }
  });

  // Fleet service overdue
  runCheck(findings, "Fleet", "fleet service overdue", () => {
    const overdue = modules.fleet.data.filter((asset: Record<string, unknown>) =>
      isBeforeToday(String(asset.nextServiceDate ?? asset.service_date ?? asset.serviceDueDate ?? ''))
    );
    if (overdue.length > 0) {
      pushFinding(findings, {
        id: "fleet-service-overdue",
        severity: "critical",
        module: "Fleet",
        title: `${overdue.length} fleet service${overdue.length === 1 ? " is" : "s are"} overdue`,
        detail: `Service date has passed. First asset: ${String((overdue[0] as Record<string, unknown>)?.name ?? (overdue[0] as Record<string, unknown>)?.label ?? (overdue[0] as Record<string, unknown>)?.id ?? '')}.`,
        sourceIds: overdue.map((asset: Record<string, unknown>) => String(asset.id ?? '')),
        recommendedAction: "Book service or mark the asset unavailable until it is checked."
      });
    }
  });

  // Fleet rego due within 14 days
  runCheck(findings, "Fleet", "fleet rego due within 14 days", () => {
    const dueSoon = modules.fleet.data.filter((asset: Record<string, unknown>) => {
      const days = daysUntil(String(asset.registrationExpiry ?? asset.rego_expiry ?? asset.regoExpiry ?? ''));
      return days !== null && days >= 0 && days <= 14;
    });
    if (dueSoon.length > 0) {
      pushFinding(findings, {
        id: "fleet-rego-due-14-days",
        severity: "warning",
        module: "Fleet",
        title: `${dueSoon.length} fleet registration${dueSoon.length === 1 ? " is" : "s are"} due within 14 days`,
        detail: `Registration expiry is close. First asset: ${String((dueSoon[0] as Record<string, unknown>)?.name ?? (dueSoon[0] as Record<string, unknown>)?.id ?? '')}.`,
        sourceIds: dueSoon.map((asset: Record<string, unknown>) => String(asset.id ?? '')),
        recommendedAction: "Renew registration or plan downtime before the due date."
      });
    }
  });

  // Prestart issues flagged
  runCheck(findings, "FleetPrestarts", "prestart issues", () => {
    const flagged = modules.fleetPrestarts.data.filter((prestart: Record<string, unknown>) =>
      prestart.issueFlagged || prestart.hasIssue || prestart.issue_needs_attention ||
      normalized(String(prestart.status ?? '')).includes("issue") ||
      normalized(String(prestart.status ?? '')).includes("fail")
    );
    if (flagged.length > 0) {
      pushFinding(findings, {
        id: "fleet-prestart-issues",
        severity: "critical",
        module: "FleetPrestarts",
        title: `${flagged.length} fleet prestart issue${flagged.length === 1 ? "" : "s"} flagged`,
        detail: `A prestart has an issue/fail flag. Latest source: ${String((flagged[0] as Record<string, unknown>)?.id ?? '')}.`,
        sourceIds: flagged.map((prestart: Record<string, unknown>) => String(prestart.id ?? '')),
        recommendedAction: "Review failed prestarts before using the asset."
      });
    }
  });

  // Incomplete / draft forms
  runCheck(findings, "Forms", "incomplete forms", () => {
    const incomplete = modules.forms.data.filter((form: Record<string, unknown>) =>
      ["draft", "open", "incomplete", "pending"].includes(normalized(String(form.status ?? '')))
    );
    if (incomplete.length > 0) {
      pushFinding(findings, {
        id: "forms-incomplete-drafts",
        severity: "warning",
        module: "Forms",
        title: `${incomplete.length} form${incomplete.length === 1 ? " is" : "s are"} incomplete or sitting in draft`,
        detail: `First draft/open form: ${String((incomplete[0] as Record<string, unknown>)?.title ?? (incomplete[0] as Record<string, unknown>)?.template_name ?? (incomplete[0] as Record<string, unknown>)?.id ?? '')}.`,
        sourceIds: incomplete.map((form: Record<string, unknown>) => String(form.id ?? '')),
        recommendedAction: "Finish or archive old draft forms so today's portal view is clean."
      });
    }
  });

  // Missing files / photos on active jobs
  runCheck(findings, "Files", "missing job files or photos", () => {
    if (!context.permissions.canViewFiles) return;
    const activeJobs = jobs.filter(isActiveJob);
    const missingFiles = activeJobs.filter((job) => !hasAnyFileForJob(job.id, context));
    const missingPhotos = activeJobs.filter((job) => !hasPhotoForJob(job.id, context));

    if (missingFiles.length > 0) {
      pushFinding(findings, {
        id: "active-jobs-missing-files",
        severity: "info",
        module: "Files",
        title: `${missingFiles.length} active job${missingFiles.length === 1 ? " has" : "s have"} no files attached`,
        detail: `No files were found for these active jobs. Examples: ${missingFiles.slice(0, 5).map(jobLabel).join(", ")}.`,
        sourceIds: missingFiles.map((job) => job.id),
        recommendedAction: "Attach scope, estimate, purchase orders, photos, or site records to the job."
      });
    }

    if (missingPhotos.length > 0) {
      pushFinding(findings, {
        id: "active-jobs-missing-photos",
        severity: "info",
        module: "Files",
        title: `${missingPhotos.length} active job${missingPhotos.length === 1 ? " has" : "s have"} no photos attached`,
        detail: `No image/photo metadata was found for these active jobs. Examples: ${missingPhotos.slice(0, 5).map(jobLabel).join(", ")}.`,
        sourceIds: missingPhotos.map((job) => job.id),
        recommendedAction: "Add progress photos or site evidence against the job."
      });
    }
  });

  // Approved but unlocked estimates
  runCheck(findings, "Estimates", "approved but unlocked estimates", () => {
    if (!context.permissions.canViewEstimating) return;
    const approvedUnlocked = modules.estimates.data.filter((estimate: Record<string, unknown>) =>
      isApprovedStatus(String(estimate.status ?? '')) && !isLocked(estimate.locked)
    );
    if (approvedUnlocked.length > 0) {
      pushFinding(findings, {
        id: "estimates-approved-not-locked",
        severity: "warning",
        module: "Estimates",
        title: `${approvedUnlocked.length} approved estimate${approvedUnlocked.length === 1 ? " is" : "s are"} not locked`,
        detail: `Approved estimates can change unless locked. First estimate: ${String((approvedUnlocked[0] as Record<string, unknown>)?.title ?? (approvedUnlocked[0] as Record<string, unknown>)?.id ?? '')}.`,
        sourceIds: approvedUnlocked.map((estimate: Record<string, unknown>) => String(estimate.id ?? '')),
        recommendedAction: "Lock approved estimates or record a revision before changing scope or price."
      });
    }
  });

  // SWMS missing for high-risk / large jobs
  runCheck(findings, "Safety", "SWMS missing for high-risk jobs", () => {
    if (!context.permissions.canViewSafety || !modules.safety.ok) return;
    const highRiskJobs = jobs.filter((job) => isActiveJob(job) && isHighRiskOrLarge(job));
    const missingSwms = highRiskJobs.filter((job) => {
      return !modules.safety.data.some((doc: Record<string, unknown>) => {
        const type = normalized(String(doc.type ?? doc.title ?? doc.template_name ?? ''));
        const docJobId = doc.jobId ?? doc.job_id;
        return docJobId === job.id && type.includes("swms") && (doc.approved || isApprovedStatus(String(doc.status ?? '')) || normalized(String(doc.status ?? '')) === "current");
      });
    });

    if (missingSwms.length > 0) {
      pushFinding(findings, {
        id: "safety-swms-missing-high-risk",
        severity: "critical",
        module: "Safety",
        title: `${missingSwms.length} high-risk or large job${missingSwms.length === 1 ? " is" : "s are"} missing approved SWMS`,
        detail: `Annette could not find an approved/current SWMS for these jobs. Examples: ${missingSwms.slice(0, 5).map(jobLabel).join(", ")}.`,
        sourceIds: missingSwms.map((job) => job.id),
        recommendedAction: "Upload or approve SWMS before high-risk works proceed."
      });
    }
  });

  // Smart fallback if nothing found
  if (findings.length === 0) {
    pushFinding(findings, {
      id: "annette-no-critical-findings",
      severity: "info",
      module: "Team",
      title: "No immediate Annette findings",
      detail: "Annette did not find missing dates, overdue to-dos, fleet service issues, open drafts, missing files, unlocked approved estimates, or safety gaps in the loaded context.",
      sourceIds: [],
      recommendedAction: "Keep job, fleet, form, file, estimate, and safety data up to date. Good work."
    });
  }

  // Sort: Critical first, then Warning, then Info
  findings.sort((a, b) => {
    const scoreA = priorityScore(a);
    const scoreB = priorityScore(b);
    if (scoreA !== scoreB) return scoreB - scoreA;
    return 0;
  });

  return findings;
}
