import React, { useEffect, useRef } from 'react';
import Fuse from 'fuse.js';
import { I } from '../../../components/icons';

interface SlashMenuItem {
  id: string;
  label: string;
  group: string;
  Icon: React.ElementType;
  kbd: string | null;
}

const ALL_ITEMS: SlashMenuItem[] = [
  { id: 'p',        label: 'Paragraph',   group: 'Text',       Icon: I.Type,         kbd: null },
  { id: 'h1',       label: 'Heading 1',   group: 'Text',       Icon: I.Heading1,     kbd: '#' },
  { id: 'h2',       label: 'Heading 2',   group: 'Text',       Icon: I.Heading2,     kbd: '##' },
  { id: 'h3',       label: 'Heading 3',   group: 'Text',       Icon: I.Heading3,     kbd: '###' },
  { id: 'bullet',   label: 'Bullet list', group: 'Lists',      Icon: I.List,         kbd: '-' },
  { id: 'numbered', label: 'Numbered',    group: 'Lists',      Icon: I.ListOrdered,  kbd: '1.' },
  { id: 'check',    label: 'Checklist',   group: 'Lists',      Icon: I.CheckSquare,  kbd: '[]' },
  { id: 'toggle',   label: 'Toggle',      group: 'Lists',      Icon: I.ChevronRight, kbd: '>' },
  { id: 'code',     label: 'Code block',  group: 'Structure',  Icon: I.Code2,        kbd: '```' },
  { id: 'quote',    label: 'Quote',       group: 'Structure',  Icon: I.Quote,        kbd: '"' },
  { id: 'divider',  label: 'Divider',     group: 'Structure',  Icon: I.Minus,        kbd: '---' },
  { id: 'image',    label: 'Image',       group: 'Media',      Icon: I.Image,        kbd: null },
  { id: 'subpage',  label: 'Sub-page',    group: 'Navigation', Icon: I.FileText,     kbd: null },
];

const fuse = new Fuse(ALL_ITEMS, {
  keys: ['label', 'id'],
  threshold: 0.4,
  minMatchCharLength: 1,
  includeScore: true,
});

export function getFilteredItems(query: string): SlashMenuItem[] {
  if (!query) return ALL_ITEMS;
  return fuse.search(query).map((r) => r.item);
}

interface SlashMenuProps {
  position: { x: number; y: number };
  query: string;
  activeIdx: number;
  onPick: (id: string) => void;
}

export const SlashMenu: React.FC<SlashMenuProps> = ({ position, query, activeIdx, onPick }) => {
  const items = getFilteredItems(query);
  const activeRef = useRef<HTMLDivElement>(null);

  // Scroll active item into view
  useEffect(() => {
    activeRef.current?.scrollIntoView({ block: 'nearest' });
  }, [activeIdx]);

  // Group items for display
  const groups: { label: string; items: (SlashMenuItem & { flatIdx: number })[] }[] = [];
  items.forEach((item, i) => {
    const last = groups[groups.length - 1];
    if (!last || last.label !== item.group) {
      groups.push({ label: item.group, items: [{ ...item, flatIdx: i }] });
    } else {
      last.items.push({ ...item, flatIdx: i });
    }
  });

  if (items.length === 0) {
    return (
      <div className="doc-slash-menu" style={{ left: position.x, top: position.y }}>
        <div className="doc-slash-empty">No results for "/{query}"</div>
      </div>
    );
  }

  return (
    <div className="doc-slash-menu" style={{ left: position.x, top: position.y }}>
      {query && <div className="doc-slash-query">/{query}</div>}
      {groups.map((g) => (
        <div key={g.label}>
          <div className="doc-slash-group">{g.label}</div>
          {g.items.map((it) => {
            const isActive = it.flatIdx === activeIdx;
            return (
              <div
                key={it.id}
                ref={isActive ? activeRef : null}
                className={`doc-slash-item${isActive ? ' active' : ''}`}
                onMouseDown={(e) => { e.preventDefault(); onPick(it.id); }}
              >
                <span className="doc-slash-icon-wrap"><it.Icon size={14} /></span>
                <span className="doc-slash-label">{it.label}</span>
                {it.kbd && <span className="doc-slash-kbd">{it.kbd}</span>}
              </div>
            );
          })}
        </div>
      ))}
    </div>
  );
};
