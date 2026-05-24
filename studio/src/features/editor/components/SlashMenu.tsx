import React from 'react';
import { I } from '../../../components/icons';

interface SlashMenuProps {
  position: { x: number; y: number };
  query: string;
  activeIdx: number;
  onPick: (id: string) => void;
}

const GROUPS = [
  { label: 'Text', items: [
    { id: 'p',        label: 'Paragraph',   Icon: I.Type,        kbd: null },
    { id: 'h1',       label: 'Heading 1',   Icon: I.Heading1,    kbd: '#' },
    { id: 'h2',       label: 'Heading 2',   Icon: I.Heading2,    kbd: '##' },
    { id: 'h3',       label: 'Heading 3',   Icon: I.Heading3,    kbd: '###' },
  ]},
  { label: 'Lists', items: [
    { id: 'bullet',   label: 'Bullet list', Icon: I.List,        kbd: '-' },
    { id: 'numbered', label: 'Numbered',    Icon: I.ListOrdered, kbd: '1.' },
    { id: 'check',    label: 'Checklist',   Icon: I.CheckSquare, kbd: '[]' },
    { id: 'toggle',   label: 'Toggle',      Icon: I.ChevronRight,kbd: '>' },
  ]},
  { label: 'Structure', items: [
    { id: 'code',     label: 'Code block',  Icon: I.Code2,       kbd: '```' },
    { id: 'quote',    label: 'Quote',       Icon: I.Quote,       kbd: '"' },
    { id: 'divider',  label: 'Divider',     Icon: I.Minus,       kbd: '---' },
  ]},
  { label: 'Media', items: [
    { id: 'image',    label: 'Image',       Icon: I.Image,       kbd: null },
  ]},
  { label: 'Navigation', items: [
    { id: 'subpage',  label: 'Sub-page',    Icon: I.FileText,    kbd: null },
  ]},
];

export const SlashMenu: React.FC<SlashMenuProps> = ({ position, query, activeIdx, onPick }) => {
  let flatIdx = -1;
  return (
    <div className="doc-slash-menu" style={{ left: position.x, top: position.y }}>
      <div className="doc-slash-query">/{query}</div>
      {GROUPS.map((g) => (
        <div key={g.label}>
          <div className="doc-slash-group">{g.label}</div>
          {g.items.map((it) => {
            flatIdx++;
            const isActive = flatIdx === activeIdx;
            return (
              <div
                key={it.id}
                className={`doc-slash-item ${isActive ? 'active' : ''}`}
                onClick={() => onPick(it.id)}
              >
                <it.Icon size={14} className="doc-slash-icon" />
                <span>{it.label}</span>
                {it.kbd && <span className="doc-slash-kbd">{it.kbd}</span>}
              </div>
            );
          })}
        </div>
      ))}
    </div>
  );
};
