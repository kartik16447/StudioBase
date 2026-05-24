import React, { useState, useEffect } from 'react';
import type { JSONContent } from '@tiptap/react';
import { DocsSidebar } from '../features/editor/components/DocsSidebar';
import { EditorPane } from '../features/editor/components/EditorPane';
import { BlockContextMenu } from '../features/editor/components/BlockContextMenu';
import { PageTreeContextMenu } from '../features/editor/components/PageTreeContextMenu';
import { SearchModal } from '../features/editor/components/SearchModal';
import { TemplateModal } from '../features/editor/components/TemplateModal';
import { EmojiPickerPopover } from '../features/editor/components/EmojiPickerPopover';
import { INITIAL_PAGES, CURRENT_DOC } from '../features/editor/data/mockData';
import type { PageNode, DocRecord, PageContextMenu } from '../features/editor/types';

export const DocsPage: React.FC = () => {
  // Page tree
  const [pages] = useState<PageNode[]>(INITIAL_PAGES);
  const [activeId, setActiveId] = useState('ns-brief');
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set(['projects', 'northstar']));
  const [showTemplatesSection, setShowTemplatesSection] = useState(false);
  const [pageCtx, setPageCtx] = useState<PageContextMenu | null>(null);

  // Doc
  const [doc] = useState<DocRecord>(CURRENT_DOC);
  const [title, setTitle] = useState(CURRENT_DOC.title);
  const [emoji, setEmoji] = useState<string | null>(CURRENT_DOC.emoji ?? null);
  const [dirty, setDirty] = useState(false);

  // UI
  const [searchOpen, setSearchOpen] = useState(false);
  const [templateOpen, setTemplateOpen] = useState(false);
  const [emojiPickerOpen, setEmojiPickerOpen] = useState(false);
  const [exportOpen, setExportOpen] = useState(false);
  const [blockMenuAnchor, setBlockMenuAnchor] = useState<{ x: number; y: number } | null>(null);

  // Autosave simulation
  useEffect(() => {
    if (!dirty) return;
    const id = setTimeout(() => setDirty(false), 1500);
    return () => clearTimeout(id);
  }, [dirty]);

  // Keyboard shortcuts
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const meta = e.metaKey || e.ctrlKey;
      if (meta && (e.key.toLowerCase() === 'p' || e.key.toLowerCase() === 'k')) {
        e.preventDefault();
        setSearchOpen(true);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const toggleExpand = (id: string) => {
    setExpandedIds((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  const openPageContext = (id: string, anchorEl: HTMLElement) => {
    const r = anchorEl.getBoundingClientRect();
    setPageCtx({ id, x: r.right + 4, y: r.top });
  };

  // Emoji picker anchor
  const [emojiAnchor, setEmojiAnchor] = useState({ left: 0, top: 0 });
  const onPickEmoji = () => {
    const btn = document.querySelector('.doc-page-icon-btn') as HTMLElement;
    if (btn) {
      const r = btn.getBoundingClientRect();
      setEmojiAnchor({ left: r.left, top: r.bottom + 6 });
    }
    setEmojiPickerOpen(true);
  };

  return (
    <div style={{ display: 'flex', height: '100%', width: '100%', overflow: 'hidden', background: 'var(--doc-surface)' }}>
      <DocsSidebar
        pages={pages}
        activeId={activeId}
        expandedIds={expandedIds}
        onToggleExpand={toggleExpand}
        onSelect={setActiveId}
        onOpenSearch={() => setSearchOpen(true)}
        onOpenContext={openPageContext}
        onNewDoc={() => setTemplateOpen(true)}
        showTemplates={showTemplatesSection}
        setShowTemplates={setShowTemplatesSection}
      />

      <EditorPane
        doc={doc}
        title={title}
        onTitleChange={(v) => { setTitle(v); setDirty(true); }}
        emoji={emoji}
        onPickEmoji={onPickEmoji}
        dirty={dirty}
        exportOpen={exportOpen}
        onOpenExport={(e) => { e.stopPropagation(); setExportOpen((o) => !o); }}
        onCloseExport={() => setExportOpen(false)}
        initialBlocks={CURRENT_DOC.blocks}
        onContentChange={(_json: JSONContent) => setDirty(true)}
        onShare={() => {}}
        onMore={() => {}}
      />

      {blockMenuAnchor && (
        <BlockContextMenu
          x={blockMenuAnchor.x}
          y={blockMenuAnchor.y}
          onClose={() => setBlockMenuAnchor(null)}
          onAction={() => setBlockMenuAnchor(null)}
        />
      )}

      {pageCtx && (
        <PageTreeContextMenu
          x={pageCtx.x}
          y={pageCtx.y}
          onClose={() => setPageCtx(null)}
          onAction={() => setPageCtx(null)}
        />
      )}

      {emojiPickerOpen && (
        <EmojiPickerPopover
          anchor={emojiAnchor}
          onPick={(e) => { setEmoji(e); setEmojiPickerOpen(false); setDirty(true); }}
          onRemove={() => { setEmoji(null); setEmojiPickerOpen(false); setDirty(true); }}
          onClose={() => setEmojiPickerOpen(false)}
        />
      )}

      {searchOpen && (
        <SearchModal
          onClose={() => setSearchOpen(false)}
          onPick={() => setSearchOpen(false)}
        />
      )}
      {templateOpen && (
        <TemplateModal
          onClose={() => setTemplateOpen(false)}
          onUse={() => setTemplateOpen(false)}
        />
      )}
    </div>
  );
};
