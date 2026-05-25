import { useRef } from 'react';
import { DragHandle } from '@tiptap/extension-drag-handle-react';
import type { Editor } from '@tiptap/react';
import type { Node } from '@tiptap/pm/model';
import { I } from '../../../components/icons';

interface BlockHandleProps {
  editor: Editor;
  onMenuOpen: (nodePos: number, x: number, y: number) => void;
  onInsertBelow: (nodePos: number) => void;
}

export const BlockHandle: React.FC<BlockHandleProps> = ({ editor, onMenuOpen, onInsertBelow }) => {
  const nodePosRef = useRef<number>(-1);

  return (
    <DragHandle
      editor={editor}
      className="doc-block-handle-wrap"
      onNodeChange={({ pos }: { node: Node | null; editor: Editor; pos: number }) => {
        nodePosRef.current = pos ?? -1;
      }}
    >
      <div className="doc-block-handle">
        {/* + button: insert new paragraph below this block */}
        <button
          className="doc-handle-btn"
          title="Add block below"
          onMouseDown={(e) => {
            e.preventDefault();
            e.stopPropagation();
            onInsertBelow(nodePosRef.current);
          }}
        >
          <I.Plus size={12} />
        </button>

        {/* Grip: drag to reorder (handled by DragHandle extension) */}
        <button
          className="doc-handle-btn doc-handle-grip"
          title="Drag to move · Click for options"
          onMouseDown={(e) => {
            // Right-click or plain click → open context menu
            if (!e.defaultPrevented) {
              // Let the drag handle extension handle actual drag;
              // we detect a short click in onMouseUp
            }
          }}
          onClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
            const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
            onMenuOpen(nodePosRef.current, rect.right + 6, rect.top);
          }}
        >
          <I.GripVertical size={14} />
        </button>
      </div>
    </DragHandle>
  );
};
