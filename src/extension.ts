import * as vscode from 'vscode';
import * as path from 'path';
import { GitManager, GitStats } from './gitManager';
import { LineCounter } from './lineCounter';
import { StatusBarManager } from './statusBarManager';
import { Cache } from './cache';

let statusBarManager: StatusBarManager | undefined;
let updateTimer: NodeJS.Timer | undefined;
let gitManager: GitManager | undefined;
let lineCounter: LineCounter | undefined;
let cache: Cache | undefined;

export function activate(context: vscode.ExtensionContext) {
    console.log('Git Stats extension is now active!');
    vscode.window.showInformationMessage('Git Stats extension activated!');

    // Initialize components
    lineCounter = new LineCounter();
    cache = new Cache();
    statusBarManager = new StatusBarManager(lineCounter);

    // Get initial workspace folder
    const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
    if (workspaceFolder) {
        console.log('Git Stats: Found workspace folder:', workspaceFolder.uri.fsPath);
        gitManager = new GitManager(workspaceFolder);
        startMonitoring();
    } else {
        console.log('Git Stats: No workspace folder found');
        vscode.window.showWarningMessage('Git Stats: No workspace folder open');
        // Still show status bar with basic info
        statusBarManager.show();
    }

    // Register commands
    const refreshCommand = vscode.commands.registerCommand('gitStats.refresh', async () => {
        cache?.clear();
        await updateStats();
        vscode.window.showInformationMessage('Git Stats refreshed!');
    });

    const showDetailsCommand = vscode.commands.registerCommand('gitStats.showDetails', async () => {
        await showDetailedStats();
    });

    const clearCacheCommand = vscode.commands.registerCommand('gitStats.clearCache', () => {
        cache?.clear();
        vscode.window.showInformationMessage('Git Stats cache cleared!');
    });

    // Register configuration change listener
    const configChangeListener = vscode.workspace.onDidChangeConfiguration(e => {
        if (e.affectsConfiguration('gitStats')) {
            lineCounter?.updateConfiguration();
            statusBarManager?.updateConfiguration();
            cache?.clear();
            
            // Restart monitoring with new interval
            stopMonitoring();
            startMonitoring();
        }
    });

    // Register workspace change listeners
    const workspaceFolderChangeListener = vscode.workspace.onDidChangeWorkspaceFolders(() => {
        const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
        if (workspaceFolder) {
            gitManager = new GitManager(workspaceFolder);
            cache?.clear();
            updateStats();
        }
    });

    // Register file system watchers
    const fileWatcher = vscode.workspace.createFileSystemWatcher('**/*', false, false, false);
    
    const onFileChange = () => {
        // Clear cache on file changes
        if (vscode.workspace.workspaceFolders?.[0]) {
            cache?.clearForWorkspace(vscode.workspace.workspaceFolders[0].uri.fsPath);
        }
    };

    fileWatcher.onDidCreate(onFileChange);
    fileWatcher.onDidChange(onFileChange);
    fileWatcher.onDidDelete(onFileChange);

    // Register active editor change listener for faster updates
    const activeEditorChangeListener = vscode.window.onDidChangeActiveTextEditor(() => {
        updateStats();
    });

    // Add to subscriptions
    context.subscriptions.push(
        refreshCommand,
        showDetailsCommand,
        clearCacheCommand,
        configChangeListener,
        workspaceFolderChangeListener,
        fileWatcher,
        activeEditorChangeListener,
        statusBarManager
    );

    // Initial update
    updateStats();
}

function startMonitoring() {
    const config = vscode.workspace.getConfiguration('gitStats');
    const enabled = config.get<boolean>('enabled', true);
    
    if (!enabled) {
        statusBarManager?.hide();
        return;
    }

    statusBarManager?.show();
    
    const updateInterval = Math.max(1000, config.get<number>('updateInterval', 5000));
    
    updateTimer = setInterval(() => {
        updateStats();
    }, updateInterval);
}

function stopMonitoring() {
    if (updateTimer) {
        clearInterval(updateTimer);
        updateTimer = undefined;
    }
}

async function updateStats() {
    const config = vscode.workspace.getConfiguration('gitStats');
    const enabled = config.get<boolean>('enabled', true);
    
    if (!enabled || !statusBarManager || !lineCounter || !gitManager) {
        return;
    }

    const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
    if (!workspaceFolder) {
        statusBarManager.hide();
        return;
    }

    try {
        // Get git information for cache key
        const gitHead = await gitManager.getCurrentHead();
        const gitStatus = await gitManager.getStatus();
        
        // Check cache
        let lineCountResult = cache?.get(workspaceFolder.uri.fsPath, gitHead, gitStatus);
        
        if (!lineCountResult) {
            // Count lines
            lineCountResult = await lineCounter.countLines(workspaceFolder);
            
            // Update cache
            cache?.set(workspaceFolder.uri.fsPath, gitHead, gitStatus, lineCountResult);
        }

        // Get git stats
        const gitStats = await gitManager.getGitStats();

        // Update status bar
        statusBarManager.update(gitStats, lineCountResult.totalLines);
    } catch (error) {
        console.error('Error updating Git Stats:', error);
    }
}

async function showDetailedStats() {
    const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
    if (!workspaceFolder || !gitManager || !lineCounter) {
        vscode.window.showWarningMessage('No workspace folder open');
        return;
    }

    const outputChannel = vscode.window.createOutputChannel('Git Stats');
    outputChannel.clear();
    outputChannel.show();

    outputChannel.appendLine('╔══════════════════════════════════════════════════════════════════════════════╗');
    outputChannel.appendLine('║                         Git Repository Statistics                            ║');
    outputChannel.appendLine('╚══════════════════════════════════════════════════════════════════════════════╝\n');

    try {
        // Get git stats
        const gitStats = await gitManager.getGitStats();
        
        // Count lines
        const lineCountResult = await lineCounter.countLines(workspaceFolder);
        
        // Get repository age and activity
        const repoAge = await gitManager.getRepositoryAge();
        
        // Get recently modified files
        const recentFiles = await gitManager.getRecentlyModifiedFiles(10);
        
        // === BASIC INFORMATION ===
        outputChannel.appendLine('┌─────────────────────────────────────────────────────────────────────────────┐');
        outputChannel.appendLine('│ REPOSITORY INFORMATION                                                      │');
        outputChannel.appendLine('└─────────────────────────────────────────────────────────────────────────────┘');
        outputChannel.appendLine(`  Workspace: ${workspaceFolder.name}`);
        outputChannel.appendLine(`  Path: ${workspaceFolder.uri.fsPath}`);
        
        if (gitStats) {
            outputChannel.appendLine(`  Current Branch: ${gitStats.branch}`);
            outputChannel.appendLine(`  Is Main Branch: ${gitStats.isMainBranch ? 'Yes' : 'No'}`);
        }
        
        if (repoAge.firstCommitDate) {
            const ageInDays = Math.floor((Date.now() - repoAge.firstCommitDate.getTime()) / (1000 * 60 * 60 * 24));
            outputChannel.appendLine(`  Repository Age: ${ageInDays} days (since ${repoAge.firstCommitDate.toLocaleDateString()})`);
            outputChannel.appendLine(`  Total Commits: ${repoAge.totalCommits.toLocaleString()}`);
            outputChannel.appendLine(`  Contributors: ${repoAge.contributors}`);
        }
        
        // === OVERALL STATISTICS ===
        outputChannel.appendLine('\n┌─────────────────────────────────────────────────────────────────────────────┐');
        outputChannel.appendLine('│ OVERALL STATISTICS                                                          │');
        outputChannel.appendLine('└─────────────────────────────────────────────────────────────────────────────┘');
        outputChannel.appendLine(`  Total Lines: ${lineCountResult.totalLines.toLocaleString()} (${lineCounter.formatLineCount(lineCountResult.totalLines)})`);
        outputChannel.appendLine(`  Total Files: ${lineCountResult.fileCount.toLocaleString()}`);
        
        if (lineCountResult.fileCount > 0) {
            const avgLinesPerFile = Math.round(lineCountResult.totalLines / lineCountResult.fileCount);
            outputChannel.appendLine(`  Average Lines/File: ${avgLinesPerFile.toLocaleString()}`);
            
            // Calculate median
            const sortedFiles = [...lineCountResult.files].sort((a, b) => a.lines - b.lines);
            const medianLines = sortedFiles[Math.floor(sortedFiles.length / 2)].lines;
            outputChannel.appendLine(`  Median Lines/File: ${medianLines.toLocaleString()}`);
            
            // Calculate standard deviation
            const mean = lineCountResult.totalLines / lineCountResult.fileCount;
            const variance = lineCountResult.files.reduce((acc, file) => acc + Math.pow(file.lines - mean, 2), 0) / lineCountResult.fileCount;
            const stdDev = Math.round(Math.sqrt(variance));
            outputChannel.appendLine(`  Std Deviation: ${stdDev.toLocaleString()}`);
        }
        
        // === TOP 20 LARGEST FILES ===
        outputChannel.appendLine('\n┌─────────────────────────────────────────────────────────────────────────────┐');
        outputChannel.appendLine('│ TOP 20 LARGEST FILES                                                        │');
        outputChannel.appendLine('└─────────────────────────────────────────────────────────────────────────────┘');
        
        const top20Files = [...lineCountResult.files]
            .sort((a, b) => b.lines - a.lines)
            .slice(0, 20);
        
        const maxPathLength = Math.min(50, Math.max(...top20Files.map(f => f.path.length)));
        
        top20Files.forEach((file, index) => {
            const displayPath = file.path.length > 50 
                ? '...' + file.path.slice(-(50 - 3))
                : file.path;
            const percentage = ((file.lines / lineCountResult.totalLines) * 100).toFixed(1);
            const bar = '█'.repeat(Math.floor(parseFloat(percentage) / 2));
            outputChannel.appendLine(`  ${String(index + 1).padStart(2)}. ${displayPath.padEnd(maxPathLength)} │ ${String(file.lines).padStart(6)} lines (${percentage.padStart(5)}%) ${bar}`);
        });
        
        // === LANGUAGE/EXTENSION DISTRIBUTION ===
        outputChannel.appendLine('\n┌─────────────────────────────────────────────────────────────────────────────┐');
        outputChannel.appendLine('│ LANGUAGE DISTRIBUTION                                                       │');
        outputChannel.appendLine('└─────────────────────────────────────────────────────────────────────────────┘');
        
        const extensionStats = new Map<string, { count: number; lines: number }>();
        lineCountResult.files.forEach(file => {
            const stats = extensionStats.get(file.extension) || { count: 0, lines: 0 };
            stats.count++;
            stats.lines += file.lines;
            extensionStats.set(file.extension, stats);
        });
        
        const sortedExtensions = Array.from(extensionStats.entries())
            .sort((a, b) => b[1].lines - a[1].lines)
            .slice(0, 15);
        
        sortedExtensions.forEach(([ext, stats]) => {
            const percentage = ((stats.lines / lineCountResult.totalLines) * 100).toFixed(1);
            const bar = '█'.repeat(Math.floor(parseFloat(percentage)));
            outputChannel.appendLine(`  .${ext.padEnd(10)} │ ${String(stats.count).padStart(4)} files, ${String(stats.lines).padStart(7)} lines (${percentage.padStart(5)}%) ${bar}`);
        });
        
        // === DIRECTORY STATISTICS ===
        outputChannel.appendLine('\n┌─────────────────────────────────────────────────────────────────────────────┐');
        outputChannel.appendLine('│ TOP DIRECTORIES BY LINE COUNT                                               │');
        outputChannel.appendLine('└─────────────────────────────────────────────────────────────────────────────┘');
        
        const dirStats = new Map<string, { count: number; lines: number }>();
        lineCountResult.files.forEach(file => {
            const dir = path.dirname(file.path);
            const topDir = dir.split(path.sep)[0] || '.';
            const stats = dirStats.get(topDir) || { count: 0, lines: 0 };
            stats.count++;
            stats.lines += file.lines;
            dirStats.set(topDir, stats);
        });
        
        const sortedDirs = Array.from(dirStats.entries())
            .sort((a, b) => b[1].lines - a[1].lines)
            .slice(0, 10);
        
        sortedDirs.forEach(([dir, stats]) => {
            const percentage = ((stats.lines / lineCountResult.totalLines) * 100).toFixed(1);
            const displayDir = dir.length > 40 ? dir.slice(0, 37) + '...' : dir;
            outputChannel.appendLine(`  ${displayDir.padEnd(40)} │ ${String(stats.count).padStart(4)} files, ${String(stats.lines).padStart(7)} lines (${percentage.padStart(5)}%)`);
        });
        
        // === FILE SIZE DISTRIBUTION ===
        outputChannel.appendLine('\n┌─────────────────────────────────────────────────────────────────────────────┐');
        outputChannel.appendLine('│ FILE SIZE DISTRIBUTION                                                      │');
        outputChannel.appendLine('└─────────────────────────────────────────────────────────────────────────────┘');
        
        const buckets = [
            { label: '1-50 lines', min: 1, max: 50, count: 0 },
            { label: '51-100 lines', min: 51, max: 100, count: 0 },
            { label: '101-200 lines', min: 101, max: 200, count: 0 },
            { label: '201-500 lines', min: 201, max: 500, count: 0 },
            { label: '501-1000 lines', min: 501, max: 1000, count: 0 },
            { label: '1000+ lines', min: 1001, max: Infinity, count: 0 }
        ];
        
        lineCountResult.files.forEach(file => {
            const bucket = buckets.find(b => file.lines >= b.min && file.lines <= b.max);
            if (bucket) bucket.count++;
        });
        
        const maxBucketCount = Math.max(...buckets.map(b => b.count));
        buckets.forEach(bucket => {
            const percentage = ((bucket.count / lineCountResult.fileCount) * 100).toFixed(1);
            const barLength = Math.floor((bucket.count / maxBucketCount) * 40);
            const bar = '█'.repeat(barLength);
            outputChannel.appendLine(`  ${bucket.label.padEnd(15)} │ ${String(bucket.count).padStart(4)} files (${percentage.padStart(5)}%) ${bar}`);
        });
        
        // === RECENTLY MODIFIED FILES ===
        if (recentFiles.length > 0) {
            outputChannel.appendLine('\n┌─────────────────────────────────────────────────────────────────────────────┐');
            outputChannel.appendLine('│ RECENTLY MODIFIED FILES                                                     │');
            outputChannel.appendLine('└─────────────────────────────────────────────────────────────────────────────┘');
            
            recentFiles.forEach((file, index) => {
                const displayPath = file.path.length > 50 
                    ? '...' + file.path.slice(-(50 - 3))
                    : file.path;
                const timeAgo = getTimeAgo(file.date);
                outputChannel.appendLine(`  ${String(index + 1).padStart(2)}. ${displayPath.padEnd(50)} │ ${timeAgo}`);
            });
        }
        
        // === GIT WORKING DIRECTORY ===
        if (gitStats) {
            outputChannel.appendLine('\n┌─────────────────────────────────────────────────────────────────────────────┐');
            outputChannel.appendLine('│ GIT WORKING DIRECTORY STATUS                                                │');
            outputChannel.appendLine('└─────────────────────────────────────────────────────────────────────────────┘');
            
            outputChannel.appendLine('  Branch Changes:');
            outputChannel.appendLine(`    Lines Added: +${gitStats.branchAdditions.toLocaleString()}`);
            outputChannel.appendLine(`    Lines Removed: -${gitStats.branchDeletions.toLocaleString()}`);
            outputChannel.appendLine(`    Net Change: ${(gitStats.branchAdditions - gitStats.branchDeletions).toLocaleString()}`);
            
            outputChannel.appendLine('\n  Uncommitted Changes:');
            outputChannel.appendLine(`    Staged/Unstaged Added: +${gitStats.workingAdditions.toLocaleString()}`);
            outputChannel.appendLine(`    Staged/Unstaged Removed: -${gitStats.workingDeletions.toLocaleString()}`);
            outputChannel.appendLine(`    Untracked Lines: ${gitStats.untrackedLines.toLocaleString()}`);
            outputChannel.appendLine(`    Total Uncommitted: ${(gitStats.workingAdditions + gitStats.untrackedLines - gitStats.workingDeletions).toLocaleString()}`);
        }

    } catch (error) {
        outputChannel.appendLine(`\nError: ${error}`);
    }
    
    outputChannel.appendLine('\n══════════════════════════════════════════════════════════════════════════════');
}

function getTimeAgo(date: Date): string {
    const seconds = Math.floor((Date.now() - date.getTime()) / 1000);
    
    if (seconds < 60) return `${seconds} seconds ago`;
    const minutes = Math.floor(seconds / 60);
    if (minutes < 60) return `${minutes} minute${minutes > 1 ? 's' : ''} ago`;
    const hours = Math.floor(minutes / 60);
    if (hours < 24) return `${hours} hour${hours > 1 ? 's' : ''} ago`;
    const days = Math.floor(hours / 24);
    if (days < 30) return `${days} day${days > 1 ? 's' : ''} ago`;
    const months = Math.floor(days / 30);
    if (months < 12) return `${months} month${months > 1 ? 's' : ''} ago`;
    const years = Math.floor(months / 12);
    return `${years} year${years > 1 ? 's' : ''} ago`;
}

export function deactivate() {
    stopMonitoring();
    statusBarManager?.dispose();
}