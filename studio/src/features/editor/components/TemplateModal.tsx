import React, { useState, useEffect } from 'react';
import { I } from '../../../components/icons';
import { docsApi } from '../lib/docsApi';
import type { ApiDocSummary } from '../lib/docsApi';

const STARTER_TEMPLATES = [
  { id: '__creative-brief', emoji: '📝', name: 'Creative brief' },
  { id: '__meeting-notes', emoji: '🗒️', name: 'Meeting notes' },
  { id: '__decision-log', emoji: '✅', name: 'Decision log' },
  { id: '__project-retro', emoji: '🔁', name: 'Project retro' },
];

interface TemplateModalProps {
  onClose: () => void;
  onUse: (id: string) => void;
}

export const TemplateModal: React.FC<TemplateModalProps> = ({ onClose, onUse }) => {
  const [tab, setTab] = useState<'starter' | 'mine'>('starter');
  const [selected, setSelected] = useState<string>('');
  const [myTemplates, setMyTemplates] = useState<ApiDocSummary[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  useEffect(() => {
    if (tab !== 'mine') return;
    setLoading(true);
    docsApi.listTemplates()
      .then(setMyTemplates)
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [tab]);

  return (
    <>
      <div className="doc-backdrop" style={{ background: 'rgba(0,0,0,0.4)' }} onClick={onClose} />
      <div className="doc-modal doc-template-modal">
        <div className="doc-template-head">
          <h2 style={{ flex: 1 }}>Choose a template</h2>
          <button className="doc-btn-icon" onClick={onClose}><I.X size={16} /></button>
        </div>
        <div className="doc-template-tabs">
          <button
            className={`doc-template-tab ${tab === 'starter' ? 'active' : ''}`}
            onClick={() => { setTab('starter'); setSelected(''); }}
          >
            Starter templates
          </button>
          <button
            className={`doc-template-tab ${tab === 'mine' ? 'active' : ''}`}
            onClick={() => { setTab('mine'); setSelected(''); }}
          >
            My templates
          </button>
        </div>

        <div className="doc-template-grid">
          {tab === 'starter' && STARTER_TEMPLATES.map((t) => (
            <div
              key={t.id}
              className={`doc-template-card ${selected === t.id ? 'selected' : ''}`}
              onClick={() => setSelected(t.id)}
            >
              <div className="doc-template-preview">
                <div style={{ fontSize: 28, textAlign: 'center', padding: '12px 0' }}>{t.emoji}</div>
                <div className="doc-bar" style={{ width: '75%' }} />
                <div className="doc-bar" style={{ width: '90%' }} />
              </div>
              <div className="doc-template-foot">
                <span className="doc-template-name">{t.name}</span>
              </div>
            </div>
          ))}

          {tab === 'mine' && loading && (
            <div style={{ gridColumn: '1/-1', padding: 24, color: 'var(--doc-text-3)', fontSize: 13 }}>
              Loading…
            </div>
          )}
          {tab === 'mine' && !loading && myTemplates.length === 0 && (
            <div style={{ gridColumn: '1/-1', padding: 24, color: 'var(--doc-text-3)', fontSize: 13 }}>
              No saved templates yet. Right-click any doc in the sidebar and choose "Save as template".
            </div>
          )}
          {tab === 'mine' && !loading && myTemplates.map((t) => (
            <div
              key={t.id}
              className={`doc-template-card ${selected === t.id ? 'selected' : ''}`}
              onClick={() => setSelected(t.id)}
            >
              <div className="doc-template-preview">
                <div style={{ fontSize: 28, textAlign: 'center', padding: '12px 0' }}>{t.emoji || '📄'}</div>
                <div className="doc-bar" style={{ width: '75%' }} />
                <div className="doc-bar" style={{ width: '90%' }} />
              </div>
              <div className="doc-template-foot">
                <span className="doc-template-name">{t.title || 'Untitled'}</span>
              </div>
            </div>
          ))}
        </div>

        <div className="doc-template-foot-bar">
          <button className="doc-btn doc-btn-ghost" onClick={onClose}>Start blank</button>
          <div style={{ flex: 1 }} />
          <button
            className="doc-btn doc-btn-primary"
            disabled={!selected}
            onClick={() => selected && onUse(selected)}
          >
            Use template
          </button>
        </div>
      </div>
    </>
  );
};
