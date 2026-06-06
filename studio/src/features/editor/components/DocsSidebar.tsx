import React, { useEffect, useRef, useState } from 'react';
import type { JSONContent } from '@tiptap/react';
import { I } from '../../../components/icons';
import type { PageNode } from '../types';
import { docsApi } from '../lib/docsApi';
import type { ApiDocSummary } from '../lib/docsApi';
import { STARTER_TEMPLATES } from '../data/starterTemplates';

interface DocsSidebarProps {
  pages: PageNode[];
  activeId: string;
  expandedIds: Set<string>;
  onToggleExpand: (id: string) => void;
  onSelect: (id: string) => void;
  onOpenSearch: () => void;
  onOpenContext: (id: string, el: HTMLElement) => void;
  onNewDoc: () => void;
  dropTarget?: { id: string; position: 'above' | 'below' } | null;
  showTemplates: boolean;
  setShowTemplates: (v: boolean) => void;
  onUseTemplate?: (id: string, blocks?: JSONContent[]) => Promise<void> | void;
  renamingId?: string | null;
  onRenameCommit?: (id: string, title: string) => void;
  onRenameCancel?: () => void;
  loading?: boolean;
  onDragStart?: (id: string) => void;
  onDragOver?: (id: string, clientY: number, rect: DOMRect) => void;
  onDrop?: (id: string) => void;
  onDragEnd?: () => void;
}

export const DocsSidebar: React.FC<DocsSidebarProps> = ({
  pages, activeId, expandedIds, onToggleExpand, onSelect,
  onOpenSearch, onOpenContext, onNewDoc, dropTarget,
  showTemplates, setShowTemplates, onUseTemplate,
  renamingId, onRenameCommit, onRenameCancel, loading,
  onDragStart, onDragOver, onDrop, onDragEnd,
}) => {
  const [sidebarTemplates, setSidebarTemplates] = useState<ApiDocSummary[]>([]);
  const [previewTemplate, setPreviewTemplate] = useState<typeof STARTER_TEMPLATES[0] | null>(null);
  const [creating, setCreating] = useState(false);
  const previewRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!showTemplates) return;
    docsApi.listTemplates().then(setSidebarTemplates).catch(() => {});
  }, [showTemplates]);

  // Close preview on outside click
  useEffect(() => {
    if (!previewTemplate) return;
    const onDown = (e: MouseEvent) => {
      if (previewRef.current && !previewRef.current.contains(e.target as Node)) {
        setPreviewTemplate(null);
      }
    };
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, [previewTemplate]);

  const handleUseTemplate = async () => {
    if (!previewTemplate || !onUseTemplate) return;
    setCreating(true);
    try {
      await onUseTemplate(previewTemplate.id, previewTemplate.blocks);
      setPreviewTemplate(null);
    } finally {
      setCreating(false);
    }
  };

  return (
  <div className="docsside" style={{ position: 'relative' }}>
    <div className="docsside-header">
      <button
        className="doc-btn doc-btn-subtle sm"
        onClick={onNewDoc}
        style={{ flex: 1, justifyContent: 'flex-start', paddingLeft: 8 }}
      >
        <I.Plus size={14} /> New Doc
      </button>
      <button className="doc-btn-icon" title="Search (⌘P)" onClick={onOpenSearch}>
        <I.Search size={16} />
      </button>
    </div>

    <div className="doc-tree">
      <SectionLabel label="Pages" collapsed={false} canAdd onAdd={onNewDoc} />
      {loading && (
        <div style={{ padding: '12px 8px', color: 'var(--doc-text-3)', fontSize: 12 }}>Loading…</div>
      )}
      {!loading && pages.map((p) => (
        <PageNodeItem
          key={p.id}
          page={p}
          depth={0}
          activeId={activeId}
          expandedIds={expandedIds}
          onToggleExpand={onToggleExpand}
          onSelect={onSelect}
          onOpenContext={onOpenContext}
          dropTarget={dropTarget}
          renamingId={renamingId}
          onRenameCommit={onRenameCommit}
          onRenameCancel={onRenameCancel}
          onDragStart={onDragStart}
          onDragOver={onDragOver}
          onDrop={onDrop}
          onDragEnd={onDragEnd}
        />
      ))}

      <div style={{ height: 12 }} />
      <SectionLabel
        label="Templates"
        collapsed={!showTemplates}
        onToggle={() => setShowTemplates(!showTemplates)}
      />
      {showTemplates && (
        <>
          {STARTER_TEMPLATES.map((t) => (
            <TemplateRow
              key={t.id}
              emoji={t.emoji}
              title={t.name}
              active={previewTemplate?.id === t.id}
              onClick={() => setPreviewTemplate(previewTemplate?.id === t.id ? null : t)}
            />
          ))}
          {sidebarTemplates.length > 0 && (
            <>
              <div style={{ padding: '8px 8px 2px 8px', color: 'var(--doc-text-3)', fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                Saved
              </div>
              {sidebarTemplates.map((t) => (
                <TemplateRow
                  key={t.id}
                  emoji={t.emoji || '📄'}
                  title={t.title || 'Untitled'}
                  onClick={() => onUseTemplate?.(t.id)}
                />
              ))}
            </>
          )}
        </>
      )}
    </div>

    {/* Template preview panel — slides in above the sidebar */}
    {previewTemplate && (
      <div
        ref={previewRef}
        style={{
          position: 'absolute',
          left: '100%',
          top: 0,
          width: 280,
          background: 'var(--doc-surface)',
          border: '1px solid var(--doc-border)',
          borderRadius: 10,
          boxShadow: '0 8px 32px rgba(0,0,0,0.18)',
          zIndex: 50,
          marginLeft: 8,
          padding: '16px',
          display: 'flex',
          flexDirection: 'column',
          gap: 10,
        }}
      >
        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ fontSize: 22 }}>{previewTemplate.emoji}</span>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontWeight: 600, fontSize: 13, color: 'var(--doc-text)', lineHeight: 1.3 }}>{previewTemplate.name}</div>
            <div style={{ fontSize: 11, color: 'var(--doc-text-3)', lineHeight: 1.4, marginTop: 2 }}>{previewTemplate.description}</div>
          </div>
        </div>

        {/* Block preview — first 6 headings/paragraphs */}
        <div style={{
          background: 'var(--doc-bg)',
          border: '1px solid var(--doc-border)',
          borderRadius: 6,
          padding: '10px 12px',
          display: 'flex',
          flexDirection: 'column',
          gap: 4,
          maxHeight: 180,
          overflow: 'hidden',
        }}>
          {previewTemplate.blocks
            .filter(b => b.type === 'heading' || b.type === 'paragraph')
            .slice(0, 7)
            .map((b, i) => {
              const text = (b.content as any)?.[0]?.text ?? '';
              if (!text) return null;
              const isH = b.type === 'heading';
              const level = (b.attrs as any)?.level ?? 2;
              return (
                <div key={i} style={{
                  fontSize: isH ? (level === 2 ? 11 : 10) : 10,
                  fontWeight: isH ? 600 : 400,
                  color: isH ? 'var(--doc-text)' : 'var(--doc-text-3)',
                  lineHeight: 1.4,
                  paddingLeft: isH ? 0 : 8,
                  whiteSpace: 'nowrap',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                }}>
                  {text}
                </div>
              );
            })}
          <div style={{ fontSize: 10, color: 'var(--doc-text-3)', opacity: 0.6, marginTop: 2 }}>
            {previewTemplate.blocks.length} blocks
          </div>
        </div>

        {/* CTA */}
        <button
          className="doc-btn doc-btn-primary"
          style={{ width: '100%', justifyContent: 'center' }}
          disabled={creating}
          onClick={handleUseTemplate}
        >
          {creating ? 'Creating…' : 'Use this template'}
        </button>
      </div>
    )}
  </div>
  );
};

interface SectionLabelProps {
  label: string;
  collapsed?: boolean;
  onToggle?: () => void;
  canAdd?: boolean;
  onAdd?: () => void;
}

const SectionLabel: React.FC<SectionLabelProps> = ({ label, collapsed, onToggle, canAdd, onAdd }) => (
  <div
    className={`doc-tree-section-label ${collapsed ? 'collapsed' : ''}`}
    onClick={onToggle}
  >
    {onToggle != null && <I.ChevronDown size={10} className="doc-chev" />}
    <span>{label}</span>
    {canAdd && (
      <button
        className="doc-section-add"
        onClick={(e) => { e.stopPropagation(); onAdd?.(); }}
        title="New page"
      >
        <I.Plus size={12} />
      </button>
    )}
  </div>
);

interface PageNodeItemProps {
  page: PageNode;
  depth: number;
  activeId: string;
  expandedIds: Set<string>;
  onToggleExpand: (id: string) => void;
  onSelect: (id: string) => void;
  onOpenContext: (id: string, el: HTMLElement) => void;
  dropTarget?: { id: string; position: 'above' | 'below' } | null;
  renamingId?: string | null;
  onRenameCommit?: (id: string, title: string) => void;
  onRenameCancel?: () => void;
  onDragStart?: (id: string) => void;
  onDragOver?: (id: string, clientY: number, rect: DOMRect) => void;
  onDrop?: (id: string) => void;
  onDragEnd?: () => void;
}

const PageNodeItem: React.FC<PageNodeItemProps> = ({
  page, depth, activeId, expandedIds, onToggleExpand, onSelect, onOpenContext, dropTarget,
  renamingId, onRenameCommit, onRenameCancel,
  onDragStart, onDragOver, onDrop, onDragEnd,
}) => {
  const isActive = activeId === page.id;
  const isOpen = expandedIds.has(page.id);
  const hasChildren = page.children && page.children.length > 0;
  const indentPx = 8 + depth * 16;
  const isRenaming = renamingId === page.id;
  const [renameVal, setRenameVal] = useState(page.title);
  const renameRef = useRef<HTMLInputElement>(null);

  // Focus and select-all when rename mode starts
  useEffect(() => {
    if (isRenaming) {
      setRenameVal(page.title);
      setTimeout(() => { renameRef.current?.select(); }, 10);
    }
  }, [isRenaming, page.title]);

  const commitRename = () => {
    const v = renameVal.trim();
    onRenameCommit?.(page.id, v || page.title);
  };

  return (
    <>
      {dropTarget?.id === page.id && dropTarget.position === 'above' && <div className="doc-drop-indicator" />}
      <div
        className={`doc-tree-item ${isActive ? 'active' : ''}`}
        style={{ paddingLeft: indentPx }}
        draggable={!isRenaming}
        onClick={() => !isRenaming && onSelect(page.id)}
        onDragStart={(e) => {
          e.dataTransfer.effectAllowed = 'move';
          // Use a tiny transparent ghost image so native ghost doesn't flicker
          const ghost = document.createElement('div');
          ghost.style.cssText = 'position:fixed;top:-999px;left:-999px;pointer-events:none;';
          document.body.appendChild(ghost);
          e.dataTransfer.setDragImage(ghost, 0, 0);
          setTimeout(() => document.body.removeChild(ghost), 0);
          onDragStart?.(page.id);
        }}
        onDragOver={(e) => {
          e.preventDefault();
          e.dataTransfer.dropEffect = 'move';
          const rect = e.currentTarget.getBoundingClientRect();
          onDragOver?.(page.id, e.clientY, rect);
        }}
        onDrop={(e) => {
          e.preventDefault();
          onDrop?.(page.id);
        }}
        onDragEnd={() => onDragEnd?.()}
      >
        <button
          className={`doc-tree-expander ${hasChildren ? '' : 'empty'} ${isOpen ? 'open' : ''}`}
          onClick={(e) => { e.stopPropagation(); if (hasChildren) onToggleExpand(page.id); }}
        >
          <I.ChevronRight size={12} className="doc-chev" />
        </button>
        <span className="doc-tree-icon">
          {page.emoji ? page.emoji : <I.File size={14} style={{ color: 'var(--doc-text-3)' }} />}
        </span>
        {isRenaming ? (
          <input
            ref={renameRef}
            className="doc-tree-rename-input"
            value={renameVal}
            onChange={(e) => setRenameVal(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') { e.preventDefault(); commitRename(); }
              if (e.key === 'Escape') { e.preventDefault(); onRenameCancel?.(); }
            }}
            onBlur={commitRename}
            onClick={(e) => e.stopPropagation()}
          />
        ) : (
          <span className="doc-tree-title">{page.title || 'Untitled'}</span>
        )}
        {!isRenaming && (
          <button
            className="doc-tree-menu"
            onClick={(e) => { e.stopPropagation(); onOpenContext(page.id, e.currentTarget); }}
            title="More"
          >
            <I.MoreHorizontal size={14} />
          </button>
        )}
      </div>
      {dropTarget?.id === page.id && dropTarget.position === 'below' && <div className="doc-drop-indicator" />}
      {isOpen && hasChildren && page.children.map((c) => (
        <PageNodeItem
          key={c.id}
          page={c}
          depth={depth + 1}
          activeId={activeId}
          expandedIds={expandedIds}
          onToggleExpand={onToggleExpand}
          onSelect={onSelect}
          onOpenContext={onOpenContext}
          dropTarget={dropTarget}
          renamingId={renamingId}
          onRenameCommit={onRenameCommit}
          onRenameCancel={onRenameCancel}
          onDragStart={onDragStart}
          onDragOver={onDragOver}
          onDrop={onDrop}
          onDragEnd={onDragEnd}
        />
      ))}
    </>
  );
};

const TemplateRow: React.FC<{ emoji: string; title: string; active?: boolean; onClick?: () => void }> = ({ emoji, title, active, onClick }) => (
  <div
    className={`doc-tree-item${active ? ' active' : ''}`}
    style={{ paddingLeft: 8, cursor: 'pointer', background: active ? 'var(--doc-hover)' : undefined }}
    onClick={onClick}
    title={`Preview "${title}"`}
  >
    <span className="doc-tree-expander empty" />
    <span className="doc-tree-icon">{emoji}</span>
    <span className="doc-tree-title" style={{ color: active ? 'var(--doc-text)' : 'var(--doc-text-2)' }}>{title}</span>
    <span style={{ marginLeft: 'auto', fontSize: 10, color: 'var(--doc-text-3)', paddingRight: 4 }}>›</span>
  </div>
);
