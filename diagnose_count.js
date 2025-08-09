#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

// Test different counting methods on a directory
const dir = process.argv[2] || '.';

console.log('Diagnostic Line Counter');
console.log('=======================');
console.log(`Directory: ${dir}`);
console.log('');

// Find all .cs files
const files = execSync(`find ${dir} -name "*.cs" -not -path "*/bin/*" -not -path "*/obj/*" -not -path "*/.git/*" -not -path "*/.claude/*" | head -20`, { encoding: 'utf-8' })
    .split('\n')
    .filter(f => f);

console.log(`Testing first ${files.length} .cs files...`);
console.log('');

let totalWc = 0;
let totalNode = 0;
let totalNodeSimple = 0;
let differences = [];

for (const file of files) {
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
        
        // Simple split count
        const simpleCount = content.split('\n').length;
        
        totalWc += wcCount;
        totalNode += nodeCount;
        totalNodeSimple += simpleCount;
        
        if (wcCount !== nodeCount) {
            differences.push({
                file: file.substring(file.lastIndexOf('/') + 1),
                wc: wcCount,
                node: nodeCount,
                simple: simpleCount,
                hasTrailingNewline: content.endsWith('\n'),
                hasCRLF: content.includes('\r\n'),
                contentLength: content.length
            });
        }
    } catch (e) {
        console.error(`Error processing ${file}: ${e.message}`);
    }
}

console.log('Summary:');
console.log('--------');
console.log(`Total wc -l:        ${totalWc}`);
console.log(`Total Node.js:      ${totalNode}`);
console.log(`Total simple split: ${totalNodeSimple}`);
console.log('');

if (differences.length > 0) {
    console.log('Files with different counts:');
    console.log('-----------------------------');
    console.table(differences.slice(0, 10));
}

// Now test on ALL .cs files
console.log('');
console.log('Full project count:');
console.log('-------------------');

const allCsWc = execSync(`find ${dir} -name "*.cs" -not -path "*/bin/*" -not -path "*/obj/*" -not -path "*/.git/*" -not -path "*/.claude/*" -exec wc -l {} + | awk '{sum += $1} END {print sum}'`, { encoding: 'utf-8' }).trim();
console.log(`All .cs files (wc -l): ${allCsWc}`);

// Count with our method
let allFilesNode = 0;
let fileCount = 0;
const allFiles = execSync(`find ${dir} -name "*.cs" -not -path "*/bin/*" -not -path "*/obj/*" -not -path "*/.git/*" -not -path "*/.claude/*"`, { encoding: 'utf-8' })
    .split('\n')
    .filter(f => f);

for (const file of allFiles) {
    try {
        const content = fs.readFileSync(file, 'utf-8');
        if (content.length > 0) {
            const lines = content.split(/\r?\n/);
            if (lines[lines.length - 1] === '') {
                allFilesNode += lines.length - 1;
            } else {
                allFilesNode += lines.length;
            }
        }
        fileCount++;
    } catch (e) {
        // Skip
    }
}

console.log(`All .cs files (Node.js): ${allFilesNode} (${fileCount} files)`);
console.log('');
console.log(`Difference: ${Math.abs(parseInt(allCsWc) - allFilesNode)} lines`);
console.log(`Ratio: ${(allFilesNode / parseInt(allCsWc)).toFixed(4)}`);