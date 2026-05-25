import type { JSONContent } from '@tiptap/react';
import type { Step } from '../../../../../shared/types/session';

function text(t: string): JSONContent {
  return { type: 'text', text: t };
}

function paragraph(content: string): JSONContent {
  return { type: 'paragraph', content: content ? [text(content)] : [] };
}

function heading(level: 1 | 2 | 3, content: string): JSONContent {
  return { type: 'heading', attrs: { level }, content: [text(content)] };
}

function hr(): JSONContent {
  return { type: 'horizontalRule' };
}

function image(src: string): JSONContent {
  return { type: 'image', attrs: { src, alt: null, title: null } };
}

function bulletList(items: string[]): JSONContent {
  return {
    type: 'bulletList',
    content: items.map((t) => ({
      type: 'listItem',
      content: [paragraph(t)],
    })),
  };
}

function stepTitle(step: Step): string {
  const base = step.stepTitle?.trim() || step.generatedText?.trim().slice(0, 60) || '';
  return base ? `Step ${step.sequence} — ${base}` : `Step ${step.sequence}`;
}

function stepBody(step: Step): string {
  return (step.textOverride?.trim() || step.generatedText?.trim() || '');
}

export function sopToTiptapContent(
  sopTitle: string,
  steps: Step[],
  assets: Record<string, string>,
): JSONContent[] {
  const nodes: JSONContent[] = [];

  // Document title
  nodes.push(heading(1, sopTitle || 'Untitled SOP'));
  nodes.push(hr());

  // Meta line
  const date = new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  nodes.push(paragraph(`Created from SOP · ${steps.length} step${steps.length !== 1 ? 's' : ''} · ${date}`));

  if (steps.length === 0) {
    nodes.push(paragraph('No steps captured yet.'));
    return nodes;
  }

  nodes.push(hr());

  steps.forEach((step, i) => {
    // Step heading
    nodes.push(heading(2, stepTitle(step)));

    // Screenshot
    const imgUrl = step.screenshotKey ? assets[step.screenshotKey] : null;
    if (imgUrl) {
      nodes.push(image(imgUrl));
    }

    // Instruction text
    const body = stepBody(step);
    if (body) {
      nodes.push(paragraph(body));
    }

    // Annotation callout texts (arrows, boxes, text labels that have a text value)
    const annotationTexts = (step.annotations ?? [])
      .map((a) => a.text?.trim())
      .filter((t): t is string => !!t);
    if (annotationTexts.length > 0) {
      nodes.push(bulletList(annotationTexts));
    }

    // Divider between steps (not after last)
    if (i < steps.length - 1) {
      nodes.push(hr());
    }
  });

  return nodes;
}
