#!/bin/bash

# Script to check line count matching VS Code extension configuration
# This matches the default configuration of timoch-git-stats extension

echo "==================================================================="
echo "Line Count Check - VS Code Extension Compatible"
echo "==================================================================="
echo ""
echo "Current directory: $(pwd)"
echo "Date: $(date)"
echo ""

# File extensions from VS Code extension defaults
EXTENSIONS=(
    "cs" "ts" "tsx" "js" "jsx"
    "json" "xml" "yaml" "yml"
    "md" "txt" "sh" "ps1"
    "psm1" "psd1" "csproj" "sln"
    "razor" "css" "scss" "html"
    "py" "java" "cpp" "c" "h"
    "hpp" "go" "rs" "rb" "php"
    "swift" "kt" "scala" "r" "sql"
)

# Build the find pattern
FILE_PATTERNS=""
for ext in "${EXTENSIONS[@]}"; do
    if [ -n "$FILE_PATTERNS" ]; then
        FILE_PATTERNS="$FILE_PATTERNS -o "
    fi
    FILE_PATTERNS="$FILE_PATTERNS-name \"*.$ext\""
done

# Exclusions from VS Code extension defaults
EXCLUSIONS='-not -path "*/.git/*" -not -path "*/node_modules/*" -not -path "*/bin/*" -not -path "*/obj/*" -not -path "*/dist/*" -not -path "*/build/*" -not -name "*.min.*" -not -name "package-lock.json" -not -path "*/cdk.out/*" -not -name "cdk.context.json" -not -path "*/.cdk.staging/*" -not -path "*/.claude/*"'

echo "TOTAL LINE COUNT (matching VS Code extension):"
echo "==============================================="
eval "find . -type f \( $FILE_PATTERNS \) $EXCLUSIONS -exec wc -l {} + 2>/dev/null | awk '{sum += \$1} END {print \"Total lines: \" sum}'"
echo ""

echo "FILE COUNT:"
echo "==========="
FILE_COUNT=$(eval "find . -type f \( $FILE_PATTERNS \) $EXCLUSIONS 2>/dev/null | wc -l")
echo "Total matching files: $FILE_COUNT"
echo ""

echo "TOP CONTRIBUTORS BY EXTENSION:"
echo "==============================="
echo "Extension | Files | Lines"
echo "----------|-------|------"

for ext in "${EXTENSIONS[@]}"; do
    FILE_COUNT=$(eval "find . -type f -name \"*.$ext\" $EXCLUSIONS 2>/dev/null | wc -l")
    if [ "$FILE_COUNT" -gt 0 ]; then
        LINE_COUNT=$(eval "find . -type f -name \"*.$ext\" $EXCLUSIONS -exec wc -l {} + 2>/dev/null | awk '{sum += \$1} END {print sum}'")
        printf "%-9s | %5d | %s\n" "$ext" "$FILE_COUNT" "$LINE_COUNT"
    fi
done | sort -t'|' -k3 -rn | head -20
echo ""

echo "FILES WITHOUT EXTENSIONS (that would be included if matched):"
echo "=============================================================="
echo "Special files checked: Dockerfile, Makefile, Rakefile, Gemfile,"
echo "                      Vagrantfile, Jenkinsfile, Procfile"
echo ""
for special in "Dockerfile" "Makefile" "Rakefile" "Gemfile" "Vagrantfile" "Jenkinsfile" "Procfile"; do
    COUNT=$(find . -type f -name "$special" -not -path "*/.git/*" -not -path "*/node_modules/*" -not -path "*/bin/*" -not -path "*/obj/*" 2>/dev/null | wc -l)
    if [ "$COUNT" -gt 0 ]; then
        echo "Found $COUNT $special file(s)"
    fi
done
echo ""

echo "EXCLUDED DIRECTORIES (with line counts if they contained matching files):"
echo "========================================================================="
echo "Directory    | Files with matching extensions | Potential lines"
echo "-------------|-------------------------------|----------------"

EXCLUDED_DIRS=(".git" "node_modules" "bin" "obj" "dist" "build" "cdk.out" ".cdk.staging" ".claude")
for dir in "${EXCLUDED_DIRS[@]}"; do
    if [ -d "$dir" ] || find . -type d -name "$dir" 2>/dev/null | head -1 | grep -q .; then
        FILE_COUNT=$(eval "find . -path \"*/$dir/*\" -type f \( $FILE_PATTERNS \) 2>/dev/null | wc -l")
        if [ "$FILE_COUNT" -gt 0 ]; then
            LINE_COUNT=$(eval "find . -path \"*/$dir/*\" -type f \( $FILE_PATTERNS \) -exec wc -l {} + 2>/dev/null | awk '{sum += \$1} END {print sum}'")
            printf "%-12s | %29d | %s\n" "$dir" "$FILE_COUNT" "$LINE_COUNT"
        else
            printf "%-12s | %29d | 0\n" "$dir" "0"
        fi
    fi
done
echo ""

echo "==================================================================="
echo "This count should match the VS Code extension 'Timoch Git Stats'"
echo "===================================================================" 