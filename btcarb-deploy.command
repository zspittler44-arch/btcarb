#!/bin/bash
# ─────────────────────────────────────────────────────────────────────────────
# btcarb-deploy.command
# Validates, builds, and pushes to GitHub → triggers Vercel auto-deploy
# ─────────────────────────────────────────────────────────────────────────────

cd "$(dirname "$0")"

echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "  ₿TCARB — DEPLOY TO VERCEL VIA GITHUB"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""

# Validate
echo "[1/3] Running 21-check validator..."
python3 build.py validate
if [ $? -ne 0 ]; then
  echo ""
  echo "  ✗ Validation failed — deploy blocked. Fix issues above first."
  read -p "Press enter to close..."
  exit 1
fi

# Commit
echo "[2/3] Committing changes..."
git add .
read -p "  Commit message (or press Enter for default): " MSG
MSG="${MSG:-Update BTCARB — $(date '+%Y-%m-%d %H:%M')}"
git commit -m "$MSG"

# Push
echo "[3/3] Pushing to GitHub..."
git push origin main
if [ $? -eq 0 ]; then
  echo ""
  echo "  ✅ Pushed! Vercel is deploying now."
  echo "     Check progress: vercel.com/dashboard"
  echo ""
  REMOTE=$(git remote get-url origin 2>/dev/null)
  if [ -n "$REMOTE" ]; then echo "  Repo: $REMOTE"; fi
else
  echo ""
  echo "  ✗ Push failed. Run btcarb-github-setup.command if not connected yet."
fi

echo ""
read -p "Press enter to close..."
