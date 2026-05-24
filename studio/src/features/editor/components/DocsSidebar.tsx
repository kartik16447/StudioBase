import React from 'react';
import { I } from '../../../components/icons';
import type { PageNode } from '../types';

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
}

export const DocsSidebar: React.FC<DocsSidebarProps> = ({
  pages, activeId, expandedIds, onToggleExpand, onSelect,
  onOpenSearch, onOpenContext, onNewDoc, dropTarget,
  showTemplates, setShowTemplates,
}) => (
  <div className="docsside">
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
      {pages.map((p) => (
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
          <TemplateRow emoji="📝" title="Creative brief" />
          <TemplateRow emoji="🗒️" title="Meeting notes" />
          <TemplateRow emoji="✅" title="Decision log" />
          <TemplateRow emoji="🔁" title="Project retro" />
        </>
      )}
    </div>
  </div>
);

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
}

const PageNodeItem: React.FC<PageNodeItemProps> = ({
  page, depth, activeId, expandedIds, onToggleExpand, onSelect, onOpenContext, dropTarget,
}) => {
  const isActive = activeId === page.id;
  const isOpen = expandedIds.has(page.id);
  const hasChildren = page.children && page.children.length > 0;
  const indentPx = 8 + depth * 16;
  const dropAbove = dropTarget?.id === page.id && dropTarget.position === 'above';
  const dropBelow = dropTarget?.id === page.id && dropTarget.position === 'below';

  return (
    <>
      {dropAbove && <div className="doc-drop-indicator" />}
      <div
        className={`doc-tree-item ${isActive ? 'active' : ''}`}
        style={{ paddingLeft: indentPx }}
        onClick={() => onSelect(page.id)}
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
        <span className="doc-tree-title">{page.title}</span>
        <button
          className="doc-tree-menu"
          onClick={(e) => { e.stopPropagation(); onOpenContext(page.id, e.currentTarget); }}
          title="More"
        >
          <I.MoreHorizontal size={14} />
        </button>
      </div>
      {dropBelow && <div className="doc-drop-indicator" />}
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
        />
      ))}
    </>
  );
};

const TemplateRow: React.FC<{ emoji: string; title: string }> = ({ emoji, title }) => (
  <div className="doc-tree-item" style={{ paddingLeft: 8 }}>
    <span className="doc-tree-expander empty" />
    <span className="doc-tree-icon">{emoji}</span>
    <span className="doc-tree-title" style={{ color: 'var(--doc-text-2)' }}>{title}</span>
  </div>
);
