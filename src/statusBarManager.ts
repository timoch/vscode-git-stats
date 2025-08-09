import * as vscode from 'vscode';
import { GitStats } from './gitManager';
import { LineCounter } from './lineCounter';

export class StatusBarManager {
    private statusBarItem: vscode.StatusBarItem;
    private lineCounter: LineCounter;
    private showBranchStats: boolean = true;
    private showWorkingChanges: boolean = true;

    constructor(lineCounter: LineCounter) {
        this.lineCounter = lineCounter;
        this.statusBarItem = vscode.window.createStatusBarItem(
            vscode.StatusBarAlignment.Left,
            100
        );
        this.statusBarItem.command = 'gitStats.showDetails';
        this.updateConfiguration();
    }

    public updateConfiguration(): void {
        const config = vscode.workspace.getConfiguration('gitStats');
        this.showBranchStats = config.get<boolean>('showBranchStats', true);
        this.showWorkingChanges = config.get<boolean>('showWorkingChanges', true);
    }

    public update(gitStats: GitStats | null, totalLines: number): void {
        if (!gitStats) {
            // Not a git repository
            this.statusBarItem.text = `$(file-text) ${this.lineCounter.formatLineCount(totalLines)} lines`;
            this.statusBarItem.tooltip = `Total lines: ${totalLines.toLocaleString()}`;
        } else {
            const parts: string[] = [];
            
            // Git branch icon and name
            parts.push(`$(git-branch) ${gitStats.branch}`);
            
            // Line count
            const formattedLines = this.lineCounter.formatLineCount(totalLines);
            parts.push(`$(file-text) ${formattedLines}`);
            
            // Branch statistics (committed changes since branching)
            if (this.showBranchStats && !gitStats.isMainBranch && 
                (gitStats.branchAdditions > 0 || gitStats.branchDeletions > 0)) {
                parts.push(`$(diff-added)${gitStats.branchAdditions} $(diff-removed)${gitStats.branchDeletions}`);
            }
            
            // Working changes (uncommitted)
            if (this.showWorkingChanges) {
                const totalAdditions = gitStats.workingAdditions + gitStats.untrackedLines;
                const totalDeletions = gitStats.workingDeletions;
                
                if (totalAdditions > 0 || totalDeletions > 0) {
                    parts.push(`[$(diff-added)${totalAdditions} $(diff-removed)${totalDeletions}]`);
                }
            }
            
            this.statusBarItem.text = parts.join(' ');
            
            // Build tooltip
            const tooltipLines: string[] = [
                `Branch: ${gitStats.branch}`,
                `Total lines: ${totalLines.toLocaleString()} (${formattedLines})`
            ];
            
            if (!gitStats.isMainBranch && (gitStats.branchAdditions > 0 || gitStats.branchDeletions > 0)) {
                tooltipLines.push(`Branch changes: +${gitStats.branchAdditions}/-${gitStats.branchDeletions}`);
            }
            
            if (gitStats.workingAdditions > 0 || gitStats.workingDeletions > 0) {
                tooltipLines.push(`Staged/Unstaged: +${gitStats.workingAdditions}/-${gitStats.workingDeletions}`);
            }
            
            if (gitStats.untrackedLines > 0) {
                tooltipLines.push(`Untracked lines: ${gitStats.untrackedLines}`);
            }
            
            this.statusBarItem.tooltip = tooltipLines.join('\n');
        }
    }

    public show(): void {
        this.statusBarItem.show();
    }

    public hide(): void {
        this.statusBarItem.hide();
    }

    public dispose(): void {
        this.statusBarItem.dispose();
    }
}