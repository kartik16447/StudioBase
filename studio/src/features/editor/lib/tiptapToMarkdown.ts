import type { JSONContent } from '@tiptap/react';

function inlineToMd(node: JSONContent): string {
  if (node.type === 'hardBreak') return '  \n';
  if (node.type !== 'text') {
    if (node.content) return node.content.map(inlineToMd).join('');
    return '';
  }
  let t = node.text ?? '';
  const marks = node.marks ?? [];
  const hasCode = marks.some((m) => m.type === 'code');
  if (hasCode) return `\`${t}\``;
  if (marks.some((m) => m.type === 'bold')) t = `**${t}**`;
  if (marks.some((m) => m.type === 'italic')) t = `_${t}_`;
  if (marks.some((m) => m.type === 'strike')) t = `~~${t}~~`;
  if (marks.some((m) => m.type === 'underline')) t = `<u>${t}</u>`;
  const link = marks.find((m) => m.type === 'link');
  if (link) t = `[${t}](${link.attrs?.href ?? ''})`;
  return t;
}

function blockToMd(node: JSONContent, depth = 0): string {
  const indent = '  '.repeat(depth);
  const inline = () => (node.content ?? []).map(inlineToMd).join('');

  switch (node.type) {
    case 'heading': {
      const level = node.attrs?.level ?? 1;
      return `${'#'.repeat(level)} ${inline()}\n\n`;
    }
    case 'paragraph':
      return `${inline()}\n\n`;
    case 'bulletList':
      return (node.content ?? []).map((li) => blockToMd(li, depth)).join('') + '\n';
    case 'orderedList': {
      let i = node.attrs?.start ?? 1;
      return (node.content ?? []).map((li) => {
        const s = `${indent}${i++}. ${(li.content ?? []).map((c) => blockToMd(c, depth + 1)).join('').trimEnd()}\n`;
        return s;
      }).join('') + '\n';
    }
    case 'listItem':
      return `${indent}- ${(node.content ?? []).map((c) => blockToMd(c, depth + 1)).join('').trimEnd()}\n`;
    case 'taskList':
      return (node.content ?? []).map((li) => blockToMd(li, depth)).join('') + '\n';
    case 'taskItem': {
      const checked = node.attrs?.checked ? 'x' : ' ';
      return `${indent}- [${checked}] ${(node.content ?? []).map((c) => blockToMd(c, depth + 1)).join('').trimEnd()}\n`;
    }
    case 'blockquote':
      return (node.content ?? []).map((c) => `> ${blockToMd(c, depth).trimEnd()}`).join('\n') + '\n\n';
    case 'codeBlock': {
      const lang = node.attrs?.language ?? '';
      const code = (node.content ?? []).map((c) => c.text ?? '').join('');
      return `\`\`\`${lang}\n${code}\n\`\`\`\n\n`;
    }
    case 'horizontalRule':
      return '---\n\n';
    case 'image': {
      const { src, alt, title } = node.attrs ?? {};
      return `![${alt ?? ''}](${src ?? ''}${title ? ` "${title}"` : ''})\n\n`;
    }
    case 'toggle':
      return (node.content ?? []).map((c) => blockToMd(c, depth)).join('');
    default:
      return (node.content ?? []).map((c) => blockToMd(c, depth)).join('');
  }
}

export function blocksToMarkdown(blocks: JSONContent[], title?: string): string {
  const body = blocks.map((b) => blockToMd(b)).join('');
  return title ? `# ${title}\n\n${body}` : body;
}

export function blocksToPlainText(blocks: JSONContent[]): string {
  function walk(node: JSONContent): string {
    if (node.type === 'text') return node.text ?? '';
    if (node.type === 'hardBreak') return '\n';
    return (node.content ?? []).map(walk).join('');
  }
  return blocks.map((b) => walk(b)).join('\n').replace(/\n{3,}/g, '\n\n').trim();
}
