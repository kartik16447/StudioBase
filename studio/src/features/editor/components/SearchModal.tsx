import React, { useState, useEffect, useCallback } from 'react';
import { I } from '../../../components/icons';
import { docsApi } from '../lib/docsApi';
import type { SearchResult } from '../types';

interface SearchModalProps {
  onClose: () => void;
  onPick: (result: SearchResult) => void;
}

export const SearchModal: React.FC<SearchModalProps> = ({ onClose, onPick }) => {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<SearchResult[]>([]);
  const [active, setActive] = useState(0);
  const [searching, setSearching] = useState(false);

  // Debounced live search
  useEffect(() => {
    if (!query.trim()) {
      setResults([]);
      return;
    }
    let cancelled = false;
    const timer = setTimeout(async () => {
      setSearching(true);
      try {
        const hits = await docsApi.search(query);
        if (cancelled) return;
        setResults(
          hits.map((h) => ({
            id: h.id,
            emoji: h.emoji ?? '📄',
            title: h.title,
            path: h.title,
            snip: h.snippet,
          }))
        );
        setActive(0);
      } catch {
        if (!cancelled) setResults([]);
      } finally {
        if (!cancelled) setSearching(false);
      }
    }, 250);
    return () => { cancelled = true; clearTimeout(timer); };
  }, [query]);

  const handlePick = useCallback((r: SearchResult) => {
    onPick(r);
  }, [onPick]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { e.preventDefault(); onClose(); }
      else if (e.key === 'ArrowDown') { e.preventDefault(); setActive((a) => Math.min(results.length - 1, a + 1)); }
      else if (e.key === 'ArrowUp') { e.preventDefault(); setActive((a) => Math.max(0, a - 1)); }
      else if (e.key === 'Enter' && results[active]) { e.preventDefault(); handlePick(results[active]); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [active, results, onClose, handlePick]);

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
          {searching && (
            <div className="doc-search-empty" style={{ gap: 8 }}>
              <p style={{ color: 'var(--doc-text-3)', fontSize: 13 }}>Searching…</p>
            </div>
          )}
          {!searching && results.length === 0 && query.trim() && (
            <div className="doc-search-empty">
              <div className="doc-glass"><I.Search size={24} /></div>
              <p>No results for <span>"{query}"</span></p>
            </div>
          )}
          {!searching && results.map((r, i) => (
            <div
              key={r.id}
              className={`doc-search-result ${i === active ? 'active' : ''}`}
              onMouseEnter={() => setActive(i)}
              onClick={() => handlePick(r)}
            >
              <span className="doc-res-icon">{r.emoji}</span>
              <div className="doc-res-info">
                <div className="doc-res-title">{r.title}</div>
                <div className="doc-res-path">{r.path}</div>
              </div>
              {r.snip && <div className="doc-res-snip">{renderSnip(r.snip)}</div>}
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
