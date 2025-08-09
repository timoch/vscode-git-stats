#!/bin/bash

echo "Checking for duplicate file counting"
echo "===================================="
echo ""

echo "1. Finding .cs files with our normal pattern:"
echo "----------------------------------------------"
find . -type f -name "*.cs" -not -path "*/bin/*" -not -path "*/obj/*" -not -path "*/.git/*" -not -path "*/.claude/*" | wc -l

echo ""
echo "2. Checking if files appear multiple times:"
echo "-------------------------------------------"
find . -type f -name "*.cs" -not -path "*/bin/*" -not -path "*/obj/*" -not -path "*/.git/*" -not -path "*/.claude/*" | sort | uniq -d | head -20

echo ""
echo "3. Looking for symlinks:"
echo "------------------------"
find . -type l -name "*.cs" | head -20

echo ""
echo "4. Checking the wc -l command from our script:"
echo "----------------------------------------------"
echo "Using find with -exec wc -l {} +"
find . -type f -name "*.cs" -not -path "*/bin/*" -not -path "*/obj/*" -not -path "*/.git/*" -not -path "*/.claude/*" -exec wc -l {} + 2>/dev/null | tail -5

echo ""
echo "Total with -exec wc -l {} +:"
find . -type f -name "*.cs" -not -path "*/bin/*" -not -path "*/obj/*" -not -path "*/.git/*" -not -path "*/.claude/*" -exec wc -l {} + 2>/dev/null | awk '{sum += $1} END {print sum}'

echo ""
echo "5. Using xargs instead:"
echo "-----------------------"
find . -type f -name "*.cs" -not -path "*/bin/*" -not -path "*/obj/*" -not -path "*/.git/*" -not -path "*/.claude/*" | xargs wc -l 2>/dev/null | tail -5

echo ""
echo "Total with xargs:"
find . -type f -name "*.cs" -not -path "*/bin/*" -not -path "*/obj/*" -not -path "*/.git/*" -not -path "*/.claude/*" | xargs wc -l 2>/dev/null | tail -1

echo ""
echo "6. Checking if wc -l output includes total lines multiple times:"
echo "----------------------------------------------------------------"
echo "Number of 'total' lines in wc output:"
find . -type f -name "*.cs" -not -path "*/bin/*" -not -path "*/obj/*" -not -path "*/.git/*" -not -path "*/.claude/*" -exec wc -l {} + 2>/dev/null | grep -c total

echo ""
echo "The 'total' lines themselves:"
find . -type f -name "*.cs" -not -path "*/bin/*" -not -path "*/obj/*" -not -path "*/.git/*" -not -path "*/.claude/*" -exec wc -l {} + 2>/dev/null | grep total