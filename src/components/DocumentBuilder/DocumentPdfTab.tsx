/**
 * DocumentPdfTab — PDF Output settings panel for the Studio builder.
 *
 * Mirrors the structure of Settings → PDF / Print Style but operates at
 * per-template level. Each section can either inherit the company default
 * (null) or override it with a template-specific value.
 *
 * Sections:
 *  1. Cover Page   — toggle + title/subtitle/date/logo position + job fields
 *  2. Header       — text override (null = inherit)
 *  3. Footer + Disclaimer — text + disclaimer in footer (null = inherit)
 *  4. Display      — logo toggle, page numbers, footer toggle
 */

import { useState, useEffect } from 'react';
import {
  FileText, ToggleLeft, ToggleRight, BookOpen, AlignLeft,
  AlignCenter, AlignRight, Info, RotateCcw, Eye, EyeOff,
} from 'lucide-react';
import type { TemplatePdfSettings } from './types';
import { DEFAULT_TEMPLATE_PDF_SETTINGS } from './types';

// ── Shared style helpers ──────────────────────────────────────────────────────
const labelClass = 'block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1.5';
const inputClass =
  'w-full border border-slate-200 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary transition-colors bg-white disabled:opacity-50 disabled:cursor-not-allowed';
const textareaClass = `${inputClass} resize-y min-h-[72px]`;

// ── Toggle row ────────────────────────────────────────────────────────────────
function ToggleRow({
  label,
  description,
  checked,
  onChange,
}: {
  label: string;
  description?: string;
  checked: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <div className="flex items-center justify-between gap-4 py-3 border-b border-slate-100 last:border-0">
      <div>
        <p className="text-sm font-semibold text-slate-700">{label}</p>
        {description && <p className="text-xs text-slate-400 mt-0.5">{description}</p>}
      </div>
      <button
        type="button"
        onClick={() => onChange(!checked)}
        className="flex-shrink-0 cursor-pointer transition-colors"
        aria-pressed={checked}
      >
        {checked
          ? <ToggleRight size={28} className="text-primary" />
          : <ToggleLeft size={28} className="text-slate-300" />}
      </button>
    </div>
  );
}

// ── Override row — null means "inherit company default" ───────────────────────
function OverrideToggleRow({
  label,
  description,
  value,
  onChange,
}: {
  label: string;
  description?: string;
  value: boolean | null;
  onChange: (v: boolean | null) => void;
}) {
  const isInherited = value === null;
  const effective = value ?? true;

  return (
    <div className="flex items-center justify-between gap-4 py-3 border-b border-slate-100 last:border-0">
      <div className="min-w-0">
        <p className="text-sm font-semibold text-slate-700">{label}</p>
        {description && <p className="text-xs text-slate-400 mt-0.5">{description}</p>}
        {isInherited && (
          <span className="inline-flex items-center gap-1 text-[10px] font-semibold text-slate-400 bg-slate-100 px-1.5 py-0.5 rounded-full mt-1">
            <Info size={9} /> Inheriting company default
          </span>
        )}
      </div>
      <div className="flex items-center gap-2 shrink-0">
        {!isInherited && (
          <button
            type="button"
            onClick={() => onChange(null)}
            className="text-[10px] text-slate-500 hover:text-primary transition-colors flex items-center gap-0.5"
            title="Reset to company default"
          >
            <RotateCcw size={10} /> Reset
          </button>
        )}
        <button
          type="button"
          onClick={() => onChange(isInherited ? !effective : !effective)}
          className="cursor-pointer transition-colors"
          aria-pressed={effective}
        >
          {effective
            ? <ToggleRight size={28} className={isInherited ? 'text-slate-300' : 'text-primary'} />
            : <ToggleLeft size={28} className="text-slate-300" />}
        </button>
      </div>
    </div>
  );
}

// ── Override textarea — null means "inherit company default" ──────────────────
function OverrideTextarea({
  label,
  hint,
  placeholder,
  value,
  onChange,
}: {
  label: string;
  hint?: string;
  placeholder?: string;
  value: string | null;
  onChange: (v: string | null) => void;
}) {
  const isInherited = value === null;

  return (
    <div>
      <div className="flex items-center justify-between mb-1.5">
        <label className={labelClass.replace('mb-1.5', '')}>{label}</label>
        {isInherited ? (
          <span className="inline-flex items-center gap-1 text-[10px] font-semibold text-slate-400 bg-slate-100 px-1.5 py-0.5 rounded-full">
            <Info size={9} /> Company default
          </span>
        ) : (
          <button
            type="button"
            onClick={() => onChange(null)}
            className="text-[10px] text-slate-500 hover:text-primary transition-colors flex items-center gap-0.5"
          >
            <RotateCcw size={10} /> Reset to default
          </button>
        )}
      </div>
      <textarea
        className={textareaClass}
        value={isInherited ? '' : value}
        placeholder={isInherited ? '(using company default)' : placeholder}
        disabled={isInherited}
        onChange={(e) => onChange(e.target.value)}
        onFocus={() => { if (isInherited) onChange(''); }}
      />
      {hint && <p className="text-xs text-slate-400 mt-1">{hint}</p>}
    </div>
  );
}

// ── Logo position picker ──────────────────────────────────────────────────────
const LOGO_POSITIONS = [
  { value: 'top-left',   label: 'Left',   Icon: AlignLeft },
  { value: 'top-center', label: 'Centre', Icon: AlignCenter },
  { value: 'top-right',  label: 'Right',  Icon: AlignRight },
] as const;

// ── Main component ────────────────────────────────────────────────────────────
interface Props {
  settings: TemplatePdfSettings;
  onChange: (next: TemplatePdfSettings) => void;
  templateName?: string;
}

export default function DocumentPdfTab({ settings, onChange, templateName }: Props) {
  // Merge with defaults so older templates without pdfSettings still work
  const s: TemplatePdfSettings = { ...DEFAULT_TEMPLATE_PDF_SETTINGS, ...settings };

  function set<K extends keyof TemplatePdfSettings>(key: K, value: TemplatePdfSettings[K]) {
    onChange({ ...s, [key]: value });
  }

  // Populate coverTitle from template name on first enable
  const [autoFilledTitle, setAutoFilledTitle] = useState(false);
  useEffect(() => {
    if (s.coverPageEnabled && !s.coverTitle && templateName && !autoFilledTitle) {
      set('coverTitle', templateName);
      setAutoFilledTitle(true);
    }
  }, [s.coverPageEnabled]);

  return (
    <div className="flex flex-col gap-5 p-5 overflow-y-auto h-full">

      {/* ── Info banner ─────────────────────────────────────────────────────── */}
      <div className="flex items-start gap-2.5 bg-blue-50 border border-blue-200 rounded-xl px-4 py-3">
        <Info size={14} className="text-blue-500 mt-0.5 shrink-0" />
        <p className="text-xs text-blue-700 leading-relaxed">
          These settings control how this template renders as a PDF. Fields marked
          <span className="font-semibold"> "Company default"</span> inherit from
          <span className="font-semibold"> Settings → PDF / Print Style</span>.
          Click a field to override it for this template only.
        </p>
      </div>

      {/* ── Cover Page ──────────────────────────────────────────────────────── */}
      <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
        <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between">
          <div>
            <h3 className="font-bold text-sm text-slate-800 flex items-center gap-2">
              <BookOpen size={14} className="text-primary" /> Cover Page
            </h3>
            <p className="text-xs text-slate-400 mt-0.5">
              A standalone title page prepended to the PDF before the content.
            </p>
          </div>
          <button
            type="button"
            onClick={() => set('coverPageEnabled', !s.coverPageEnabled)}
            className="flex-shrink-0 cursor-pointer"
            aria-pressed={s.coverPageEnabled}
          >
            {s.coverPageEnabled
              ? <ToggleRight size={28} className="text-primary" />
              : <ToggleLeft size={28} className="text-slate-300" />}
          </button>
        </div>

        {s.coverPageEnabled && (
          <div className="px-5 py-4 flex flex-col gap-4">
            {/* Title */}
            <div>
              <label className={labelClass}>Cover Title</label>
              <input
                type="text"
                className={inputClass}
                value={s.coverTitle}
                onChange={(e) => set('coverTitle', e.target.value)}
                placeholder={templateName ?? 'Document title'}
              />
              <p className="text-xs text-slate-400 mt-1">Defaults to template name if left blank.</p>
            </div>

            {/* Subtitle */}
            <div>
              <label className={labelClass}>Subtitle</label>
              <input
                type="text"
                className={inputClass}
                value={s.coverSubtitle}
                onChange={(e) => set('coverSubtitle', e.target.value)}
                placeholder="e.g. Prepared by IWILLBUILD Pty Ltd"
              />
            </div>

            {/* Date */}
            <div>
              <label className={labelClass}>Date on Cover</label>
              <div className="flex items-center gap-2">
                {[
                  { value: 'auto', label: "Today's date (auto)" },
                  { value: 'none', label: 'No date' },
                ].map((opt) => (
                  <button
                    key={opt.value}
                    type="button"
                    onClick={() => set('coverDate', opt.value as 'auto' | 'none')}
                    className={`flex-1 py-2 px-3 rounded-lg border text-xs font-semibold transition-all ${
                      s.coverDate === opt.value
                        ? 'border-primary bg-orange-50 text-primary'
                        : 'border-slate-200 text-slate-500 hover:border-slate-300'
                    }`}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Logo position */}
            <div>
              <label className={labelClass}>Logo Position</label>
              <div className="flex items-center gap-2">
                {LOGO_POSITIONS.map(({ value, label, Icon }) => (
                  <button
                    key={value}
                    type="button"
                    onClick={() => set('coverLogoPosition', value)}
                    className={`flex-1 flex flex-col items-center gap-1.5 py-2.5 rounded-lg border text-xs font-semibold transition-all ${
                      s.coverLogoPosition === value
                        ? 'border-primary bg-orange-50 text-primary'
                        : 'border-slate-200 text-slate-500 hover:border-slate-300'
                    }`}
                  >
                    <Icon size={14} />
                    {label}
                  </button>
                ))}
              </div>
            </div>

            {/* Job fields */}
            <div>
              <label className={labelClass}>Job Fields on Cover</label>
              <p className="text-xs text-slate-400 mb-2">
                When this document is linked to a job, these fields are auto-populated on the cover page.
              </p>
              <div className="flex flex-col gap-0 border border-slate-200 rounded-lg overflow-hidden divide-y divide-slate-100">
                {[
                  { key: 'coverShowJobNumber',  label: 'Job Number' },
                  { key: 'coverShowJobName',    label: 'Job Name' },
                  { key: 'coverShowClientName', label: 'Client Name' },
                  { key: 'coverShowSiteAddress',label: 'Site Address' },
                ].map(({ key, label }) => (
                  <div key={key} className="flex items-center justify-between px-3 py-2.5">
                    <span className="text-sm text-slate-700">{label}</span>
                    <button
                      type="button"
                      onClick={() => set(key as keyof TemplatePdfSettings, !s[key as keyof TemplatePdfSettings] as never)}
                      className="cursor-pointer"
                    >
                      {s[key as keyof TemplatePdfSettings]
                        ? <ToggleRight size={24} className="text-primary" />
                        : <ToggleLeft size={24} className="text-slate-300" />}
                    </button>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}
      </div>

      {/* ── Header ──────────────────────────────────────────────────────────── */}
      <div className="bg-white border border-slate-200 rounded-xl p-5 flex flex-col gap-4">
        <div>
          <h3 className="font-bold text-sm text-slate-800 flex items-center gap-2">
            <FileText size={14} className="text-primary" /> Header
          </h3>
          <p className="text-xs text-slate-400 mt-0.5">
            Appears at the top of every page. Overrides the company-wide header text for this template only.
          </p>
        </div>

        <OverrideTextarea
          label="Header Text"
          placeholder="e.g. SAFE WORK METHOD STATEMENT — IWILLBUILD Pty Ltd"
          hint="Leave as company default to use the value from Settings → PDF / Print Style."
          value={s.headerTextOverride}
          onChange={(v) => set('headerTextOverride', v)}
        />

        <OverrideToggleRow
          label="Show logo in header"
          description="Display company logo in the PDF header for this template."
          value={s.showLogoOverride}
          onChange={(v) => set('showLogoOverride', v)}
        />
      </div>

      {/* ── Footer + Disclaimer ─────────────────────────────────────────────── */}
      <div className="bg-white border border-slate-200 rounded-xl p-5 flex flex-col gap-4">
        <div>
          <h3 className="font-bold text-sm text-slate-800 flex items-center gap-2">
            <AlignLeft size={14} className="text-primary" /> Footer &amp; Disclaimer
          </h3>
          <p className="text-xs text-slate-400 mt-0.5">
            Footer text and disclaimer are combined at the bottom of every page.
          </p>
        </div>

        <OverrideToggleRow
          label="Show footer"
          description="Include footer and disclaimer at the bottom of each page."
          value={s.showFooterOverride}
          onChange={(v) => set('showFooterOverride', v)}
        />

        <OverrideTextarea
          label="Footer Text"
          placeholder="e.g. Thank you for your business. All prices are in AUD."
          hint="Shown at the bottom of every page when footer is enabled."
          value={s.footerTextOverride}
          onChange={(v) => set('footerTextOverride', v)}
        />

        <OverrideTextarea
          label="Disclaimer"
          placeholder="e.g. This document is a record of work completed on site. Accuracy is the responsibility of the signing party."
          hint="Appended after the footer text. Leave as company default to use the form/report disclaimer from Settings."
          value={s.disclaimerOverride}
          onChange={(v) => set('disclaimerOverride', v)}
        />
      </div>

      {/* ── Display options ──────────────────────────────────────────────────── */}
      <div className="bg-white border border-slate-200 rounded-xl p-5 flex flex-col gap-0">
        <h3 className="font-bold text-sm text-slate-800 mb-1 flex items-center gap-2">
          <Eye size={14} className="text-primary" /> Display Options
        </h3>
        <p className="text-xs text-slate-400 mb-3">Additional per-template display controls.</p>

        <ToggleRow
          label="Show page numbers"
          description="Print page X of Y at the bottom of each page."
          checked={s.showPageNumbers}
          onChange={(v) => set('showPageNumbers', v)}
        />
      </div>

      {/* ── Reset all ───────────────────────────────────────────────────────── */}
      <div className="flex justify-end pb-2">
        <button
          type="button"
          onClick={() => onChange({ ...DEFAULT_TEMPLATE_PDF_SETTINGS })}
          className="flex items-center gap-1.5 text-xs text-slate-600 hover:text-slate-800 transition-colors"
        >
          <RotateCcw size={11} /> Reset all to defaults
        </button>
      </div>

    </div>
  );
}
