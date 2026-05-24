import React from 'react';
import { I } from '../../../components/icons';
import type { DocBlock } from '../types';

interface BlockProps {
  block: DocBlock;
  numberInList?: number;
  onHoverAdd?: (id: string) => void;
  onOpenBlockMenu?: (id: string, el: HTMLElement) => void;
  onToggleCheck?: (id: string) => void;
  onToggleOpen?: (id: string) => void;
  selectionId?: string | null;
  selectionRange?: [number, number] | null;
  menuOpen?: boolean;
  cursorBlockId?: string | null;
  cursorPos?: number | null;
  registerRef?: (id: string, el: HTMLDivElement) => void;
}

export const Block: React.FC<BlockProps> = ({
  block,
  numberInList,
  onHoverAdd,
  onOpenBlockMenu,
  onToggleCheck,
  onToggleOpen,
  selectionId,
  selectionRange,
  menuOpen,
  cursorBlockId,
  cursorPos,
  registerRef,
}) => {
  const ref = React.useRef<HTMLDivElement>(null);

  React.useEffect(() => {
    if (ref.current && registerRef) registerRef(block.id, ref.current);
  });

  const t = block.type;
  let cls = `doc-block ${t}`;
  if (t === 'check' && block.done) cls += ' done';
  if (menuOpen) cls += ' menu-open';
  if (t === 'toggle' && block.open) cls += ' open';

  const renderText = () => {
    const txt = block.text ?? '';
    const isSelected = selectionId === block.id && selectionRange;
    const isCursor = cursorBlockId === block.id && cursorPos != null;

    if (isSelected) {
      const [s, e] = selectionRange!;
      return (
        <>
          {txt.slice(0, s)}
          <span className="doc-sel-highlight">{txt.slice(s, e)}</span>
          {txt.slice(e)}
        </>
      );
    }
    if (isCursor) {
      return (
        <>
          {txt.slice(0, cursorPos!)}
          <span className="doc-cursor" />
          {txt.slice(cursorPos!)}
        </>
      );
    }
    return txt;
  };

  return (
    <div
      ref={ref}
      className={cls}
      data-num={t === 'numbered' ? numberInList : undefined}
      data-block-id={block.id}
    >
      <div className="doc-block-hover">
        <button
          className="doc-ctl"
          title="Add block"
          onClick={() => onHoverAdd?.(block.id)}
        >
          <I.Plus size={14} />
        </button>
        <button
          className="doc-ctl"
          title="Block options"
          onClick={(e) => onOpenBlockMenu?.(block.id, e.currentTarget)}
        >
          <I.GripVertical size={14} />
        </button>
      </div>

      {t === 'divider' && <hr />}

      {t === 'check' && (
        <div
          className="doc-checkbox"
          onClick={() => onToggleCheck?.(block.id)}
        >
          {block.done && <I.Check size={12} strokeWidth={3} />}
        </div>
      )}

      {t === 'toggle' && (
        <>
          <div className="doc-toggle-head">
            <button className="doc-toggle-tri" onClick={() => onToggleOpen?.(block.id)}>
              <I.ChevronRight size={14} className="doc-chev" />
            </button>
            <div className="doc-toggle-summary">
              <div className="doc-block-content">{renderText()}</div>
            </div>
          </div>
          <div className="doc-toggle-children">
            {block.children?.map((c, i) => (
              <Block key={c.id} block={c} numberInList={i + 1} />
            ))}
          </div>
        </>
      )}

      {t !== 'divider' && t !== 'toggle' && (
        <div className="doc-block-content">{renderText()}</div>
      )}
    </div>
  );
};
