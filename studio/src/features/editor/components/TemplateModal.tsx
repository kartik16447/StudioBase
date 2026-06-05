import React, { useState, useEffect } from 'react';
import type { JSONContent } from '@tiptap/react';
import { I } from '../../../components/icons';
import { docsApi } from '../lib/docsApi';
import type { ApiDocSummary } from '../lib/docsApi';
import { STARTER_TEMPLATES } from '../data/starterTemplates';

interface TemplateModalProps {
  onClose: () => void;
  onUse: (id: string, blocks?: JSONContent[]) => void;
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

  const handleUse = () => {
    if (!selected) return;
    const starter = STARTER_TEMPLATES.find(t => t.id === selected);
    onUse(selected, starter?.blocks);
  };

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
                <div style={{ fontSize: 28, textAlign: 'center', padding: '8px 0 4px' }}>{t.emoji}</div>
                <div style={{ fontSize: 10, fontWeight: 600, textAlign: 'center', color: 'var(--doc-text-3)', marginBottom: 6, textTransform: 'uppercase', letterSpacing: '0.08em' }}>{t.category.replace(/-/g, ' ')}</div>
                <div className="doc-bar" style={{ width: '80%' }} />
                <div className="doc-bar" style={{ width: '60%' }} />
                <div className="doc-bar" style={{ width: '90%' }} />
              </div>
              <div className="doc-template-foot">
                <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                  <span className="doc-template-name">{t.name}</span>
                  <span style={{ fontSize: 11, color: 'var(--doc-text-3)', lineHeight: 1.35 }}>{t.description}</span>
                </div>
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
            onClick={handleUse}
          >
            Use template
          </button>
        </div>
      </div>
    </>
  );
};
