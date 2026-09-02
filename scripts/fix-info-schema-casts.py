import re

with open('src/server/entry.ts', 'r') as f:
    content = f.read()

# Fix type cast: Array<{ cnt: number }> → [Array<{ cnt: number }>, unknown]
content = content.replace(
    ') as unknown as Array<{ cnt: number }>;',
    ') as unknown as [Array<{ cnt: number }>, unknown];'
)

# Fix result access patterns:
# varName?.[0]?.cnt  →  varName[0]?.[0]?.cnt
content = re.sub(r'(\w+)\?\.\[0\]\?\.cnt', r'\1[0]?.[0]?.cnt', content)

# varName[0]?.cnt  (but NOT varName[0]?.[0]?.cnt — already correct)
content = re.sub(r'(\w+)\[0\]\?\.cnt(?!\])', r'\1[0]?.[0]?.cnt', content)

with open('src/server/entry.ts', 'w') as f:
    f.write(content)

print("Done")
