#!/usr/bin/env bash
# codebase-graph — one-time environment setup for Linux
# Run this once from the root of your project:
#   bash .codebase-graph/setup.sh
#
# After this runs:
#   - .codebase-graph/venv/   → isolated Python environment
#   - .codebase-graph/cg-python → thin wrapper; use instead of bare `python3`

set -euo pipefail

SKILL_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
VENV_DIR="$SKILL_DIR/venv"
WRAPPER="$SKILL_DIR/cg-python"

echo "▸ Creating virtualenv at $VENV_DIR …"
python3 -m venv "$VENV_DIR"

echo "▸ Installing dependencies …"
"$VENV_DIR/bin/pip" install --quiet --upgrade pip
"$VENV_DIR/bin/pip" install --quiet \
    tree-sitter \
    watchdog

echo "▸ Writing cg-python wrapper …"
cat > "$WRAPPER" <<'EOF'
#!/usr/bin/env bash
# Drop-in wrapper: always runs inside the codebase-graph venv.
# Usage: .codebase-graph/cg-python your_script.py [args…]
#        .codebase-graph/cg-python -c "import tree_sitter; print('ok')"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
exec "$SCRIPT_DIR/venv/bin/python3" "$@"
EOF
chmod +x "$WRAPPER"

echo ""
echo "✓ Setup complete."
echo ""
echo "  Interpreter : $VENV_DIR/bin/python3"
echo "  Wrapper     : $WRAPPER"
echo ""
echo "  Use '.codebase-graph/cg-python your_script.py' anywhere in this project."
echo "  Claude will be instructed to use this wrapper for every Python call."
