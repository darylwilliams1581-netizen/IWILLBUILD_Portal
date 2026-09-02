import zipfile, re, glob

for path in sorted(glob.glob('docs/*.docx')):
    try:
        with zipfile.ZipFile(path) as z:
            if 'word/document.xml' not in z.namelist():
                print(f'=== {path} => NO document.xml'); continue
            xml = z.read('word/document.xml').decode('utf-8', errors='ignore')
            text = re.sub(r'<[^>]+>', ' ', xml)
            text = re.sub(r'\s+', ' ', text).strip()
            print(f'=== {path} ===')
            print(text[:4000])
            print()
    except Exception as e:
        print(f'ERROR {path}: {e}')
