import React, { useState, useEffect } from 'react';
import type { JSONContent } from '@tiptap/react';
import { TiptapEditor } from '../features/editor/components/TiptapEditor';
import { docsApi } from '../features/editor/lib/docsApi';

interface SharedDocPageProps {
  shareToken: string;
}

export const SharedDocPage: React.FC<SharedDocPageProps> = ({ shareToken }) => {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [title, setTitle] = useState('');
  const [emoji, setEmoji] = useState<string | null>(null);
  const [content, setContent] = useState<JSONContent>({ type: 'doc', content: [] });

  useEffect(() => {
    setLoading(true);
    docsApi.getPublic(shareToken)
      .then((doc) => {
        setTitle(doc.title);
        setEmoji(doc.emoji);
        setContent({ type: 'doc', content: doc.blocks });
        setLoading(false);
      })
      .catch(() => {
        setError('This document is not available or the link has expired.');
        setLoading(false);
      });
  }, [shareToken]);

  if (loading) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100vh', color: 'var(--doc-text-3)', fontSize: 14 }}>
        Loading…
      </div>
    );
  }

  if (error) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100vh', gap: 12 }}>
        <p style={{ color: 'var(--doc-text-2)', fontSize: 15 }}>{error}</p>
      </div>
    );
  }

  return (
    <div style={{ maxWidth: 760, margin: '0 auto', padding: '48px 24px', minHeight: '100vh', background: 'var(--doc-surface)' }}>
      <div style={{ marginBottom: 24 }}>
        {emoji && <div style={{ fontSize: 40, marginBottom: 8 }}>{emoji}</div>}
        <h1 style={{ fontSize: 32, fontWeight: 700, color: 'var(--doc-text-1)', margin: 0 }}>{title || 'Untitled'}</h1>
      </div>
      <TiptapEditor initialContent={content} editable={false} />
    </div>
  );
};
