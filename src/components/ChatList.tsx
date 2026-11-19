import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import api, { getErrorMessage, isCanceled } from "../api";
import { socket } from "../socket";
import Avatar, { avatarUrl } from "./Avatar";
import { formatListTime } from "../utils/time";
import type { ChatMessage, ListUser, Relation } from "../types";

/* ───────────────────────── small presentational pieces ───────────────────────── */

const Skeleton = () => (
  <div className="p-3 space-y-1">
    {[1, 2, 3, 4, 5].map((i) => (
      <div key={i} className="flex items-center gap-3 p-3 rounded-xl animate-pulse">
        <div className="w-11 h-11 rounded-full bg-gray-200 dark:bg-gray-700 flex-shrink-0" />
        <div className="flex-1 space-y-2">
          <div className="h-3 bg-gray-200 dark:bg-gray-700 rounded w-2/3" />
          <div className="h-2.5 bg-gray-100 dark:bg-gray-800 rounded w-1/2" />
        </div>
      </div>
    ))}
  </div>
);

const EmptyState = ({ title, hint, action }: { title: string; hint?: string; action?: ReactNode }) => (
  <div className="flex flex-col items-center justify-center py-14 px-6 text-center">
    <div className="w-14 h-14 rounded-full bg-gray-100 dark:bg-gray-800 flex items-center justify-center mb-3">
      <svg className="w-7 h-7 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
          d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z" />
      </svg>
    </div>
    <p className="text-sm font-medium text-gray-700 dark:text-gray-200">{title}</p>
    {hint && <p className="text-xs text-gray-400 dark:text-gray-500 mt-1 max-w-[220px]">{hint}</p>}
    {action}
  </div>
);

const SectionLabel = ({ children, count }: { children: ReactNode; count?: number }) => (
  <div className="px-4 pt-3 pb-1 text-[11px] font-semibold uppercase tracking-wider text-gray-400 dark:text-gray-500 flex items-center gap-2">
    {children}
    {count !== undefined && (
      <span className="px-1.5 py-0.5 rounded-full bg-gray-100 dark:bg-gray-800 text-gray-500 dark:text-gray-400 normal-case tracking-normal">
        {count}
      </span>
    )}
  </div>
);

const btn = "text-xs font-medium px-3 py-1.5 rounded-full transition-colors disabled:opacity-50 disabled:cursor-not-allowed";

interface PersonActionsProps {
  user: ListUser;
  busy: boolean;
  onConnect: (u: ListUser) => void;
  onAccept: (u: ListUser) => void;
  onReject: (u: ListUser) => void;
  onCancel: (u: ListUser) => void;
  onBlock: (u: ListUser) => void;
}

/** Right-hand action area of a "person" row, depending on the relationship. */
const PersonActions = ({ user, busy, onConnect, onAccept, onReject, onCancel, onBlock }: PersonActionsProps) => {
  switch (user.status) {
    case "connected":
      return (
        <span className="flex items-center gap-1 text-xs font-medium text-emerald-600 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-900/30 px-2.5 py-1 rounded-full">
          <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 20 20">
            <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
          </svg>
          Connected
        </span>
      );
    case "sent":
      return (
        <button
          disabled={busy}
          onClick={() => onCancel(user)}
          title="Cancel request"
          className={`${btn} bg-gray-100 dark:bg-gray-700/60 text-gray-600 dark:text-gray-300 hover:bg-red-50 hover:text-red-600 dark:hover:bg-red-900/30 dark:hover:text-red-400`}
        >
          Requested ✕
        </button>
      );
    case "received":
      return (
        <div className="flex flex-wrap justify-end gap-1">
          <button disabled={busy} onClick={() => onAccept(user)} className={`${btn} bg-emerald-600 hover:bg-emerald-700 text-white`}>
            Accept
          </button>
          <button disabled={busy} onClick={() => onReject(user)} className={`${btn} bg-red-100 hover:bg-red-200 dark:bg-red-900/40 dark:hover:bg-red-800/60 text-red-600 dark:text-red-400`}>
            Reject
          </button>
          <button
            disabled={busy}
            onClick={() => onBlock(user)}
            title="Block this user"
            className={`${btn} bg-gray-100 hover:bg-gray-200 dark:bg-gray-700 dark:hover:bg-gray-600 text-gray-600 dark:text-gray-300`}
          >
            Block
          </button>
        </div>
      );
    default:
      return (
        <button disabled={busy} onClick={() => onConnect(user)} className={`${btn} bg-emerald-600 hover:bg-emerald-700 active:bg-emerald-800 text-white`}>
          {busy ? "..." : "Connect"}
        </button>
      );
  }
};

const rowBase = "flex items-center gap-3 px-3 py-3 mx-1 rounded-xl transition-colors duration-100";
const rowClickable = "cursor-pointer hover:bg-gray-100 dark:hover:bg-gray-800 active:bg-gray-200 dark:active:bg-gray-700";

interface Results {
  key: string | null;
  items: ListUser[];
  error: boolean;
}

interface Requests {
  received: ListUser[];
  sent: ListUser[];
}

interface Props {
  activeUserId?: string;
  onSelectUser: (user: ListUser) => void;
  /** total number of unread messages — used for the "(3) WhatsApp Clone" tab title */
  onUnreadChange?: (total: number) => void;
}

/* ───────────────────────────────── component ───────────────────────────────── */

/**
 * Left column of the app.
 *  - default page  → only my CONNECTED accounts (with last message + unread badge)
 *  - typing        → live search across everyone (connected people first)
 *  - "Show non-connected users" button → everyone I'm not connected with yet
 */
const ChatList = ({ activeUserId, onSelectUser, onUnreadChange }: Props) => {
  const [search, setSearch] = useState("");
  const [discover, setDiscover] = useState(false);

  const [connections, setConnections] = useState<ListUser[] | null>(null); // null = still loading
  const [requests, setRequests] = useState<Requests>({ received: [], sent: [] });
  const [results, setResults] = useState<Results>({ key: null, items: [], error: false });
  const [refreshTick, setRefreshTick] = useState(0);

  const [busyId, setBusyId] = useState<string | null>(null);
  const [notice, setNotice] = useState("");

  // desktop notifications
  const [notifPermission, setNotifPermission] = useState<NotificationPermission | "unsupported">(() =>
    typeof Notification === "undefined" ? "unsupported" : Notification.permission
  );
  const [notifDismissed, setNotifDismissed] = useState(() => localStorage.getItem("notif_dismissed") === "1");

  const term = search.trim();
  const showingResults = discover || term.length > 0;
  const resultsKey = `${discover ? "d" : "s"}:${term}`;
  const resultsLoading = showingResults && results.key !== resultsKey;

  // Always-fresh copies for socket handlers (they must not capture stale state)
  const connectionsRef = useRef<ListUser[] | null>(null);
  const activeRef = useRef(activeUserId);
  const openChatRef = useRef<(u: ListUser) => void>(() => {});
  useEffect(() => {
    connectionsRef.current = connections;
    activeRef.current = activeUserId;
  });

  // ───────── unread total → tab title ─────────
  const unreadTotal = (connections ?? []).reduce((sum, u) => sum + (u.unreadCount || 0), 0);
  useEffect(() => {
    onUnreadChange?.(unreadTotal);
  }, [unreadTotal, onUnreadChange]);

  // ───────── loaders ─────────
  const loadConnections = useCallback(async () => {
    try {
      const { data } = await api.get<ListUser[]>("/api/users/connections");
      setConnections(Array.isArray(data) ? data : []);
    } catch (err) {
      setConnections((prev) => prev ?? []);
      setNotice(getErrorMessage(err, "Could not load your chats"));
    }
  }, []);

  const loadRequests = useCallback(async () => {
    try {
      const { data } = await api.get<Requests>("/api/users/requests");
      setRequests({ received: data.received || [], sent: data.sent || [] });
    } catch {
      /* non-critical */
    }
  }, []);

  const refreshAll = useCallback(() => {
    loadConnections();
    loadRequests();
    setRefreshTick((t) => t + 1);
  }, [loadConnections, loadRequests]);

  useEffect(() => {
    loadConnections();
    loadRequests();
  }, [loadConnections, loadRequests]);

  // ───────── search / discover (debounced, stale responses are cancelled) ─────────
  useEffect(() => {
    if (!showingResults) return;

    const controller = new AbortController();
    const timer = setTimeout(
      async () => {
        try {
          const { data } = await api.get<ListUser[]>("/api/users", {
            params: { search: term || undefined, filter: discover ? "not_connected" : undefined },
            signal: controller.signal,
          });
          setResults({ key: resultsKey, items: Array.isArray(data) ? data : [], error: false });
        } catch (err) {
          if (isCanceled(err)) return;
          setResults({ key: resultsKey, items: [], error: true });
        }
      },
      term ? 300 : 0
    );

    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [showingResults, term, discover, resultsKey, refreshTick]);

  // ───────── desktop notification for a new message ─────────
  const notify = (sender: ListUser | undefined, message: ChatMessage) => {
    if (typeof Notification === "undefined" || Notification.permission !== "granted") return;
    // you're looking at the app → the unread badge is enough
    if (!document.hidden && document.hasFocus()) return;

    const n = new Notification(sender?.username ?? "New message", {
      body: message.content.slice(0, 100) || "New message",
      tag: message.sender, // one notification per person, newer messages replace older ones
      icon: (sender && avatarUrl(sender)) || undefined,
    });
    n.onclick = () => {
      window.focus();
      if (sender) openChatRef.current(sender);
      n.close();
    };
  };

  // ───────── realtime ─────────
  useEffect(() => {
    const bumpConversation = (userId: string, patch: (u: ListUser) => Partial<ListUser>) => {
      setConnections((prev) => {
        if (!prev) return prev;
        const idx = prev.findIndex((u) => u._id === userId);
        if (idx === -1) return prev;
        const updated = { ...prev[idx], ...patch(prev[idx]) };
        return [updated, ...prev.filter((_, i) => i !== idx)]; // move to top
      });
    };

    const onReceive = (m: ChatMessage) => {
      const sender = connectionsRef.current?.find((u) => u._id === m.sender);
      if (!sender) return refreshAll();

      // "open" only counts if the tab is actually visible, otherwise it is still unread
      const isOpen = activeRef.current === m.sender && !document.hidden;
      bumpConversation(m.sender, (u) => ({
        lastMessage: m.content.slice(0, 120),
        lastMessageAt: m.createdAt,
        lastMessageFromMe: false,
        unreadCount: isOpen ? 0 : (u.unreadCount || 0) + 1,
      }));
      notify(sender, m);
    };

    const onSent = (m: ChatMessage) =>
      bumpConversation(m.receiver, () => ({
        lastMessage: m.content.slice(0, 120),
        lastMessageAt: m.createdAt,
        lastMessageFromMe: true,
      }));

    const onPresence = ({ userId, isOnline, lastSeen }: { userId: string; isOnline: boolean; lastSeen: string }) => {
      const patch = (u: ListUser) => (u._id === userId ? { ...u, isOnline, lastSeen } : u);
      setConnections((prev) => prev && prev.map(patch));
      setResults((prev) => ({ ...prev, items: prev.items.map(patch) }));
    };

    // returning to the tab: the open chat is read now
    const onVisible = () => {
      if (document.hidden) return;
      setConnections((prev) =>
        prev && prev.map((u) => (u._id === activeRef.current && u.unreadCount ? { ...u, unreadCount: 0 } : u))
      );
    };

    socket.on("receive_message", onReceive);
    socket.on("message_sent", onSent);
    socket.on("message_edited", loadConnections); // the preview may show the edited text
    socket.on("presence", onPresence);
    socket.on("request_received", refreshAll);
    socket.on("request_accepted", refreshAll);
    socket.on("request_rejected", refreshAll);
    socket.on("connection_removed", refreshAll); // someone disconnected / blocked → refresh both lists
    socket.on("message_deleted", loadConnections); // last-message preview may have changed
    socket.on("connect", refreshAll); // catch up after a reconnect
    document.addEventListener("visibilitychange", onVisible);

    return () => {
      socket.off("receive_message", onReceive);
      socket.off("message_sent", onSent);
      socket.off("message_edited", loadConnections);
      socket.off("presence", onPresence);
      socket.off("request_received", refreshAll);
      socket.off("request_accepted", refreshAll);
      socket.off("request_rejected", refreshAll);
      socket.off("connection_removed", refreshAll);
      socket.off("message_deleted", loadConnections);
      socket.off("connect", refreshAll);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [refreshAll, loadConnections]);

  // ───────── actions ─────────
  /** Update one person's status inside the search/discover results (or drop them). */
  const patchResult = (id: string, status: Relation | "removed") =>
    setResults((prev) => ({
      ...prev,
      items: prev.items
        .map((u) => (u._id === id && status !== "removed" ? { ...u, status } : u))
        .filter((u) => {
          if (u._id !== id) return true;
          if (status === "removed") return false;
          // once connected, a person no longer belongs in "not connected"
          return !(discover && status === "connected");
        }),
    }));

  const act = async (user: ListUser, request: () => Promise<unknown>, next: Relation | "removed") => {
    setBusyId(user._id);
    setNotice("");
    try {
      await request();
      patchResult(user._id, next);
      loadRequests();
      if (next === "connected") loadConnections();
    } catch (err) {
      setNotice(getErrorMessage(err, "Action failed. Please try again."));
      refreshAll(); // state may have changed on the other side
    } finally {
      setBusyId(null);
    }
  };

  const onConnect = (u: ListUser) => act(u, () => api.post(`/api/users/request/${u._id}`), "sent");
  const onCancel = (u: ListUser) => act(u, () => api.delete(`/api/users/request/${u._id}`), "none");
  const onAccept = (u: ListUser) => act(u, () => api.post(`/api/users/accept/${u._id}`), "connected");
  const onReject = (u: ListUser) => act(u, () => api.post(`/api/users/reject/${u._id}`), "none");
  const onBlock = (u: ListUser) => act(u, () => api.post(`/api/users/block/${u._id}`), "removed");

  const openChat = (user: ListUser) => {
    setConnections((prev) => prev && prev.map((u) => (u._id === user._id ? { ...u, unreadCount: 0 } : u)));
    onSelectUser(user);
  };
  useEffect(() => {
    openChatRef.current = openChat;
  });

  const enableNotifications = async () => {
    if (typeof Notification === "undefined") return;
    setNotifPermission(await Notification.requestPermission());
  };

  const dismissNotifications = () => {
    localStorage.setItem("notif_dismissed", "1");
    setNotifDismissed(true);
  };

  const actions = { onConnect, onCancel, onAccept, onReject, onBlock };

  // ───────── render helpers ─────────
  const renderConnectedRow = (u: ListUser) => {
    const unread = u._id === activeUserId && !document.hidden ? 0 : u.unreadCount || 0;
    return (
      <div
        key={u._id}
        onClick={() => openChat(u)}
        className={`${rowBase} ${rowClickable} ${u._id === activeUserId ? "bg-gray-100 dark:bg-gray-800" : ""}`}
      >
        <Avatar user={u} showStatus />
        <div className="flex-1 min-w-0">
          <div className="flex items-center justify-between gap-2">
            <span className="text-sm font-medium text-gray-900 dark:text-gray-100 truncate">{u.username}</span>
            <span className={`text-[11px] flex-shrink-0 ${unread ? "text-emerald-600 dark:text-emerald-400 font-semibold" : "text-gray-400 dark:text-gray-500"}`}>
              {formatListTime(u.lastMessageAt)}
            </span>
          </div>
          <div className="flex items-center justify-between gap-2 mt-0.5">
            <span className={`text-xs truncate ${unread ? "text-gray-800 dark:text-gray-200 font-medium" : "text-gray-500 dark:text-gray-400"}`}>
              {u.lastMessage
                ? `${u.lastMessageFromMe ? "You: " : ""}${u.lastMessage}`
                : u.about || (u.isOnline ? "online" : "Say hello 👋")}
            </span>
            {unread > 0 && (
              <span className="min-w-[20px] h-5 px-1.5 rounded-full bg-emerald-500 text-white text-[11px] font-semibold flex items-center justify-center flex-shrink-0">
                {unread > 99 ? "99+" : unread}
              </span>
            )}
          </div>
        </div>
      </div>
    );
  };

  const renderPersonRow = (u: ListUser) => {
    const connected = u.status === "connected";
    return (
      <div key={u._id} onClick={connected ? () => openChat(u) : undefined} className={`${rowBase} ${connected ? rowClickable : ""}`}>
        <Avatar user={u} showStatus />
        <div className="flex-1 min-w-0">
          <div className="text-sm font-medium text-gray-900 dark:text-gray-100 truncate">{u.username}</div>
          <div className="text-xs text-gray-500 dark:text-gray-400 truncate mt-0.5">{u.email || u.phone || "—"}</div>
        </div>
        <div className="flex-shrink-0 max-w-[55%]" onClick={(e) => e.stopPropagation()}>
          <PersonActions user={u} busy={busyId === u._id} {...actions} />
        </div>
      </div>
    );
  };

  // ───────── UI ─────────
  return (
    <div className="flex flex-col h-full bg-white dark:bg-gray-900">
      {/* Search + discover button */}
      <div className="px-3 pt-3 pb-2 bg-gray-50 dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700 flex-shrink-0 space-y-2">
        <div className="flex items-center gap-2 bg-white dark:bg-gray-700 border border-gray-200 dark:border-gray-600 rounded-full px-3 py-2 shadow-sm focus-within:border-emerald-500 focus-within:ring-2 focus-within:ring-emerald-500/20 transition">
          <svg className="w-4 h-4 text-gray-400 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
          </svg>
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="flex-1 text-sm bg-transparent outline-none text-gray-800 dark:text-gray-100 placeholder-gray-400 dark:placeholder-gray-500 min-w-0"
            placeholder={discover ? "Search people you're not connected with…" : "Search name, email or phone…"}
            aria-label="Search users"
          />
          {search && (
            <button onClick={() => setSearch("")} aria-label="Clear search" className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-200">
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          )}
        </div>

        <button
          onClick={() => {
            setDiscover((d) => !d);
            setNotice("");
          }}
          aria-pressed={discover}
          className={`w-full flex items-center justify-center gap-2 text-xs font-medium py-2 rounded-full border transition-colors
            ${discover
              ? "bg-emerald-600 border-emerald-600 text-white hover:bg-emerald-700"
              : "bg-white dark:bg-gray-700 border-gray-200 dark:border-gray-600 text-gray-700 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-600"}`}
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            {discover ? (
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            ) : (
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                d="M18 9v3m0 0v3m0-3h3m-3 0h-3m-2-5a4 4 0 11-8 0 4 4 0 018 0zM3 20a6 6 0 0112 0v1H3v-1z" />
            )}
          </svg>
          {discover ? "Back to my chats" : "Show non-connected users"}
        </button>
      </div>

      {/* notifications opt-in */}
      {notifPermission === "default" && !notifDismissed && (
        <div className="flex items-center gap-2 px-3 py-2 bg-emerald-50 dark:bg-emerald-900/20 border-b border-emerald-100 dark:border-emerald-900/40 text-xs text-emerald-800 dark:text-emerald-200">
          <svg className="w-4 h-4 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 17h5l-1.4-1.4A2 2 0 0118 14.2V11a6 6 0 10-12 0v3.2c0 .5-.2 1-.6 1.4L4 17h5m6 0a3 3 0 11-6 0" />
          </svg>
          <span className="flex-1">Get notified about new messages</span>
          <button onClick={enableNotifications} className="font-semibold underline hover:no-underline">
            Enable
          </button>
          <button onClick={dismissNotifications} aria-label="Dismiss" className="font-bold px-1">
            ×
          </button>
        </div>
      )}

      {notice && (
        <div className="px-4 py-2 text-xs text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-900/20 border-b border-red-100 dark:border-red-900/30 flex items-center justify-between gap-2">
          <span>{notice}</span>
          <button onClick={() => setNotice("")} aria-label="Dismiss" className="font-bold">
            ×
          </button>
        </div>
      )}

      <div className="flex-1 overflow-y-auto">
        {/* ───────── MODE A: search / discover results ───────── */}
        {showingResults ? (
          resultsLoading ? (
            <Skeleton />
          ) : results.error ? (
            <EmptyState
              title="Couldn't load users"
              hint="Check your connection and try again."
              action={
                <button onClick={() => setRefreshTick((t) => t + 1)} className="mt-3 text-xs font-medium text-emerald-600 hover:underline">
                  Retry
                </button>
              }
            />
          ) : results.items.length === 0 ? (
            <EmptyState
              title={term ? "No users found" : "You're connected with everyone 🎉"}
              hint={term ? "Try a different name, email or phone number." : "There is nobody left to connect with right now."}
            />
          ) : (
            <div className="py-1">
              <SectionLabel count={results.items.length}>{discover ? "Not connected" : "Search results"}</SectionLabel>
              {results.items.map(renderPersonRow)}
            </div>
          )
        ) : /* ───────── MODE B: my connected accounts ───────── */ connections === null ? (
          <Skeleton />
        ) : (
          <>
            {requests.received.length > 0 && (
              <div className="border-b border-gray-100 dark:border-gray-800 bg-amber-50/60 dark:bg-amber-900/10 pb-1">
                <SectionLabel count={requests.received.length}>Connection requests</SectionLabel>
                {requests.received.map(renderPersonRow)}
              </div>
            )}

            {connections.length === 0 ? (
              <EmptyState
                title="No connections yet"
                hint="Connect with people to start chatting."
                action={
                  <button
                    onClick={() => setDiscover(true)}
                    className="mt-3 text-xs font-medium px-4 py-2 rounded-full bg-emerald-600 hover:bg-emerald-700 text-white"
                  >
                    Find people
                  </button>
                }
              />
            ) : (
              <div className="py-1">
                <SectionLabel count={connections.length}>Connected</SectionLabel>
                {connections.map(renderConnectedRow)}
              </div>
            )}

            {requests.sent.length > 0 && (
              <div className="pb-2">
                <SectionLabel count={requests.sent.length}>Waiting for reply</SectionLabel>
                {requests.sent.map(renderPersonRow)}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
};

export default ChatList;
