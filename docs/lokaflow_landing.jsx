import { useState, useEffect, useRef } from "react";

// ── Google Fonts injection ──────────────────────────────────────────────────
const FontLoader = () => (
  <style>{`
    @import url('https://fonts.googleapis.com/css2?family=Syne:wght@400;600;700;800&family=JetBrains+Mono:wght@300;400;500;600&family=DM+Sans:wght@300;400;500&display=swap');
    
    *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
    
    html { scroll-behavior: smooth; }
    
    body {
      background: #020810;
      color: #e2e8f0;
      font-family: 'DM Sans', sans-serif;
      -webkit-font-smoothing: antialiased;
      overflow-x: hidden;
    }

    ::-webkit-scrollbar { width: 4px; }
    ::-webkit-scrollbar-track { background: #020810; }
    ::-webkit-scrollbar-thumb { background: #1e3a5f; border-radius: 2px; }

    @keyframes fadeUp {
      from { opacity: 0; transform: translateY(24px); }
      to   { opacity: 1; transform: translateY(0); }
    }
    @keyframes fadeIn {
      from { opacity: 0; } to { opacity: 1; }
    }
    @keyframes pulse-glow {
      0%, 100% { box-shadow: 0 0 8px #00d4ff44; }
      50% { box-shadow: 0 0 24px #00d4ff88, 0 0 48px #00d4ff22; }
    }
    @keyframes flow {
      0% { stroke-dashoffset: 200; opacity: 0; }
      20% { opacity: 1; }
      80% { opacity: 1; }
      100% { stroke-dashoffset: 0; opacity: 0; }
    }
    @keyframes ticker {
      0% { transform: translateY(0); }
      25% { transform: translateY(-33.33%); }
      50% { transform: translateY(-66.66%); }
      75% { transform: translateY(-100%); }
    }
    @keyframes shimmer {
      0% { background-position: -200% 0; }
      100% { background-position: 200% 0; }
    }
    @keyframes scanline {
      0% { transform: translateY(-100%); }
      100% { transform: translateY(100vh); }
    }
    @keyframes blink {
      0%, 100% { opacity: 1; } 50% { opacity: 0; }
    }
    @keyframes float {
      0%, 100% { transform: translateY(0px); }
      50% { transform: translateY(-8px); }
    }
    @keyframes spin-slow {
      from { transform: rotate(0deg); } to { transform: rotate(360deg); }
    }

    .fade-up { animation: fadeUp 0.7s ease forwards; }
    .fade-up-1 { animation: fadeUp 0.7s 0.1s ease both; }
    .fade-up-2 { animation: fadeUp 0.7s 0.2s ease both; }
    .fade-up-3 { animation: fadeUp 0.7s 0.3s ease both; }
    .fade-up-4 { animation: fadeUp 0.7s 0.4s ease both; }
    .fade-up-5 { animation: fadeUp 0.7s 0.5s ease both; }

    .glow-btn {
      position: relative;
      overflow: hidden;
      transition: all 0.3s ease;
    }
    .glow-btn::before {
      content: '';
      position: absolute;
      top: -50%; left: -50%;
      width: 200%; height: 200%;
      background: radial-gradient(circle, #00d4ff22, transparent 60%);
      opacity: 0;
      transition: opacity 0.3s;
    }
    .glow-btn:hover::before { opacity: 1; }
    .glow-btn:hover { transform: translateY(-1px); }

    .card-hover {
      transition: all 0.3s ease;
    }
    .card-hover:hover {
      transform: translateY(-4px);
      border-color: #00d4ff44 !important;
    }

    .product-card:hover .product-icon {
      transform: scale(1.1);
      filter: drop-shadow(0 0 12px currentColor);
    }
    .product-icon { transition: all 0.3s ease; }

    .nav-link {
      color: #64748b;
      text-decoration: none;
      font-size: 13px;
      font-weight: 500;
      transition: color 0.2s;
      letter-spacing: 0.01em;
    }
    .nav-link:hover { color: #e2e8f0; }

    .metric-number {
      font-family: 'JetBrains Mono', monospace;
      background: linear-gradient(135deg, #00d4ff, #00ff9d);
      -webkit-background-clip: text;
      -webkit-text-fill-color: transparent;
      background-clip: text;
    }

    .grid-bg {
      background-image: 
        linear-gradient(rgba(0, 212, 255, 0.03) 1px, transparent 1px),
        linear-gradient(90deg, rgba(0, 212, 255, 0.03) 1px, transparent 1px);
      background-size: 40px 40px;
    }

    .noise-overlay {
      position: fixed; inset: 0;
      pointer-events: none; z-index: 999;
      opacity: 0.025;
      background-image: url("data:image/svg+xml,%3Csvg viewBox='0 0 256 256' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='noise'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23noise)'/%3E%3C/svg%3E");
    }

    .section-label {
      font-family: 'JetBrains Mono', monospace;
      font-size: 11px;
      font-weight: 500;
      letter-spacing: 0.2em;
      text-transform: uppercase;
      color: #00d4ff;
    }

    .display-heading {
      font-family: 'Syne', sans-serif;
      font-weight: 800;
      line-height: 1.05;
      letter-spacing: -0.02em;
    }

    .mono { font-family: 'JetBrains Mono', monospace; }

    .tag {
      display: inline-flex; align-items: center;
      padding: 3px 10px; border-radius: 100px;
      font-family: 'JetBrains Mono', monospace;
      font-size: 11px; font-weight: 500;
    }

    .routing-line {
      stroke-dasharray: 200;
      stroke-dashoffset: 200;
      animation: flow 2.5s ease-in-out infinite;
    }
    .routing-line-1 { animation-delay: 0s; }
    .routing-line-2 { animation-delay: 0.8s; }
    .routing-line-3 { animation-delay: 1.6s; }

    .pricing-card {
      transition: all 0.3s ease;
    }
    .pricing-card:hover {
      transform: translateY(-6px);
    }

    .counter {
      font-family: 'JetBrains Mono', monospace;
      font-variant-numeric: tabular-nums;
    }

    @media (max-width: 768px) {
      .hide-mobile { display: none !important; }
      .stack-mobile { flex-direction: column !important; }
    }
  `}</style>
);

// ── Data ────────────────────────────────────────────────────────────────────
const STATS = [
  { value: "74%", label: "queries handled locally", sub: "zero cloud cost" },
  { value: "87%", label: "average savings", sub: "vs naive all-cloud" },
  { value: "7.3M", label: "free cloud tokens/day", sub: "per user with free keys" },
  { value: "€0", label: "cost for 97% of users", sub: "individuals & small orgs" },
];

const PRODUCTS = [
  { id: "flow", icon: "🌊", name: "LokaFlow™", tag: "CORE", color: "#00d4ff", tagColor: "#0c2d44",
    desc: "The routing infrastructure. Classifies every query by complexity, cost, and privacy. Routes locally when it can. Cloud only when it must.", free: true },
  { id: "agent", icon: "🤖", name: "LokaAgent™", tag: "AUTOMATION", color: "#00ff9d", tagColor: "#0a2d1e",
    desc: "8-stage DAG orchestration. Decomposes complex tasks into subtasks. Local models execute in parallel. Frontier quality at local cost.", free: true },
  { id: "guard", icon: "🛡️", name: "LokaGuard™", tag: "COMPLIANCE", color: "#f59e0b", tagColor: "#2d1e0a",
    desc: "DORA · SOX · GDPR automated compliance. Append-only audit trail, PDF reports, PII custom rules, EU data residency enforcement.", free: false, tier: "Business+" },
  { id: "enterprise", icon: "🏢", name: "LokaEnterprise", tag: "CORPORATE", color: "#8b5cf6", tagColor: "#1e0a2d",
    desc: "On-premise Docker deployment. Air-gapped mode. SSO (Entra ID, Google, SAML). Admin panel. Department routing policies. White-label.", free: false, tier: "Enterprise" },
  { id: "learn", icon: "🎓", name: "LokaLearn™", tag: "EDUCATION", color: "#22c55e", tagColor: "#0a2d14",
    desc: "30+ AI tutoring prompt templates. Works offline after setup. 50+ languages via local Qwen models. For students, schools, NGOs — always free.", free: true },
  { id: "access", icon: "🌍", name: "LokaAccess™", tag: "GLOBAL", color: "#ec4899", tagColor: "#2d0a1e",
    desc: "AI for the other 6 billion. Works on 4-year-old Android phones. No credit card. No internet after setup. Telco partnership programme.", free: true, tier: "2028" },
];

const ROUTING_STEPS = [
  { step: "01", label: "PII Scan", detail: "IBAN · BSN · email · CC · IP", color: "#ef4444", route: "LOCAL if detected" },
  { step: "02", label: "Token Count", detail: "> 8,000 tokens", color: "#f59e0b", route: "LOCAL if exceeded" },
  { step: "03", label: "Complexity Score", detail: "6-signal classifier · 0.0–1.0", color: "#8b5cf6", route: "< 0.35 → LOCAL" },
  { step: "04", label: "Budget Check", detail: "daily + monthly EUR caps", color: "#3b82f6", route: "exceeded → LOCAL" },
  { step: "05", label: "Execute + Log", detail: "metadata only · no content stored", color: "#00d4ff", route: "stream response" },
];

const PRICING = [
  { name: "Individual", icon: "🧑", size: "1 person", price: "€0", period: "forever", color: "#22c55e",
    rule: "Every human. Always free.", features: ["Full LokaFlow platform", "Unlimited local AI", "Own free API keys", "LokaAgent workflows", "LokaLearn pack", "Community support"] },
  { name: "NGO / School", icon: "🌍", size: "any size", price: "€0", period: "forever", color: "#22c55e",
    rule: "Education & social good — any size.", features: ["Everything in Individual", "Up to 500 accounts", "Admin dashboard", "Team prompt library", "Offline installer kit", "50+ languages"] },
  { name: "Startup", icon: "🚀", size: "< 100 staff OR < €1M ARR", price: "€0", period: "until you grow", color: "#3b82f6",
    rule: "Both thresholds must be crossed to pay.", features: ["Everything in Individual", "Up to 99 user accounts", "Team workspaces", "API access", "Webhooks + Zapier"] },
  { name: "Business", icon: "🏢", size: "500–2,000 staff + >€1M ARR", price: "€199", period: "/month", color: "#8b5cf6",
    rule: "Flat fee. 2,000 employees still €199.", highlight: true,
    features: ["Everything in Startup", "LokaGuard compliance", "DORA / SOX audit trail", "EU data residency", "SSO integration", "Priority support"] },
  { name: "Enterprise", icon: "🏦", size: "2,000+ staff + >€1M ARR", price: "€999+", period: "/month", color: "#ef4444",
    rule: "They can afford it. This funds everyone else.", features: ["Everything in Business", "On-premise Docker", "Air-gapped mode", "Custom model training", "Dedicated CSM", "SLA 99.99%"] },
];

// ── Components ───────────────────────────────────────────────────────────────
function Nav() {
  const [scrolled, setScrolled] = useState(false);
  useEffect(() => {
    const fn = () => setScrolled(window.scrollY > 40);
    window.addEventListener("scroll", fn);
    return () => window.removeEventListener("scroll", fn);
  }, []);

  return (
    <nav style={{
      position: "fixed", top: 0, left: 0, right: 0, zIndex: 100,
      padding: "0 24px",
      background: scrolled ? "rgba(2, 8, 16, 0.92)" : "transparent",
      backdropFilter: scrolled ? "blur(20px)" : "none",
      borderBottom: scrolled ? "1px solid rgba(0, 212, 255, 0.08)" : "1px solid transparent",
      transition: "all 0.3s ease",
    }}>
      <div style={{ maxWidth: 1200, margin: "0 auto", display: "flex", alignItems: "center", justifyContent: "space-between", height: 60 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <div style={{ width: 28, height: 28, borderRadius: 8, background: "linear-gradient(135deg, #00d4ff, #00ff9d)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 14 }}>🌊</div>
          <span style={{ fontFamily: "'Syne', sans-serif", fontWeight: 800, fontSize: 16, letterSpacing: "-0.01em", color: "#f8fafc" }}>LokaFlow<span style={{ color: "#00d4ff" }}>™</span></span>
        </div>
        <div style={{ display: "flex", gap: 28 }} className="hide-mobile">
          {["How It Works", "Products", "Pricing", "Vision"].map(l => (
            <a key={l} href={`#${l.toLowerCase().replace(" ", "-")}`} className="nav-link">{l}</a>
          ))}
        </div>
        <div style={{ display: "flex", gap: 10 }}>
          <a href="https://github.com/manojmallick/lokaflow" style={{ color: "#64748b", textDecoration: "none", fontSize: 13, fontWeight: 500, display: "flex", alignItems: "center", gap: 6, transition: "color 0.2s" }}
            onMouseEnter={e => e.currentTarget.style.color = "#e2e8f0"}
            onMouseLeave={e => e.currentTarget.style.color = "#64748b"}>
            ⭐ GitHub
          </a>
          <button style={{ background: "linear-gradient(135deg, #00d4ff, #00ff9d)", border: "none", borderRadius: 8, padding: "7px 16px", fontSize: 12, fontWeight: 700, color: "#020810", cursor: "pointer", fontFamily: "'DM Sans', sans-serif", letterSpacing: "0.01em" }}
            className="glow-btn">
            Get Started Free
          </button>
        </div>
      </div>
    </nav>
  );
}

function Hero() {
  const [count, setCount] = useState(0);

  useEffect(() => {
    // Simulate a live savings counter
    const start = Date.now();
    const end = 1847293;
    const duration = 3000;
    const timer = setInterval(() => {
      const elapsed = Date.now() - start;
      const progress = Math.min(elapsed / duration, 1);
      const eased = 1 - Math.pow(1 - progress, 3);
      setCount(Math.floor(eased * end));
      if (progress >= 1) clearInterval(timer);
    }, 16);
    return () => clearInterval(timer);
  }, []);

  return (
    <section style={{ minHeight: "100vh", display: "flex", flexDirection: "column", justifyContent: "center", padding: "100px 24px 60px", position: "relative", overflow: "hidden" }} className="grid-bg">
      
      {/* Background glow */}
      <div style={{ position: "absolute", top: "20%", left: "50%", transform: "translateX(-50%)", width: 600, height: 600, background: "radial-gradient(circle, rgba(0, 212, 255, 0.06) 0%, transparent 70%)", pointerEvents: "none" }} />
      <div style={{ position: "absolute", bottom: "10%", right: "10%", width: 300, height: 300, background: "radial-gradient(circle, rgba(0, 255, 157, 0.04) 0%, transparent 70%)", pointerEvents: "none" }} />

      <div style={{ maxWidth: 1200, margin: "0 auto", width: "100%" }}>
        
        {/* Badge */}
        <div className="fade-up-1" style={{ marginBottom: 24, display: "flex", gap: 10, flexWrap: "wrap" }}>
          <span className="tag" style={{ background: "#0c2d44", color: "#00d4ff", border: "1px solid #00d4ff33" }}>
            🌊 LOKAFLOW™ — OPEN BETA
          </span>
          <span className="tag" style={{ background: "#0a2d1e", color: "#00ff9d", border: "1px solid #00ff9d33" }}>
            ✓ 115 UNIT TESTS · BUSL-1.1
          </span>
        </div>

        {/* Headline */}
        <h1 className="display-heading fade-up-2" style={{ fontSize: "clamp(42px, 6vw, 84px)", color: "#f8fafc", marginBottom: 20, maxWidth: 900 }}>
          The AI your provider<br />
          <span style={{ background: "linear-gradient(135deg, #00d4ff, #00ff9d)", WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent", backgroundClip: "text" }}>
            doesn't want you to have.
          </span>
        </h1>

        {/* Subheading */}
        <p className="fade-up-3" style={{ fontSize: "clamp(16px, 2vw, 20px)", color: "#94a3b8", maxWidth: 600, lineHeight: 1.6, marginBottom: 32, fontWeight: 300 }}>
          LokaFlow routes AI queries intelligently — local first, cloud only when necessary.
          Save 60–87% on costs. Keep private data off the cloud.{" "}
          <strong style={{ color: "#e2e8f0", fontWeight: 500 }}>Free for everyone who isn't a corporation.</strong>
        </p>

        {/* CTA row */}
        <div className="fade-up-4" style={{ display: "flex", gap: 12, flexWrap: "wrap", marginBottom: 60 }}>
          <button className="glow-btn" style={{ background: "linear-gradient(135deg, #00d4ff, #00ff9d)", border: "none", borderRadius: 10, padding: "13px 28px", fontSize: 14, fontWeight: 700, color: "#020810", cursor: "pointer", fontFamily: "'DM Sans', sans-serif" }}>
            Get Started Free →
          </button>
          <button style={{ background: "transparent", border: "1px solid #1e3a5f", borderRadius: 10, padding: "13px 28px", fontSize: 14, fontWeight: 500, color: "#94a3b8", cursor: "pointer", fontFamily: "'DM Sans', sans-serif", transition: "all 0.2s" }}
            onMouseEnter={e => { e.currentTarget.style.borderColor = "#00d4ff44"; e.currentTarget.style.color = "#e2e8f0"; }}
            onMouseLeave={e => { e.currentTarget.style.borderColor = "#1e3a5f"; e.currentTarget.style.color = "#94a3b8"; }}>
            ⭐ Star on GitHub
          </button>
          <button style={{ background: "transparent", border: "1px solid #1e3a5f", borderRadius: 10, padding: "13px 28px", fontSize: 14, fontWeight: 500, color: "#94a3b8", cursor: "pointer", fontFamily: "'DM Sans', sans-serif", transition: "all 0.2s" }}
            onMouseEnter={e => { e.currentTarget.style.borderColor = "#00d4ff44"; e.currentTarget.style.color = "#e2e8f0"; }}
            onMouseLeave={e => { e.currentTarget.style.borderColor = "#1e3a5f"; e.currentTarget.style.color = "#94a3b8"; }}>
            📖 Read the Docs
          </button>
        </div>

        {/* Live counter */}
        <div className="fade-up-5" style={{ display: "inline-flex", alignItems: "center", gap: 14, background: "rgba(0, 212, 255, 0.04)", border: "1px solid rgba(0, 212, 255, 0.12)", borderRadius: 12, padding: "12px 20px" }}>
          <div style={{ width: 8, height: 8, borderRadius: "50%", background: "#00ff9d", animation: "pulse-glow 2s infinite" }} />
          <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 13, color: "#94a3b8" }}>
            Tokens routed locally this month:{" "}
            <span className="counter" style={{ color: "#00d4ff", fontSize: 15, fontWeight: 600 }}>
              {count.toLocaleString()}+
            </span>
            {" "}·{" "}
            <span style={{ color: "#00ff9d" }}>€0.00 cost</span>
          </span>
        </div>

        {/* Stats row */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 1, marginTop: 60, background: "rgba(0, 212, 255, 0.06)", borderRadius: 16, overflow: "hidden", border: "1px solid rgba(0, 212, 255, 0.08)" }} className="fade-up">
          {STATS.map((s, i) => (
            <div key={i} style={{ padding: "24px 20px", background: "#020810", borderRight: i < 3 ? "1px solid rgba(0, 212, 255, 0.06)" : "none" }}>
              <div className="metric-number" style={{ fontSize: 32, fontWeight: 800, marginBottom: 4 }}>{s.value}</div>
              <div style={{ fontSize: 13, color: "#94a3b8", marginBottom: 2 }}>{s.label}</div>
              <div style={{ fontSize: 11, color: "#475569", fontFamily: "'JetBrains Mono', monospace" }}>{s.sub}</div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

function HowItWorks() {
  return (
    <section id="how-it-works" style={{ padding: "100px 24px", background: "#030b18", position: "relative" }}>
      <div style={{ maxWidth: 1200, margin: "0 auto" }}>
        
        <div style={{ marginBottom: 60 }}>
          <div className="section-label" style={{ marginBottom: 14 }}>// HOW IT WORKS</div>
          <h2 className="display-heading" style={{ fontSize: "clamp(32px, 4vw, 52px)", color: "#f8fafc", marginBottom: 16, maxWidth: 600 }}>
            Every query. Optimal route.<br />
            <span style={{ color: "#64748b", fontWeight: 600 }}>Automatically.</span>
          </h2>
          <p style={{ fontSize: 16, color: "#64748b", maxWidth: 500, lineHeight: 1.7, fontWeight: 300 }}>
            5-step pipeline. Runs in milliseconds. 74% of queries never leave your machine.
          </p>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 48, alignItems: "start" }} className="stack-mobile">
          
          {/* Pipeline steps */}
          <div>
            {ROUTING_STEPS.map((step, i) => (
              <div key={i} className="card-hover" style={{ display: "flex", gap: 16, padding: "20px 0", borderBottom: i < ROUTING_STEPS.length - 1 ? "1px solid #0f1e30" : "none" }}>
                <div style={{ minWidth: 36, height: 36, borderRadius: 8, background: `${step.color}14`, border: `1px solid ${step.color}33`, display: "flex", alignItems: "center", justifyContent: "center", fontFamily: "'JetBrains Mono', monospace", fontSize: 11, fontWeight: 600, color: step.color }}>
                  {step.step}
                </div>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 14, fontWeight: 600, color: "#e2e8f0", marginBottom: 3 }}>{step.label}</div>
                  <div style={{ fontSize: 12, color: "#64748b", fontFamily: "'JetBrains Mono', monospace", marginBottom: 4 }}>{step.detail}</div>
                  <div style={{ fontSize: 11, color: step.color, background: `${step.color}10`, border: `1px solid ${step.color}22`, borderRadius: 4, padding: "2px 8px", display: "inline-block", fontFamily: "'JetBrains Mono', monospace" }}>
                    → {step.route}
                  </div>
                </div>
              </div>
            ))}
          </div>

          {/* Visual routing diagram */}
          <div style={{ background: "#020810", border: "1px solid #0f1e30", borderRadius: 16, padding: 28, position: "relative", overflow: "hidden" }}>
            <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 11, color: "#475569", marginBottom: 20, letterSpacing: "0.1em" }}>ROUTING DECISION FLOW</div>
            
            {/* Flow visualization */}
            {[
              { label: "User Query", bg: "#0c2d44", border: "#00d4ff33", color: "#00d4ff", icon: "💬", y: 0 },
              { label: "PII Detected?", bg: "#2d1414", border: "#ef444433", color: "#ef4444", icon: "🔍", y: 70 },
              { label: "Complexity Scorer", bg: "#1e0a2d", border: "#8b5cf633", color: "#8b5cf6", icon: "⚙️", y: 140 },
            ].map((node, i) => (
              <div key={i} style={{ background: node.bg, border: `1px solid ${node.border}`, borderRadius: 10, padding: "10px 14px", marginBottom: 10, display: "flex", alignItems: "center", gap: 10 }}>
                <span style={{ fontSize: 16 }}>{node.icon}</span>
                <span style={{ fontSize: 13, color: node.color, fontFamily: "'JetBrains Mono', monospace", fontWeight: 500 }}>{node.label}</span>
              </div>
            ))}

            {/* Three output lanes */}
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 8, marginTop: 6 }}>
              {[
                { tier: "LOCAL", color: "#00ff9d", bg: "#0a2d1e", pct: "74%", model: "Ollama", cost: "€0" },
                { tier: "SPECIALIST", color: "#f59e0b", bg: "#2d1e0a", pct: "17%", model: "Gemini Flash", cost: "€0.001" },
                { tier: "CLOUD", color: "#00d4ff", bg: "#0c2d44", pct: "9%", model: "Claude / GPT-4", cost: "€0.01" },
              ].map((lane, i) => (
                <div key={i} style={{ background: lane.bg, border: `1px solid ${lane.color}22`, borderRadius: 10, padding: "12px 10px", textAlign: "center" }}>
                  <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 10, fontWeight: 700, color: lane.color, marginBottom: 4 }}>{lane.tier}</div>
                  <div style={{ fontSize: 18, fontWeight: 800, color: lane.color, fontFamily: "'JetBrains Mono', monospace", marginBottom: 2 }}>{lane.pct}</div>
                  <div style={{ fontSize: 10, color: "#475569", marginBottom: 2 }}>{lane.model}</div>
                  <div style={{ fontSize: 10, color: lane.color, opacity: 0.7 }}>{lane.cost}/query</div>
                </div>
              ))}
            </div>

            {/* Live indicator */}
            <div style={{ marginTop: 20, display: "flex", alignItems: "center", gap: 8, padding: "10px 14px", background: "rgba(0, 255, 157, 0.04)", border: "1px solid rgba(0, 255, 157, 0.1)", borderRadius: 8 }}>
              <div style={{ width: 6, height: 6, borderRadius: "50%", background: "#00ff9d", animation: "pulse-glow 2s infinite" }} />
              <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 11, color: "#64748b" }}>
                Average savings: <span style={{ color: "#00ff9d", fontWeight: 600 }}>87%</span> vs all-cloud
              </span>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

function TheProblem() {
  return (
    <section style={{ padding: "100px 24px", background: "#020810", position: "relative", overflow: "hidden" }}>
      <div style={{ position: "absolute", inset: 0, background: "radial-gradient(ellipse at 50% 50%, rgba(239, 68, 68, 0.04), transparent 70%)", pointerEvents: "none" }} />
      <div style={{ maxWidth: 1200, margin: "0 auto" }}>
        
        <div style={{ marginBottom: 60, maxWidth: 700 }}>
          <div className="section-label" style={{ marginBottom: 14, color: "#ef4444" }}>// THE PROBLEM</div>
          <h2 className="display-heading" style={{ fontSize: "clamp(32px, 4vw, 52px)", color: "#f8fafc", marginBottom: 16 }}>
            You're paying for AI<br />
            <span style={{ color: "#ef4444" }}>you're barely using.</span>
          </h2>
          <p style={{ fontSize: 16, color: "#64748b", lineHeight: 1.7, fontWeight: 300 }}>
            Most developers subscribe to 3–5 AI tools. LokaAudit™ shows the average user
            actually needs about €3/month of API credits to get everything they're paying €110+/month for.
          </p>
        </div>

        {/* The comparison */}
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 2, marginBottom: 40 }} className="stack-mobile">
          {/* Without LokaFlow */}
          <div style={{ background: "#0d0a0a", border: "1px solid #2d1414", borderRadius: "16px 0 0 16px", padding: 32 }}>
            <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 11, color: "#ef4444", letterSpacing: "0.15em", marginBottom: 24 }}>✗ WITHOUT LOKAFLOW</div>
            {[
              { label: "Claude Pro", cost: "€20/mo", note: "hit rate limits" },
              { label: "ChatGPT Plus", cost: "€20/mo", note: "same queries twice" },
              { label: "GitHub Copilot", cost: "€10/mo", note: "basic code complete" },
              { label: "Perplexity Pro", cost: "€20/mo", note: "mostly free search" },
              { label: "Gemini Advanced", cost: "€20/mo", note: "rarely used" },
            ].map((item, i) => (
              <div key={i} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "10px 0", borderBottom: "1px solid #1a0a0a" }}>
                <div>
                  <span style={{ fontSize: 14, color: "#94a3b8" }}>{item.label}</span>
                  <span style={{ fontSize: 11, color: "#475569", fontFamily: "'JetBrains Mono', monospace", marginLeft: 10 }}>{item.note}</span>
                </div>
                <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 14, color: "#ef4444", fontWeight: 600 }}>{item.cost}</span>
              </div>
            ))}
            <div style={{ marginTop: 20, paddingTop: 16, borderTop: "1px solid #2d1414", display: "flex", justifyContent: "space-between" }}>
              <span style={{ fontFamily: "'Syne', sans-serif", fontWeight: 700, fontSize: 15, color: "#e2e8f0" }}>Total</span>
              <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 22, fontWeight: 800, color: "#ef4444" }}>€90/mo</span>
            </div>
          </div>

          {/* With LokaFlow */}
          <div style={{ background: "#0a0d0a", border: "1px solid #0a2d14", borderRadius: "0 16px 16px 0", padding: 32 }}>
            <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 11, color: "#00ff9d", letterSpacing: "0.15em", marginBottom: 24 }}>✓ WITH LOKAFLOW</div>
            {[
              { label: "Local Ollama (qwen2.5:7b)", cost: "€0", note: "74% of queries", color: "#00ff9d" },
              { label: "Gemini free tier (own key)", cost: "€0", note: "2.7M tokens/day", color: "#00ff9d" },
              { label: "Groq free tier (own key)", cost: "€0", note: "1.5M tokens/day", color: "#00ff9d" },
              { label: "xAI free credit (own key)", cost: "€0", note: "$25/month credit", color: "#00ff9d" },
              { label: "Cloud API (overflow only)", cost: "€2–8", note: "when actually needed", color: "#f59e0b" },
            ].map((item, i) => (
              <div key={i} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "10px 0", borderBottom: "1px solid #0a1a0a" }}>
                <div>
                  <span style={{ fontSize: 14, color: "#94a3b8" }}>{item.label}</span>
                  <span style={{ fontSize: 11, color: "#475569", fontFamily: "'JetBrains Mono', monospace", marginLeft: 10 }}>{item.note}</span>
                </div>
                <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 14, color: item.color, fontWeight: 600 }}>{item.cost}</span>
              </div>
            ))}
            <div style={{ marginTop: 20, paddingTop: 16, borderTop: "1px solid #0a2d14", display: "flex", justifyContent: "space-between" }}>
              <span style={{ fontFamily: "'Syne', sans-serif", fontWeight: 700, fontSize: 15, color: "#e2e8f0" }}>Total</span>
              <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 22, fontWeight: 800, color: "#00ff9d" }}>€0–8/mo</span>
            </div>
          </div>
        </div>

        <div style={{ textAlign: "center", padding: "20px", background: "rgba(0, 255, 157, 0.04)", border: "1px solid rgba(0, 255, 157, 0.1)", borderRadius: 12 }}>
          <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 14, color: "#94a3b8" }}>
            Average saving:{" "}
            <span style={{ fontSize: 22, fontWeight: 800, color: "#00ff9d" }}>87%</span>
            {" "}·{" "}
            <span style={{ color: "#e2e8f0" }}>~€82/month back in your pocket</span>
            {" "}·{" "}
            <span style={{ color: "#64748b" }}>€984/year</span>
          </span>
        </div>
      </div>
    </section>
  );
}

function Products() {
  const [active, setActive] = useState("flow");
  const activeProduct = PRODUCTS.find(p => p.id === active);

  return (
    <section id="products" style={{ padding: "100px 24px", background: "#030b18" }}>
      <div style={{ maxWidth: 1200, margin: "0 auto" }}>
        
        <div style={{ marginBottom: 60 }}>
          <div className="section-label" style={{ marginBottom: 14 }}>// THE PRODUCT FAMILY</div>
          <h2 className="display-heading" style={{ fontSize: "clamp(32px, 4vw, 52px)", color: "#f8fafc", marginBottom: 16 }}>
            One codebase.<br />
            <span style={{ color: "#00d4ff" }}>Six products. All free to 97%.</span>
          </h2>
          <p style={{ fontSize: 16, color: "#64748b", maxWidth: 500, lineHeight: 1.7, fontWeight: 300 }}>
            Not six apps. Not six teams. One install — feature flags unlock capabilities based on who you are.
          </p>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 12, marginBottom: 16 }} className="stack-mobile">
          {PRODUCTS.map(p => (
            <div key={p.id} className="card-hover product-card" onClick={() => setActive(p.id)}
              style={{ background: active === p.id ? `${p.color}0a` : "#020810", border: `1px solid ${active === p.id ? p.color + "44" : "#0f1e30"}`, borderRadius: 14, padding: 20, cursor: "pointer", transition: "all 0.3s" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 12 }}>
                <span className="product-icon" style={{ fontSize: 28, color: p.color }}>{p.icon}</span>
                <div style={{ display: "flex", gap: 6 }}>
                  {p.free && <span className="tag" style={{ background: "#0a2d1e", color: "#00ff9d", border: "1px solid #00ff9d22", fontSize: 10 }}>FREE</span>}
                  {p.tier && <span className="tag" style={{ background: "#0c2d44", color: "#64748b", border: "1px solid #1e3a5f", fontSize: 10 }}>{p.tier}</span>}
                </div>
              </div>
              <div style={{ fontFamily: "'Syne', sans-serif", fontWeight: 700, fontSize: 15, color: active === p.id ? p.color : "#e2e8f0", marginBottom: 6 }}>{p.name}</div>
              <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 10, color: "#475569", letterSpacing: "0.1em", marginBottom: 10 }}>{p.tag}</div>
              <p style={{ fontSize: 13, color: "#64748b", lineHeight: 1.6 }}>{p.desc}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

function Architecture() {
  return (
    <section style={{ padding: "80px 24px", background: "#020810" }}>
      <div style={{ maxWidth: 1200, margin: "0 auto" }}>
        <div className="section-label" style={{ marginBottom: 14 }}>// ARCHITECTURE</div>
        <h2 className="display-heading" style={{ fontSize: "clamp(28px, 3.5vw, 44px)", color: "#f8fafc", marginBottom: 40, maxWidth: 600 }}>
          12 packages. 115 tests.<br /><span style={{ color: "#64748b" }}>All passing.</span>
        </h2>

        <div style={{ background: "#030b18", border: "1px solid #0f1e30", borderRadius: 16, padding: 28, fontFamily: "'JetBrains Mono', monospace", fontSize: 12 }}>
          <div style={{ color: "#475569", marginBottom: 20 }}>$ tree packages/ --summary</div>
          {[
            { pkg: "@lokaflow/core", status: "✅", desc: "Router · 11 providers · PII scanner · classifier · budget · search · memory" },
            { pkg: "@lokaflow/agent", status: "✅", desc: "8-stage DAG orchestration (65 unit tests)" },
            { pkg: "@lokaflow/orchestrator", status: "✅", desc: "Task decomposition · complexity measurement · budget allocation" },
            { pkg: "@lokaflow/mesh", status: "✅", desc: "mDNS discovery · WoL · battery-aware scheduling · carbon tracking" },
            { pkg: "@lokaflow/audit", status: "✅", desc: "ChatGPT / Claude subscription waste analyser" },
            { pkg: "@lokaflow/route", status: "✅", desc: "OpenAI-compatible proxy · savings tracker" },
            { pkg: "@lokaflow/api", status: "✅", desc: "REST API on :4141 · OpenAI-compatible endpoint" },
            { pkg: "@lokaflow/guard", status: "🔧", desc: "DORA / SOX / GDPR compliance module  ← IN PROGRESS" },
            { pkg: "@lokaflow/enterprise", status: "🔧", desc: "Admin panel · SSO · on-premise config  ← PLANNED" },
            { pkg: "@lokaflow/content", status: "🔧", desc: "LokaLearn prompt pack + registry  ← PLANNED" },
            { pkg: "apps/web", status: "🔧", desc: "Dashboard + chat UI  ← IN PROGRESS" },
            { pkg: "apps/mobile", status: "📱", desc: "React Native + llama.cpp  ← 2028" },
          ].map((item, i) => (
            <div key={i} style={{ display: "flex", gap: 12, padding: "7px 0", borderBottom: "1px solid #0a0f18", alignItems: "flex-start" }}>
              <span style={{ fontSize: 12 }}>{item.status}</span>
              <span style={{ color: "#00d4ff", minWidth: 220 }}>{item.pkg}</span>
              <span style={{ color: "#475569", flex: 1 }}>{item.desc}</span>
            </div>
          ))}
          <div style={{ marginTop: 16, paddingTop: 12, borderTop: "1px solid #0f1e30", color: "#475569" }}>
            115 unit tests passing · 0 network required for unit tests · live integration tests auto-skip if Ollama absent
          </div>
        </div>
      </div>
    </section>
  );
}

function Pricing() {
  return (
    <section id="pricing" style={{ padding: "100px 24px", background: "#030b18", position: "relative" }}>
      <div style={{ position: "absolute", inset: 0, background: "radial-gradient(ellipse at 50% 0%, rgba(0, 212, 255, 0.04), transparent 60%)", pointerEvents: "none" }} />
      <div style={{ maxWidth: 1200, margin: "0 auto" }}>
        
        <div style={{ textAlign: "center", marginBottom: 24 }}>
          <div className="section-label" style={{ marginBottom: 14, display: "block" }}>// PRICING</div>
          <h2 className="display-heading" style={{ fontSize: "clamp(32px, 4vw, 52px)", color: "#f8fafc", marginBottom: 16 }}>
            The simplest rule in SaaS.
          </h2>
        </div>

        {/* The one rule */}
        <div style={{ textAlign: "center", marginBottom: 52 }}>
          <div style={{ display: "inline-block", background: "rgba(0, 212, 255, 0.04)", border: "1px solid rgba(0, 212, 255, 0.12)", borderRadius: 16, padding: "20px 40px", maxWidth: 700 }}>
            <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 13, color: "#94a3b8", lineHeight: 1.8 }}>
              <span style={{ color: "#00ff9d" }}>if</span>{" "}
              <span style={{ color: "#f59e0b" }}>employees</span>{" ≤ 100 "}
              <span style={{ color: "#00ff9d" }}>OR</span>{" "}
              <span style={{ color: "#f59e0b" }}>revenue</span>{" ≤ €1M {"}"}
              <span style={{ color: "#00d4ff" }}> free</span>
              {" }"}
              <br />
              <span style={{ color: "#00ff9d" }}>if</span>{" "}
              <span style={{ color: "#f59e0b" }}>employees</span>{" > 100 "}
              <span style={{ color: "#ef4444" }}>AND</span>{" "}
              <span style={{ color: "#f59e0b" }}>revenue</span>{" > €1M {"}"}
              <span style={{ color: "#ef4444" }}> pay</span>
              {" }"}
            </div>
            <div style={{ marginTop: 12, fontSize: 13, color: "#475569" }}>
              Both conditions must be true simultaneously. Either missing → free.
            </div>
          </div>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "repeat(5, 1fr)", gap: 10 }} className="stack-mobile">
          {PRICING.map((tier, i) => (
            <div key={i} className="pricing-card" style={{
              background: tier.highlight ? `${tier.color}08` : "#020810",
              border: `1px solid ${tier.highlight ? tier.color + "44" : "#0f1e30"}`,
              borderRadius: 16, padding: 20, position: "relative",
            }}>
              {tier.highlight && (
                <div style={{ position: "absolute", top: -11, left: "50%", transform: "translateX(-50%)", background: tier.color, color: "#020810", fontSize: 10, fontWeight: 800, padding: "3px 12px", borderRadius: 100, fontFamily: "'JetBrains Mono', monospace", letterSpacing: "0.08em", whiteSpace: "nowrap" }}>
                  MOST POPULAR
                </div>
              )}
              <div style={{ fontSize: 28, marginBottom: 10 }}>{tier.icon}</div>
              <div style={{ fontFamily: "'Syne', sans-serif", fontWeight: 700, fontSize: 14, color: "#f8fafc", marginBottom: 4 }}>{tier.name}</div>
              <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 10, color: "#475569", marginBottom: 14 }}>{tier.size}</div>
              <div style={{ marginBottom: 8 }}>
                <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 26, fontWeight: 800, color: tier.color }}>{tier.price}</span>
                <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 11, color: "#475569" }}>{tier.period}</span>
              </div>
              <div style={{ fontSize: 11, color: "#64748b", marginBottom: 16, lineHeight: 1.5 }}>{tier.rule}</div>
              <div style={{ borderTop: "1px solid #0f1e30", paddingTop: 14 }}>
                {tier.features.map((f, j) => (
                  <div key={j} style={{ display: "flex", gap: 7, marginBottom: 7, fontSize: 12, color: "#94a3b8", alignItems: "flex-start" }}>
                    <span style={{ color: tier.color, flexShrink: 0 }}>✓</span> {f}
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>

        {/* Footnote */}
        <div style={{ marginTop: 32, textAlign: "center", display: "flex", justifyContent: "center", gap: 32, flexWrap: "wrap" }}>
          {[
            { v: "~97%", l: "of users pay €0" },
            { v: "Jan 2030", l: "converts to Apache 2.0" },
            { v: "€0", l: "for individuals, always" },
          ].map((s, i) => (
            <div key={i} style={{ textAlign: "center" }}>
              <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 18, fontWeight: 700, color: "#00d4ff" }}>{s.v}</div>
              <div style={{ fontSize: 12, color: "#475569" }}>{s.l}</div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

function Vision() {
  const lines = [
    { text: "AI should be a human right.", accent: false },
    { text: "Not a subscription service.", accent: false },
    { text: "", accent: false },
    { text: "A student in Lagos with a 4-year-old laptop", accent: false },
    { text: "deserves the same tools as a developer in Amsterdam.", accent: false },
    { text: "", accent: false },
    { text: "Local compute is the equaliser.", accent: true },
    { text: "LokaFlow is the delivery mechanism.", accent: true },
    { text: "", accent: false },
    { text: "Enterprise pays.", accent: false },
    { text: "Because they can.", accent: false },
    { text: "Everyone else doesn't.", accent: false },
    { text: "Because they shouldn't have to.", accent: false },
  ];

  return (
    <section id="vision" style={{ padding: "120px 24px", background: "#020810", position: "relative", overflow: "hidden" }}>
      <div style={{ position: "absolute", inset: 0, background: "radial-gradient(ellipse at 30% 50%, rgba(0, 212, 255, 0.03), transparent 60%)", pointerEvents: "none" }} />
      <div style={{ maxWidth: 800, margin: "0 auto" }}>
        <div className="section-label" style={{ marginBottom: 32 }}>// MANIFESTO</div>
        <div style={{ fontFamily: "'Syne', sans-serif", fontWeight: 700, fontSize: "clamp(20px, 3.5vw, 36px)", lineHeight: 1.6, letterSpacing: "-0.01em" }}>
          {lines.map((line, i) => (
            <div key={i} style={{ color: line.accent ? "#00d4ff" : "#94a3b8", marginBottom: line.text === "" ? 20 : 4 }}>
              {line.text}
            </div>
          ))}
        </div>

        <div style={{ marginTop: 52, display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }} className="stack-mobile">
          {[
            { icon: "✗", text: "No query limits for free users", sub: "\"you've used your 100 messages\"", color: "#ef4444" },
            { icon: "✗", text: "No core features locked", sub: "privacy controls are never a paywall", color: "#ef4444" },
            { icon: "✗", text: "No user data sold", sub: "we don't have a data business", color: "#ef4444" },
            { icon: "✗", text: "No advertisements", sub: "ever, in any product", color: "#ef4444" },
          ].map((item, i) => (
            <div key={i} style={{ display: "flex", gap: 12, padding: 16, background: "#030b18", border: "1px solid #0f1e30", borderRadius: 12 }}>
              <span style={{ color: item.color, fontSize: 16, flexShrink: 0, marginTop: 2 }}>{item.icon}</span>
              <div>
                <div style={{ fontSize: 14, color: "#e2e8f0", fontWeight: 500, marginBottom: 3 }}>{item.text}</div>
                <div style={{ fontSize: 12, color: "#475569", fontFamily: "'JetBrains Mono', monospace" }}>"{item.sub}"</div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

function TrustBar() {
  const items = [
    { label: "License", value: "BUSL 1.1 → Apache 2.0 (2030)" },
    { label: "Company", value: "LearnHubPlay BV · KvK 97741825" },
    { label: "Jurisdiction", value: "Netherlands · EU" },
    { label: "Data", value: "Stays on your machine" },
    { label: "Tests", value: "115 passing · CI/CD" },
    { label: "Open Source", value: "January 1, 2030" },
  ];

  return (
    <div style={{ borderTop: "1px solid #0f1e30", borderBottom: "1px solid #0f1e30", padding: "18px 24px", background: "#030b18", overflow: "hidden" }}>
      <div style={{ display: "flex", gap: 48, justifyContent: "center", flexWrap: "wrap" }}>
        {items.map((item, i) => (
          <div key={i} style={{ display: "flex", gap: 8, alignItems: "center", flexShrink: 0 }}>
            <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 10, color: "#475569", letterSpacing: "0.1em" }}>{item.label.toUpperCase()}</span>
            <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 11, color: "#64748b" }}>→</span>
            <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 11, color: "#94a3b8" }}>{item.value}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function FinalCTA() {
  return (
    <section style={{ padding: "120px 24px", background: "#020810", textAlign: "center", position: "relative", overflow: "hidden" }}>
      <div style={{ position: "absolute", inset: 0, background: "radial-gradient(ellipse at 50% 50%, rgba(0, 212, 255, 0.06), transparent 65%)", pointerEvents: "none" }} />
      <div style={{ maxWidth: 700, margin: "0 auto", position: "relative" }}>
        <div className="section-label" style={{ marginBottom: 20, display: "block" }}>// GET STARTED</div>
        <h2 className="display-heading" style={{ fontSize: "clamp(36px, 5vw, 64px)", color: "#f8fafc", marginBottom: 20 }}>
          Stop paying for AI<br />
          <span style={{ background: "linear-gradient(135deg, #00d4ff, #00ff9d)", WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent", backgroundClip: "text" }}>
            you don't need to.
          </span>
        </h2>
        <p style={{ fontSize: 16, color: "#64748b", lineHeight: 1.7, marginBottom: 40, fontWeight: 300 }}>
          5 minutes to set up. Free API keys from Gemini, Groq, and xAI give you
          7.3 million tokens/day. Local Ollama handles the rest. Most users pay €0/month.
        </p>

        {/* Terminal-style quick start */}
        <div style={{ background: "#030b18", border: "1px solid #0f1e30", borderRadius: 14, padding: 24, marginBottom: 36, textAlign: "left" }}>
          <div style={{ display: "flex", gap: 6, marginBottom: 16 }}>
            {["#ef4444", "#f59e0b", "#22c55e"].map((c, i) => (
              <div key={i} style={{ width: 10, height: 10, borderRadius: "50%", background: c }} />
            ))}
            <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 11, color: "#475569", marginLeft: 8 }}>Terminal</span>
          </div>
          {[
            { prompt: "$", cmd: "git clone https://github.com/lokaflow/lokaflow.git" },
            { prompt: "$", cmd: "pnpm install && pnpm build" },
            { prompt: "$", cmd: "ollama pull qwen2.5:7b" },
            { prompt: "$", cmd: "npx lokaflow chat", result: "# Routes 74% locally. Saves 87%. Welcome to LokaFlow™" },
          ].map((line, i) => (
            <div key={i} style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 13, marginBottom: 8 }}>
              <span style={{ color: "#00ff9d" }}>{line.prompt} </span>
              <span style={{ color: "#e2e8f0" }}>{line.cmd}</span>
              {line.result && <div style={{ color: "#64748b", marginTop: 2 }}>{line.result}</div>}
            </div>
          ))}
        </div>

        <div style={{ display: "flex", gap: 12, justifyContent: "center", flexWrap: "wrap" }}>
          <button className="glow-btn" style={{ background: "linear-gradient(135deg, #00d4ff, #00ff9d)", border: "none", borderRadius: 10, padding: "14px 32px", fontSize: 15, fontWeight: 700, color: "#020810", cursor: "pointer", fontFamily: "'DM Sans', sans-serif" }}>
            Download LokaFlow Free →
          </button>
          <button style={{ background: "transparent", border: "1px solid #1e3a5f", borderRadius: 10, padding: "14px 32px", fontSize: 15, fontWeight: 500, color: "#94a3b8", cursor: "pointer", fontFamily: "'DM Sans', sans-serif", transition: "all 0.2s" }}
            onMouseEnter={e => { e.currentTarget.style.borderColor = "#00d4ff44"; e.currentTarget.style.color = "#e2e8f0"; }}
            onMouseLeave={e => { e.currentTarget.style.borderColor = "#1e3a5f"; e.currentTarget.style.color = "#94a3b8"; }}>
            Read Architecture Docs
          </button>
        </div>
      </div>
    </section>
  );
}

function Footer() {
  return (
    <footer style={{ background: "#020810", borderTop: "1px solid #0f1e30", padding: "40px 24px" }}>
      <div style={{ maxWidth: 1200, margin: "0 auto" }}>
        <div style={{ display: "grid", gridTemplateColumns: "2fr 1fr 1fr 1fr", gap: 40, marginBottom: 40 }} className="stack-mobile">
          <div>
            <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 16 }}>
              <div style={{ width: 28, height: 28, borderRadius: 8, background: "linear-gradient(135deg, #00d4ff, #00ff9d)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 14 }}>🌊</div>
              <span style={{ fontFamily: "'Syne', sans-serif", fontWeight: 800, fontSize: 16, color: "#f8fafc" }}>LokaFlow™</span>
            </div>
            <p style={{ fontSize: 13, color: "#475569", lineHeight: 1.7, maxWidth: 280 }}>
              Intelligent hybrid LLM orchestration. Local-first AI routing. Free for everyone who isn't a corporation.
            </p>
            <div style={{ marginTop: 16, fontFamily: "'JetBrains Mono', monospace", fontSize: 11, color: "#2d4a5a" }}>
              © 2026 LearnHubPlay BV · KvK 97741825
            </div>
          </div>
          {[
            { title: "Product", links: ["How It Works", "Product Family", "LokaGuard™", "Enterprise", "Pricing"] },
            { title: "Developers", links: ["Documentation", "GitHub", "Architecture", "API Reference", "CHANGELOG"] },
            { title: "Company", links: ["Vision", "License (BUSL)", "Contributing", "Security", "Contact"] },
          ].map((col, i) => (
            <div key={i}>
              <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 11, color: "#475569", letterSpacing: "0.1em", marginBottom: 16 }}>{col.title.toUpperCase()}</div>
              {col.links.map(link => (
                <div key={link} style={{ fontSize: 13, color: "#64748b", marginBottom: 10, cursor: "pointer", transition: "color 0.2s" }}
                  onMouseEnter={e => e.currentTarget.style.color = "#94a3b8"}
                  onMouseLeave={e => e.currentTarget.style.color = "#64748b"}>
                  {link}
                </div>
              ))}
            </div>
          ))}
        </div>
        <div style={{ borderTop: "1px solid #0f1e30", paddingTop: 20, display: "flex", justifyContent: "space-between", flexWrap: "wrap", gap: 12 }}>
          <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 11, color: "#2d4a5a" }}>
            BUSL 1.1 → Apache 2.0 on 2030-01-01 · lokaflow.com · lokaflow.nl
          </span>
          <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 11, color: "#2d4a5a" }}>
            AI for everyone. Waste for no one.
          </span>
        </div>
      </div>
    </footer>
  );
}

// ── Main App ──────────────────────────────────────────────────────────────────
export default function App() {
  return (
    <>
      <FontLoader />
      <div className="noise-overlay" />
      <Nav />
      <main>
        <Hero />
        <TrustBar />
        <TheProblem />
        <HowItWorks />
        <Products />
        <Architecture />
        <Pricing />
        <Vision />
        <FinalCTA />
      </main>
      <Footer />
    </>
  );
}
