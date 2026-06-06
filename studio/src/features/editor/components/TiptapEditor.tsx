import React, { useCallback, useMemo, useRef, useState } from 'react';
import { useEditor, EditorContent, Extension, type JSONContent, type Editor } from '@tiptap/react';
import { BubbleMenu } from '@tiptap/react/menus';
import StarterKit from '@tiptap/starter-kit';
import TaskList from '@tiptap/extension-task-list';
import TaskItem from '@tiptap/extension-task-item';
import Link from '@tiptap/extension-link';
import Underline from '@tiptap/extension-underline';
import Placeholder from '@tiptap/extension-placeholder';
import { TextStyle } from '@tiptap/extension-text-style';
import { Color } from '@tiptap/extension-color';
import Image from '@tiptap/extension-image';
import { FloatingToolbar, ImageInsertPopover } from './FloatingToolbar';
import { SlashMenu, getFilteredItems } from './SlashMenu';
import { ToggleBlock } from './ToggleBlock';
import { BlockHandle } from './BlockHandle';
import { BlockContextMenu } from './BlockContextMenu';
import type { ActiveFormats } from '../types';

interface TiptapEditorProps {
  initialContent: JSONContent;
  onChange?: (json: JSONContent) => void;
  onEditorReady?: (editor: Editor) => void;
  editable?: boolean;
  onOpenShareSheet?: () => void;
  onTriggerPdfExport?: () => void;
}

interface SlashState {
  pos: { x: number; y: number };
  query: string;
  activeIdx: number;
}

export const TiptapEditor: React.FC<TiptapEditorProps> = ({ initialContent, onChange, onEditorReady, editable = true, onOpenShareSheet, onTriggerPdfExport }) => {
  const [slash, setSlash] = useState<SlashState | null>(null);
  const [tbTurnOpen, setTbTurnOpen] = useState(false);
  const [tbColorOpen, setTbColorOpen] = useState(false);
  const [tbLinkOpen, setTbLinkOpen] = useState(false);
  const [imageInsert, setImageInsert] = useState<{ x: number; y: number } | null>(null);
  const [blockMenu, setBlockMenu] = useState<{ x: number; y: number; nodePos: number } | null>(null);
  const wrapRef = useRef<HTMLDivElement>(null);

  // Refs so keyboard extensions always have fresh state without re-creating them
  const slashRef = useRef<SlashState | null>(null);
  slashRef.current = slash;
  const setSlashRef = useRef(setSlash);
  setSlashRef.current = setSlash;
  const handleSlashPickRef = useRef<(type: string) => void>(() => {});

  // editorRef lets KeyboardExtension access the editor without recreating the extension
  const editorRef = useRef<Editor | null>(null);
  const editorReadyFiredRef = useRef(false);

  // openLinkEditorRef: called by Mod-k to open the link popover in FloatingToolbar
  const openLinkEditorRef = useRef<() => void>(() => {});

  // Share sheet and PDF export refs — always current, no stale-closure issues in KeyboardExtension
  const openShareSheetRef = useRef<() => void>(() => {});
  openShareSheetRef.current = onOpenShareSheet ?? (() => {});
  const triggerPdfExportRef = useRef<() => void>(() => {});
  triggerPdfExportRef.current = onTriggerPdfExport ?? (() => {});
  openLinkEditorRef.current = () => {
    setTbLinkOpen(true);
    setTbTurnOpen(false);
    setTbColorOpen(false);
  };

  // Slash keyboard navigation extension — created once, communicates via refs
  const SlashNavExtension = useMemo(() => Extension.create({
    name: 'slashNav',
    addKeyboardShortcuts() {
      return {
        ArrowDown: () => {
          if (!slashRef.current) return false;
          const total = getFilteredItems(slashRef.current.query).length;
          if (total === 0) return false;
          setSlashRef.current((s) => s ? { ...s, activeIdx: (s.activeIdx + 1) % total } : s);
          return true;
        },
        ArrowUp: () => {
          if (!slashRef.current) return false;
          const total = getFilteredItems(slashRef.current.query).length;
          if (total === 0) return false;
          setSlashRef.current((s) => s ? { ...s, activeIdx: (s.activeIdx - 1 + total) % total } : s);
          return true;
        },
        Enter: () => {
          if (!slashRef.current) return false;
          const items = getFilteredItems(slashRef.current.query);
          const picked = items[slashRef.current.activeIdx] ?? items[0];
          if (picked) handleSlashPickRef.current(picked.id);
          return true;
        },
        Escape: () => {
          if (!slashRef.current) return false;
          setSlashRef.current(null);
          return true;
        },
      };
    },
  }), []);

  // Phase 2 keyboard feel — Tab indent, Mod-k link, Mod-Enter checklist, Mod-Shift-d duplicate
  const KeyboardExtension = useMemo(() => Extension.create({
    name: 'keyboardFeel',
    addKeyboardShortcuts() {
      return {
        Tab: () => {
          const e = editorRef.current;
          if (!e) return false;
          if (e.isActive('listItem')) return e.chain().focus().sinkListItem('listItem').run();
          if (e.isActive('taskItem')) return e.chain().focus().sinkListItem('taskItem').run();
          return false;
        },
        'Shift-Tab': () => {
          const e = editorRef.current;
          if (!e) return false;
          if (e.isActive('listItem')) return e.chain().focus().liftListItem('listItem').run();
          if (e.isActive('taskItem')) return e.chain().focus().liftListItem('taskItem').run();
          return false;
        },
        'Mod-k': () => {
          openLinkEditorRef.current();
          return true;
        },
        'Mod-s': () => {
          openShareSheetRef.current();
          return true;
        },
        'Mod-e': () => {
          triggerPdfExportRef.current();
          return true;
        },
        'Mod-Enter': () => {
          const e = editorRef.current;
          if (!e || !e.isActive('taskItem')) return false;
          return e.chain().focus().updateAttributes('taskItem', {
            checked: !e.getAttributes('taskItem').checked,
          }).run();
        },
        'Mod-Shift-d': () => {
          const e = editorRef.current;
          if (!e) return false;
          const { state } = e;
          const { $from } = state.selection;
          // Duplicate the top-level block (depth 1 from doc root)
          const node = $from.node(1);
          const afterPos = $from.end(1) + 1;
          return e.chain().focus().insertContentAt(afterPos, node.toJSON()).run();
        },
      };
    },
  }), []);

  const editor = useEditor({
    extensions: [
      StarterKit.configure({
        heading: { levels: [1, 2, 3] },
        // Disable StarterKit's built-in v3 copies — we configure these ourselves below
        link: false,
        underline: false,
      }),
      TaskList,
      TaskItem.configure({ nested: true }),
      Link.configure({ openOnClick: false, autolink: true }),
      Underline,
      Placeholder.configure({ placeholder: "Type '/' for commands…" }),
      TextStyle,
      Color,
      Image.configure({ inline: false, allowBase64: false }),
      ToggleBlock,
      SlashNavExtension,
      KeyboardExtension,
    ],
    content: initialContent,
    editable,
    editorProps: {
      attributes: { spellcheck: 'true' },
    },
    onUpdate: ({ editor: e }) => {
      const { $from } = e.state.selection;
      const text = $from.parent.textContent;

      if (text.startsWith('/') && $from.parent.type.name !== 'codeBlock') {
        const coords = e.view.coordsAtPos(e.state.selection.from);
        const wrap = wrapRef.current;
        if (wrap) {
          const rect = wrap.getBoundingClientRect();
          const query = text.slice(1);
          const total = getFilteredItems(query).length;
          setSlash((prev) => ({
            pos: { x: coords.left - rect.left, y: coords.bottom - rect.top + 6 },
            query,
            activeIdx: Math.min(prev?.activeIdx ?? 0, Math.max(0, total - 1)),
          }));
        }
      } else {
        setSlash(null);
      }

      onChange?.(e.getJSON());
    },
    onSelectionUpdate: () => {
      // Close slash menu if selection moves away
      if (slashRef.current) {
        const e = editor;
        if (e) {
          const text = e.state.selection.$from.parent.textContent;
          if (!text.startsWith('/')) setSlash(null);
        }
      }
    },
  });

  const handleSlashPick = useCallback((type: string) => {
    if (!editor) return;
    setSlash(null);
    setTbTurnOpen(false);

    // Delete slash + query
    const { $from } = editor.state.selection;
    const blockStart = $from.start();
    editor.chain().focus().deleteRange({ from: blockStart, to: $from.pos }).run();

    const chain = editor.chain().focus();
    switch (type) {
      case 'p':        chain.setParagraph().run(); break;
      case 'h1':       chain.setHeading({ level: 1 }).run(); break;
      case 'h2':       chain.setHeading({ level: 2 }).run(); break;
      case 'h3':       chain.setHeading({ level: 3 }).run(); break;
      case 'bullet':   chain.toggleBulletList().run(); break;
      case 'numbered': chain.toggleOrderedList().run(); break;
      case 'check':    chain.toggleTaskList().run(); break;
      case 'quote':    chain.toggleBlockquote().run(); break;
      case 'code':     chain.toggleCodeBlock().run(); break;
      case 'divider':  chain.setHorizontalRule().run(); break;
      case 'image': {
        // Show URL input popover at cursor position
        const coords = editor.view.coordsAtPos(editor.state.selection.from);
        const wrap = wrapRef.current;
        if (wrap) {
          const rect = wrap.getBoundingClientRect();
          setImageInsert({ x: coords.left - rect.left, y: coords.bottom - rect.top + 6 });
        }
        break;
      }
      case 'toggle': {
        // Replace the current empty paragraph with a toggleBlock in-place
        const { state } = editor;
        const { $from } = state.selection;
        const d = $from.depth;
        const from = $from.before(d);
        const to = $from.after(d);
        const toggle = state.schema.nodes.toggleBlock?.createAndFill({ open: true });
        if (toggle) editor.view.dispatch(state.tr.replaceWith(from, to, toggle).scrollIntoView());
        break;
      }
      default:         chain.setParagraph().run();
    }
  }, [editor]);

  // Keep refs fresh every render
  handleSlashPickRef.current = handleSlashPick;
  if (editor) {
    editorRef.current = editor;
    if (!editorReadyFiredRef.current) {
      editorReadyFiredRef.current = true;
      onEditorReady?.(editor);
    }
  }

  const handleFormat = useCallback((fmt: keyof ActiveFormats) => {
    if (!editor) return;
    editor.chain().focus()[
      fmt === 'bold'      ? 'toggleBold'      :
      fmt === 'italic'    ? 'toggleItalic'    :
      fmt === 'underline' ? 'toggleUnderline' :
      fmt === 'strike'    ? 'toggleStrike'    :
      fmt === 'code'      ? 'toggleCode'      : 'toggleBold'
    ]().run();
  }, [editor]);

  const handleTurnInto = useCallback((type: string) => {
    if (!editor) return;
    const chain = editor.chain().focus();
    switch (type) {
      case 'p':        chain.setParagraph().run(); break;
      case 'h1':       chain.setHeading({ level: 1 }).run(); break;
      case 'h2':       chain.setHeading({ level: 2 }).run(); break;
      case 'h3':       chain.setHeading({ level: 3 }).run(); break;
      case 'bullet':   chain.toggleBulletList().run(); break;
      case 'numbered': chain.toggleOrderedList().run(); break;
      case 'check':    chain.toggleTaskList().run(); break;
      case 'quote':    chain.toggleBlockquote().run(); break;
      case 'code':     chain.toggleCodeBlock().run(); break;
    }
  }, [editor]);

  const handleLinkSubmit = useCallback((url: string) => {
    if (!editor) return;
    editor.chain().focus().setLink({ href: url, target: '_blank' }).run();
  }, [editor]);

  const handleLinkUnset = useCallback(() => {
    if (!editor) return;
    editor.chain().focus().unsetLink().run();
  }, [editor]);

  const handleColorPick = useCallback((hex: string) => {
    if (!editor) return;
    if (hex === '#1D1D1F') {
      editor.chain().focus().unsetColor().run();
    } else {
      editor.chain().focus().setColor(hex).run();
    }
  }, [editor]);

  // Block handle actions — operate on the node at the tracked position
  const handleBlockAction = useCallback((action: string) => {
    if (!editor || !blockMenu) return;
    const { nodePos } = blockMenu;
    setBlockMenu(null);

    const node = editor.state.doc.nodeAt(nodePos);
    if (!node) return;

    if (action === 'delete') {
      editor.chain().focus()
        .deleteRange({ from: nodePos, to: nodePos + node.nodeSize })
        .run();
    } else if (action === 'duplicate') {
      editor.chain().focus()
        .insertContentAt(nodePos + node.nodeSize, node.toJSON())
        .run();
    } else if (action === 'copyMd') {
      // Copy plain text content — a proper markdown serializer can be added later
      navigator.clipboard.writeText(node.textContent).catch(() => {});
    }
  }, [editor, blockMenu]);

  const handleBlockTurnInto = useCallback((type: string) => {
    if (!editor || !blockMenu) return;
    setBlockMenu(null);
    // Select the entire block then apply the turn-into
    const { nodePos } = blockMenu;
    const node = editor.state.doc.nodeAt(nodePos);
    if (!node) return;
    editor.chain()
      .focus()
      .setTextSelection({ from: nodePos + 1, to: nodePos + node.nodeSize - 1 })
      .run();
    handleTurnInto(type);
  }, [editor, blockMenu, handleTurnInto]);

  const handleInsertBelow = useCallback((nodePos: number) => {
    if (!editor) return;
    const node = editor.state.doc.nodeAt(nodePos);
    if (!node) return;
    const insertPos = nodePos + node.nodeSize;
    editor.chain().focus().insertContentAt(insertPos, { type: 'paragraph' }).run();
  }, [editor]);

  if (!editor) return null;

  const activeFormats: ActiveFormats = {
    bold:      editor.isActive('bold'),
    italic:    editor.isActive('italic'),
    underline: editor.isActive('underline'),
    strike:    editor.isActive('strike'),
    code:      editor.isActive('code'),
    link:      editor.isActive('link'),
  };

  const currentBlockType = (): string => {
    if (editor.isActive('heading', { level: 1 })) return 'h1';
    if (editor.isActive('heading', { level: 2 })) return 'h2';
    if (editor.isActive('heading', { level: 3 })) return 'h3';
    if (editor.isActive('bulletList'))  return 'bullet';
    if (editor.isActive('orderedList')) return 'numbered';
    if (editor.isActive('taskList'))    return 'check';
    if (editor.isActive('blockquote'))  return 'quote';
    if (editor.isActive('codeBlock'))   return 'code';
    return 'p';
  };

  const currentLinkUrl = editor.isActive('link')
    ? editor.getAttributes('link').href ?? ''
    : '';

  const activeColor: string | undefined = editor.getAttributes('textStyle').color ?? undefined;

  const blockMenuBlockType = blockMenu
    ? (() => {
        const node = editor.state.doc.nodeAt(blockMenu.nodePos);
        if (!node) return 'p';
        if (node.type.name === 'heading') return `h${node.attrs.level}`;
        if (node.type.name === 'bulletList') return 'bullet';
        if (node.type.name === 'orderedList') return 'numbered';
        if (node.type.name === 'taskList') return 'check';
        if (node.type.name === 'blockquote') return 'quote';
        if (node.type.name === 'codeBlock') return 'code';
        if (node.type.name === 'toggleBlock') return 'toggle';
        return 'p';
      })()
    : 'p';

  return (
    <div className="tiptap-editor-wrap" ref={wrapRef}>
      <BubbleMenu
        editor={editor}
        options={{ placement: 'top', offset: 10 }}
        shouldShow={({ from, to }: { from: number; to: number }) =>
          from !== to && !editor.isActive('codeBlock') && !slash
        }
      >
        <FloatingToolbar
          position={null}
          inline
          activeFormats={activeFormats}
          blockType={currentBlockType() as any}
          onFormat={handleFormat}
          onTurnInto={handleTurnInto}
          currentLinkUrl={currentLinkUrl}
          onLinkSubmit={handleLinkSubmit}
          onLinkUnset={handleLinkUnset}
          showTurnDropdown={tbTurnOpen}
          setShowTurnDropdown={setTbTurnOpen}
          showLinkEditor={tbLinkOpen}
          setShowLinkEditor={setTbLinkOpen}
          showColorPicker={tbColorOpen}
          setShowColorPicker={setTbColorOpen}
          onColorPick={handleColorPick}
          activeColor={activeColor}
        />
      </BubbleMenu>

      <EditorContent editor={editor} />

      <BlockHandle
        editor={editor}
        onMenuOpen={(nodePos, x, y) => {
          const wrap = wrapRef.current;
          if (!wrap) return;
          const rect = wrap.getBoundingClientRect();
          setBlockMenu({ nodePos, x: x - rect.left, y: y - rect.top });
        }}
        onInsertBelow={handleInsertBelow}
      />

      {slash && (
        <SlashMenu
          position={slash.pos}
          query={slash.query}
          activeIdx={slash.activeIdx}
          onPick={handleSlashPick}
        />
      )}

      {blockMenu && (
        <BlockContextMenu
          x={blockMenu.x}
          y={blockMenu.y}
          currentBlockType={blockMenuBlockType}
          onClose={() => setBlockMenu(null)}
          onAction={handleBlockAction}
          onTurnInto={handleBlockTurnInto}
        />
      )}

      {imageInsert && (
        <ImageInsertPopover
          position={imageInsert}
          onSubmit={(url) => {
            setImageInsert(null);
            editor.chain().focus().setImage({ src: url }).run();
          }}
          onClose={() => {
            setImageInsert(null);
            editor.chain().focus().run();
          }}
        />
      )}
    </div>
  );
};
