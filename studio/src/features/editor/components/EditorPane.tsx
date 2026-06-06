import React from 'react';
import type { JSONContent, Editor } from '@tiptap/react';
import { I } from '../../../components/icons';
import { TiptapEditor } from './TiptapEditor';
import { ExportMenuDropdown } from './ExportMenuDropdown';

interface EditorPaneProps {
  docId: string;
  path: string[];
  title: string;
  onTitleChange: (v: string) => void;
  emoji: string | null;
  onPickEmoji: () => void;
  dirty: boolean;
  saving: boolean;
  exportOpen: boolean;
  onOpenExport: (e: React.MouseEvent) => void;
  onCloseExport: () => void;
  initialContent: JSONContent;
  onContentChange: (json: JSONContent) => void;
  onEditorReady: (editor: Editor) => void;
  onShare: () => void;
  onMore: () => void;
  onExportMarkdown: () => void;
  onExportPlainText: () => void;
  onExportPDF: () => void;
  onCopyMarkdown: () => void;
  onOpenShareSheet?: () => void;
  onTriggerPdfExport?: () => void;
}

export const EditorPane: React.FC<EditorPaneProps> = ({
  docId, path, title, onTitleChange, emoji, onPickEmoji, dirty, saving,
  exportOpen, onOpenExport, onCloseExport,
  initialContent, onContentChange, onEditorReady,
  onShare, onMore,
  onExportMarkdown, onExportPlainText, onExportPDF, onCopyMarkdown,
  onOpenShareSheet, onTriggerPdfExport,
}) => (
  <div className="doc-editor">
    {/* Breadcrumb */}
    <div className="doc-breadcrumb">
      <span className="doc-breadcrumb-item">
        <I.BookOpen size={12} />
        <span>Docs</span>
      </span>
      {path.slice(1, -1).map((p, i) => (
        <React.Fragment key={i}>
          <span className="doc-breadcrumb-sep">/</span>
          <span className="doc-breadcrumb-item">{p}</span>
        </React.Fragment>
      ))}
      {path.length > 1 && (
        <>
          <span className="doc-breadcrumb-sep">/</span>
          <span className="doc-breadcrumb-item current">{path[path.length - 1]}</span>
        </>
      )}
    </div>

    {/* Page header */}
    <div className="doc-page-header">
      <button
        className={`doc-page-icon-btn ${emoji ? '' : 'empty'}`}
        onClick={onPickEmoji}
        title="Change icon"
      >
        {emoji || <I.File size={20} />}
      </button>
      <input
        className="doc-page-title-input"
        value={title}
        placeholder="Untitled"
        onChange={(e) => onTitleChange(e.target.value)}
      />
      <div className="doc-page-meta">
        <span className={`doc-save-status ${dirty ? 'dirty' : ''}`}>
          {saving ? 'Saving…' : dirty ? '• Unsaved' : 'Saved ✓'}
        </span>
        <div style={{ position: 'relative' }}>
          <button className="doc-btn doc-btn-ghost sm" onClick={onOpenExport} title="Export (⌘E for PDF)">
            <I.FileDown size={14} /> Export
            <span className="doc-shortcut-hint">⌘E</span>
          </button>
          {exportOpen && (
            <ExportMenuDropdown
              onClose={onCloseExport}
              onMarkdown={onExportMarkdown}
              onPlainText={onExportPlainText}
              onPDF={onExportPDF}
              onCopyMarkdown={onCopyMarkdown}
            />
          )}
        </div>
        <button className="doc-btn doc-btn-ghost sm" onClick={() => onOpenShareSheet?.()} title="Share (⌘S)">
          <I.Share2 size={14} /> Share
          <span className="doc-shortcut-hint">⌘S</span>
        </button>
        <button className="doc-btn-icon" onClick={onMore}>
          <I.MoreHorizontal size={16} />
        </button>
      </div>
    </div>

    {/* Tiptap canvas — key=docId forces remount when switching docs */}
    <TiptapEditor key={docId} initialContent={initialContent} onChange={onContentChange} onEditorReady={onEditorReady} onOpenShareSheet={onOpenShareSheet} onTriggerPdfExport={onTriggerPdfExport} />
  </div>
);
