#!/bin/bash

# Git-aware prompt with line counts and change statistics
# This file is sourced from ~/.bashrc.d/
#
# Line count shows: Current total lines in working directory (includes all changes)
# Branch changes: Lines added/removed in commits since branching from main/master  
# Working changes: Lines added/removed in uncommitted changes (staged + unstaged + untracked)

# Cache variables for performance
_git_line_count_cache=""
_git_line_count_cache_dir=""
_git_line_count_cache_head=""
_git_line_count_cache_working=""

# Command timing variables
_command_start_time=""
_last_command_end_time=""  # Initialize as empty to show date on new shell
_last_command_duration=""
_last_prompt_display_time=""  # Separate variable for tracking idle time
_last_datetime_shown=""  # Track when we last showed the date/time

# Function to record command start time
_record_command_start() {
    _command_start_time=$(date +%s.%3N)
}

# Function to calculate command duration and update timing variables
_calculate_command_duration() {
    local end_time=$(date +%s.%3N)
    _last_command_end_time="$end_time"
    
    if [ -n "$_command_start_time" ]; then
        _last_command_duration=$(awk "BEGIN {printf \"%.3f\", $end_time - $_command_start_time}")
    else
        _last_command_duration=""
    fi
    
    _command_start_time=""
}

# Function to format duration for display
_format_duration() {
    local duration=$1
    if [ -z "$duration" ]; then
        echo ""
        return
    fi
    
    local seconds=$(echo "$duration" | cut -d. -f1)
    local milliseconds=$(echo "$duration" | cut -d. -f2)
    
    if [ "$seconds" -ge 60 ]; then
        local minutes=$((seconds / 60))
        local remaining_seconds=$((seconds % 60))
        if [ "$minutes" -ge 60 ]; then
            local hours=$((minutes / 60))
            local remaining_minutes=$((minutes % 60))
            echo "${hours}h${remaining_minutes}m${remaining_seconds}s"
        else
            echo "${minutes}m${remaining_seconds}s"
        fi
    else
        echo "${seconds}.${milliseconds}s"
    fi
}

# Function to check if we should show date/time (either idle for 5 min or haven't shown in 5 min)
_should_show_datetime() {
    # Show date on new shell
    if [ -z "$_last_datetime_shown" ]; then
        return 0
    fi
    
    local current_time=$(date +%s.%3N)
    
    # Check if idle for more than 5 minutes
    if [ -n "$_last_prompt_display_time" ]; then
        local idle_time=$(awk "BEGIN {printf \"%.0f\", $current_time - $_last_prompt_display_time}")
        if [ "$idle_time" -gt 300 ]; then
            return 0
        fi
    fi
    
    # Check if we haven't shown date/time in the last 5 minutes
    local time_since_shown=$(awk "BEGIN {printf \"%.0f\", $current_time - $_last_datetime_shown}")
    [ "$time_since_shown" -gt 300 ]
}

# Function to check if we should show duration (more than 5 seconds)
_should_show_duration() {
    if [ -z "$_last_command_duration" ]; then
        return 1
    fi
    
    local duration_int=$(echo "$_last_command_duration" | cut -d. -f1)
    [ "$duration_int" -gt 5 ]
}

# Function to count lines in the project
count_project_lines() {
    if git rev-parse --git-dir > /dev/null 2>&1; then
        local current_dir=$(pwd)
        local current_head=$(git rev-parse HEAD 2>/dev/null)
        
        # Skip counting if directory is under /mnt
        if [[ "$current_dir" == /mnt/* ]]; then
            echo "SKIP"
            return
        fi
        
        # Get a hash of working tree changes to detect file modifications
        local working_tree_hash=$(git status --porcelain 2>/dev/null | md5sum | cut -d' ' -f1)
        
        # Use cache if we're in the same directory, HEAD hasn't changed, and working tree is unchanged
        if [ "$_git_line_count_cache_dir" = "$current_dir" ] && \
           [ "$_git_line_count_cache_head" = "$current_head" ] && \
           [ "$_git_line_count_cache_working" = "$working_tree_hash" ] && \
           [ -n "$_git_line_count_cache" ]; then
            echo "$_git_line_count_cache"
            return
        fi
        
        # Fast line counting using find to only count existing files
        local total_lines=$(find . -type f \( \
            -name "*.cs" -o -name "*.ts" -o -name "*.tsx" -o -name "*.js" -o -name "*.jsx" \
            -o -name "*.json" -o -name "*.xml" -o -name "*.yaml" -o -name "*.yml" \
            -o -name "*.md" -o -name "*.txt" -o -name "*.sh" -o -name "*.ps1" \
            -o -name "*.psm1" -o -name "*.psd1" -o -name "*.csproj" -o -name "*.sln" \
            -o -name "*.razor" -o -name "*.css" -o -name "*.scss" -o -name "*.html" \
            \) -not -path "*/node_modules/*" -not -path "*/bin/*" -not -path "*/obj/*" \
            -not -path "*/dist/*" -not -path "*/build/*" -not -name "*.min.*" \
            -not -name "package-lock.json" -not -path "*/cdk.out/*" \
            -not -name "cdk.context.json" -not -path "*/.cdk.staging/*" \
            -exec wc -l {} + | awk '{sum += $1} END {print sum}')
        
        if [ -z "$total_lines" ] || [ "$total_lines" = "0" ]; then
            total_lines="0"
        fi
        
        # Update cache
        _git_line_count_cache="$total_lines"
        _git_line_count_cache_dir="$current_dir"
        _git_line_count_cache_head="$current_head"
        _git_line_count_cache_working="$working_tree_hash"
        
        echo "$total_lines"
    else
        echo "0"
    fi
}

# Function to get current working directory changes (staged + unstaged + untracked)
get_working_changes() {
    if git rev-parse --git-dir > /dev/null 2>&1; then
        # Get staged + unstaged changes
        local staged_added=$(git diff --cached --numstat 2>/dev/null | awk '{sum+=$1} END {print sum}')
        local staged_removed=$(git diff --cached --numstat 2>/dev/null | awk '{sum+=$2} END {print sum}')
        local unstaged_added=$(git diff --numstat 2>/dev/null | awk '{sum+=$1} END {print sum}')
        local unstaged_removed=$(git diff --numstat 2>/dev/null | awk '{sum+=$2} END {print sum}')
        
        staged_added=${staged_added:-0}
        staged_removed=${staged_removed:-0}
        unstaged_added=${unstaged_added:-0}
        unstaged_removed=${unstaged_removed:-0}
        
        local total_added=$((staged_added + unstaged_added))
        local total_removed=$((staged_removed + unstaged_removed))
        
        # Count lines in untracked files
        local untracked_lines=0
        local untracked_files=$(git ls-files --others --exclude-standard 2>/dev/null)
        if [ -n "$untracked_files" ]; then
            untracked_lines=$(echo "$untracked_files" | xargs -r wc -l 2>/dev/null | tail -1 | awk '{print $1}')
            untracked_lines=${untracked_lines:-0}
        fi
        
        if [ "$total_added" -gt 0 ] || [ "$total_removed" -gt 0 ] || [ "$untracked_lines" -gt 0 ]; then
            echo "${total_added}:${total_removed}:${untracked_lines}"
        else
            echo ""
        fi
    else
        echo ""
    fi
}

# Function to get git stats comparing to main/master branch
get_git_stats() {
    if git rev-parse --git-dir > /dev/null 2>&1; then
        # Find the main branch (prefer 'main' over 'master')
        local main_branch=""
        if git show-ref --verify --quiet refs/heads/main; then
            main_branch="main"
        elif git show-ref --verify --quiet refs/heads/master; then
            main_branch="master"
        else
            # If neither exists, no stats
            echo ""
            return
        fi
        
        # Get current branch
        local current_branch=$(git branch --show-current 2>/dev/null)
        
        # If we're on the main branch, show pending changes instead
        if [ "$current_branch" = "$main_branch" ]; then
            # Show staged + unstaged changes including submodules
            local added=$(git diff --cached --numstat --recurse-submodules 2>/dev/null | awk '{sum+=$1} END {print sum}')
            local removed=$(git diff --cached --numstat --recurse-submodules 2>/dev/null | awk '{sum+=$2} END {print sum}')
            local unstaged_added=$(git diff --numstat --recurse-submodules 2>/dev/null | awk '{sum+=$1} END {print sum}')
            local unstaged_removed=$(git diff --numstat --recurse-submodules 2>/dev/null | awk '{sum+=$2} END {print sum}')
            
            added=${added:-0}
            removed=${removed:-0}
            unstaged_added=${unstaged_added:-0}
            unstaged_removed=${unstaged_removed:-0}
            
            local total_added=$((added + unstaged_added))
            local total_removed=$((removed + unstaged_removed))
            
            if [ "$total_added" -gt 0 ] || [ "$total_removed" -gt 0 ]; then
                echo " +${total_added}/-${total_removed}"
            else
                echo ""
            fi
        else
            # Show diff from main branch including submodules
            local added=$(git diff ${main_branch}...HEAD --numstat --recurse-submodules 2>/dev/null | awk '{sum+=$1} END {print sum}')
            local removed=$(git diff ${main_branch}...HEAD --numstat --recurse-submodules 2>/dev/null | awk '{sum+=$2} END {print sum}')
            
            added=${added:-0}
            removed=${removed:-0}
            
            if [ "$added" -gt 0 ] || [ "$removed" -gt 0 ]; then
                echo " +${added}/-${removed}"
            else
                echo ""
            fi
        fi
    else
        echo ""
    fi
}

# Function to get committed changes since branching from main/master
get_branch_diff_stats() {
    if git rev-parse --git-dir > /dev/null 2>&1; then
        # Find the main branch (prefer 'main' over 'master')
        local main_branch=""
        if git show-ref --verify --quiet refs/heads/main; then
            main_branch="main"
        elif git show-ref --verify --quiet refs/heads/master; then
            main_branch="master"
        else
            # If neither exists, no stats
            echo ""
            return
        fi
        
        # Get current branch
        local current_branch=$(git branch --show-current 2>/dev/null)
        
        # If we're on the main branch, no diff stats
        if [ "$current_branch" = "$main_branch" ]; then
            echo ""
            return
        fi
        
        # Get lines added/removed in commits since branching from main
        local added=$(git diff ${main_branch}...HEAD --numstat 2>/dev/null | awk '{sum+=$1} END {print sum}')
        local removed=$(git diff ${main_branch}...HEAD --numstat 2>/dev/null | awk '{sum+=$2} END {print sum}')
        
        added=${added:-0}
        removed=${removed:-0}
        
        if [ "$added" -gt 0 ] || [ "$removed" -gt 0 ]; then
            echo " +${added}/-${removed}"
        else
            echo ""
        fi
    else
        echo ""
    fi
}

# Function to get current git branch
get_git_branch() {
    if git rev-parse --git-dir > /dev/null 2>&1; then
        local branch=$(git branch 2>/dev/null | grep '^*' | colrm 1 2)
        if [ -n "$branch" ]; then
            echo " (${branch})"
        fi
    fi
}

# Function to format line count with K/M suffix
format_line_count() {
    local lines=$1
    if [ "$lines" -ge 1000000 ]; then
        # For millions, use 1 decimal place
        echo "$(awk "BEGIN {printf \"%.1fM\", $lines/1000000}")"
    elif [ "$lines" -ge 10000 ]; then
        # For 10K+, use 1 decimal place
        echo "$(awk "BEGIN {printf \"%.1fK\", $lines/1000}")"
    elif [ "$lines" -ge 1000 ]; then
        # For 1K-10K, use 2 decimal places for better precision
        echo "$(awk "BEGIN {printf \"%.2fK\", $lines/1000}")"
    else
        echo "$lines"
    fi
}

# Custom PS1 prompt
set_custom_prompt() {
    # Calculate command duration first
    _calculate_command_duration
    
    # Colors
    local reset='\[\033[0m\]'
    local bold='\[\033[1m\]'
    local red='\[\033[31m\]'
    local green='\[\033[32m\]'
    local yellow='\[\033[33m\]'
    local blue='\[\033[34m\]'
    local magenta='\[\033[35m\]'
    local cyan='\[\033[36m\]'
    local gray='\[\033[90m\]'
    local orange='\[\033[38;5;208m\]'
    
    # Build prompt
    PS1=""
    
    # Check if we're in a git repo
    local git_prompt_part=""
    local show_git_first=false
    
    if git rev-parse --git-dir > /dev/null 2>&1; then
        local branch_name=$(git branch 2>/dev/null | grep '^*' | colrm 1 2)
        local lines=$(count_project_lines)
        
        if [ -n "$branch_name" ]; then
            # Get branch diff stats
            local diff_stats_raw=$(get_branch_diff_stats)
            # Get working changes to check if we have any changes
            local working_changes=$(get_working_changes)
            
            # Always show git info on its own line
            show_git_first=true
            
            # Build git prompt part
            git_prompt_part+="${yellow}(${branch_name}"
            
            # Add line count right after branch name
            if [ "$lines" = "SKIP" ]; then
                git_prompt_part+=" ${cyan}---${yellow}"
            else
                local formatted_lines=$(format_line_count $lines)
                git_prompt_part+=" ${cyan}${formatted_lines}${yellow}"
            fi
            
            # Add committed changes if any (these are included in the line count)
            if [ -n "$diff_stats_raw" ]; then
                # Extract numbers from the stats
                local added=$(echo "$diff_stats_raw" | sed -n 's/.*+\([0-9]*\).*/\1/p')
                local removed=$(echo "$diff_stats_raw" | sed -n 's/.*-\([0-9]*\).*/\1/p')
                git_prompt_part+=" ${green}+${added}${yellow}/${red}-${removed}${yellow}"
            fi
            
            git_prompt_part+=")${reset}"
        fi
        
        # Add working changes if any (including untracked)
        if [ -n "$working_changes" ]; then
            local added=$(echo "$working_changes" | cut -d: -f1)
            local removed=$(echo "$working_changes" | cut -d: -f2)
            local untracked_lines=$(echo "$working_changes" | cut -d: -f3)
            
            # Add untracked lines to added count
            local total_added=$((added + untracked_lines))
            
            git_prompt_part+="${cyan} [${green}+${total_added}${cyan}/${red}-${removed}${cyan}]${reset}"
        fi
    fi
    
    # Always show git info first with a newline if in git repo
    if [ "$show_git_first" = true ]; then
        PS1+="${git_prompt_part}\n"
    fi
    
    # Add user@host:path
    PS1+="${bold}${green}\u@\h${reset}:${bold}${blue}\w${reset}"
    
    # Add date/time if more than 5 minutes have passed since last command
    if _should_show_datetime; then
        local datetime=$(date +'%d/%m %H:%M')
        PS1+="${gray} [${datetime}]${reset}"
        _last_datetime_shown=$(date +%s.%3N)
    fi
    
    # Add command duration if it took more than 5 seconds
    if _should_show_duration; then
        local formatted_duration=$(_format_duration "$_last_command_duration")
        PS1+="${red} (${formatted_duration})${reset}"
    fi
    
    # Git info is now always shown first, so nothing needed here
    
    PS1+="\$ "
    
    # Update the last prompt display time (for idle time tracking)
    _last_prompt_display_time=$(date +%s.%3N)
}

# Set up DEBUG trap to record command start time
trap '_record_command_start' DEBUG

# Set PROMPT_COMMAND to update the prompt before each command
PROMPT_COMMAND=set_custom_prompt

# Optional: Add a command to manually refresh project stats
refresh_project_stats() {
    echo "Project Statistics:"
    echo "=================="
    
    if git rev-parse --git-dir > /dev/null 2>&1; then
        local total_lines=$(count_project_lines)
        local formatted_lines=$(format_line_count $total_lines)
        echo "Total lines in project: $formatted_lines ($total_lines)"
        
        echo ""
        echo "Pending changes:"
        git diff --stat --cached 2>/dev/null
        git diff --stat 2>/dev/null
        
        echo ""
        echo "File count by extension:"
        git ls-files | sed 's/.*\.//' | sort | uniq -c | sort -rn | head -10
    else
        echo "Not in a git repository"
    fi
}

# Function to show excluded files and directories
show_excluded_files() {
    echo "Excluded Files and Directories:"
    echo "==============================="
    
    if git rev-parse --git-dir > /dev/null 2>&1; then
        echo ""
        echo "Excluded directories (with file counts):"
        echo "  node_modules/: $(find . -path "*/node_modules/*" -type f 2>/dev/null | wc -l) files"
        echo "  bin/: $(find . -path "*/bin/*" -type f 2>/dev/null | wc -l) files"
        echo "  obj/: $(find . -path "*/obj/*" -type f 2>/dev/null | wc -l) files"
        echo "  dist/: $(find . -path "*/dist/*" -type f 2>/dev/null | wc -l) files"
        echo "  build/: $(find . -path "*/build/*" -type f 2>/dev/null | wc -l) files"
        echo "  cdk.out/: $(find . -path "*/cdk.out/*" -type f 2>/dev/null | wc -l) files"
        echo "  .cdk.staging/: $(find . -path "*/.cdk.staging/*" -type f 2>/dev/null | wc -l) files"
        
        echo ""
        echo "Excluded file patterns:"
        local minified_count=$(find . -name "*.min.*" -not -path "*/node_modules/*" -not -path "*/bin/*" -not -path "*/obj/*" -not -path "*/dist/*" -not -path "*/build/*" -type f 2>/dev/null | wc -l)
        local package_lock_count=$(find . -name "package-lock.json" -type f 2>/dev/null | wc -l)
        local cdk_context_count=$(find . -name "cdk.context.json" -type f 2>/dev/null | wc -l)
        
        echo "  *.min.*: $minified_count files"
        echo "  package-lock.json: $package_lock_count files"
        echo "  cdk.context.json: $cdk_context_count files"
        
        echo ""
        echo "Sample excluded files (first 10):"
        find . \( -path "*/node_modules/*" -o -path "*/bin/*" -o -path "*/obj/*" -o -path "*/dist/*" -o -path "*/build/*" -o -name "*.min.*" -o -name "package-lock.json" \) -type f 2>/dev/null | head -10
        
        echo ""
        local total_excluded=$(find . \( -path "*/node_modules/*" -o -path "*/bin/*" -o -path "*/obj/*" -o -path "*/dist/*" -o -path "*/build/*" -o -name "*.min.*" -o -name "package-lock.json" \) -type f 2>/dev/null | wc -l)
        echo "Total excluded files: $total_excluded"
        
        echo ""
        echo "Total lines in excluded files:"
        local excluded_lines=$(find . \( -path "*/node_modules/*" -o -path "*/bin/*" -o -path "*/obj/*" -o -path "*/dist/*" -o -path "*/build/*" -o -name "*.min.*" -o -name "package-lock.json" \) -type f -exec wc -l {} + 2>/dev/null | tail -1 | awk '{print $1}' || echo "0")
        echo "  $excluded_lines lines"
    else
        echo "Not in a git repository"
    fi
}

# Function to clear the line count cache
clear_line_count_cache() {
    _git_line_count_cache=""
    _git_line_count_cache_dir=""
    _git_line_count_cache_head=""
    _git_line_count_cache_working=""
    echo "Line count cache cleared"
}

# Function to debug line count calculations
debug_line_count() {
    echo "Line Count Debug Information"
    echo "============================"
    
    if git rev-parse --git-dir > /dev/null 2>&1; then
        # Get base line count
        local base_lines=$(count_project_lines)
        echo "Current total lines: $base_lines ($(format_line_count $base_lines))"
        
        # Find the main branch
        local main_branch=""
        if git show-ref --verify --quiet refs/heads/main; then
            main_branch="main"
        elif git show-ref --verify --quiet refs/heads/master; then
            main_branch="master"
        fi
        
        if [ -n "$main_branch" ]; then
            # Count lines at the merge base
            echo -e "\nChecking line count at branch point..."
            local merge_base=$(git merge-base HEAD $main_branch 2>/dev/null)
            if [ -n "$merge_base" ]; then
                # Create a temporary directory for checkout
                local temp_dir=$(mktemp -d)
                echo "Counting lines at merge base ($merge_base)..."
                (
                    cd "$temp_dir"
                    git clone --quiet --no-checkout "$(git -C "$(pwd)" rev-parse --show-toplevel)" . 2>/dev/null
                    git checkout --quiet "$merge_base" 2>/dev/null
                    local base_count=$(find . -type f \( \
                        -name "*.cs" -o -name "*.ts" -o -name "*.tsx" -o -name "*.js" -o -name "*.jsx" \
                        -o -name "*.json" -o -name "*.xml" -o -name "*.yaml" -o -name "*.yml" \
                        -o -name "*.md" -o -name "*.txt" -o -name "*.sh" -o -name "*.ps1" \
                        -o -name "*.psm1" -o -name "*.psd1" -o -name "*.csproj" -o -name "*.sln" \
                        -o -name "*.razor" -o -name "*.css" -o -name "*.scss" -o -name "*.html" \
                        \) -not -path "*/node_modules/*" -not -path "*/bin/*" -not -path "*/obj/*" \
                        -not -path "*/dist/*" -not -path "*/build/*" -not -name "*.min.*" \
                        -not -name "package-lock.json" -not -path "*/cdk.out/*" \
                        -not -name "cdk.context.json" -not -path "*/.cdk.staging/*" \
                        -exec wc -l {} + 2>/dev/null | awk '{sum += $1} END {print sum}')
                    echo "Lines at branch point: $base_count ($(format_line_count $base_count))"
                    echo "Difference: $((base_lines - base_count)) lines"
                )
                rm -rf "$temp_dir"
            fi
        fi
        
        # Get branch diff
        local diff_stats=$(get_branch_diff_stats)
        if [ -n "$diff_stats" ]; then
            local added=$(echo "$diff_stats" | sed -n 's/.*+\([0-9]*\).*/\1/p')
            local removed=$(echo "$diff_stats" | sed -n 's/.*-\([0-9]*\).*/\1/p')
            echo -e "\nBranch changes (committed): +$added/-$removed (net: $((added - removed)))"
        fi
        
        # Get working changes
        local working=$(get_working_changes)
        if [ -n "$working" ]; then
            local w_added=$(echo "$working" | cut -d: -f1)
            local w_removed=$(echo "$working" | cut -d: -f2)
            local w_untracked=$(echo "$working" | cut -d: -f3)
            echo "Working changes (uncommitted): +$w_added/-$w_removed"
            echo "Untracked file lines: $w_untracked"
            echo "Total uncommitted: $((w_added + w_untracked - w_removed))"
        fi
        
        # List untracked files
        local untracked_files=$(git ls-files --others --exclude-standard 2>/dev/null)
        if [ -n "$untracked_files" ]; then
            echo -e "\nUntracked files:"
            echo "$untracked_files" | head -10
            local untracked_count=$(echo "$untracked_files" | wc -l)
            if [ "$untracked_count" -gt 10 ]; then
                echo "... and $((untracked_count - 10)) more"
            fi
        fi
        
        # Show what the count would be with different precision
        echo -e "\nFormatting tests for current count ($base_lines):"
        echo "  No rounding: $base_lines lines"
        echo "  0 decimals: $(awk "BEGIN {printf \"%.0fK\", $base_lines/1000}")"
        echo "  1 decimal:  $(awk "BEGIN {printf \"%.1fK\", $base_lines/1000}")"
        echo "  2 decimals: $(awk "BEGIN {printf \"%.2fK\", $base_lines/1000}")"
        echo "  3 decimals: $(awk "BEGIN {printf \"%.3fK\", $base_lines/1000}")"
    else
        echo "Not in a git repository"
    fi
}

# Export functions so they're available in subshells
export -f count_project_lines
export -f get_working_changes
export -f get_git_stats
export -f get_branch_diff_stats
export -f get_git_branch
export -f format_line_count
export -f set_custom_prompt
export -f refresh_project_stats
export -f show_excluded_files
export -f clear_line_count_cache
export -f debug_line_count
export -f _record_command_start
export -f _calculate_command_duration
export -f _format_duration
export -f _should_show_datetime
export -f _should_show_duration

# Usage instructions (commented out to avoid printing on every shell start)
# echo "Git-aware prompt loaded!"
# echo "Your prompt will now show:"
# echo "  - Current git branch (when in a git repo)"
# echo "  - Total lines of code in the project"
# echo "  - Added/removed lines in pending changes"
# echo ""
# echo "Run 'refresh_project_stats' for detailed project statistics"
# echo "Run 'show_excluded_files' to see what files are being excluded from the count"