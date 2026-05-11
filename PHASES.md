# StudioBase — Product Phases

## What We Are Building

One extension. One capture session. Multiple outputs — all from the same JSON.

**Core outputs (Path 1 — primary target):**
- **Raw Video** — free/low-paid tier. No AI. Just the recording stored in R2, shareable via link.
- **SOP Guide** — AI-generated numbered guide with annotated screenshots. 1 credit.
- **Interactive Demo** — clickable sandbox with pulsing hotspot overlays. 1 credit.
- **Simulated Video** — pan/zoom over screenshots, synced AI voiceover, transitions. 2 credits.

**Trupeer-equivalent features (built into Path 1, no separate path needed):**
- **Step Annotations** — arrows, boxes, circles, text callouts on any screenshot. Added in Studio editor.
- **Chapters** — group steps into named sections for long recordings. Shown in SOP + video.
- **Brand Customization** — logo, colors, font, intro/outro slides per workspace. Applied at render time.
- **Translation (65+ languages)** — translate step text + regenerate voiceover in any language. Extra pipeline call, charged as additional credits.

**Future paths (architecture supports all, build after Phase 5):**
Path 2 (Sales Demos), Path 3 (Bug Catcher), Path 4 (Automation), Path 5 (Web Memory / Knowledge Base), Path 6 (eLearning / SCORM), Path 7 (Template Marketplace), Path 8 (Chameleon-style Guided Tours)

---

## Architecture — Three Layers

```
LAYER 1: CAPTURE (Chrome Extension)
"Dumb vacuum. No intelligence. Ships raw data."
mousedown → element metadata + coordinates
MutationObserver settle → captureVisibleTab
chrome.storage.session → step array
IndexedDB → screenshot blobs
Stop → upload to R2 → signal backend

LAYER 2: PIPELINE (Cloudflare Worker + Queue)
"Adds intelligence. Writes back enriched JSON."
Cloud path: GPT-4o-mini text + OpenAI TTS audio
Edge path (later): Gemini Nano + WASM TTS
Writes enriched JSON + audio to R2
Updates D1: status = 'ready'

LAYER 3: SMART STUDIO (React Web App)
"One JSON payload. Three rendering modes."
SOP List      → steps as numbered guide
Interactive Demo → screenshots + hotspot overlays
Simulated Video  → pan/zoom + synced audio
Zustand store. activeView toggle. AnimatePresence.
```

---

## Monetization

- **Free**: unlimited raw video, 1GB R2 storage, 7-day link expiry, 10 signup credits
- **Starter**: more storage, permanent links, monthly credit bundle
- **Credits**: SOP = 1 credit, Demo = 1 credit, Video = 2 credits, Translation = 1 credit per language per session. Top up anytime, no plan upgrade required.
- **Brand customization**: Starter+ feature, configured per workspace in settings.

---

## Phase 0 — Base Architecture Setup (DONE)

**Goal**: Clean repo, schema frozen, backend rewritten, Drive removed, R2 wired.

- New repo: `/Downloads/studiobase/`
- Copied backend + extension from ScreenVault
- Deleted: `google-drive.ts`, `offscreen.ts`, `offscreen.html`, `playback.ts`
- Created `shared/types/session.ts` — canonical JSON schema (foundation of everything)
- Created `shared/constants/index.ts` — credit costs, quota limits, timing constants
- Updated `backend/wrangler.jsonc` — R2 bucket + Queue bindings
- Created `backend/migrations/0001_initial.sql` — full D1 schema
- Rewrote `backend/src/index.ts` — sessions, credits, R2, pipeline queue, no Drive
- Updated `extension/manifest.json` — removed Drive scopes, added `scripting` + content scripts

**Deliverable**: Repo structure correct, schema frozen, backend deployable after Cloudflare setup.

---

## Phase 1 — Capture Right, Render Nothing (2 weeks)

**Goal**: Capture a session, inspect clean JSON in R2. No viewer. No AI. Just validate data is correct.

**Files to build in order:**

1. `extension/src/capture/selector-engine.ts`
   - Shadow-piercing CSS selector generation for any DOM element
   - Priority: data-testid > id > aria-label > role+text > structural path
   - Must be standalone, no dependencies
   - Unit test against real SaaS tools before proceeding

2. `extension/src/capture/dom-observer.ts`
   - `mousedown` listener (capture phase, NO preventDefault)
   - Records element metadata synchronously before any DOM mutation
   - MutationObserver settle (150ms quiet) → signals background to screenshot
   - Also: `input` event listener for form fields, `history.pushState` patch for SPA nav

3. `extension/src/background/keepalive.ts`
   - `chrome.runtime.Port` connection from content script to SW
   - `chrome.alarms` as secondary keepalive (every ~24s)
   - Chrome will not kill SW while port is open

4. `extension/src/background/session-manager.ts`
   - Owns step array in `chrome.storage.session`
   - Screenshot blobs → IndexedDB
   - Handles session start / pause / resume / stop
   - On SW restart: reads `chrome.storage.session` to reconstruct state

5. `extension/src/background/r2-uploader.ts`
   - Reads steps from `chrome.storage.session`
   - Reads screenshots from IndexedDB
   - Requests presigned URLs from backend
   - Uploads each screenshot to R2
   - Assembles final session JSON, uploads to R2
   - Calls `POST /sessions` then `PATCH /sessions/:id` with r2JsonKey

**Deliverable**: Install extension, click through any workflow, stop, see clean session JSON in R2.

---

## Phase 2 — SOP View + Brand + Chapters (1 week)

**Goal**: Smart Studio shell with SOP list rendering from JSON. Share links work. Brand and chapters visible.

- New Vite React app: `studio/`
- Zustand store with session data, loadingState, activeView
- Three derived-state selector hooks: `useSopSteps`, `useDemoSteps`, `useVideoTimeline`
- Only build SOP view — numbered list + screenshots
- If `generatedText` is null (pipeline not run), show `elementText` as fallback
- R2 session loader: URL param `?session=shareToken` → fetch JSON → hydrate store
- Share links: anyone with link can view SOP, no auth required
- **Brand**: read `session.brand` — apply logo, primary color, font to Studio UI. Intro/outro slides rendered as first/last step cards.
- **Chapters**: read `session.metadata.chapterBreaks` — render chapter heading cards between steps in SOP view.
- **Workspace brand settings**: new settings page in Studio where owner sets logo/color/font. Saved to D1, injected into session JSON at pipeline time.

**Deliverable**: Capture session → open Smart Studio link → branded SOP guide with chapter headings, shareable with anyone.

---

## Phase 3 — AI Pipeline + Translation (1 week)

**Goal**: GPT-4o-mini generates step text. OpenAI TTS generates voiceover. Translation support added. Credits deducted.

- Separate Cloudflare Worker: `pipeline-worker/`
- Triggered via Cloudflare Queue (not same worker as API)
- Per step: call GPT-4o-mini with elementText + selector + URL context → `generatedText`
- Per session: call OpenAI TTS with each step's text → audio file → R2 → `voiceoverKey`
- Compute `animationTarget` per step: centerX%, centerY%, zoomScale (2.5x default), transitionType
- Write enriched JSON back to R2, update D1 status to `ready`
- Credit deduction happens at `POST /pipeline/trigger` before queue dispatch
- Edge AI (Gemini Nano): not in this phase. Cloud pipeline first.

**Translation (Trupeer-equivalent):**
- User picks a target language in Studio after session is ready
- Frontend calls `POST /pipeline/translate` with `{ sessionId, languageCode }`
- Pipeline worker calls GPT-4o-mini with translation prompt for all step texts
- Calls OpenAI TTS on translated texts → new audio files → R2
- Stores results in `step.translations[languageCode]` in session JSON
- Costs 1 credit per language per session
- Studio language switcher updates `session.activeLanguage` → all three views re-render with translated content

**Deliverable**: Capture → SOP with AI text → switch to Spanish → SOP re-renders in Spanish with Spanish voiceover.

---

## Phase 4 — Interactive Demo + Annotations (1 week)

**Goal**: Clickable demo view with hotspot overlays, annotations editor, embed anywhere.

- Add Demo view to Smart Studio
- `useDemoSteps` selector: screenshot URL + hotspot position as x%/y% of viewport
- Pulsing hotspot div: absolutely positioned over screenshot, CSS keyframe scale 1.0→1.4, repeating
- `generatedText` as tooltip anchored to hotspot, appears after short delay
- Click hotspot → advance `activeStepIndex` → transition to next screenshot
- Transition types from step's `transitionType`: crossfade (navigate steps) or slide (same-page steps)
- Embed generator: iframe embed code for Notion/Confluence/any page
- No extension required for viewers

**Annotations editor (Trupeer-equivalent):**
- Toolbar in Studio with: Arrow, Box, Circle, Text tools
- User clicks/drags on any screenshot to place an annotation
- Saved to `step.annotations[]` in session JSON (x/y as %, color, text)
- Annotations rendered as SVG overlays on top of screenshot in all three views (SOP, Demo, Video)
- Auto-annotation: pipeline suggests annotations at click coordinates automatically (arrow pointing to clicked element)
- Blur tool: redact sensitive data (passwords, PII) on screenshots before sharing

**Chapters in Demo view:**
- Chapter break cards rendered between steps matching `session.metadata.chapterBreaks`
- Acts as a navigation sidebar in Demo view — user can jump to any chapter

**Deliverable**: Capture → annotated clickable demo with chapter navigation → shareable + embeddable.

---

## Phase 5 — Simulated Video With Effects (1.5 weeks)

**Goal**: AI voiceover video with zoom effects, transitions, cursor animation. Export as MP4.

**Zoom effects:**
- Zoom in: scale 1.0 → 2.5, 600ms ease-in-out, centered on click coordinates
- Hold at zoom for duration of voiceover
- Zoom out: 300ms ease-out before next screenshot transition

**Transitions between steps:**
- Slide: new screenshot slides in from right, 400ms
- Fade: cross-dissolve, 400ms
- Zoom: current scales up → cut to new → zoom out, 300ms
- Instant: no transition (for rapid sequential steps)

**Cursor + click effects:**
- Synthetic cursor SVG animates to click coordinates as zoom-in begins, 400ms
- Click ripple: two rings expanding + fading from click point, 600ms

**Scroll animation:**
- Screenshot rendered larger than viewport, translated vertically by stored `scrollY` delta

**Audio sync:**
- Web Audio API schedules voiceover segments on single timeline
- Animation loop driven by audio `currentTime`
- Captions: `generatedText` as subtitle bar, timed to voiceover (Pro feature)

**Annotations in video:**
- `step.annotations[]` rendered as SVG overlays on each screenshot during video playback
- Annotations fade in 300ms after screenshot appears, fade out 300ms before transition
- Auto-annotation arrows point to click target during zoom-in

**Chapters in video:**
- Chapter title cards rendered as 2-second transition slides between chapter groups
- Branded with `session.brand` colors and font
- Shown in video timeline scrubber as markers

**Brand in video:**
- Intro slide: logo + session title card, 3 seconds, branded colors
- Outro slide: logo + CTA text, 3 seconds
- Watermark: logo or text in corner throughout video (optional, Starter+)

**Export:**
- MediaRecorder on parent div captures Framer Motion playback as MP4
- Fully client-side, no backend needed, costs no additional credits
- Export includes all annotations, chapters, brand elements baked in

**Deliverable**: Full simulated video with zoom, transitions, AI voiceover, captions, annotations, chapters, branding. Export MP4.

---

## Future Paths (post Phase 5 — pick any after base is done)

**Path 2 — Interactive Demo as Sales Tool**
Already built in Phase 4. Add: custom branding, lead capture form in embed, completion analytics.

**Path 3 — Bug Catcher**
Add `debug` config flag to popup. Main world injection patches `window.console.error`, `fetch`, `XHR`. Debug data populates `step.debug` field (already in schema). Smart Studio adds Debug Report view.

**Path 4 — Automation Scripts**
New backend endpoint: reads session JSON, maps selector+action per step → Playwright script text. Returns as downloadable `.ts` file. One endpoint, one Studio button.

**Path 5 — Web Memory**
Passive capture mode in extension. Each page visit = lightweight session (URL, title, visible text, single screenshot). Local embedding via Transformers.js → Cloudflare Vectorize. Chrome Side Panel search UI.

**Path 6 — eLearning / SCORM**
Pipeline generates quiz questions per step via GPT-4o-mini. Studio adds Course Builder view. New export format: SCORM zip package.

**Path 7 — Template Marketplace**
Publish button makes session public with canonical URL. Fork creates copy under new user's account. `step.template` fields track fork lineage. Backend adds public sessions + search.

**Path 8 — Chameleon-style Guided Tours (no vendor required)**
`step.overlay` field stores trigger conditions + display config. Content script checks D1/KV for tours matching current URL, fetches from R2, renders tooltips/hotspots/launchers directly on page DOM. Works on any web app — Salesforce, Workday, SAP — with zero vendor cooperation. User installs once, every app is automatically supported.

---

## Trupeer Feature Coverage (all except AI Avatar)

| Trupeer Feature | Where Built | Schema Field |
|---|---|---|
| Smart zoom on clicks | Phase 5 | `step.animationTarget` |
| AI voiceover | Phase 3 | `step.voiceoverKey` |
| Auto SOP / docs | Phase 2 | `step.generatedText` |
| Step annotations / callouts | Phase 4 | `step.annotations[]` |
| Chapters / sections | Phase 2 + 4 + 5 | `session.metadata.chapterBreaks[]` |
| Brand customization | Phase 2 + 5 | `session.brand` |
| 65+ language translation | Phase 3 | `step.translations{}` |
| Knowledge base search | Path 5 | `step.memory` |
| Template replication | Path 7 | `step.template` |
| AI Avatar | Not planned | `session.avatar` (schema ready) |

---

## Key Architectural Decisions (frozen)

- **Screenshots not rrweb** — screenshots required for Demo and Video outputs. rrweb only if Path 3 added later.
- **`screenshotKey` not URL in steps** — signed R2 URLs expire. Asset map on session envelope refreshed on load.
- **Cloud pipeline first** — Edge AI (Gemini Nano) added after cloud pipeline is stable.
- **Raw video stays forever** — free/low-paid tier. MediaRecorder path kept alongside new capture engine.
- **`shared/types/session.ts` is immutable** — never change field names without bumping `SCHEMA_VERSION`.
- **Separate pipeline worker** — not same as API worker. Longer CPU time, queue-driven.
- **Credits not plans** — users buy credits, never forced to upgrade a plan.
- **Annotations are SVG overlays** — not baked into screenshots. Rendered at display time so they stay editable.
- **Translation is on-demand** — not generated automatically. User requests + pays credits per language.
- **Brand is workspace-level** — one brand config per workspace, applied to all sessions from that workspace.
