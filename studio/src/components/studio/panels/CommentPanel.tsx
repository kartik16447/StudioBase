import React, { useEffect, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useStudioStore } from '../../../store/useStudioStore';
import { I } from '../../icons';
import { cn } from '../../ui';
import type { CommentItem } from '../../../lib/apiClient';

function timeAgo(ts: number): string {
  const diff = Math.floor((Date.now() - ts) / 1000);
  if (diff < 60) return 'just now';
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  return `${Math.floor(diff / 86400)}d ago`;
}

function AuthorAvatar({ name, size = 28 }: { name: string | null; size?: number }) {
  const initials = (name ?? '?').split(' ').map((w) => w[0]).slice(0, 2).join('').toUpperCase();
  const hue = name ? (name.charCodeAt(0) * 17) % 360 : 200;
  return (
    <div
      className="flex-shrink-0 rounded-full flex items-center justify-center text-[10px] font-bold text-white select-none"
      style={{
        width: size,
        height: size,
        background: `linear-gradient(135deg, hsl(${hue} 65% 50%), hsl(${(hue + 40) % 360} 65% 40%))`,
      }}
    >
      {initials}
    </div>
  );
}

function CommentCard({
  comment,
  steps,
  onResolve,
  onDelete,
}: {
  comment: CommentItem;
  steps: { id: string; sequence: number; generatedText?: string | null; elementText?: string | null }[];
  onResolve: (id: string) => void;
  onDelete: (id: string) => void;
}) {
  const step = steps.find((s) => s.id === comment.stepId);
  const stepLabel = step
    ? `Step ${step.sequence} — ${(step.generatedText ?? step.elementText ?? '').slice(0, 40) || 'Untitled'}`
    : null;

  return (
    <div
      className={cn(
        'rounded-lg p-3 border transition-colors',
        comment.resolvedAt
          ? 'bg-white/[0.02] border-white/[0.05] opacity-60'
          : 'bg-white/[0.04] border-white/[0.08]',
      )}
    >
      {stepLabel && (
        <div className="text-[10px] text-primary/70 font-medium mb-1.5 flex items-center gap-1">
          <I.BookOpen className="w-3 h-3" />
          {stepLabel}
        </div>
      )}

      <div className="flex items-start gap-2">
        <AuthorAvatar name={comment.authorName} />
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <span className="text-[12px] font-semibold text-text truncate">
              {comment.authorName ?? 'Unknown'}
            </span>
            <span className="text-[10px] text-text-3 flex-shrink-0">{timeAgo(comment.createdAt)}</span>
          </div>
          <p className="text-[13px] text-text-2 leading-relaxed break-words">{comment.body}</p>
        </div>
      </div>

      <div className="flex items-center gap-2 mt-2 pt-2 border-t border-white/[0.05]">
        <button
          onClick={() => onResolve(comment.id)}
          className={cn(
            'flex items-center gap-1 text-[11px] px-2 py-0.5 rounded transition-colors',
            comment.resolvedAt
              ? 'text-text-3 hover:text-text-2'
              : 'text-emerald-400 hover:text-emerald-300',
          )}
        >
          <I.Check className="w-3 h-3" />
          {comment.resolvedAt ? 'Unresolve' : 'Resolve'}
        </button>
        <button
          onClick={() => onDelete(comment.id)}
          className="flex items-center gap-1 text-[11px] px-2 py-0.5 rounded text-text-3 hover:text-red-400 transition-colors ml-auto"
        >
          <I.Trash2 className="w-3 h-3" />
        </button>
      </div>
    </div>
  );
}

export const CommentPanel: React.FC = () => {
  const {
    session,
    comments,
    commentsLoading,
    commentsPanelOpen,
    fetchComments,
    addComment,
    resolveComment,
    deleteComment,
    setCommentsPanelOpen,
  } = useStudioStore();

  const [body, setBody] = useState('');
  const [anchorStepId, setAnchorStepId] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const sopId = (session as any)?.sopId ?? null;
  const steps = session?.steps ?? [];

  useEffect(() => {
    if (commentsPanelOpen && sopId) {
      fetchComments(sopId);
    }
  }, [commentsPanelOpen, sopId]);

  const handleSubmit = async () => {
    if (!sopId || !body.trim() || submitting) return;
    setSubmitting(true);
    try {
      await addComment(sopId, anchorStepId, body.trim());
      setBody('');
      setAnchorStepId(null);
    } catch (e) {
      console.error(e);
    } finally {
      setSubmitting(false);
    }
  };

  const unresolvedCount = comments.filter((c) => !c.resolvedAt).length;

  return (
    <AnimatePresence>
      {commentsPanelOpen && (
        <motion.div
          initial={{ x: 320, opacity: 0 }}
          animate={{ x: 0, opacity: 1 }}
          exit={{ x: 320, opacity: 0 }}
          transition={{ type: 'spring', stiffness: 300, damping: 30 }}
          className="fixed right-0 top-0 h-full w-80 bg-[#111118] border-l border-white/[0.07] shadow-2xl z-50 flex flex-col"
        >
          {/* Header */}
          <div className="flex items-center justify-between px-4 py-3 border-b border-white/[0.07]">
            <div className="flex items-center gap-2">
              <I.MessageSquare className="w-4 h-4 text-primary" />
              <span className="text-[13px] font-semibold text-text">Comments</span>
              {unresolvedCount > 0 && (
                <span className="bg-primary/20 text-primary text-[10px] font-bold px-1.5 py-0.5 rounded-full">
                  {unresolvedCount}
                </span>
              )}
            </div>
            <button
              onClick={() => setCommentsPanelOpen(false)}
              className="text-text-3 hover:text-text transition-colors p-1 rounded"
            >
              <I.X className="w-4 h-4" />
            </button>
          </div>

          {/* Comment list */}
          <div className="flex-1 overflow-y-auto p-3 space-y-2">
            {commentsLoading ? (
              <div className="text-center text-text-3 text-[12px] py-8">Loading…</div>
            ) : comments.length === 0 ? (
              <div className="text-center text-text-3 text-[12px] py-8">
                No comments yet. Be the first to leave feedback.
              </div>
            ) : (
              comments.map((c) => (
                <CommentCard
                  key={c.id}
                  comment={c}
                  steps={steps}
                  onResolve={resolveComment}
                  onDelete={deleteComment}
                />
              ))
            )}
          </div>

          {/* Compose */}
          {sopId && (
            <div className="border-t border-white/[0.07] p-3 space-y-2">
              {steps.length > 0 && (
                <select
                  value={anchorStepId ?? ''}
                  onChange={(e) => setAnchorStepId(e.target.value || null)}
                  className="w-full text-[11px] bg-[#1c1c28] border border-white/[0.12] rounded px-2 py-1.5 text-white/80 focus:outline-none focus:border-primary/50"
                >
                  <option value="">SOP-level comment</option>
                  {steps.map((s) => (
                    <option key={s.id} value={s.id}>
                      Step {s.sequence} — {(s.generatedText ?? s.elementText ?? '').slice(0, 35) || 'Untitled'}
                    </option>
                  ))}
                </select>
              )}
              <textarea
                ref={textareaRef}
                value={body}
                onChange={(e) => setBody(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) handleSubmit();
                }}
                placeholder="Add a comment… (⌘↵ to send)"
                rows={3}
                className="w-full text-[13px] bg-[#1c1c28] border border-white/[0.12] rounded-lg px-3 py-2 text-white placeholder:text-white/30 resize-none focus:outline-none focus:border-primary/60 transition-colors"
              />
              <button
                onClick={handleSubmit}
                disabled={!body.trim() || submitting}
                className="w-full py-1.5 rounded-lg text-[12px] font-semibold bg-primary hover:bg-primary/90 text-white transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
              >
                {submitting ? 'Sending…' : 'Send Comment'}
              </button>
            </div>
          )}
        </motion.div>
      )}
    </AnimatePresence>
  );
};
