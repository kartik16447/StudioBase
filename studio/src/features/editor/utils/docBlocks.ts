import type { JSONContent } from '@tiptap/react';
import type { DocBlock } from '../types';

function textNodes(text?: string): JSONContent[] {
  return text ? [{ type: 'text', text }] : [];
}

export function docBlocksToTiptap(blocks: DocBlock[]): JSONContent {
  const nodes: JSONContent[] = [];
  let i = 0;

  while (i < blocks.length) {
    const b = blocks[i];

    if (b.type === 'bullet') {
      const items: JSONContent[] = [];
      while (i < blocks.length && blocks[i].type === 'bullet') {
        items.push({ type: 'listItem', content: [{ type: 'paragraph', content: textNodes(blocks[i].text) }] });
        i++;
      }
      nodes.push({ type: 'bulletList', content: items });
      continue;
    }

    if (b.type === 'numbered') {
      const items: JSONContent[] = [];
      while (i < blocks.length && blocks[i].type === 'numbered') {
        items.push({ type: 'listItem', content: [{ type: 'paragraph', content: textNodes(blocks[i].text) }] });
        i++;
      }
      nodes.push({ type: 'orderedList', content: items });
      continue;
    }

    if (b.type === 'check') {
      const items: JSONContent[] = [];
      while (i < blocks.length && blocks[i].type === 'check') {
        items.push({
          type: 'taskItem',
          attrs: { checked: blocks[i].done ?? false },
          content: [{ type: 'paragraph', content: textNodes(blocks[i].text) }],
        });
        i++;
      }
      nodes.push({ type: 'taskList', content: items });
      continue;
    }

    switch (b.type) {
      case 'h1': nodes.push({ type: 'heading', attrs: { level: 1 }, content: textNodes(b.text) }); break;
      case 'h2': nodes.push({ type: 'heading', attrs: { level: 2 }, content: textNodes(b.text) }); break;
      case 'h3': nodes.push({ type: 'heading', attrs: { level: 3 }, content: textNodes(b.text) }); break;
      case 'p':  nodes.push({ type: 'paragraph', content: textNodes(b.text) }); break;
      case 'quote':
        nodes.push({ type: 'blockquote', content: [{ type: 'paragraph', content: textNodes(b.text) }] });
        break;
      case 'code':
        nodes.push({ type: 'codeBlock', attrs: {}, content: b.text ? [{ type: 'text', text: b.text }] : [] });
        break;
      case 'divider': nodes.push({ type: 'horizontalRule' }); break;
      case 'toggle': {
        const bodyBlocks = (b.open && b.children && b.children.length > 0)
          ? (docBlocksToTiptap(b.children).content ?? [])
          : [];
        nodes.push({
          type: 'toggleBlock',
          attrs: { open: b.open !== false },
          content: [
            { type: 'paragraph', content: textNodes(b.text) },
            ...bodyBlocks,
          ],
        });
        break;
      }
      default: nodes.push({ type: 'paragraph', content: textNodes(b.text) });
    }
    i++;
  }

  return { type: 'doc', content: nodes.length > 0 ? nodes : [{ type: 'paragraph' }] };
}
