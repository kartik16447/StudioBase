import type { PageNode, DocRecord, TemplateItem, SearchResult, EmojiCategory } from '../types';

export const INITIAL_PAGES: PageNode[] = [
  {
    id: 'welcome',
    emoji: '👋',
    title: 'Welcome to StudioBase Docs',
    children: [],
    blocks: [
      { id: 'b1', type: 'h1', text: 'Welcome to StudioBase Docs' },
      { id: 'b2', type: 'p', text: 'A clean writing surface for capturing ideas, briefs, and decisions — right next to your library, brand kit, and analytics.' },
      { id: 'b3', type: 'p', text: 'Type / to insert blocks. Drag from the left of any line to reorder. Use ⌘P to search across every doc.' },
      { id: 'b4', type: 'h2', text: 'Getting started' },
      { id: 'b5', type: 'bullet', text: 'Create a doc from a template or start blank' },
      { id: 'b6', type: 'bullet', text: 'Use slash commands to add headings, lists, toggles, and code' },
      { id: 'b7', type: 'bullet', text: 'Share docs with the studio or export to .md / .docx / PDF' },
    ],
  },
  {
    id: 'projects',
    emoji: '📁',
    title: 'Projects',
    children: [
      {
        id: 'northstar',
        emoji: '🌟',
        title: 'Northstar Rebrand',
        children: [
          { id: 'ns-brief', emoji: '📝', title: 'Creative Brief', children: [] },
          { id: 'ns-research', emoji: '🔬', title: 'Research Notes', children: [] },
          { id: 'ns-moodboard', emoji: '🎨', title: 'Moodboard', children: [] },
        ],
      },
      {
        id: 'q3',
        emoji: '📊',
        title: 'Q3 Campaigns',
        children: [
          { id: 'q3-launch', emoji: '🚀', title: 'Summer Launch', children: [] },
          { id: 'q3-social', emoji: '📱', title: 'Social Plan', children: [] },
        ],
      },
      { id: 'harbor', emoji: '⚓', title: 'Harbor Mobile App', children: [] },
    ],
  },
  {
    id: 'team',
    emoji: '👥',
    title: 'Team Handbook',
    children: [
      { id: 'team-onboard', emoji: '🌱', title: 'Onboarding', children: [] },
      { id: 'team-tools', emoji: '🛠️', title: 'Tools & Access', children: [] },
      { id: 'team-rituals', emoji: '🔁', title: 'Rituals', children: [] },
    ],
  },
  { id: 'meetings', emoji: '🗓️', title: 'Meeting Notes', children: [] },
  { id: 'ideas', emoji: '💡', title: 'Ideas Garden', children: [] },
];

export const CURRENT_DOC: DocRecord = {
  id: 'ns-brief',
  path: ['Docs', 'Projects', 'Northstar Rebrand', 'Creative Brief'],
  emoji: '📝',
  title: 'Northstar Rebrand — Creative Brief',
  blocks: [
    { id: 'h1', type: 'h1', text: 'Northstar Rebrand' },
    { id: 'p0', type: 'p', text: "A complete identity refresh for Northstar Outfitters. We're moving from \"weekend warrior\" to \"thoughtful expedition\" — quieter, more confident, and built for the long haul." },
    { id: 'h2a', type: 'h2', text: 'The opportunity' },
    { id: 'p1', type: 'p', text: 'Northstar has loyal customers but no breakout positioning. Recent research surfaced three things the brand can own: durability, repair-ability, and a slower pace of adventure.' },
    {
      id: 'toggle1', type: 'toggle', text: 'Research summary (3 interviews, 14 surveys)', open: true,
      children: [
        { id: 't1a', type: 'p', text: 'Across all 17 participants, the words "trusted" and "goes the distance" appeared more than any others.' },
        { id: 't1b', type: 'bullet', text: '82% own at least one piece >5 years old' },
        { id: 't1c', type: 'bullet', text: 'Repair service is under-marketed but highly loved' },
        { id: 't1d', type: 'bullet', text: 'Younger buyers want quieter, less logo-forward design' },
      ],
    },
    { id: 'h2b', type: 'h2', text: 'Audience' },
    { id: 'p2', type: 'p', text: 'We\'re focusing on the 28–45 "return customer" — people who already own one or two pieces and want the next purchase to feel intentional.' },
    { id: 'h2c', type: 'h2', text: 'Deliverables' },
    { id: 'ch1', type: 'check', text: 'Brand mark and lockup system', done: true },
    { id: 'ch2', type: 'check', text: 'Type pairing and color palette', done: true },
    { id: 'ch3', type: 'check', text: 'Photography direction and shot list', done: false },
    { id: 'ch4', type: 'check', text: 'Packaging refresh — primary and secondary', done: false },
    { id: 'ch5', type: 'check', text: 'Site refresh — hero, PDP, repair pages', done: false },
    { id: 'h2d', type: 'h2', text: 'Voice & tone' },
    { id: 'quote1', type: 'quote', text: 'Confident, not loud. Specific, not clever. We earn trust by leaving things unsaid.' },
    { id: 'h2e', type: 'h2', text: 'Working principles' },
    { id: 'num1', type: 'numbered', text: 'Show the product. The hero is always the thing being made.', n: 1 },
    { id: 'num2', type: 'numbered', text: 'Respect attention. One idea per surface.', n: 2 },
    { id: 'num3', type: 'numbered', text: 'Design for repair. Every system has a second act.', n: 3 },
    { id: 'h2f', type: 'h2', text: 'Reference — color tokens' },
    { id: 'code1', type: 'code', text: '// Northstar palette\n--ink:       #1A1814;\n--bone:      #F4EFE6;\n--moss:      #4A5A3E;\n--rust:      #C76A3C;\n--river:     #6B89A6;' },
    { id: 'div1', type: 'divider' },
    { id: 'p3', type: 'p', text: 'Owner: Maya Chen · Last reviewed by Anders Holm · Next review: Friday' },
  ],
};

export const TEMPLATES_STARTER: TemplateItem[] = [
  { id: 'blank', name: 'Blank doc', count: '1 block' },
  { id: 'brief', name: 'Creative brief', count: '12 blocks', selected: true },
  { id: 'meeting', name: 'Meeting notes', count: '8 blocks' },
  { id: 'decision', name: 'Decision log', count: '6 blocks' },
  { id: 'retro', name: 'Project retro', count: '10 blocks' },
  { id: 'onepager', name: 'One-pager', count: '5 blocks' },
];

export const TEMPLATES_MINE: TemplateItem[] = [
  { id: 'studio-brief', name: 'Studio brief (Maya)', count: '14 blocks' },
  { id: 'weekly', name: 'Weekly review', count: '7 blocks' },
];

export const SEARCH_RESULTS: SearchResult[] = [
  { id: 'ns-brief', emoji: '📝', title: 'Creative Brief', path: 'Projects › Northstar Rebrand', snip: '...pairing and color palette — finalized **type** specimen pages...' },
  { id: 'ns-research', emoji: '🔬', title: 'Research Notes', path: 'Projects › Northstar Rebrand', snip: '..set the wrong **type** of expectation early on...' },
  { id: 'team-tools', emoji: '🛠️', title: 'Tools & Access', path: 'Team Handbook', snip: '...the **type** specimen library lives in /brand/specimens...' },
  { id: 'harbor', emoji: '⚓', title: 'Harbor Mobile App', path: 'Projects', snip: '...exploring a new **type** scale based on a 1.25 ratio...' },
  { id: 'q3-launch', emoji: '🚀', title: 'Summer Launch', path: 'Projects › Q3 Campaigns', snip: '...display **type** is set in a custom variant of Söhne...' },
];

export const EMOJI_CATEGORIES: EmojiCategory[] = [
  { id: 'recent', icon: '🕒', emojis: ['📝', '💡', '📁', '🌟', '🚀', '📊', '🎨', '👥'] },
  { id: 'smileys', icon: '😀', emojis: ['😀','😃','😄','😁','😆','😅','🤣','😂','🙂','🙃','😉','😊','😇','🥰','😍','🤩','😘','😗','☺️','😚','😙','🥲','😋','😛'] },
  { id: 'objects', icon: '💡', emojis: ['💡','📝','📓','📔','📒','📕','📗','📘','📙','📚','📖','🔖','🧷','🔗','📎','🖇','📐','📏','🧮','📌','📍','✂️','🖊','🖋'] },
  { id: 'symbols', icon: '✨', emojis: ['⭐','🌟','✨','💫','⚡','🔥','💧','🌊','❄️','☀️','🌤','⛅','☁️','🌧','⛈','🌩','🌨','🌪','🌫','🌈','🎯','🎲','🎮','🎼'] },
  { id: 'places', icon: '🏔', emojis: ['🏔','⛰','🗻','🏕','🏖','🏜','🏝','🏞','🏟','🏛','🏗','🧱','🏘','🏚','🏠','🏡','🏢','🏣','🏤','🏥','🏦','🏨','🏩','🏪'] },
];
