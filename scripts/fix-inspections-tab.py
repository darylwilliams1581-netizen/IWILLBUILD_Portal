with open('src/components/AssetManager/AMInspectionsTab.tsx', 'r') as f:
    content = f.read()

# 1. Add import
old_import = "import OutlookEmailButton from '@/components/OutlookEmailButton';"
new_import = "import OutlookEmailButton from '@/components/OutlookEmailButton';\nimport { useUploadQueue } from '@/hooks/useUploadQueue';"
if old_import in content:
    content = content.replace(old_import, new_import, 1)
    print('import added OK')
else:
    print('ERROR: import not found')

# 2. Remove uploadingFor state and fileRef
old_state = "  const [uploadingFor, setUploadingFor] = useState<number | null>(null);\n  const fileRef = useRef<HTMLInputElement>(null);\n"
if old_state in content:
    content = content.replace(old_state, '', 1)
    print('state removed OK')
else:
    print('ERROR: state not found')

# 3. Add hook after expandId state
old_anchor = "  const [expandId, setExpandId] = useState<number | null>(null);"
new_anchor = """  const [expandId, setExpandId] = useState<number | null>(null);

  // ── Photo upload queue (endpoint changes with expandId) ────────────────────
  const photoQ = useUploadQueue({
    endpoint: expandId ? `/api/asset-manager/inspections/${expandId}/photos` : '/api/asset-manager/inspections/0/photos',
    fieldName: 'file',
    accept: 'image/*,application/pdf',
    multiple: false,
    onSuccess: () => { void load(); },
  });
  const uploadingFor = photoQ.isUploading ? expandId : null;
  const fileRef = photoQ.inputRef;"""
if old_anchor in content:
    content = content.replace(old_anchor, new_anchor, 1)
    print('hook added OK')
else:
    print('ERROR: anchor not found')

# 4. Remove handlePhotoUpload function
old_fn = """  async function handlePhotoUpload(inspectionId: number, file: File) {
    setUploadingFor(inspectionId);
    try {
      const fd = new FormData();
      fd.append('file', file);
      await fetch(`/api/asset-manager/inspections/${inspectionId}/photos`, {
        method: 'POST', credentials: 'include', body: fd,
      });
      await load();
    } catch { setError('Upload failed'); }
    finally { setUploadingFor(null); }
  }"""
if old_fn in content:
    content = content.replace(old_fn, '', 1)
    print('handlePhotoUpload removed OK')
else:
    print('ERROR: handlePhotoUpload not found')

# 5. Fix the input onChange
old_input = "      <input ref={fileRef} type=\"file\" accept=\"image/*,application/pdf\" className=\"hidden\"\n        onChange={(e) => { const f = e.target.files?.[0]; if (f && expandId) void handlePhotoUpload(expandId, f); e.target.value = ''; }} />"
new_input = "      <input ref={fileRef} type=\"file\" accept=\"image/*,application/pdf\" className=\"hidden\"\n        onChange={photoQ.handleInputChange} />"
if old_input in content:
    content = content.replace(old_input, new_input, 1)
    print('input onChange fixed OK')
else:
    print('ERROR: input onChange not found')

# 6. Remove unused useRef import if no other useRef usage
import re
if 'useRef' in content and content.count('useRef') == 1:
    content = content.replace(', useRef', '').replace('useRef, ', '')
    print('useRef import cleaned')

with open('src/components/AssetManager/AMInspectionsTab.tsx', 'w') as f:
    f.write(content)
print('Done')
