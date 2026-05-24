import React, { useEffect } from 'react';
import { I } from '../../../components/icons';

interface PageTreeContextMenuProps {
  x: number;
  y: number;
  onClose: () => void;
  onAction: (action: string) => void;
  demo?: boolean;
}

export const PageTreeContextMenu: React.FC<PageTreeContextMenuProps> = ({ x, y, onClose, onAction, demo }) => {
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
      style={{ left: x, top: y, width: 180 }}
      onClick={(e) => e.stopPropagation()}
    >
      <div className="doc-menu-item" onClick={() => onAction('add')}><I.Plus size={14} className="doc-icon" />Add sub-page</div>
      <div className="doc-menu-divider" />
      <div className="doc-menu-item" onClick={() => onAction('rename')}><I.Pencil size={14} className="doc-icon" />Rename</div>
      <div className="doc-menu-item" onClick={() => onAction('duplicate')}><I.Copy size={14} className="doc-icon" />Duplicate</div>
      <div className="doc-menu-item" onClick={() => onAction('move')}><I.CornerUpRight size={14} className="doc-icon" />Move to…</div>
      <div className="doc-menu-divider" />
      <div className="doc-menu-item danger" onClick={() => onAction('delete')}><I.Trash2 size={14} className="doc-icon" />Delete</div>
    </div>
  );
};
