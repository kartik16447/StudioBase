import {
  Document, Packer, Paragraph, TextRun, HeadingLevel,
  AlignmentType, BorderStyle, TableRow, TableCell, Table,
  WidthType, ShadingType,
} from 'docx';
import type { Step } from '../../../shared/types/step';

export interface ExportSession {
  title: string;
  capturedUrl?: string | null;
  stepCount: number;
}

export class ExportService {
  async generateDocx(session: ExportSession, steps: Step[]): Promise<Uint8Array> {
    const children: Paragraph[] = [];

    // Title
    children.push(new Paragraph({
      text: session.title || 'Untitled SOP',
      heading: HeadingLevel.TITLE,
      spacing: { after: 200 },
    }));

    // Subtitle
    if (session.capturedUrl) {
      children.push(new Paragraph({
        children: [new TextRun({ text: session.capturedUrl, color: '6B7280', size: 20 })],
        spacing: { after: 400 },
      }));
    }

    // Steps
    steps.forEach((step, i) => {
      const text = step.displayText || step.generatedText || step.textOverride || '';
      if (!text) return;

      // Step number + title
      children.push(new Paragraph({
        children: [
          new TextRun({ text: `Step ${i + 1}`, bold: true, color: '6366F1', size: 22 }),
          step.stepTitle ? new TextRun({ text: `  ${step.stepTitle}`, bold: true, size: 22 }) : new TextRun(''),
        ],
        spacing: { before: 300, after: 100 },
      }));

      // Instruction text
      children.push(new Paragraph({
        children: [new TextRun({ text, size: 22 })],
        spacing: { after: 80 },
      }));

      // URL hint
      if (step.url) {
        children.push(new Paragraph({
          children: [new TextRun({ text: step.url, color: '9CA3AF', size: 18 })],
          spacing: { after: 200 },
        }));
      }

      // Divider between steps
      if (i < steps.length - 1) {
        children.push(new Paragraph({
          border: { bottom: { color: 'E5E7EB', style: BorderStyle.SINGLE, size: 1 } },
          spacing: { after: 200 },
          text: '',
        }));
      }
    });

    const doc = new Document({
      sections: [{ children }],
      styles: {
        default: {
          document: {
            run: { font: 'Inter', size: 22 },
          },
        },
      },
    });

    return Packer.toBuffer(doc) as unknown as Promise<Uint8Array>;
  }
}
