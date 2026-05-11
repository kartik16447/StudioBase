/* global chrome */
import React, { useEffect, useState, useMemo } from "react";
import { recoverSession } from "../../db";
import {
  StorageAccount,
  SessionMetadata,
  BackendUser,
  StorageSchema,
  BackendVideo,
} from "../../types";
import { deleteFile, getFileMetadata, renameFile } from "../../google-drive";
import { safeFetch } from "../../utils/api";
import { sbLog } from "../../logger";

const VIEWER_BASE_URL = "https://screenvault.karthik-upadhyay98.workers.dev";

interface WorkspaceMember {
  userId: string;
  email: string;
  role: "owner" | "member";
}

interface WorkspaceVideo {
  id: string;
  backendId: string;
  fileId: string;
  sessionId?: string;
  workspaceId?: string;
  name: string;
  title: string;
  createdTime: string;
  startedAt?: number;
  thumbnailLink: string | null;
  previewUrl?: string;
  webViewLink?: string;
  accountEmail: string;
  status: string;
  ownerId?: string;
  isPending?: boolean;
  createdAt?: number;
  playerUrl?: string;
}

const getDeterministicColor = (email: string) => {
  const colors = [
    "#3B82F6",
    "#10B981",
    "#F59E0B",
    "#EF4444",
    "#8B5CF6",
    "#EC4899",
  ];
  let hash = 0;
  for (let i = 0; i < email.length; i++) {
    hash = email.charCodeAt(i) + ((hash << 5) - hash);
  }
  return colors[Math.abs(hash) % colors.length];
};

export function LibraryPage() {
  const [files, setFiles] = useState<WorkspaceVideo[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [user, setUser] = useState<BackendUser | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [retryingIds, setRetryingIds] = useState<Set<string>>(new Set());
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingTitle, setEditingTitle] = useState<string>("");
  const [isRenaming, setIsRenaming] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [hoveredId, setHoveredId] = useState<string | null>(null);
  const [isJoinModalOpen, setIsJoinModalOpen] = useState(false);
  const [debouncedQuery, setDebouncedQuery] = useState("");
  const [inviteUrl, setInviteUrl] = useState<string | null>(null);
  const [inviting, setInviting] = useState(false);
  const [showLeaveConfirm, setShowLeaveConfirm] = useState(false);
  const [leaving, setLeaving] = useState(false);
  const [menuOpenId, setMenuOpenId] = useState<string | null>(null);

  // Pagination State
  const [nextCursor, setNextCursor] = useState<any | null>(null);
  const [hasMore, setHasMore] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);

  // Members State
  const [showMembersModal, setShowMembersModal] = useState(false);
  const [members, setMembers] = useState<WorkspaceMember[]>([]);
  const [loadingMembers, setLoadingMembers] = useState(false);
  const [invites, setInvites] = useState<any[]>([]);
  const [loadingInvites, setLoadingInvites] = useState(false);
  const [storageAccounts, setStorageAccounts] = useState<StorageAccount[]>([]);

  const isFetching = React.useRef(false);
  const observerTarget = React.useRef<HTMLDivElement>(null);

  const fetchData = React.useCallback(async (cursor?: any | null) => {
    const isInitial = !cursor;
    console.log(`fetchData called. initial: ${isInitial}, cursor: ${cursor}`);

    // Allow initial fetches (resets) to proceed even if a background fetch is active
    if (isFetching.current && !isInitial) {
      console.log("fetchData: background fetch already in progress, skipping.");
      return;
    }

    if (typeof chrome === "undefined" || !chrome.storage?.local) {
      setLoading(false);
      return;
    }

    isFetching.current = true;
    if (isInitial) {
      setLoading(true);
      setFiles([]); // Clear list immediately on workspace switch
      setNextCursor(null);
      setHasMore(false);
    } else {
      setLoadingMore(true);
    }
    setError(null);

    const storage = (await chrome.storage.local.get([
      "sv_sessions",
      "sv_user",
      "sv_accounts",
    ])) as StorageSchema;

    const localSessions = storage.sv_sessions || {};
    const sv_user = storage.sv_user;
    setUser(sv_user || null);

    if (!sv_user || !sv_user.workspaceId || !sv_user.accessToken) {
      setFiles([]);
      if (isInitial) setLoading(false);
      else setLoadingMore(false);
      isFetching.current = false;
      return;
    }

    const { workspaceId, accessToken } = sv_user;

    try {
      let url = `https://screenvault-backend.karthik-upadhyay98.workers.dev/videos?workspaceId=${workspaceId}&limit=12`;
      if (cursor) url += `&cursor=${cursor}`;

      const res = await safeFetch(url);

      const {
        videos,
        nextCursor: newCursor,
        hasMore: moreAvailable,
      } = await res.json();

      // Guard: Ensure workspace hasn't changed during the async fetch
      const currentStorage = (await chrome.storage.local.get("sv_user")) as {
        sv_user?: BackendUser;
      };
      if (currentStorage.sv_user?.workspaceId !== workspaceId) {
        isFetching.current = false;
        return;
      }

      setNextCursor(newCursor);
      setHasMore(moreAvailable);

      const backendFiles = (videos || []).map(
        (v: BackendVideo): WorkspaceVideo => ({
          id: v.id,
          backendId: v.id,
          fileId: v.fileId,
          sessionId: v.sessionId,
          workspaceId: v.workspaceId,
          playerUrl: v.playerUrl,
          title: v.title || "Recording",
          name: (v.title || "") + ".webm",
          createdTime: new Date(v.createdAt || Date.now()).toISOString(),
          thumbnailLink: v.thumbnailUrl || null,
          previewUrl: v.previewUrl,
          webViewLink: v.webViewLink,
          accountEmail: v.accountEmail || v.account_email || "External Account",
          status: v.status || "ready",
          ownerId: v.ownerId,
          createdAt: v.createdAt,
        }),
      );

      sbLog("DASHBOARD_FETCH_VIDEOS", {
        count: backendFiles.length,
        timestamp: Date.now(),
      });

      const merged: WorkspaceVideo[] = [];
      const processedIds = new Set<string>();

      // 1. Add Backend Files FIRST (Source of Truth)
      backendFiles.forEach((file: WorkspaceVideo) => {
        const idToUse = file.id; // Backend UUID is canonical
        if (!processedIds.has(idToUse)) {
          processedIds.add(idToUse);
          merged.push(file);
        }
      });

      // 2. Add Local Sessions ONLY if they are not already in the backend
      if (isInitial) {
        Object.values(localSessions).forEach((session: SessionMetadata) => {
          // Identify local sessions by their backend UUID if available, else sessionId
          const primaryId = session.backendVideoId || session.sessionId;
          if (!processedIds.has(primaryId)) {
            processedIds.add(primaryId);
            merged.push({
              id: primaryId,
              sessionId: session.sessionId,
              backendId: session.backendVideoId || "", // Local session might not be synced yet
              fileId: session.fileId,
              name: (session.title || "Recording") + ".webm",
              title: session.title || "Recording",
              status: session.status || "ready",
              isPending: false,
              createdTime: new Date(
                session.startedAt || Date.now(),
              ).toISOString(),
              startedAt: session.startedAt,
              thumbnailLink: session.thumbnailUrl || null,
              accountEmail: session.accountEmail || "Local Session",
              playerUrl: session.playerUrl,
            });
          }
        });
      }

      if (isInitial) {
        setFiles(merged);
      } else {
        setFiles((prev) => [...prev, ...merged]);
      }
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
      setLoadingMore(false);
      isFetching.current = false;
      console.log("fetchData completed.");
    }
  }, []); // Dependencies removed to prevent infinite loop

  useEffect(() => {
    if (!hasMore || loadingMore || loading) return;

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting) {
          fetchData(nextCursor);
        }
      },
      { threshold: 0.1 },
    );

    if (observerTarget.current) {
      observer.observe(observerTarget.current);
    }

    return () => observer.disconnect();
  }, [hasMore, loadingMore, loading, nextCursor, fetchData]);

  const fetchMembers = React.useCallback(async () => {
    const workspaceId = user?.workspaceId;
    if (!workspaceId) return;
    setLoadingMembers(true);
    try {
      const res = await safeFetch(
        `https://screenvault-backend.karthik-upadhyay98.workers.dev/workspace/members?workspaceId=${workspaceId}`,
      );
      const data = await res.json();
      setMembers(data);
    } catch (err) {
      console.error("Failed to fetch members:", err);
    } finally {
      setLoadingMembers(false);
    }
  }, [user?.workspaceId]);

  const fetchInvites = React.useCallback(async () => {
    const workspaceId = user?.workspaceId;
    if (!workspaceId) return;
    setLoadingInvites(true);
    try {
      const res = await safeFetch(
        `https://screenvault-backend.karthik-upadhyay98.workers.dev/workspace/invites?workspaceId=${workspaceId}`,
      );
      const data = await res.json();
      setInvites(data);
    } catch (err) {
      console.error("Failed to fetch invites:", err);
    } finally {
      setLoadingInvites(false);
    }
  }, [user?.workspaceId]);

  useEffect(() => {
    if (showMembersModal) {
      fetchMembers();
      fetchInvites();
    }
  }, [showMembersModal, fetchMembers, fetchInvites]);

  const handleRevokeInvite = async (inviteId: string) => {
    if (
      !confirm(
        "Are you sure you want to revoke this invite? It will prevent new users from joining.",
      )
    )
      return;
    try {
      await safeFetch(
        `https://screenvault-backend.karthik-upadhyay98.workers.dev/workspace/invite/revoke`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ inviteId }),
        },
      );
      fetchInvites();
    } catch (err: any) {
      alert(`Failed to revoke invite: ${err.message}`);
    }
  };

  const handleRemoveMember = async (userIdToRemove: string) => {
    if (!confirm("Are you sure you want to remove this member?")) return;
    try {
      await safeFetch(
        `https://screenvault-backend.karthik-upadhyay98.workers.dev/workspace/member/${userIdToRemove}?workspaceId=${user?.workspaceId}`,
        {
          method: "DELETE",
        },
      );
      fetchMembers();
      fetchData(); // Refresh videos just in case
    } catch (err: any) {
      alert(`Failed to remove member: ${err.message}`);
    }
  };

  useEffect(() => {
    (chrome.storage.local.get(["sv_accounts"]) as Promise<StorageSchema>).then(
      (res) => {
        setStorageAccounts(res.sv_accounts || []);
      },
    );
  }, []);

  const handleInvite = async () => {
    if (inviting) return;
    setInviting(true);
    try {
      const storage = (await chrome.storage.local.get([
        "sv_user",
      ])) as StorageSchema;
      const sv_user = storage.sv_user;

      if (!sv_user?.workspaceId || !sv_user?.accessToken) return;

      const res = await safeFetch(
        `https://screenvault-backend.karthik-upadhyay98.workers.dev/workspace/invite`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ workspaceId: sv_user.workspaceId }),
        },
      );
      const data = await res.json();

      const fullUrl = data.joinUrl || `${VIEWER_BASE_URL}/#/invite/${data.token}`;
      setInviteUrl(fullUrl);
      await navigator.clipboard.writeText(fullUrl);
      fetchInvites(); // Refresh list

      setTimeout(() => setInviteUrl(null), 1000);
    } catch (err: any) {
      console.error(err);
      alert(`Invite failed: ${err.message}`);
    } finally {
      setInviting(false);
    }
  };

  const handleLeaveWorkspace = async () => {
    if (leaving) return;
    setLeaving(true);
    try {
      const storage = (await chrome.storage.local.get([
        "sv_user",
      ])) as StorageSchema;
      const sv_user = storage.sv_user;

      if (!sv_user?.workspaceId || !sv_user?.accessToken) return;

      const res = await safeFetch(
        `https://screenvault-backend.karthik-upadhyay98.workers.dev/workspace/leave`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ workspaceId: sv_user.workspaceId }),
        },
      );

      // Force token refresh to switch back to personal workspace
      chrome.runtime.sendMessage({ type: "CONNECT_ACCOUNT" });

      // Hide modal and wait for storage change to trigger reload
      setShowLeaveConfirm(false);
    } catch (err: any) {
      console.error(err);
      alert(`Failed to leave workspace: ${err.message}`);
    } finally {
      setLeaving(false);
    }
  };

  useEffect(() => {
    console.log("Dashboard: Initializing LibraryPage");

    // Failsafe: Stop loading after 5 seconds no matter what
    const failsafe = setTimeout(() => {
      console.warn("Dashboard: Loading failsafe triggered (5s timeout)");
      setLoading(false);
    }, 5000);

    const init = async () => {
      try {
        console.log("Dashboard: Starting initial fetchData");
        await fetchData();
      } catch (err) {
        console.error("Dashboard: Initial fetch failed", err);
        setError("Failed to load workspace library. Please try again.");
      } finally {
        clearTimeout(failsafe);
        setLoading(false);
      }
    };

    init();

    let debounceTimer: any;
    const listener = (
      changes: Record<string, chrome.storage.StorageChange>,
      areaName: string,
    ) => {
      if (areaName === "local") {
        if (changes.sv_user) {
          fetchData();
          return;
        }

        if (changes.sv_sessions) {
          const oldSessions = (changes.sv_sessions.oldValue || {}) as Record<string, SessionMetadata>;
          const newSessions = (changes.sv_sessions.newValue || {}) as Record<string, SessionMetadata>;
          
          // Only refresh if a session's status has changed
          const statusChanged = Object.keys(newSessions).some(sid => {
            return oldSessions[sid]?.status !== newSessions[sid]?.status;
          });

          if (statusChanged) {
            clearTimeout(debounceTimer);
            debounceTimer = setTimeout(() => {
              console.log("Dashboard: Session status change detected, refreshing...");
              fetchData();
            }, 1000);
          }
        }
      }
    };
    chrome.storage.onChanged.addListener(listener);

    return () => {
      chrome.storage.onChanged.removeListener(listener);
      clearTimeout(failsafe);
      clearTimeout(debounceTimer);
    };
  }, [fetchData]);

  const filteredFiles = useMemo(() => {
    const query = debouncedQuery.trim().toLowerCase();
    if (!query) return files;
    return files.filter((f) =>
      (f.title || f.name || "").toLowerCase().includes(query),
    );
  }, [files, debouncedQuery]);

  useEffect(() => {
    const timeout = setTimeout(() => {
      setDebouncedQuery(searchQuery);
    }, 200);
    return () => clearTimeout(timeout);
  }, [searchQuery]);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      // Don't focus if we are already in an input
      if (
        e.key === "/" &&
        document.activeElement?.tagName !== "INPUT" &&
        document.activeElement?.tagName !== "TEXTAREA"
      ) {
        e.preventDefault();
        document.getElementById("search-input")?.focus();
      }
    };

    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, []);

  const copyLink = async (e: React.MouseEvent, video: WorkspaceVideo) => {
    e.stopPropagation();
    const url = video.playerUrl;
    if (!url) return;

    await navigator.clipboard.writeText(url);
    setCopiedId(video.id);
    setTimeout(() => setCopiedId(null), 1000);
  };

  const openVideo = async (video: WorkspaceVideo) => {
    // ARCHITECTURAL RULE: Backend playerUrl is canonical
    if (video.playerUrl) {
      console.log(
        `[SV][BACKEND_AUTHORITY] Opening canonical player link: ${video.playerUrl}`,
      );
      window.open(video.playerUrl, "_blank");
      return;
    }

    const fileId = video.fileId;
    if (!fileId) return;

    const storage = (await chrome.storage.local.get([
      "sv_sessions",
      "sv_accounts",
      "sv_user",
    ])) as StorageSchema;
    const sv_sessions = storage.sv_sessions || {};
    const accounts = storage.sv_accounts || [];
    const sv_user = storage.sv_user;

    // Only perform local Drive metadata checks if the account is actually linked locally
    // Collaborative videos should rely on backendSynced playerUrls instead
    const account = accounts.find(
      (a) =>
        a.email === video.accountEmail &&
        video.accountEmail !== "External Account",
    );

    if (account) {
      console.log(
        `[SV][LOCAL_AUTHORITY] Performing Drive check for local video: ${fileId}`,
      );
      try {
        const metadata = await getFileMetadata(fileId, account.accessToken);
        if (!metadata) {
          alert(
            "This video was not found in Google Drive and will be removed from your library.",
          );
          setFiles((prev) => prev.filter((f) => f.id !== video.id));
          if (video.backendId && sv_user?.accessToken) {
            safeFetch(
              `https://screenvault-backend.karthik-upadhyay98.workers.dev/videos/${video.backendId}`,
              { method: "DELETE" },
            ).catch((err) =>
              console.warn("Auto-clean backend sync failed:", err),
            );
          }
          return;
        }
      } catch (err) {
        console.warn("Drive check failed, proceeding anyway:", err);
      }
    } else {
      console.log(
        `[SV][COLLABORATION] Opening external video without local Drive check: ${fileId}`,
      );
    }

    const session = Object.values(sv_sessions).find(
      (s: SessionMetadata) => s.fileId === fileId,
    );
    const title =
      video?.name?.replace(".webm", "") || session?.title || "Screen Recording";
    const encodedTitle = encodeURIComponent(title);

    window.open(
      `${VIEWER_BASE_URL}/?id=${fileId}&title=${encodedTitle}`,
      "_blank",
    );
  };

  const retryUpload = (e: React.MouseEvent, sessionId: string) => {
    e.stopPropagation();
    if (retryingIds.has(sessionId)) return;
    setRetryingIds((prev) => new Set(prev).add(sessionId));
    chrome.runtime.sendMessage({ type: "RETRY_UPLOAD", sessionId });
  };

  const saveToDisk = async (e: React.MouseEvent, file: WorkspaceVideo) => {
    e.stopPropagation();
    try {
      const blob = await recoverSession(file.sessionId || file.id);
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");

      const date = new Date(file.startedAt || file.createdAt || Date.now());
      const dateStr = isFinite(date.getTime())
        ? date.toISOString().split("T")[0]
        : new Date().toISOString().split("T")[0];
      const timeStr = date
        .toTimeString()
        .split(" ")[0]
        .replace(/:/g, "-")
        .slice(0, 5);
      const title =
        file.name &&
        !["Recording...", "Processing...", "Failed Recording"].includes(
          file.name,
        )
          ? file.name.replace(".webm", "").replace(/\s+/g, "_")
          : "";

      a.href = url;
      a.download = `ScreenVault_${title ? title + "_" : ""}${dateStr}_${timeStr}.webm`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (err) {
      alert("Failed to recover recording from local storage.");
    }
  };

  const startEditing = (e: React.MouseEvent, file: WorkspaceVideo) => {
    e.stopPropagation();
    setEditingId(file.id);
    setEditingTitle(file.title);
  };

  const escapeRegex = (str: string) => {
    return str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  };

  const highlightMatch = (text: string, query: string) => {
    if (!query) return text;
    const safe = escapeRegex(query);
    const regex = new RegExp(`(${safe})`, "gi");
    const parts = text.split(regex);
    return parts.map((part, i) =>
      part.toLowerCase() === query.toLowerCase() ? (
        <mark
          key={i}
          style={{
            backgroundColor: "#fde68a",
            color: "#000",
            borderRadius: "2px",
            padding: "0 2px",
          }}
        >
          {part}
        </mark>
      ) : (
        part
      ),
    );
  };

  const handleRename = async (file: WorkspaceVideo) => {
    const newTitle = editingTitle.trim();
    if (!newTitle || newTitle === file.title) {
      setEditingId(null);
      return;
    }

    if (typeof chrome === "undefined" || !chrome.storage?.local) return;

    // 1. Optimistic UI Update
    setFiles((prev) =>
      prev.map((f) =>
        f.id === file.id
          ? { ...f, title: newTitle, name: `${newTitle}.webm` }
          : f,
      ),
    );
    setEditingId(null);

    const storage = (await chrome.storage.local.get([
      "sv_accounts",
      "sv_user",
    ])) as StorageSchema;
    const rawAccounts = storage.sv_accounts;
    const accounts: StorageAccount[] = Array.isArray(rawAccounts)
      ? rawAccounts
      : [];
    const sv_user = storage.sv_user;

    const account = accounts.find((a) => a.email === file.accountEmail);

    setIsRenaming(true);
    try {
      // 1. Sync with Backend API
      if (file.backendId && sv_user?.accessToken) {
        await fetch(
          `https://screenvault-backend.karthik-upadhyay98.workers.dev/videos/${file.backendId}`,
          {
            method: "PATCH",
            headers: {
              Authorization: `Bearer ${sv_user.accessToken}`,
              "Content-Type": "application/json",
            },
            body: JSON.stringify({ title: newTitle }),
          },
        ).catch((err) => console.warn("Backend rename sync failed:", err));
      }

      // 2. Sync with Google Drive (Async)
      if (account) {
        if (!file.fileId) throw new Error("Missing fileId for rename");
        renameFile(file.fileId, account.accessToken, `${newTitle}.webm`).catch(
          (err) => console.warn("Drive rename failed:", err),
        );
      }

      // 3. Update metadata in sv_sessions using fileId as primary key
      // We send a message to the service worker to handle this via the queue
      const metaStorage = (await chrome.storage.local.get(
        "sv_sessions",
      )) as StorageSchema;
      const sv_sessions = metaStorage.sv_sessions || {};

      const sessionEntry = Object.entries(sv_sessions).find(
        ([_, s]) => s.fileId === file.fileId,
      );

      if (sessionEntry) {
        const [sessionId] = sessionEntry;
        chrome.runtime.sendMessage({
          type: "SAVE_SESSION_METADATA",
          sessionId,
          metadata: { title: newTitle },
        });
      }
    } catch (err) {
      console.warn("Rename sync error:", err);
    } finally {
      setIsRenaming(false);
    }
  };

  const handleDelete = async (file: WorkspaceVideo) => {
    // Task 5: Prevent double delete and deleting invalid fileId
    if (deletingId === file.id || !file.id) return;

    if (
      !confirm(
        `Are you sure you want to delete "${file.title}"? This cannot be undone.`,
      )
    )
      return;

    // 1. Optimistic UI removal
    setFiles((prev) => prev.filter((f) => f.id !== file.id));
    setDeletingId(file.id);

    // 2. Async cleanup (Do NOT await sequentially to keep it fast)
    const performCleanup = async () => {
      try {
        if (typeof chrome === "undefined" || !chrome.storage?.local) return;
        const storage = (await chrome.storage.local.get([
          "sv_accounts",
          "sv_user",
        ])) as StorageSchema;
        const accounts = storage.sv_accounts || [];
        const sv_user = storage.sv_user;

        const account = accounts.find((a) => a.email === file.accountEmail);

        // Backend sync (async) - Use backendId OR file.id if it looks like a UUID
        const deleteTargetId =
          file.backendId || (file.id?.length > 20 ? file.id : null);
        if (deleteTargetId && sv_user?.accessToken) {
          safeFetch(
            `https://screenvault-backend.karthik-upadhyay98.workers.dev/videos/${deleteTargetId}`,
            {
              method: "DELETE",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ driveToken: account?.accessToken }),
            },
          )
            .then((res) => {
              if (!res.ok)
                console.warn(
                  "Backend delete sync returned error status:",
                  res.status,
                );
            })
            .catch((err) => console.warn("Backend delete sync failed:", err));
        }

        // Cleanup local metadata via Service Worker queue and directly
        if (file.fileId || file.sessionId || file.id) {
          const metaStorage = (await chrome.storage.local.get(
            "sv_sessions",
          )) as StorageSchema;
          const sv_sessions = metaStorage.sv_sessions || {};
          const sessionEntry = Object.entries(sv_sessions).find(
            ([k, s]: [string, any]) =>
              s.fileId === file.fileId || k === file.sessionId || k === file.id,
          );
          if (sessionEntry) {
            const [sessionId] = sessionEntry;
            chrome.runtime.sendMessage({
              type: "DELETE_SESSION",
              sessionId,
            });
            // Proactive local cleanup
            delete sv_sessions[sessionId];
            await chrome.storage.local.set({ sv_sessions });
          }
        }
      } catch (err: any) {
        console.warn(`Delete sync background error: ${err.message}`);
      } finally {
        setDeletingId(null);
      }
    };

    performCleanup();
  };

  if (loading)
    return (
      <div style={{
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        height: "60vh",
        color: "#A1A1AA",
        gap: "1.5rem",
      }}>
        <div style={{
          width: "40px",
          height: "40px",
          border: "3px solid rgba(255,255,255,0.1)",
          borderTopColor: "#3b82f6",
          borderRadius: "50%",
          animation: "spin 1s linear infinite",
        }} />
        <p style={{ fontWeight: 500 }}>Loading workspace library...</p>
        <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
      </div>
    );

  if (error)
    return (
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          height: "60vh",
          color: "#fff",
          textAlign: "center",
          padding: "2rem",
        }}
      >
        <div
          style={{
            background: "rgba(239, 68, 68, 0.1)",
            padding: "1.5rem",
            borderRadius: "1rem",
            border: "1px solid rgba(239, 68, 68, 0.2)",
            marginBottom: "1.5rem",
          }}
        >
          <svg
            width="32"
            height="32"
            viewBox="0 0 24 24"
            fill="none"
            stroke="#ef4444"
            strokeWidth="2"
            style={{ marginBottom: "1rem" }}
          >
            <circle cx="12" cy="12" r="10"></circle>
            <line x1="12" y1="8" x2="12" y2="12"></line>
            <line x1="12" y1="16" x2="12.01" y2="16"></line>
          </svg>
          <p
            style={{
              color: "#ef4444",
              fontWeight: 600,
              fontSize: "1.1rem",
              marginBottom: "0.5rem",
            }}
          >
            Connection Error
          </p>
          <p
            style={{ color: "#A1A1AA", fontSize: "0.9rem", maxWidth: "300px" }}
          >
            {error}
          </p>
          {error.toLowerCase().includes("session") && (
            <p
              style={{
                color: "#71717A",
                fontSize: "0.75rem",
                marginTop: "0.5rem",
              }}
            >
              Tip: Your session might have expired. Try reconnecting your
              primary account.
            </p>
          )}
        </div>
        <div style={{ display: "flex", gap: "12px" }}>
          <button
            onClick={() => fetchData()}
            style={{
              background: "#3b82f6",
              color: "#fff",
              border: "none",
              padding: "0.75rem 1.5rem",
              borderRadius: "9999px",
              fontWeight: 600,
              cursor: "pointer",
              transition: "transform 0.2s",
            }}
            onMouseEnter={(e) =>
              (e.currentTarget.style.transform = "scale(1.05)")
            }
            onMouseLeave={(e) => (e.currentTarget.style.transform = "scale(1)")}
          >
            Try Again
          </button>
          {error.toLowerCase().includes("reconnect") && (
            <button
              onClick={() =>
                chrome.runtime.sendMessage({ type: "CONNECT_ACCOUNT" })
              }
              style={{
                background: "rgba(255,255,255,0.05)",
                color: "#fff",
                border: "1px solid rgba(255,255,255,0.1)",
                padding: "0.75rem 1.5rem",
                borderRadius: "9999px",
                fontWeight: 600,
                cursor: "pointer",
              }}
            >
              Reconnect Account
            </button>
          )}
        </div>
      </div>
    );

  return (
    <div style={{ maxWidth: "1200px", margin: "0 auto" }}>
      <style>{`
        @keyframes shimmer {
          0% { background-position: -800px 0; }
          100% { background-position: 800px 0; }
        }
        .skeleton {
          background: linear-gradient(90deg, rgba(255,255,255,0.04) 25%, rgba(255,255,255,0.08) 50%, rgba(255,255,255,0.04) 75%);
          background-size: 800px 100%;
          animation: shimmer 1.4s infinite linear;
          border-radius: 8px;
        }
      `}</style>
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "flex-end",
          marginBottom: "3rem",
        }}
      >
        <div>
          <p
            style={{
              fontSize: "0.75rem",
              textTransform: "uppercase",
              letterSpacing: "0.2em",
              fontWeight: 600,
              color: "#A1A1AA",
              marginBottom: "0.5rem",
            }}
          >
            Library
          </p>
          <h1
            style={{
              fontSize: "2.5rem",
              fontWeight: 700,
              color: "#fff",
              letterSpacing: "-0.02em",
            }}
          >
            Team Workspace Library
          </h1>
          <p
            style={{
              color: "#A1A1AA",
              fontSize: "0.9rem",
              marginTop: "0.25rem",
            }}
          >
            All recordings in this workspace are shared with your team.
          </p>
        </div>
        <div style={{ display: "flex", gap: "12px", alignItems: "center" }}>
          <button
            onClick={() => {
              setShowMembersModal(true);
              fetchMembers();
            }}
            style={{
              background: "rgba(255,255,255,0.05)",
              color: "#fff",
              border: "1px solid rgba(255,255,255,0.1)",
              padding: "0.6rem 1.2rem",
              borderRadius: "9999px",
              fontWeight: 600,
              fontSize: "0.85rem",
              cursor: "pointer",
              display: "flex",
              alignItems: "center",
              gap: "8px",
              transition: "all 0.2s ease",
            }}
          >
            <svg
              width="14"
              height="14"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.5"
            >
              <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"></path>
              <circle cx="9" cy="7" r="4"></circle>
              <path d="M23 21v-2a4 4 0 0 0-3-3.87"></path>
              <path d="M16 3.13a4 4 0 0 1 0 7.75"></path>
            </svg>
            Members
          </button>
          <button
            onClick={handleInvite}
            disabled={inviting}
            style={{
              background: inviteUrl ? "#10B981" : "rgba(255,255,255,0.05)",
              color: "#fff",
              border: "1px solid rgba(255,255,255,0.1)",
              padding: "0.6rem 1.2rem",
              borderRadius: "9999px",
              fontWeight: 600,
              fontSize: "0.85rem",
              cursor: inviting ? "not-allowed" : "pointer",
              display: "flex",
              alignItems: "center",
              gap: "8px",
              transition: "all 0.2s ease",
              opacity: inviting ? 0.6 : 1,
            }}
          >
            {inviteUrl ? (
              <>
                <svg
                  width="14"
                  height="14"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="3"
                >
                  <path d="M20 6L9 17l-5-5"></path>
                </svg>
                Copied Invite Link!
              </>
            ) : (
              <>
                <svg
                  width="14"
                  height="14"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2.5"
                >
                  <path d="M16 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"></path>
                  <circle cx="8.5" cy="7" r="4"></circle>
                  <line x1="20" y1="8" x2="20" y2="14"></line>
                  <line x1="17" y1="11" x2="23" y2="11"></line>
                </svg>
                {inviting ? "Generating..." : "Invite Team Member"}
              </>
            )}
          </button>
          {user?.workspaceRole === "member" && (
            <button
              title="Exit this shared workspace. You will lose access to team videos."
              onClick={() => setShowLeaveConfirm(true)}
              style={{
                background: "transparent",
                color: "#ef4444",
                border: "1px solid rgba(239, 68, 68, 0.3)",
                padding: "0.6rem 1.2rem",
                borderRadius: "9999px",
                fontWeight: 600,
                fontSize: "0.85rem",
                cursor: "pointer",
                transition: "all 0.2s ease",
              }}
              onMouseEnter={(e) =>
                (e.currentTarget.style.background = "rgba(239, 68, 68, 0.1)")
              }
              onMouseLeave={(e) =>
                (e.currentTarget.style.background = "transparent")
              }
            >
              Leave Workspace
            </button>
          )}
        </div>
      </div>

      {showMembersModal && (
        <div
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(0,0,0,0.8)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            zIndex: 60,
          }}
        >
          <div
            style={{
              background: "#18181b",
              padding: "2rem",
              borderRadius: "1.5rem",
              maxWidth: "500px",
              width: "90%",
              border: "1px solid rgba(255,255,255,0.1)",
              position: "relative",
            }}
          >
            <button
              onClick={() => setShowMembersModal(false)}
              style={{
                position: "absolute",
                top: "1.5rem",
                right: "1.5rem",
                background: "none",
                border: "none",
                color: "#71717A",
                cursor: "pointer",
              }}
            >
              <svg
                width="20"
                height="20"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2.5"
              >
                <path d="M18 6L6 18M6 6l12 12"></path>
              </svg>
            </button>

            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "flex-start",
                marginBottom: "2rem",
              }}
            >
              <div>
                <h3
                  style={{ fontSize: "1.5rem", fontWeight: 700, color: "#fff" }}
                >
                  Workspace Settings
                </h3>
                <p
                  style={{
                    color: "#71717A",
                    fontSize: "0.9rem",
                    marginTop: "4px",
                  }}
                >
                  Manage your team and invites
                </p>
              </div>
              <div style={{ textAlign: "right" }}>
                <button
                  onClick={handleInvite}
                  disabled={inviting}
                  style={{
                    background: "#3b82f6",
                    color: "#fff",
                    border: "none",
                    padding: "0.75rem 1.5rem",
                    borderRadius: "9999px",
                    fontWeight: 600,
                    cursor: inviting ? "not-allowed" : "pointer",
                    boxShadow: "0 4px 14px 0 rgba(59, 130, 246, 0.39)",
                    transition: "all 0.2s",
                  }}
                >
                  {inviting ? "Generating..." : "Generate New Invite"}
                </button>
                <div
                  style={{
                    fontSize: "0.7rem",
                    color: "#71717A",
                    marginTop: "6px",
                  }}
                >
                  Creates a new secure invite link
                </div>
              </div>
            </div>

            {loadingMembers ? (
              <div
                style={{
                  padding: "2rem",
                  textAlign: "center",
                  color: "#A1A1AA",
                }}
              >
                Loading members...
              </div>
            ) : (
              <div
                style={{
                  display: "flex",
                  flexDirection: "column",
                  gap: "0.75rem",
                  maxHeight: "50vh",
                  overflowY: "auto",
                  paddingRight: "4px",
                }}
              >
                {members.map((member) => (
                  <div
                    key={member.userId}
                    style={{
                      display: "flex",
                      justifyContent: "space-between",
                      alignItems: "center",
                      padding: "0.75rem 1rem",
                      background: "rgba(255,255,255,0.03)",
                      borderRadius: "1rem",
                      border: "1px solid rgba(255,255,255,0.05)",
                      gap: "0.75rem",
                    }}
                  >
                    <div style={{ display: "flex", alignItems: "center", gap: "0.75rem", minWidth: 0 }}>
                      <div style={{
                        width: "36px",
                        height: "36px",
                        borderRadius: "50%",
                        background: "rgba(59,130,246,0.15)",
                        border: "1px solid rgba(59,130,246,0.3)",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        fontSize: "0.85rem",
                        fontWeight: 700,
                        color: "#3b82f6",
                        flexShrink: 0,
                      }}>
                        {(member.email || "?").charAt(0).toUpperCase()}
                      </div>
                      <div style={{ minWidth: 0 }}>
                        <div style={{
                          color: "#fff",
                          fontWeight: 500,
                          fontSize: "0.875rem",
                          wordBreak: "break-all",
                        }}>
                          {member.email}
                        </div>
                        <div style={{ display: "flex", flexWrap: "wrap", gap: "4px", marginTop: "3px" }}>
                        {member.userId === user?.userId && (
                          <span style={{
                            fontSize: "0.65rem", color: "#3b82f6",
                            background: "rgba(59,130,246,0.1)",
                            padding: "1px 6px", borderRadius: "4px", whiteSpace: "nowrap",
                          }}>You</span>
                        )}
                        {member.role === "owner" && (
                          <span style={{
                            fontSize: "0.65rem", color: "#f59e0b",
                            background: "rgba(245,158,11,0.1)",
                            padding: "1px 6px", borderRadius: "4px", whiteSpace: "nowrap",
                          }}>Owner</span>
                        )}
                        </div>
                      </div>
                    </div>
                    {user?.workspaceRole === "owner" &&
                      member.userId !== user?.userId && (
                        <button
                          onClick={() => handleRemoveMember(member.userId)}
                          style={{
                            color: "#ef4444",
                            background: "none",
                            border: "none",
                            fontWeight: 600,
                            cursor: "pointer",
                            fontSize: "0.85rem",
                          }}
                        >
                          Remove
                        </button>
                      )}
                  </div>
                ))}
              </div>
            )}

            {/* Invites Section */}
            <div style={{ marginTop: "2.5rem" }}>
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "baseline",
                }}
              >
                <h4
                  style={{
                    fontSize: "0.9rem",
                    fontWeight: 600,
                    color: "#A1A1AA",
                    marginBottom: "1rem",
                    textTransform: "uppercase",
                    letterSpacing: "0.05em",
                  }}
                >
                  Active Invites
                </h4>
                <div style={{ fontSize: "0.75rem", color: "#71717A" }}>
                  {
                    invites.filter(
                      (i) => !i.revokedAt && i.expiresAt > Date.now(),
                    ).length
                  }{" "}
                  / 10 active
                </div>
              </div>

              {loadingInvites ? (
                <div
                  style={{
                    padding: "1rem",
                    textAlign: "center",
                    color: "#71717A",
                    fontSize: "0.85rem",
                  }}
                >
                  Loading invites...
                </div>
              ) : invites.length === 0 ? (
                <div
                  style={{
                    padding: "1.5rem",
                    textAlign: "center",
                    background: "rgba(255,255,255,0.02)",
                    borderRadius: "1rem",
                    color: "#71717A",
                    fontSize: "0.85rem",
                    border: "1px dashed rgba(255,255,255,0.1)",
                  }}
                >
                  No active invites
                </div>
              ) : (
                <div
                  style={{
                    display: "flex",
                    flexDirection: "column",
                    gap: "0.75rem",
                  }}
                >
                  {invites.map((inv) => {
                    const isExpired =
                      inv.expiresAt && inv.expiresAt < Date.now();
                    const isRevoked = !!inv.revokedAt;
                    const isActive = !isExpired && !isRevoked;

                    return (
                      <div
                        key={inv.id}
                        style={{
                          padding: "1rem",
                          background: "rgba(255,255,255,0.03)",
                          borderRadius: "1rem",
                          border: "1px solid rgba(255,255,255,0.05)",
                          display: "flex",
                          justifyContent: "space-between",
                          alignItems: "center",
                          opacity: isActive ? 1 : 0.6,
                        }}
                      >
                        <div>
                          <div
                            style={{
                              display: "flex",
                              alignItems: "center",
                              gap: "8px",
                            }}
                          >
                            <code
                              style={{
                                background: "rgba(0,0,0,0.3)",
                                padding: "2px 6px",
                                borderRadius: "4px",
                                fontSize: "0.75rem",
                                color: "#3b82f6",
                              }}
                            >
                              {inv.token.slice(0, 8)}...
                            </code>
                            <span
                              style={{
                                fontSize: "0.65rem",
                                padding: "2px 6px",
                                borderRadius: "4px",
                                background: isRevoked
                                  ? "rgba(239,68,68,0.1)"
                                  : isExpired
                                    ? "rgba(245,158,11,0.1)"
                                    : "rgba(16,185,129,0.1)",
                                color: isRevoked
                                  ? "#ef4444"
                                  : isExpired
                                    ? "#f59e0b"
                                    : "#10b981",
                              }}
                            >
                              {isRevoked
                                ? "Revoked"
                                : isExpired
                                  ? "Expired"
                                  : "Active"}
                            </span>
                          </div>
                          <div
                            style={{
                              fontSize: "0.7rem",
                              color: "#71717A",
                              marginTop: "4px",
                            }}
                          >
                            {inv.role} • Expires{" "}
                            {new Date(inv.expiresAt).toLocaleDateString()}
                          </div>
                        </div>

                        {isActive && user?.workspaceRole === "owner" && (
                          <button
                            onClick={() => handleRevokeInvite(inv.id)}
                            style={{
                              background: "none",
                              border: "none",
                              color: "#71717A",
                              cursor: "pointer",
                              fontSize: "0.8rem",
                            }}
                            onMouseEnter={(e) =>
                              (e.currentTarget.style.color = "#ef4444")
                            }
                            onMouseLeave={(e) =>
                              (e.currentTarget.style.color = "#71717A")
                            }
                          >
                            Revoke
                          </button>
                        )}

                        {isActive && (
                          <button
                            onClick={async () => {
                              const fullUrl = `${VIEWER_BASE_URL}/#/invite/${inv.token}`;
                              await navigator.clipboard.writeText(fullUrl);

                              // Telemetry
                              safeFetch(
                                `https://screenvault-backend.karthik-upadhyay98.workers.dev/workspace/invite/log-copy`,
                                {
                                  method: "POST",
                                  headers: {
                                    "Content-Type": "application/json",
                                  },
                                  body: JSON.stringify({
                                    inviteId: inv.id,
                                    token: inv.token,
                                  }),
                                },
                              ).catch(() => {});

                              alert("Invite link copied!");
                            }}
                            style={{
                              background: "rgba(59,130,246,0.1)",
                              border: "none",
                              color: "#3b82f6",
                              cursor: "pointer",
                              fontSize: "0.8rem",
                              padding: "4px 10px",
                              borderRadius: "6px",
                              marginLeft: "8px",
                            }}
                          >
                            Copy
                          </button>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            <div
              style={{
                marginTop: "2rem",
                display: "flex",
                justifyContent: "flex-end",
              }}
            >
              <button
                onClick={() => setShowMembersModal(false)}
                style={{
                  background: "#3b82f6",
                  color: "#fff",
                  border: "none",
                  padding: "0.75rem 1.5rem",
                  borderRadius: "9999px",
                  fontWeight: 600,
                  cursor: "pointer",
                }}
              >
                Done
              </button>
            </div>
          </div>
        </div>
      )}

      {showLeaveConfirm && (
        <div
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(0,0,0,0.8)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            zIndex: 50,
          }}
        >
          <div
            style={{
              background: "#18181b",
              padding: "2rem",
              borderRadius: "12px",
              maxWidth: "400px",
              width: "90%",
              border: "1px solid rgba(255,255,255,0.1)",
            }}
          >
            <h3
              style={{
                color: "#fff",
                fontSize: "1.25rem",
                marginBottom: "1rem",
              }}
            >
              Leave this workspace?
            </h3>
            <ul
              style={{
                color: "#A1A1AA",
                marginBottom: "2rem",
                paddingLeft: "1.2rem",
                lineHeight: 1.6,
              }}
            >
              <li>You will lose access to shared videos.</li>
              <li>You will need a new invite to rejoin.</li>
              <li>Your previously recorded videos remain in the workspace.</li>
            </ul>
            <div
              style={{
                display: "flex",
                gap: "12px",
                justifyContent: "flex-end",
              }}
            >
              <button
                onClick={() => setShowLeaveConfirm(false)}
                disabled={leaving}
                style={{
                  padding: "0.5rem 1rem",
                  background: "transparent",
                  color: "#fff",
                  border: "1px solid rgba(255,255,255,0.2)",
                  borderRadius: "6px",
                  cursor: leaving ? "not-allowed" : "pointer",
                }}
              >
                Cancel
              </button>
              <button
                onClick={handleLeaveWorkspace}
                disabled={leaving}
                style={{
                  padding: "0.5rem 1rem",
                  background: "#ef4444",
                  color: "#fff",
                  border: "none",
                  borderRadius: "6px",
                  cursor: leaving ? "not-allowed" : "pointer",
                }}
              >
                {leaving ? "Leaving..." : "Leave"}
              </button>
            </div>
          </div>
        </div>
      )}

      {!files.length ? (
        <div
          style={{ color: "#A1A1AA", textAlign: "center", padding: "4rem 0" }}
        >
          <p style={{ marginBottom: "1rem" }}>
            No recordings yet in this workspace.
          </p>
          <p style={{ fontSize: "0.9rem" }}>
            Your team's recordings will appear here. Start a recording to sync
            it to the workspace.
          </p>
        </div>
      ) : (
        <>
          <div style={{ position: "relative", marginBottom: "2rem" }}>
            <input
              id="search-input"
              autoFocus
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Escape") setSearchQuery("");
              }}
              placeholder="Search recordings... (Press /)"
              style={{
                width: "100%",
                background: "rgba(255,255,255,0.03)",
                border: "1px solid rgba(255,255,255,0.08)",
                borderRadius: "1rem",
                padding: "0.8rem 1.2rem",
                paddingLeft: "2.8rem",
                color: "#fff",
                fontSize: "1rem",
                outline: "none",
                transition: "all 0.2s ease",
              }}
              onFocus={(e) => {
                e.currentTarget.style.borderColor = "rgba(255,255,255,0.2)";
                e.currentTarget.style.background = "rgba(255,255,255,0.05)";
              }}
              onBlur={(e) => {
                e.currentTarget.style.borderColor = "rgba(255,255,255,0.08)";
                e.currentTarget.style.background = "rgba(255,255,255,0.03)";
              }}
            />
            <svg
              width="18"
              height="18"
              viewBox="0 0 24 24"
              fill="none"
              stroke="rgba(255,255,255,0.3)"
              strokeWidth="2"
              style={{
                position: "absolute",
                left: "1rem",
                top: "50%",
                transform: "translateY(-50%)",
              }}
            >
              <circle cx="11" cy="11" r="8"></circle>
              <path d="M21 21l-4.35-4.35"></path>
            </svg>
            {searchQuery && (
              <button
                onClick={() => setSearchQuery("")}
                style={{
                  position: "absolute",
                  right: "1rem",
                  top: "50%",
                  transform: "translateY(-50%)",
                  background: "transparent",
                  border: "none",
                  color: "rgba(255,255,255,0.3)",
                  cursor: "pointer",
                  fontSize: "1.2rem",
                  padding: "0 4px",
                }}
              >
                ✕
              </button>
            )}
          </div>

          {!filteredFiles.length ? (
            <div
              style={{
                textAlign: "center",
                padding: "4rem 0",
                color: "#A1A1AA",
              }}
            >
              <div
                style={{
                  fontSize: "1.25rem",
                  fontWeight: 600,
                  color: "#fff",
                  marginBottom: "0.5rem",
                }}
              >
                No results found
              </div>
              <div>
                We couldn't find any recordings matching "{searchQuery}"
              </div>
            </div>
          ) : (
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(auto-fill, minmax(300px, 1fr))",
                gap: "1.5rem",
              }}
            >
              {filteredFiles.map((file) => (
                <div
                  key={file.id}
                  className="video-card"
                  style={{
                    background: "rgba(255, 255, 255, 0.03)",
                    border: "1px solid rgba(255, 255, 255, 0.08)",
                    borderRadius: "16px",
                    overflow: "hidden",
                    display: "flex",
                    flexDirection: "column",
                    transition: "all 0.2s ease",
                    position: "relative",
                  }}
                  onMouseLeave={() => setMenuOpenId(null)}
                >
                  {/* Actions Menu */}
                  <div
                    className="menu-container"
                    style={{
                      position: "absolute",
                      top: "12px",
                      right: "12px",
                      zIndex: 10,
                    }}
                  >
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        setMenuOpenId(menuOpenId === file.id ? null : file.id);
                      }}
                      className="menu-trigger"
                      style={{
                        background: "rgba(0,0,0,0.4)",
                        border: "none",
                        color: "#fff",
                        width: "32px",
                        height: "32px",
                        borderRadius: "8px",
                        cursor: "pointer",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        fontSize: "18px",
                        transition: "all 0.2s",
                        backdropFilter: "blur(4px)",
                      }}
                    >
                      ⋯
                    </button>

                    {menuOpenId === file.id && (
                      <div
                        style={{
                          position: "absolute",
                          top: "40px",
                          right: "0",
                          background: "#18181B",
                          border: "1px solid rgba(255,255,255,0.1)",
                          borderRadius: "12px",
                          boxShadow: "0 10px 15px -3px rgba(0,0,0,0.5)",
                          padding: "6px",
                          minWidth: "140px",
                          zIndex: 100,
                        }}
                      >
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            if (file.playerUrl) {
                              navigator.clipboard.writeText(file.playerUrl);
                              setCopiedId(file.id);
                              setTimeout(() => setCopiedId(null), 1000);
                              setMenuOpenId(null);
                            }
                          }}
                          style={{
                            display: "flex",
                            alignItems: "center",
                            gap: "10px",
                            width: "100%",
                            padding: "8px 12px",
                            background: "transparent",
                            border: "none",
                            color: "#fff",
                            fontSize: "0.875rem",
                            cursor: "pointer",
                            borderRadius: "8px",
                            textAlign: "left",
                            transition: "background 0.2s",
                          }}
                          onMouseEnter={(e) =>
                            (e.currentTarget.style.background =
                              "rgba(255,255,255,0.05)")
                          }
                          onMouseLeave={(e) =>
                            (e.currentTarget.style.background = "transparent")
                          }
                        >
                          <svg
                            width="14"
                            height="14"
                            viewBox="0 0 24 24"
                            fill="none"
                            stroke="currentColor"
                            strokeWidth="2"
                          >
                            <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"></path>
                            <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"></path>
                          </svg>
                          {copiedId === file.id ? "Copied!" : "Copy Link"}
                        </button>

                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            startEditing(e, file);
                            setMenuOpenId(null);
                          }}
                          style={{
                            display: "flex",
                            alignItems: "center",
                            gap: "10px",
                            width: "100%",
                            padding: "8px 12px",
                            background: "transparent",
                            border: "none",
                            color: "#fff",
                            fontSize: "0.875rem",
                            cursor: "pointer",
                            borderRadius: "8px",
                            textAlign: "left",
                            transition: "background 0.2s",
                          }}
                          onMouseEnter={(e) =>
                            (e.currentTarget.style.background =
                              "rgba(255,255,255,0.05)")
                          }
                          onMouseLeave={(e) =>
                            (e.currentTarget.style.background = "transparent")
                          }
                        >
                          <svg
                            width="14"
                            height="14"
                            viewBox="0 0 24 24"
                            fill="none"
                            stroke="currentColor"
                            strokeWidth="2"
                          >
                            <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path>
                            <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path>
                          </svg>
                          Rename
                        </button>

                        <div
                          style={{
                            height: "1px",
                            background: "rgba(255,255,255,0.05)",
                            margin: "4px 0",
                          }}
                        />

                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            handleDelete(file);
                            setMenuOpenId(null);
                          }}
                          style={{
                            display: "flex",
                            alignItems: "center",
                            gap: "10px",
                            width: "100%",
                            padding: "8px 12px",
                            background: "transparent",
                            border: "none",
                            color: "#EF4444",
                            fontSize: "0.875rem",
                            cursor: "pointer",
                            borderRadius: "8px",
                            textAlign: "left",
                            transition: "background 0.2s",
                          }}
                          onMouseEnter={(e) =>
                            (e.currentTarget.style.background =
                              "rgba(239,68,68,0.1)")
                          }
                          onMouseLeave={(e) =>
                            (e.currentTarget.style.background = "transparent")
                          }
                        >
                          Delete
                        </button>
                      </div>
                    )}
                  </div>

                  <div
                    style={{
                      position: "relative",
                      borderRadius: "12px",
                      background: "rgba(255,255,255,0.03)",
                      boxShadow: "0 4px 20px rgba(0,0,0,0.2)",
                      transition:
                        "transform 0.2s cubic-bezier(0.4, 0, 0.2, 1), box-shadow 0.2s ease",
                      cursor: "pointer",
                    }}
                    onMouseEnter={() => setHoveredId(file.id)}
                    onMouseLeave={() => setHoveredId(null)}
                    onClick={() => openVideo(file)}
                  >
                    <div
                      style={{
                        aspectRatio: "16/9",
                        background: "#050505",
                        overflow: "hidden",
                        borderBottom: "1px solid rgba(255,255,255,0.04)",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        position: "relative",
                      }}
                    >
                      {file.thumbnailLink ? (
                        <img
                          src={file.thumbnailLink}
                          alt={file.title}
                          style={{
                            width: "100%",
                            height: "100%",
                            objectFit: "cover",
                            opacity: hoveredId === file.id ? 0.8 : 1,
                            transition: "opacity 0.2s",
                          }}
                        />
                      ) : (
                        <div
                          style={{
                            width: "100%",
                            height: "100%",
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "center",
                            background:
                              "linear-gradient(45deg, #18181B, #09090B)",
                          }}
                        >
                          <svg
                            width="40"
                            height="40"
                            viewBox="0 0 24 24"
                            fill="none"
                            stroke="rgba(255,255,255,0.1)"
                            strokeWidth="1"
                          >
                            <rect
                              x="2"
                              y="3"
                              width="20"
                              height="14"
                              rx="2"
                              ry="2"
                            ></rect>
                            <path d="M8 21h8"></path>
                            <path d="M12 17v4"></path>
                          </svg>
                        </div>
                      )}

                      {/* Play Button Overlay */}
                      <div
                        style={{
                          position: "absolute",
                          inset: 0,
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "center",
                          background:
                            hoveredId === file.id
                              ? "rgba(0,0,0,0.2)"
                              : "transparent",
                          transition: "background 0.2s ease",
                        }}
                      >
                        <div
                          style={{
                            width: "48px",
                            height: "48px",
                            borderRadius: "50%",
                            background: "rgba(255,255,255,0.1)",
                            backdropFilter: "blur(8px)",
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "center",
                            opacity: hoveredId === file.id ? 1 : 0,
                            transform:
                              hoveredId === file.id ? "scale(1)" : "scale(0.8)",
                            transition:
                              "all 0.2s cubic-bezier(0.175, 0.885, 0.32, 1.275)",
                          }}
                        >
                          <svg
                            width="20"
                            height="20"
                            viewBox="0 0 24 24"
                            fill="white"
                          >
                            <path d="M8 5v14l11-7z" />
                          </svg>
                        </div>
                      </div>
                    </div>
                  </div>

                  <div
                    style={{
                      padding: "1.25rem",
                      display: "flex",
                      flexDirection: "column",
                      gap: "0.75rem",
                    }}
                  >
                    <div style={{ minWidth: 0, flex: 1 }}>
                      {editingId === file.id ? (
                        <input
                          autoFocus
                          value={editingTitle}
                          onChange={(e) => setEditingTitle(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === "Enter") handleRename(file);
                            if (e.key === "Escape") setEditingId(null);
                          }}
                          onClick={(e) => e.stopPropagation()}
                          style={{
                            background: "rgba(255,255,255,0.05)",
                            border: "1px solid rgba(255,255,255,0.1)",
                            borderRadius: "8px",
                            padding: "4px 8px",
                            color: "#fff",
                            width: "100%",
                            fontSize: "0.9rem",
                            outline: "none",
                          }}
                        />
                      ) : (
                        <div
                          style={{
                            display: "flex",
                            alignItems: "center",
                            gap: "8px",
                          }}
                        >
                          <div
                            style={{
                              fontWeight: 600,
                              fontSize: "1rem",
                              color: "#fff",
                              whiteSpace: "nowrap",
                              overflow: "hidden",
                              textOverflow: "ellipsis",
                            }}
                          >
                            {highlightMatch(file.title || "", searchQuery)}
                          </div>
                        </div>
                      )}
                    </div>

                    {/* Refactored Creator Rendering (Backend Authoritative) */}
                    <div
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: "8px",
                      }}
                    >
                      <div
                        style={{
                          width: "24px",
                          height: "24px",
                          borderRadius: "50%",
                          background: getDeterministicColor(
                            file.accountEmail || "",
                          ),
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "center",
                          fontSize: "10px",
                          fontWeight: "bold",
                          color: "#fff",
                          flexShrink: 0,
                          border: "1px solid rgba(255,255,255,0.1)",
                        }}
                      >
                        {(file.accountEmail || "S").charAt(0).toUpperCase()}
                      </div>
                      <div
                        style={{
                          fontSize: "0.75rem",
                          color: "#A1A1AA",
                          whiteSpace: "nowrap",
                          overflow: "hidden",
                          textOverflow: "ellipsis",
                        }}
                      >
                        {file.accountEmail === user?.email
                          ? "You"
                          : file.accountEmail || "External Creator"}
                      </div>
                    </div>

                    <div
                      style={{
                        fontSize: "0.8125rem",
                        color: "#52525B",
                        display: "flex",
                        alignItems: "center",
                        gap: "4px",
                      }}
                    >
                      <svg
                        width="12"
                        height="12"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2"
                      >
                        <rect
                          x="3"
                          y="4"
                          width="18"
                          height="18"
                          rx="2"
                          ry="2"
                        ></rect>
                        <line x1="16" y1="2" x2="16" y2="6"></line>
                        <line x1="8" y1="2" x2="8" y2="6"></line>
                        <line x1="3" y1="10" x2="21" y2="10"></line>
                      </svg>
                      {new Date(
                        file.createdTime || Date.now(),
                      ).toLocaleDateString(undefined, {
                        month: "short",
                        day: "numeric",
                        year: "numeric",
                      })}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}

          {loadingMore && (
            <div style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fill, minmax(300px, 1fr))",
              gap: "1.5rem",
              width: "100%",
              marginTop: "1.5rem",
            }}>
              {Array.from({ length: 3 }).map((_, i) => (
                <div key={i} style={{
                  background: "rgba(255,255,255,0.03)",
                  border: "1px solid rgba(255,255,255,0.08)",
                  borderRadius: "16px",
                  overflow: "hidden",
                }}>
                  <div className="skeleton" style={{ height: "160px", borderRadius: 0 }} />
                  <div style={{ padding: "1rem", display: "flex", flexDirection: "column", gap: "0.6rem" }}>
                    <div className="skeleton" style={{ height: "14px", width: "70%" }} />
                    <div className="skeleton" style={{ height: "12px", width: "45%" }} />
                  </div>
                </div>
              ))}
            </div>
          )}

          {hasMore && (
            <div
              ref={observerTarget}
              style={{ height: "40px", marginTop: "1rem" }}
            />
          )}
          <div
            style={{
              marginTop: "6rem",
              padding: "3rem",
              background: "#0A0A0F",
              borderRadius: "2rem",
              border: "1px solid rgba(255,255,255,0.05)",
            }}
          >
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(auto-fill, minmax(300px, 1fr))",
                gap: "1rem",
              }}
            >
              {storageAccounts.map((account) => (
                <div
                  key={account.id}
                  style={{
                    padding: "1.25rem",
                    background: "rgba(255,255,255,0.03)",
                    borderRadius: "1.25rem",
                    border: "1px solid rgba(255,255,255,0.05)",
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                  }}
                >
                  <div>
                    <div
                      style={{
                        color: "#fff",
                        fontWeight: 500,
                        fontSize: "0.9rem",
                        display: "flex",
                        alignItems: "center",
                        gap: "8px",
                      }}
                    >
                      <span style={{ minWidth: 0, wordBreak: "break-all" }}>{account.email}</span>
                      <div style={{ display: "flex", flexWrap: "wrap", gap: "4px", marginTop: "4px" }}>
                      {account.email === user?.email && (
                        <span
                          style={{
                            fontSize: "0.65rem",
                            color: "#3b82f6",
                            border: "1px solid rgba(59,130,246,0.3)",
                            padding: "2px 6px",
                            borderRadius: "4px",
                            textTransform: "uppercase",
                            fontWeight: 700,
                            whiteSpace: "nowrap",
                          }}
                        >
                          Primary
                        </span>
                      )}
                      {account.email === files[0]?.accountEmail && (
                        <span
                          style={{
                            fontSize: "0.65rem",
                            color: "#10b981",
                            border: "1px solid rgba(16,185,129,0.3)",
                            padding: "2px 6px",
                            borderRadius: "4px",
                            textTransform: "uppercase",
                            fontWeight: 700,
                            whiteSpace: "nowrap",
                          }}
                        >
                          Active
                        </span>
                      )}
                      </div>
                    </div>
                    <div
                      style={{
                        fontSize: "0.75rem",
                        color: "#71717A",
                        marginTop: "0.25rem",
                      }}
                    >
                      {(account.quotaTotal - account.quotaUsed) /
                        (1024 * 1024 * 1024) >
                      0
                        ? (
                            (account.quotaTotal - account.quotaUsed) /
                            (1024 * 1024 * 1024)
                          ).toFixed(1)
                        : "0"}{" "}
                      GB free
                    </div>
                  </div>
                  <div
                    style={{
                      width: "8px",
                      height: "8px",
                      borderRadius: "50%",
                      background: "#10b981",
                    }}
                  ></div>
                </div>
              ))}
            </div>
            <p
              style={{
                marginTop: "1.5rem",
                fontSize: "0.8rem",
                color: "#71717A",
                fontStyle: "italic",
              }}
            >
              * These are your personal Google Drive accounts. Videos recorded
              with these accounts are shared with the team workspace.
            </p>
          </div>
        </>
      )}
    </div>
  );
}
