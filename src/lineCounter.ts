import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import { promisify } from 'util';
import { exec } from 'child_process';

const readFile = promisify(fs.readFile);
const execAsync = promisify(exec);

export interface FileInfo {
    path: string;
    lines: number;
    extension: string;
}

export interface LineCountResult {
    totalLines: number;
    fileCount: number;
    files: FileInfo[];
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
            fileCount: 0,
            files: []
        };

        console.log(`Git Stats: Starting line count in ${rootPath}`);
        
        // Check if this is a git repository
        const isGitRepo = await this.isGitRepository(rootPath);
        
        if (isGitRepo) {
            // Use git to get tracked and untracked (but not ignored) files
            await this.countLinesUsingGit(rootPath, result);
        } else {
            // Fall back to filesystem traversal for non-git directories
            await this.countLinesUsingFilesystem(rootPath, result);
        }
        
        console.log(`Git Stats: Counted ${result.fileCount} files, ${result.totalLines} lines`);
        return result;
    }

    private async isGitRepository(rootPath: string): Promise<boolean> {
        try {
            await execAsync('git rev-parse --git-dir', { cwd: rootPath });
            return true;
        } catch {
            return false;
        }
    }

    private async countLinesUsingGit(rootPath: string, result: LineCountResult): Promise<void> {
        try {
            // Get all tracked files
            const { stdout: trackedFiles } = await execAsync('git ls-files', {
                cwd: rootPath,
                maxBuffer: 1024 * 1024 * 10 // 10MB buffer
            });

            // Get untracked files that are not ignored
            const { stdout: untrackedFiles } = await execAsync('git ls-files --others --exclude-standard', {
                cwd: rootPath,
                maxBuffer: 1024 * 1024 * 10 // 10MB buffer
            });

            // Combine both lists
            const allFiles = [
                ...trackedFiles.split('\n').filter(f => f.trim()),
                ...untrackedFiles.split('\n').filter(f => f.trim())
            ];

            // Get list of text (non-binary) files using git grep
            // This will only return files that git considers as text
            let textFiles = new Set<string>();
            try {
                const { stdout: textFilesList } = await execAsync('git grep -Il ""', {
                    cwd: rootPath,
                    maxBuffer: 1024 * 1024 * 10 // 10MB buffer
                });
                textFilesList.split('\n').filter(f => f.trim()).forEach(f => textFiles.add(f));
            } catch {
                // If git grep fails (e.g., no commits yet), check all files
                textFiles = new Set(allFiles);
            }

            // Count lines for each file
            for (const file of allFiles) {
                if (!file) continue;
                
                // Check if file should be included based on extension
                const filename = path.basename(file);
                if (!this.shouldIncludeFile(filename)) {
                    continue;
                }

                const fullPath = path.join(rootPath, file);
                try {
                    // Check if file is binary
                    const isBinary = await this.isBinaryFile(fullPath, file, textFiles);
                    if (isBinary) {
                        console.log(`Git Stats: Skipping binary file ${file}`);
                        continue;
                    }

                    const lines = await this.countFileLines(fullPath);
                    const extension = path.extname(filename).toLowerCase().slice(1) || 'no-ext';
                    result.totalLines += lines;
                    result.fileCount++;
                    result.files.push({
                        path: file,
                        lines: lines,
                        extension: extension
                    });
                } catch (error) {
                    // Skip files we can't read
                    console.log(`Git Stats: Could not read ${file}`);
                }
            }
        } catch (error) {
            console.error('Git Stats: Error using git commands, falling back to filesystem:', error);
            // Fall back to filesystem traversal if git commands fail
            await this.countLinesUsingFilesystem(rootPath, result);
        }
    }

    private async countLinesUsingFilesystem(rootPath: string, result: LineCountResult): Promise<void> {
        // This is the fallback method for non-git directories
        // It uses the exclude patterns from configuration
        await this.countLinesRecursive(rootPath, rootPath, result);
    }

    private async countLinesRecursive(rootPath: string, currentPath: string, result: LineCountResult): Promise<void> {
        try {
            const { readdir, stat } = fs.promises;
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
                    // Check if file is binary using basic heuristics
                    const isBinary = await this.isBinaryFile(fullPath, relativePath, new Set());
                    if (isBinary) {
                        console.log(`Git Stats: Skipping binary file ${relativePath}`);
                        continue;
                    }

                    const lines = await this.countFileLines(fullPath);
                    const extension = path.extname(item).toLowerCase().slice(1) || 'no-ext';
                    result.totalLines += lines;
                    result.fileCount++;
                    result.files.push({
                        path: relativePath,
                        lines: lines,
                        extension: extension
                    });
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

    private async isBinaryFile(filePath: string, relativePath: string, textFiles: Set<string>): Promise<boolean> {
        // If git already told us it's a text file, trust that
        if (textFiles.size > 0 && textFiles.has(relativePath)) {
            return false;
        }

        // Check common binary extensions
        const binaryExtensions = [
            '.exe', '.dll', '.so', '.dylib', '.a', '.lib', '.o', '.obj',
            '.png', '.jpg', '.jpeg', '.gif', '.bmp', '.ico', '.svg', '.webp',
            '.pdf', '.doc', '.docx', '.xls', '.xlsx', '.ppt', '.pptx',
            '.zip', '.tar', '.gz', '.bz2', '.7z', '.rar', '.jar', '.war',
            '.mp3', '.mp4', '.avi', '.mov', '.wmv', '.flv', '.webm', '.ogg',
            '.ttf', '.otf', '.woff', '.woff2', '.eot',
            '.pyc', '.pyo', '.class', '.dex',
            '.db', '.sqlite', '.mdb'
        ];
        
        const ext = path.extname(filePath).toLowerCase();
        if (binaryExtensions.includes(ext)) {
            return true;
        }

        // Read first few bytes to check for binary content
        try {
            const buffer = Buffer.alloc(8000);
            const fd = await promisify(fs.open)(filePath, 'r');
            const { bytesRead } = await promisify(fs.read)(fd, buffer, 0, 8000, 0);
            await promisify(fs.close)(fd);

            // Check for null bytes (common indicator of binary files)
            for (let i = 0; i < bytesRead; i++) {
                if (buffer[i] === 0) {
                    return true;
                }
            }

            // Check for high proportion of non-printable characters
            let nonPrintable = 0;
            for (let i = 0; i < bytesRead; i++) {
                const byte = buffer[i];
                // Count non-printable characters (excluding common whitespace)
                if (byte < 32 && byte !== 9 && byte !== 10 && byte !== 13) {
                    nonPrintable++;
                }
            }

            // If more than 30% non-printable, consider it binary
            return (nonPrintable / bytesRead) > 0.3;
        } catch {
            // If we can't read the file, assume it's not binary
            return false;
        }
    }

    private async countFileLines(filePath: string): Promise<number> {
        try {
            const content = await readFile(filePath, 'utf-8');
            if (content.length === 0) {
                return 0;
            }
            
            // Count logical lines for developers
            // Split by newlines and count non-empty content
            const lines = content.split(/\r?\n/);
            
            // If file ends with newline, last element will be empty
            if (lines[lines.length - 1] === '') {
                return lines.length - 1;
            }
            
            // If file doesn't end with newline, count all lines
            return lines.length;
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