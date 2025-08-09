import { LineCountResult } from './lineCounter';

export interface CacheEntry {
    workspaceRoot: string;
    gitHead: string | null;
    workingTreeStatus: string;
    lineCountResult: LineCountResult;
    timestamp: number;
}

export class Cache {
    private cache: Map<string, CacheEntry> = new Map();
    private readonly maxAge: number = 5000; // 5 seconds

    public get(workspaceRoot: string, gitHead: string | null, workingTreeStatus: string): LineCountResult | null {
        const key = this.getKey(workspaceRoot);
        const entry = this.cache.get(key);
        
        if (!entry) {
            return null;
        }
        
        // Check if cache is still valid
        const now = Date.now();
        if (now - entry.timestamp > this.maxAge) {
            this.cache.delete(key);
            return null;
        }
        
        // Check if git state has changed
        if (entry.gitHead !== gitHead || entry.workingTreeStatus !== workingTreeStatus) {
            this.cache.delete(key);
            return null;
        }
        
        return entry.lineCountResult;
    }

    public set(workspaceRoot: string, gitHead: string | null, workingTreeStatus: string, result: LineCountResult): void {
        const key = this.getKey(workspaceRoot);
        this.cache.set(key, {
            workspaceRoot,
            gitHead,
            workingTreeStatus,
            lineCountResult: result,
            timestamp: Date.now()
        });
    }

    public clear(): void {
        this.cache.clear();
    }

    public clearForWorkspace(workspaceRoot: string): void {
        const key = this.getKey(workspaceRoot);
        this.cache.delete(key);
    }

    private getKey(workspaceRoot: string): string {
        return workspaceRoot;
    }
}