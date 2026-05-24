import React, { useState, useRef, useEffect } from 'react';
import { I } from '../../../components/icons';
import type { ActiveFormats } from '../types';

type BlockType = 'p' | 'h1' | 'h2' | 'h3' | 'bullet' | 'numbered' | 'check' | 'quote' | 'toggle' | 'code';

const BLOCK_LABEL: Record<string, string> = {
  p: 'Paragraph', h1: 'Heading 1', h2: 'Heading 2', h3: 'Heading 3',
  bullet: 'Bullet', numbered: 'Numbered', check: 'Checklist',
  quote: 'Quote', toggle: 'Toggle', code: 'Code',
};

const TURN_ITEMS: { id: string; label: string; Icon: React.ElementType }[] = [
  { id: 'p',        label: 'Paragraph', Icon: I.Type },
  { id: 'h1',       label: 'Heading 1', Icon: I.Heading1 },
  { id: 'h2',       label: 'Heading 2', Icon: I.Heading2 },
  { id: 'h3',       label: 'Heading 3', Icon: I.Heading3 },
  { id: 'bullet',   label: 'Bullet',    Icon: I.List },
  { id: 'numbered', label: 'Numbered',  Icon: I.ListOrdered },
  { id: 'check',    label: 'Checklist', Icon: I.CheckSquare },
  { id: 'quote',    label: 'Quote',     Icon: I.Quote },
  { id: 'toggle',   label: 'Toggle',    Icon: I.ChevronRight },
];

const TEXT_COLORS = [
  { name: 'default', c: '#1D1D1F' },
  { name: 'red',     c: '#FF453A' },
  { name: 'orange',  c: '#FF9F0A' },
  { name: 'yellow',  c: '#FFD60A' },
  { name: 'green',   c: '#34C759' },
  { name: 'blue',    c: '#5E5CE6' },
];

interface FloatingToolbarProps {
  position: { x: number; y: number } | null;
  inline?: boolean;
  activeFormats: ActiveFormats;
  blockType: BlockType;
  onFormat: (fmt: keyof ActiveFormats) => void;
  onTurnInto: (type: string) => void;
  currentLinkUrl?: string;
  onLinkSubmit?: (url: string) => void;
  onLinkUnset?: () => void;
  showTurnDropdown: boolean;
  setShowTurnDropdown: (v: boolean) => void;
  showLinkEditor: boolean;
  setShowLinkEditor: (v: boolean) => void;
  showColorPicker: boolean;
  setShowColorPicker: (v: boolean) => void;
  onColorPick?: (hex: string) => void;
  activeColor?: string;
}

export const FloatingToolbar: React.FC<FloatingToolbarProps> = ({
  position, inline, activeFormats, blockType, onFormat, onTurnInto,
  currentLinkUrl, onLinkSubmit, onLinkUnset,
  showTurnDropdown, setShowTurnDropdown,
  showLinkEditor, setShowLinkEditor,
  showColorPicker, setShowColorPicker,
  onColorPick, activeColor,
}) => {
  if (!inline && !position) return null;
  const blockLabel = BLOCK_LABEL[blockType] ?? 'Paragraph';
  const posStyle = (!inline && position) ? { left: position.x, top: position.y } : undefined;

  return (
    <div className="doc-floating-tb" style={posStyle}>
      <button
        className={`doc-tb-btn${activeFormats.bold ? ' active' : ''}`}
        onMouseDown={(e) => { e.preventDefault(); onFormat('bold'); }}
        title="Bold (⌘B)"
      ><I.Bold size={13} /></button>

      <button
        className={`doc-tb-btn${activeFormats.italic ? ' active' : ''}`}
        onMouseDown={(e) => { e.preventDefault(); onFormat('italic'); }}
        title="Italic (⌘I)"
      ><I.Italic size={13} /></button>

      <button
        className={`doc-tb-btn${activeFormats.underline ? ' active' : ''}`}
        onMouseDown={(e) => { e.preventDefault(); onFormat('underline'); }}
        title="Underline (⌘U)"
      ><I.Underline size={13} /></button>

      <button
        className={`doc-tb-btn${activeFormats.strike ? ' active' : ''}`}
        onMouseDown={(e) => { e.preventDefault(); onFormat('strike'); }}
        title="Strikethrough"
      ><I.Strikethrough size={13} /></button>

      <span className="doc-tb-divider" />

      <button
        className={`doc-tb-btn${activeFormats.code ? ' active' : ''}`}
        onMouseDown={(e) => { e.preventDefault(); onFormat('code'); }}
        title="Inline code"
      ><I.Code2 size={13} /></button>

      <div style={{ position: 'relative' }}>
        <button
          className={`doc-tb-btn${activeFormats.link ? ' active' : ''}`}
          onMouseDown={(e) => { e.preventDefault(); setShowLinkEditor(!showLinkEditor); setShowTurnDropdown(false); setShowColorPicker(false); }}
          title="Link (⌘K)"
        ><I.Link2 size={13} /></button>
        {showLinkEditor && (
          <LinkEditPopover
            initialUrl={currentLinkUrl ?? ''}
            onSubmit={(url) => { onLinkSubmit?.(url); setShowLinkEditor(false); }}
            onUnset={() => { onLinkUnset?.(); setShowLinkEditor(false); }}
            onClose={() => setShowLinkEditor(false)}
          />
        )}
      </div>

      <span className="doc-tb-divider" />

      <div style={{ position: 'relative' }}>
        <button
          className="doc-tb-btn doc-tb-turninto"
          onMouseDown={(e) => { e.preventDefault(); setShowTurnDropdown(!showTurnDropdown); setShowLinkEditor(false); setShowColorPicker(false); }}
          title="Turn into"
        >
          <span style={{ fontSize: 12 }}>{blockLabel}</span>
          <I.ChevronDown size={11} />
        </button>
        {showTurnDropdown && (
          <TurnIntoDropdown
            current={blockType}
            onPick={(t) => { onTurnInto(t); setShowTurnDropdown(false); }}
          />
        )}
      </div>

      <div style={{ position: 'relative' }}>
        <button
          className="doc-tb-btn"
          onMouseDown={(e) => { e.preventDefault(); setShowColorPicker(!showColorPicker); setShowLinkEditor(false); setShowTurnDropdown(false); }}
          title="Text color"
          style={activeColor ? { borderBottom: `2px solid ${activeColor}` } : undefined}
        ><I.Baseline size={13} /></button>
        {showColorPicker && (
          <TextColorSwatches
            active={activeColor}
            onPick={(c) => { onColorPick?.(c.c); setShowColorPicker(false); }}
          />
        )}
      </div>
    </div>
  );
};

export const TurnIntoDropdown: React.FC<{ current: string; onPick: (t: string) => void }> = ({ current, onPick }) => (
  <div className="doc-turn-dropdown">
    {TURN_ITEMS.map(({ id, label, Icon }) => (
      <div key={id} className={`doc-turn-item${current === id ? ' active' : ''}`} onMouseDown={(e) => { e.preventDefault(); onPick(id); }}>
        <Icon size={14} className="doc-icon" />
        <span>{label}</span>
        {current === id && <I.Check size={12} style={{ marginLeft: 'auto', color: 'var(--doc-primary)' }} />}
      </div>
    ))}
  </div>
);

export const TextColorSwatches: React.FC<{
  onPick: (c: typeof TEXT_COLORS[0]) => void;
  active?: string;
}> = ({ onPick, active }) => (
  <div className="doc-color-swatches">
    {TEXT_COLORS.map((c) => (
      <div
        key={c.name}
        className={`doc-color-dot${active === c.c ? ' active' : ''}`}
        style={{ background: c.c }}
        onMouseDown={(e) => { e.preventDefault(); onPick(c); }}
        title={c.name}
      />
    ))}
  </div>
);

interface LinkEditPopoverProps {
  initialUrl: string;
  onSubmit: (url: string) => void;
  onUnset: () => void;
  onClose: () => void;
}

export const LinkEditPopover: React.FC<LinkEditPopoverProps> = ({ initialUrl, onSubmit, onUnset, onClose }) => {
  const [url, setUrl] = useState(initialUrl || 'https://');
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    // Select all on open for easy replacement
    setTimeout(() => { inputRef.current?.select(); }, 10);
  }, []);

  // Close on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (!(e.target as HTMLElement).closest('.doc-link-edit')) onClose();
    };
    setTimeout(() => document.addEventListener('mousedown', handler), 100);
    return () => document.removeEventListener('mousedown', handler);
  }, [onClose]);

  const handleSubmit = () => {
    const trimmed = url.trim();
    if (trimmed && trimmed !== 'https://') {
      onSubmit(trimmed.startsWith('http') ? trimmed : `https://${trimmed}`);
    } else {
      onClose();
    }
  };

  return (
    <div className="doc-link-edit" onMouseDown={(e) => e.stopPropagation()}>
      <I.Link2 size={13} style={{ color: 'var(--doc-text-3)', flexShrink: 0 }} />
      <input
        ref={inputRef}
        value={url}
        onChange={(e) => setUrl(e.target.value)}
        placeholder="Paste or type a link…"
        onKeyDown={(e) => {
          if (e.key === 'Enter') { e.preventDefault(); handleSubmit(); }
          if (e.key === 'Escape') { e.preventDefault(); onClose(); }
        }}
      />
      <button className="doc-tb-btn" title="Apply link" onMouseDown={(e) => { e.preventDefault(); handleSubmit(); }}>
        <I.Check size={13} />
      </button>
      {initialUrl && (
        <button className="doc-tb-btn" title="Remove link" onMouseDown={(e) => { e.preventDefault(); onUnset(); }}>
          <I.Unlink size={13} />
        </button>
      )}
    </div>
  );
};

interface ImageInsertPopoverProps {
  position: { x: number; y: number };
  onSubmit: (url: string) => void;
  onClose: () => void;
}

export const ImageInsertPopover: React.FC<ImageInsertPopoverProps> = ({ position, onSubmit, onClose }) => {
  const [url, setUrl] = useState('https://');
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setTimeout(() => { inputRef.current?.focus(); inputRef.current?.select(); }, 10);
  }, []);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (!(e.target as HTMLElement).closest('.doc-image-insert')) onClose();
    };
    setTimeout(() => document.addEventListener('mousedown', handler), 100);
    return () => document.removeEventListener('mousedown', handler);
  }, [onClose]);

  const handleSubmit = () => {
    const trimmed = url.trim();
    if (trimmed && trimmed !== 'https://') {
      onSubmit(trimmed.startsWith('http') ? trimmed : `https://${trimmed}`);
    } else {
      onClose();
    }
  };

  return (
    <div
      className="doc-image-insert"
      style={{ left: position.x, top: position.y }}
      onMouseDown={(e) => e.stopPropagation()}
    >
      <I.Image size={13} style={{ color: 'var(--doc-text-3)', flexShrink: 0 }} />
      <input
        ref={inputRef}
        value={url}
        onChange={(e) => setUrl(e.target.value)}
        placeholder="Paste image URL…"
        onKeyDown={(e) => {
          if (e.key === 'Enter') { e.preventDefault(); handleSubmit(); }
          if (e.key === 'Escape') { e.preventDefault(); onClose(); }
        }}
      />
      <button className="doc-tb-btn" title="Insert image" onMouseDown={(e) => { e.preventDefault(); handleSubmit(); }}>
        <I.Check size={13} />
      </button>
    </div>
  );
};
