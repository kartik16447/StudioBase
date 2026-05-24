import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useEditor, EditorContent, type JSONContent } from '@tiptap/react';
import { BubbleMenu } from '@tiptap/react/menus';
import StarterKit from '@tiptap/starter-kit';
import TaskList from '@tiptap/extension-task-list';
import TaskItem from '@tiptap/extension-task-item';
import Link from '@tiptap/extension-link';
import Underline from '@tiptap/extension-underline';
import Placeholder from '@tiptap/extension-placeholder';
import { FloatingToolbar } from './FloatingToolbar';
import { SlashMenu } from './SlashMenu';
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

const SLASH_ITEMS = [
  'p', 'h1', 'h2', 'h3',
  'bullet', 'numbered', 'check', 'toggle',
  'code', 'quote', 'divider',
  'image', 'subpage',
];

export const TiptapEditor: React.FC<TiptapEditorProps> = ({ initialBlocks, onChange }) => {
  const [slash, setSlash] = useState<SlashState | null>(null);
  const [tbTurnOpen, setTbTurnOpen] = useState(false);
  const [tbColorOpen, setTbColorOpen] = useState(false);
  const [tbLinkOpen, setTbLinkOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);
  const slashRef = useRef<SlashState | null>(null);
  slashRef.current = slash;

  const editor = useEditor({
    extensions: [
      StarterKit.configure({ heading: { levels: [1, 2, 3] } }),
      TaskList,
      TaskItem.configure({ nested: false }),
      Link.configure({ openOnClick: false }),
      Underline,
      Placeholder.configure({ placeholder: "Type '/' for commands…" }),
    ],
    content: docBlocksToTiptap(initialBlocks),
    onUpdate: ({ editor: e }) => {
      const { $from } = e.state.selection;
      const text = $from.parent.textContent;

      if (text.startsWith('/')) {
        const coords = e.view.coordsAtPos(e.state.selection.from);
        const wrap = wrapRef.current;
        if (wrap) {
          const rect = wrap.getBoundingClientRect();
          setSlash((prev) => ({
            pos: { x: coords.left - rect.left, y: coords.bottom - rect.top + 4 },
            query: text.slice(1),
            activeIdx: prev?.activeIdx ?? 0,
          }));
        }
      } else {
        setSlash(null);
      }

      onChange?.(e.getJSON());
    },
  });

  // Keyboard nav for slash menu
  useEffect(() => {
    if (!slash || !editor) return;
    const filtered = SLASH_ITEMS.filter((id) =>
      id.includes(slash.query.toLowerCase())
    );

    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { e.preventDefault(); setSlash(null); return; }
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setSlash((s) => s ? { ...s, activeIdx: (s.activeIdx + 1) % filtered.length } : s);
        return;
      }
      if (e.key === 'ArrowUp') {
        e.preventDefault();
        setSlash((s) => s ? { ...s, activeIdx: (s.activeIdx - 1 + filtered.length) % filtered.length } : s);
        return;
      }
      if (e.key === 'Enter') {
        e.preventDefault();
        const picked = filtered[slash.activeIdx] ?? filtered[0];
        if (picked) handleSlashPick(picked);
      }
    };
    window.addEventListener('keydown', handler, { capture: true });
    return () => window.removeEventListener('keydown', handler, { capture: true });
  }, [slash, editor]);

  const handleSlashPick = useCallback((type: string) => {
    if (!editor) return;
    setSlash(null);

    // Delete slash + query text
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

  const activeFormats: ActiveFormats = {
    bold:      editor?.isActive('bold')      ?? false,
    italic:    editor?.isActive('italic')    ?? false,
    underline: editor?.isActive('underline') ?? false,
    strike:    editor?.isActive('strike')    ?? false,
    code:      editor?.isActive('code')      ?? false,
    link:      editor?.isActive('link')      ?? false,
  };

  const handleFormat = useCallback((fmt: keyof ActiveFormats) => {
    if (!editor) return;
    const chain = editor.chain().focus();
    switch (fmt) {
      case 'bold':      chain.toggleBold().run(); break;
      case 'italic':    chain.toggleItalic().run(); break;
      case 'underline': chain.toggleUnderline().run(); break;
      case 'strike':    chain.toggleStrike().run(); break;
      case 'code':      chain.toggleCode().run(); break;
      case 'link':      setTbLinkOpen((v) => !v); break;
    }
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

  const currentBlockType = (): string => {
    if (!editor) return 'p';
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

  return (
    <div className="tiptap-editor-wrap" ref={wrapRef}>
      {editor && (
        <BubbleMenu
          editor={editor}
          options={{ placement: 'top-start' }}
          shouldShow={({ from, to }: { from: number; to: number }) =>
            from !== to && !editor.isActive('codeBlock')
          }
        >
          <FloatingToolbar
            position={null}
            inline
            activeFormats={activeFormats}
            blockType={currentBlockType() as any}
            onFormat={handleFormat}
            onTurnInto={handleTurnInto}
            showTurnDropdown={tbTurnOpen}
            setShowTurnDropdown={setTbTurnOpen}
            showLinkEditor={tbLinkOpen}
            setShowLinkEditor={setTbLinkOpen}
            showColorPicker={tbColorOpen}
            setShowColorPicker={setTbColorOpen}
          />
        </BubbleMenu>
      )}

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
