// StudioBase Landing Page — production app

const { useState, useEffect } = React;

// ── Reveal-on-scroll ──────────────────────────────────────
function useReveal() {
  useEffect(() => {
    const els = document.querySelectorAll(".reveal");
    const io = new IntersectionObserver(
      (entries) => entries.forEach((e) => {
        if (e.isIntersecting) { e.target.classList.add("in"); io.unobserve(e.target); }
      }),
      { threshold: 0.12, rootMargin: "0px 0px -60px 0px" }
    );
    els.forEach((el) => io.observe(el));
    return () => io.disconnect();
  }, []);
}

// ── Nav ───────────────────────────────────────────────────
function Nav({ onWaitlist }) {
  const [scrolled, setScrolled] = useState(false);
  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 8);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  return (
    <nav className={"nav" + (scrolled ? " scrolled" : "")} role="navigation" aria-label="Main">
      <div className="nav-inner">
        <a href="#" className="logo" aria-label="StudioBase home">
          <span className="logo-mark" aria-hidden="true">S</span>
          <span>StudioBase</span>
        </a>
        <div className="nav-links">
          <a href="#features">Features</a>
          <a href="#pricing">Pricing</a>
          <a href="/app">Log in</a>
        </div>
        <div className="nav-right">
          <a href="/app" className="btn btn-ghost-dark">Log in</a>
          <button className="btn btn-primary" onClick={onWaitlist}>Join Waitlist</button>
        </div>
      </div>
    </nav>
  );
}

// ── CTA Row (reusable) ────────────────────────────────────
function CTARow({ id = "cta", label = "Join Batch 1 Waitlist" }) {
  const [email, setEmail] = useState("");
  const [submitted, setSubmitted] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError("");
    const trimmed = email.trim();
    if (!trimmed) return;
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmed)) {
      setError("Please enter a valid email address.");
      return;
    }
    setLoading(true);
    try {
      const res = await fetch("/v1/waitlist", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: trimmed, source: id }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setError(data.error || "Something went wrong — please try again.");
        return;
      }
      setSubmitted(true);
    } catch {
      setError("Network error — please try again.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <form className="cta-row" onSubmit={handleSubmit} aria-live="polite" noValidate>
      {!submitted ? (
        <>
          <input
            id={id}
            className="field-dark"
            type="email"
            required
            placeholder="you@company.com"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            aria-label="Work email address"
          />
          <button className="btn btn-primary btn-lg" type="submit" disabled={loading} aria-busy={loading}>
            {loading ? "Joining…" : <>{label} <ArrowRight size={16} /></>}
          </button>
        </>
      ) : (
        <div style={{ display:"flex", alignItems:"center", gap:10, color:"rgba(255,255,255,0.80)", fontSize:15 }}>
          <span style={{
            width:32, height:32, borderRadius:"50%",
            background:"rgba(52,199,89,0.15)", border:"1px solid rgba(52,199,89,0.30)",
            display:"grid", placeItems:"center",
          }}>
            <Check size={16} style={{ color:"var(--success)" }} />
          </span>
          You're on the list — we'll be in touch.
        </div>
      )}
      {error && <p style={{ color:"var(--danger)", fontSize:13, marginTop:8, width:"100%", textAlign:"center" }}>{error}</p>}
    </form>
  );
}

// ── Video placeholder ─────────────────────────────────────
function VideoStage() {
  return (
    <div className="video-wrap" role="img" aria-label="Product demo placeholder">
      <div className="video-card">
        <div className="browser-bar" aria-hidden="true">
          <span className="dot r" /><span className="dot y" /><span className="dot g" />
          <span className="browser-url">studiobase.app / capture / ship-onboarding</span>
        </div>
        <div className="video-body">
          <div className="video-stage">
            <div className="stripe" aria-hidden="true" />
            <div className="video-center">
              <div>
                <div className="play" aria-hidden="true">
                  <Play size={28} style={{ color:"#fff" }} />
                </div>
                <div className="cap">DEMO COMING SOON</div>
              </div>
            </div>
            <div className="video-meta" aria-hidden="true">
              <span className="pulse">● REC 00:02:14</span>
              <div className="timeline">
                {[true,true,true,true,false,false,false,false].map((a, i) => (
                  <span key={i} className={a ? "active" : ""} />
                ))}
              </div>
              <span>1920×1080 · VP9 · 60fps</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Hero ──────────────────────────────────────────────────
function Hero({ onWaitlist }) {
  return (
    <section className="hero container">
      <div className="reveal in" style={{ display:"flex", flexDirection:"column", alignItems:"center", gap:8 }}>
        <span className="pill">
          <span className="pill-dot" aria-hidden="true" />
          Early Access · 100 Workspaces
        </span>
        <span className="pill pill-ghost">
          SOP + Recording sharing — always free
        </span>
      </div>

      <h1 className="reveal in d1">
        One capture.<br />
        <span className="gradient-text">Three pixel-perfect formats.</span><br />
        Zero per-seat fees.
      </h1>

      <p className="hero-sub reveal in d2">
        Generate a cinematic HD walkthrough, a formatted SOP document, and a raw screen
        recording simultaneously — from a single browser capture. Every output has its
        own public share link, free to view forever.
      </p>

      <div className="reveal in d3">
        <CTARow id="hero-cta" />
        <p className="microcopy">Currently accepting 100 workspaces. No credit card required.</p>
      </div>

      <VideoStage />
    </section>
  );
}

// ── Enemy ─────────────────────────────────────────────────
function Enemy() {
  useReveal();
  const oldItems = [
    "$30/month per seat, per tool",
    "Screen recorder + screenshot app + PDF editor",
    "Every UI update breaks every screenshot",
    "Knowledge locked behind login walls",
  ];
  const newItems = [
    "Unlimited free seats, forever",
    "Transparent credit ledger — pay per export only",
    "One recording → cinematic video + SOP guide + raw recording",
    "Three public share formats — SOP and recording always free to view",
    "Public share link, no viewer login required",
  ];
  return (
    <section className="section enemy" aria-label="Comparison">
      <div className="container">
        <div className="section-head reveal">
          <span className="label">The Math</span>
          <h2>You are paying a tax<br />just to share knowledge.</h2>
          <p>
            Most documentation stacks charge you per seat, per tool — and break the
            moment your product UI shifts a pixel.
          </p>
        </div>
        <div className="enemy-grid">
          <div className="compare-card old reveal">
            <span className="label label-danger">The Old Way</span>
            <h3>Per-seat sprawl</h3>
            <ul>
              {oldItems.map((t, i) => (
                <li key={i}>
                  <XCircle size={20} style={{ color:"var(--danger)" }} aria-hidden="true" />
                  <span>{t}</span>
                </li>
              ))}
            </ul>
          </div>
          <div className="compare-card new reveal d1">
            <span className="label label-primary">StudioBase</span>
            <h3>Capture once. Ship everywhere.</h3>
            <ul>
              {newItems.map((t, i) => (
                <li key={i}>
                  <Check size={20} style={{ color:"var(--primary)" }} aria-hidden="true" />
                  <span>{t}</span>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </div>
    </section>
  );
}

// ── Bento ─────────────────────────────────────────────────
function Bento() {
  useReveal();

  const canvasLayers = [
    ["Background",    1],
    ["UI capture",    2],
    ["Cursor trail",  3],
    ["Border shimmer",4],
    ["Camera spring", 5],
    ["Caption track", 6],
    ["Zoom mask",     7],
    ["Composite",     8],
    ["VP9 encode",    9],
  ];

  return (
    <section id="features" className="section" aria-label="Features">
      <div className="container">
        <div className="section-head reveal">
          <span className="label">The Engine Room</span>
          <h2>Built for teams that ship faster than their docs can keep up.</h2>
        </div>

        <div className="bento" role="list">

          {/* Wide — Non-Destructive Editing */}
          <div className="bento-card wide reveal" role="listitem">
            <div className="icon-tile icon-primary" aria-hidden="true"><Layers size={22} /></div>
            <h3>Non-Destructive Editing</h3>
            <p>
              Made a mistake at step 8? Hide it in one click — it disappears from your SOP,
              your share page, and the next video export. Your original recording is always
              intact in storage. Nothing is ever permanently deleted.
            </p>
            <div className="layers-vis" aria-label="Step list example" role="list">
              <div className="row" role="listitem">
                <span className="step" aria-hidden="true">07</span>
                <span>Open billing settings</span>
                <span className="pill-mini">kept</span>
              </div>
              <div className="row del" role="listitem" aria-label="Step 08 hidden">
                <span className="step" aria-hidden="true">08</span>
                <span>Click the wrong tab</span>
                <span className="pill-mini" style={{ background:"rgba(255,69,58,0.15)", color:"var(--danger)" }}>hidden</span>
              </div>
              <div className="row" role="listitem">
                <span className="step" aria-hidden="true">09</span>
                <span>Add a payment method</span>
                <span className="pill-mini">kept</span>
              </div>
            </div>
          </div>

          {/* SOC2 */}
          <div className="bento-card reveal d1" role="listitem">
            <div className="icon-tile icon-success" aria-hidden="true"><Shield size={22} /></div>
            <h3>SOC2-Ready Governance</h3>
            <p>
              Cloudflare D1 with Policy-Based Access Control. Every privileged action
              emits a queryable audit log. Export 90-day JSONL evidence in one call.
            </p>
            <div className="audit-vis" aria-label="Audit log example" role="log">
              <div className="line"><span className="ts">14:02:18</span><span>admin.invite · sarah@</span></div>
              <div className="line"><span className="ts">14:02:33</span><span>capture.export · v_4f2a</span></div>
              <div className="line"><span className="ts">14:03:01</span><span>role.update · viewer→admin</span></div>
              <span className="tag">JSONL · 90d</span>
            </div>
          </div>

          {/* Share Controls */}
          <div className="bento-card reveal d2" role="listitem">
            <div className="icon-tile icon-cyan" aria-hidden="true"><Share2 size={22} /></div>
            <h3>Granular Share Controls</h3>
            <p>
              Publish a SOP guide, a raw screen recording, and a cinematic walkthrough —
              each with its own on/off toggle. Share only what you want. Viewers never need a login.
            </p>
            <div className="share-vis" aria-label="Share format controls">
              <div className="share-row on">
                <span className="tog" aria-hidden="true"><span className="knob" /></span>
                <span className="share-label">Step Guide</span>
                <span className="share-cost free">Free</span>
              </div>
              <div className="share-row on">
                <span className="tog" aria-hidden="true"><span className="knob" /></span>
                <span className="share-label">Raw Recording</span>
                <span className="share-cost free">Free</span>
              </div>
              <div className="share-row off">
                <span className="tog" aria-hidden="true"><span className="knob" /></span>
                <span className="share-label">Cinematic</span>
                <span className="share-cost paid">1 credit · Unlock</span>
              </div>
            </div>
          </div>

          {/* Canvas Engine */}
          <div className="bento-card reveal d3" role="listitem">
            <div className="icon-tile icon-violet" aria-hidden="true"><Cpu size={22} /></div>
            <h3>The Headless Canvas Engine</h3>
            <p>
              No DOM captures. No headless browser. We compute cinematic camera springs
              and UI compositing directly in Canvas — 9 layers, 60fps, VP9.
            </p>
            <div className="canvas-vis" aria-label="Canvas rendering layers" role="list">
              {canvasLayers.map(([name, idx]) => (
                <div className="layer" key={idx} role="listitem">
                  <span className="sw" style={{ opacity: 0.3 + idx * 0.07 }} aria-hidden="true" />
                  <span>{name}</span>
                  <span className="num" aria-hidden="true">L{String(idx).padStart(2,"0")}</span>
                </div>
              ))}
            </div>
          </div>

        </div>
      </div>
    </section>
  );
}

// ── Pricing Teaser ────────────────────────────────────────
function PricingTeaser() {
  useReveal();
  return (
    <section id="pricing" className="section" style={{ paddingTop:40 }} aria-label="Pricing">
      <div className="container">
        <div className="pricing-card reveal">
          <span className="label label-primary">The Credit Ledger</span>
          <h2>Stop paying for empty seats.</h2>
          <p>
            Every workspace starts with 10 free credits. Your entire team joins free —
            no seat count, no per-user invoice. Your SOP guide and raw recording share
            links are always free to view. Credits only burn for three things:
          </p>
          <ul className="credit-list">
            <li>
              <span className="credit-cost">1 credit</span>
              <span className="credit-arrow" aria-hidden="true">→</span>
              <span>Unlock the cinematic player <em>(one-time per session)</em></span>
            </li>
            <li>
              <span className="credit-cost">1 credit</span>
              <span className="credit-arrow" aria-hidden="true">→</span>
              <span>Generate an AI voiceover for a step</span>
            </li>
            <li>
              <span className="credit-cost">1 credit</span>
              <span className="credit-arrow" aria-hidden="true">→</span>
              <span>Run the AI pipeline <em>(SOP text generation)</em></span>
            </li>
          </ul>
          <div className="stat-row" aria-label="Key metrics">
            <span className="stat-pill"><Sparkle size={14} aria-hidden="true" /> 10 free credits</span>
            <span className="stat-pill"><Users size={14} aria-hidden="true" /> Unlimited seats</span>
            <span className="stat-pill"><Share2 size={14} aria-hidden="true" /> SOP + Recording sharing free</span>
          </div>
          <a href="#pricing" className="btn btn-primary btn-lg">
            See Full Pricing <ArrowRight size={16} aria-hidden="true" />
          </a>
        </div>
      </div>
    </section>
  );
}

// ── Footer ────────────────────────────────────────────────
function Footer() {
  useReveal();
  return (
    <footer>
      <div className="container">
        <div className="reveal">
          <h2>Batch 1 is opening soon.</h2>
          <p className="sub">First 100 workspaces lock in founding credit rates.</p>
          <CTARow id="footer-cta" label="Request Access" />
        </div>
        <nav className="footer-links" aria-label="Footer">
          <a href="#">Privacy</a>
          <span aria-hidden="true" style={{ opacity:0.3 }}>·</span>
          <a href="#">Terms</a>
          <span aria-hidden="true" style={{ opacity:0.3 }}>·</span>
          <a href="mailto:changelog@studiobase.app">changelog@studiobase.app</a>
        </nav>
        <p className="footer-bar">
          Built on Cloudflare Workers · D1 · R2 · Workers AI · Queue
        </p>
      </div>
    </footer>
  );
}

// ── App ───────────────────────────────────────────────────
function App() {
  const onWaitlist = () => {
    const el = document.getElementById("hero-cta");
    if (!el) return;
    const top = window.scrollY + el.getBoundingClientRect().top - 120;
    window.scrollTo({ top, behavior:"smooth" });
    setTimeout(() => el.focus(), 500);
  };

  return (
    <>
      <Nav onWaitlist={onWaitlist} />
      <main>
        <Hero onWaitlist={onWaitlist} />
        <Enemy />
        <Bento />
        <PricingTeaser />
      </main>
      <Footer />
    </>
  );
}

ReactDOM.createRoot(document.getElementById("root")).render(<App />);
