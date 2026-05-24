import React, { useState, useEffect } from 'react';
import { I } from '../../../components/icons';
import { EMOJI_CATEGORIES } from '../data/mockData';

interface EmojiPickerPopoverProps {
  anchor: { left: number; top: number };
  onPick: (emoji: string) => void;
  onRemove: () => void;
  onClose: () => void;
}

export const EmojiPickerPopover: React.FC<EmojiPickerPopoverProps> = ({ anchor, onPick, onRemove, onClose }) => {
  const [cat, setCat] = useState('smileys');
  const [q, setQ] = useState('');

  useEffect(() => {
    const close = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      if (target.closest('.doc-emoji-picker') || target.closest('.doc-page-icon-btn')) return;
      onClose();
    };
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    const id = setTimeout(() => window.addEventListener('click', close), 0);
    window.addEventListener('keydown', onKey);
    return () => {
      clearTimeout(id);
      window.removeEventListener('click', close);
      window.removeEventListener('keydown', onKey);
    };
  }, [onClose]);

  const activeCat = EMOJI_CATEGORIES.find((c) => c.id === cat) ?? EMOJI_CATEGORIES[1];
  const emojis = q
    ? EMOJI_CATEGORIES.flatMap((c) => c.emojis).filter((e) => e.includes(q))
    : activeCat.emojis;

  return (
    <div className="doc-emoji-picker" style={{ left: anchor.left, top: anchor.top }}>
      <div className="doc-emoji-search">
        <I.Search size={14} style={{ color: 'var(--doc-text-3)', flexShrink: 0 }} />
        <input
          autoFocus
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search emoji…"
        />
      </div>
      <div className="doc-emoji-cats">
        {EMOJI_CATEGORIES.map((c) => (
          <button
            key={c.id}
            className={`doc-emoji-cat ${cat === c.id ? 'active' : ''}`}
            onClick={() => setCat(c.id)}
            title={c.id}
          >
            {c.icon}
          </button>
        ))}
      </div>
      <div className="doc-emoji-grid">
        {emojis.map((e, i) => (
          <button key={i} className="doc-emoji-cell" onClick={() => onPick(e)}>{e}</button>
        ))}
      </div>
      <button className="doc-emoji-remove" onClick={onRemove}>Remove icon</button>
    </div>
  );
};
