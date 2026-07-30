import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { getUser } from '../auth';
import { API_BASE } from '../config';

const CWS_URL = 'https://chromewebstore.google.com/detail/recvault-beta/kcjifkhbafhlccnhamlmjlnpdpofdfom';

// ── Icons ──────────────────────────────────────────────────────────────────────
const IconLogo = ({ className = 'w-6 h-6' }) => (
  <svg viewBox="0 0 24 24" fill="none" style={{ width: 20, height: 20 }}>
    <rect x="2.5" y="4.5" width="19" height="13" rx="2.5" stroke="currentColor" strokeWidth="1.6" />
    <circle cx="12" cy="11" r="2.6" fill="#3b82f6" />
    <path d="M8 21h8" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
  </svg>
);

const IconChrome = () => (
  <svg viewBox="0 0 24 24" fill="none" style={{ width: 18, height: 18 }} stroke="currentColor" strokeWidth="1.6">
    <circle cx="12" cy="12" r="9.5" /><circle cx="12" cy="12" r="3.5" />
    <path d="M12 8.5h8.2M8.5 13.8 4.4 6.7M15.5 13.8l-4 7.6" />
  </svg>
);

// ── Nav ────────────────────────────────────────────────────────────────────────
function Nav({ onLogin }: { onLogin: () => void }) {
  return (
    <nav style={{ position: 'sticky', top: 0, zIndex: 40, backdropFilter: 'blur(12px)', background: 'rgba(0,0,0,0.6)', borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
      <div style={{ maxWidth: 1152, margin: '0 auto', padding: '0 1.5rem', height: 64, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <a href="/" style={{ display: 'flex', alignItems: 'center', gap: 10, textDecoration: 'none', color: '#fff' }}>
          <span style={{ display: 'grid', placeItems: 'center', width: 32, height: 32, borderRadius: 8, background: 'rgba(59,130,246,0.15)', color: '#60a5fa', outline: '1px solid rgba(59,130,246,0.3)' }}>
            <IconLogo />
          </span>
          <span style={{ fontWeight: 600, fontSize: 15, letterSpacing: '-0.01em' }}>
            RecVault <span style={{ fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.1em', padding: '2px 6px', borderRadius: 6, background: 'rgba(255,255,255,0.06)', color: 'rgba(255,255,255,0.6)', verticalAlign: 'middle' }}>Beta</span>
          </span>
        </a>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <button onClick={onLogin} style={{ height: 36, padding: '0 16px', borderRadius: 999, background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.1)', color: 'rgba(255,255,255,0.8)', fontSize: 14, fontWeight: 500, cursor: 'pointer' }}>
            Dashboard
          </button>
          <a href="#waitlist" style={{ height: 36, padding: '0 16px', borderRadius: 999, background: '#fff', color: '#000', fontSize: 14, fontWeight: 600, display: 'inline-flex', alignItems: 'center', textDecoration: 'none' }}>
            Join Waitlist
          </a>
        </div>
      </div>
    </nav>
  );
}

// ── Popup Mockup ───────────────────────────────────────────────────────────────
function PopupMockup() {
  const toggleStyle = (on: boolean) => ({
    width: 32, height: 18, borderRadius: 999, padding: 2,
    display: 'flex', alignItems: 'center', justifyContent: on ? 'flex-end' : 'flex-start',
    background: on ? '#3b82f6' : 'rgba(255,255,255,0.1)',
  });
  const sources = [
    { label: 'Tab', active: true, d: <rect x="3" y="6" width="18" height="13" rx="1.5" /> },
    { label: 'Window', d: <><rect x="3" y="4" width="18" height="16" rx="1.5" /><path d="M3 8h18" /></> },
    { label: 'Screen', d: <><rect x="2.5" y="4.5" width="19" height="13" rx="1.5" /><path d="M9 21h6M12 17v4" /></> },
  ];
  return (
    <div style={{ position: 'relative' }}>
      <div style={{ position: 'absolute', inset: -32, background: 'rgba(59,130,246,0.1)', filter: 'blur(48px)', borderRadius: 48, pointerEvents: 'none' }} />
      <div style={{ position: 'relative', width: 360, borderRadius: 16, background: '#0a0a0a', border: '1px solid rgba(255,255,255,0.08)', overflow: 'hidden', boxShadow: '0 25px 50px -12px rgba(0,0,0,0.5)' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0 16px', height: 40, borderBottom: '1px solid rgba(255,255,255,0.06)', background: 'rgba(255,255,255,0.02)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ display: 'grid', placeItems: 'center', width: 20, height: 20, borderRadius: 6, background: 'rgba(59,130,246,0.15)', color: '#60a5fa', outline: '1px solid rgba(59,130,246,0.3)' }}><IconLogo /></span>
            <span style={{ fontSize: 11, fontWeight: 500, letterSpacing: '0.02em', color: '#fff' }}>RecVault</span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 10, color: 'rgba(255,255,255,0.4)' }}>
            <span style={{ width: 6, height: 6, borderRadius: '50%', background: '#34d399' }} />
            Drive connected
          </div>
        </div>
        <div style={{ padding: 16 }}>
          <div style={{ fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.1em', color: 'rgba(255,255,255,0.4)', marginBottom: 8 }}>Source</div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8 }}>
            {sources.map((s, i) => (
              <div key={i} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 6, height: 64, borderRadius: 8, border: `1px solid ${s.active ? 'rgba(59,130,246,0.6)' : 'rgba(255,255,255,0.06)'}`, background: s.active ? 'rgba(59,130,246,0.1)' : 'rgba(255,255,255,0.02)', fontSize: 11, color: s.active ? '#fff' : 'rgba(255,255,255,0.55)' }}>
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" style={{ width: 16, height: 16 }}>{s.d}</svg>
                {s.label}
              </div>
            ))}
          </div>
          <div style={{ marginTop: 16, display: 'flex', flexDirection: 'column', gap: 8 }}>
            {[{ label: 'Microphone', sub: 'Default — MacBook Pro Mic', on: true }, { label: 'Camera bubble', sub: 'Off', on: false }, { label: 'Highlight clicks', sub: 'On', on: true }].map((t, i) => (
              <div key={i} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderRadius: 8, border: '1px solid rgba(255,255,255,0.06)', background: 'rgba(255,255,255,0.02)', padding: '8px 12px' }}>
                <div>
                  <div style={{ fontSize: 12, fontWeight: 500, color: '#fff' }}>{t.label}</div>
                  <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.45)' }}>{t.sub}</div>
                </div>
                <div style={toggleStyle(t.on)}><span style={{ width: 14, height: 14, borderRadius: '50%', background: '#fff' }} /></div>
              </div>
            ))}
          </div>
          <a href={CWS_URL} target="_blank" rel="noopener" style={{ marginTop: 16, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, width: '100%', height: 44, borderRadius: 12, background: '#3b82f6', color: '#fff', fontSize: 14, fontWeight: 500, textDecoration: 'none' }}>
            <span style={{ width: 10, height: 10, borderRadius: '50%', background: '#fff', animation: 'rv-pulse 1.6s ease-in-out infinite' }} />
            Start recording
          </a>
          <div style={{ marginTop: 16 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
              <span style={{ fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.1em', color: 'rgba(255,255,255,0.4)' }}>Recent</span>
              <span style={{ fontSize: 10, color: 'rgba(255,255,255,0.4)' }}>View all →</span>
            </div>
            {[{ t: 'Onboarding feedback for Maya', time: '2m ago', dur: '4:12' }, { t: 'Q3 roadmap walkthrough', time: 'Yesterday', dur: '12:48' }].map((r, i) => (
              <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '6px 8px', borderRadius: 6 }}>
                <div style={{ width: 32, height: 24, borderRadius: 4, background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.04)', display: 'grid', placeItems: 'center', fontSize: 9, color: 'rgba(255,255,255,0.4)', flexShrink: 0 }}>{r.dur}</div>
                <div style={{ minWidth: 0, flex: 1 }}>
                  <div style={{ fontSize: 12, fontWeight: 500, color: '#fff', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{r.t}</div>
                  <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.4)' }}>{r.time} · Link copied</div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Sections ───────────────────────────────────────────────────────────────────
function HowItWorks() {
  const steps = [
    { n: '01', title: 'Install & connect Google Drive', body: 'Add RecVault to Chrome and authorize the folder where recordings should live.', icon: <path d="M3 7l9-4 9 4-9 4-9-4z" />, icon2: <><path d="M3 12l9 4 9-4" /><path d="M3 17l9 4 9-4" /></> },
    { n: '02', title: 'Record your screen', body: 'Pick a tab, window, or full screen. Add mic, camera bubble, click highlights — hit record.', icon: <><circle cx="12" cy="12" r="4" /><circle cx="12" cy="12" r="9" /></> },
    { n: '03', title: 'Get a shareable link instantly', body: 'The moment you stop, your video uploads and a shareable link is already in your clipboard.', icon: <><path d="M10 13a5 5 0 007.5.5l3-3a5 5 0 00-7-7l-1.5 1.5" /><path d="M14 11a5 5 0 00-7.5-.5l-3 3a5 5 0 007 7L12 19" /></> },
  ];
  return (
    <section style={{ borderTop: '1px solid rgba(255,255,255,0.06)' }}>
      <div style={{ maxWidth: 1152, margin: '0 auto', padding: '6rem 1.5rem' }}>
        <div style={{ maxWidth: 480 }}>
          <div style={{ fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.18em', color: 'rgba(255,255,255,0.4)', marginBottom: 12 }}>How it works</div>
          <h2 style={{ fontSize: 'clamp(1.75rem, 4vw, 3rem)', fontWeight: 600, letterSpacing: '-0.02em', color: '#fff', margin: 0 }}>From record to shared link in three steps.</h2>
        </div>
        <div style={{ marginTop: 56, display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: 20 }}>
          {steps.map((s, i) => (
            <div key={i} style={{ borderRadius: 16, border: '1px solid rgba(255,255,255,0.08)', background: 'rgba(255,255,255,0.015)', padding: 24 }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 48 }}>
                <span style={{ display: 'grid', placeItems: 'center', width: 40, height: 40, borderRadius: 12, background: 'rgba(59,130,246,0.1)', color: '#60a5fa', outline: '1px solid rgba(59,130,246,0.2)' }}>
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" style={{ width: 20, height: 20 }}>{s.icon}{s.icon2}</svg>
                </span>
                <span style={{ fontSize: 11, letterSpacing: '0.2em', color: 'rgba(255,255,255,0.3)', fontWeight: 500 }}>{s.n}</span>
              </div>
              <h3 style={{ fontSize: 18, fontWeight: 500, letterSpacing: '-0.01em', color: '#fff', margin: '0 0 8px' }}>{s.title}</h3>
              <p style={{ fontSize: 14, color: 'rgba(255,255,255,0.55)', lineHeight: 1.6, margin: 0 }}>{s.body}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

function Features() {
  const items = [
    { title: 'Auto Google Drive upload', body: "Every recording streams straight into your Drive folder of choice — no manual save needed.", d: <><path d="M12 3v12" /><path d="M7 10l5 5 5-5" /><path d="M5 21h14" /></> },
    { title: 'Instant shareable link', body: "A link lands in your clipboard the moment you stop recording.", d: <><path d="M10 13a5 5 0 007.5.5l3-3a5 5 0 00-7-7l-1.5 1.5" /><path d="M14 11a5 5 0 00-7.5-.5l-3 3a5 5 0 007 7L12 19" /></> },
    { title: 'Team workspaces', body: "Share a folder, share defaults. Everyone's recordings land in the same place.", d: <><circle cx="9" cy="9" r="3.5" /><circle cx="17" cy="11" r="2.5" /><path d="M3 19c.7-3 3.4-4.5 6-4.5s5.3 1.5 6 4.5" /><path d="M15 19c.4-1.7 1.6-3 3-3" /></> },
    { title: 'No storage limits on Drive', body: "Use the Google Drive plan you already pay for. We never cap recording length or count.", d: <><ellipse cx="12" cy="6" rx="8" ry="3" /><path d="M4 6v6c0 1.7 3.6 3 8 3s8-1.3 8-3V6" /><path d="M4 12v6c0 1.7 3.6 3 8 3s8-1.3 8-3v-6" /></> },
    { title: 'Works in the background', body: "Switch tabs, take notes, hop apps. Recording keeps going without grabbing focus.", d: <><rect x="3" y="5" width="14" height="10" rx="1.5" /><rect x="7" y="9" width="14" height="10" rx="1.5" /></> },
    { title: 'Dashboard to manage recordings', body: "Search, rename, share, or delete — across every recording you've ever made.", d: <><rect x="3" y="4" width="18" height="16" rx="2" /><path d="M3 9h18" /><path d="M8 14h6" /><path d="M8 17h9" /></> },
  ];
  return (
    <section style={{ borderTop: '1px solid rgba(255,255,255,0.06)' }}>
      <div style={{ maxWidth: 1152, margin: '0 auto', padding: '6rem 1.5rem' }}>
        <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'flex-end', justifyContent: 'space-between', gap: 24, marginBottom: 56 }}>
          <div>
            <div style={{ fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.18em', color: 'rgba(255,255,255,0.4)', marginBottom: 12 }}>Features</div>
            <h2 style={{ fontSize: 'clamp(1.75rem, 4vw, 3rem)', fontWeight: 600, letterSpacing: '-0.02em', color: '#fff', margin: 0 }}>Everything you need. Nothing you don't.</h2>
          </div>
          <p style={{ maxWidth: 380, fontSize: 14, color: 'rgba(255,255,255,0.55)', margin: 0 }}>Built for async teams that already live in Google Drive.</p>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 20 }}>
          {items.map((f, i) => (
            <div key={i} style={{ borderRadius: 16, border: '1px solid rgba(255,255,255,0.08)', background: 'rgba(255,255,255,0.015)', padding: 24 }}>
              <span style={{ display: 'grid', placeItems: 'center', width: 40, height: 40, borderRadius: 12, background: 'rgba(255,255,255,0.04)', color: 'rgba(255,255,255,0.85)', outline: '1px solid rgba(255,255,255,0.1)', marginBottom: 20 }}>
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" style={{ width: 20, height: 20 }}>{f.d}</svg>
              </span>
              <h3 style={{ fontSize: 15, fontWeight: 500, letterSpacing: '-0.01em', color: '#fff', margin: '0 0 8px' }}>{f.title}</h3>
              <p style={{ fontSize: 14, color: 'rgba(255,255,255,0.55)', lineHeight: 1.6, margin: 0 }}>{f.body}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

function Pricing({ onLogin }: { onLogin: () => void }) {
  const Check = () => (
    <svg viewBox="0 0 24 24" style={{ width: 16, height: 16, color: '#60a5fa', flexShrink: 0 }} fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M5 12.5l4.5 4.5L19 7.5" />
    </svg>
  );
  const plans = [
    { label: 'Free', price: '$0', sub: 'Forever free. No card required.', features: ['500MB storage', '1 workspace', 'Up to 3 members', 'Instant shareable links', 'Recordings in your own Drive'], cta: { text: 'Add to Chrome', action: () => window.open(CWS_URL, '_blank') }, featured: false },
    { label: 'Pro', price: '$9', sub: 'Billed monthly. Cancel anytime.', features: ['50GB storage', '1 workspace', 'Unlimited members', 'Priority support', 'Everything in Free'], cta: { text: 'Get Started', action: () => document.getElementById('waitlist-section')?.scrollIntoView({ behavior: 'smooth' }) }, featured: true },
    { label: 'Team', price: '$29', sub: 'For growing teams.', features: ['200GB storage', '5 workspaces', 'Unlimited members', 'Admin dashboard', 'Everything in Pro'], cta: { text: 'Contact Us', action: () => { window.location.href = 'mailto:karthik.upadhyay98@gmail.com'; } }, featured: false },
  ];
  return (
    <section id="pricing" style={{ borderTop: '1px solid rgba(255,255,255,0.06)' }}>
      <div style={{ maxWidth: 1152, margin: '0 auto', padding: '6rem 1.5rem' }}>
        <div style={{ textAlign: 'center', maxWidth: 520, margin: '0 auto 56px' }}>
          <div style={{ fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.18em', color: 'rgba(255,255,255,0.4)', marginBottom: 12 }}>Pricing</div>
          <h2 style={{ fontSize: 'clamp(1.75rem, 4vw, 3rem)', fontWeight: 600, letterSpacing: '-0.02em', color: '#fff', margin: '0 0 20px' }}>Simple, honest pricing</h2>
          <p style={{ fontSize: 15, color: 'rgba(255,255,255,0.55)', lineHeight: 1.6, margin: 0 }}>Your recordings always live in your Google Drive. Storage costs us nothing on the free tier.</p>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: 24, maxWidth: 960, margin: '0 auto' }}>
          {plans.map((p, i) => (
            <div key={i} style={{ position: 'relative' }}>
              {p.featured && (
                <div style={{ position: 'absolute', top: -12, left: '50%', transform: 'translateX(-50%)', zIndex: 1 }}>
                  <span style={{ display: 'inline-flex', padding: '4px 12px', borderRadius: 999, background: '#3b82f6', color: '#fff', fontSize: 11, fontWeight: 700, boxShadow: '0 6px 24px -6px rgba(59,130,246,0.7)' }}>Most Popular</span>
                </div>
              )}
              <div style={{ display: 'flex', flexDirection: 'column', height: '100%', borderRadius: 16, padding: 28, background: '#09090B', border: p.featured ? '1px solid #3b82f6' : '1px solid rgba(255,255,255,0.08)', boxShadow: p.featured ? '0 0 0 1px rgba(59,130,246,0.25), 0 20px 60px -30px rgba(59,130,246,0.55)' : 'none' }}>
                <div style={{ flex: 1 }}>
                  <span style={{ display: 'inline-flex', padding: '4px 10px', borderRadius: 999, background: 'rgba(255,255,255,0.06)', color: 'rgba(255,255,255,0.65)', fontSize: 11, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em' }}>{p.label}</span>
                  <div style={{ marginTop: 20, display: 'flex', alignItems: 'baseline', gap: 6 }}>
                    <span style={{ fontSize: 48, fontWeight: 600, letterSpacing: '-0.02em', color: '#fff', lineHeight: 1 }}>{p.price}</span>
                    <span style={{ fontSize: 14, color: 'rgba(255,255,255,0.45)' }}>/month</span>
                  </div>
                  <p style={{ marginTop: 12, fontSize: 14, color: 'rgba(255,255,255,0.55)' }}>{p.sub}</p>
                  <div style={{ margin: '24px 0', height: 1, background: 'rgba(255,255,255,0.06)' }} />
                  <ul style={{ listStyle: 'none', padding: 0, margin: 0, display: 'flex', flexDirection: 'column', gap: 12 }}>
                    {p.features.map((f, j) => (
                      <li key={j} style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: 14, color: 'rgba(255,255,255,0.8)' }}>
                        <Check />{f}
                      </li>
                    ))}
                  </ul>
                </div>
                <button onClick={p.cta.action} style={{ marginTop: 32, width: '100%', height: 44, borderRadius: 999, border: p.featured ? 'none' : '1px solid rgba(255,255,255,0.15)', background: p.featured ? '#3b82f6' : 'transparent', color: '#fff', fontSize: 14, fontWeight: 600, cursor: 'pointer' }}>
                  {p.cta.text}
                </button>
              </div>
            </div>
          ))}
        </div>
        <p style={{ marginTop: 40, textAlign: 'center', fontSize: 12, color: 'rgba(255,255,255,0.45)' }}>All plans include Google Drive as your storage layer. We never host or access your video content.</p>
      </div>
    </section>
  );
}

function Waitlist() {
  const [email, setEmail] = useState('');
  const [state, setState] = useState<'idle' | 'submitting' | 'success' | 'error'>('idle');
  const [errMsg, setErrMsg] = useState('');

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = email.trim();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmed)) { setErrMsg('Please enter a valid email.'); return; }
    setState('submitting'); setErrMsg('');
    try {
      const res = await fetch(`${API_BASE}/waitlist`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: trimmed }) });
      if (!res.ok) throw new Error();
      setState('success');
    } catch { setState('error'); setErrMsg('Something went wrong. Try again?'); }
  };

  return (
    <section id="waitlist-section" style={{ borderTop: '1px solid rgba(255,255,255,0.06)' }}>
      <div style={{ maxWidth: 600, margin: '0 auto', padding: '7rem 1.5rem', textAlign: 'center' }}>
        <div style={{ display: 'inline-flex', alignItems: 'center', gap: 8, padding: '4px 12px', borderRadius: 999, border: '1px solid rgba(255,255,255,0.1)', background: 'rgba(255,255,255,0.03)', fontSize: 12, color: 'rgba(255,255,255,0.7)', marginBottom: 24 }}>
          <span style={{ width: 6, height: 6, borderRadius: '50%', background: '#60a5fa', animation: 'rv-pulse 1.6s ease-in-out infinite' }} />
          Beta access — limited spots
        </div>
        <h2 style={{ fontSize: 'clamp(1.75rem, 4vw, 3rem)', fontWeight: 600, letterSpacing: '-0.02em', color: '#fff', margin: '0 0 16px' }}>Join the waitlist.</h2>
        <p style={{ fontSize: 15, color: 'rgba(255,255,255,0.55)', margin: '0 0 40px' }}>Drop your email and we'll send an invite as soon as a beta seat opens up.</p>
        {state !== 'success' ? (
          <form onSubmit={submit} style={{ maxWidth: 400, margin: '0 auto' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: 6, borderRadius: 999, border: '1px solid rgba(255,255,255,0.1)', background: 'rgba(255,255,255,0.03)' }}>
              <input type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="you@company.com" disabled={state === 'submitting'} required
                style={{ flex: 1, background: 'transparent', border: 'none', outline: 'none', padding: '0 16px', height: 40, fontSize: 14, color: '#fff' }} />
              <button type="submit" disabled={state === 'submitting'}
                style={{ height: 40, padding: '0 20px', borderRadius: 999, background: '#3b82f6', border: 'none', color: '#fff', fontSize: 14, fontWeight: 600, cursor: 'pointer', opacity: state === 'submitting' ? 0.6 : 1, whiteSpace: 'nowrap' }}>
                {state === 'submitting' ? 'Joining…' : 'Join Waitlist'}
              </button>
            </div>
            {errMsg && <p style={{ marginTop: 12, fontSize: 12, color: '#f87171' }}>{errMsg}</p>}
            <p style={{ marginTop: 12, fontSize: 12, color: 'rgba(255,255,255,0.4)' }}>No spam. One email when your seat is ready.</p>
          </form>
        ) : (
          <div style={{ borderRadius: 16, border: '1px solid rgba(255,255,255,0.08)', background: 'rgba(255,255,255,0.02)', padding: '28px 24px' }}>
            <div style={{ width: 40, height: 40, borderRadius: '50%', background: 'rgba(59,130,246,0.15)', color: '#60a5fa', outline: '1px solid rgba(59,130,246,0.3)', display: 'grid', placeItems: 'center', margin: '0 auto 12px' }}>
              <svg viewBox="0 0 24 24" style={{ width: 20, height: 20 }} fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12.5l4.5 4.5L19 7.5" /></svg>
            </div>
            <div style={{ fontSize: 18, fontWeight: 600, color: '#fff', marginBottom: 8 }}>You're on the list!</div>
            <p style={{ fontSize: 14, color: 'rgba(255,255,255,0.55)', margin: 0 }}>We'll email <strong style={{ color: 'rgba(255,255,255,0.8)' }}>{email}</strong> as soon as your beta seat is ready.</p>
          </div>
        )}
      </div>
    </section>
  );
}

function Footer() {
  return (
    <footer style={{ borderTop: '1px solid rgba(255,255,255,0.06)' }}>
      <div style={{ maxWidth: 1152, margin: '0 auto', padding: '2.5rem 1.5rem', display: 'flex', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: 20 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <span style={{ display: 'grid', placeItems: 'center', width: 28, height: 28, borderRadius: 8, background: 'rgba(59,130,246,0.15)', color: '#60a5fa', outline: '1px solid rgba(59,130,246,0.3)' }}><IconLogo /></span>
          <span style={{ fontWeight: 600, fontSize: 14, color: '#fff' }}>RecVault</span>
          <span style={{ fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.1em', padding: '2px 6px', borderRadius: 6, background: 'rgba(255,255,255,0.06)', color: 'rgba(255,255,255,0.55)' }}>Beta</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 24, fontSize: 14, color: 'rgba(255,255,255,0.55)' }}>
          <a href="/privacy" style={{ color: 'inherit', textDecoration: 'none' }} onMouseEnter={e => (e.currentTarget.style.color = '#fff')} onMouseLeave={e => (e.currentTarget.style.color = 'rgba(255,255,255,0.55)')}>Privacy Policy</a>
          <span style={{ width: 1, height: 16, background: 'rgba(255,255,255,0.1)' }} />
          <span>Built with <span style={{ color: '#f87171' }}>♥</span> for async teams</span>
        </div>
      </div>
    </footer>
  );
}

// ── Main export ────────────────────────────────────────────────────────────────
export function LandingPage() {
  const navigate = useNavigate();
  const user = getUser();

  // Already logged in → go straight to library
  if (user) { navigate('/library', { replace: true }); return null; }

  const goLogin = () => navigate('/login');

  return (
    <div style={{ background: '#000', color: '#fff', minHeight: '100vh', fontFamily: "'Inter', ui-sans-serif, system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif" }}>
      <style>{`
        @keyframes rv-pulse { 0%,100%{opacity:1;transform:scale(1)} 50%{opacity:0.55;transform:scale(0.9)} }
        ::selection { background: rgba(59,130,246,0.4); }
      `}</style>

      <Nav onLogin={goLogin} />

      {/* Hero */}
      <section style={{ background: 'radial-gradient(ellipse 80% 60% at 50% -10%, rgba(59,130,246,0.18), transparent 60%)', backgroundImage: `radial-gradient(ellipse 80% 60% at 50% -10%, rgba(59,130,246,0.18), transparent 60%), linear-gradient(rgba(255,255,255,0.04) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.04) 1px, transparent 1px)`, backgroundSize: 'auto, 48px 48px, 48px 48px' }}>
        <div style={{ maxWidth: 1152, margin: '0 auto', padding: '5rem 1.5rem 6rem' }}>
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', textAlign: 'center' }}>
            <div style={{ display: 'inline-flex', alignItems: 'center', gap: 8, padding: '4px 12px', borderRadius: 999, border: '1px solid rgba(255,255,255,0.1)', background: 'rgba(255,255,255,0.03)', fontSize: 12, color: 'rgba(255,255,255,0.7)', marginBottom: 28 }}>
              <span style={{ width: 6, height: 6, borderRadius: '50%', background: '#60a5fa', animation: 'rv-pulse 1.6s ease-in-out infinite' }} />
              Now in private beta · Chrome extension
            </div>
            <h1 style={{ fontSize: 'clamp(2.5rem, 7vw, 4.5rem)', fontWeight: 600, letterSpacing: '-0.02em', lineHeight: 1.05, maxWidth: 800, margin: '0 0 24px' }}>
              Record. Upload. Share.<br /><span style={{ color: 'rgba(255,255,255,0.4)' }}>Instantly.</span>
            </h1>
            <p style={{ fontSize: 'clamp(1rem, 2vw, 1.125rem)', color: 'rgba(255,255,255,0.6)', lineHeight: 1.6, maxWidth: 560, margin: '0 0 36px' }}>
              Screen recordings saved to your Google Drive automatically, with a shareable link the moment you stop.
            </p>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12, justifyContent: 'center', marginBottom: 16 }}>
              <a href={CWS_URL} target="_blank" rel="noopener" style={{ display: 'inline-flex', alignItems: 'center', gap: 8, height: 44, padding: '0 20px', borderRadius: 999, background: '#3b82f6', color: '#fff', fontSize: 14, fontWeight: 600, textDecoration: 'none', boxShadow: '0 8px 30px -8px rgba(59,130,246,0.6)' }}>
                <IconChrome />Add to Chrome — it's free
              </a>
              <a href="#waitlist-section" style={{ display: 'inline-flex', alignItems: 'center', height: 44, padding: '0 20px', borderRadius: 999, background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.1)', color: '#fff', fontSize: 14, fontWeight: 500, textDecoration: 'none' }}>
                Join Waitlist
              </a>
            </div>
            <p style={{ fontSize: 12, color: 'rgba(255,255,255,0.4)' }}>No watermarks · Free during beta · Uses your own Drive storage</p>
          </div>
          <div style={{ marginTop: 64, display: 'flex', justifyContent: 'center' }}>
            <PopupMockup />
          </div>
        </div>
      </section>

      <HowItWorks />
      <Features />
      <Pricing onLogin={goLogin} />
      <Waitlist />
      <Footer />
    </div>
  );
}
