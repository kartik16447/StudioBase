import React, { useState, useEffect } from 'react';
import { I } from '../../../components/icons';
import { TEMPLATES_STARTER, TEMPLATES_MINE } from '../data/mockData';

interface TemplateModalProps {
  onClose: () => void;
  onUse: (id: string) => void;
}

export const TemplateModal: React.FC<TemplateModalProps> = ({ onClose, onUse }) => {
  const [tab, setTab] = useState<'starter' | 'mine'>('starter');
  const [selected, setSelected] = useState('brief');
  const list = tab === 'starter' ? TEMPLATES_STARTER : TEMPLATES_MINE;

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

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
            onClick={() => setTab('starter')}
          >
            Starter templates
          </button>
          <button
            className={`doc-template-tab ${tab === 'mine' ? 'active' : ''}`}
            onClick={() => setTab('mine')}
          >
            My templates
          </button>
        </div>
        <div className="doc-template-grid">
          {list.map((t) => (
            <div
              key={t.id}
              className={`doc-template-card ${selected === t.id ? 'selected' : ''}`}
              onClick={() => setSelected(t.id)}
            >
              <div className="doc-template-preview">
                <div className="doc-bar" style={{ width: '60%' }} />
                <div className="doc-bar" style={{ width: '90%' }} />
                <div className="doc-bar" style={{ width: '75%' }} />
                <div className="doc-bar" style={{ width: '82%' }} />
              </div>
              <div className="doc-template-foot">
                <span className="doc-template-name">{t.name}</span>
                <span className="doc-template-count">{t.count}</span>
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
            onClick={() => onUse(selected)}
          >
            Use template
          </button>
        </div>
      </div>
    </>
  );
};
