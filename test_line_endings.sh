#!/bin/bash

# Script to test line ending handling and debug counting differences
echo "==================================================================="
echo "Line Ending Test Script"
echo "==================================================================="
echo ""
echo "Current directory: $(pwd)"
echo ""

# Part 1: Check what kind of line endings are in the project
echo "1. CHECKING LINE ENDINGS IN PROJECT FILES"
echo "=========================================="
echo "Checking first 20 .cs files for line endings..."
echo ""

count_lf=0
count_crlf=0
count_mixed=0

find . -name "*.cs" -not -path "*/bin/*" -not -path "*/obj/*" -not -path "*/.git/*" | head -20 | while read f; do
    # Check for CRLF
    if grep -q $'\r' "$f"; then
        echo "  CRLF: $f"
        ((count_crlf++))
    else
        echo "  LF:   $f"
        ((count_lf++))
    fi
done

echo ""
echo "2. TESTING LINE COUNTING METHODS"
echo "================================="
echo "Creating test files with different line endings..."
echo ""

# Create test files
echo -e "line1\nline2\nline3" > test_lf.txt
echo -e "line1\r\nline2\r\nline3" > test_crlf.txt
echo -e "line1\nline2\nline3\n" > test_lf_trailing.txt
echo -e "line1\r\nline2\r\nline3\r\n" > test_crlf_trailing.txt
printf "line1\r\nline2\r\nline3\r\n" > test_crlf_real.txt

echo "File contents (with od -c to show special characters):"
echo "-------------------------------------------------------"
for f in test_*.txt; do
    echo "$f:"
    od -c "$f" | head -2
    echo ""
done

echo "3. COMPARING COUNTING METHODS"
echo "=============================="
echo ""
echo "wc -l results:"
echo "--------------"
for f in test_*.txt; do
    printf "%-25s: %s lines\n" "$f" "$(wc -l < "$f")"
done

echo ""
echo "Node.js counting (current VS Code extension method):"
echo "----------------------------------------------------"
for f in test_*.txt; do
    result=$(node -e "
        const fs = require('fs');
        const content = fs.readFileSync('$f', 'utf-8');
        if (content.length === 0) {
            console.log(0);
        } else {
            const lines = content.split(/\r?\n/);
            if (lines[lines.length - 1] === '') {
                console.log(lines.length - 1);
            } else {
                console.log(lines.length);
            }
        }
    " 2>/dev/null)
    printf "%-25s: %s lines\n" "$f" "$result"
done

echo ""
echo "Simple split('\n').length method:"
echo "---------------------------------"
for f in test_*.txt; do
    result=$(node -e "
        const fs = require('fs');
        const content = fs.readFileSync('$f', 'utf-8');
        console.log(content.split('\n').length);
    " 2>/dev/null)
    printf "%-25s: %s lines\n" "$f" "$result"
done

echo ""
echo "4. TESTING ON A REAL PROJECT FILE"
echo "=================================="
# Find a real .cs file to test
SAMPLE_FILE=$(find . -name "*.cs" -not -path "*/bin/*" -not -path "*/obj/*" -not -path "*/.git/*" | head -1)

if [ -n "$SAMPLE_FILE" ]; then
    echo "Testing with: $SAMPLE_FILE"
    echo ""
    
    # Check line ending type
    if grep -q $'\r' "$SAMPLE_FILE"; then
        echo "Line endings: CRLF (Windows)"
    else
        echo "Line endings: LF (Unix)"
    fi
    
    echo "wc -l count: $(wc -l < "$SAMPLE_FILE")"
    
    echo "Node.js count: $(node -e "
        const fs = require('fs');
        const content = fs.readFileSync('$SAMPLE_FILE', 'utf-8');
        if (content.length === 0) {
            console.log(0);
        } else {
            const lines = content.split(/\r?\n/);
            if (lines[lines.length - 1] === '') {
                console.log(lines.length - 1);
            } else {
                console.log(lines.length);
            }
        }
    " 2>/dev/null)"
    
    echo ""
    echo "First 3 lines with special chars:"
    head -3 "$SAMPLE_FILE" | od -c | head -5
fi

echo ""
echo "5. COUNTING ENTIRE PROJECT"
echo "==========================="
echo "This will compare wc -l vs the Node.js method on all .cs files"
echo "(This may take a moment...)"
echo ""

# Count with wc -l
WC_COUNT=$(find . -name "*.cs" -not -path "*/bin/*" -not -path "*/obj/*" -not -path "*/.git/*" -not -path "*/.claude/*" -exec wc -l {} + 2>/dev/null | awk '{sum += $1} END {print sum}')
echo "Total lines in .cs files using wc -l: $WC_COUNT"

# Count with Node.js method (sampling first 100 files for speed)
echo ""
echo "Sampling first 100 .cs files with Node.js method..."
NODE_COUNT=0
FILE_COUNT=0
find . -name "*.cs" -not -path "*/bin/*" -not -path "*/obj/*" -not -path "*/.git/*" -not -path "*/.claude/*" | head -100 | while read f; do
    count=$(node -e "
        const fs = require('fs');
        try {
            const content = fs.readFileSync('$f', 'utf-8');
            if (content.length === 0) {
                console.log(0);
            } else {
                const lines = content.split(/\r?\n/);
                if (lines[lines.length - 1] === '') {
                    console.log(lines.length - 1);
                } else {
                    console.log(lines.length);
                }
            }
        } catch(e) {
            console.log(0);
        }
    " 2>/dev/null)
    NODE_COUNT=$((NODE_COUNT + count))
    FILE_COUNT=$((FILE_COUNT + 1))
done

echo "Node.js count for first $FILE_COUNT files: $NODE_COUNT"

# Calculate the ratio
if [ "$FILE_COUNT" -gt 0 ]; then
    WC_SAMPLE=$(find . -name "*.cs" -not -path "*/bin/*" -not -path "*/obj/*" -not -path "*/.git/*" -not -path "*/.claude/*" | head -100 | xargs wc -l 2>/dev/null | tail -1 | awk '{print $1}')
    echo "wc -l count for same $FILE_COUNT files: $WC_SAMPLE"
    
    if [ "$WC_SAMPLE" -gt 0 ]; then
        RATIO=$(node -e "console.log(($NODE_COUNT / $WC_SAMPLE).toFixed(4))")
        echo ""
        echo "Ratio (Node.js / wc -l): $RATIO"
        
        if [ "$RATIO" != "1.0000" ]; then
            echo "There's a counting difference of $(node -e "console.log((Math.abs(1 - $RATIO) * 100).toFixed(2))")%"
        else
            echo "Counts match perfectly!"
        fi
    fi
fi

echo ""
echo "6. CLEANUP"
echo "=========="
rm -f test_*.txt
echo "Test files removed."
echo ""
echo "==================================================================="
echo "SUMMARY"
echo "==================================================================="
echo "If the Node.js count is different from wc -l, the issue is likely:"
echo "1. CRLF line endings being counted differently"
echo "2. Files without trailing newlines"
echo "3. Empty files or files with only whitespace"
echo ""
echo "The VS Code extension uses the Node.js method."
echo "The bash script uses wc -l."
echo "==================================================================="