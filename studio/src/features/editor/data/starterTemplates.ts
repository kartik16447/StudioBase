import type { JSONContent } from '@tiptap/react';

function p(text: string): JSONContent {
  return { type: 'paragraph', content: text ? [{ type: 'text', text }] : [] };
}
function h2(text: string): JSONContent {
  return { type: 'heading', attrs: { level: 2 }, content: [{ type: 'text', text }] };
}
function h3(text: string): JSONContent {
  return { type: 'heading', attrs: { level: 3 }, content: [{ type: 'text', text }] };
}
function bullets(items: string[]): JSONContent {
  return {
    type: 'bulletList',
    content: items.map(t => ({ type: 'listItem', content: [p(t)] })),
  };
}
function hr(): JSONContent { return { type: 'horizontalRule' }; }

export interface StarterTemplate {
  id: string;
  emoji: string;
  name: string;
  description: string;
  category: string;
  blocks: JSONContent[];
}

export const STARTER_TEMPLATES: StarterTemplate[] = [
  {
    id: '__feature-walkthrough',
    emoji: '🚀',
    name: 'Feature Walkthrough',
    description: 'Stakeholder-ready narration for a new feature',
    category: 'feature-walkthrough',
    blocks: [
      h2('Overview'),
      p('[Replace with: one sentence describing what this feature does and the outcome it produces for the user.]'),
      h2('Who this is for'),
      bullets([
        '[Replace with: primary user persona]',
        '[Replace with: secondary user if applicable]',
      ]),
      h2('Step-by-step'),
      h3('Step 1 — [Replace with: action name]'),
      p('[Replace with: describe the first action. Where does the user start? What do they click?]'),
      h3('Step 2 — [Replace with: action name]'),
      p('[Replace with: describe the second action and what happens immediately after.]'),
      h3('Step 3 — [Replace with: action name]'),
      p('[Replace with: describe the result. What does the user see when the feature completes?]'),
      hr(),
      h2('Edge cases'),
      p('[Replace with: describe the one scenario that surprises users and how the system handles it.]'),
      h2('What comes next'),
      p('[Replace with: what should the user do after this feature completes? Link to the next step or doc.]'),
    ],
  },
  {
    id: '__client-onboarding',
    emoji: '👋',
    name: 'Client Onboarding',
    description: 'Warm, clear steps from signup to first value',
    category: 'client-onboarding',
    blocks: [
      h2('Welcome'),
      p('[Replace with: a warm one-sentence welcome. Who is this for and what will they accomplish by the end?]'),
      h2('Before you start'),
      bullets([
        '[Replace with: anything the client needs before beginning — account access, integrations, permissions]',
        '[Replace with: who to contact if they get stuck]',
      ]),
      h2('Step 1 — First login'),
      p('[Replace with: describe the first login experience. What does the client see? Where should they go first?]'),
      h2('Step 2 — Set up your workspace'),
      p('[Replace with: describe the key setup action — connecting an integration, inviting a teammate, or completing a profile.]'),
      h2('Step 3 — Complete your first action'),
      p('[Replace with: describe the first meaningful action that delivers value. This is the moment the client "gets it".]'),
      h2('Step 4 — Invite your team'),
      p('[Replace with: describe how to invite teammates and what role/permissions to assign.]'),
      hr(),
      h2('Getting help'),
      p('[Replace with: where to go for support — in-app chat, help centre URL, or dedicated CS contact details.]'),
    ],
  },
  {
    id: '__design-handoff',
    emoji: '🎨',
    name: 'Design Handoff',
    description: 'Component specs, states, and tokens for engineers',
    category: 'design-handoff',
    blocks: [
      h2('Component overview'),
      p('[Replace with: component name, purpose, and which product surfaces use it.]'),
      h2('Spacing and layout'),
      bullets([
        'Padding: [top/bottom]px × [left/right]px',
        'Internal gap: [N]px',
        'Token: [spacing-token-name]',
      ]),
      h2('Colour and tokens'),
      bullets([
        'Background: [hex] → [token-name]',
        'Border: [hex] → [token-name]',
        'Text: [hex] → [token-name]',
      ]),
      h2('Typography'),
      bullets([
        'Label: [font-family] [weight] [size]/[line-height]',
        'Body: [font-family] [weight] [size]/[line-height]',
        'Token: [type-token-name]',
      ]),
      h2('Interaction states'),
      h3('Default'),
      p('[Replace with: exact visual description of the default state.]'),
      h3('Hover'),
      p('[Replace with: background shift, border change, transition duration and easing.]'),
      h3('Focus'),
      p('[Replace with: focus ring spec — offset, width, colour. Must pass WCAG AA.]'),
      h3('Disabled'),
      p('[Replace with: opacity, cursor, and whether pointer events are suppressed.]'),
      h2('Responsive behaviour'),
      bullets([
        'Mobile (<[N]px): [layout change]',
        'Tablet ([N]–[N]px): [layout change]',
        'Desktop (>[N]px): full spec as above',
      ]),
      hr(),
      h2('Accessibility'),
      bullets([
        'Target: WCAG [AA/AAA]',
        'Required ARIA: [role], [aria-label]',
        'Keyboard: [tab order description]',
        'Screen reader: "[exact announcement string]"',
      ]),
    ],
  },
  {
    id: '__process-runbook',
    emoji: '📋',
    name: 'Process Runbook',
    description: 'Formal structure with clear ownership and review date',
    category: 'process-runbook',
    blocks: [
      h2('Purpose'),
      p('[Replace with: one sentence — what business outcome this process produces and when it is executed.]'),
      h2('Prerequisites'),
      bullets([
        '[Replace with: required system access]',
        '[Replace with: required permissions or role]',
        '[Replace with: tools or credentials needed]',
      ]),
      p('If any prerequisite is missing, stop here and contact [owner role] before proceeding.'),
      hr(),
      h2('The Process'),
      h3('Step 1 — [Replace with: step name]'),
      p('[Replace with: exact first action — which system, which URL, which button or form.]'),
      h3('Step 2 — [Replace with: step name]'),
      p('[Replace with: the core action. Include exact values, field names, and expected system response.]'),
      h3('Step 3 — Verify'),
      p('[Replace with: what to check and what correct output looks like. If incorrect, see Exceptions.]'),
      h3('Step 4 — Complete and confirm'),
      p('[Replace with: final action — submit, close, or notify. What to record and where.]'),
      hr(),
      h2('Exceptions and troubleshooting'),
      h3('If Step [N] fails'),
      p('[Replace with: exact error message or symptom, recovery steps, and escalation path if unresolved.]'),
      hr(),
      h2('Ownership'),
      bullets([
        'Process owner: [role title], [team]',
        'Questions: [channel]',
        'Escalation: [escalation path]',
      ]),
      h2('Review date'),
      p('[Replace with: next scheduled review date and the condition that triggers an out-of-cycle review.]'),
    ],
  },
  {
    id: '__product-demo',
    emoji: '🎯',
    name: 'Product Demo',
    description: 'Problem → solution → CTA sales narrative',
    category: 'product-demo',
    blocks: [
      h2('The Problem'),
      p('[Replace with: your buyer\'s pain point in their language. Be specific — name the cost in time, money, or risk.]'),
      h2('Why existing solutions fall short'),
      p('[Replace with: what the buyer has tried before and why it didn\'t work. Competitor or manual approach.]'),
      hr(),
      h2('The Solution'),
      p('[Replace with: one sentence — what your product does and the outcome it produces.]'),
      h3('Key capability 1'),
      p('[Replace with: the single most compelling feature. Show the outcome, not the mechanic.]'),
      h3('Key capability 2'),
      p('[Replace with: the feature your competitors cannot match. Name the gap explicitly.]'),
      h3('Key capability 3'),
      p('[Replace with: the capability that makes adoption feel low-risk. No migration, no setup, no lock-in.]'),
      hr(),
      h2('Get Started Today'),
      p('[Replace with: restate the outcome in one sentence and reduce the activation barrier.]'),
      bullets([
        '[Replace with: CTA — trial, demo request, or self-serve signup]',
        '[Replace with: what happens in the first 60 seconds after signing up]',
        '[Replace with: social proof — number of customers, a recognisable logo, or a metric]',
      ]),
    ],
  },
  {
    id: '__quick-howto',
    emoji: '⚡',
    name: 'Quick How-To',
    description: 'Five-minute guide for the process you do every week',
    category: 'quick-howto',
    blocks: [
      h2('What this covers'),
      p('[Replace with: one sentence — the task and how long it takes.]'),
      h2('Before you start'),
      p('[Replace with: the starting point — which app, page, or screen to have open.]'),
      hr(),
      h2('Steps'),
      h3('1. [Replace with: first action]'),
      p('[Replace with: what to click, where to find it, and what opens next.]'),
      h3('2. [Replace with: main action]'),
      p('[Replace with: the core thing to do. Include the one common mistake to avoid.]'),
      h3('3. [Replace with: confirm]'),
      p('[Replace with: the confirmation action and what the system shows when it\'s done.]'),
      hr(),
      h2('Done — what you should see'),
      p('[Replace with: the end state. What appears on screen, and what to do if it doesn\'t show up within [timeframe].]'),
    ],
  },
];
