# Change Log

All notable changes to the "timoch-git-stats" extension will be documented in this file.

## [1.1.0] - 2025-01-10

### Fixed
- Line counting now properly uses git ls-files to count only tracked and non-ignored files
- Fixed issue where node_modules and other gitignored files were being incorrectly counted
- Resolved ~9K line discrepancy between different clones of the same repository

### Added
- Enhanced detailed statistics display with comprehensive metrics:
  - Top 20 largest files with visual percentage bars
  - Language distribution showing breakdown by file extension
  - Top directories by line count
  - File size distribution histogram
  - Repository age, total commits, and contributor count
  - Recently modified files (last 10)
  - Statistical metrics: mean, median, and standard deviation of lines per file
- Improved visual formatting with box-drawing characters for better readability

### Changed
- LineCounter now detects git repositories and uses git commands for accurate counting
- Falls back to filesystem traversal only for non-git directories
- File information now includes extension for language statistics

## [1.0.7] - 2025-01-05

### Fixed
- Correct double-counting bug in bash scripts
- Count logical lines for developers, not just newlines
- Exact wc -l line counting implementation

## [1.0.6] - 2025-01-04

### Added
- Initial release of Git Stats extension
- Real-time line counting in status bar
- Git branch statistics
- Working directory changes tracking
- Configurable update intervals and patterns