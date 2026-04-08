# BTCARB — AI Prediction Market Trading System
*Session continuation prompt — paste at the start of every new session*

---

We are building BTCARB, a full-stack AI-powered prediction market trading and arbitrage system targeting Kalshi and Polymarket, with a focus on BTC markets.

## Architecture

- **Single source file**: `/home/claude/SOURCE.jsx` — never rebuild from chunks, always edit in place using str_replace
- **Build system**: `python3 /home/claude/build.py validate` before every deploy, `python3 /home/claude/build.py deploy` to ship
- **17-check validation script** catches prop chain breaks, missing tabs, and memory issues before deployment
- **Deployment**: Vercel via GitHub, zip at `btcarb-deploy.zip`

## Structure

- **Front Office** — Trading floor, agents, positions, live signals
- **Back Office** — Scanner, Rulebook, Predict, P&L, Insights, Alerts, Tests, Review, Setup, Learn, Health (11 tabs)
- **Office switcher** at top — one tap between front and back

## Key Systems

- `useSystemMemory()` — in-memory store with `_memStore` fallback (localStorage blocked in sandbox). Must be called in App and all props passed explicitly to BackOffice
- `usePositions()`, `useAlerts()`, `useLivePrices()` — core hooks all called in App
- **4 AI agents** (Atlas, Nova, Rex, Sage) each with individual Gemini API keys calling `gemini-2.0-flash`
- **Main AI signals** use Claude `claude-sonnet-4-20250514`
- **Demo mode** with 3 scenarios: Hot Arb, Quiet Market, Flash Crash
- **3 learning modes**: Demo Learning, Simulation, Market Watch — all feed same memory system
- **Monte Carlo profit prediction**: 600 iterations, async per horizon, guards against NaN and empty arrays
- **ErrorBoundary** wraps both Front and Back office content
- **RulebookTab** uses `ctxRef` not direct state to avoid stale closure

## Critical Prop Chain

Must always be verified: BackOffice receives `memory`, `resetMemory`, `onTradeClosed`, `onRuleFired`, `onSignal` from App. If any of these are missing the system breaks silently.

## Known Bugs (Fixed)

1. `PROP_CHAIN_BREAK` — props added to signature but not call site. Always check BOTH.
2. `LOCALSTORAGE_BLOCKED` — artifacts run in sandboxed iframe. Use `_memStore` module variable.
3. `STALE_CLOSURE` — useEffect interval captures stale ctx. Use `useRef` pattern.
4. `EMPTY_ARRAY_SPREAD` — `Math.max(...[])` returns `-Infinity`. Guard with `arr.length ? Math.max(...arr) : 0`
5. `UI_THREAD_BLOCK` — heavy sync loops freeze browser. Use async with `setTimeout` between chunks.
6. `ASSEMBLY_PATCH_MISS` — multi-chunk assembly misses call sites. Now editing SOURCE.jsx in place only.
7. `VARIABLE_SHADOW` — inner prop same name as outer state. Rename inner prop.
8. `NAN_PROPAGATION` — division by zero spreads NaN. Add `|| 1` guards on divisors.

## API Keys Needed

- **CoinGecko** — live BTC price (free)
- **Kalshi** — real market prices
- **Polymarket CLOB** — real prices + WebSocket
- **Twilio** — SMS alerts
- **Gemini × 4** — one per agent (aistudio.google.com, free)

## Rules

- Always edit SOURCE.jsx in place, never reassemble from chunks
- Run validation before every deploy
- When adding new components, add their prop contract to PROP_CONTRACTS in system_health.js and add a check to build.py
- Front Office is for traders — clean and fast. Back Office is for operations — dense and detailed
- Memory learning improves predictions over time — Demo + Sim + Watch modes build the dataset
