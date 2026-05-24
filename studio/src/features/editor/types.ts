export interface DocBlock {
  id: string;
  type: 'h1' | 'h2' | 'h3' | 'p' | 'bullet' | 'numbered' | 'check' | 'quote' | 'code' | 'divider' | 'toggle' | 'image' | 'subpage';
  text?: string;
  done?: boolean;
  open?: boolean;
  n?: number;
  children?: DocBlock[];
}

export interface PageNode {
  id: string;
  emoji?: string;
  title: string;
  children: PageNode[];
  blocks?: DocBlock[];
}

export interface DocRecord {
  id: string;
  path: string[];
  emoji?: string;
  title: string;
  blocks: DocBlock[];
}

export interface SearchResult {
  id: string;
  emoji: string;
  title: string;
  path: string;
  snip: string;
}

export interface TemplateItem {
  id: string;
  name: string;
  count: string;
  selected?: boolean;
}

export interface EmojiCategory {
  id: string;
  icon: string;
  emojis: string[];
}

export interface BlockMenu {
  blockId: string;
  x: number;
  y: number;
}

export interface PageContextMenu {
  id: string;
  x: number;
  y: number;
}

export type ActiveFormats = {
  bold: boolean;
  italic: boolean;
  underline: boolean;
  strike: boolean;
  code: boolean;
  link: boolean;
};
