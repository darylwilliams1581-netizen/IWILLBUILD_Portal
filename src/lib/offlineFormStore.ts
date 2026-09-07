const MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;

interface CachedValue<T> {
  savedAt: string;
  value: T;
}

function readValue<T>(key: string): T | null {
  if (typeof localStorage === 'undefined') return null;
  try {
    const cached = JSON.parse(localStorage.getItem(key) ?? 'null') as CachedValue<T> | null;
    if (!cached || Date.now() - Date.parse(cached.savedAt) > MAX_AGE_MS) return null;
    return cached.value;
  } catch {
    return null;
  }
}

function writeValue<T>(key: string, value: T): void {
  if (typeof localStorage === 'undefined') return;
  localStorage.setItem(key, JSON.stringify({ savedAt: new Date().toISOString(), value }));
}

export function readCachedFormFields<T>(templateId: number): T[] {
  return readValue<T[]>(`iwb_form_fields_${templateId}`) ?? [];
}

export function cacheFormFields<T>(templateId: number, fields: T[]): void {
  writeValue(`iwb_form_fields_${templateId}`, fields);
}

export function readCachedFormAnswers<T>(submissionId: number): T | null {
  return readValue<T>(`iwb_form_answers_${submissionId}`);
}

export function cacheFormAnswers<T>(submissionId: number, answers: T): void {
  writeValue(`iwb_form_answers_${submissionId}`, answers);
}

export function readCachedFormShell<T>(submissionId: number): T | null {
  return readValue<T>(`iwb_form_shell_${submissionId}`);
}

export function cacheFormShell<T>(submissionId: number, shell: T): void {
  writeValue(`iwb_form_shell_${submissionId}`, shell);
}

export function readCachedJobForms<T>(jobId: number): T | null {
  return readValue<T>(`iwb_job_forms_${jobId}`);
}

export function cacheJobForms<T>(jobId: number, forms: T): void {
  writeValue(`iwb_job_forms_${jobId}`, forms);
}
