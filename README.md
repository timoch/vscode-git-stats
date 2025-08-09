# Timoch Git Stats for VS Code

A VS Code extension that displays git repository statistics in the status bar, including line counts and change tracking. Based on the functionality of a bash git prompt script.

## Features

- **Line Counting**: Shows total lines of code in your project with smart filtering
- **Git Branch Display**: Shows current git branch in the status bar
- **Branch Statistics**: Displays lines added/removed since branching from main/master
- **Working Changes**: Shows uncommitted changes (staged, unstaged, and untracked files)
- **Smart Caching**: Efficient performance with intelligent cache invalidation
- **Fully Customizable**: Configure file patterns, update intervals, and display options

## Status Bar Display

The extension shows information in the following format:
```
🔀 branch-name 📄 15.2K +120/-45 [+30/-10]
```

Where:
- `branch-name`: Current git branch
- `15.2K`: Total lines in the project (formatted with K/M suffixes)
- `+120/-45`: Lines added/removed in commits since branching from main/master
- `[+30/-10]`: Uncommitted changes (staged + unstaged + untracked)

## Installation

### From VSIX Package
```bash
code --install-extension timoch-git-stats-1.0.0.vsix
```

### From Source
1. Clone the repository
2. Run `npm install` to install dependencies
3. Run `npm run compile` to build the extension
4. Press `F5` in VS Code to launch a new Extension Development Host window

## Configuration

Configure the extension through VS Code settings (File → Preferences → Settings, then search for "Git Stats"):

### Basic Settings

- **`gitStats.enabled`** (boolean, default: `true`)
  - Enable or disable the Git Stats extension

- **`gitStats.updateInterval`** (number, default: `5000`)
  - Update interval in milliseconds (minimum 1000)
  - Lower values update more frequently but use more resources

- **`gitStats.showBranchStats`** (boolean, default: `true`)
  - Show lines added/removed since branching from main/master

- **`gitStats.showWorkingChanges`** (boolean, default: `true`)
  - Show uncommitted changes in brackets [+X/-Y]

### File Filtering

- **`gitStats.includeExtensions`** (array)
  - File extensions to include in line counting
  - Default includes common programming languages and config files
  - Example: `["js", "ts", "py", "java", "cs", "go", "rs"]`
  - Special files without extensions (like `Dockerfile`) are automatically included

- **`gitStats.excludePatterns`** (array)
  - Glob patterns for files/directories to exclude from line counting
  - Supports standard glob patterns with `**`, `*`, and `?`
  - Default excludes:
    ```json
    [
      "**/node_modules/**",
      "**/bin/**",
      "**/obj/**",
      "**/dist/**",
      "**/build/**",
      "**/*.min.*",
      "**/package-lock.json",
      "**/cdk.out/**",
      "**/cdk.context.json",
      "**/.cdk.staging/**",
      "**/.claude/**"
    ]
    ```

### Configuration Examples

#### Example 1: Exclude additional directories
```json
{
  "gitStats.excludePatterns": [
    "**/node_modules/**",
    "**/bin/**",
    "**/obj/**",
    "**/dist/**",
    "**/build/**",
    "**/*.min.*",
    "**/package-lock.json",
    "**/vendor/**",           // PHP vendor directory
    "**/.next/**",            // Next.js build directory
    "**/target/**",           // Rust/Java build directory
    "**/__pycache__/**"       // Python cache
  ]
}
```

#### Example 2: Include only specific languages
```json
{
  "gitStats.includeExtensions": [
    "ts", "tsx", "js", "jsx",  // TypeScript/JavaScript only
    "json", "md"               // Plus config and docs
  ]
}
```

#### Example 3: Fast updates for active development
```json
{
  "gitStats.updateInterval": 2000,  // Update every 2 seconds
  "gitStats.showWorkingChanges": true,
  "gitStats.showBranchStats": true
}
```

## Commands

Access commands through the Command Palette (Ctrl+Shift+P / Cmd+Shift+P):

- **`Git Stats: Refresh Statistics`**
  - Manually refresh all statistics and clear cache
  - Useful when file system changes aren't detected

- **`Git Stats: Show Detailed Statistics`**
  - Opens an output panel with detailed information:
    - Exact line counts
    - File counts by extension
    - Current configuration
    - Branch comparison details

- **`Git Stats: Clear Cache`**
  - Clear the line count cache
  - Forces a full recount on next update

## Default File Filters

### Included Extensions
- **Programming**: `cs`, `ts`, `tsx`, `js`, `jsx`, `py`, `java`, `cpp`, `c`, `h`, `hpp`, `go`, `rs`, `rb`, `php`, `swift`, `kt`, `scala`, `r`, `sql`
- **Markup/Config**: `json`, `xml`, `yaml`, `yml`, `html`, `css`, `scss`, `md`, `txt`
- **Scripts**: `sh`, `ps1`, `psm1`, `psd1`
- **Project files**: `csproj`, `sln`, `razor`
- **Special files without extensions**: `Dockerfile`, `Makefile`, `Rakefile`, `Gemfile`, `Vagrantfile`, `Jenkinsfile`, `Procfile`

### Default Excluded Patterns
- Build outputs: `**/bin/**`, `**/obj/**`, `**/dist/**`, `**/build/**`
- Dependencies: `**/node_modules/**`
- Minified files: `**/*.min.*`
- Lock files: `**/package-lock.json`
- CDK outputs: `**/cdk.out/**`, `**/.cdk.staging/**`, `**/cdk.context.json`
- Claude AI: `**/.claude/**`

## Troubleshooting

### Line count seems incorrect
1. Check your exclude patterns in settings
2. Use `Git Stats: Show Detailed Statistics` to see what's being counted
3. Run `Git Stats: Clear Cache` to force a recount

### Extension not showing in status bar
1. Ensure you're in a git repository
2. Check that `gitStats.enabled` is `true` in settings
3. Try running `Git Stats: Refresh Statistics`

### Performance issues
1. Increase `gitStats.updateInterval` (e.g., to 10000 for 10-second updates)
2. Add more specific exclude patterns for large directories
3. The extension uses caching, so performance should improve after initial scan

## Development

```bash
# Install dependencies
npm install

# Compile TypeScript
npm run compile

# Watch for changes
npm run watch

# Run linter
npm run lint

# Package extension
npm install -g @vscode/vsce
vsce package
```

## License

MIT