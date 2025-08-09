import * as vscode from 'vscode';
import simpleGit, { SimpleGit, DiffResult } from 'simple-git';
import * as path from 'path';
import * as fs from 'fs';
import { promisify } from 'util';

const readFile = promisify(fs.readFile);

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
    private git: SimpleGit;
    private workspaceRoot: string;
    private mainBranch: string | null = null;

    constructor(workspaceFolder: vscode.WorkspaceFolder) {
        this.workspaceRoot = workspaceFolder.uri.fsPath;
        this.git = simpleGit(this.workspaceRoot);
    }

    public async isGitRepository(): Promise<boolean> {
        try {
            await this.git.revparse(['--git-dir']);
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
            const status = await this.git.status();
            const branch = status.current || 'unknown';

            // Find main branch
            await this.findMainBranch();
            
            const isMainBranch = branch === this.mainBranch;

            // Get branch statistics (commits since branching from main/master)
            let branchAdditions = 0;
            let branchDeletions = 0;
            
            if (this.mainBranch && !isMainBranch) {
                try {
                    const diffSummary = await this.git.diffSummary([`${this.mainBranch}...HEAD`]);
                    branchAdditions = diffSummary.insertions;
                    branchDeletions = diffSummary.deletions;
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

    private async findMainBranch(): Promise<void> {
        try {
            const branches = await this.git.branch();
            
            // Check for 'main' first, then 'master'
            if (branches.all.includes('main')) {
                this.mainBranch = 'main';
            } else if (branches.all.includes('master')) {
                this.mainBranch = 'master';
            } else {
                // Check remote branches
                const remoteBranches = await this.git.branch(['-r']);
                if (remoteBranches.all.some(b => b.includes('origin/main'))) {
                    this.mainBranch = 'main';
                } else if (remoteBranches.all.some(b => b.includes('origin/master'))) {
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
            const stagedDiff = await this.git.diff(['--cached', '--numstat']);
            const stagedStats = this.parseNumstat(stagedDiff);
            additions += stagedStats.additions;
            deletions += stagedStats.deletions;

            // Get unstaged changes
            const unstagedDiff = await this.git.diff(['--numstat']);
            const unstagedStats = this.parseNumstat(unstagedDiff);
            additions += unstagedStats.additions;
            deletions += unstagedStats.deletions;

            // Count lines in untracked files
            const status = await this.git.status();
            for (const file of status.not_added) {
                try {
                    const filePath = path.join(this.workspaceRoot, file);
                    const content = await readFile(filePath, 'utf-8');
                    const lines = content.split('\n').length;
                    untrackedLines += lines;
                } catch {
                    // Skip files we can't read
                }
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
                additions += added;
                deletions += deleted;
            }
        }

        return { additions, deletions };
    }

    public async getCurrentHead(): Promise<string | null> {
        try {
            const head = await this.git.revparse(['HEAD']);
            return head.trim();
        } catch {
            return null;
        }
    }

    public async getStatus(): Promise<string> {
        try {
            const status = await this.git.status();
            return JSON.stringify({
                modified: status.modified,
                created: status.created,
                deleted: status.deleted,
                not_added: status.not_added
            });
        } catch {
            return '';
        }
    }
}