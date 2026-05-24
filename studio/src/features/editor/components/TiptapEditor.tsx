import React, { useCallback, useMemo, useRef, useState } from 'react';
import { useEditor, EditorContent, Extension, type JSONContent } from '@tiptap/react';
import { BubbleMenu } from '@tiptap/react/menus';
import StarterKit from '@tiptap/starter-kit';
import TaskList from '@tiptap/extension-task-list';
import TaskItem from '@tiptap/extension-task-item';
import Link from '@tiptap/extension-link';
import Underline from '@tiptap/extension-underline';
import Placeholder from '@tiptap/extension-placeholder';
import { FloatingToolbar } from './FloatingToolbar';
import { SlashMenu, getFilteredItems } from './SlashMenu';
import type { ActiveFormats, DocBlock } from '../types';
import { docBlocksToTiptap } from '../utils/docBlocks';

interface TiptapEditorProps {
  initialBlocks: DocBlock[];
  onChange?: (json: JSONContent) => void;
}

interface SlashState {
  pos: { x: number; y: number };
  query: string;
  activeIdx: number;
}

export const TiptapEditor: React.FC<TiptapEditorProps> = ({ initialBlocks, onChange }) => {
  const [slash, setSlash] = useState<SlashState | null>(null);
  const [tbTurnOpen, setTbTurnOpen] = useState(false);
  const [tbColorOpen, setTbColorOpen] = useState(false);
  const [tbLinkOpen, setTbLinkOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);

  // Refs so keyboard extension always has fresh state without re-creating the extension
  const slashRef = useRef<SlashState | null>(null);
  slashRef.current = slash;
  const setSlashRef = useRef(setSlash);
  setSlashRef.current = setSlash;
  const handleSlashPickRef = useRef<(type: string) => void>(() => {});

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

  const editor = useEditor({
    extensions: [
      StarterKit.configure({ heading: { levels: [1, 2, 3] } }),
      TaskList,
      TaskItem.configure({ nested: false }),
      Link.configure({ openOnClick: false, autolink: true }),
      Underline,
      Placeholder.configure({ placeholder: "Type '/' for commands…" }),
      SlashNavExtension,
    ],
    content: docBlocksToTiptap(initialBlocks),
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
      default:         chain.setParagraph().run();
    }
  }, [editor]);

  // Keep ref fresh
  handleSlashPickRef.current = handleSlashPick;

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
        />
      </BubbleMenu>

      <EditorContent editor={editor} />

      {slash && (
        <SlashMenu
          position={slash.pos}
          query={slash.query}
          activeIdx={slash.activeIdx}
          onPick={handleSlashPick}
        />
      )}
    </div>
  );
};
