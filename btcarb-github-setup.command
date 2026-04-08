#!/bin/bash
# ─────────────────────────────────────────────────────────────────────────────
# btcarb-github-setup.command
# One-time setup: installs deps, inits git, and walks you through GitHub deploy
# ─────────────────────────────────────────────────────────────────────────────

cd "$(dirname "$0")"

echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "  ₿TCARB — GITHUB + VERCEL SETUP"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""

# Step 1: Install dependencies
echo "[1/4] Installing npm dependencies..."
npm install
if [ $? -ne 0 ]; then echo "npm install failed. Is Node.js installed?"; read -p "Press enter..."; exit 1; fi
echo "      Done."

# Step 2: Test build
echo ""
echo "[2/4] Testing production build..."
npm run build
if [ $? -ne 0 ]; then echo "Build failed — check errors above."; read -p "Press enter..."; exit 1; fi
echo "      Build successful ✓"

# Step 3: Init git
echo ""
echo "[3/4] Setting up git repository..."
if [ ! -d ".git" ]; then
  git init
  git add .
  git commit -m "Initial BTCARB commit — AI prediction market trading system"
  echo "      Git repo initialized and committed."
else
  echo "      Git repo already exists — skipping init."
fi

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "  [4/4] MANUAL STEPS — takes 3 minutes:"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""
echo "  A) Create a GitHub repo:"
echo "     → github.com/new"
echo "     → Name it: btcarb"
echo "     → Leave it EMPTY (no README)"
echo "     → Copy the repo URL (looks like: https://github.com/YOU/btcarb.git)"
echo ""
read -p "  Paste your GitHub repo URL here: " REPO_URL

if [ -n "$REPO_URL" ]; then
  git remote add origin "$REPO_URL" 2>/dev/null || git remote set-url origin "$REPO_URL"
  git branch -M main
  git push -u origin main
  echo ""
  echo "  ✓ Code pushed to GitHub!"
  echo ""
  echo "  B) Connect to Vercel:"
  echo "     → vercel.com/new"
  echo "     → Click 'Import Git Repository'"
  echo "     → Select your btcarb repo"
  echo "     → Framework: Vite (auto-detected)"
  echo "     → Click Deploy"
  echo ""
  echo "  That's it — Vercel will give you a live URL in ~60 seconds."
  echo "  Every time you make changes, run btcarb-deploy.command to push."
else
  echo ""
  echo "  Skipped — run this script again when your GitHub repo is ready."
fi

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
read -p "Press enter to close..."
