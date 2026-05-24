import React from 'react';
import { I } from '../../../components/icons';
import type { ActiveFormats } from '../types';

type BlockType = 'p' | 'h1' | 'h2' | 'h3' | 'bullet' | 'numbered' | 'check' | 'quote' | 'toggle' | 'code';

const BLOCK_LABEL: Record<string, string> = {
  p: 'Paragraph', h1: 'Heading 1', h2: 'Heading 2', h3: 'Heading 3',
  bullet: 'Bullet', numbered: 'Numbered', check: 'Checklist',
  quote: 'Quote', toggle: 'Toggle', code: 'Code',
};

const TURN_ITEMS: { id: string; label: string; Icon: React.ElementType }[] = [
  { id: 'p', label: 'Paragraph', Icon: I.Type },
  { id: 'h1', label: 'Heading 1', Icon: I.Heading1 },
  { id: 'h2', label: 'Heading 2', Icon: I.Heading2 },
  { id: 'h3', label: 'Heading 3', Icon: I.Heading3 },
  { id: 'bullet', label: 'Bullet', Icon: I.List },
  { id: 'numbered', label: 'Numbered', Icon: I.ListOrdered },
  { id: 'check', label: 'Checklist', Icon: I.CheckSquare },
  { id: 'quote', label: 'Quote', Icon: I.Quote },
  { id: 'toggle', label: 'Toggle', Icon: I.ChevronRight },
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
  showTurnDropdown: boolean;
  setShowTurnDropdown: (v: boolean) => void;
  showLinkEditor: boolean;
  setShowLinkEditor: (v: boolean) => void;
  showColorPicker: boolean;
  setShowColorPicker: (v: boolean) => void;
}

export const FloatingToolbar: React.FC<FloatingToolbarProps> = ({
  position, inline, activeFormats, blockType, onFormat, onTurnInto,
  showTurnDropdown, setShowTurnDropdown,
  showLinkEditor, setShowLinkEditor,
  showColorPicker, setShowColorPicker,
}) => {
  if (!inline && !position) return null;
  const blockLabel = BLOCK_LABEL[blockType] ?? 'Paragraph';

  const posStyle = (!inline && position) ? { left: position.x, top: position.y } : undefined;

  return (
    <div className="doc-floating-tb" style={posStyle}>
      <button className={`doc-tb-btn ${activeFormats.bold ? 'active' : ''}`} onClick={() => onFormat('bold')} title="Bold"><I.Bold size={14} /></button>
      <button className={`doc-tb-btn ${activeFormats.italic ? 'active' : ''}`} onClick={() => onFormat('italic')} title="Italic"><I.Italic size={14} /></button>
      <button className={`doc-tb-btn ${activeFormats.underline ? 'active' : ''}`} onClick={() => onFormat('underline')} title="Underline"><I.Underline size={14} /></button>
      <button className={`doc-tb-btn ${activeFormats.strike ? 'active' : ''}`} onClick={() => onFormat('strike')} title="Strikethrough"><I.Strikethrough size={14} /></button>
      <span className="doc-tb-divider" />
      <button className={`doc-tb-btn ${activeFormats.code ? 'active' : ''}`} onClick={() => onFormat('code')} title="Code"><I.Code2 size={14} /></button>
      <button className={`doc-tb-btn ${activeFormats.link ? 'active' : ''}`} onClick={() => setShowLinkEditor(!showLinkEditor)} title="Link"><I.Link2 size={14} /></button>
      <span className="doc-tb-divider" />
      <div style={{ position: 'relative' }}>
        <button
          className="doc-tb-btn doc-tb-turninto"
          onClick={() => setShowTurnDropdown(!showTurnDropdown)}
          style={{ minWidth: 80, paddingRight: 4 }}
          title="Turn into"
        >
          <span style={{ fontSize: 12.5 }}>{blockLabel}</span>
          <I.ChevronDown size={12} />
        </button>
        {showTurnDropdown && (
          <TurnIntoDropdown
            current={blockType}
            onPick={(t) => { onTurnInto(t); setShowTurnDropdown(false); }}
          />
        )}
      </div>
      <div style={{ position: 'relative' }}>
        <button className="doc-tb-btn" onClick={() => setShowColorPicker(!showColorPicker)} title="Text color">
          <I.Baseline size={14} />
        </button>
        {showColorPicker && <TextColorSwatches onPick={() => setShowColorPicker(false)} />}
      </div>
      {showLinkEditor && <LinkEditPopover onClose={() => setShowLinkEditor(false)} />}
    </div>
  );
};

export const TurnIntoDropdown: React.FC<{ current: string; onPick: (t: string) => void }> = ({ current, onPick }) => (
  <div className="doc-turn-dropdown" style={{ top: 'calc(100% + 6px)', left: 0 }}>
    {TURN_ITEMS.map(({ id, label, Icon }) => (
      <div key={id} className="doc-turn-item" onClick={() => onPick(id)}>
        <Icon size={14} className="doc-icon" />
        <span>{label}</span>
        {current === id && <I.Check size={14} className="doc-check" />}
      </div>
    ))}
  </div>
);

export const TextColorSwatches: React.FC<{ onPick: (c: typeof TEXT_COLORS[0]) => void }> = ({ onPick }) => (
  <div className="doc-color-swatches" style={{ top: 'calc(100% + 6px)', right: 0 }}>
    {TEXT_COLORS.map((c) => (
      <div
        key={c.name}
        className="doc-color-dot"
        style={{ background: c.c }}
        onClick={() => onPick(c)}
        title={c.name}
      />
    ))}
  </div>
);

export const LinkEditPopover: React.FC<{ onClose: () => void }> = ({ onClose }) => (
  <div className="doc-link-edit" style={{ top: 'calc(100% + 6px)', left: '50%', transform: 'translateX(-50%)' }}>
    <input autoFocus placeholder="Paste link…" defaultValue="https://" />
    <button className="doc-tb-btn" title="Open"><I.ExternalLink size={14} /></button>
    <button className="doc-tb-btn" title="Unlink" onClick={onClose}><I.Unlink size={14} /></button>
  </div>
);
