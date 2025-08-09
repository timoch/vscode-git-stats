import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import { promisify } from 'util';

const readFile = promisify(fs.readFile);
const readdir = promisify(fs.readdir);
const stat = promisify(fs.stat);

export interface LineCountResult {
    totalLines: number;
    fileCount: number;
}

export class LineCounter {
    private includeExtensions: string[] = [];
    private excludePatterns: string[] = [];

    constructor() {
        this.updateConfiguration();
    }

    public updateConfiguration(): void {
        const config = vscode.workspace.getConfiguration('gitStats');
        this.includeExtensions = config.get<string[]>('includeExtensions', []);
        this.excludePatterns = config.get<string[]>('excludePatterns', []);
    }

    public async countLines(workspaceFolder: vscode.WorkspaceFolder): Promise<LineCountResult> {
        const rootPath = workspaceFolder.uri.fsPath;
        const result: LineCountResult = {
            totalLines: 0,
            fileCount: 0
        };

        await this.countLinesRecursive(rootPath, rootPath, result);
        return result;
    }

    private async countLinesRecursive(rootPath: string, currentPath: string, result: LineCountResult): Promise<void> {
        try {
            const items = await readdir(currentPath);
            
            for (const item of items) {
                const fullPath = path.join(currentPath, item);
                const relativePath = path.relative(rootPath, fullPath);
                
                // Check if path matches any exclude pattern
                if (this.isExcluded(relativePath)) {
                    continue;
                }

                const itemStat = await stat(fullPath);
                
                if (itemStat.isDirectory()) {
                    // Skip .git directory
                    if (item === '.git') {
                        continue;
                    }
                    await this.countLinesRecursive(rootPath, fullPath, result);
                } else if (itemStat.isFile() && this.shouldIncludeFile(item)) {
                    const lines = await this.countFileLines(fullPath);
                    result.totalLines += lines;
                    result.fileCount++;
                }
            }
        } catch (error) {
            // Silently skip directories/files we can't read
        }
    }

    private isExcluded(relativePath: string): boolean {
        const normalizedPath = relativePath.replace(/\\/g, '/');
        
        // Check against configured exclude patterns
        for (const pattern of this.excludePatterns) {
            // Convert glob pattern to regex
            let regexPattern = pattern
                .replace(/\\/g, '/')
                .replace(/\./g, '\\.')
                .replace(/\*\*/g, '__DOUBLESTAR__')
                .replace(/\*/g, '[^/]*')
                .replace(/__DOUBLESTAR__/g, '.*')
                .replace(/\?/g, '.');
            
            // Handle patterns that end with /**
            if (pattern.endsWith('/**')) {
                regexPattern = regexPattern.slice(0, -2) + '(/.*)?';
            }
            
            const regex = new RegExp('^' + regexPattern + '$');
            const fullPathRegex = new RegExp(regexPattern);
            
            // Test against both the relative path and any substring match for ** patterns
            if (regex.test(normalizedPath) || 
                (pattern.includes('**/') && fullPathRegex.test(normalizedPath)) ||
                (pattern.startsWith('**/') && normalizedPath.endsWith(pattern.substring(3))) ||
                (pattern.includes('**/') && normalizedPath.includes(pattern.replace(/\*\*/g, '')))) {
                return true;
            }
        }
        
        return false;
    }

    private shouldIncludeFile(filename: string): boolean {
        const extension = path.extname(filename).toLowerCase().slice(1);
        if (!extension) {
            // Include files without extension if they match specific names
            const specialFiles = ['Dockerfile', 'Makefile', 'Rakefile', 'Gemfile', 'Vagrantfile', 'Jenkinsfile', 'Procfile'];
            return specialFiles.includes(filename);
        }
        return this.includeExtensions.includes(extension);
    }

    private async countFileLines(filePath: string): Promise<number> {
        try {
            const content = await readFile(filePath, 'utf-8');
            if (content.length === 0) {
                return 0;
            }
            
            // Count lines exactly like wc -l does:
            // wc -l counts the number of newline characters
            let count = 0;
            for (let i = 0; i < content.length; i++) {
                if (content[i] === '\n') {
                    count++;
                }
            }
            return count;
        } catch (error) {
            return 0;
        }
    }

    public formatLineCount(lines: number): string {
        if (lines >= 1000000) {
            return `${(lines / 1000000).toFixed(1)}M`;
        } else if (lines >= 10000) {
            return `${(lines / 1000).toFixed(1)}K`;
        } else if (lines >= 1000) {
            return `${(lines / 1000).toFixed(2)}K`;
        } else {
            return lines.toString();
        }
    }
}