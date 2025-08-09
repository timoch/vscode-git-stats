#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

// Test different counting methods on a directory
const dir = process.argv[2] || '.';

console.log('Finding Files with Large Count Differences');
console.log('==========================================');
console.log(`Directory: ${dir}`);
console.log('');

// Find all .cs files
const allFiles = execSync(`find ${dir} -name "*.cs" -not -path "*/bin/*" -not -path "*/obj/*" -not -path "*/.git/*" -not -path "*/.claude/*"`, { encoding: 'utf-8' })
    .split('\n')
    .filter(f => f);

console.log(`Checking ${allFiles.length} .cs files...`);
console.log('');

let totalWc = 0;
let totalNode = 0;
let largeDiscrepancies = [];
let processedCount = 0;

for (const file of allFiles) {
    if (!file) continue;
    
    try {
        // wc -l count
        const wcCount = parseInt(execSync(`wc -l < "${file}"`, { encoding: 'utf-8' }).trim()) || 0;
        
        // Node.js count (VS Code extension method)
        const content = fs.readFileSync(file, 'utf-8');
        let nodeCount = 0;
        
        if (content.length > 0) {
            const lines = content.split(/\r?\n/);
            if (lines[lines.length - 1] === '') {
                nodeCount = lines.length - 1;
            } else {
                nodeCount = lines.length;
            }
        }
        
        totalWc += wcCount;
        totalNode += nodeCount;
        
        const diff = Math.abs(wcCount - nodeCount);
        
        // Log files with more than 1 line difference
        if (diff > 1) {
            // Check for unusual patterns
            const lineBreaks = (content.match(/\n/g) || []).length;
            const crlfCount = (content.match(/\r\n/g) || []).length;
            const crOnlyCount = (content.match(/\r(?!\n)/g) || []).length;
            
            largeDiscrepancies.push({
                file: file,
                wc: wcCount,
                node: nodeCount,
                diff: wcCount - nodeCount,
                lineBreaks: lineBreaks,
                crlfCount: crlfCount,
                crOnlyCount: crOnlyCount,
                size: content.length,
                hasTrailingNewline: content.endsWith('\n'),
                hasTrailingCR: content.endsWith('\r'),
                firstChars: content.substring(0, 50).replace(/\n/g, '\\n').replace(/\r/g, '\\r'),
                lastChars: content.substring(content.length - 50).replace(/\n/g, '\\n').replace(/\r/g, '\\r')
            });
        }
        
        processedCount++;
        if (processedCount % 500 === 0) {
            console.log(`Processed ${processedCount}/${allFiles.length} files...`);
        }
    } catch (e) {
        console.error(`Error processing ${file}: ${e.message}`);
    }
}

console.log('');
console.log('Summary:');
console.log('--------');
console.log(`Total files processed: ${processedCount}`);
console.log(`Total wc -l:           ${totalWc}`);
console.log(`Total Node.js:         ${totalNode}`);
console.log(`Total difference:      ${totalWc - totalNode}`);
console.log(`Average per file:      ${((totalWc - totalNode) / processedCount).toFixed(2)} lines`);
console.log('');

if (largeDiscrepancies.length > 0) {
    console.log(`Files with >1 line difference: ${largeDiscrepancies.length}`);
    console.log('');
    
    // Sort by difference
    largeDiscrepancies.sort((a, b) => Math.abs(b.diff) - Math.abs(a.diff));
    
    console.log('Top 20 files with largest discrepancies:');
    console.log('=========================================');
    
    for (let i = 0; i < Math.min(20, largeDiscrepancies.length); i++) {
        const f = largeDiscrepancies[i];
        console.log(`\nFile: ${f.file}`);
        console.log(`  wc -l: ${f.wc}, Node.js: ${f.node}, Difference: ${f.diff}`);
        console.log(`  Line breaks: ${f.lineBreaks}, CRLF: ${f.crlfCount}, CR only: ${f.crOnlyCount}`);
        console.log(`  Has trailing newline: ${f.hasTrailingNewline}, Has trailing CR: ${f.hasTrailingCR}`);
        console.log(`  File size: ${f.size} bytes`);
        console.log(`  First 50 chars: ${f.firstChars}`);
        console.log(`  Last 50 chars: ${f.lastChars}`);
    }
    
    // Check for patterns
    console.log('\n\nPattern Analysis:');
    console.log('==================');
    
    const withCRLF = largeDiscrepancies.filter(f => f.crlfCount > 0);
    const withCROnly = largeDiscrepancies.filter(f => f.crOnlyCount > 0);
    const withoutTrailing = largeDiscrepancies.filter(f => !f.hasTrailingNewline);
    
    console.log(`Files with CRLF: ${withCRLF.length}`);
    console.log(`Files with CR only: ${withCROnly.length}`);
    console.log(`Files without trailing newline: ${withoutTrailing.length}`);
    
    if (withCRLF.length > 0) {
        const avgDiff = withCRLF.reduce((sum, f) => sum + f.diff, 0) / withCRLF.length;
        console.log(`  Average difference for CRLF files: ${avgDiff.toFixed(2)}`);
    }
    
    // Look for specific problem
    const hugeDiscrepancies = largeDiscrepancies.filter(f => Math.abs(f.diff) > 100);
    if (hugeDiscrepancies.length > 0) {
        console.log(`\n${hugeDiscrepancies.length} files have >100 line difference!`);
        console.log('These files likely have unusual line endings or encoding issues.');
    }
}

// Save detailed report
const reportFile = 'line_count_discrepancies.json';
fs.writeFileSync(reportFile, JSON.stringify(largeDiscrepancies, null, 2));
console.log(`\nDetailed report saved to: ${reportFile}`);