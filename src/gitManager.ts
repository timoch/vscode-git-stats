import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import { promisify } from 'util';
import { exec } from 'child_process';

const readFile = promisify(fs.readFile);
const execAsync = promisify(exec);

export interface GitStats {
    branch: string;
    branchAdditions: number;
    branchDeletions: number;
    workingAdditions: number;
    workingDeletions: number;
    untrackedLines: number;
    isMainBranch: boolean;
}

export class GitManager {
    private workspaceRoot: string;
    private mainBranch: string | null = null;

    constructor(workspaceFolder: vscode.WorkspaceFolder) {
        this.workspaceRoot = workspaceFolder.uri.fsPath;
    }

    private async execGit(command: string): Promise<string> {
        try {
            const { stdout } = await execAsync(`git ${command}`, {
                cwd: this.workspaceRoot,
                maxBuffer: 1024 * 1024 * 10 // 10MB buffer
            });
            return stdout.trim();
        } catch (error: any) {
            throw new Error(`Git command failed: ${error.message}`);
        }
    }

    public async isGitRepository(): Promise<boolean> {
        try {
            await this.execGit('rev-parse --git-dir');
            return true;
        } catch {
            return false;
        }
    }

    public async getGitStats(): Promise<GitStats | null> {
        try {
            if (!await this.isGitRepository()) {
                return null;
            }

            // Get current branch
            const branch = await this.getCurrentBranch();

            // Find main branch
            await this.findMainBranch();
            
            const isMainBranch = branch === this.mainBranch;

            // Get branch statistics (commits since branching from main/master)
            let branchAdditions = 0;
            let branchDeletions = 0;
            
            if (this.mainBranch && !isMainBranch) {
                try {
                    const diffStat = await this.execGit(`diff ${this.mainBranch}...HEAD --numstat`);
                    const stats = this.parseNumstat(diffStat);
                    branchAdditions = stats.additions;
                    branchDeletions = stats.deletions;
                } catch {
                    // Branch comparison failed, ignore
                }
            }

            // Get working directory changes
            const workingStats = await this.getWorkingChanges();

            return {
                branch,
                branchAdditions,
                branchDeletions,
                workingAdditions: workingStats.additions,
                workingDeletions: workingStats.deletions,
                untrackedLines: workingStats.untrackedLines,
                isMainBranch
            };
        } catch (error) {
            console.error('Error getting git stats:', error);
            return null;
        }
    }

    private async getCurrentBranch(): Promise<string> {
        try {
            const branch = await this.execGit('branch --show-current');
            return branch || 'HEAD';
        } catch {
            // Fallback for older git versions
            try {
                const branch = await this.execGit('rev-parse --abbrev-ref HEAD');
                return branch || 'HEAD';
            } catch {
                return 'unknown';
            }
        }
    }

    private async findMainBranch(): Promise<void> {
        try {
            // Get all branches
            const branches = await this.execGit('branch -a');
            const branchList = branches.split('\n').map(b => b.trim());
            
            // Check for local 'main' first, then 'master'
            if (branchList.some(b => b === 'main' || b === '* main')) {
                this.mainBranch = 'main';
            } else if (branchList.some(b => b === 'master' || b === '* master')) {
                this.mainBranch = 'master';
            } else {
                // Check remote branches
                if (branchList.some(b => b.includes('remotes/origin/main'))) {
                    this.mainBranch = 'main';
                } else if (branchList.some(b => b.includes('remotes/origin/master'))) {
                    this.mainBranch = 'master';
                }
            }
        } catch {
            // Failed to find main branch
            this.mainBranch = null;
        }
    }

    private async getWorkingChanges(): Promise<{ additions: number; deletions: number; untrackedLines: number }> {
        let additions = 0;
        let deletions = 0;
        let untrackedLines = 0;

        try {
            // Get staged changes
            const stagedDiff = await this.execGit('diff --cached --numstat');
            const stagedStats = this.parseNumstat(stagedDiff);
            additions += stagedStats.additions;
            deletions += stagedStats.deletions;

            // Get unstaged changes
            const unstagedDiff = await this.execGit('diff --numstat');
            const unstagedStats = this.parseNumstat(unstagedDiff);
            additions += unstagedStats.additions;
            deletions += unstagedStats.deletions;

            // Count lines in untracked files
            try {
                const untrackedFiles = await this.execGit('ls-files --others --exclude-standard');
                if (untrackedFiles) {
                    const files = untrackedFiles.split('\n').filter(f => f.trim());
                    for (const file of files) {
                        try {
                            const filePath = path.join(this.workspaceRoot, file);
                            const content = await readFile(filePath, 'utf-8');
                            const lines = content.split('\n').length;
                            untrackedLines += lines;
                        } catch {
                            // Skip files we can't read
                        }
                    }
                }
            } catch {
                // No untracked files or error getting them
            }
        } catch (error) {
            console.error('Error getting working changes:', error);
        }

        return { additions, deletions, untrackedLines };
    }

    private parseNumstat(numstatOutput: string): { additions: number; deletions: number } {
        let additions = 0;
        let deletions = 0;

        if (!numstatOutput) {
            return { additions, deletions };
        }

        const lines = numstatOutput.split('\n').filter(line => line.trim());
        
        for (const line of lines) {
            const parts = line.split('\t');
            if (parts.length >= 2) {
                const added = parseInt(parts[0]) || 0;
                const deleted = parseInt(parts[1]) || 0;
                // Skip binary files (shown as '-')
                if (!isNaN(added) && !isNaN(deleted)) {
                    additions += added;
                    deletions += deleted;
                }
            }
        }

        return { additions, deletions };
    }

    public async getCurrentHead(): Promise<string | null> {
        try {
            const head = await this.execGit('rev-parse HEAD');
            return head;
        } catch {
            return null;
        }
    }

    public async getStatus(): Promise<string> {
        try {
            const status = await this.execGit('status --porcelain');
            // Parse status output to match what was expected
            const files = status.split('\n').filter(line => line.trim());
            const result = {
                modified: [] as string[],
                created: [] as string[],
                deleted: [] as string[],
                not_added: [] as string[]
            };

            for (const line of files) {
                if (line.length < 3) continue;
                const statusCode = line.substring(0, 2);
                const filename = line.substring(3);

                if (statusCode.includes('M')) {
                    result.modified.push(filename);
                } else if (statusCode === '??') {
                    result.not_added.push(filename);
                } else if (statusCode.includes('A')) {
                    result.created.push(filename);
                } else if (statusCode.includes('D')) {
                    result.deleted.push(filename);
                }
            }

            return JSON.stringify(result);
        } catch {
            return '';
        }
    }

    public async getRepositoryAge(): Promise<{ firstCommitDate: Date | null; totalCommits: number; contributors: number }> {
        try {
            // Get first commit date
            let firstCommitDate: Date | null = null;
            try {
                const firstCommit = await this.execGit('log --reverse --format=%at --max-count=1');
                if (firstCommit) {
                    firstCommitDate = new Date(parseInt(firstCommit) * 1000);
                }
            } catch {
                // No commits yet
            }

            // Get total commits
            let totalCommits = 0;
            try {
                const commitCount = await this.execGit('rev-list --count HEAD');
                totalCommits = parseInt(commitCount) || 0;
            } catch {
                // No commits yet
            }

            // Get number of contributors
            let contributors = 0;
            try {
                const authorList = await this.execGit('log --format=%ae | sort -u | wc -l');
                contributors = parseInt(authorList) || 0;
            } catch {
                // Try alternative method
                try {
                    const authors = await this.execGit('shortlog -sn');
                    contributors = authors.split('\n').filter(line => line.trim()).length;
                } catch {
                    // No contributors
                }
            }

            return { firstCommitDate, totalCommits, contributors };
        } catch {
            return { firstCommitDate: null, totalCommits: 0, contributors: 0 };
        }
    }

    public async getRecentlyModifiedFiles(limit: number = 10): Promise<Array<{ path: string; date: Date }>> {
        try {
            const recentFiles = await this.execGit(`log --name-only --pretty=format:%at -${limit * 2}`);
            const lines = recentFiles.split('\n');
            const files: Array<{ path: string; date: Date }> = [];
            const seen = new Set<string>();
            let currentDate: Date | null = null;

            for (const line of lines) {
                if (line.match(/^\d+$/)) {
                    currentDate = new Date(parseInt(line) * 1000);
                } else if (line.trim() && currentDate && !seen.has(line)) {
                    seen.add(line);
                    files.push({ path: line, date: currentDate });
                    if (files.length >= limit) break;
                }
            }

            return files;
        } catch {
            return [];
        }
    }
}