import React, { useEffect } from 'react';
import { I } from '../../../components/icons';

interface BlockContextMenuProps {
  x: number;
  y: number;
  onClose: () => void;
  onAction: (action: string) => void;
  demo?: boolean;
}

export const BlockContextMenu: React.FC<BlockContextMenuProps> = ({ x, y, onClose, onAction, demo }) => {
  useEffect(() => {
    if (demo) return;
    const close = () => onClose();
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    const id = setTimeout(() => window.addEventListener('click', close), 0);
    window.addEventListener('keydown', onKey);
    return () => {
      clearTimeout(id);
      window.removeEventListener('click', close);
      window.removeEventListener('keydown', onKey);
    };
  }, [onClose, demo]);

  return (
    <div
      className="doc-menu"
      style={{ left: x, top: y, width: 200 }}
      onClick={(e) => e.stopPropagation()}
    >
      <div className="doc-menu-item" onClick={() => onAction('turninto')}>
        <I.RefreshCw size={14} className="doc-icon" />
        Turn into
        <I.ChevronRight size={12} style={{ marginLeft: 'auto', color: 'var(--doc-text-3)' }} />
      </div>
      <div className="doc-menu-item" onClick={() => onAction('duplicate')}>
        <I.Copy size={14} className="doc-icon" />
        Duplicate
        <span className="doc-kbd">⌘D</span>
      </div>
      <div className="doc-menu-item" onClick={() => onAction('copyMd')}>
        <I.Clipboard size={14} className="doc-icon" />
        Copy as Markdown
      </div>
      <div className="doc-menu-divider" />
      <div className="doc-menu-item danger" onClick={() => onAction('delete')}>
        <I.Trash2 size={14} className="doc-icon" />
        Delete
      </div>
    </div>
  );
};
