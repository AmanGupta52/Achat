import { useCallback, useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import api, { getErrorMessage, isCanceled } from "../api";
import { socket } from "../socket";
import Avatar, { avatarUrl } from "./Avatar";
import { formatListTime } from "../utils/time";
import { isPageVisible, subscribeVisibility } from "../utils/appState";
import {
  checkNotificationPermission,
  requestNotificationPermission,
  setNotificationClickHandler,
  showMessageNotification,
  type NotifPermission,
} from "../utils/notify";
import { usePersonActions } from "../hooks/usePersonActions";
import { EmptyState, PersonActions, SectionLabel, Skeleton, rowBase, rowClickable } from "./people";
import type { ChatMessage, ListUser, Relation } from "../types";



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
  /** total number of unread messages — used for the "(3) Achat" tab title */
  onUnreadChange?: (total: number) => void;
}

/* ───────────────────────────────── component ───────────────────────────────── */

/**
 * Left column of the app.
 *  - default page  → only my CONNECTED accounts (with last message + unread badge)
 *  - typing        → live search across everyone (connected people first)
 *  - floating button → the separate "Non-connected users" page (/people)
 */
const ChatList = ({ activeUserId, onSelectUser, onUnreadChange }: Props) => {
  const navigate = useNavigate();
  const [search, setSearch] = useState("");

  const [connections, setConnections] = useState<ListUser[] | null>(null); // null = still loading
  const [requests, setRequests] = useState<Requests>({ received: [], sent: [] });
  const [results, setResults] = useState<Results>({ key: null, items: [], error: false });
  const [refreshTick, setRefreshTick] = useState(0);
  const [loadNotice, setLoadNotice] = useState(""); // "couldn't load your chats" (separate from action errors)

  // desktop notifications
  const [notifPermission, setNotifPermission] = useState<NotifPermission>("unsupported");
  const [notifDismissed, setNotifDismissed] = useState(() => localStorage.getItem("notif_dismissed") === "1");

  const term = search.trim();
  const showingResults = term.length > 0;
  const resultsKey = term;
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
  const loadConnections = useCallback(
    () =>
      api
        .get<ListUser[]>("/api/users/connections")
        .then(({ data }) => setConnections(Array.isArray(data) ? data : []))
        .catch((err: unknown) => {
          setConnections((prev) => prev ?? []);
          setLoadNotice(getErrorMessage(err, "Could not load your chats"));
        }),
    []
  );

  const loadRequests = useCallback(
    () =>
      api
        .get<Requests>("/api/users/requests")
        .then(({ data }) => setRequests({ received: data.received || [], sent: data.sent || [] }))
        .catch(() => {
          /* non-critical */
        }),
    []
  );

  const refreshAll = useCallback(() => {
    loadConnections();
    loadRequests();
    setRefreshTick((t) => t + 1);
  }, [loadConnections, loadRequests]);

  useEffect(() => {
    loadConnections();
    loadRequests();
  }, [loadConnections, loadRequests]);

  // ───────── search (debounced, stale responses are cancelled) ─────────
  useEffect(() => {
    if (!showingResults) return;

    const controller = new AbortController();
    const timer = setTimeout(
      async () => {
        try {
          const { data } = await api.get<ListUser[]>("/api/users", {
            params: { search: term },
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
  }, [showingResults, term, resultsKey, refreshTick]);

  // ───────── notification for a new message (browser or Android app) ─────────
  const notify = (sender: ListUser | undefined, message: ChatMessage) =>
    showMessageNotification({
      userId: message.sender, // one notification per person, newer messages replace older ones
      title: sender?.username ?? "New message",
      body: message.content.slice(0, 100) || "New message",
      iconUrl: (sender && avatarUrl(sender)) || undefined,
    });

  // permission state (async on Android) + tapping a notification opens that chat
  useEffect(() => {
    checkNotificationPermission().then(setNotifPermission);
    setNotificationClickHandler((userId) => {
      const person = connectionsRef.current?.find((u) => u._id === userId);
      if (person) openChatRef.current(person);
    });
    return () => setNotificationClickHandler(null);
  }, []);

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
      const isOpen = activeRef.current === m.sender && isPageVisible();
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
      if (!isPageVisible()) return;
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
    const unsubscribeVisibility = subscribeVisibility(onVisible);

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
      unsubscribeVisibility();
    };
  }, [refreshAll, loadConnections]);

  // ───────── actions ─────────
  /** Update one person's status inside the search results (or drop them). */
  const patchResult = (id: string, status: Relation | "removed") =>
    setResults((prev) => ({
      ...prev,
      items: prev.items
        .map((u) => (u._id === id && status !== "removed" ? { ...u, status } : u))
        .filter((u) => !(u._id === id && status === "removed")),
    }));

  const { busyId, notice, setNotice, actions } = usePersonActions({
    onSuccess: (id, next) => {
      patchResult(id, next);
      loadRequests();
      if (next === "connected") loadConnections();
    },
    onError: refreshAll, // state may have changed on the other side
  });

  const openChat = (user: ListUser) => {
    setConnections((prev) => prev && prev.map((u) => (u._id === user._id ? { ...u, unreadCount: 0 } : u)));
    onSelectUser(user);
  };
  useEffect(() => {
    openChatRef.current = openChat;
  });

  const enableNotifications = async () => {
    setNotifPermission(await requestNotificationPermission());
  };

  const dismissNotifications = () => {
    localStorage.setItem("notif_dismissed", "1");
    setNotifDismissed(true);
  };


  // ───────── render helpers ─────────
  const renderConnectedRow = (u: ListUser) => {
    const unread = u._id === activeUserId && isPageVisible() ? 0 : u.unreadCount || 0;
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
    <div className="relative flex flex-col h-full bg-white dark:bg-gray-900">
      {/* Search */}
      <div className="px-3 pt-3 pb-2 bg-gray-50 dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700 flex-shrink-0 space-y-2">
        <div className="flex items-center gap-2 bg-white dark:bg-gray-700 border border-gray-200 dark:border-gray-600 rounded-full px-3 py-2 shadow-sm focus-within:border-emerald-500 focus-within:ring-2 focus-within:ring-emerald-500/20 transition">
          <svg className="w-4 h-4 text-gray-400 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
          </svg>
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="flex-1 text-sm bg-transparent outline-none text-gray-800 dark:text-gray-100 placeholder-gray-400 dark:placeholder-gray-500 min-w-0"
            placeholder="Search name, email or phone…"
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

      {(notice || loadNotice) && (
        <div className="px-4 py-2 text-xs text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-900/20 border-b border-red-100 dark:border-red-900/30 flex items-center justify-between gap-2">
          <span>{notice || loadNotice}</span>
          <button
            onClick={() => {
              setNotice("");
              setLoadNotice("");
            }}
            aria-label="Dismiss"
            className="font-bold"
          >
            ×
          </button>
        </div>
      )}

      <div className="flex-1 overflow-y-auto pb-24">
        {/* ───────── MODE A: search results ───────── */}
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
              title="No users found"
              hint="Try a different name, email or phone number."
            />
          ) : (
            <div className="py-1">
              <SectionLabel count={results.items.length}>Search results</SectionLabel>
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
                    onClick={() => navigate("/people")}
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

      {/* Floating button (like "new chat"): opens the separate page with everyone you're not connected with */}
      {!showingResults && (
        <button
          onClick={() => navigate("/people")}
          aria-label="Find new people"
          title="Non-connected users"
          className="absolute bottom-5 right-5 z-10 w-14 h-14 rounded-2xl bg-[#25d366] hover:bg-[#20bd5a] active:scale-95 text-[#0b141a] shadow-lg shadow-black/30 flex items-center justify-center transition"
        >
          <svg className="w-7 h-7" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" d="M21 11.5a8.38 8.38 0 01-.9 3.8 8.5 8.5 0 01-7.6 4.7 8.38 8.38 0 01-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 01-.9-3.8 8.5 8.5 0 014.7-7.6 8.38 8.38 0 013.8-.9h.5a8.48 8.48 0 018 8v.5z" />
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 8.5v6M9 11.5h6" />
          </svg>
        </button>
      )}
    </div>
  );
};

export default ChatList;
