import React, { useEffect, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useStudioStore } from '../../store/useStudioStore';
import { I } from '../icons';
import { cn } from './index';
import type { NotificationItem } from '../../lib/apiClient';

const NOTIF_ICONS: Record<string, React.ElementType> = {
  'comment.added': I.MessageSquare,
  'sop.review_requested': I.Eye,
  'sop.published': I.CheckCircle,
  'member.invited': I.UserPlus,
};

const NOTIF_LABELS: Record<string, string> = {
  'comment.added': 'New comment',
  'sop.review_requested': 'Review requested',
  'sop.published': 'SOP published',
  'member.invited': 'Team invite',
};

function timeAgo(ts: number): string {
  const diff = Math.floor((Date.now() - ts) / 1000);
  if (diff < 60) return 'just now';
  if (diff < 3600) return `${Math.floor(diff / 60)}m`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h`;
  return `${Math.floor(diff / 86400)}d`;
}

function NotifRow({ notif, onClick }: { notif: NotificationItem; onClick: () => void }) {
  const Icon = NOTIF_ICONS[notif.type] ?? I.Bell;
  let meta: Record<string, any> = {};
  try { meta = JSON.parse(notif.metadata ?? '{}'); } catch {}

  const label = NOTIF_LABELS[notif.type] ?? notif.type;
  const subtitle = notif.actorName
    ? `${notif.actorName}${meta.commentBody ? ` — "${meta.commentBody}"` : ''}`
    : meta.sopTitle ?? '';

  return (
    <button
      onClick={onClick}
      className={cn(
        'w-full text-left px-4 py-3 flex items-start gap-3 transition-colors hover:bg-white/[0.04]',
        !notif.readAt && 'bg-primary/[0.04]',
      )}
    >
      <div className={cn(
        'flex-shrink-0 w-7 h-7 rounded-full flex items-center justify-center',
        !notif.readAt ? 'bg-primary/20 text-primary' : 'bg-white/[0.08] text-text-3',
      )}>
        <Icon className="w-3.5 h-3.5" />
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center justify-between gap-2">
          <span className={cn('text-[12px] font-semibold truncate', notif.readAt ? 'text-text-2' : 'text-text')}>
            {label}
          </span>
          <span className="text-[10px] text-text-3 flex-shrink-0">{timeAgo(notif.createdAt)}</span>
        </div>
        {subtitle && (
          <p className="text-[11px] text-text-3 truncate mt-0.5">{subtitle}</p>
        )}
      </div>
      {!notif.readAt && (
        <div className="flex-shrink-0 w-1.5 h-1.5 rounded-full bg-primary mt-1.5" />
      )}
    </button>
  );
}

export const NotificationBell: React.FC = () => {
  const {
    notifications,
    unreadCount,
    fetchNotifications,
    markNotificationRead,
    markAllNotificationsRead,
    navigate,
  } = useStudioStore();

  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  // Fetch on mount and poll every 60s
  useEffect(() => {
    fetchNotifications();
    const id = setInterval(fetchNotifications, 60_000);
    return () => clearInterval(id);
  }, []);

  // Close on outside click
  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  const handleNotifClick = async (notif: NotificationItem) => {
    if (!notif.readAt) await markNotificationRead(notif.id);
    // Navigate to the relevant session if targetId looks like one
    if (notif.targetId) {
      navigate('studio', { sessionId: notif.targetId });
    }
    setOpen(false);
  };

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen((o) => !o)}
        className={cn(
          'relative w-8 h-8 flex items-center justify-center rounded-lg transition-colors',
          open ? 'bg-white/[0.08] text-text' : 'text-text-2 hover:text-text hover:bg-white/[0.05]',
        )}
        aria-label="Notifications"
      >
        <I.Bell className="w-4 h-4" />
        {unreadCount > 0 && (
          <span className="absolute top-0.5 right-0.5 w-4 h-4 bg-primary rounded-full flex items-center justify-center text-[9px] font-bold text-white leading-none">
            {unreadCount > 9 ? '9+' : unreadCount}
          </span>
        )}
      </button>

      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: -4 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: -4 }}
            transition={{ duration: 0.12 }}
            className="absolute right-0 top-10 w-80 bg-[#111118] border border-white/[0.08] rounded-xl shadow-2xl overflow-hidden z-[100]"
          >
            {/* Header */}
            <div className="flex items-center justify-between px-4 py-2.5 border-b border-white/[0.07]">
              <span className="text-[12px] font-semibold text-text">Notifications</span>
              {unreadCount > 0 && (
                <button
                  onClick={() => markAllNotificationsRead()}
                  className="text-[11px] text-primary hover:text-primary/80 transition-colors"
                >
                  Mark all read
                </button>
              )}
            </div>

            {/* List */}
            <div className="max-h-[360px] overflow-y-auto divide-y divide-white/[0.04]">
              {notifications.length === 0 ? (
                <div className="px-4 py-8 text-center text-[12px] text-text-3">
                  You're all caught up
                </div>
              ) : (
                notifications.map((n) => (
                  <NotifRow key={n.id} notif={n} onClick={() => handleNotifClick(n)} />
                ))
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};
