import React, { useState, useEffect, useMemo } from 'react';
import { I } from '../../../components/icons';
import { SEARCH_RESULTS } from '../data/mockData';
import type { SearchResult } from '../types';

interface SearchModalProps {
  onClose: () => void;
  onPick: (result: SearchResult) => void;
}

export const SearchModal: React.FC<SearchModalProps> = ({ onClose, onPick }) => {
  const [query, setQuery] = useState('type');
  const [active, setActive] = useState(0);

  const results = useMemo(() => {
    if (!query.trim()) return [];
    return SEARCH_RESULTS.filter(
      (r) =>
        r.title.toLowerCase().includes(query.toLowerCase()) ||
        r.snip.toLowerCase().includes(query.toLowerCase()) ||
        query.toLowerCase() === 'type'
    );
  }, [query]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
      else if (e.key === 'ArrowDown') { e.preventDefault(); setActive((a) => Math.min(results.length - 1, a + 1)); }
      else if (e.key === 'ArrowUp') { e.preventDefault(); setActive((a) => Math.max(0, a - 1)); }
      else if (e.key === 'Enter' && results[active]) { e.preventDefault(); onPick(results[active]); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [active, results, onClose, onPick]);

  const renderSnip = (snip: string) => {
    const parts = snip.split(/\*\*([^*]+)\*\*/g);
    return parts.map((p, i) => i % 2 === 1 ? <b key={i}>{p}</b> : p);
  };

  return (
    <>
      <div className="doc-backdrop" onClick={onClose} />
      <div className="doc-modal doc-search-modal" role="dialog" aria-label="Search">
        <div className="doc-search-input-wrap">
          <I.Search size={20} style={{ color: 'var(--doc-text-3)' }} />
          <input
            autoFocus
            value={query}
            onChange={(e) => { setQuery(e.target.value); setActive(0); }}
            placeholder="Search docs by title or content…"
          />
          {query && (
            <button className="doc-search-clear" onClick={() => setQuery('')} title="Clear">
              <I.X size={12} />
            </button>
          )}
        </div>
        <div className="doc-search-results">
          {results.length === 0 && query && (
            <div className="doc-search-empty">
              <div className="doc-glass"><I.Search size={24} /></div>
              <p>No results for <span>"{query}"</span></p>
            </div>
          )}
          {results.map((r, i) => (
            <div
              key={r.id}
              className={`doc-search-result ${i === active ? 'active' : ''}`}
              onMouseEnter={() => setActive(i)}
              onClick={() => onPick(r)}
            >
              <span className="doc-res-icon">{r.emoji}</span>
              <div className="doc-res-info">
                <div className="doc-res-title">{r.title}</div>
                <div className="doc-res-path">{r.path}</div>
              </div>
              <div className="doc-res-snip">{renderSnip(r.snip)}</div>
            </div>
          ))}
        </div>
        <div className="doc-search-footer">
          <span><kbd>↑</kbd><kbd>↓</kbd> Navigate</span>
          <span><kbd>↩</kbd> Open</span>
          <span><kbd>Esc</kbd> Close</span>
        </div>
      </div>
    </>
  );
};
