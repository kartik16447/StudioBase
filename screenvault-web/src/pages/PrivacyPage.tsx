import React from 'react';
import { Link } from 'react-router-dom';

export function PrivacyPage() {
  return (
    <div style={{ background: '#000', minHeight: '100vh', color: '#fff', fontFamily: 'Inter, ui-sans-serif, system-ui, -apple-system, sans-serif' }}>
      <div style={{ maxWidth: '720px', margin: '0 auto', padding: '5rem 1.5rem', lineHeight: 1.7, color: 'rgba(255,255,255,0.8)' }}>
        <Link to="/" style={{ color: '#FB923C', textDecoration: 'none', fontSize: '0.875rem', display: 'inline-block', marginBottom: '2.5rem' }}>
          ← Back to Foyr Screen Recorder
        </Link>
        <h1 style={{ fontSize: '1.875rem', fontWeight: 600, color: '#fff', marginBottom: '0.5rem' }}>Privacy Policy</h1>
        <p style={{ fontSize: '0.875rem', color: 'rgba(255,255,255,0.4)', marginBottom: '2.5rem' }}>Last updated: May 2026</p>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '2rem', fontSize: '0.9375rem' }}>
          <section>
            <h2 style={{ fontSize: '1.0625rem', fontWeight: 500, color: '#fff', marginBottom: '0.5rem' }}>What we collect</h2>
            <p>Foyr Screen Recorder collects your Google account email and name for authentication. Recordings are stored in our own Cloudflare R2 storage, associated with your workspace.</p>
          </section>

          <section>
            <h2 style={{ fontSize: '1.0625rem', fontWeight: 500, color: '#fff', marginBottom: '0.5rem' }}>How we use your data</h2>
            <ul style={{ paddingLeft: '1.25rem', color: 'rgba(255,255,255,0.7)', display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
              <li>Authentication via Google OAuth</li>
              <li>Generating and serving shareable recording links</li>
              <li>Workspace membership and collaboration features</li>
              <li>Product analytics (anonymous usage metrics)</li>
            </ul>
          </section>

          <section>
            <h2 style={{ fontSize: '1.0625rem', fontWeight: 500, color: '#fff', marginBottom: '0.5rem' }}>Your Google account data</h2>
            <p>Foyr Screen Recorder uses Google Sign-In only to verify your identity — we request the <code style={{ color: '#93c5fd', fontSize: '0.875rem' }}>email</code> and <code style={{ color: '#93c5fd', fontSize: '0.875rem' }}>profile</code> scopes only, and do not access your Google Drive, Gmail, or any other Google data.</p>
          </section>

          <section>
            <h2 style={{ fontSize: '1.0625rem', fontWeight: 500, color: '#fff', marginBottom: '0.5rem' }}>Data retention</h2>
            <p>You can delete recordings from your dashboard at any time. Deleting a recording removes our database reference and permanently deletes the underlying file from our storage. Waitlist emails are retained until the waitlist is closed or you request removal.</p>
          </section>

          <section>
            <h2 style={{ fontSize: '1.0625rem', fontWeight: 500, color: '#fff', marginBottom: '0.5rem' }}>Third parties</h2>
            <p>We use Cloudflare for infrastructure (Workers, D1 database, KV). No video data is shared with any third party. We do not sell your data.</p>
          </section>

          <section>
            <h2 style={{ fontSize: '1.0625rem', fontWeight: 500, color: '#fff', marginBottom: '0.5rem' }}>Contact</h2>
            <p>Questions? Email <a href="mailto:karthik.upadhyay98@gmail.com" style={{ color: '#FB923C', textDecoration: 'none' }}>karthik.upadhyay98@gmail.com</a></p>
          </section>
        </div>
      </div>
    </div>
  );
}
