with open('src/pages/job-card-detail.tsx', 'r') as f:
    content = f.read()

# Add import for useUploadQueue after the existing imports
old_import_marker = "// ── Types ─────────────────────────────────────────────────────────────────────"
new_import = "import { useUploadQueue } from '@/hooks/useUploadQueue';\n\n// ── Types ─────────────────────────────────────────────────────────────────────"
if old_import_marker in content:
    content = content.replace(old_import_marker, new_import, 1)
    print('import added OK')
else:
    print('ERROR: import marker not found')

# Replace the entire PhotoSection component
old_section = """// ── Photo upload section ──────────────────────────────────────────────────────
function PhotoSection({ cardId, photos, onPhotosChange }: {
  cardId: number;
  photos: Photo[];
  onPhotosChange: (photos: Photo[]) => void;
}) {
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState('');
  // Single file input — NO capture attribute.
  // On iOS this triggers the native \"Take Photo / Photo Library / Browse\" sheet.
  // On Android it opens the system file picker with camera option.
  // This is the exact same pattern used by FilePanel which works reliably.
  const fileInputRef = useRef<HTMLInputElement>(null);

  async function uploadFiles(files: File[]) {
    if (!files.length) return;
    setUploading(true);
    setUploadError('');
    try {
      const fd = new FormData();
      for (const f of files) fd.append('photos', f);
      const res = await fetch(`/api/job-cards/${cardId}/photos`, {
        method: 'POST',
        credentials: 'include',
        body: fd,
      });
      const data = await res.json() as { photos?: Photo[]; error?: string };
      if (!res.ok) throw new Error(data.error ?? 'Upload failed');
      onPhotosChange([...photos, ...(data.photos ?? [])]);
    } catch (err) {
      setUploadError(String((err as Error).message));
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  }"""

new_section = """// ── Photo upload section ──────────────────────────────────────────────────────
function PhotoSection({ cardId, photos, onPhotosChange }: {
  cardId: number;
  photos: Photo[];
  onPhotosChange: (photos: Photo[]) => void;
}) {
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
  const fileInputRef = q.inputRef;"""

if old_section in content:
    content = content.replace(old_section, new_section, 1)
    print('PhotoSection header replaced OK')
else:
    print('ERROR: PhotoSection header not found')

# Replace the uploadFiles call and old input
old_input_block = """  async function handleDelete(photoId: number) {
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

  return (
    <>
    <Section
      title={`Photos${photos.length > 0 ? ` (${photos.length})` : ''}`}
      icon={Camera}
      action={
        <button
          onClick={() => fileInputRef.current?.click()}
          disabled={uploading}
          className="flex items-center gap-1 px-2 py-1 rounded-md text-[11px] font-semibold text-yellow-700 bg-yellow-50 hover:bg-yellow-100 transition-colors disabled:opacity-50"
        >
          {uploading ? <RefreshCw size={11} className="animate-spin" /> : <Upload size={11} />}
          {uploading ? 'Uploading…' : 'Add photos'}
        </button>
      }
    >
      {/* Single input — no capture= so iOS shows its native picker sheet */}
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        multiple
        className="hidden"
        onChange={e => {
          const files = Array.from(e.target.files ?? []);
          if (files.length) void uploadFiles(files);
          e.target.value = '';
        }}
      />"""

new_input_block = """  async function handleDelete(photoId: number) {
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

  return (
    <>
    <Section
      title={`Photos${photos.length > 0 ? ` (${photos.length})` : ''}`}
      icon={Camera}
      action={
        <button
          onClick={() => fileInputRef.current?.click()}
          disabled={uploading}
          className="flex items-center gap-1 px-2 py-1 rounded-md text-[11px] font-semibold text-yellow-700 bg-yellow-50 hover:bg-yellow-100 transition-colors disabled:opacity-50"
        >
          {uploading ? <RefreshCw size={11} className="animate-spin" /> : <Upload size={11} />}
          {uploading ? 'Uploading…' : 'Add photos'}
        </button>
      }
    >
      {/* Hidden file input — no capture= so iOS shows the native picker sheet
          (Take Photo / Photo Library / Browse). capture= forces camera-only
          and can crash if permission not yet granted on iOS. */}
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        multiple
        className="hidden"
        onChange={q.handleInputChange}
      />"""

if old_input_block in content:
    content = content.replace(old_input_block, new_input_block, 1)
    print('input block replaced OK')
else:
    print('ERROR: input block not found')

with open('src/pages/job-card-detail.tsx', 'w') as f:
    f.write(content)
print('Done')
