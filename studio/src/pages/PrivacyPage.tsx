import React from 'react';

export function PrivacyPage() {
  return (
    <div className="min-h-screen bg-white">
      {/* Header */}
      <header className="border-b border-gray-100">
        <div className="max-w-3xl mx-auto px-6 py-5 flex items-center justify-between">
          <a href="/" className="flex items-center gap-2 text-gray-900 font-semibold text-lg hover:opacity-80 transition-opacity">
            <svg width="28" height="28" viewBox="0 0 32 32" fill="none">
              <rect width="32" height="32" rx="8" fill="#5E5CE6"/>
              <path d="M9 10h14M9 16h10M9 22h7" stroke="white" strokeWidth="2.2" strokeLinecap="round"/>
            </svg>
            StudioBase
          </a>
          <a
            href="/"
            className="text-sm text-gray-500 hover:text-gray-900 transition-colors"
          >
            ← Back to app
          </a>
        </div>
      </header>

      {/* Content */}
      <main className="max-w-3xl mx-auto px-6 py-14">
        <div className="mb-10">
          <h1 className="text-4xl font-bold text-gray-900 mb-3">Privacy Policy</h1>
          <p className="text-gray-500 text-sm">Last updated: May 29, 2026</p>
        </div>

        <div className="prose prose-gray max-w-none space-y-10 text-gray-700 leading-relaxed">

          <Section title="1. Overview">
            StudioBase ("we", "our", or "us") is a screen recording and documentation tool
            that helps users capture workflows and automatically generate SOPs, interactive
            demos, and videos. This Privacy Policy explains what data we collect, why we
            collect it, and how we handle it. By using StudioBase — including the Chrome
            extension and web application — you agree to this policy.
          </Section>

          <Section title="2. Data We Collect">
            <SubSection title="Account information">
              When you sign in with Google, we receive your name, email address, and profile
              picture via Google OAuth. We use this to create and identify your StudioBase
              account. We do not receive or store your Google password.
            </SubSection>
            <SubSection title="Screen recordings">
              When you use the StudioBase extension to record your screen, the video is
              captured in your browser and uploaded to our servers for processing. Recordings
              are stored in your personal workspace and are only accessible by you (and
              workspace members you explicitly invite).
            </SubSection>
            <SubSection title="Usage data">
              We collect basic usage information (such as feature interactions and session
              events) to improve the product. This data is aggregated and not linked to
              personally identifiable information.
            </SubSection>
            <SubSection title="Mouse and interaction data">
              During a recording session, the extension tracks mouse position and click events
              solely to render the cursor overlay on your recording. This data is not stored
              or transmitted beyond what is captured in the recording itself.
            </SubSection>
          </Section>

          <Section title="3. How We Use Your Data">
            <ul className="list-disc pl-5 space-y-2">
              <li>To authenticate you and maintain your session</li>
              <li>To store and process your screen recordings in your workspace</li>
              <li>To generate SOPs, demos, and videos from your recordings using AI</li>
              <li>To send you product-related notifications (you can opt out at any time)</li>
              <li>To improve the reliability and quality of the StudioBase service</li>
            </ul>
          </Section>

          <Section title="4. Data Sharing">
            We do not sell your personal data. We do not share your data with third parties
            except in the following limited cases:
            <ul className="list-disc pl-5 space-y-2 mt-3">
              <li>
                <strong>Service providers:</strong> We use infrastructure providers
                (e.g. Cloudflare, Google Cloud) to store and process data on our behalf.
                These providers are contractually bound to handle data securely and only for
                the purposes we specify.
              </li>
              <li>
                <strong>Legal requirements:</strong> We may disclose data if required by law
                or to protect the rights and safety of StudioBase or its users.
              </li>
            </ul>
          </Section>

          <Section title="5. Data Retention">
            We retain your account data for as long as your account is active. Recordings
            are stored until you delete them from your workspace. You can delete your account
            and all associated data at any time by contacting us at the address below.
          </Section>

          <Section title="6. Security">
            All data is transmitted over HTTPS. Recordings are stored with access controls
            ensuring only you and your invited workspace members can view them. We follow
            industry-standard practices to protect your data against unauthorized access.
          </Section>

          <Section title="7. Your Rights">
            Depending on your location, you may have the right to:
            <ul className="list-disc pl-5 space-y-2 mt-3">
              <li>Access the personal data we hold about you</li>
              <li>Request correction or deletion of your data</li>
              <li>Object to or restrict certain processing of your data</li>
              <li>Export your data in a portable format</li>
            </ul>
            To exercise any of these rights, contact us at{' '}
            <a href="mailto:privacy@studiobase.app" className="text-indigo-600 hover:underline">
              privacy@studiobase.app
            </a>.
          </Section>

          <Section title="8. Chrome Extension">
            The StudioBase Chrome extension requests the following permissions:
            <ul className="list-disc pl-5 space-y-2 mt-3">
              <li><strong>desktopCapture</strong> — to record your screen</li>
              <li><strong>identity</strong> — to sign you in with Google</li>
              <li><strong>storage</strong> — to persist your session locally</li>
              <li><strong>scripting / activeTab</strong> — to inject the recording toolbar on the page you are recording</li>
              <li><strong>tabs</strong> — to open StudioBase Studio when your recording is ready</li>
              <li><strong>offscreen</strong> — to encode the recording as a video file in the background</li>
            </ul>
            <p className="mt-3">
              No data is collected by the extension unless you explicitly start a recording.
            </p>
          </Section>

          <Section title="9. Children's Privacy">
            StudioBase is not directed at children under 13. We do not knowingly collect
            personal data from children. If you believe a child has provided us with personal
            data, please contact us and we will delete it promptly.
          </Section>

          <Section title="10. Changes to This Policy">
            We may update this Privacy Policy from time to time. We will notify you of
            material changes by posting the updated policy on this page with a new "Last
            updated" date. Continued use of StudioBase after changes constitutes acceptance
            of the updated policy.
          </Section>

          <Section title="11. Contact">
            For any privacy-related questions or requests, contact us at:
            <div className="mt-3 p-4 bg-gray-50 rounded-xl border border-gray-100 text-sm">
              <p className="font-medium text-gray-900">StudioBase</p>
              <p>
                Email:{' '}
                <a href="mailto:privacy@studiobase.app" className="text-indigo-600 hover:underline">
                  privacy@studiobase.app
                </a>
              </p>
              <p>
                Website:{' '}
                <a href="https://studiobase.app" className="text-indigo-600 hover:underline">
                  https://studiobase.app
                </a>
              </p>
            </div>
          </Section>

        </div>
      </main>

      {/* Footer */}
      <footer className="border-t border-gray-100 mt-20">
        <div className="max-w-3xl mx-auto px-6 py-6 flex items-center justify-between text-sm text-gray-400">
          <span>© {new Date().getFullYear()} StudioBase. All rights reserved.</span>
          <a href="/" className="hover:text-gray-600 transition-colors">Back to app</a>
        </div>
      </footer>
    </div>
  );
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section>
      <h2 className="text-xl font-semibold text-gray-900 mb-3">{title}</h2>
      <div className="text-gray-600 text-[15px] leading-7">{children}</div>
    </section>
  );
}

function SubSection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="mb-4">
      <h3 className="font-medium text-gray-800 mb-1">{title}</h3>
      <p>{children}</p>
    </div>
  );
}
