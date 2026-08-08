import re

with open('src/components/job/FormFieldRenderers.tsx', 'r') as f:
    content = f.read()

# 1. Replace camera-captures fetch with /api/files
old_fetch = "fd.append('capturedAt', new Date().toISOString());\n              const res = await fetch('/api/camera-captures', { method: 'POST', body: fd, credentials: 'include' });\n              if (!res.ok) { const d = await res.json().catch(() => ({})) as { error?: string }; throw new Error(d.error ?? 'Upload failed'); }\n              const data = await res.json() as { captures?: Array<{ url: string }> };\n              const url = data.captures?.[0]?.url;\n              if (url) newUrls.push(url);"
new_fetch = "fd.append('fileCategory', 'Forms');\n              const res = await fetch('/api/files', { method: 'POST', body: fd, credentials: 'include' });\n              if (!res.ok) { const d = await res.json().catch(() => ({})) as { error?: string }; throw new Error(d.error ?? 'Upload failed'); }\n              const data = await res.json() as { file?: { id: number } };\n              const fileId = data.file?.id;\n              if (fileId) newUrls.push('/api/files/' + String(fileId) + '/download');"

if old_fetch in content:
    content = content.replace(old_fetch, new_fetch)
    print('fetch replaced OK')
else:
    print('ERROR: fetch block not found')

# 2. Fix variable name newUrls -> still fine, just the push changes
# 3. Remove handleNativeCapture block
marker_start = "\n        const handleNativeCapture = useCallback(async () => {"
marker_end = "        }, [handleFiles]);\n\n        const isNative = typeof (window as unknown as { Capacitor?: { isNativePlatform?: () => boolean } }).Capacitor?.isNativePlatform === 'function'\n          && (window as unknown as { Capacitor: { isNativePlatform: () => boolean } }).Capacitor.isNativePlatform();"

start_idx = content.find(marker_start)
end_idx = content.find(marker_end)
if start_idx != -1 and end_idx != -1:
    content = content[:start_idx] + content[end_idx + len(marker_end):]
    print('handleNativeCapture removed OK')
else:
    print(f'ERROR: native block not found start={start_idx} end={end_idx}')

# 4. Fix button onClick
old_btn = "onClick={() => isNative ? handleNativeCapture() : fileInputRef.current?.click()}"
new_btn = "onClick={() => fileInputRef.current?.click()}"
if old_btn in content:
    content = content.replace(old_btn, new_btn)
    print('button onClick fixed OK')
else:
    print('ERROR: button onClick not found')

# 5. Remove capture="environment"
old_cap = '                  capture="environment"\n'
if old_cap in content:
    content = content.replace(old_cap, '')
    print('capture= removed OK')
else:
    print('ERROR: capture= not found')

with open('src/components/job/FormFieldRenderers.tsx', 'w') as f:
    f.write(content)
print('Done')
