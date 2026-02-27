#!/bin/bash
# Pre-commit validation script for Job Monitor
#
# Runs type checking and linting on staged files.
# Can be run standalone or integrated with git hooks.
#
# Usage:
#   ./scripts/validate.sh           # Validate all
#   ./scripts/validate.sh --staged  # Validate only staged files
#   ./scripts/validate.sh --quick   # Quick checks only (no full build)
#
# Exit codes:
#   0 - All checks passed
#   1 - Some checks failed

set -e

STAGED_ONLY=false
QUICK_MODE=false
VERBOSE=false

# Parse arguments
while [[ $# -gt 0 ]]; do
  case "$1" in
    --staged)
      STAGED_ONLY=true
      shift
      ;;
    --quick)
      QUICK_MODE=true
      shift
      ;;
    --verbose|-v)
      VERBOSE=true
      shift
      ;;
    *)
      echo "Unknown option: $1"
      echo "Usage: ./scripts/validate.sh [--staged] [--quick] [--verbose]"
      exit 1
      ;;
  esac
done

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Counters
PASSED=0
FAILED=0
SKIPPED=0

# Log functions
log_info() {
  echo -e "${NC}$1${NC}"
}

log_success() {
  echo -e "${GREEN}✓ $1${NC}"
  PASSED=$((PASSED + 1))
}

log_error() {
  echo -e "${RED}✗ $1${NC}"
  FAILED=$((FAILED + 1))
}

log_skip() {
  echo -e "${YELLOW}○ $1 (skipped)${NC}"
  SKIPPED=$((SKIPPED + 1))
}

log_verbose() {
  if [ "$VERBOSE" = true ]; then
    echo -e "${NC}  $1${NC}"
  fi
}

echo "=========================================="
echo "Job Monitor Pre-commit Validation"
echo "=========================================="
echo "Mode: $([ "$STAGED_ONLY" = true ] && echo "Staged files only" || echo "All files")"
echo "Quick: $([ "$QUICK_MODE" = true ] && echo "Yes" || echo "No")"
echo "=========================================="

# Get list of files to check
if [ "$STAGED_ONLY" = true ]; then
  PYTHON_FILES=$(git diff --cached --name-only --diff-filter=ACM | grep '\.py$' || true)
  TS_FILES=$(git diff --cached --name-only --diff-filter=ACM | grep -E '\.(ts|tsx)$' || true)
else
  PYTHON_FILES=$(find job_monitor -name "*.py" -type f 2>/dev/null || true)
  TS_FILES=$(find job_monitor/ui/src job_monitor/ui/routes job_monitor/ui/lib -name "*.ts" -o -name "*.tsx" 2>/dev/null || true)
fi

# ============================================
# PYTHON VALIDATION
# ============================================
echo ""
echo "Python Validation"
echo "─────────────────"

# Check if there are Python files to validate
if [ -z "$PYTHON_FILES" ]; then
  log_skip "No Python files to check"
else
  # 1. Python syntax check
  log_info "Checking Python syntax..."
  SYNTAX_ERRORS=0
  for file in $PYTHON_FILES; do
    if [ -f "$file" ]; then
      if ! python3 -m py_compile "$file" 2>/dev/null; then
        log_error "Syntax error in $file"
        SYNTAX_ERRORS=$((SYNTAX_ERRORS + 1))
      else
        log_verbose "OK: $file"
      fi
    fi
  done

  if [ "$SYNTAX_ERRORS" -eq 0 ]; then
    log_success "Python syntax check passed"
  fi

  # 2. Python import check (quick validation)
  log_info "Checking Python imports..."
  # Use uv if available, otherwise try direct import
  if command -v uv &> /dev/null; then
    if uv run python -c "import job_monitor.backend.app" 2>/dev/null; then
      log_success "Python imports OK"
    else
      # Try without uv
      if python3 -c "import job_monitor.backend.app" 2>/dev/null; then
        log_success "Python imports OK"
      else
        log_skip "Python import check (environment not activated)"
      fi
    fi
  else
    if python3 -c "import job_monitor.backend.app" 2>/dev/null; then
      log_success "Python imports OK"
    else
      log_skip "Python import check (environment not activated)"
    fi
  fi
fi

# ============================================
# TYPESCRIPT VALIDATION
# ============================================
echo ""
echo "TypeScript Validation"
echo "─────────────────────"

# Check if there are TypeScript files to validate
if [ -z "$TS_FILES" ] && [ "$STAGED_ONLY" = true ]; then
  log_skip "No TypeScript files to check"
else
  # Check if we're in the UI directory context
  if [ -d "job_monitor/ui" ]; then
    cd job_monitor/ui

    # Check if node_modules exists
    if [ ! -d "node_modules" ]; then
      log_skip "TypeScript check (run 'npm install' first)"
    else
      # 1. TypeScript type check
      log_info "Running TypeScript type check..."
      if grep -q '"typecheck"' package.json 2>/dev/null; then
        if npm run typecheck > /dev/null 2>&1; then
          log_success "TypeScript type check passed"
        else
          log_error "TypeScript type check failed"
        fi
      else
        log_skip "TypeScript check (no typecheck script)"
      fi

      # 2. ESLint check (if available)
      if [ -f ".eslintrc.js" ] || [ -f ".eslintrc.json" ] || [ -f "eslint.config.js" ]; then
        log_info "Running ESLint..."
        if npm run lint 2>/dev/null; then
          log_success "ESLint passed"
        else
          log_error "ESLint failed"
        fi
      else
        log_skip "ESLint not configured"
      fi

      # 3. Build check (unless quick mode)
      if [ "$QUICK_MODE" = false ]; then
        log_info "Verifying frontend build..."
        if npm run build 2>/dev/null; then
          log_success "Frontend build successful"
        else
          log_error "Frontend build failed"
        fi
      else
        log_skip "Frontend build (quick mode)"
      fi
    fi

    cd ../..
  else
    log_skip "UI directory not found"
  fi
fi

# ============================================
# ADDITIONAL CHECKS
# ============================================
echo ""
echo "Additional Checks"
echo "─────────────────"

# 1. Check for debug statements
log_info "Checking for debug statements..."
DEBUG_FOUND=false
if [ "$STAGED_ONLY" = true ]; then
  FILES_TO_CHECK=$(git diff --cached --name-only --diff-filter=ACM | grep -E '\.(py|ts|tsx)$' || true)
else
  FILES_TO_CHECK=$(find job_monitor -name "*.py" -o -name "*.ts" -o -name "*.tsx" 2>/dev/null || true)
fi

for file in $FILES_TO_CHECK; do
  if [ -f "$file" ]; then
    # Check for common debug statements
    if grep -n "console\.log\|print(\|debugger\|breakpoint()" "$file" 2>/dev/null | grep -v "# noqa" | grep -v "// eslint-disable" > /dev/null; then
      if [ "$DEBUG_FOUND" = false ]; then
        log_verbose "Debug statements found:"
        DEBUG_FOUND=true
      fi
      log_verbose "  $file"
    fi
  fi
done

if [ "$DEBUG_FOUND" = true ]; then
  # Warning only, not a failure
  echo -e "${YELLOW}⚠ Debug statements found (review before commit)${NC}"
else
  log_success "No debug statements found"
fi

# 2. Check for large files (excluding common directories)
log_info "Checking for large files..."
LARGE_FILES=$(find . -type f -size +1M \
  -not -path "./.git/*" \
  -not -path "./node_modules/*" \
  -not -path "./.venv/*" \
  -not -path "./.databricks/*" \
  -not -path "./job_monitor/ui/node_modules/*" \
  -not -path "./tests/node_modules/*" \
  -not -path "./job_monitor/ui/dist/*" \
  -not -name "*.lock" \
  -not -name "package-lock.json" \
  2>/dev/null || true)
if [ -n "$LARGE_FILES" ]; then
  echo -e "${YELLOW}⚠ Large files detected (>1MB):${NC}"
  echo "$LARGE_FILES" | head -10 | while read -r file; do
    size=$(ls -lh "$file" 2>/dev/null | awk '{print $5}')
    echo "  $file ($size)"
  done
  COUNT=$(echo "$LARGE_FILES" | wc -l | tr -d ' ')
  if [ "$COUNT" -gt 10 ]; then
    echo "  ... and $((COUNT - 10)) more"
  fi
else
  log_success "No large files detected"
fi

# 3. Check for secrets (basic patterns)
log_info "Checking for potential secrets..."
SECRET_PATTERNS="password=|secret=|api_key=|token=|AWS_|DATABRICKS_TOKEN"
SECRETS_FOUND=false

for file in $FILES_TO_CHECK; do
  if [ -f "$file" ]; then
    if grep -iE "$SECRET_PATTERNS" "$file" 2>/dev/null | grep -v "# noqa" | grep -v "os.environ" | grep -v "os.getenv" | grep -v "settings\." > /dev/null; then
      if [ "$SECRETS_FOUND" = false ]; then
        log_verbose "Potential secrets found:"
        SECRETS_FOUND=true
      fi
      log_verbose "  $file"
    fi
  fi
done

if [ "$SECRETS_FOUND" = true ]; then
  echo -e "${YELLOW}⚠ Potential secrets detected (review before commit)${NC}"
else
  log_success "No obvious secrets detected"
fi

# ============================================
# SUMMARY
# ============================================
echo ""
echo "=========================================="
echo "Validation Summary"
echo "=========================================="
echo "Passed:  $PASSED"
echo "Failed:  $FAILED"
echo "Skipped: $SKIPPED"
echo "=========================================="

if [ "$FAILED" -gt 0 ]; then
  echo ""
  echo -e "${RED}❌ Validation FAILED${NC}"
  echo "Please fix the issues above before committing."
  exit 1
else
  echo ""
  echo -e "${GREEN}✅ Validation PASSED${NC}"
  exit 0
fi
