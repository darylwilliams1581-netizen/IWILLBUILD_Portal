import re

with open('src/server/entry.ts', 'r') as f:
    content = f.read()

# Replace: const msg = String((e as Error)?.message ?? e);
# With:    const msg = migrationErrMsg(e);
# Only inside catch blocks (the pattern is always `} catch (e: unknown) {` then the msg line)
content = re.sub(
    r'const msg = String\(\(e as Error\)\?\.message \?\? e\);',
    'const msg = migrationErrMsg(e);',
    content
)

# Also fix the alterMsg variant used in colsToEnsure
content = re.sub(
    r'const alterMsg = String\(\(alterErr as Error\)\?\.message \?\? alterErr\);',
    'const alterMsg = migrationErrMsg(alterErr);',
    content
)

# Fix isDup checks that use string matching to use isDupColumnError instead
# Pattern: const isDup = alterMsg.includes('ER_DUP_FIELDNAME') || alterMsg.includes('Duplicate column name') || alterMsg.includes('1060');
content = re.sub(
    r"const isDup = alterMsg\.includes\('ER_DUP_FIELDNAME'\)[^;]+;",
    "const isDup = isDupColumnError(alterErr);",
    content
)

# Fix the inline dup checks in the simple catch blocks:
# if (!msg.includes('Duplicate column') && !msg.includes('ER_DUP_FIELDNAME')) {
# → if (!isDupColumnError(e)) {
content = re.sub(
    r"if \(!msg\.includes\('Duplicate column'\) && !msg\.includes\('ER_DUP_FIELDNAME'\)\)",
    "if (!isDupColumnError(e))",
    content
)
content = re.sub(
    r"if \(!msg\.includes\('ER_DUP_FIELDNAME'\) && !msg\.includes\('Duplicate column name'\)\)",
    "if (!isDupColumnError(e))",
    content
)
content = re.sub(
    r"if \(!msg\.includes\('ER_DUP_FIELDNAME'\) && !msg\.includes\('Duplicate column'\)\)",
    "if (!isDupColumnError(e))",
    content
)
# Variant with already exists
content = re.sub(
    r"if \(!msg\.includes\('Duplicate column'\) && !msg\.includes\('already exists'\) && !msg\.includes\('ER_DUP_FIELDNAME'\)\)",
    "if (!isDupColumnError(e))",
    content
)

with open('src/server/entry.ts', 'w') as f:
    f.write(content)

print("Done")
