#!/bin/bash
# Install git hooks for Job Monitor
#
# Usage:
#   ./scripts/install-hooks.sh          # Install hooks
#   ./scripts/install-hooks.sh --remove # Remove hooks

set -e

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
HOOKS_DIR="$PROJECT_ROOT/.git/hooks"
SOURCE_HOOKS="$SCRIPT_DIR/hooks"

# Check if we're removing hooks
if [ "$1" = "--remove" ]; then
  echo "Removing custom git hooks..."

  # Restore Databricks hook if it was backed up
  if [ -f "$HOOKS_DIR/pre-commit.databricks" ]; then
    mv "$HOOKS_DIR/pre-commit.databricks" "$HOOKS_DIR/pre-commit"
    echo "✓ Restored original pre-commit hook"
  elif [ -f "$HOOKS_DIR/pre-commit" ]; then
    rm "$HOOKS_DIR/pre-commit"
    echo "✓ Removed pre-commit hook"
  fi

  echo ""
  echo "Custom hooks removed."
  exit 0
fi

echo "Installing git hooks for Job Monitor..."
echo ""

# Check if .git directory exists
if [ ! -d "$HOOKS_DIR" ]; then
  echo "Error: .git/hooks directory not found"
  echo "Are you in a git repository?"
  exit 1
fi

# Backup existing pre-commit hook if it exists and isn't ours
if [ -f "$HOOKS_DIR/pre-commit" ]; then
  # Check if it's our hook
  if grep -q "Job Monitor" "$HOOKS_DIR/pre-commit" 2>/dev/null; then
    echo "Custom pre-commit hook already installed, updating..."
  else
    echo "Backing up existing pre-commit hook..."
    mv "$HOOKS_DIR/pre-commit" "$HOOKS_DIR/pre-commit.databricks"
  fi
fi

# Install pre-commit hook
cp "$SOURCE_HOOKS/pre-commit" "$HOOKS_DIR/pre-commit"
chmod +x "$HOOKS_DIR/pre-commit"
echo "✓ Installed pre-commit hook"

echo ""
echo "=========================================="
echo "Git hooks installed successfully!"
echo "=========================================="
echo ""
echo "The following validations will run on commit:"
echo "  • Python syntax check"
echo "  • Python import validation"
echo "  • TypeScript type check"
echo "  • Debug statement detection"
echo "  • Large file detection"
echo "  • Secret pattern detection"
echo ""
echo "To bypass hooks (use sparingly):"
echo "  git commit --no-verify"
echo ""
echo "To remove hooks:"
echo "  ./scripts/install-hooks.sh --remove"
echo ""
