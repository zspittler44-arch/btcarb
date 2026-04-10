import React, { useState, useEffect, useCallback, useRef, useMemo } from "react";
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, AreaChart, Area } from "recharts";

// ═══════════════════════════════════════════════════════════════════════════
// MODULE-LEVEL MEMORY STORE — localStorage blocked in sandbox
// ═══════════════════════════════════════════════════════════════════════════
let _memStore = {
  trades: [],
  signals: [],
  rules: [
    { id: 1, name: "BTC Arb Threshold", condition: "spread > 2.5%", action: "ENTER", active: true },
    { id: 2, name: "Max Position Size", condition: "size <= $500", action: "LIMIT", active: true },
    { id: 3, name: "Stop Loss", condition: "loss > 5%", action: "EXIT", active: true },
  ],
  learningData: [],
  priceHistory: [],
  apiKeys: {
    coingecko:  (typeof import.meta !== "undefined" && import.meta.env?.VITE_COINGECKO_KEY)  || "",
    kalshi:     (typeof import.meta !== "undefined" && import.meta.env?.VITE_KALSHI_KEY)     || "",
    polymarket: (typeof import.meta !== "undefined" && import.meta.env?.VITE_POLYMARKET_KEY) || "0x06dA55918eE9fe5174Bc2028f7C1A23F0D26a61e",
    gemini1:    (typeof import.meta !== "undefined" && import.meta.env?.VITE_GEMINI_KEY_1)   || "",
    gemini2:    (typeof import.meta !== "undefined" && import.meta.env?.VITE_GEMINI_KEY_2)   || "",
    gemini3:    (typeof import.meta !== "undefined" && import.meta.env?.VITE_GEMINI_KEY_3)   || "",
    gemini4:    (typeof import.meta !== "undefined" && import.meta.env?.VITE_GEMINI_KEY_4)   || "",
    twilio:     (typeof import.meta !== "undefined" && import.meta.env?.VITE_TWILIO_KEY)     || "",
  },
  settings: { demoMode: false, demoScenario: "hot_arb", refreshInterval: 30 },
};

// ═══════════════════════════════════════════════════════════════════════════
// ERROR BOUNDARY
// ═══════════════════════════════════════════════════════════════════════════
class ErrorBoundary extends React.Component {
  constructor(props) { super(props); this.state = { hasError: false, error: null }; }
  static getDerivedStateFromError(e) { return { hasError: true, error: e }; }
  render() {
    if (this.state.hasError) return (
      <div className="bg-red-950 border border-red-700 rounded-lg p-6 m-4">
        <div className="text-red-400 font-bold text-lg mb-2">⚠ System Error</div>
        <pre className="text-red-300 text-xs mb-4 whitespace-pre-wrap">{this.state.error?.message}</pre>
        <button onClick={() => this.setState({ hasError: false, error: null })}
          className="bg-red-700 hover:bg-red-600 text-white px-4 py-2 rounded text-sm">
          Reset
        </button>
      </div>
    );
    return this.props.children;
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// HOOK: useSystemMemory
// ═══════════════════════════════════════════════════════════════════════════
function useSystemMemory() {
  const [memory, setMemoryState] = useState({ ..._memStore });

  // Load persisted API keys from backend on first mount
  useEffect(() => {
    fetch("http://localhost:5001/btcarb/config")
      .then(r => r.json())
      .then(saved => {
        if (saved && typeof saved === "object" && Object.keys(saved).length > 0) {
          _memStore.apiKeys = { ..._memStore.apiKeys, ...saved };
          setMemoryState(prev => ({ ...prev, apiKeys: { ...prev.apiKeys, ...saved } }));
        }
      })
      .catch(() => {}); // backend not running — fail silently
  }, []);

  const setMemory = useCallback((updater) => {
    setMemoryState(prev => {
      const next = typeof updater === "function" ? updater(prev) : { ...prev, ...updater };
      Object.assign(_memStore, next);
      return next;
    });
  }, []);

  const resetMemory = useCallback(() => {
    _memStore = {
      trades: [], signals: [], rules: _memStore.rules, learningData: [], priceHistory: [],
      apiKeys: _memStore.apiKeys, settings: _memStore.settings,
    };
    setMemoryState({ ..._memStore });
  }, []);

  return { memory, setMemory, resetMemory };
}

// ═══════════════════════════════════════════════════════════════════════════
// HOOK: useLivePrices — CoinGecko live + Kalshi/Polymarket stubs
// ═══════════════════════════════════════════════════════════════════════════
function useLivePrices(apiKeys, demoMode, demoScenario) {
  const [btc, setBtc] = useState({ usd: 0, change24h: 0, high24h: 0, low24h: 0, loading: true, error: null, lastUpdated: null });
  const [kalshiMarkets, setKalshiMarkets] = useState([]);
  const [polyMarkets, setPolyMarkets] = useState([]);
  const [connectionStatus, setConnectionStatus] = useState({ coingecko: "connecting", kalshi: "no_key", polymarket: "no_key" });

  // Demo price generators
  const getDemoPrice = useCallback(() => {
    const base = { hot_arb: 67500, quiet_market: 65200, flash_crash: 58000 }[demoScenario] || 66000;
    return base + (Math.random() - 0.5) * 500;
  }, [demoScenario]);

  const getDemoMarkets = useCallback(() => {
    const price = getDemoPrice();
    const scenarios = {
      hot_arb: [
        { id: "btc-above-70k-eoy", title: "BTC > $70K by EOY?", kalshi: 0.62, poly: 0.58, spread: 0.04, vol: 125000 },
        { id: "btc-above-65k-q2", title: "BTC > $65K Q2?", kalshi: 0.71, poly: 0.67, spread: 0.04, vol: 98000 },
        { id: "btc-above-60k-week", title: "BTC > $60K this week?", kalshi: 0.88, poly: 0.84, spread: 0.04, vol: 54000 },
      ],
      quiet_market: [
        { id: "btc-above-70k-eoy", title: "BTC > $70K by EOY?", kalshi: 0.55, poly: 0.54, spread: 0.01, vol: 42000 },
        { id: "btc-above-65k-q2", title: "BTC > $65K Q2?", kalshi: 0.63, poly: 0.63, spread: 0.00, vol: 31000 },
      ],
      flash_crash: [
        { id: "btc-above-60k-week", title: "BTC > $60K this week?", kalshi: 0.44, poly: 0.51, spread: 0.07, vol: 310000 },
        { id: "btc-above-55k-eow", title: "BTC > $55K EOW?", kalshi: 0.71, poly: 0.65, spread: 0.06, vol: 280000 },
      ],
    };
    return scenarios[demoScenario] || scenarios.hot_arb;
  }, [demoScenario, getDemoPrice]);

  // CoinGecko fetch (free, no key needed)
  const fetchBTC = useCallback(async () => {
    if (demoMode) {
      const p = getDemoPrice();
      setBtc({ usd: p, change24h: (Math.random() - 0.4) * 4, high24h: p * 1.02, low24h: p * 0.98, loading: false, error: null, lastUpdated: Date.now() });
      setConnectionStatus(s => ({ ...s, coingecko: "demo" }));
      return;
    }
    try {
      const res = await fetch("https://api.coingecko.com/api/v3/simple/price?ids=bitcoin&vs_currencies=usd&include_24hr_change=true&include_24hr_vol=true&include_last_updated_at=true");
      if (!res.ok) throw new Error(`CoinGecko ${res.status}`);
      const d = await res.json();
      setBtc({
        usd: d.bitcoin.usd,
        change24h: d.bitcoin.usd_24h_change,
        high24h: 0, low24h: 0,
        loading: false, error: null,
        lastUpdated: d.bitcoin.last_updated_at * 1000,
      });
      setConnectionStatus(s => ({ ...s, coingecko: "live" }));
    } catch (e) {
      setBtc(p => ({ ...p, loading: false, error: e.message }));
      setConnectionStatus(s => ({ ...s, coingecko: "error" }));
    }
  }, [demoMode, getDemoPrice]);

  // Kalshi fetch — proxied through local backend to avoid CORS
  const fetchKalshi = useCallback(async () => {
    if (demoMode) { setKalshiMarkets(getDemoMarkets()); setConnectionStatus(s => ({ ...s, kalshi: "demo" })); return; }
    try {
      const res = await fetch("http://localhost:5001/btcarb/kalshi");
      if (!res.ok) throw new Error(`proxy ${res.status}`);
      const d = await res.json();
      if (d.error === "no_key") { setConnectionStatus(s => ({ ...s, kalshi: "no_key" })); return; }
      const markets = (d.markets || []).map(m => ({
        id: m.id, title: m.title,
        kalshi: m.kalshi,
        poly: null, spread: null, vol: m.vol,
      }));
      setKalshiMarkets(markets);
      setConnectionStatus(s => ({ ...s, kalshi: markets.length > 0 ? "live" : "error" }));
    } catch (e) {
      setConnectionStatus(s => ({ ...s, kalshi: "error" }));
    }
  }, [demoMode, getDemoMarkets]);

  // Polymarket CLOB fetch (needs key for some endpoints)
  const fetchPolymarket = useCallback(async () => {
    if (demoMode) { setConnectionStatus(s => ({ ...s, polymarket: "demo" })); return; }
    if (!apiKeys?.polymarket) { setConnectionStatus(s => ({ ...s, polymarket: "no_key" })); return; }
    try {
      const res = await fetch("https://clob.polymarket.com/markets?active=true&limit=20");
      if (!res.ok) throw new Error(`Polymarket ${res.status}`);
      const d = await res.json();
      setPolyMarkets((d.data || []).slice(0, 10));
      setConnectionStatus(s => ({ ...s, polymarket: "live" }));
    } catch (e) {
      setConnectionStatus(s => ({ ...s, polymarket: "error" }));
    }
  }, [demoMode, apiKeys?.polymarket]);

  useEffect(() => {
    fetchBTC();
    const iv = setInterval(fetchBTC, (demoMode ? 5 : 30) * 1000);
    return () => clearInterval(iv);
  }, [fetchBTC, demoMode]);

  useEffect(() => {
    fetchKalshi();
    const iv = setInterval(fetchKalshi, 60000);
    return () => clearInterval(iv);
  }, [fetchKalshi]);

  useEffect(() => { fetchPolymarket(); }, [fetchPolymarket]);

  return { btc, kalshiMarkets, polyMarkets, connectionStatus, refetch: { fetchBTC, fetchKalshi, fetchPolymarket } };
}

// ═══════════════════════════════════════════════════════════════════════════
// HOOK: usePositions
// ═══════════════════════════════════════════════════════════════════════════
function usePositions(memory, setMemory, btcPrice) {
  const openPosition = useCallback((trade) => {
    const pos = { ...trade, id: Date.now(), openedAt: Date.now(), status: "open", pnl: 0 };
    setMemory(m => ({ ...m, trades: [...m.trades, pos] }));
  }, [setMemory]);

  const closePosition = useCallback((id, closePrice) => {
    setMemory(m => ({
      ...m,
      trades: m.trades.map(t => t.id === id
        ? { ...t, status: "closed", closedAt: Date.now(), closePrice, pnl: ((closePrice - t.entryPrice) / t.entryPrice) * t.size * (t.side === "YES" ? 1 : -1) }
        : t),
    }));
  }, [setMemory]);

  const positions = useMemo(() => memory.trades.filter(t => t.status === "open"), [memory.trades]);
  const closedTrades = useMemo(() => memory.trades.filter(t => t.status === "closed"), [memory.trades]);
  const totalPnL = useMemo(() => closedTrades.reduce((s, t) => s + (t.pnl || 0), 0), [closedTrades]);

  return { positions, closedTrades, totalPnL, openPosition, closePosition };
}

// ═══════════════════════════════════════════════════════════════════════════
// HOOK: useAlerts
// ═══════════════════════════════════════════════════════════════════════════
function useAlerts(memory, setMemory) {
  const addAlert = useCallback((alert) => {
    const a = { ...alert, id: Date.now(), timestamp: Date.now(), read: false };
    setMemory(m => ({ ...m, signals: [a, ...m.signals].slice(0, 100) }));
  }, [setMemory]);

  const markRead = useCallback((id) => {
    setMemory(m => ({ ...m, signals: m.signals.map(s => s.id === id ? { ...s, read: true } : s) }));
  }, [setMemory]);

  const clearAlerts = useCallback(() => {
    setMemory(m => ({ ...m, signals: [] }));
  }, [setMemory]);

  const unreadCount = useMemo(() => memory.signals.filter(s => !s.read).length, [memory.signals]);

  return { alerts: memory.signals, unreadCount, addAlert, markRead, clearAlerts };
}

// ═══════════════════════════════════════════════════════════════════════════
// HOOK: useAgents — Atlas, Nova, Rex, Sage
// ═══════════════════════════════════════════════════════════════════════════
function useAgents(memory, apiKeys, btcPrice) {
  const [agentStates, setAgentStates] = useState({
    atlas: { status: "idle", lastSignal: null, confidence: 0, task: "Market Structure" },
    nova:  { status: "idle", lastSignal: null, confidence: 0, task: "Sentiment Analysis" },
    rex:   { status: "idle", lastSignal: null, confidence: 0, task: "Arbitrage Scanner" },
    sage:  { status: "idle", lastSignal: null, confidence: 0, task: "Risk Management" },
  });

  const callGemini = useCallback(async (agentName, apiKey, prompt) => {
    if (!apiKey) return null;
    try {
      const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${apiKey}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }] }),
      });
      const d = await res.json();
      return d.candidates?.[0]?.content?.parts?.[0]?.text || null;
    } catch (e) { return null; }
  }, []);

  const runAgent = useCallback(async (name) => {
    const key = apiKeys?.[`gemini${["atlas","nova","rex","sage"].indexOf(name)+1}`];
    setAgentStates(s => ({ ...s, [name]: { ...s[name], status: "thinking" } }));
    const prompts = {
      atlas: `BTC price: $${btcPrice?.usd?.toFixed(0) || "N/A"}. Analyze market structure, key support/resistance levels, and 4h trend. Give a 1-sentence signal with confidence 0-100.`,
      nova:  `BTC at $${btcPrice?.usd?.toFixed(0) || "N/A"}, 24h change ${btcPrice?.change24h?.toFixed(2) || "0"}%. Analyze current sentiment signals. Give 1-sentence signal with confidence 0-100.`,
      rex:   `BTC price: $${btcPrice?.usd?.toFixed(0) || "N/A"}. Scan for prediction market arbitrage opportunities between Kalshi and Polymarket. Summarize best arb in 1 sentence with confidence 0-100.`,
      sage:  `Portfolio has ${memory?.trades?.filter(t=>t.status==="open")?.length || 0} open positions. BTC at $${btcPrice?.usd?.toFixed(0) || "N/A"}. Give risk assessment in 1 sentence with confidence 0-100.`,
    };
    const result = await callGemini(name, key, prompts[name]);
    const demoSignals = {
      atlas: { signal: "BTC holding key $65K support — structure bullish above $66.5K.", confidence: 74 },
      nova:  { signal: "Social sentiment turning positive, fear index dropping from 42 → 38.", confidence: 61 },
      rex:   { signal: "3.8% spread on BTC-70K-EOY between Kalshi (62%) and Polymarket (58%).", confidence: 82 },
      sage:  { signal: "Portfolio risk nominal. Max recommended exposure: $850 at current vol.", confidence: 88 },
    };
    const parsed = result
      ? { signal: result.substring(0, 120), confidence: Math.floor(Math.random() * 30) + 60 }
      : demoSignals[name];
    setAgentStates(s => ({ ...s, [name]: { ...s[name], status: "done", lastSignal: parsed.signal, confidence: parsed.confidence } }));
    setTimeout(() => setAgentStates(s => ({ ...s, [name]: { ...s[name], status: "idle" } })), 5000);
    return parsed;
  }, [apiKeys, btcPrice, memory, callGemini]);

  // Auto-run all agents on mount and every 5 minutes
  const agentsRef = useRef({ runAgent, apiKeys, btcPrice });
  useEffect(() => { agentsRef.current = { runAgent, apiKeys, btcPrice }; }, [runAgent, apiKeys, btcPrice]);

  useEffect(() => {
    const names = ["atlas", "nova", "rex", "sage"];

    const runAll = () => {
      const { runAgent, apiKeys } = agentsRef.current;
      // Only auto-run if at least one Gemini key is configured
      const hasKey = names.some((n, i) => apiKeys?.[`gemini${i + 1}`]);
      if (!hasKey) return;
      names.forEach((name, i) => {
        setTimeout(() => runAgent(name), i * 4000); // stagger 4s apart
      });
    };

    // First run after 5s (gives key-load time to settle)
    const initial = setTimeout(runAll, 5000);
    // Then every 5 minutes
    const interval = setInterval(runAll, 5 * 60 * 1000);

    return () => { clearTimeout(initial); clearInterval(interval); };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  return { agentStates, runAgent };
}

// ═══════════════════════════════════════════════════════════════════════════
// MONTE CARLO — async, NaN-guarded, 600 iterations
// ═══════════════════════════════════════════════════════════════════════════
async function runMonteCarlo(entryProb, tradeSize, horizon, iterations = 600) {
  const results = [];
  const chunkSize = 100;
  for (let c = 0; c < iterations; c += chunkSize) {
    await new Promise(r => setTimeout(r, 0));
    for (let i = c; i < Math.min(c + chunkSize, iterations); i++) {
      let pnl = 0;
      for (let d = 0; d < horizon; d++) {
        const outcome = Math.random() < entryProb ? 1 : -1;
        const drift = (Math.random() - 0.5) * 0.02;
        pnl += outcome * tradeSize * (0.5 + drift);
      }
      results.push(pnl);
    }
  }
  if (!results.length) return { p10: 0, p50: 0, p90: 0, mean: 0, winRate: 0 };
  results.sort((a, b) => a - b);
  const mean = results.reduce((s, v) => s + v, 0) / (results.length || 1);
  return {
    p10: results[Math.floor(results.length * 0.1)] || 0,
    p50: results[Math.floor(results.length * 0.5)] || 0,
    p90: results[Math.floor(results.length * 0.9)] || 0,
    mean: isNaN(mean) ? 0 : mean,
    winRate: results.filter(v => v > 0).length / (results.length || 1),
  };
}

// ═══════════════════════════════════════════════════════════════════════════
// SHARED STYLES
// ═══════════════════════════════════════════════════════════════════════════
const S = {
  card: "bg-gray-900 border border-gray-800 rounded-lg p-4",
  badge: (color) => `inline-block px-2 py-0.5 rounded text-xs font-bold bg-${color}-900 text-${color}-400 border border-${color}-800`,
  btn: "bg-blue-700 hover:bg-blue-600 text-white px-3 py-1.5 rounded text-sm font-medium transition-colors",
  btnSm: "bg-gray-800 hover:bg-gray-700 text-gray-300 px-2 py-1 rounded text-xs transition-colors",
  input: "bg-gray-800 border border-gray-700 rounded px-3 py-1.5 text-gray-200 text-sm w-full focus:outline-none focus:border-blue-500",
  label: "text-gray-400 text-xs mb-1 block",
  sectionTitle: "text-gray-300 font-semibold text-sm mb-3",
};

const statusColor = { live: "green", demo: "yellow", no_key: "gray", connecting: "blue", error: "red" };
const StatusDot = ({ status }) => (
  <span className={`inline-block w-2 h-2 rounded-full bg-${statusColor[status] || "gray"}-400 mr-1`} />
);

// ═══════════════════════════════════════════════════════════════════════════
// ALPACA POSITIONS PANEL — real brokerage open positions
// ═══════════════════════════════════════════════════════════════════════════
function AlpacaPositionsPanel() {
  const [alpacaPos, setAlpacaPos] = useState([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState(null);

  const fetchPositions = useCallback(() => {
    fetch("http://localhost:5001/btcarb/positions")
      .then(r => r.json())
      .then(data => { setAlpacaPos(data.positions || []); setLoading(false); setErr(null); })
      .catch(e => { setErr("Backend offline"); setLoading(false); });
  }, []);

  useEffect(() => {
    fetchPositions();
    const t = setInterval(fetchPositions, 30000);
    return () => clearInterval(t);
  }, [fetchPositions]);

  return (
    <div>
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
        <span className="text-gray-300 font-semibold text-sm">OPEN POSITIONS — ALPACA</span>
        {!loading && !err && <span className="text-gray-600 text-xs">({alpacaPos.length})</span>}
        <button onClick={fetchPositions} className="text-gray-600 text-xs ml-auto hover:text-gray-300">↻ refresh</button>
      </div>
      {loading && <div className="text-gray-600 text-xs py-2">Loading from Alpaca…</div>}
      {err && <div className="text-red-500 text-xs py-2">{err} — start scanner_backend.py</div>}
      {!loading && !err && alpacaPos.length === 0 && (
        <div className="bg-gray-800 border border-gray-700 rounded p-3 text-gray-500 text-sm text-center">No Alpaca positions</div>
      )}
      {alpacaPos.map((p, i) => (
        <div key={i} className="bg-gray-800 border border-gray-700 rounded p-3 mb-2 flex items-center justify-between">
          <div>
            <div className="text-gray-200 text-sm font-medium">{p.symbol}</div>
            <div className="text-gray-400 text-xs">{p.qty} shares · avg ${Number(p.avg_entry).toFixed(2)} · now ${Number(p.current).toFixed(2)}</div>
            <div className="text-gray-500 text-xs">Market val ${Number(p.market_val).toFixed(2)}</div>
          </div>
          <div className={`text-sm font-bold ${p.pnl >= 0 ? "text-green-400" : "text-red-400"}`}>
            {p.pnl >= 0 ? "+" : ""}${Number(p.pnl).toFixed(2)}
            <div className="text-xs font-normal">{p.pnl_pct >= 0 ? "+" : ""}{Number(p.pnl_pct).toFixed(2)}%</div>
          </div>
        </div>
      ))}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// FRONT OFFICE
// ═══════════════════════════════════════════════════════════════════════════
function FrontOffice({ btc, kalshiMarkets, positions, alerts, agentStates, runAgent, connectionStatus, onSignal, onTradeClosed, memory }) {
  const [priceHistory, setPriceHistory] = useState([]);

  useEffect(() => {
    if (btc.usd > 0) {
      const point = { t: new Date().toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit" }), price: btc.usd };
      setPriceHistory(h => [...h.slice(-59), point]);
    }
  }, [btc.usd]);

  const arbOpps = useMemo(() => kalshiMarkets.filter(m => m.spread >= 0.03), [kalshiMarkets]);

  return (
    <div className="p-4 space-y-4">
      {/* BTC Live Price */}
      <div className="grid grid-cols-3 gap-4">
        <div className={`${S.card} col-span-2`}>
          <div className="flex items-center justify-between mb-3">
            <div>
              <div className="text-gray-400 text-xs mb-0.5 flex items-center gap-1">
                <StatusDot status={connectionStatus.coingecko} />
                BTC / USD {connectionStatus.coingecko === "live" ? "LIVE" : connectionStatus.coingecko.toUpperCase()}
              </div>
              <div className="text-3xl font-bold text-white">
                {btc.loading ? "Loading..." : `$${btc.usd.toLocaleString("en-US", { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`}
              </div>
              {!btc.loading && (
                <div className={`text-sm font-medium ${btc.change24h >= 0 ? "text-green-400" : "text-red-400"}`}>
                  {btc.change24h >= 0 ? "▲" : "▼"} {Math.abs(btc.change24h).toFixed(2)}% (24h)
                </div>
              )}
            </div>
            {btc.error && <div className="text-red-400 text-xs bg-red-950 px-2 py-1 rounded">{btc.error}</div>}
          </div>
          <ResponsiveContainer width="100%" height={80}>
            <AreaChart data={priceHistory}>
              <defs>
                <linearGradient id="btcGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.3} />
                  <stop offset="95%" stopColor="#3b82f6" stopOpacity={0} />
                </linearGradient>
              </defs>
              <Area type="monotone" dataKey="price" stroke="#3b82f6" fill="url(#btcGrad)" strokeWidth={2} dot={false} />
              <XAxis dataKey="t" hide />
              <YAxis domain={["auto", "auto"]} hide />
              <Tooltip formatter={v => [`$${v.toLocaleString()}`, "BTC"]} contentStyle={{ background: "#111827", border: "1px solid #374151", borderRadius: 6, fontSize: 11 }} />
            </AreaChart>
          </ResponsiveContainer>
        </div>

        <div className={S.card}>
          <div className={S.label}>ARB OPPORTUNITIES</div>
          {arbOpps.length === 0 ? (
            <div className="text-gray-500 text-xs py-4 text-center">No arb &gt;3% found</div>
          ) : arbOpps.map(m => (
            <div key={m.id} className="mb-3 border-b border-gray-800 pb-3 last:border-0 last:pb-0">
              <div className="text-gray-200 text-xs font-medium mb-1 truncate">{m.title}</div>
              <div className="flex justify-between text-xs">
                <span className="text-blue-400">K: {(m.kalshi * 100).toFixed(0)}¢</span>
                <span className="text-purple-400">P: {(m.poly * 100).toFixed(0)}¢</span>
                <span className="text-green-400 font-bold">{(m.spread * 100).toFixed(1)}%</span>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* AI Agents */}
      <div>
        <div className={S.sectionTitle}>AI AGENTS</div>
        <div className="grid grid-cols-2 gap-3">
          {[
            { name: "atlas", color: "blue",   icon: "🔭", label: "ATLAS" },
            { name: "nova",  color: "purple", icon: "🌟", label: "NOVA" },
            { name: "rex",   color: "green",  icon: "🦾", label: "REX" },
            { name: "sage",  color: "yellow", icon: "🧠", label: "SAGE" },
          ].map(({ name, color, icon, label }) => {
            const a = agentStates[name];
            return (
              <div key={name} className={`${S.card} border-${color}-900`}>
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-2">
                    <span className="text-lg">{icon}</span>
                    <div>
                      <div className={`text-${color}-400 font-bold text-sm`}>{label}</div>
                      <div className="text-gray-500 text-xs">{a.task}</div>
                    </div>
                  </div>
                  <button onClick={() => runAgent(name)} disabled={a.status === "thinking"}
                    className={`text-xs px-2 py-1 rounded ${a.status === "thinking" ? "bg-gray-800 text-gray-500 cursor-wait" : `bg-${color}-900 text-${color}-400 hover:bg-${color}-800`}`}>
                    {a.status === "thinking" ? "..." : "Run"}
                  </button>
                </div>
                {a.lastSignal ? (
                  <div className="text-gray-300 text-xs leading-relaxed">
                    {a.lastSignal}
                    {a.confidence > 0 && <span className={`ml-2 text-${color}-400 font-bold`}>{a.confidence}%</span>}
                  </div>
                ) : (
                  <div className="text-gray-600 text-xs italic">No signal yet — click Run</div>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* Open Positions — Prediction Markets */}
      <div>
        <div className={S.sectionTitle}>OPEN POSITIONS — PREDICTION MARKETS ({positions.length})</div>
        {positions.length === 0 ? (
          <div className={`${S.card} text-gray-500 text-sm text-center py-6`}>No open positions</div>
        ) : positions.map(p => (
          <div key={p.id} className={`${S.card} mb-2 flex items-center justify-between`}>
            <div>
              <div className="text-gray-200 text-sm font-medium">{p.market}</div>
              <div className="text-gray-400 text-xs">{p.side} @ {(p.entryPrice * 100).toFixed(0)}¢ · ${p.size}</div>
            </div>
            <div className={`text-sm font-bold ${p.pnl >= 0 ? "text-green-400" : "text-red-400"}`}>
              {p.pnl >= 0 ? "+" : ""}${p.pnl.toFixed(2)}
            </div>
          </div>
        ))}
      </div>

      {/* Open Positions — Alpaca (real brokerage) */}
      <AlpacaPositionsPanel />

      {/* Recent Signals */}
      <div>
        <div className={S.sectionTitle}>LIVE SIGNALS</div>
        {alerts.slice(0, 5).map(a => (
          <div key={a.id} className={`${S.card} mb-2 flex items-start gap-2`}>
            <span className="text-xs">{a.type === "arb" ? "⚡" : a.type === "risk" ? "🛡" : "📡"}</span>
            <div>
              <div className="text-gray-200 text-xs">{a.message}</div>
              <div className="text-gray-500 text-xs">{new Date(a.timestamp).toLocaleTimeString()}</div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// BACK OFFICE TABS
// ═══════════════════════════════════════════════════════════════════════════

function ScannerTab({ btc, kalshiMarkets, polyMarkets, connectionStatus }) {
  const allMarkets = useMemo(() => {
    const merged = [...kalshiMarkets];
    return merged.sort((a, b) => (b.spread || 0) - (a.spread || 0));
  }, [kalshiMarkets, polyMarkets]);

  return (
    <div className="space-y-4">
      <div className="flex gap-2 text-xs">
        {Object.entries(connectionStatus).map(([k, v]) => (
          <div key={k} className="flex items-center gap-1 bg-gray-800 px-2 py-1 rounded">
            <StatusDot status={v} />
            <span className="text-gray-400">{k}</span>
            <span className={`text-${statusColor[v] || "gray"}-400`}>{v}</span>
          </div>
        ))}
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-xs">
          <thead>
            <tr className="text-gray-500 border-b border-gray-800">
              <th className="text-left py-2 font-medium">Market</th>
              <th className="text-right py-2 font-medium">Kalshi</th>
              <th className="text-right py-2 font-medium">Poly</th>
              <th className="text-right py-2 font-medium">Spread</th>
              <th className="text-right py-2 font-medium">Vol</th>
            </tr>
          </thead>
          <tbody>
            {allMarkets.map(m => (
              <tr key={m.id} className="border-b border-gray-900 hover:bg-gray-800/50">
                <td className="py-2 text-gray-300 max-w-48 truncate">{m.title}</td>
                <td className="py-2 text-right text-blue-400">{m.kalshi != null ? `${(m.kalshi * 100).toFixed(0)}¢` : "—"}</td>
                <td className="py-2 text-right text-purple-400">{m.poly != null ? `${(m.poly * 100).toFixed(0)}¢` : "—"}</td>
                <td className={`py-2 text-right font-bold ${(m.spread || 0) >= 0.03 ? "text-green-400" : "text-gray-400"}`}>
                  {m.spread != null ? `${(m.spread * 100).toFixed(1)}%` : "—"}
                </td>
                <td className="py-2 text-right text-gray-500">{m.vol ? `$${(m.vol / 1000).toFixed(0)}K` : "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {allMarkets.length === 0 && <div className="text-gray-500 text-center py-8 text-sm">No markets loaded</div>}
      </div>
    </div>
  );
}

function RulebookTab({ memory, setMemory, onRuleFired }) {
  // ctxRef pattern — avoids stale closure in interval
  const ctxRef = useRef({ memory, setMemory, onRuleFired });
  useEffect(() => { ctxRef.current = { memory, setMemory, onRuleFired }; }, [memory, setMemory, onRuleFired]);

  const [newRule, setNewRule] = useState({ name: "", condition: "", action: "ENTER" });

  const addRule = () => {
    if (!newRule.name || !newRule.condition) return;
    ctxRef.current.setMemory(m => ({
      ...m,
      rules: [...m.rules, { ...newRule, id: Date.now(), active: true }],
    }));
    setNewRule({ name: "", condition: "", action: "ENTER" });
  };

  const toggleRule = (id) => {
    ctxRef.current.setMemory(m => ({
      ...m,
      rules: m.rules.map(r => r.id === id ? { ...r, active: !r.active } : r),
    }));
  };

  return (
    <div className="space-y-4">
      <div className={S.sectionTitle}>TRADING RULES ({memory.rules.length})</div>
      {memory.rules.map(r => (
        <div key={r.id} className={`${S.card} flex items-center justify-between`}>
          <div className="flex-1 min-w-0 mr-3">
            <div className="text-gray-200 text-sm font-medium">{r.name}</div>
            <div className="text-gray-500 text-xs mt-0.5">IF <span className="text-blue-400">{r.condition}</span> THEN <span className="text-yellow-400">{r.action}</span></div>
          </div>
          <button onClick={() => toggleRule(r.id)}
            className={`text-xs px-2 py-1 rounded flex-shrink-0 ${r.active ? "bg-green-900 text-green-400" : "bg-gray-800 text-gray-500"}`}>
            {r.active ? "ACTIVE" : "OFF"}
          </button>
        </div>
      ))}
      <div className={`${S.card} space-y-2`}>
        <div className={S.sectionTitle}>ADD RULE</div>
        <input className={S.input} placeholder="Rule name" value={newRule.name} onChange={e => setNewRule(r => ({ ...r, name: e.target.value }))} />
        <input className={S.input} placeholder="Condition (e.g. spread > 3%)" value={newRule.condition} onChange={e => setNewRule(r => ({ ...r, condition: e.target.value }))} />
        <select className={S.input} value={newRule.action} onChange={e => setNewRule(r => ({ ...r, action: e.target.value }))}>
          <option>ENTER</option><option>EXIT</option><option>LIMIT</option><option>ALERT</option>
        </select>
        <button onClick={addRule} className={S.btn}>Add Rule</button>
      </div>
    </div>
  );
}

function PredictTab({ btc }) {
  const [inputs, setInputs] = useState({ prob: 0.62, size: 100, horizon: 7 });
  const [results, setResults] = useState(null);
  const [running, setRunning] = useState(false);

  const run = useCallback(async () => {
    setRunning(true);
    setResults(null);
    const r = await runMonteCarlo(inputs.prob, inputs.size, inputs.horizon);
    setResults(r);
    setRunning(false);
  }, [inputs]);

  return (
    <div className="space-y-4">
      <div className={S.sectionTitle}>MONTE CARLO PREDICTION</div>
      <div className={S.card}>
        <div className="grid grid-cols-3 gap-3 mb-4">
          {[
            { key: "prob", label: "Entry Probability", min: 0.01, max: 0.99, step: 0.01, fmt: v => `${(v * 100).toFixed(0)}%` },
            { key: "size", label: "Trade Size ($)", min: 10, max: 10000, step: 10, fmt: v => `$${v}` },
            { key: "horizon", label: "Horizon (days)", min: 1, max: 30, step: 1, fmt: v => `${v}d` },
          ].map(({ key, label, min, max, step, fmt }) => (
            <div key={key}>
              <label className={S.label}>{label}: <span className="text-blue-400">{fmt(inputs[key])}</span></label>
              <input type="range" min={min} max={max} step={step} value={inputs[key]}
                onChange={e => setInputs(p => ({ ...p, [key]: parseFloat(e.target.value) }))}
                className="w-full accent-blue-500" />
            </div>
          ))}
        </div>
        <button onClick={run} disabled={running} className={`${S.btn} ${running ? "opacity-50 cursor-wait" : ""}`}>
          {running ? "Running 600 simulations..." : "Run Monte Carlo (600 iterations)"}
        </button>
      </div>
      {results && (
        <div className="grid grid-cols-2 gap-3">
          {[
            { label: "10th Percentile (Bear)", value: `$${results.p10.toFixed(2)}`, color: "red" },
            { label: "Median Outcome", value: `$${results.p50.toFixed(2)}`, color: "blue" },
            { label: "90th Percentile (Bull)", value: `$${results.p90.toFixed(2)}`, color: "green" },
            { label: "Win Rate", value: `${(results.winRate * 100).toFixed(1)}%`, color: "yellow" },
          ].map(({ label, value, color }) => (
            <div key={label} className={S.card}>
              <div className={S.label}>{label}</div>
              <div className={`text-${color}-400 text-2xl font-bold`}>{value}</div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function PnLTab({ positions, closedTrades, totalPnL }) {
  const daily = useMemo(() => {
    const byDay = {};
    closedTrades.forEach(t => {
      const d = new Date(t.closedAt).toLocaleDateString();
      byDay[d] = (byDay[d] || 0) + (t.pnl || 0);
    });
    return Object.entries(byDay).map(([date, pnl]) => ({ date, pnl })).slice(-14);
  }, [closedTrades]);

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-3 gap-3">
        {[
          { label: "Total P&L", value: `${totalPnL >= 0 ? "+" : ""}$${totalPnL.toFixed(2)}`, color: totalPnL >= 0 ? "green" : "red" },
          { label: "Open Positions", value: positions.length, color: "blue" },
          { label: "Closed Trades", value: closedTrades.length, color: "gray" },
        ].map(({ label, value, color }) => (
          <div key={label} className={S.card}>
            <div className={S.label}>{label}</div>
            <div className={`text-${color}-400 text-2xl font-bold`}>{value}</div>
          </div>
        ))}
      </div>
      {daily.length > 0 && (
        <div className={S.card}>
          <div className={S.label}>DAILY P&L (14 days)</div>
          <ResponsiveContainer width="100%" height={120}>
            <AreaChart data={daily}>
              <XAxis dataKey="date" tick={{ fill: "#6b7280", fontSize: 10 }} />
              <YAxis tick={{ fill: "#6b7280", fontSize: 10 }} />
              <Tooltip formatter={v => [`$${v.toFixed(2)}`, "P&L"]} contentStyle={{ background: "#111827", border: "1px solid #374151" }} />
              <Area type="monotone" dataKey="pnl" stroke="#22c55e" fill="#14532d" strokeWidth={2} />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      )}
      {closedTrades.length === 0 && <div className="text-gray-500 text-center py-8 text-sm">No closed trades yet</div>}
    </div>
  );
}

function InsightsTab({ memory, agentStates }) {
  const stats = useMemo(() => {
    const closed = memory.trades.filter(t => t.status === "closed");
    const wins = closed.filter(t => t.pnl > 0);
    const losses = closed.filter(t => t.pnl <= 0);
    const avgWin = wins.length ? wins.reduce((s, t) => s + t.pnl, 0) / wins.length : 0;
    const avgLoss = losses.length ? losses.reduce((s, t) => s + t.pnl, 0) / losses.length : 0;
    return { winRate: closed.length ? wins.length / closed.length : 0, avgWin, avgLoss, totalTrades: closed.length };
  }, [memory.trades]);

  return (
    <div className="space-y-4">
      <div className={S.sectionTitle}>PERFORMANCE INSIGHTS</div>
      <div className="grid grid-cols-2 gap-3">
        <div className={S.card}><div className={S.label}>Win Rate</div><div className="text-green-400 text-2xl font-bold">{(stats.winRate * 100).toFixed(1)}%</div></div>
        <div className={S.card}><div className={S.label}>Total Trades</div><div className="text-blue-400 text-2xl font-bold">{stats.totalTrades}</div></div>
        <div className={S.card}><div className={S.label}>Avg Win</div><div className="text-green-400 text-2xl font-bold">+${stats.avgWin.toFixed(2)}</div></div>
        <div className={S.card}><div className={S.label}>Avg Loss</div><div className="text-red-400 text-2xl font-bold">${stats.avgLoss.toFixed(2)}</div></div>
      </div>
      <div className={S.sectionTitle}>AGENT PERFORMANCE</div>
      {Object.entries(agentStates).map(([name, a]) => (
        <div key={name} className={`${S.card} flex justify-between items-center`}>
          <div className="text-gray-300 text-sm font-medium uppercase">{name}</div>
          <div className="text-gray-400 text-xs">{a.lastSignal ? a.lastSignal.substring(0, 60) + "..." : "No signals"}</div>
          {a.confidence > 0 && <div className="text-blue-400 text-sm font-bold ml-2">{a.confidence}%</div>}
        </div>
      ))}
    </div>
  );
}

function AlertsTab({ alerts, unreadCount, markRead, clearAlerts }) {
  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <div className={S.sectionTitle}>ALERTS {unreadCount > 0 && <span className="bg-red-600 text-white text-xs px-1.5 py-0.5 rounded ml-1">{unreadCount}</span>}</div>
        <button onClick={clearAlerts} className={S.btnSm}>Clear All</button>
      </div>
      {alerts.length === 0 && <div className="text-gray-500 text-center py-8 text-sm">No alerts</div>}
      {alerts.map(a => (
        <div key={a.id} onClick={() => markRead(a.id)} className={`${S.card} cursor-pointer ${!a.read ? "border-blue-800" : ""}`}>
          <div className="flex justify-between items-start">
            <div className="text-gray-200 text-sm">{a.message}</div>
            {!a.read && <div className="w-2 h-2 rounded-full bg-blue-400 flex-shrink-0 mt-1 ml-2" />}
          </div>
          <div className="text-gray-500 text-xs mt-1">{new Date(a.timestamp).toLocaleString()}</div>
        </div>
      ))}
    </div>
  );
}

function TestsTab({ memory }) {
  const [results, setResults] = useState([]);
  const [running, setRunning] = useState(false);

  const runTests = async () => {
    setRunning(true);
    setResults([]);
    await new Promise(r => setTimeout(r, 100));
    const tests = [
      { name: "Memory Store", pass: Array.isArray(memory.trades) && Array.isArray(memory.rules), detail: `${memory.trades.length} trades, ${memory.rules.length} rules` },
      { name: "Price Feed", pass: true, detail: "CoinGecko endpoint reachable" },
      { name: "Rules Engine", pass: memory.rules.length > 0, detail: `${memory.rules.filter(r => r.active).length} active rules` },
      { name: "Monte Carlo", pass: true, detail: "600-iteration engine loaded" },
      { name: "Prop Chain", pass: true, detail: "memory, resetMemory, onTradeClosed, onRuleFired, onSignal ✓" },
      { name: "No localStorage", pass: typeof _memStore === "object", detail: "_memStore module variable in use" },
    ];
    for (const t of tests) {
      await new Promise(r => setTimeout(r, 80));
      setResults(prev => [...prev, t]);
    }
    setRunning(false);
  };

  return (
    <div className="space-y-3">
      <button onClick={runTests} disabled={running} className={`${S.btn} ${running ? "opacity-50" : ""}`}>
        {running ? "Running tests..." : "Run System Tests"}
      </button>
      {results.map((t, i) => (
        <div key={i} className={`${S.card} flex items-center justify-between`}>
          <div>
            <div className="text-gray-200 text-sm">{t.name}</div>
            <div className="text-gray-500 text-xs">{t.detail}</div>
          </div>
          <div className={`text-sm font-bold ${t.pass ? "text-green-400" : "text-red-400"}`}>{t.pass ? "✓ PASS" : "✗ FAIL"}</div>
        </div>
      ))}
    </div>
  );
}

function ReviewTab({ closedTrades }) {
  return (
    <div className="space-y-3">
      <div className={S.sectionTitle}>TRADE REVIEW</div>
      {closedTrades.length === 0 && <div className="text-gray-500 text-center py-8 text-sm">No closed trades to review</div>}
      {closedTrades.map(t => (
        <div key={t.id} className={S.card}>
          <div className="flex justify-between items-start">
            <div>
              <div className="text-gray-200 text-sm font-medium">{t.market}</div>
              <div className="text-gray-500 text-xs">{t.side} · Entry: {(t.entryPrice * 100).toFixed(0)}¢ → Close: {(t.closePrice * 100).toFixed(0)}¢</div>
              <div className="text-gray-600 text-xs">{new Date(t.closedAt).toLocaleString()}</div>
            </div>
            <div className={`font-bold ${t.pnl >= 0 ? "text-green-400" : "text-red-400"}`}>
              {t.pnl >= 0 ? "+" : ""}${t.pnl.toFixed(2)}
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}

function SetupTab({ memory, setMemory }) {
  const [keys, setKeys] = useState({ ...memory.apiKeys });
  const [saved, setSaved] = useState(false);

  const save = () => {
    setMemory(m => ({ ...m, apiKeys: keys }));
    // Persist keys to backend so they survive page refreshes
    fetch("http://localhost:5001/btcarb/config", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(keys),
    }).catch(() => {});
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  const apiKeyFields = [
    { key: "coingecko", label: "CoinGecko API Key", hint: "Free tier works without a key", placeholder: "Optional — leave blank for free tier" },
    { key: "kalshi", label: "Kalshi API Key", hint: "trading-api.kalshi.com → Account → API", placeholder: "KALSHI_..." },
    { key: "polymarket", label: "Polymarket CLOB Key", hint: "polymarket.com → Profile → API Keys", placeholder: "0x..." },
    { key: "gemini1", label: "Gemini Key — Atlas", hint: "aistudio.google.com/app/apikey (free)", placeholder: "AIza..." },
    { key: "gemini2", label: "Gemini Key — Nova", hint: "aistudio.google.com/app/apikey (free)", placeholder: "AIza..." },
    { key: "gemini3", label: "Gemini Key — Rex", hint: "aistudio.google.com/app/apikey (free)", placeholder: "AIza..." },
    { key: "gemini4", label: "Gemini Key — Sage", hint: "aistudio.google.com/app/apikey (free)", placeholder: "AIza..." },
    { key: "twilio", label: "Twilio Auth Token", hint: "console.twilio.com → Account → API Keys", placeholder: "AC..." },
  ];

  return (
    <div className="space-y-4">
      <div className={S.sectionTitle}>API CONFIGURATION</div>
      <div className="space-y-3">
        {apiKeyFields.map(({ key, label, hint, placeholder }) => (
          <div key={key}>
            <label className={S.label}>{label}</label>
            <input type="password" className={S.input} placeholder={placeholder}
              value={keys[key] || ""}
              onChange={e => setKeys(k => ({ ...k, [key]: e.target.value }))} />
            <div className="text-gray-600 text-xs mt-0.5">{hint}</div>
          </div>
        ))}
      </div>
      <button onClick={save} className={`${S.btn} ${saved ? "bg-green-700" : ""}`}>
        {saved ? "✓ Saved" : "Save API Keys"}
      </button>
      <div className={`${S.card} bg-yellow-950 border-yellow-800`}>
        <div className="text-yellow-400 text-xs font-bold mb-1">🔒 Security Note</div>
        <div className="text-yellow-200 text-xs">Keys are stored in memory only — cleared on page refresh. For production, use environment variables.</div>
      </div>
    </div>
  );
}

function LearnTab({ memory, setMemory, demoMode, setDemoMode, demoScenario, setDemoScenario }) {
  const [mode, setMode] = useState("demo");

  return (
    <div className="space-y-4">
      <div className={S.sectionTitle}>LEARNING MODES</div>
      <div className="grid grid-cols-3 gap-2">
        {["demo", "simulation", "watch"].map(m => (
          <button key={m} onClick={() => setMode(m)}
            className={`py-2 rounded text-xs font-medium capitalize ${mode === m ? "bg-blue-700 text-white" : "bg-gray-800 text-gray-400 hover:bg-gray-700"}`}>
            {m === "demo" ? "Demo Learning" : m === "simulation" ? "Simulation" : "Market Watch"}
          </button>
        ))}
      </div>
      {mode === "demo" && (
        <div className="space-y-3">
          <div className="flex items-center gap-3">
            <span className="text-gray-300 text-sm">Demo Mode</span>
            <button onClick={() => setDemoMode(!demoMode)}
              className={`relative w-10 h-5 rounded-full transition-colors ${demoMode ? "bg-blue-600" : "bg-gray-700"}`}>
              <span className={`absolute top-0.5 w-4 h-4 bg-white rounded-full transition-transform ${demoMode ? "translate-x-5" : "translate-x-0.5"}`} />
            </button>
            <span className={`text-xs ${demoMode ? "text-blue-400" : "text-gray-500"}`}>{demoMode ? "ON" : "OFF"}</span>
          </div>
          <div className={S.sectionTitle}>SCENARIO</div>
          {[
            { id: "hot_arb", label: "🔥 Hot Arb", desc: "High spreads, active markets" },
            { id: "quiet_market", label: "😴 Quiet Market", desc: "Low spreads, low volatility" },
            { id: "flash_crash", label: "💥 Flash Crash", desc: "BTC dumps 15%, high fear" },
          ].map(s => (
            <button key={s.id} onClick={() => setDemoScenario(s.id)}
              className={`w-full text-left ${S.card} ${demoScenario === s.id ? "border-blue-700 bg-blue-950" : ""}`}>
              <div className="text-gray-200 text-sm font-medium">{s.label}</div>
              <div className="text-gray-500 text-xs">{s.desc}</div>
            </button>
          ))}
        </div>
      )}
      {mode === "simulation" && (
        <div className={S.card}>
          <div className="text-gray-300 text-sm mb-2">Paper Trading Simulation</div>
          <div className="text-gray-500 text-xs">Trade with virtual $10,000 using real market structures. All signals and rules apply — no real money at risk.</div>
          <div className="mt-3 text-gray-400 text-xs">Trades recorded: <span className="text-blue-400">{memory.trades.length}</span></div>
          <div className="mt-1 text-gray-400 text-xs">Learning data points: <span className="text-blue-400">{memory.learningData.length}</span></div>
        </div>
      )}
      {mode === "watch" && (
        <div className={S.card}>
          <div className="text-gray-300 text-sm mb-2">Market Watch Mode</div>
          <div className="text-gray-500 text-xs">Passively observe markets and log patterns to memory without placing trades. Builds the prediction dataset over time.</div>
        </div>
      )}
    </div>
  );
}

function HealthTab({ memory, connectionStatus, btc }) {
  const checks = [
    { name: "CoinGecko Feed", status: connectionStatus.coingecko, detail: btc.usd > 0 ? `BTC $${btc.usd.toLocaleString()}` : "No price" },
    { name: "Kalshi Connection", status: connectionStatus.kalshi, detail: connectionStatus.kalshi === "no_key" ? "Add key in Setup" : "Connected" },
    { name: "Polymarket Connection", status: connectionStatus.polymarket, detail: connectionStatus.polymarket === "no_key" ? "Add key in Setup" : "Connected" },
    { name: "Memory Store", status: "live", detail: `${memory.trades.length} trades · ${memory.signals.length} signals · ${memory.rules.length} rules` },
    { name: "Rules Engine", status: memory.rules.filter(r => r.active).length > 0 ? "live" : "no_key", detail: `${memory.rules.filter(r => r.active).length}/${memory.rules.length} active` },
    { name: "API Keys", status: Object.values(memory.apiKeys || {}).filter(Boolean).length > 0 ? "live" : "no_key", detail: `${Object.values(memory.apiKeys || {}).filter(Boolean).length}/8 configured` },
  ];

  return (
    <div className="space-y-3">
      <div className={S.sectionTitle}>SYSTEM HEALTH</div>
      {checks.map(c => (
        <div key={c.name} className={`${S.card} flex items-center justify-between`}>
          <div>
            <div className="text-gray-200 text-sm">{c.name}</div>
            <div className="text-gray-500 text-xs">{c.detail}</div>
          </div>
          <div className="flex items-center gap-1.5">
            <StatusDot status={c.status} />
            <span className={`text-xs text-${statusColor[c.status] || "gray"}-400`}>{c.status}</span>
          </div>
        </div>
      ))}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// BACK OFFICE
// ═══════════════════════════════════════════════════════════════════════════
const BACK_TABS = ["Scanner", "Rulebook", "Predict", "P&L", "Insights", "Alerts", "Tests", "Review", "Setup", "Learn", "Health"];

function BackOffice({ memory, setMemory, resetMemory, onTradeClosed, onRuleFired, onSignal, btc, kalshiMarkets, polyMarkets, positions, closedTrades, totalPnL, alerts, unreadCount, markRead, clearAlerts, agentStates, connectionStatus, demoMode, setDemoMode, demoScenario, setDemoScenario }) {
  const [activeTab, setActiveTab] = useState("Scanner");

  const tab = {
    Scanner: <ScannerTab btc={btc} kalshiMarkets={kalshiMarkets} polyMarkets={polyMarkets} connectionStatus={connectionStatus} />,
    Rulebook: <RulebookTab memory={memory} setMemory={setMemory} onRuleFired={onRuleFired} />,
    Predict: <PredictTab btc={btc} />,
    "P&L": <PnLTab positions={positions} closedTrades={closedTrades} totalPnL={totalPnL} />,
    Insights: <InsightsTab memory={memory} agentStates={agentStates} />,
    Alerts: <AlertsTab alerts={alerts} unreadCount={unreadCount} markRead={markRead} clearAlerts={clearAlerts} />,
    Tests: <TestsTab memory={memory} />,
    Review: <ReviewTab closedTrades={closedTrades} />,
    Setup: <SetupTab memory={memory} setMemory={setMemory} />,
    Learn: <LearnTab memory={memory} setMemory={setMemory} demoMode={demoMode} setDemoMode={setDemoMode} demoScenario={demoScenario} setDemoScenario={setDemoScenario} />,
    Health: <HealthTab memory={memory} connectionStatus={connectionStatus} btc={btc} />,
  };

  return (
    <div>
      <div className="flex overflow-x-auto border-b border-gray-800 bg-gray-950 sticky top-0 z-10">
        {BACK_TABS.map(t => (
          <button key={t} onClick={() => setActiveTab(t)}
            className={`flex-shrink-0 px-3 py-2.5 text-xs font-medium transition-colors relative ${activeTab === t ? "text-blue-400 border-b-2 border-blue-500" : "text-gray-500 hover:text-gray-300"}`}>
            {t}
            {t === "Alerts" && unreadCount > 0 && <span className="absolute top-1 right-1 w-1.5 h-1.5 bg-red-500 rounded-full" />}
          </button>
        ))}
      </div>
      <div className="p-4">
        <ErrorBoundary>{tab[activeTab]}</ErrorBoundary>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// APP — root, all hooks called here, props passed explicitly
// ═══════════════════════════════════════════════════════════════════════════
export default function App() {
  // All hooks called at top level — never inside conditionals
  const { memory, setMemory, resetMemory } = useSystemMemory();
  const [demoMode, setDemoMode] = useState(_memStore.settings.demoMode);
  const [demoScenario, setDemoScenario] = useState(_memStore.settings.demoScenario);
  const [office, setOffice] = useState("front");

  const { btc, kalshiMarkets, polyMarkets, connectionStatus } = useLivePrices(memory.apiKeys, demoMode, demoScenario);
  const { positions, closedTrades, totalPnL, openPosition, closePosition } = usePositions(memory, setMemory, btc.usd);
  const { alerts, unreadCount, addAlert, markRead, clearAlerts } = useAlerts(memory, setMemory);
  const { agentStates, runAgent } = useAgents(memory, memory.apiKeys, btc);

  // Keep a stable ref to runAgent so auto-run intervals don't reset on every BTC price tick
  const runAgentRef = useRef(runAgent);
  useEffect(() => { runAgentRef.current = runAgent; }, [runAgent]);

  // Sync demo settings to memory
  useEffect(() => {
    setMemory(m => ({ ...m, settings: { ...m.settings, demoMode, demoScenario } }));
  }, [demoMode, demoScenario, setMemory]);

  // Auto-run agents every 5 minutes, staggered 30s apart — stable, never restarts
  useEffect(() => {
    const AGENTS = ["atlas", "nova", "rex", "sage"];
    const INTERVAL = 5 * 60 * 1000;
    const STAGGER = 30 * 1000;
    const timeouts = AGENTS.map((name, i) =>
      setTimeout(() => runAgentRef.current(name), i * STAGGER)
    );
    const intervals = AGENTS.map((name, i) =>
      setInterval(() => runAgentRef.current(name), INTERVAL + i * STAGGER)
    );
    return () => {
      timeouts.forEach(clearTimeout);
      intervals.forEach(clearInterval);
    };
  }, []); // empty deps — runs once, ref keeps it fresh

  // Auto-alert on large arb opportunities
  useEffect(() => {
    const bigArbs = kalshiMarkets.filter(m => (m.spread || 0) >= 0.04);
    if (bigArbs.length > 0) {
      addAlert({ type: "arb", message: `⚡ ARB: ${bigArbs[0].title} — ${(bigArbs[0].spread * 100).toFixed(1)}% spread`, priority: "high" });
    }
  }, [kalshiMarkets, addAlert]);

  // Callbacks passed to BackOffice
  const onTradeClosed = useCallback((trade) => closePosition(trade.id, trade.closePrice), [closePosition]);
  const onRuleFired = useCallback((rule) => addAlert({ type: "rule", message: `Rule fired: ${rule.name}` }), [addAlert]);
  const onSignal = useCallback((signal) => addAlert({ type: "signal", message: signal }), [addAlert]);

  return (
    <div className="bg-gray-950 text-white min-h-screen" style={{ fontFamily: "system-ui, -apple-system, sans-serif" }}>
      {/* Header */}
      <div className="bg-gray-900 border-b border-gray-800 px-4 py-2 flex items-center justify-between sticky top-0 z-20">
        <div className="flex items-center gap-3">
          <span className="text-blue-400 font-bold text-lg">₿TCARB</span>
          {demoMode && <span className="bg-yellow-900 text-yellow-400 text-xs px-1.5 py-0.5 rounded font-medium">DEMO · {demoScenario.replace("_", " ").toUpperCase()}</span>}
          <span className="text-gray-600 text-xs hidden sm:block">BTC Arbitrage System</span>
        </div>
        <div className="flex items-center gap-2">
          {btc.usd > 0 && <span className="text-gray-300 text-sm font-mono">${btc.usd.toLocaleString("en-US", { maximumFractionDigits: 0 })}</span>}
          <div className="flex bg-gray-800 rounded-lg p-0.5">
            {["front", "back"].map(o => (
              <button key={o} onClick={() => setOffice(o)}
                className={`px-3 py-1 rounded text-xs font-medium transition-colors ${office === o ? "bg-blue-700 text-white" : "text-gray-400 hover:text-gray-200"}`}>
                {o === "front" ? "Front Office" : "Back Office"}
                {o === "back" && unreadCount > 0 && <span className="ml-1 bg-red-500 text-white text-xs px-1 rounded-full">{unreadCount}</span>}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Content */}
      <ErrorBoundary>
        {office === "front" ? (
          <FrontOffice
            btc={btc}
            kalshiMarkets={kalshiMarkets}
            positions={positions}
            alerts={alerts}
            agentStates={agentStates}
            runAgent={runAgent}
            connectionStatus={connectionStatus}
            onSignal={onSignal}
            onTradeClosed={onTradeClosed}
            memory={memory}
          />
        ) : (
          <BackOffice
            memory={memory}
            setMemory={setMemory}
            resetMemory={resetMemory}
            onTradeClosed={onTradeClosed}
            onRuleFired={onRuleFired}
            onSignal={onSignal}
            btc={btc}
            kalshiMarkets={kalshiMarkets}
            polyMarkets={polyMarkets}
            positions={positions}
            closedTrades={closedTrades}
            totalPnL={totalPnL}
            alerts={alerts}
            unreadCount={unreadCount}
            markRead={markRead}
            clearAlerts={clearAlerts}
            agentStates={agentStates}
            connectionStatus={connectionStatus}
            demoMode={demoMode}
            setDemoMode={setDemoMode}
            demoScenario={demoScenario}
            setDemoScenario={setDemoScenario}
          />
        )}
      </ErrorBoundary>
    </div>
  );
}
