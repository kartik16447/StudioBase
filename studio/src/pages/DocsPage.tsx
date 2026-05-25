import React, { useState, useEffect, useCallback, useRef } from 'react';
import type { JSONContent } from '@tiptap/react';
import { DocsSidebar } from '../features/editor/components/DocsSidebar';
import { EditorPane } from '../features/editor/components/EditorPane';
import { BlockContextMenu } from '../features/editor/components/BlockContextMenu';
import { PageTreeContextMenu } from '../features/editor/components/PageTreeContextMenu';
import { SearchModal } from '../features/editor/components/SearchModal';
import { TemplateModal } from '../features/editor/components/TemplateModal';
import { EmojiPickerPopover } from '../features/editor/components/EmojiPickerPopover';
import { docsApi } from '../features/editor/lib/docsApi';
import type { ApiDocSummary } from '../features/editor/lib/docsApi';
import type { PageNode, PageContextMenu } from '../features/editor/types';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const TIPTAP_TYPES = new Set([
  'doc', 'paragraph', 'heading', 'bulletList', 'orderedList', 'listItem',
  'taskList', 'taskItem', 'blockquote', 'codeBlock', 'horizontalRule',
  'image', 'toggle',
]);

function blocksToContent(blocks: any[]): JSONContent {
  if (!blocks || blocks.length === 0) {
    return { type: 'doc', content: [{ type: 'paragraph' }] };
  }
  // Already a wrapped Tiptap doc
  if (blocks.length === 1 && blocks[0].type === 'doc') {
    return blocks[0] as JSONContent;
  }
  // Raw Tiptap content array
  if (TIPTAP_TYPES.has(blocks[0].type)) {
    return { type: 'doc', content: blocks as JSONContent[] };
  }
  // Legacy DocBlock format — minimal conversion
  const content: JSONContent[] = blocks.map((b) => {
    switch (b.type) {
      case 'h1': return { type: 'heading', attrs: { level: 1 }, content: b.text ? [{ type: 'text', text: b.text }] : [] };
      case 'h2': return { type: 'heading', attrs: { level: 2 }, content: b.text ? [{ type: 'text', text: b.text }] : [] };
      case 'h3': return { type: 'heading', attrs: { level: 3 }, content: b.text ? [{ type: 'text', text: b.text }] : [] };
      case 'quote': return { type: 'blockquote', content: [{ type: 'paragraph', content: b.text ? [{ type: 'text', text: b.text }] : [] }] };
      case 'code': return { type: 'codeBlock', content: b.text ? [{ type: 'text', text: b.text }] : [] };
      case 'divider': return { type: 'horizontalRule' };
      default: return { type: 'paragraph', content: b.text ? [{ type: 'text', text: b.text }] : [] };
    }
  });
  return { type: 'doc', content };
}

function buildTree(summaries: ApiDocSummary[]): PageNode[] {
  const map = new Map<string, PageNode>();
  for (const s of summaries) {
    map.set(s.id, { id: s.id, title: s.title, emoji: s.emoji ?? undefined, children: [] });
  }
  const roots: PageNode[] = [];
  const sorted = [...summaries].sort((a, b) => a.sortOrder - b.sortOrder);
  for (const s of sorted) {
    const node = map.get(s.id)!;
    if (s.parentId && map.has(s.parentId)) {
      map.get(s.parentId)!.children.push(node);
    } else {
      roots.push(node);
    }
  }
  return roots;
}

function findPath(tree: PageNode[], id: string, acc: string[] = []): string[] | null {
  for (const node of tree) {
    const path = [...acc, node.title || 'Untitled'];
    if (node.id === id) return path;
    const found = findPath(node.children, id, path);
    if (found) return found;
  }
  return null;
}

function treeUpdateTitle(nodes: PageNode[], id: string, title: string): PageNode[] {
  return nodes.map((n) =>
    n.id === id ? { ...n, title } : { ...n, children: treeUpdateTitle(n.children, id, title) }
  );
}

function treeUpdateEmoji(nodes: PageNode[], id: string, emoji: string | null): PageNode[] {
  return nodes.map((n) =>
    n.id === id
      ? { ...n, emoji: emoji ?? undefined }
      : { ...n, children: treeUpdateEmoji(n.children, id, emoji) }
  );
}

function treeRemove(nodes: PageNode[], id: string): PageNode[] {
  return nodes
    .filter((n) => n.id !== id)
    .map((n) => ({ ...n, children: treeRemove(n.children, id) }));
}

function treeInsertChild(nodes: PageNode[], parentId: string, child: PageNode): PageNode[] {
  return nodes.map((n) => {
    if (n.id === parentId) return { ...n, children: [...n.children, child] };
    return { ...n, children: treeInsertChild(n.children, parentId, child) };
  });
}

function treeReorder(
  nodes: PageNode[],
  dragId: string,
  targetId: string,
  position: 'above' | 'below',
): PageNode[] {
  let dragNode: PageNode | null = null;

  function extract(ns: PageNode[]): PageNode[] {
    return ns.reduce<PageNode[]>((acc, n) => {
      if (n.id === dragId) { dragNode = { ...n }; return acc; }
      return [...acc, { ...n, children: extract(n.children) }];
    }, []);
  }

  const withoutDrag = extract(nodes);
  if (!dragNode) return nodes;

  function insert(ns: PageNode[]): PageNode[] {
    const result: PageNode[] = [];
    for (const n of ns) {
      if (n.id === targetId) {
        if (position === 'above') result.push(dragNode!, n);
        else result.push(n, dragNode!);
      } else {
        result.push({ ...n, children: insert(n.children) });
      }
    }
    return result;
  }

  return insert(withoutDrag);
}

function findNodeInfo(
  nodes: PageNode[],
  id: string,
  parentId: string | null = null,
): { parentId: string | null; index: number } | null {
  for (let i = 0; i < nodes.length; i++) {
    if (nodes[i].id === id) return { parentId, index: i };
    const found = findNodeInfo(nodes[i].children, id, nodes[i].id);
    if (found) return found;
  }
  return null;
}

const EMPTY_CONTENT: JSONContent = { type: 'doc', content: [{ type: 'paragraph' }] };

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export const DocsPage: React.FC = () => {
  // Tree
  const [pages, setPages] = useState<PageNode[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeId, setActiveId] = useState<string>('');
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());
  const [showTemplatesSection, setShowTemplatesSection] = useState(false);
  const [pageCtx, setPageCtx] = useState<PageContextMenu | null>(null);
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [dragId, setDragId] = useState<string | null>(null);
  const [dropTarget, setDropTarget] = useState<{ id: string; position: 'above' | 'below' } | null>(null);

  // Active doc
  const [docLoading, setDocLoading] = useState(false);
  const [title, setTitle] = useState('');
  const [emoji, setEmoji] = useState<string | null>(null);
  const [content, setContent] = useState<JSONContent>(EMPTY_CONTENT);
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);

  // UI
  const [searchOpen, setSearchOpen] = useState(false);
  const [templateOpen, setTemplateOpen] = useState(false);
  const [emojiPickerOpen, setEmojiPickerOpen] = useState(false);
  const [emojiAnchor, setEmojiAnchor] = useState({ left: 0, top: 0 });
  const [exportOpen, setExportOpen] = useState(false);
  const [blockMenuAnchor, setBlockMenuAnchor] = useState<{ x: number; y: number } | null>(null);

  const titleSaveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const contentSaveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const activeIdRef = useRef(activeId);
  useEffect(() => { activeIdRef.current = activeId; }, [activeId]);

  // ---------------------------------------------------------------------------
  // Load tree
  // ---------------------------------------------------------------------------
  const loadTree = useCallback(async (selectFirst = false) => {
    setLoading(true);
    try {
      const summaries = await docsApi.list();
      const tree = buildTree(summaries);
      setPages(tree);
      if (selectFirst && summaries.length > 0) {
        const sorted = [...summaries].sort((a, b) => a.sortOrder - b.sortOrder);
        setActiveId(sorted[0].id);
      }
    } catch (err) {
      console.error('Failed to load docs tree:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadTree(true); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // ---------------------------------------------------------------------------
  // Load active doc on selection change
  // ---------------------------------------------------------------------------
  useEffect(() => {
    if (!activeId) return;
    let cancelled = false;
    setDocLoading(true);
    setDirty(false);
    docsApi.get(activeId).then((doc) => {
      if (cancelled) return;
      setTitle(doc.title);
      setEmoji(doc.emoji ?? null);
      setContent(blocksToContent(doc.blocks ?? []));
      setDocLoading(false);
    }).catch((err) => {
      console.error('Failed to load doc:', err);
      if (!cancelled) setDocLoading(false);
    });
    return () => { cancelled = true; };
  }, [activeId]);

  // ---------------------------------------------------------------------------
  // Debounced saves
  // ---------------------------------------------------------------------------
  const saveTitle = useCallback((id: string, newTitle: string) => {
    if (titleSaveTimer.current) clearTimeout(titleSaveTimer.current);
    titleSaveTimer.current = setTimeout(async () => {
      setSaving(true);
      try {
        await docsApi.update(id, { title: newTitle });
        setPages((prev) => treeUpdateTitle(prev, id, newTitle));
      } catch (err) {
        console.error('Failed to save title:', err);
      } finally {
        setSaving(false);
        setDirty(false);
      }
    }, 800);
  }, []);

  const saveContent = useCallback((id: string, json: JSONContent) => {
    if (contentSaveTimer.current) clearTimeout(contentSaveTimer.current);
    contentSaveTimer.current = setTimeout(async () => {
      setSaving(true);
      try {
        await docsApi.update(id, { blocks: json.content ?? [] });
      } catch (err) {
        console.error('Failed to save content:', err);
      } finally {
        setSaving(false);
        setDirty(false);
      }
    }, 1500);
  }, []);

  const handleTitleChange = useCallback((v: string) => {
    setTitle(v);
    setDirty(true);
    if (activeIdRef.current) saveTitle(activeIdRef.current, v);
  }, [saveTitle]);

  const handleContentChange = useCallback((json: JSONContent) => {
    setDirty(true);
    if (activeIdRef.current) saveContent(activeIdRef.current, json);
  }, [saveContent]);

  // ---------------------------------------------------------------------------
  // New doc
  // ---------------------------------------------------------------------------
  const handleNewDoc = useCallback(async (parentId?: string) => {
    try {
      const doc = await docsApi.create({ title: 'Untitled', parentId: parentId ?? null });
      const newNode: PageNode = {
        id: doc.id,
        title: doc.title,
        emoji: doc.emoji ?? undefined,
        children: [],
      };
      setPages((prev) =>
        parentId ? treeInsertChild(prev, parentId, newNode) : [...prev, newNode]
      );
      if (parentId) {
        setExpandedIds((prev) => new Set([...prev, parentId]));
      }
      setActiveId(doc.id);
    } catch (err) {
      console.error('Failed to create doc:', err);
    }
  }, []);

  // ---------------------------------------------------------------------------
  // Page tree context menu actions
  // ---------------------------------------------------------------------------
  const handlePageAction = useCallback(async (action: string) => {
    const id = pageCtx?.id;
    setPageCtx(null);
    if (!id) return;

    if (action === 'rename') {
      setRenamingId(id);
    } else if (action === 'add') {
      await handleNewDoc(id);
    } else if (action === 'duplicate') {
      try {
        const src = await docsApi.get(id);
        const dup = await docsApi.create({
          title: src.title + ' (copy)',
          emoji: src.emoji,
          parentId: src.parentId,
          blocks: src.blocks,
        });
        const dupNode: PageNode = { id: dup.id, title: dup.title, emoji: dup.emoji ?? undefined, children: [] };
        if (dup.parentId) {
          setPages((prev) => treeInsertChild(prev, dup.parentId!, dupNode));
        } else {
          setPages((prev) => [...prev, dupNode]);
        }
        setActiveId(dup.id);
      } catch (err) {
        console.error('Failed to duplicate doc:', err);
      }
    } else if (action === 'delete') {
      try {
        await docsApi.delete(id);
        setPages((prev) => treeRemove(prev, id));
        if (activeIdRef.current === id) {
          setActiveId('');
        }
      } catch (err) {
        console.error('Failed to delete doc:', err);
      }
    }
  }, [pageCtx, handleNewDoc]);

  const handleRenameCommit = useCallback(async (id: string, newTitle: string) => {
    setRenamingId(null);
    try {
      await docsApi.update(id, { title: newTitle });
      setPages((prev) => treeUpdateTitle(prev, id, newTitle));
      if (activeIdRef.current === id) setTitle(newTitle);
    } catch (err) {
      console.error('Failed to rename doc:', err);
    }
  }, []);

  // ---------------------------------------------------------------------------
  // Emoji
  // ---------------------------------------------------------------------------
  const onPickEmoji = useCallback(() => {
    const btn = document.querySelector('.doc-page-icon-btn') as HTMLElement;
    if (btn) {
      const r = btn.getBoundingClientRect();
      setEmojiAnchor({ left: r.left, top: r.bottom + 6 });
    }
    setEmojiPickerOpen(true);
  }, []);

  const handleEmojiPick = useCallback(async (e: string) => {
    setEmoji(e);
    setEmojiPickerOpen(false);
    const id = activeIdRef.current;
    if (id) {
      try {
        await docsApi.update(id, { emoji: e });
        setPages((prev) => treeUpdateEmoji(prev, id, e));
      } catch (err) {
        console.error('Failed to update emoji:', err);
      }
    }
  }, []);

  const handleEmojiRemove = useCallback(async () => {
    setEmoji(null);
    setEmojiPickerOpen(false);
    const id = activeIdRef.current;
    if (id) {
      try {
        await docsApi.update(id, { emoji: null });
        setPages((prev) => treeUpdateEmoji(prev, id, null));
      } catch (err) {
        console.error('Failed to remove emoji:', err);
      }
    }
  }, []);

  // ---------------------------------------------------------------------------
  // Keyboard shortcuts
  // ---------------------------------------------------------------------------
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

  const toggleExpand = useCallback((id: string) => {
    setExpandedIds((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }, []);

  const openPageContext = useCallback((id: string, anchorEl: HTMLElement) => {
    const r = anchorEl.getBoundingClientRect();
    setPageCtx({ id, x: r.right + 4, y: r.top });
  }, []);

  // ---------------------------------------------------------------------------
  // Drag & drop reorder
  // ---------------------------------------------------------------------------
  const handleDragStart = useCallback((id: string) => {
    setDragId(id);
  }, []);

  const handleDragOver = useCallback((id: string, clientY: number, rect: DOMRect) => {
    if (id === dragId) return;
    const position: 'above' | 'below' = clientY < rect.top + rect.height / 2 ? 'above' : 'below';
    setDropTarget((prev) =>
      prev?.id === id && prev.position === position ? prev : { id, position }
    );
  }, [dragId]);

  const handleDrop = useCallback(async (id: string) => {
    const dragged = dragId;
    const target = dropTarget;
    setDragId(null);
    setDropTarget(null);
    if (!dragged || !target || dragged === target.id) return;

    const reordered = treeReorder(pages, dragged, target.id, target.position);
    setPages(reordered);

    const info = findNodeInfo(reordered, dragged);
    if (!info) return;
    try {
      await docsApi.update(dragged, {
        parentId: info.parentId,
        sortOrder: info.index * 1000,
      });
    } catch (err) {
      console.error('Failed to reorder doc:', err);
      loadTree();
    }
  }, [dragId, dropTarget, pages, loadTree]);

  const handleDragEnd = useCallback(() => {
    setDragId(null);
    setDropTarget(null);
  }, []);

  const path: string[] = (activeId ? findPath(pages, activeId) : null) ?? ['Docs'];

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------
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
        onNewDoc={() => handleNewDoc()}
        showTemplates={showTemplatesSection}
        setShowTemplates={setShowTemplatesSection}
        renamingId={renamingId}
        onRenameCommit={handleRenameCommit}
        onRenameCancel={() => setRenamingId(null)}
        loading={loading}
        dropTarget={dropTarget}
        onDragStart={handleDragStart}
        onDragOver={handleDragOver}
        onDrop={handleDrop}
        onDragEnd={handleDragEnd}
      />

      {activeId && !docLoading && (
        <EditorPane
          docId={activeId}
          path={path}
          title={title}
          onTitleChange={handleTitleChange}
          emoji={emoji}
          onPickEmoji={onPickEmoji}
          dirty={dirty}
          saving={saving}
          exportOpen={exportOpen}
          onOpenExport={(e) => { e.stopPropagation(); setExportOpen((o) => !o); }}
          onCloseExport={() => setExportOpen(false)}
          initialContent={content}
          onContentChange={handleContentChange}
          onShare={() => {}}
          onMore={() => {}}
        />
      )}

      {activeId && docLoading && (
        <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--doc-text-3)', fontSize: 14 }}>
          Loading…
        </div>
      )}

      {!activeId && !loading && (
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 12, color: 'var(--doc-text-3)' }}>
          <p style={{ fontSize: 14 }}>No document selected</p>
          <button className="doc-btn doc-btn-subtle sm" onClick={() => handleNewDoc()}>
            + New Doc
          </button>
        </div>
      )}

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
          onAction={handlePageAction}
        />
      )}

      {emojiPickerOpen && (
        <EmojiPickerPopover
          anchor={emojiAnchor}
          onPick={handleEmojiPick}
          onRemove={handleEmojiRemove}
          onClose={() => setEmojiPickerOpen(false)}
        />
      )}

      {searchOpen && (
        <SearchModal
          onClose={() => setSearchOpen(false)}
          onPick={(r) => { setSearchOpen(false); setActiveId(r.id); }}
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
