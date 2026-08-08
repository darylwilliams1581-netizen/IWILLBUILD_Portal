import re

with open('src/hooks/__tests__/useUploadQueue.test.ts', 'r') as f:
    content = f.read()

# Replace all sync act(() => { xhr.fire(...) }) with await act(async () => { xhr.fire(...) })
# Pattern: act(() => { xhrInstances[N].fire(...) });
# Also: act(() => { xhr.fire(...) });
# Also: act(() => { xhrInstances[0].fire('load'); xhrInstances[1].fire('load'); });

# Replace single-line sync act with fire/fireUpload calls
content = re.sub(
    r'\bact\((\(\) => \{[^}]*\.fire[^}]*\})\)',
    r'await act(async \1)',
    content
)

with open('src/hooks/__tests__/useUploadQueue.test.ts', 'w') as f:
    f.write(content)
print('Done')
