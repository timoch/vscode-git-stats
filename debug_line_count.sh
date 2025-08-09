#!/bin/bash

# Debug script to compare line counting between bash script and VS Code extension
# Run this in the target directory (e.g., /home/timoch/hephaestus/track1)

echo "==================================================================="
echo "Line Count Debugging Script"
echo "==================================================================="
echo ""
echo "Current directory: $(pwd)"
echo "Date: $(date)"
echo ""

# Define the file patterns and exclusions from the bash script
FILE_PATTERNS='-name "*.cs" -o -name "*.ts" -o -name "*.tsx" -o -name "*.js" -o -name "*.jsx" -o -name "*.json" -o -name "*.xml" -o -name "*.yaml" -o -name "*.yml" -o -name "*.md" -o -name "*.txt" -o -name "*.sh" -o -name "*.ps1" -o -name "*.psm1" -o -name "*.psd1" -o -name "*.csproj" -o -name "*.sln" -o -name "*.razor" -o -name "*.css" -o -name "*.scss" -o -name "*.html"'

# Exclusions now match VS Code extension defaults
EXCLUSIONS='-not -path "*/.git/*" -not -path "*/node_modules/*" -not -path "*/bin/*" -not -path "*/obj/*" -not -path "*/dist/*" -not -path "*/build/*" -not -name "*.min.*" -not -name "package-lock.json" -not -path "*/cdk.out/*" -not -name "cdk.context.json" -not -path "*/.cdk.staging/*" -not -path "*/.claude/*"'

echo "1. TOTAL LINE COUNT (as bash script calculates):"
echo "================================================="
eval "find . -type f \( $FILE_PATTERNS \) $EXCLUSIONS -exec wc -l {} + 2>/dev/null | awk '{sum += \$1} END {print \"Total lines: \" sum}'"
echo ""

echo "2. FILE COUNT:"
echo "=============="
FILE_COUNT=$(eval "find . -type f \( $FILE_PATTERNS \) $EXCLUSIONS 2>/dev/null | wc -l")
echo "Total matching files: $FILE_COUNT"
echo ""

echo "3. BREAKDOWN BY EXTENSION:"
echo "=========================="
echo "Extension | Files | Lines"
echo "----------|-------|------"

# List of extensions from the script
EXTENSIONS=("cs" "ts" "tsx" "js" "jsx" "json" "xml" "yaml" "yml" "md" "txt" "sh" "ps1" "psm1" "psd1" "csproj" "sln" "razor" "css" "scss" "html")

for ext in "${EXTENSIONS[@]}"; do
    FILE_COUNT=$(eval "find . -type f -name \"*.$ext\" $EXCLUSIONS 2>/dev/null | wc -l")
    if [ "$FILE_COUNT" -gt 0 ]; then
        LINE_COUNT=$(eval "find . -type f -name \"*.$ext\" $EXCLUSIONS -exec wc -l {} + 2>/dev/null | awk '{sum += \$1} END {print sum}'")
        printf "%-9s | %5d | %s\n" "$ext" "$FILE_COUNT" "$LINE_COUNT"
    fi
done
echo ""

echo "4. SYMLINKS CHECK:"
echo "=================="
SYMLINK_COUNT=$(find . -type l 2>/dev/null | wc -l)
echo "Total symlinks: $SYMLINK_COUNT"
if [ "$SYMLINK_COUNT" -gt 0 ]; then
    echo "First 10 symlinks:"
    find . -type l 2>/dev/null | head -10
fi
echo ""

echo "5. FILES WITHOUT EXTENSIONS:"
echo "============================"
NO_EXT_COUNT=$(find . -type f ! -name "*.*" -not -path "*/node_modules/*" -not -path "*/bin/*" -not -path "*/obj/*" -not -path "*/.git/*" 2>/dev/null | wc -l)
echo "Files without extensions: $NO_EXT_COUNT"
if [ "$NO_EXT_COUNT" -gt 0 ]; then
    echo "First 10 files without extensions:"
    find . -type f ! -name "*.*" -not -path "*/node_modules/*" -not -path "*/bin/*" -not -path "*/obj/*" -not -path "*/.git/*" 2>/dev/null | head -10
fi
echo ""

echo "6. ALL FILE EXTENSIONS IN PROJECT:"
echo "==================================="
echo "Count | Extension"
echo "------|----------"
find . -type f -not -path "*/.git/*" 2>/dev/null | sed 's/.*\.//' | grep -v "/" | sort | uniq -c | sort -rn | head -20
echo ""

echo "7. EXCLUDED DIRECTORIES SIZE:"
echo "============================="
echo "Directory | File Count | Line Count"
echo "----------|------------|------------"

EXCLUDED_DIRS=("node_modules" "bin" "obj" "dist" "build" "cdk.out" ".cdk.staging")
for dir in "${EXCLUDED_DIRS[@]}"; do
    DIR_COUNT=$(find . -path "*/$dir/*" -type f 2>/dev/null | wc -l)
    if [ "$DIR_COUNT" -gt 0 ]; then
        DIR_LINES=$(find . -path "*/$dir/*" -type f -exec wc -l {} + 2>/dev/null | awk '{sum += $1} END {print sum}')
        printf "%-11s | %10d | %s\n" "$dir" "$DIR_COUNT" "$DIR_LINES"
    fi
done
echo ""

echo "8. SAMPLE FILES BEING COUNTED:"
echo "==============================="
echo "First 20 files that ARE included in the count:"
eval "find . -type f \( $FILE_PATTERNS \) $EXCLUSIONS 2>/dev/null | head -20"
echo ""

echo "9. POTENTIAL MISSING EXTENSIONS:"
echo "================================="
echo "Extensions with >10 files that might be missing from the count:"
echo "Count | Extension"
echo "------|----------"

# Find all extensions not in our list
find . -type f -not -path "*/.git/*" -not -path "*/node_modules/*" -not -path "*/bin/*" -not -path "*/obj/*" 2>/dev/null | \
    sed 's/.*\.//' | grep -v "/" | sort | uniq -c | sort -rn | \
    while read count ext; do
        if [ "$count" -gt 10 ]; then
            # Check if this extension is NOT in our list
            if ! echo "${EXTENSIONS[@]}" | grep -q "\<$ext\>"; then
                printf "%5d | %s\n" "$count" "$ext"
            fi
        fi
    done
echo ""

echo "10. COMPARISON WITH VS CODE EXTENSION CONFIG:"
echo "============================================="
echo "VS Code extension includes these additional extensions:"
echo "py, java, cpp, c, h, hpp, go, rs, rb, php, swift, kt, scala, r, sql"
echo ""
echo "Checking if any of these exist in the project:"

VSCODE_EXTRA=("py" "java" "cpp" "c" "h" "hpp" "go" "rs" "rb" "php" "swift" "kt" "scala" "r" "sql")
for ext in "${VSCODE_EXTRA[@]}"; do
    FILE_COUNT=$(find . -type f -name "*.$ext" -not -path "*/node_modules/*" -not -path "*/bin/*" -not -path "*/obj/*" 2>/dev/null | wc -l)
    if [ "$FILE_COUNT" -gt 0 ]; then
        LINE_COUNT=$(find . -type f -name "*.$ext" -not -path "*/node_modules/*" -not -path "*/bin/*" -not -path "*/obj/*" -exec wc -l {} + 2>/dev/null | awk '{sum += $1} END {print sum}')
        printf "%-6s: %5d files, %s lines\n" "$ext" "$FILE_COUNT" "$LINE_COUNT"
    fi
done
echo ""

echo "==================================================================="
echo "SUMMARY:"
echo "==================================================================="
TOTAL_LINES=$(eval "find . -type f \( $FILE_PATTERNS \) $EXCLUSIONS -exec wc -l {} + 2>/dev/null | awk '{sum += \$1} END {print sum}'")
echo "Total lines (bash script method): $TOTAL_LINES"
echo ""
echo "If VS Code extension shows different count, check:"
echo "1. File extensions included/excluded"
echo "2. Directory exclusion patterns"
echo "3. Handling of symlinks"
echo "4. Files without extensions"
echo "==================================================================="