import React, { useEffect } from 'react';
import { I } from '../../../components/icons';

interface ExportMenuDropdownProps {
  onClose: () => void;
}

export const ExportMenuDropdown: React.FC<ExportMenuDropdownProps> = ({ onClose }) => {
  useEffect(() => {
    const close = (e: MouseEvent) => {
      if ((e.target as HTMLElement).closest('.doc-export-menu')) return;
      onClose();
    };
    const id = setTimeout(() => window.addEventListener('mousedown', close), 50);
    return () => { clearTimeout(id); window.removeEventListener('mousedown', close); };
  }, [onClose]);

  return (
    <div
      className="doc-menu doc-export-menu"
      style={{ right: 0, top: 'calc(100% + 6px)' }}
      onClick={(e) => e.stopPropagation()}
    >
      <div className="doc-menu-item"><I.FileText size={14} className="doc-icon" />Markdown (.md)</div>
      <div className="doc-menu-item"><I.AlignLeft size={14} className="doc-icon" />Plain Text (.txt)</div>
      <div className="doc-menu-item"><I.FileDown size={14} className="doc-icon" />Word Document (.docx)</div>
      <div className="doc-menu-item"><I.Printer size={14} className="doc-icon" />PDF<span className="doc-sec">(print dialog)</span></div>
      <div className="doc-menu-divider" />
      <div className="doc-menu-item"><I.Clipboard size={14} className="doc-icon" />Copy as Markdown</div>
    </div>
  );
};
