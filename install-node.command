#!/bin/bash
# ─────────────────────────────────────────────────────────────────────────────
# install-node.command
# Installs Node.js via Homebrew (or Homebrew first if needed)
# ─────────────────────────────────────────────────────────────────────────────

echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "  NODE.JS INSTALLER"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""

# Check if Node is already installed somewhere
NODE_PATH=$(which node 2>/dev/null || /opt/homebrew/bin/node --version 2>/dev/null && echo "/opt/homebrew/bin/node")
if command -v node &>/dev/null; then
  echo "✅ Node.js is already installed: $(node --version)"
  echo "   npm: $(npm --version)"
  read -p "Press enter to close..."
  exit 0
fi

# Check for Homebrew
if command -v brew &>/dev/null; then
  echo "[1/1] Homebrew found — installing Node.js..."
  brew install node
  echo ""
  echo "✅ Node.js installed: $(node --version)"
  echo "   npm: $(npm --version)"
  echo ""
  echo "Now double-click btcarb-github-setup.command to continue."
else
  echo "Homebrew not found — installing Homebrew first, then Node.js..."
  echo "(This will take a few minutes)"
  echo ""
  /bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"

  # Add brew to PATH for Apple Silicon
  eval "$(/opt/homebrew/bin/brew shellenv)" 2>/dev/null
  eval "$(/usr/local/bin/brew shellenv)" 2>/dev/null

  echo ""
  echo "Installing Node.js..."
  brew install node

  echo ""
  if command -v node &>/dev/null; then
    echo "✅ Node.js installed: $(node --version)"
    echo "   npm: $(npm --version)"
    echo ""
    echo "Now double-click btcarb-github-setup.command to continue."
  else
    echo "⚠️  Node installed but not in PATH yet."
    echo "   Close this window, open a new Terminal, and run:"
    echo "   node --version"
    echo ""
    echo "   If that works, double-click btcarb-github-setup.command."
  fi
fi

echo ""
read -p "Press enter to close..."
