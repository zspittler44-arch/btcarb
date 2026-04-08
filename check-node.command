#!/bin/bash
# Checks if Node.js is installed and npm works
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "  NODE.JS STATUS CHECK"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""

# Add common paths
export PATH="/opt/homebrew/bin:/usr/local/bin:$PATH"

if command -v node &>/dev/null; then
  echo "✅ Node.js: $(node --version)"
  echo "✅ npm:     $(npm --version)"
  echo ""
  echo "Node is installed! Run btcarb-github-setup.command now."
else
  echo "❌ Node.js not found."
  echo ""
  echo "  Install it from the website — no Terminal needed:"
  echo ""
  echo "  1. Go to: https://nodejs.org"
  echo "  2. Click the big green 'LTS' download button"
  echo "  3. Open the downloaded .pkg file and click through the installer"
  echo "  4. Once done, come back and double-click this file again to verify"
  echo ""
  open "https://nodejs.org"
fi

echo ""
read -p "Press enter to close..."
