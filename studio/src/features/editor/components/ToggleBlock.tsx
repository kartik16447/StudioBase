import { Node, mergeAttributes } from '@tiptap/core';
import { ReactNodeViewRenderer, NodeViewWrapper, NodeViewContent } from '@tiptap/react';
import { I } from '../../../components/icons';

const ToggleView = ({ node, updateAttributes }: any) => {
  const isOpen = node.attrs.open !== false;
  return (
    <NodeViewWrapper className={`doc-toggle${isOpen ? ' open' : ''}`}>
      <button
        className="doc-toggle-chevron"
        contentEditable={false}
        onMouseDown={(e) => { e.preventDefault(); updateAttributes({ open: !isOpen }); }}
      >
        <I.ChevronRight size={14} />
      </button>
      <NodeViewContent className="doc-toggle-content" />
    </NodeViewWrapper>
  );
};

export const ToggleBlock = Node.create({
  name: 'toggleBlock',
  group: 'block',
  content: 'paragraph block*',
  defining: true,

  addAttributes() {
    return {
      open: { default: true },
    };
  },

  parseHTML() {
    return [{ tag: 'div[data-type="toggle"]' }];
  },

  renderHTML({ node, HTMLAttributes }) {
    return ['div', mergeAttributes(HTMLAttributes, {
      'data-type': 'toggle',
      'data-open': String(node.attrs.open),
    }), 0];
  },

  addNodeView() {
    return ReactNodeViewRenderer(ToggleView);
  },
});
