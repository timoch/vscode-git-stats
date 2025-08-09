import * as vscode from 'vscode';
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

    outputChannel.appendLine('Git Repository Statistics');
    outputChannel.appendLine('=========================\n');

    try {
        // Get git stats
        const gitStats = await gitManager.getGitStats();
        
        // Count lines
        const lineCountResult = await lineCounter.countLines(workspaceFolder);
        
        outputChannel.appendLine(`Workspace: ${workspaceFolder.name}`);
        outputChannel.appendLine(`Path: ${workspaceFolder.uri.fsPath}\n`);
        
        if (gitStats) {
            outputChannel.appendLine(`Current Branch: ${gitStats.branch}`);
            outputChannel.appendLine(`Main Branch: ${gitStats.isMainBranch ? 'Yes' : 'No'}\n`);
        }
        
        outputChannel.appendLine(`Total Lines: ${lineCountResult.totalLines.toLocaleString()} (${lineCounter.formatLineCount(lineCountResult.totalLines)})`);
        outputChannel.appendLine(`Total Files: ${lineCountResult.fileCount.toLocaleString()}\n`);
        
        if (gitStats) {
            outputChannel.appendLine('Branch Statistics:');
            outputChannel.appendLine(`  Lines Added: +${gitStats.branchAdditions}`);
            outputChannel.appendLine(`  Lines Removed: -${gitStats.branchDeletions}`);
            outputChannel.appendLine(`  Net Change: ${gitStats.branchAdditions - gitStats.branchDeletions}\n`);
            
            outputChannel.appendLine('Working Directory Changes:');
            outputChannel.appendLine(`  Staged/Unstaged Added: +${gitStats.workingAdditions}`);
            outputChannel.appendLine(`  Staged/Unstaged Removed: -${gitStats.workingDeletions}`);
            outputChannel.appendLine(`  Untracked Lines: ${gitStats.untrackedLines}`);
            outputChannel.appendLine(`  Total Uncommitted: ${gitStats.workingAdditions + gitStats.untrackedLines - gitStats.workingDeletions}`);
        }
        
        // Show configuration
        const config = vscode.workspace.getConfiguration('gitStats');
        outputChannel.appendLine('\nConfiguration:');
        outputChannel.appendLine(`  Update Interval: ${config.get('updateInterval')}ms`);
        outputChannel.appendLine(`  Show Branch Stats: ${config.get('showBranchStats')}`);
        outputChannel.appendLine(`  Show Working Changes: ${config.get('showWorkingChanges')}`);
        
        const includeExtensions = config.get<string[]>('includeExtensions', []);
        outputChannel.appendLine(`\nIncluded Extensions (${includeExtensions.length}):`);
        outputChannel.appendLine(`  ${includeExtensions.slice(0, 10).join(', ')}${includeExtensions.length > 10 ? '...' : ''}`);
        
        const excludePatterns = config.get<string[]>('excludePatterns', []);
        outputChannel.appendLine(`\nExclude Patterns (${excludePatterns.length}):`);
        for (const pattern of excludePatterns.slice(0, 10)) {
            outputChannel.appendLine(`  - ${pattern}`);
        }
        if (excludePatterns.length > 10) {
            outputChannel.appendLine(`  ... and ${excludePatterns.length - 10} more`);
        }

    } catch (error) {
        outputChannel.appendLine(`\nError: ${error}`);
    }
}

export function deactivate() {
    stopMonitoring();
    statusBarManager?.dispose();
}