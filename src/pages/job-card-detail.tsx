/**
 * /job-cards/:id — Desktop Job Card detail + edit
 *
 * Polish pass:
 * - Photo upload section with delete, live preview grid
 * - Canvas signature pad (draw-to-sign, clear, save as base64)
 * - Customer auto-fill: selecting a customer record pre-fills site/contact
 * - Status badge (card lifecycle) + Invoice badge (billing state) shown separately
 * - Edit panel: status, customer, site, work, labour, materials, completion, notes
 * - Invoice modal: line-item preview, GST toggle, issue/due date
 * - Convert modal: create Full Job from card
 */
import { useState, useEffect, useRef, useCallback } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { Helmet } from '@dr.pogodin/react-helmet';
import DesktopTopBar from '@/components/DesktopTopBar';
import DesktopDock from '@/components/DesktopDock';
import {
  ChevronLeft, Edit2, Save, X, Plus, Trash2,
  RefreshCw, AlertCircle, CheckCircle2, Receipt, ArrowRightLeft,
  Clock, FileText, Camera, User, MapPin,
  Wrench, DollarSign, StickyNote, ClipboardCheck,
  ExternalLink, Upload, PenLine, RotateCcw, Image,
  Grid2x2, Grid3x3, LayoutGrid, Loader2,
} from 'lucide-react';

import { useUploadQueue } from '@/hooks/useUploadQueue';
import PhotoEditor from '@/components/PhotoEditor';
import type { EditorConfig } from '@/components/PhotoEditor';
import type { JobPhoto } from '@/components/JobPhotos';
import { usePermissions } from '@/lib/usePermissions';
import { JOB_CARD_PHOTO_EDITOR_ENABLED } from '@/lib/featureFlags';

// ── Types ─────────────────────────────────────────────────────────────────────
interface Material { id?: number; description: string; cost: number; }
interface Photo { id: number; file_path: string; file_name: string; caption: string | null; url?: string; }

interface JobCard {
  id: number;
  card_number: string;
  status: string;
  customer_id: number | null;
  customer_name: string | null;
  customer_name_override: string | null;
  customer_phone: string | null;
  customer_email: string | null;
  customer_address: string | null;
  site_address: string | null;
  contact_person: string | null;
  contact_phone: string | null;
  po_number: string | null;
  service_date: string | null;
  assigned_user_id: string | null;
  assigned_name: string | null;
  work_description: string;
  labour_hours: number | null;
  labour_rate: number | null;
  labour_amount: number | null;
  notes: string | null;
  internal_notes: string | null;
  completion_summary: string | null;
  authorised_by: string | null;
  signature_data: string | null;
  approval_date: string | null;
  invoice_id: number | null;
  converted_job_id: number | null;
  created_at: string;
  updated_at: string;
  materials: Material[];
  photos: Photo[];
}

interface Customer { id: number; name: string; phone?: string | null; email?: string | null; address?: string | null; }
interface TeamMember { id: string; name: string; }

// ── Helpers ───────────────────────────────────────────────────────────────────
const STATUS_META: Record<string, { label: string; cls: string; icon: React.ElementType }> = {
  draft:     { label: 'Draft',     cls: 'bg-gray-100 text-gray-600',    icon: Clock },
  complete:  { label: 'Complete',  cls: 'bg-green-100 text-green-700',  icon: CheckCircle2 },
  invoiced:  { label: 'Invoiced',  cls: 'bg-blue-100 text-blue-700',    icon: Receipt },
  converted: { label: 'Converted', cls: 'bg-violet-100 text-violet-700',icon: ArrowRightLeft },
};

function StatusBadge({ status }: { status: string }) {
  const meta = STATUS_META[status] ?? { label: status, cls: 'bg-gray-100 text-gray-500', icon: AlertCircle };
  const Icon = meta.icon;
  return (
    <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[12px] font-semibold ${meta.cls}`}>
      <Icon size={11} />
      {meta.label}
    </span>
  );
}

function fmtDate(d: string | null) {
  if (!d) return '—';
  return new Date(d).toLocaleDateString('en-AU', { day: 'numeric', month: 'short', year: 'numeric' });
}

function fmtCurrency(n: number | null | undefined) {
  if (n == null) return '—';
  return `$${Number(n).toLocaleString('en-AU', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

// ── Section card ──────────────────────────────────────────────────────────────
function Section({ title, icon: Icon, children, action }: {
  title: string;
  icon: React.ElementType;
  children: React.ReactNode;
  action?: React.ReactNode;
}) {
  return (
    <div className="bg-white rounded-xl border border-gray-100 overflow-hidden">
      <div className="flex items-center gap-2 px-4 py-3 border-b border-gray-50">
        <Icon size={14} className="text-gray-400 shrink-0" />
        <h2 className="text-[12px] font-bold text-gray-500 uppercase tracking-wide flex-1">{title}</h2>
        {action}
      </div>
      <div className="px-4 py-3">{children}</div>
    </div>
  );
}

function Field({ label, value, mono = false }: { label: string; value: React.ReactNode; mono?: boolean }) {
  return (
    <div>
      <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wide mb-0.5">{label}</p>
      <p className={`text-[13px] text-gray-800 ${mono ? 'font-mono' : ''}`}>{value || '—'}</p>
    </div>
  );
}

// ── Signature pad ─────────────────────────────────────────────────────────────
function SignaturePad({ value, onChange }: { value: string | null; onChange: (v: string | null) => void }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const drawing = useRef(false);
  const [hasStrokes, setHasStrokes] = useState(false);

  // If there's a saved value, draw it on mount
  useEffect(() => {
    if (value && canvasRef.current) {
      const img = new window.Image();
      img.onload = () => {
        const ctx = canvasRef.current?.getContext('2d');
        if (ctx && canvasRef.current) {
          ctx.clearRect(0, 0, canvasRef.current.width, canvasRef.current.height);
          ctx.drawImage(img, 0, 0);
          setHasStrokes(true);
        }
      };
      img.src = value;
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  function getPos(e: React.MouseEvent | React.TouchEvent) {
    const canvas = canvasRef.current!;
    const rect = canvas.getBoundingClientRect();
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;
    if ('touches' in e) {
      return {
        x: (e.touches[0].clientX - rect.left) * scaleX,
        y: (e.touches[0].clientY - rect.top) * scaleY,
      };
    }
    return {
      x: (e.clientX - rect.left) * scaleX,
      y: (e.clientY - rect.top) * scaleY,
    };
  }

  function startDraw(e: React.MouseEvent | React.TouchEvent) {
    e.preventDefault();
    drawing.current = true;
    const ctx = canvasRef.current?.getContext('2d');
    if (!ctx) return;
    const { x, y } = getPos(e);
    ctx.beginPath();
    ctx.moveTo(x, y);
  }

  function draw(e: React.MouseEvent | React.TouchEvent) {
    e.preventDefault();
    if (!drawing.current) return;
    const ctx = canvasRef.current?.getContext('2d');
    if (!ctx) return;
    const { x, y } = getPos(e);
    ctx.lineWidth = 2;
    ctx.lineCap = 'round';
    ctx.strokeStyle = '#1e293b';
    ctx.lineTo(x, y);
    ctx.stroke();
    setHasStrokes(true);
  }

  function endDraw(e: React.MouseEvent | React.TouchEvent) {
    e.preventDefault();
    if (!drawing.current) return;
    drawing.current = false;
    const dataUrl = canvasRef.current?.toDataURL('image/png') ?? null;
    onChange(dataUrl);
  }

  function clear() {
    const ctx = canvasRef.current?.getContext('2d');
    if (ctx && canvasRef.current) {
      ctx.clearRect(0, 0, canvasRef.current.width, canvasRef.current.height);
    }
    setHasStrokes(false);
    onChange(null);
  }

  return (
    <div className="flex flex-col gap-2">
      <div className="relative border-2 border-dashed border-gray-200 rounded-lg bg-gray-50 overflow-hidden" style={{ touchAction: 'none' }}>
        <canvas
          ref={canvasRef}
          width={480}
          height={160}
          className="w-full cursor-crosshair block"
          style={{ height: '120px' }}
          onMouseDown={startDraw}
          onMouseMove={draw}
          onMouseUp={endDraw}
          onMouseLeave={endDraw}
          onTouchStart={startDraw}
          onTouchMove={draw}
          onTouchEnd={endDraw}
        />
        {!hasStrokes && !value && (
          <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
            <span className="text-[12px] text-gray-300 font-medium flex items-center gap-1.5">
              <PenLine size={13} />
              Sign here
            </span>
          </div>
        )}
      </div>
      <div className="flex items-center justify-between">
        <p className="text-[11px] text-gray-400">Draw signature above</p>
        {(hasStrokes || value) && (
          <button onClick={clear} className="flex items-center gap-1 text-[11px] text-gray-400 hover:text-red-500 transition-colors">
            <RotateCcw size={11} />
            Clear
          </button>
        )}
      </div>
    </div>
  );
}

// ── Photo upload section ──────────────────────────────────────────────────────
function PhotoSection({ cardId, photos, onPhotosChange, cardTitle }: {
  cardId: number;
  photos: Photo[];
  onPhotosChange: (photos: Photo[]) => void;
  cardTitle?: string;
}) {
  const { isAdmin } = usePermissions();
  const navigate = useNavigate();
  const editorEnabled = JOB_CARD_PHOTO_EDITOR_ENABLED && isAdmin;

  type ViewSize = 'small' | 'medium' | 'large';
  const [viewSize, setViewSize] = useState<ViewSize>(() => {
    try {
      const s = localStorage.getItem('jobCardPhotosZoom');
      if (s === 'small' || s === 'medium' || s === 'large') return s;
    } catch (_) {}
    return window.innerWidth < 768 ? 'small' : 'medium';
  });
  const handleSetViewSize = (s: ViewSize) => {
    setViewSize(s);
    try { localStorage.setItem('jobCardPhotosZoom', s); } catch (_) {}
  };

  const colsClass = viewSize === 'large' ? 'grid-cols-2 sm:grid-cols-3' : viewSize === 'small' ? 'grid-cols-4 sm:grid-cols-5 md:grid-cols-6' : 'grid-cols-3 sm:grid-cols-4 md:grid-cols-5';

  const [editorConfig, setEditorConfig] = useState<EditorConfig | null>(null);

  /** Build an EditorConfig adapter for a Job Card photo */
  function buildConfig(p: Photo): EditorConfig {
    const cardIdStr = String(cardId);
    const photoIdStr = String(p.id);

    return {
      imageUrl:  p.url ?? p.file_path,
      photoId:   p.id,
      label:     p.caption,
      createdAt: '',          // job_card_photos has no created_at exposed in the Photo type yet
      isLocked:  false,       // locked column added by migration; default false until row is updated
      canEdit:   editorEnabled,
      jobName:   cardTitle,

      onClose: () => setEditorConfig(null),

      onDownload: () => {
        const url = `/api/job-cards/${cardIdStr}/photos/${photoIdStr}/download`;
        fetch(url, { credentials: 'include' })
          .then((r) => {
            const cd = r.headers.get('Content-Disposition') ?? '';
            let name = '';
            const utf8Match = cd.match(/filename\*=UTF-8''([^;]+)/i);
            if (utf8Match) { try { name = decodeURIComponent(utf8Match[1]); } catch { /* ignore */ } }
            if (!name) { const m = cd.match(/filename="?([^";]+)"?/i); if (m) name = m[1].trim(); }
            if (!name) name = p.caption ?? p.file_name ?? `job-card-${cardId}-photo-${p.id}.jpg`;
            return r.blob().then((blob) => ({ blob, name }));
          })
          .then(({ blob, name }) => {
            const objectUrl = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = objectUrl; a.download = name;
            document.body.appendChild(a); a.click(); document.body.removeChild(a);
            setTimeout(() => URL.revokeObjectURL(objectUrl), 10_000);
          })
          .catch(console.error);
      },

      onSaveLabel: async (label) => {
        const res = await fetch(`/api/job-cards/${cardIdStr}/photos/${photoIdStr}`, {
          method: 'PATCH',
          credentials: 'include',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ caption: label }),
        });
        if (!res.ok) throw new Error('Failed to save label');
        // Update local state so the grid reflects the new caption
        onPhotosChange(photos.map((ph) => ph.id === p.id ? { ...ph, caption: label } : ph));
      },

      onSaveAndLock: async (blob) => {
        const fd = new FormData();
        fd.append('photo', blob, 'edited.jpg');
        const res = await fetch(`/api/job-cards/${cardIdStr}/photos/${photoIdStr}/save-and-lock`, {
          method: 'POST',
          credentials: 'include',
          body: fd,
        });
        const data = await res.json() as { ok?: boolean; error?: string; photo?: Record<string, unknown> };
        if (!res.ok) throw new Error(data.error ?? 'Save & Lock failed');
        // Refresh the photo list from the updated record
        if (data.photo) {
          const updated = data.photo;
          onPhotosChange(photos.map((ph) =>
            ph.id === p.id
              ? {
                  ...ph,
                  file_path: String(updated.file_path ?? ph.file_path),
                  url: typeof updated.url === 'string' ? updated.url : ph.url,
                }
              : ph
          ));
        }
      },

      onSaved: () => setEditorConfig(null),
    };
  }

  // Legacy adapter: map job-card Photo → minimal JobPhoto for readOnly view
  // (used when feature flag is off or user is not admin)
  function toJobPhoto(p: Photo): JobPhoto {
    return {
      id: p.id,
      jobId: 0,
      companyId: 0,
      filename: p.file_name,
      originalName: p.file_name,
      label: p.caption,
      mimeType: null,
      sizeBytes: null,
      uploadedByUserId: null,
      uploadedByName: null,
      createdAt: '',
      url: p.url ?? p.file_path,
      thumbnailUrl: p.url ?? p.file_path,
      previewUrl: p.url ?? p.file_path,
      imageWidth: null,
      imageHeight: null,
      status: 'draft',
      lockedAt: null,
      lockedByUserId: null,
      lockedByName: null,
      mediaAssetId: null,
    };
  }

  const [legacyEditorPhoto, setLegacyEditorPhoto] = useState<JobPhoto | null>(null);
  const q = useUploadQueue({
    endpoint: `/api/job-cards/${cardId}/photos`,
    fieldName: 'photos',
    accept: 'image/*',
    multiple: true,
    onSuccess: (results) => {
      // Server returns { photos: [...] } — reload from the first result's response
      const resp = results[0]?.response as { photos?: Photo[] } | undefined;
      if (resp?.photos) onPhotosChange([...photos, ...resp.photos]);
    },
  });
  const uploading = q.isUploading;
  const uploadError = q.queue.find(i => i.status === 'failed')?.error ?? '';
  const fileInputRef = q.inputRef;

  async function handleDelete(photoId: number) {
    try {
      await fetch(`/api/job-cards/${cardId}/photos/${photoId}`, {
        method: 'DELETE',
        credentials: 'include',
      });
      onPhotosChange(photos.filter(p => p.id !== photoId));
    } catch {
      // silent — photo stays in list
    }
  }

  function handlePhotoClick(p: Photo) {
    if (editorEnabled) {
      setEditorConfig(buildConfig(p));
    } else {
      setLegacyEditorPhoto(toJobPhoto(p));
    }
  }

  return (
    <>
    <Section
      title={`Photos${photos.length > 0 ? ` (${photos.length})` : ''}`}
      icon={Camera}
    >
      {/* ── Toolbar: Upload | Camera | tile-size toggle ── */}
      <div className="flex items-center gap-1.5 mb-3">
        {/* Photo count */}
        <span className="text-xs text-muted-foreground mr-1 shrink-0">
          {photos.length} photo{photos.length !== 1 ? 's' : ''}
        </span>

        {/* Upload — icon only, bordered, no fill */}
        <button
          onClick={() => fileInputRef.current?.click()}
          disabled={uploading}
          title="Upload photos"
          className="flex items-center justify-center w-8 h-8 border border-border hover:bg-muted disabled:opacity-50 text-foreground rounded-lg transition-colors"
        >
          {uploading ? <Loader2 size={14} className="animate-spin" /> : <Upload size={14} />}
        </button>

        {/* Camera — purple, icon only */}
        <button
          onClick={() => navigate(`/job-cards/${cardId}/camera`, {
            state: {
              uploadEndpoint: `/api/job-cards/${cardId}/photos`,
              backPath: `/job-cards/${cardId}`,
              jobName: cardTitle,
            },
          })}
          title="Take a photo"
          className="flex items-center justify-center w-8 h-8 bg-primary hover:bg-violet-700 text-white rounded-lg transition-colors"
        >
          <Camera size={16} />
        </button>

        {/* Tile size toggle */}
        <div className="ml-auto flex items-center bg-muted rounded-lg overflow-hidden shrink-0">
          {(['small', 'medium', 'large'] as const).map((size) => (
            <button
              key={size}
              onClick={() => handleSetViewSize(size)}
              title={`${size.charAt(0).toUpperCase() + size.slice(1)} thumbnails`}
              className={`px-2 py-1.5 transition-colors ${viewSize === size ? 'bg-white text-gray-800 shadow-sm' : 'text-muted-foreground hover:text-foreground'}`}
            >
              {size === 'small' ? <Grid3x3 size={12} /> : size === 'medium' ? <Grid2x2 size={12} /> : <LayoutGrid size={12} />}
            </button>
          ))}
        </div>
      </div>

      {/* Hidden file input */}
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        multiple
        className="hidden"
        onChange={q.handleInputChange}
      />

      {uploadError && (
        <div className="mb-3 bg-red-50 border border-red-200 rounded-lg overflow-hidden">
          <div className="flex items-center gap-2 px-3 py-2 border-b border-red-200">
            <AlertCircle size={13} className="shrink-0 text-red-600" />
            <span className="text-sm font-semibold text-red-700 flex-1">Upload failed</span>
            <button
              onClick={() => {
                void navigator.clipboard.writeText(uploadError).then(() => {
                  const btn = document.getElementById('copy-upload-error-btn');
                  if (btn) { btn.textContent = 'Copied!'; setTimeout(() => { btn.textContent = 'Copy'; }, 2000); }
                });
              }}
              id="copy-upload-error-btn"
              className="text-[11px] font-semibold px-2 py-0.5 rounded bg-red-100 hover:bg-red-200 text-red-700 transition-colors"
            >
              Copy
            </button>
            <button
              onClick={() => q.clearAll()}
              className="text-[11px] font-semibold px-2 py-0.5 rounded bg-red-100 hover:bg-red-200 text-red-700 transition-colors"
            >
              ✕
            </button>
          </div>
          {/* user-select: text so the message is selectable on mobile */}
          <pre
            className="px-3 py-2 text-[11px] text-red-800 whitespace-pre-wrap break-all font-mono leading-relaxed"
            style={{ userSelect: 'text', WebkitUserSelect: 'text' }}
          >
            {uploadError}
          </pre>
        </div>
      )}

      {photos.length === 0 && !uploading ? (
        <button
          onClick={() => fileInputRef.current?.click()}
          className="w-full flex flex-col items-center justify-center gap-2 py-8 border-2 border-dashed border-gray-200 rounded-lg text-gray-400 hover:border-yellow-300 hover:text-yellow-600 transition-colors"
        >
          <Image size={24} className="text-gray-200" />
          <span className="text-[12px] font-medium">Tap to add photos</span>
          <span className="text-[11px]">Camera, gallery or files</span>
        </button>
      ) : (
        <div className={`grid ${colsClass} gap-2`}>
          {photos.map(p => (
            <div key={p.id} className="relative group aspect-square rounded-lg overflow-hidden bg-gray-100">
              <button
                type="button"
                className="w-full h-full"
                onClick={() => handlePhotoClick(p)}
              >
                <img
                  src={p.url ?? p.file_path}
                  alt={p.caption ?? p.file_name}
                  className="w-full h-full object-cover hover:opacity-90 transition-opacity"
                  loading="lazy"
                />
              </button>
              <button
                onClick={() => void handleDelete(p.id)}
                className="absolute top-1 right-1 w-5 h-5 rounded-full bg-black/60 text-white flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity hover:bg-red-600"
                title="Remove photo"
              >
                <X size={10} />
              </button>
            </div>
          ))}
          {uploading && (
            <div className="aspect-square rounded-lg bg-gray-100 flex items-center justify-center">
              <RefreshCw size={16} className="animate-spin text-gray-400" />
            </div>
          )}
        </div>
      )}
    </Section>
    {/* Full editor — admins with flag enabled */}
    {editorConfig && (
      <PhotoEditor
        config={editorConfig}
        onClose={editorConfig.onClose}
        onSaved={() => setEditorConfig(null)}
      />
    )}
    {/* Legacy read-only viewer — non-admins or flag disabled */}
    {legacyEditorPhoto && (
      <PhotoEditor
        photo={legacyEditorPhoto}
        readOnly
        onClose={() => setLegacyEditorPhoto(null)}
        onSaved={() => setLegacyEditorPhoto(null)}
      />
    )}
    </>
  );
}

// ── Invoice modal ─────────────────────────────────────────────────────────────
function InvoiceModal({ card, open, onClose, onDone }: {
  card: JobCard;
  open: boolean;
  onClose: () => void;
  onDone: (invoiceId: number) => void;
}) {
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [issueDate, setIssueDate] = useState(new Date().toISOString().slice(0, 10));
  const [dueDate, setDueDate] = useState('');
  const [notes, setNotes] = useState(card.notes ?? '');
  const [includeGst, setIncludeGst] = useState(true);

  const labour = Number(card.labour_amount ?? 0);
  const mats = card.materials.reduce((s, m) => s + Number(m.cost ?? 0), 0);
  const subtotal = labour + mats;
  const gst = includeGst ? Math.round(subtotal * 0.1 * 100) / 100 : 0;
  const total = subtotal + gst;

  async function handleSubmit() {
    setSaving(true);
    setError('');
    try {
      const res = await fetch(`/api/job-cards/${card.id}/invoice`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ issueDate, dueDate: dueDate || undefined, notes: notes || undefined, includeGst }),
      });
      const data = await res.json() as { invoiceId?: number; error?: string };
      if (!res.ok) throw new Error(data.error ?? 'Failed');
      onDone(data.invoiceId!);
    } catch (err) {
      setError(String((err as Error).message));
    } finally {
      setSaving(false);
    }
  }

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ backdropFilter: 'blur(2px)', background: 'rgba(0,0,0,0.5)' }}>
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-md flex flex-col" style={{ maxHeight: 'min(90vh, 640px)' }}>
        <div className="flex items-center gap-3 px-5 py-4 border-b border-gray-100 shrink-0">
          <div className="w-8 h-8 rounded-lg bg-blue-100 flex items-center justify-center">
            <Receipt size={15} className="text-blue-600" />
          </div>
          <div className="flex-1">
            <h2 className="text-[15px] font-bold text-gray-900">Generate Invoice</h2>
            <p className="text-[11px] text-gray-400">From {card.card_number} · {card.customer_name ?? card.customer_name_override ?? 'No customer'}</p>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg text-gray-400 hover:text-gray-700 hover:bg-gray-100 transition-colors">
            <X size={16} />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-5 py-4 flex flex-col gap-4">
          {error && (
            <div className="flex items-center gap-2 px-3 py-2 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">
              <AlertCircle size={14} className="shrink-0" />
              {error}
            </div>
          )}

          {/* Line items preview */}
          <div className="bg-gray-50 rounded-lg p-3 text-sm border border-gray-100">
            <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wide mb-2">Line items</p>
            {labour > 0 && (
              <div className="flex justify-between py-1 border-b border-gray-100">
                <span className="text-gray-600">Labour{card.labour_hours ? ` (${card.labour_hours} hrs)` : ''}</span>
                <span className="font-medium text-gray-700">{fmtCurrency(labour)}</span>
              </div>
            )}
            {card.materials.map((m, i) => (
              <div key={i} className="flex justify-between py-1 border-b border-gray-100">
                <span className="text-gray-600 truncate max-w-[200px]">{m.description}</span>
                <span className="font-medium text-gray-700 shrink-0 ml-2">{fmtCurrency(m.cost)}</span>
              </div>
            ))}
            <div className="flex justify-between py-1.5 mt-1">
              <span className="text-gray-500">Subtotal</span>
              <span className="font-medium text-gray-700">{fmtCurrency(subtotal)}</span>
            </div>
            {includeGst && (
              <div className="flex justify-between py-1">
                <span className="text-gray-500">GST (10%)</span>
                <span className="font-medium text-gray-700">{fmtCurrency(gst)}</span>
              </div>
            )}
            <div className="flex justify-between pt-2 border-t border-gray-200 mt-1">
              <span className="font-bold text-gray-800">Total</span>
              <span className="font-bold text-gray-900 text-[15px]">{fmtCurrency(total)}</span>
            </div>
          </div>

          {/* Supporting record note */}
          <div className="flex items-start gap-2 px-3 py-2 bg-blue-50 border border-blue-100 rounded-lg text-[12px] text-blue-700">
            <FileText size={13} className="shrink-0 mt-0.5" />
            <span>This Job Card ({card.card_number}) will be attached as the supporting service record on the invoice.</span>
          </div>

          <div>
            <label className="block text-[11px] font-semibold text-gray-500 uppercase tracking-wide mb-1">Issue date</label>
            <input type="date" value={issueDate} onChange={e => setIssueDate(e.target.value)}
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400 focus:border-transparent" />
          </div>
          <div>
            <label className="block text-[11px] font-semibold text-gray-500 uppercase tracking-wide mb-1">Due date</label>
            <input type="date" value={dueDate} onChange={e => setDueDate(e.target.value)}
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400 focus:border-transparent" />
          </div>

          <div>
            <label className="block text-[11px] font-semibold text-gray-500 uppercase tracking-wide mb-1">Invoice notes</label>
            <textarea value={notes} onChange={e => setNotes(e.target.value)} rows={2}
              placeholder="Visible on the invoice…"
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm placeholder-gray-300 focus:outline-none focus:ring-2 focus:ring-blue-400 focus:border-transparent resize-none" />
          </div>

          <label className="flex items-center gap-2 cursor-pointer">
            <input type="checkbox" checked={includeGst} onChange={e => setIncludeGst(e.target.checked)}
              className="w-4 h-4 rounded border-gray-300 text-blue-500 focus:ring-blue-400" />
            <span className="text-sm text-gray-700">Include GST (10%)</span>
          </label>
        </div>

        <div className="flex items-center justify-end gap-2 px-5 py-3 border-t border-gray-100 shrink-0">
          <button type="button" onClick={onClose} className="px-4 py-2 rounded-lg text-sm font-medium text-gray-600 hover:bg-gray-100 transition-colors">
            Cancel
          </button>
          <button
            onClick={() => void handleSubmit()}
            disabled={saving || subtotal <= 0}
            className="px-4 py-2 rounded-lg text-sm font-semibold bg-blue-600 hover:bg-blue-700 text-white transition-colors disabled:opacity-50 flex items-center gap-2"
          >
            {saving ? <RefreshCw size={14} className="animate-spin" /> : <Receipt size={14} />}
            Generate Invoice
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Convert modal ─────────────────────────────────────────────────────────────
function ConvertModal({ card, open, onClose, onDone }: {
  card: JobCard;
  open: boolean;
  onClose: () => void;
  onDone: (jobId: number, jobNumber: string) => void;
}) {
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [jobName, setJobName] = useState('');

  async function handleSubmit() {
    setSaving(true);
    setError('');
    try {
      const res = await fetch(`/api/job-cards/${card.id}/convert`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ jobName: jobName || undefined }),
      });
      const data = await res.json() as { jobId?: number; jobNumber?: string; error?: string };
      if (!res.ok) throw new Error(data.error ?? 'Failed');
      onDone(data.jobId!, data.jobNumber!);
    } catch (err) {
      setError(String((err as Error).message));
    } finally {
      setSaving(false);
    }
  }

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ backdropFilter: 'blur(2px)', background: 'rgba(0,0,0,0.5)' }}>
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-md">
        <div className="flex items-center gap-3 px-5 py-4 border-b border-gray-100">
          <div className="w-8 h-8 rounded-lg bg-violet-100 flex items-center justify-center">
            <ArrowRightLeft size={15} className="text-violet-600" />
          </div>
          <div className="flex-1">
            <h2 className="text-[15px] font-bold text-gray-900">Convert to Full Job</h2>
            <p className="text-[11px] text-gray-400">This Job Card becomes the source record</p>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg text-gray-400 hover:text-gray-700 hover:bg-gray-100 transition-colors">
            <X size={16} />
          </button>
        </div>

        <div className="px-5 py-4 flex flex-col gap-4">
          {error && (
            <div className="flex items-center gap-2 px-3 py-2 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">
              <AlertCircle size={14} className="shrink-0" />
              {error}
            </div>
          )}
          <div className="bg-violet-50 rounded-lg p-3 text-sm text-violet-700">
            A new Full Job will be created from this Job Card. The card is preserved as the original source record and marked Converted.
          </div>
          <div>
            <label className="block text-[11px] font-semibold text-gray-500 uppercase tracking-wide mb-1">Job title (optional)</label>
            <input
              type="text"
              value={jobName}
              onChange={e => setJobName(e.target.value)}
              placeholder={card.work_description.slice(0, 60) || 'Auto-generated from work description'}
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm placeholder-gray-300 focus:outline-none focus:ring-2 focus:ring-violet-400 focus:border-transparent"
            />
            <p className="text-[11px] text-gray-400 mt-1">Leave blank to use the work description as the job title.</p>
          </div>
        </div>

        <div className="flex items-center justify-end gap-2 px-5 py-3 border-t border-gray-100">
          <button type="button" onClick={onClose} className="px-4 py-2 rounded-lg text-sm font-medium text-gray-600 hover:bg-gray-100 transition-colors">
            Cancel
          </button>
          <button
            onClick={() => void handleSubmit()}
            disabled={saving}
            className="px-4 py-2 rounded-lg text-sm font-semibold bg-violet-600 hover:bg-violet-700 text-white transition-colors disabled:opacity-50 flex items-center gap-2"
          >
            {saving ? <RefreshCw size={14} className="animate-spin" /> : <ArrowRightLeft size={14} />}
            Convert to Full Job
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Edit panel ────────────────────────────────────────────────────────────────
function EditPanel({ card, customers, team, onSave, onCancel }: {
  card: JobCard;
  customers: Customer[];
  team: TeamMember[];
  onSave: (updated: JobCard) => void;
  onCancel: () => void;
}) {
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [materials, setMaterials] = useState<Material[]>(card.materials.map(m => ({ ...m })));
  const [signatureData, setSignatureData] = useState<string | null>(card.signature_data ?? null);

  const [form, setForm] = useState({
    customerId: String(card.customer_id ?? ''),
    customerNameOverride: card.customer_name_override ?? '',
    siteAddress: card.site_address ?? '',
    contactPerson: card.contact_person ?? '',
    contactPhone: card.contact_phone ?? '',
    poNumber: card.po_number ?? '',
    serviceDate: card.service_date ? card.service_date.slice(0, 10) : '',
    assignedUserId: card.assigned_user_id ?? '',
    workDescription: card.work_description,
    labourHours: card.labour_hours != null ? String(card.labour_hours) : '',
    labourRate: card.labour_rate != null ? String(card.labour_rate) : '',
    labourAmount: card.labour_amount != null ? String(card.labour_amount) : '',
    notes: card.notes ?? '',
    internalNotes: card.internal_notes ?? '',
    completionSummary: card.completion_summary ?? '',
    authorisedBy: card.authorised_by ?? '',
    approvalDate: card.approval_date ? card.approval_date.slice(0, 10) : '',
    status: card.status,
  });

  function set(k: keyof typeof form, v: string) { setForm(f => ({ ...f, [k]: v })); }

  // Auto-fill site/contact when customer is selected
  function handleCustomerChange(customerId: string) {
    set('customerId', customerId);
    if (!customerId) return;
    const c = customers.find(x => String(x.id) === customerId);
    if (!c) return;
    // Only pre-fill if fields are currently empty
    if (!form.siteAddress && c.address) set('siteAddress', c.address);
    if (!form.contactPhone && c.phone) set('contactPhone', c.phone);
  }

  const labourTotal = form.labourAmount
    ? Number(form.labourAmount)
    : (Number(form.labourHours) * Number(form.labourRate)) || 0;
  const matsTotal = materials.reduce((s, m) => s + Number(m.cost ?? 0), 0);

  async function handleSave() {
    if (!form.workDescription.trim()) { setError('Work description is required'); return; }
    setSaving(true);
    setError('');
    try {
      const body: Record<string, unknown> = {
        workDescription: form.workDescription,
        siteAddress: form.siteAddress || null,
        contactPerson: form.contactPerson || null,
        contactPhone: form.contactPhone || null,
        poNumber: form.poNumber || null,
        serviceDate: form.serviceDate || null,
        notes: form.notes || null,
        internalNotes: form.internalNotes || null,
        completionSummary: form.completionSummary || null,
        authorisedBy: form.authorisedBy || null,
        approvalDate: form.approvalDate || null,
        signatureData: signatureData ?? null,
        status: form.status,
        materials: materials.filter(m => m.description.trim()).map(m => ({
          description: m.description,
          cost: Number(m.cost ?? 0),
        })),
      };
      if (form.customerId) body.customerId = Number(form.customerId);
      else body.customerNameOverride = form.customerNameOverride || null;
      if (form.assignedUserId) {
        body.assignedUserId = form.assignedUserId;
        const m = team.find(t => t.id === form.assignedUserId);
        if (m) body.assignedName = m.name;
      } else {
        body.assignedUserId = null;
        body.assignedName = null;
      }
      if (form.labourHours) body.labourHours = Number(form.labourHours);
      if (form.labourRate) body.labourRate = Number(form.labourRate);
      if (form.labourAmount) body.labourAmount = Number(form.labourAmount);

      const res = await fetch(`/api/job-cards/${card.id}`, {
        method: 'PUT',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const data = await res.json() as { jobCard?: JobCard; error?: string };
      if (!res.ok) throw new Error(data.error ?? 'Failed to save');
      onSave({ ...data.jobCard!, materials: data.jobCard?.materials ?? [], photos: card.photos });
    } catch (err) {
      setError(String((err as Error).message));
    } finally {
      setSaving(false);
    }
  }

  const inputCls = 'w-full border border-gray-200 rounded-lg px-3 py-2 text-sm text-gray-800 placeholder-gray-300 focus:outline-none focus:ring-2 focus:ring-yellow-400 focus:border-transparent';
  const labelCls = 'block text-[11px] font-semibold text-gray-400 uppercase tracking-wide mb-1';

  return (
    <div className="max-w-3xl mx-auto flex flex-col gap-4">
      {error && (
        <div className="flex items-center gap-2 px-3 py-2 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">
          <AlertCircle size={14} className="shrink-0" />
          {error}
        </div>
      )}

      {/* Status */}
      <Section title="Status" icon={CheckCircle2}>
        <select value={form.status} onChange={e => set('status', e.target.value)}
          className="border border-gray-200 rounded-lg px-3 py-2 text-sm text-gray-800 bg-white focus:outline-none focus:ring-2 focus:ring-yellow-400 focus:border-transparent">
          <option value="draft">Draft</option>
          <option value="complete">Complete</option>
          <option value="invoiced" disabled>Invoiced (set automatically)</option>
          <option value="converted" disabled>Converted (set automatically)</option>
        </select>
        <p className="text-[11px] text-gray-400 mt-2">Invoiced and Converted are set automatically by the system.</p>
      </Section>

      {/* Customer */}
      <Section title="Customer" icon={User}>
        <div className="flex flex-col gap-3">
          <div>
            <label className={labelCls}>Customer record</label>
            <select value={form.customerId} onChange={e => handleCustomerChange(e.target.value)}
              className={`${inputCls} bg-white`}>
              <option value="">— Select customer —</option>
              {customers.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
            {form.customerId && (() => {
              const c = customers.find(x => String(x.id) === form.customerId);
              if (!c) return null;
              return (
                <div className="mt-2 px-3 py-2 bg-gray-50 rounded-lg text-[12px] text-gray-500 flex flex-col gap-0.5">
                  {c.phone && <span>📞 {c.phone}</span>}
                  {c.email && <span>✉️ {c.email}</span>}
                  {c.address && <span>📍 {c.address}</span>}
                </div>
              );
            })()}
          </div>
          {!form.customerId && (
            <div>
              <label className={labelCls}>Or free-text name</label>
              <input type="text" value={form.customerNameOverride} onChange={e => set('customerNameOverride', e.target.value)}
                placeholder="One-off customer name" className={inputCls} />
            </div>
          )}
        </div>
      </Section>

      {/* Site & Contact */}
      <Section title="Site & Contact" icon={MapPin}>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div>
            <label className={labelCls}>Site address</label>
            <input type="text" value={form.siteAddress} onChange={e => set('siteAddress', e.target.value)} className={inputCls} />
          </div>
          <div>
            <label className={labelCls}>Contact person</label>
            <input type="text" value={form.contactPerson} onChange={e => set('contactPerson', e.target.value)} className={inputCls} />
          </div>
          <div>
            <label className={labelCls}>Contact phone</label>
            <input type="tel" value={form.contactPhone} onChange={e => set('contactPhone', e.target.value)} className={inputCls} />
          </div>
          <div>
            <label className={labelCls}>PO number</label>
            <input type="text" value={form.poNumber} onChange={e => set('poNumber', e.target.value)} className={inputCls} />
          </div>
        </div>
      </Section>

      {/* Work */}
      <Section title="Work" icon={Wrench}>
        <div className="flex flex-col gap-3">
          <div>
            <label className={labelCls}>Service date</label>
            <input type="date" value={form.serviceDate} onChange={e => set('serviceDate', e.target.value)} className={inputCls} />
          </div>
          <div>
            <label className={labelCls}>Assigned worker</label>
            <select value={form.assignedUserId} onChange={e => set('assignedUserId', e.target.value)}
              className={`${inputCls} bg-white`}>
              <option value="">— Unassigned —</option>
              {team.map(m => <option key={m.id} value={m.id}>{m.name}</option>)}
            </select>
          </div>
          <div>
            <label className={labelCls}>Work description <span className="text-red-500">*</span></label>
            <textarea value={form.workDescription} onChange={e => set('workDescription', e.target.value)} rows={3}
              className={`${inputCls} resize-none`} />
          </div>
        </div>
      </Section>

      {/* Labour */}
      <Section title="Labour" icon={DollarSign}>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <div>
            <label className={labelCls}>Hours</label>
            <input type="number" min="0" step="0.25" value={form.labourHours} onChange={e => set('labourHours', e.target.value)}
              placeholder="0.00" className={inputCls} />
          </div>
          <div>
            <label className={labelCls}>Rate ($/hr)</label>
            <input type="number" min="0" step="0.01" value={form.labourRate} onChange={e => set('labourRate', e.target.value)}
              placeholder="0.00" className={inputCls} />
          </div>
          <div>
            <label className={labelCls}>Override total</label>
            <input type="number" min="0" step="0.01" value={form.labourAmount} onChange={e => set('labourAmount', e.target.value)}
              placeholder={labourTotal > 0 ? String(labourTotal) : '0.00'} className={inputCls} />
          </div>
        </div>
        <p className="text-[11px] text-gray-400 mt-2">
          Labour total: <strong className="text-gray-700">{fmtCurrency(labourTotal)}</strong>
          {!form.labourAmount && form.labourHours && form.labourRate && (
            <span className="ml-1 text-gray-400">(calculated from hours × rate)</span>
          )}
        </p>
      </Section>

      {/* Materials */}
      <Section title="Materials" icon={Wrench}>
        <div className="flex flex-col gap-2">
          {materials.map((m, i) => (
            <div key={i} className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2">
              <input
                type="text"
                value={m.description}
                onChange={e => setMaterials(ms => ms.map((x, idx) => idx === i ? { ...x, description: e.target.value } : x))}
                placeholder="Description"
                className="flex-1 border border-gray-200 rounded-lg px-3 py-2 text-sm placeholder-gray-300 focus:outline-none focus:ring-2 focus:ring-yellow-400 focus:border-transparent"
              />
              <div className="relative sm:w-28 shrink-0">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 text-sm">$</span>
                <input
                  type="number" min="0" step="0.01"
                  value={m.cost}
                  onChange={e => setMaterials(ms => ms.map((x, idx) => idx === i ? { ...x, cost: Number(e.target.value) } : x))}
                  className="w-full pl-6 pr-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-yellow-400 focus:border-transparent"
                />
              </div>
              <button onClick={() => setMaterials(ms => ms.filter((_, idx) => idx !== i))}
                className="self-end sm:self-auto p-1.5 text-gray-400 hover:text-red-500 transition-colors">
                <Trash2 size={14} />
              </button>
            </div>
          ))}
          <button
            onClick={() => setMaterials(ms => [...ms, { description: '', cost: 0 }])}
            className="flex items-center gap-1.5 text-[12px] font-semibold text-yellow-600 hover:text-yellow-700 transition-colors mt-1"
          >
            <Plus size={13} />
            Add material
          </button>
          {materials.length > 0 && (
            <p className="text-[11px] text-gray-400 mt-1">Materials total: <strong className="text-gray-700">{fmtCurrency(matsTotal)}</strong></p>
          )}
        </div>
      </Section>

      {/* Completion */}
      <Section title="Completion & Sign-off" icon={ClipboardCheck}>
        <div className="flex flex-col gap-4">
          <div>
            <label className={labelCls}>Completion summary / work report</label>
            <textarea value={form.completionSummary} onChange={e => set('completionSummary', e.target.value)} rows={3}
              placeholder="Summary of work completed, findings, recommendations…"
              className={`${inputCls} resize-none`} />
          </div>
          <div>
            <label className={labelCls}>Authorised by</label>
            <input type="text" value={form.authorisedBy} onChange={e => set('authorisedBy', e.target.value)}
              placeholder="Customer name" className={inputCls} />
          </div>
          <div>
            <label className={labelCls}>Approval / sign date</label>
            <input type="date" value={form.approvalDate} onChange={e => set('approvalDate', e.target.value)} className={inputCls} />
          </div>
          <div>
            <label className={labelCls}>Customer signature</label>
            <SignaturePad value={signatureData} onChange={setSignatureData} />
          </div>
        </div>
      </Section>

      {/* Notes */}
      <Section title="Notes" icon={StickyNote}>
        <div className="flex flex-col gap-3">
          <div>
            <label className={labelCls}>Notes (visible on invoice)</label>
            <textarea value={form.notes} onChange={e => set('notes', e.target.value)} rows={2}
              className={`${inputCls} resize-none`} />
          </div>
          <div>
            <label className={labelCls}>Internal notes</label>
            <textarea value={form.internalNotes} onChange={e => set('internalNotes', e.target.value)} rows={2}
              className={`${inputCls} resize-none`} />
          </div>
        </div>
      </Section>

      {/* Save / Cancel */}
      <div className="flex items-center justify-end gap-2 pt-2 pb-8">
        <button onClick={onCancel} className="px-4 py-2 rounded-lg text-sm font-medium text-gray-600 hover:bg-gray-100 transition-colors">
          Cancel
        </button>
        <button
          onClick={() => void handleSave()}
          disabled={saving}
          className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold bg-yellow-500 hover:bg-yellow-600 text-white transition-colors disabled:opacity-50"
        >
          {saving ? <RefreshCw size={14} className="animate-spin" /> : <Save size={14} />}
          Save changes
        </button>
      </div>
    </div>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────
export default function JobCardDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();

  const [card, setCard] = useState<JobCard | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [editing, setEditing] = useState(false);
  const [invoiceOpen, setInvoiceOpen] = useState(false);
  const [convertOpen, setConvertOpen] = useState(false);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [team, setTeam] = useState<TeamMember[]>([]);
  const [toast, setToast] = useState<{ msg: string; type: 'success' | 'error' } | null>(null);

  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  function showToast(msg: string, type: 'success' | 'error' = 'success') {
    setToast({ msg, type });
    if (toastTimer.current) clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(null), 3500);
  }

  const fetchCard = useCallback(async () => {
    if (!id) return;
    setLoading(true);
    try {
      const res = await fetch(`/api/job-cards/${id}`, { credentials: 'include' });
      if (!res.ok) { setError('Job card not found'); return; }
      const data = await res.json() as { jobCard?: JobCard };
      setCard(data.jobCard ?? null);
    } catch {
      setError('Failed to load job card');
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => { void fetchCard(); }, [fetchCard]);

  useEffect(() => {
    fetch('/api/customers?status=active&limit=200', { credentials: 'include' })
      .then(r => r.ok ? r.json() : null)
      .then((d: { customers?: Customer[] } | null) => setCustomers(d?.customers ?? []))
      .catch(() => {});
    fetch('/api/team/members', { credentials: 'include' })
      .then(r => r.ok ? r.json() : null)
      .then((d: { members?: TeamMember[] } | null) => setTeam(d?.members ?? []))
      .catch(() => {});
  }, []);

  if (loading) {
    return (
      <div className="flex-1 bg-[#f5f6f8] flex flex-col lg:pt-[116px]">
        <DesktopTopBar />
        <DesktopDock />
        <div className="flex-1 flex items-center justify-center">
          <RefreshCw size={20} className="animate-spin text-gray-300" />
        </div>
      </div>
    );
  }

  if (error || !card) {
    return (
      <div className="flex-1 bg-[#f5f6f8] flex flex-col lg:pt-[116px]">
        <DesktopTopBar />
        <DesktopDock />
        <div className="flex-1 flex flex-col items-center justify-center gap-3">
          <AlertCircle size={28} className="text-red-400" />
          <p className="text-gray-600 font-medium">{error || 'Job card not found'}</p>
          <Link to="/job-cards" className="text-sm text-yellow-600 hover:underline">← Back to Job Cards</Link>
        </div>
      </div>
    );
  }

  const customerLabel = card.customer_name ?? card.customer_name_override ?? '—';
  const labour = Number(card.labour_amount ?? 0);
  const mats = card.materials.reduce((s, m) => s + Number(m.cost ?? 0), 0);
  const subtotal = labour + mats;
  const gst = Math.round(subtotal * 0.1 * 100) / 100;
  const total = subtotal + gst;

  const canInvoice = card.status !== 'invoiced' && card.status !== 'converted';
  const canConvert = card.status !== 'converted';

  return (
    <div className="flex-1 bg-[#f5f6f8] flex flex-col lg:pt-[116px]">
      <DesktopTopBar />
      <DesktopDock />
      <Helmet>
        <title>{card.card_number} — Job Card — IWILLBUILD</title>
        <meta name="description" content={`Job Card ${card.card_number} — ${card.work_description.slice(0, 120)}`} />
        <meta name="robots" content="noindex" />
        <link rel="canonical" href={`https://iwillbuild.com/job-cards/${card.id}`} />
      </Helmet>

        {/* ── Header — single unified bar for mobile + desktop ── */}
        <div className="bg-white border-b border-gray-100 px-4 lg:px-6 py-3 shrink-0 safe-top">

          {/* Row 1: back nav + card number */}
          <div className="flex items-center justify-between gap-2 mb-2">
            <Link
              to="/job-cards"
              className="flex items-center gap-1 text-sm font-semibold text-yellow-600 hover:text-yellow-700 transition-colors"
            >
              <ChevronLeft size={17} />
              Job Cards
            </Link>
            <span className="font-mono text-[12px] font-bold text-gray-400 shrink-0">{card.card_number}</span>
          </div>

          {/* Row 2: customer name + status badges */}
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0 flex-1">
              <h1 className="text-[16px] font-bold text-gray-900 leading-tight truncate">{customerLabel}</h1>
              <p className="text-[12px] text-gray-400 mt-0.5 truncate">{card.work_description}</p>
              {/* Status badges */}
              <div className="flex items-center gap-2 flex-wrap mt-1.5">
                <StatusBadge status={card.status} />
                {card.invoice_id && (
                  <Link
                    to={`/invoices/${card.invoice_id}`}
                    className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-semibold bg-blue-50 text-blue-600 hover:bg-blue-100 transition-colors border border-blue-100"
                  >
                    <Receipt size={9} />
                    Invoice #{card.invoice_id}
                    <ExternalLink size={9} />
                  </Link>
                )}
                {card.converted_job_id && (
                  <Link
                    to={`/jobs/${card.converted_job_id}`}
                    className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-semibold bg-violet-50 text-violet-600 hover:bg-violet-100 transition-colors border border-violet-100"
                  >
                    <ArrowRightLeft size={9} />
                    Full Job #{card.converted_job_id}
                    <ExternalLink size={9} />
                  </Link>
                )}
              </div>
            </div>

            {/* Action buttons */}
            <div className="flex items-center gap-2 shrink-0">
              {!editing && (
                <>
                  <Link
                    to="/job-cards/new"
                    className="hidden lg:flex items-center gap-1.5 px-3 py-2 rounded-lg border border-yellow-400 text-yellow-700 text-sm font-semibold hover:bg-yellow-50 transition-colors"
                  >
                    <Plus size={14} />
                    Add New Job Card
                  </Link>
                  {canConvert && (
                    <button
                      onClick={() => setConvertOpen(true)}
                      className="flex items-center gap-1.5 px-3 py-2 rounded-lg border border-violet-200 text-violet-700 text-sm font-semibold hover:bg-violet-50 transition-colors"
                    >
                      <ArrowRightLeft size={14} />
                      Convert
                    </button>
                  )}
                  {canInvoice && (
                    <button
                      onClick={() => setInvoiceOpen(true)}
                      className="flex items-center gap-1.5 px-3 py-2 rounded-lg border border-blue-200 text-blue-700 text-sm font-semibold hover:bg-blue-50 transition-colors"
                    >
                      <Receipt size={14} />
                      Invoice
                    </button>
                  )}
                  <button
                    onClick={() => setEditing(true)}
                    className="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-yellow-500 hover:bg-yellow-600 text-white text-sm font-semibold transition-colors"
                  >
                    <Edit2 size={14} />
                    Edit
                  </button>
                </>
              )}
            </div>
          </div>
        </div>

        {/* ── Body ── */}
        <div className="flex-1 overflow-y-auto px-6 py-5">
          {editing ? (
            <EditPanel
              card={card}
              customers={customers}
              team={team}
              onSave={(updated) => { setCard(updated); setEditing(false); showToast('Job Card saved'); }}
              onCancel={() => setEditing(false)}
            />
          ) : (
            <div className="max-w-3xl mx-auto flex flex-col gap-4">
              {/* ── Financial summary strip ── */}
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
                {[
                  { label: 'Labour', value: fmtCurrency(labour), icon: DollarSign, cls: 'text-emerald-600' },
                  { label: 'Materials', value: fmtCurrency(mats), icon: Wrench, cls: 'text-violet-600' },
                  { label: 'Subtotal', value: fmtCurrency(subtotal), icon: FileText, cls: 'text-gray-500' },
                  { label: 'Total (inc. GST)', value: fmtCurrency(total), icon: Receipt, cls: 'text-blue-600' },
                ].map(({ label, value, icon: Icon, cls }) => (
                  <div key={label} className="bg-white rounded-xl border border-gray-100 px-4 py-3">
                    <div className="flex items-center gap-1.5 mb-1">
                      <Icon size={12} className={cls} />
                      <span className="text-[10px] font-bold text-gray-400 uppercase tracking-wide">{label}</span>
                    </div>
                    <p className="text-[15px] font-bold text-gray-800">{value}</p>
                  </div>
                ))}
              </div>

              {/* ── Details ── */}
              <Section title="Details" icon={FileText}>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-x-6 gap-y-3">
                  <Field label="Card number" value={card.card_number} mono />
                  <Field label="Service date" value={fmtDate(card.service_date)} />
                  <Field label="Created" value={fmtDate(card.created_at)} />
                  <Field label="Customer" value={customerLabel} />
                  <Field label="Site address" value={card.site_address} />
                  <Field label="Contact person" value={card.contact_person} />
                  <Field label="Contact phone" value={card.contact_phone} />
                  <Field label="PO number" value={card.po_number} />
                  <Field label="Assigned worker" value={card.assigned_name} />
                </div>
              </Section>

              {/* ── Work description ── */}
              <Section title="Work description" icon={Wrench}>
                <p className="text-[13px] text-gray-700 whitespace-pre-wrap leading-relaxed">{card.work_description}</p>
              </Section>

              {/* ── Labour ── */}
              <Section title="Labour" icon={DollarSign}>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-x-6 gap-y-3">
                  <Field label="Hours" value={card.labour_hours != null ? `${card.labour_hours} hrs` : null} />
                  <Field label="Rate" value={card.labour_rate != null ? fmtCurrency(card.labour_rate) + '/hr' : null} />
                  <Field label="Labour total" value={fmtCurrency(card.labour_amount)} />
                </div>
              </Section>

              {/* ── Materials ── */}
              {card.materials.length > 0 && (
                <Section title="Materials" icon={Wrench}>
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-gray-100">
                        <th className="text-left py-1.5 text-[11px] font-bold text-gray-400 uppercase tracking-wide">Description</th>
                        <th className="text-right py-1.5 text-[11px] font-bold text-gray-400 uppercase tracking-wide">Cost</th>
                      </tr>
                    </thead>
                    <tbody>
                      {card.materials.map((m, i) => (
                        <tr key={i} className="border-b border-gray-50">
                          <td className="py-2 text-[13px] text-gray-700">{m.description}</td>
                          <td className="py-2 text-right text-[13px] font-semibold text-gray-700">{fmtCurrency(m.cost)}</td>
                        </tr>
                      ))}
                      <tr>
                        <td className="pt-2 text-[12px] font-bold text-gray-500">Total</td>
                        <td className="pt-2 text-right text-[13px] font-bold text-gray-800">{fmtCurrency(mats)}</td>
                      </tr>
                    </tbody>
                  </table>
                </Section>
              )}

              {/* ── Completion & sign-off ── */}
              {(card.completion_summary || card.authorised_by || card.approval_date || card.signature_data) && (
                <Section title="Completion & sign-off" icon={ClipboardCheck}>
                  <div className="flex flex-col gap-3">
                    {card.completion_summary && (
                      <div>
                        <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wide mb-1">Work report</p>
                        <p className="text-[13px] text-gray-700 whitespace-pre-wrap leading-relaxed">{card.completion_summary}</p>
                      </div>
                    )}
                    <div className="grid grid-cols-2 gap-x-6 gap-y-3">
                      <Field label="Authorised by" value={card.authorised_by} />
                      <Field label="Sign date" value={fmtDate(card.approval_date)} />
                    </div>
                    {card.signature_data && (
                      <div>
                        <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wide mb-1">Customer signature</p>
                        <div className="border border-gray-200 rounded-lg p-2 bg-gray-50 inline-block">
                          <img src={card.signature_data} alt="Customer signature" className="max-h-24 max-w-xs" />
                        </div>
                      </div>
                    )}
                  </div>
                </Section>
              )}

              {/* ── Notes ── */}
              {(card.notes || card.internal_notes) && (
                <Section title="Notes" icon={StickyNote}>
                  <div className="flex flex-col gap-3">
                    {card.notes && <Field label="Notes (on invoice)" value={card.notes} />}
                    {card.internal_notes && <Field label="Internal notes" value={card.internal_notes} />}
                  </div>
                </Section>
              )}

              {/* ── Photos — always visible, upload from here ── */}
              <PhotoSection
                cardId={card.id}
                photos={card.photos}
                onPhotosChange={(photos) => setCard(c => c ? { ...c, photos } : c)}
                cardTitle={card.card_number}
              />
            </div>
          )}
        </div>

      {/* Toast */}
      {toast && (
        <div className={`fixed bottom-6 right-6 z-50 flex items-center gap-2 px-4 py-3 rounded-xl shadow-lg text-sm font-semibold ${
          toast.type === 'success' ? 'bg-green-600 text-white' : 'bg-red-600 text-white'
        }`}>
          {toast.type === 'success' ? <CheckCircle2 size={15} /> : <AlertCircle size={15} />}
          {toast.msg}
        </div>
      )}

      <InvoiceModal
        card={card}
        open={invoiceOpen}
        onClose={() => setInvoiceOpen(false)}
        onDone={(invId) => {
          setInvoiceOpen(false);
          showToast('Invoice created');
          void fetchCard();
          navigate(`/invoices/${invId}`);
        }}
      />

      <ConvertModal
        card={card}
        open={convertOpen}
        onClose={() => setConvertOpen(false)}
        onDone={(jobId, jobNumber) => {
          setConvertOpen(false);
          showToast(`Converted to Full Job ${jobNumber}`);
          void fetchCard();
          navigate(`/jobs/${jobId}`);
        }}
      />
    </div>
  );
}
