#!/usr/bin/env python3
"""
build.py — BTCARB validation + deploy script
Usage:
  python3 build.py validate   # run all checks
  python3 build.py deploy     # validate then create deploy zip
"""

import sys
import re
import os
import zipfile

SOURCE = os.path.join(os.path.dirname(__file__), "SOURCE.jsx")

CHECKS = []

def check(name):
    def decorator(fn):
        CHECKS.append((name, fn))
        return fn
    return decorator

def load():
    with open(SOURCE, "r") as f:
        return f.read()

# ── PROP CHAIN ────────────────────────────────────────────────────────────────
@check("PROP_CHAIN: BackOffice signature has memory")
def _(): src = load(); assert "function BackOffice({" in src and "memory," in src.split("function BackOffice(")[1].split(")")[0]

@check("PROP_CHAIN: BackOffice signature has resetMemory")
def _(): src = load(); assert "resetMemory," in src.split("function BackOffice(")[1].split(")")[0]

@check("PROP_CHAIN: BackOffice signature has onTradeClosed")
def _(): src = load(); assert "onTradeClosed," in src.split("function BackOffice(")[1].split(")")[0]

@check("PROP_CHAIN: BackOffice signature has onRuleFired")
def _(): src = load(); assert "onRuleFired," in src.split("function BackOffice(")[1].split(")")[0]

@check("PROP_CHAIN: BackOffice signature has onSignal")
def _(): src = load(); assert "onSignal," in src.split("function BackOffice(")[1].split(")")[0]

@check("PROP_CHAIN: BackOffice call site passes memory")
def _(): src = load(); assert "memory={memory}" in src

@check("PROP_CHAIN: BackOffice call site passes resetMemory")
def _(): src = load(); assert "resetMemory={resetMemory}" in src

@check("PROP_CHAIN: BackOffice call site passes onTradeClosed")
def _(): src = load(); assert "onTradeClosed={onTradeClosed}" in src

@check("PROP_CHAIN: BackOffice call site passes onRuleFired")
def _(): src = load(); assert "onRuleFired={onRuleFired}" in src

@check("PROP_CHAIN: BackOffice call site passes onSignal")
def _(): src = load(); assert "onSignal={onSignal}" in src

# ── MEMORY / LOCALSTORAGE ──────────────────────────────────────────────────
@check("MEMORY: _memStore module variable exists")
def _(): assert "let _memStore" in load()

@check("MEMORY: No raw localStorage API calls")
def _():
    src = load()
    # Detect actual API usage (getItem/setItem/removeItem/clear), not doc references
    bad = []
    for i, line in enumerate(src.splitlines(), 1):
        stripped = line.strip()
        if stripped.startswith("//"):
            continue
        if re.search(r'localStorage\.(getItem|setItem|removeItem|clear)\s*\(', line):
            bad.append((i, line.strip()))
    assert not bad, f"Found raw localStorage API calls: {bad}"

# ── HOOKS ─────────────────────────────────────────────────────────────────
@check("HOOKS: useSystemMemory defined")
def _(): assert "function useSystemMemory()" in load()

@check("HOOKS: useLivePrices defined")
def _(): assert "function useLivePrices(" in load()

@check("HOOKS: usePositions defined")
def _(): assert "function usePositions(" in load()

@check("HOOKS: useAlerts defined")
def _(): assert "function useAlerts(" in load()

# ── TABS ──────────────────────────────────────────────────────────────────
@check("TABS: All 11 Back Office tabs present")
def _():
    src = load()
    required = ["Scanner", "Rulebook", "Predict", "P&L", "Insights", "Alerts", "Tests", "Review", "Setup", "Learn", "Health"]
    missing = [t for t in required if f'"{t}"' not in src and f"'{t}'" not in src]
    assert not missing, f"Missing tabs: {missing}"

# ── NaN GUARDS ────────────────────────────────────────────────────────────
@check("NaN: Monte Carlo guards empty array")
def _(): assert "results.length" in load() and "isNaN" in load()

# ── ERROR BOUNDARY ─────────────────────────────────────────────────────────
@check("UI: ErrorBoundary class defined")
def _(): assert "class ErrorBoundary extends React.Component" in load()

# ── ctxRef ────────────────────────────────────────────────────────────────
@check("STALE: RulebookTab uses ctxRef")
def _(): assert "ctxRef" in load()

# ── EXPORT ────────────────────────────────────────────────────────────────
@check("EXPORT: default export App exists")
def _(): assert "export default function App" in load()

# ─────────────────────────────────────────────────────────────────────────────

def run_validate():
    print(f"\n  BTCARB BUILD VALIDATOR — {len(CHECKS)} checks\n  {'─'*50}")
    passed = 0
    failed = 0
    for name, fn in CHECKS:
        try:
            fn()
            print(f"  ✓  {name}")
            passed += 1
        except AssertionError as e:
            print(f"  ✗  {name}" + (f": {e}" if str(e) else ""))
            failed += 1
        except Exception as e:
            print(f"  ✗  {name}: {e}")
            failed += 1
    print(f"\n  {'─'*50}")
    print(f"  {passed}/{len(CHECKS)} passed" + (f"  ← {failed} FAILED" if failed else "  ← ALL GREEN ✓"))
    print()
    return failed == 0

def run_deploy():
    ok = run_validate()
    if not ok:
        print("  Deploy blocked — fix failures first.\n")
        return False
    zip_path = os.path.join(os.path.dirname(__file__), "btcarb-deploy.zip")
    with zipfile.ZipFile(zip_path, "w", zipfile.ZIP_DEFLATED) as z:
        z.write(SOURCE, "SOURCE.jsx")
        z.write(__file__, "build.py")
    print(f"  📦 Deploy zip: {zip_path}\n")
    return True

if __name__ == "__main__":
    cmd = sys.argv[1] if len(sys.argv) > 1 else "validate"
    if cmd == "validate":
        ok = run_validate()
        sys.exit(0 if ok else 1)
    elif cmd == "deploy":
        ok = run_deploy()
        sys.exit(0 if ok else 1)
    else:
        print(f"Unknown command: {cmd}. Use 'validate' or 'deploy'.")
        sys.exit(1)
