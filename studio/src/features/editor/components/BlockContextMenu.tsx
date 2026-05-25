import React, { useEffect, useState } from 'react';
import { I } from '../../../components/icons';
import { TurnIntoDropdown } from './FloatingToolbar';

interface BlockContextMenuProps {
  x: number;
  y: number;
  currentBlockType?: string;
  onClose: () => void;
  onAction: (action: string) => void;
  onTurnInto?: (type: string) => void;
}

export const BlockContextMenu: React.FC<BlockContextMenuProps> = ({
  x, y, currentBlockType = 'p', onClose, onAction, onTurnInto,
}) => {
  const [showTurnInto, setShowTurnInto] = useState(false);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    const id = setTimeout(() => window.addEventListener('mousedown', onClose), 0);
    window.addEventListener('keydown', onKey);
    return () => {
      clearTimeout(id);
      window.removeEventListener('mousedown', onClose);
      window.removeEventListener('keydown', onKey);
    };
  }, [onClose]);

  return (
    <div
      className="doc-menu"
      style={{ left: x, top: y, width: 210 }}
      onMouseDown={(e) => e.stopPropagation()}
    >
      {/* Turn into — hover reveals submenu */}
      <div style={{ position: 'relative' }}>
        <div
          className={`doc-menu-item${showTurnInto ? ' active' : ''}`}
          onMouseEnter={() => setShowTurnInto(true)}
          onMouseLeave={() => setShowTurnInto(false)}
        >
          <I.RefreshCw size={14} className="doc-icon" />
          Turn into
          <I.ChevronRight size={12} style={{ marginLeft: 'auto', color: 'var(--doc-text-3)' }} />
        </div>
        {showTurnInto && (
          <div
            style={{ position: 'absolute', left: '100%', top: 0, zIndex: 200 }}
            onMouseEnter={() => setShowTurnInto(true)}
            onMouseLeave={() => setShowTurnInto(false)}
          >
            <TurnIntoDropdown
              current={currentBlockType}
              onPick={(t) => { onTurnInto?.(t); onClose(); }}
            />
          </div>
        )}
      </div>

      <div className="doc-menu-item" onMouseDown={(e) => { e.preventDefault(); onAction('duplicate'); }}>
        <I.Copy size={14} className="doc-icon" />
        Duplicate
        <span className="doc-kbd" style={{ marginLeft: 'auto' }}>⌘⇧D</span>
      </div>

      <div className="doc-menu-item" onMouseDown={(e) => { e.preventDefault(); onAction('copyMd'); }}>
        <I.Clipboard size={14} className="doc-icon" />
        Copy as Markdown
      </div>

      <div className="doc-menu-divider" />

      <div className="doc-menu-item danger" onMouseDown={(e) => { e.preventDefault(); onAction('delete'); }}>
        <I.Trash2 size={14} className="doc-icon" />
        Delete
        <span className="doc-kbd" style={{ marginLeft: 'auto', opacity: 0.5 }}>Del</span>
      </div>
    </div>
  );
};
