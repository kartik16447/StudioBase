// Realistic sample data shaped to /shared/types/session.ts SessionEnvelope.
// Screenshots are striped placeholders rendered by <ScreenshotPlaceholder>.

const SAMPLE_SESSION = {
  sessionId: 'sess_01HZ8X9KQF',
  schemaVersion: '1.0',
  sessionType: 'steps',
  capturedAt: '2026-05-09T14:22:11Z',
  capturedUrl: 'https://app.linear.app/studiobase/issues',
  capturedTitle: 'Linear — Issues',
  userAgent: 'Mozilla/5.0',
  pipelinePath: 'edge',
  aiOutputs: {
    title: 'Setting up a custom view in Linear',
    summary: 'A walkthrough for creating, filtering, and sharing a custom issue view for your engineering team. Covers grouping by status, saving the view as a favorite, and inviting teammates to the same view.',
    tags: ['Linear', 'Onboarding', 'Engineering'],
  },
  metadata: {
    durationMs: 184000,
    stepCount: 12,
    chapterBreaks: [
      { afterStepId: 'step-4',  chapterTitle: 'Filtering by status & assignee' },
      { afterStepId: 'step-8',  chapterTitle: 'Saving & sharing the view' },
    ],
  },
  steps: [
    { id:'step-1',  sequence:1,  action:'navigate', url:'https://app.linear.app',
      pageTitle:'Linear', screenshotKey:'ss1',
      generatedText:'Navigate to your Linear workspace and sign in with your work email to access your team\'s issue tracker.',
      textOverride:null },
    { id:'step-2',  sequence:2,  action:'click',    url:'https://app.linear.app/inbox',
      pageTitle:'Inbox', screenshotKey:'ss2', elementText:'Views',
      generatedText:'Click "Views" in the left sidebar to open the list of custom views available to your workspace.',
      textOverride:null },
    { id:'step-3',  sequence:3,  action:'click',    url:'https://app.linear.app/views',
      pageTitle:'Views', screenshotKey:'ss3', elementText:'New view',
      generatedText:'Click the "+ New view" button in the top right corner of the views panel.',
      textOverride:null },
    { id:'step-4',  sequence:4,  action:'input',    url:'https://app.linear.app/views/new',
      pageTitle:'New view', screenshotKey:'ss4', elementText:'View name', inputValue:'In review — this sprint',
      generatedText:'Give the view a descriptive name. We\'re calling ours "In review — this sprint" so it\'s obvious to teammates.',
      textOverride:null },
    { id:'step-5',  sequence:5,  action:'click',    url:'https://app.linear.app/views/new',
      pageTitle:'Filter', screenshotKey:'ss5', elementText:'+ Filter',
      generatedText:'Open the filter menu by clicking the "+ Filter" button below the view name.',
      textOverride:null },
    { id:'step-6',  sequence:6,  action:'click',    url:'https://app.linear.app/views/new',
      pageTitle:'Filter — Status', screenshotKey:'ss6', elementText:'Status is In review',
      generatedText:'Select "Status" from the filter list, then choose "In review" from the dropdown that appears.',
      textOverride:'Pick Status → "In review". This restricts the view to issues that have a PR open.' },
    { id:'step-7',  sequence:7,  action:'click',    url:'https://app.linear.app/views/new',
      pageTitle:'Filter — Cycle', screenshotKey:'ss7', elementText:'Cycle is Active cycle',
      generatedText:'Add a second filter for "Cycle is Active cycle" so only issues in the running sprint show.',
      textOverride:null },
    { id:'step-8',  sequence:8,  action:'click',    url:'https://app.linear.app/views/new',
      pageTitle:'Group by', screenshotKey:'ss8', elementText:'Group by assignee',
      generatedText:'Open the "Group by" menu in the top toolbar and choose "Assignee" so reviewers see their own queue first.',
      textOverride:null },
    { id:'step-9',  sequence:9,  action:'click',    url:'https://app.linear.app/views/new',
      pageTitle:'Save', screenshotKey:'ss9', elementText:'Save view',
      generatedText:'Click "Save view" in the top right. The view appears under "Views" in the sidebar for everyone on the team.',
      textOverride:null },
    { id:'step-10', sequence:10, action:'click',    url:'https://app.linear.app/views/in-review',
      pageTitle:'Favorite', screenshotKey:'ss10', elementText:'Star',
      generatedText:'Star the view to pin it to the top of your sidebar. The star icon turns yellow once it\'s favorited.',
      textOverride:null },
    { id:'step-11', sequence:11, action:'click',    url:'https://app.linear.app/views/in-review',
      pageTitle:'Share', screenshotKey:'ss11', elementText:'Share',
      generatedText:'Click the "Share" button in the top right to invite specific teammates or copy a link to the view.',
      textOverride:null },
    { id:'step-12', sequence:12, action:'click',    url:'https://app.linear.app/views/in-review',
      pageTitle:'Copy link', screenshotKey:'ss12', elementText:'Copy link',
      generatedText:'Copy the view link and paste it into the team\'s standup channel so reviewers can jump straight in tomorrow morning.',
      textOverride:null },
  ],
  assets: {},
  brand: { logoUrl: null, primaryColor: '#5E5CE6', fontFamily: 'SF Pro', watermarkText: 'StudioBase', introSlide: false, outroSlide: false },
  activeLanguage: 'en',
};

// Library — multiple sessions with metadata
const SAMPLE_SESSIONS = [
  { ...SAMPLE_SESSION, _hue: 244 },
  {
    sessionId: 'sess_02JK4LP', sessionType:'steps', capturedAt:'2026-05-07T10:11:00Z',
    aiOutputs:{ title:'Connecting Stripe to your billing dashboard', summary:'Wire up Stripe API keys, configure webhooks, and verify the first test payment goes through.', tags:['Stripe','Billing','Setup'] },
    metadata:{ durationMs:122000, stepCount:8 }, steps: [], assets:{}, _hue: 198,
  },
  {
    sessionId: 'sess_03NX8YZ', sessionType:'steps', capturedAt:'2026-05-05T18:42:00Z',
    aiOutputs:{ title:'Inviting teammates to your workspace', summary:'Send invites by email, assign default roles, and review pending invitations.', tags:['Admin','Workspace','Permissions'] },
    metadata:{ durationMs:64000, stepCount:5 }, steps:[], assets:{}, _hue: 162,
  },
  {
    sessionId: 'sess_04QR2WT', sessionType:'video', capturedAt:'2026-05-02T09:15:00Z',
    aiOutputs:{ title:'Triaging customer bugs in Intercom', summary:'A 4-minute demo walking through how the support team triages incoming bugs and routes them to engineering.', tags:['Support','Triage','Process'] },
    metadata:{ durationMs:243000, stepCount:14 }, steps:[], assets:{}, _hue: 22,
  },
  {
    sessionId: 'sess_05BB7HM', sessionType:'steps', capturedAt:'2026-04-28T14:31:00Z',
    aiOutputs:{ title:'Running your first Playwright test', summary:'Install Playwright, scaffold a test, run it headlessly, and inspect the trace viewer.', tags:['QA','Playwright','Testing'] },
    metadata:{ durationMs:96000, stepCount:7 }, steps:[], assets:{}, _hue: 282,
  },
  {
    sessionId: 'sess_06DD5KJ', sessionType:'steps', capturedAt:'2026-04-25T11:02:00Z',
    aiOutputs:{ title:'Migrating a Notion doc into the wiki', summary:'Export from Notion, reformat headings, and import into the shared engineering wiki.', tags:['Docs','Migration'] },
    metadata:{ durationMs:78000, stepCount:6 }, steps:[], assets:{}, _hue: 50,
  },
];

function formatDuration(ms) {
  const s = Math.round(ms/1000);
  const m = Math.floor(s/60);
  const sec = s % 60;
  return `${m}:${String(sec).padStart(2,'0')}`;
}
function formatDate(iso) {
  const d = new Date(iso);
  const now = new Date();
  const diff = (now - d) / 1000;
  if (diff < 3600) return `${Math.round(diff/60)}m ago`;
  if (diff < 86400) return `${Math.round(diff/3600)}h ago`;
  if (diff < 604800) return `${Math.round(diff/86400)}d ago`;
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

Object.assign(window, { SAMPLE_SESSION, SAMPLE_SESSIONS, formatDuration, formatDate });
