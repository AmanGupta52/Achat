import { useCallback, useEffect, useLayoutEffect, useRef, useState, type ChangeEvent, type KeyboardEvent } from "react";
import api, { getErrorMessage } from "../api";
import { socket, sendTypingEvent } from "../socket";
import { useAuth } from "../context/AuthContext";
import Avatar from "./Avatar";
import Message from "./Message";
import MessageMenu from "./MessageMenu";
import DeleteMessageDialog from "./DeleteMessageDialog";
import UserInfo from "./UserInfo";
import { dayLabel, formatLastSeen } from "../utils/time";
import { isPageVisible, subscribeVisibility } from "../utils/appState";
import type { ChatMessage, ListUser, Reaction, ReplyPreview, SearchHit } from "../types";

const MAX_LENGTH = 4000;
const PAGE_SIZE = 50;
const EDIT_WINDOW_FALLBACK_MS = 15 * 60 * 1000;

const isTemp = (m: ChatMessage) => m._id.startsWith("tmp-");

/**
 * Merge messages by id. Saved messages are ordered by their ObjectId (= creation time);
 * messages that are still being sent stay at the end.
 */
const mergeMessages = (prev: ChatMessage[], incoming: ChatMessage[]): ChatMessage[] => {
  const byId = new Map<string, ChatMessage>();
  for (const m of prev) if (!isTemp(m)) byId.set(m._id, m);
  for (const m of incoming) byId.set(m._id, { ...byId.get(m._id), ...m });
  const saved = [...byId.values()].sort((a, b) => (a._id < b._id ? -1 : a._id > b._id ? 1 : 0));
  return [...saved, ...prev.filter(isTemp)];
};

/** Apply a deletion to a message list (idempotent, so socket + HTTP results can both call it). */
const applyDeletion = (list: ChatMessage[], messageId: string, scope: "me" | "everyone"): ChatMessage[] =>
  scope === "everyone"
    ? list.map((m) => (m._id === messageId ? { ...m, deleted: true, content: "", replyTo: null, reactions: [] } : m))
    : list.filter((m) => m._id !== messageId);

const previewOf = (m: ChatMessage): ReplyPreview => ({
  _id: m._id,
  sender: m.sender,
  content: m.content.slice(0, 120),
  deleted: m.deleted,
});

interface Props {
  selectedUser: ListUser;
  onBack: () => void;
}

interface MenuState {
  message: ChatMessage;
  anchor: DOMRect;
  canEdit: boolean; // decided when the menu opens (time-dependent)
}

/**
 * One open conversation.
 * Rendered with `key={selectedUser._id}` by the parent, so switching chats remounts it —
 * state resets cleanly and there are no stale messages or "reload loops".
 */
const ChatBox = ({ selectedUser, onBack }: Props) => {
  const { currentUser } = useAuth();
  const myId = String(currentUser?._id);
  const peerId = selectedUser._id;

  const [peer, setPeer] = useState<ListUser>(selectedUser);
  const [peerTyping, setPeerTyping] = useState(false);

  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [hasMore, setHasMore] = useState(false);
  const [loadingOlder, setLoadingOlder] = useState(false);
  const [status, setStatus] = useState<"loading" | "ready" | "error">("loading");

  const [input, setInput] = useState("");
  const [replyingTo, setReplyingTo] = useState<ChatMessage | null>(null);
  const [editing, setEditing] = useState<ChatMessage | null>(null);
  const [composerError, setComposerError] = useState("");

  const [menu, setMenu] = useState<MenuState | null>(null);
  const [showInfo, setShowInfo] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<ChatMessage | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState("");
  const [highlightId, setHighlightId] = useState<string | null>(null);

  // in-chat search
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");
  const [hits, setHits] = useState<SearchHit[]>([]);
  const [hitIndex, setHitIndex] = useState(0);
  const [searching, setSearching] = useState(false);

  const scrollRef = useRef<HTMLDivElement>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const firstScroll = useRef(true);
  const stickToBottom = useRef(true);
  const restoreScroll = useRef<{ height: number; top: number } | null>(null);
  const loadedOnce = useRef(false);
  const loadingOlderRef = useRef(false);
  const messagesRef = useRef<ChatMessage[]>([]);
  const hasMoreRef = useRef(false);
  const typingStopTimer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const peerTypingTimer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const highlightTimer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const searchTimer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const searchRequest = useRef(0);
  const iAmTyping = useRef(false);

  useEffect(() => {
    messagesRef.current = messages;
    hasMoreRef.current = hasMore;
  });

  // ───────── read receipts (only while the tab is actually visible) ─────────
  const markRead = useCallback(() => {
    if (isPageVisible()) api.put(`/api/chat/read/${peerId}`).catch(() => {});
  }, [peerId]);

  useEffect(() => {
    return subscribeVisibility(() => {
      if (isPageVisible()) markRead();
    });
  }, [markRead]);

  // ───────── history: newest page, then older pages on demand ─────────
  const loadLatest = useCallback(async () => {
    try {
      const { data } = await api.get<{ messages: ChatMessage[]; hasMore: boolean }>(`/api/chat/${peerId}`, {
        params: { limit: PAGE_SIZE },
      });
      setMessages((prev) => mergeMessages(prev, data.messages));
      if (!loadedOnce.current) setHasMore(data.hasMore); // later reloads must not forget older pages
      loadedOnce.current = true;
      setStatus("ready");
      markRead();
    } catch {
      setStatus((s) => (s === "loading" ? "error" : s));
    }
  }, [peerId, markRead]);

  useEffect(() => {
    loadLatest();
  }, [loadLatest]);

  const loadOlder = useCallback(async () => {
    if (loadingOlderRef.current || !hasMoreRef.current) return;
    const oldest = messagesRef.current.find((m) => !isTemp(m));
    if (!oldest) return;

    loadingOlderRef.current = true;
    setLoadingOlder(true);
    const el = scrollRef.current;
    if (el) restoreScroll.current = { height: el.scrollHeight, top: el.scrollTop };

    try {
      const { data } = await api.get<{ messages: ChatMessage[]; hasMore: boolean }>(`/api/chat/${peerId}`, {
        params: { limit: PAGE_SIZE, before: oldest._id },
      });
      setMessages((prev) => mergeMessages(prev, data.messages));
      setHasMore(data.hasMore);
    } catch {
      restoreScroll.current = null;
    } finally {
      loadingOlderRef.current = false;
      setLoadingOlder(false);
    }
  }, [peerId]);

  // keep the reader's position when older messages are inserted above
  useLayoutEffect(() => {
    const el = scrollRef.current;
    const saved = restoreScroll.current;
    if (el && saved) {
      el.scrollTop = el.scrollHeight - saved.height + saved.top;
      restoreScroll.current = null;
    }
  }, [messages]);

  // composer grows with the text (up to ~5 lines), then scrolls
  useLayoutEffect(() => {
    const el = inputRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, 132)}px`;
  }, [input]);

  const handleScroll = () => {
    const el = scrollRef.current;
    if (!el) return;
    stickToBottom.current = el.scrollHeight - el.scrollTop - el.clientHeight < 150;
    if (el.scrollTop < 80) loadOlder();
  };

  // ───────── jump to a specific message (search hits, tapping a quote) ─────────
  const loadUntil = useCallback(
    async (id: string): Promise<boolean> => {
      let more = hasMoreRef.current;
      let before = messagesRef.current.find((m) => !isTemp(m))?._id;
      let collected: ChatMessage[] = [];
      let found = false;

      for (let page = 0; page < 40 && more && before && !found; page++) {
        const { data } = await api.get<{ messages: ChatMessage[]; hasMore: boolean }>(`/api/chat/${peerId}`, {
          params: { limit: 100, before },
        });
        collected = [...data.messages, ...collected];
        more = data.hasMore;
        before = data.messages[0]?._id;
        found = data.messages.some((m) => m._id === id);
      }

      if (collected.length) {
        setMessages((prev) => mergeMessages(prev, collected));
        setHasMore(more);
      }
      return found;
    },
    [peerId]
  );

  const scrollToMessage = useCallback(
    async (id: string) => {
      let found = messagesRef.current.some((m) => m._id === id);
      if (!found) {
        try {
          found = await loadUntil(id);
        } catch {
          return;
        }
      }
      if (!found) return;

      // wait for React to render any newly loaded messages
      requestAnimationFrame(() =>
        requestAnimationFrame(() =>
          document.getElementById(`msg-${id}`)?.scrollIntoView({ block: "center", behavior: "smooth" })
        )
      );

      setHighlightId(id);
      clearTimeout(highlightTimer.current);
      highlightTimer.current = setTimeout(() => setHighlightId(null), 2200);
    },
    [loadUntil]
  );

  // fresh online / last-seen info for the header
  useEffect(() => {
    let cancelled = false;
    api
      .get<ListUser>(`/api/users/${peerId}`)
      .then(({ data }) => !cancelled && setPeer((p) => ({ ...p, ...data })))
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [peerId]);

  // ───────── realtime ─────────
  useEffect(() => {
    const onReceive = (msg: ChatMessage) => {
      if (msg.sender !== peerId) return; // other chats are handled by the list
      setMessages((prev) => mergeMessages(prev, [msg]));
      setPeerTyping(false);
      markRead(); // chat is open → it's read (if the tab is visible)
    };

    // my own message echoed by the server (keeps my other tabs in sync)
    const onSent = (msg: ChatMessage) => {
      if (msg.receiver === peerId) setMessages((prev) => mergeMessages(prev, [msg]));
    };

    const onEdited = (msg: ChatMessage) => {
      if (msg.sender === peerId || msg.receiver === peerId) setMessages((prev) => mergeMessages(prev, [msg]));
    };

    const onReaction = ({ messageId, reactions }: { messageId: string; reactions: Reaction[] }) =>
      setMessages((prev) => prev.map((m) => (m._id === messageId ? { ...m, reactions } : m)));

    const onDelivered = ({ messageId }: { messageId: string }) =>
      setMessages((prev) => prev.map((m) => (m._id === messageId ? { ...m, delivered: true } : m)));

    const onRead = ({ readerId }: { readerId: string }) => {
      if (readerId !== peerId) return;
      setMessages((prev) => prev.map((m) => (m.sender === myId ? { ...m, delivered: true, read: true } : m)));
    };

    const onTyping = ({ sender, isTyping }: { sender: string; isTyping: boolean }) => {
      if (sender !== peerId) return;
      setPeerTyping(isTyping);
      clearTimeout(peerTypingTimer.current);
      if (isTyping) peerTypingTimer.current = setTimeout(() => setPeerTyping(false), 4000);
    };

    const onPresence = ({ userId, isOnline, lastSeen }: { userId: string; isOnline: boolean; lastSeen: string }) => {
      if (userId === peerId) setPeer((p) => ({ ...p, isOnline, lastSeen }));
    };

    // someone deleted a message (scope "everyone" → placeholder, "me" → gone from my view)
    const onDeleted = ({ messageId, scope }: { messageId: string; scope: "me" | "everyone" }) =>
      setMessages((prev) => applyDeletion(prev, messageId, scope));

    // either side disconnected / blocked → this conversation is no longer available
    const onConnectionRemoved = ({ userId }: { userId: string }) => {
      if (userId === peerId) onBack();
    };

    socket.on("receive_message", onReceive);
    socket.on("message_sent", onSent);
    socket.on("message_edited", onEdited);
    socket.on("message_reaction", onReaction);
    socket.on("message_delivered", onDelivered);
    socket.on("messages_read", onRead);
    socket.on("typing", onTyping);
    socket.on("presence", onPresence);
    socket.on("message_deleted", onDeleted);
    socket.on("connection_removed", onConnectionRemoved);
    socket.on("connect", loadLatest); // fetch anything missed while disconnected

    return () => {
      socket.off("receive_message", onReceive);
      socket.off("message_sent", onSent);
      socket.off("message_edited", onEdited);
      socket.off("message_reaction", onReaction);
      socket.off("message_delivered", onDelivered);
      socket.off("messages_read", onRead);
      socket.off("typing", onTyping);
      socket.off("presence", onPresence);
      socket.off("message_deleted", onDeleted);
      socket.off("connection_removed", onConnectionRemoved);
      socket.off("connect", loadLatest);
      clearTimeout(peerTypingTimer.current);
    };
  }, [peerId, myId, loadLatest, markRead, onBack]);

  // stop "typing…" / pending timers when leaving the chat
  useEffect(() => {
    return () => {
      clearTimeout(typingStopTimer.current);
      clearTimeout(highlightTimer.current);
      clearTimeout(searchTimer.current);
      if (iAmTyping.current) sendTypingEvent(peerId, false);
    };
  }, [peerId]);

  // ───────── auto-scroll to the newest message (unless the reader scrolled up) ─────────
  const lastMessage = messages[messages.length - 1];
  const lastId = lastMessage?._id;
  const lastIsMine = lastMessage?.sender === myId;

  useEffect(() => {
    if (!lastId) return;
    if (firstScroll.current || lastIsMine || stickToBottom.current) {
      bottomRef.current?.scrollIntoView({ behavior: firstScroll.current ? "auto" : "smooth" });
      firstScroll.current = false;
    }
  }, [lastId, lastIsMine]);

  // ───────── typing indicator (outgoing) ─────────
  const emitTyping = (value: boolean) => {
    if (iAmTyping.current === value) return;
    iAmTyping.current = value;
    sendTypingEvent(peerId, value);
  };

  const handleInputChange = (e: ChangeEvent<HTMLTextAreaElement>) => {
    const value = e.target.value;
    setInput(value);
    setComposerError("");
    clearTimeout(typingStopTimer.current);

    if (value && !editing) {
      emitTyping(true);
      typingStopTimer.current = setTimeout(() => emitTyping(false), 1500);
    } else {
      emitTyping(false);
    }
  };

  // ───────── sending / replying / editing ─────────
  const postMessage = async (text: string, tempId: string, isRetry: boolean, replyTo: ReplyPreview | null) => {
    if (isRetry) {
      setMessages((prev) => prev.map((m) => (m._id === tempId ? { ...m, pending: true, failed: false } : m)));
    } else {
      setMessages((prev) => [
        ...prev,
        {
          _id: tempId,
          sender: myId,
          receiver: peerId,
          content: text,
          deleted: false,
          edited: false,
          editableUntil: new Date(Date.now() + EDIT_WINDOW_FALLBACK_MS).toISOString(),
          delivered: false,
          read: false,
          createdAt: new Date().toISOString(),
          replyTo,
          reactions: [],
          pending: true,
        },
      ]);
    }

    try {
      const { data } = await api.post<ChatMessage>("/api/chat/send", {
        receiverId: peerId,
        content: text,
        replyToId: replyTo?._id,
      });

      // the socket echo may already have added the saved message → never show it twice
      setMessages((prev) =>
        prev.some((m) => m._id === data._id)
          ? prev.filter((m) => m._id !== tempId)
          : prev.map((m) => (m._id === tempId ? data : m))
      );
    } catch {
      setMessages((prev) => prev.map((m) => (m._id === tempId ? { ...m, pending: false, failed: true } : m)));
    }
  };

  const cancelComposerMode = () => {
    if (editing) setInput("");
    setEditing(null);
    setReplyingTo(null);
    setComposerError("");
  };

  const submitEdit = async (text: string) => {
    if (!editing) return;
    if (text === editing.content) return cancelComposerMode();

    try {
      const { data } = await api.put<ChatMessage>(`/api/chat/message/${editing._id}`, { content: text });
      setMessages((prev) => mergeMessages(prev, [data]));
      setEditing(null);
      setInput("");
      setComposerError("");
    } catch (err) {
      setComposerError(getErrorMessage(err, "Could not edit the message."));
    }
  };

  const handleSend = () => {
    const text = input.trim();
    if (!text) return;

    if (editing) {
      submitEdit(text);
      return;
    }

    const reply = replyingTo ? previewOf(replyingTo) : null;
    setInput("");
    setReplyingTo(null);
    setComposerError("");
    clearTimeout(typingStopTimer.current);
    emitTyping(false);

    postMessage(text, `tmp-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`, false, reply);
  };

  const handleKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    // desktop: Enter sends, Shift+Enter = new line. Phones/tablets: Enter = new line, the ➤ button sends.
    const enterSends = window.matchMedia?.("(pointer: fine)").matches ?? true;
    if (e.key === "Enter" && !e.shiftKey && enterSends && !e.nativeEvent.isComposing) {
      e.preventDefault();
      handleSend();
    } else if (e.key === "Escape" && (editing || replyingTo)) {
      cancelComposerMode();
    }
  };

  // ───────── reactions ─────────
  const react = async (message: ChatMessage, emoji: string) => {
    const mine = message.reactions.find((r) => r.userId === myId)?.emoji ?? null;
    const next = mine === emoji ? null : emoji; // tapping your own reaction removes it
    const before = message.reactions;
    const optimistic: Reaction[] = [
      ...before.filter((r) => r.userId !== myId),
      ...(next ? [{ userId: myId, emoji: next }] : []),
    ];

    setMessages((prev) => prev.map((m) => (m._id === message._id ? { ...m, reactions: optimistic } : m)));
    try {
      await api.put(`/api/chat/message/${message._id}/reaction`, { emoji: next });
    } catch {
      setMessages((prev) => prev.map((m) => (m._id === message._id ? { ...m, reactions: before } : m)));
    }
  };

  // ───────── message menu ─────────
  const openMenu = (message: ChatMessage, anchor: DOMRect) => {
    const usable = !message.deleted && !message.failed && !message.pending;
    const canEdit = usable && message.sender === myId && Date.now() < new Date(message.editableUntil).getTime();
    setMenu({ message, anchor, canEdit });
  };

  const closeMenu = useCallback(() => setMenu(null), []);

  const startReply = (message: ChatMessage) => {
    cancelComposerMode();
    setReplyingTo(message);
    setMenu(null);
    inputRef.current?.focus();
  };

  const startEdit = (message: ChatMessage) => {
    setReplyingTo(null);
    setEditing(message);
    setInput(message.content);
    setComposerError("");
    setMenu(null);
    inputRef.current?.focus();
  };

  const openDelete = (message: ChatMessage) => {
    setDeleteError("");
    setDeleteTarget(message);
    setMenu(null);
  };

  const confirmDelete = async (scope: "me" | "everyone") => {
    const target = deleteTarget;
    if (!target) return;

    // a message that never reached the server only exists locally
    if (target.failed) {
      setMessages((prev) => prev.filter((m) => m._id !== target._id));
      setDeleteTarget(null);
      return;
    }

    setDeleting(true);
    setDeleteError("");
    try {
      await api.delete(`/api/chat/message/${target._id}`, { params: { scope } });
      setMessages((prev) => applyDeletion(prev, target._id, scope));
      setDeleteTarget(null);
    } catch (err) {
      setDeleteError(getErrorMessage(err, "Could not delete the message. Please try again."));
    } finally {
      setDeleting(false);
    }
  };

  // ───────── search inside the chat ─────────
  const runSearch = (term: string) => {
    setSearchTerm(term);
    clearTimeout(searchTimer.current);
    const request = ++searchRequest.current;

    if (term.trim().length < 2) {
      setHits([]);
      setHitIndex(0);
      setSearching(false);
      return;
    }

    searchTimer.current = setTimeout(async () => {
      setSearching(true);
      try {
        const { data } = await api.get<{ results: SearchHit[] }>(`/api/chat/${peerId}/search`, {
          params: { q: term.trim() },
        });
        if (request !== searchRequest.current) return; // a newer search replaced this one
        setHits(data.results);
        setHitIndex(0);
        if (data.results[0]) scrollToMessage(data.results[0]._id);
      } catch {
        if (request === searchRequest.current) setHits([]);
      } finally {
        if (request === searchRequest.current) setSearching(false);
      }
    }, 300);
  };

  const stepHit = (delta: number) => {
    if (!hits.length) return;
    const next = (hitIndex + delta + hits.length) % hits.length;
    setHitIndex(next);
    scrollToMessage(hits[next]._id);
  };

  const closeSearch = () => {
    setSearchOpen(false);
    runSearch("");
    setHighlightId(null);
  };

  // ───────── header text ─────────
  const statusText = peerTyping ? "typing…" : peer.isOnline ? "online" : formatLastSeen(peer.lastSeen);
  const statusClass = peerTyping || peer.isOnline ? "text-brand-text" : "text-ink-3";

  // ───────── render ─────────
  let lastDay = "";
  const replyAuthor = replyingTo ? (replyingTo.sender === myId ? "You" : peer.username) : "";

  return (
    <div className="relative overflow-hidden flex flex-col h-full w-full bg-chat-bg">
      {/* HEADER */}
      <div className="h-16 bg-panel flex items-center px-3 gap-2 border-b border-line shadow-sm flex-shrink-0 z-10">
        <button
          onClick={onBack}
          className="md:hidden p-2 -ml-1 rounded-full hover:bg-wash transition-colors"
          aria-label="Back to chats"
        >
          <svg className="w-5 h-5 text-ink-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
          </svg>
        </button>

        {/* clicking the contact opens their details (Disconnect / Block) */}
        <button
          onClick={() => setShowInfo(true)}
          aria-label="View contact info"
          className="flex-1 min-w-0 flex items-center gap-3 text-left rounded-lg py-1 -my-1 px-1 hover:bg-wash transition-colors"
        >
          <Avatar user={peer} showStatus />
          <div className="flex-1 min-w-0">
            <div className="font-semibold text-ink truncate text-base leading-tight">{peer.username}</div>
            <div className={`text-[13px] truncate leading-tight mt-0.5 ${statusClass}`}>{statusText}</div>
          </div>
        </button>

        <button
          onClick={() => (searchOpen ? closeSearch() : setSearchOpen(true))}
          aria-label="Search in chat"
          aria-pressed={searchOpen}
          className={`p-2 rounded-full transition-colors ${
            searchOpen
              ? "bg-brand-soft text-brand-text"
              : "text-ink-2 hover:bg-wash"
          }`}
        >
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
          </svg>
        </button>
      </div>

      {/* SEARCH BAR */}
      {searchOpen && (
        <div className="flex items-center gap-2 px-3 py-2 bg-panel border-b border-line flex-shrink-0">
          <input
            autoFocus
            value={searchTerm}
            onChange={(e) => runSearch(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") stepHit(e.shiftKey ? -1 : 1);
              if (e.key === "Escape") closeSearch();
            }}
            placeholder="Search in this chat…"
            aria-label="Search messages"
            className="flex-1 min-w-0 text-[15px] bg-wash text-ink placeholder-ink-3 rounded-full px-4 py-2 outline-none focus:ring-2 focus:ring-brand/30"
          />
          <span className="text-xs text-ink-3 whitespace-nowrap min-w-[3.5rem] text-center" aria-live="polite">
            {searching ? "…" : searchTerm.trim().length < 2 ? "" : hits.length ? `${hitIndex + 1} of ${hits.length}` : "No results"}
          </span>
          <button onClick={() => stepHit(1)} disabled={!hits.length} aria-label="Previous match (older)" className="p-1.5 rounded-full text-ink-2 hover:bg-wash disabled:opacity-30">
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 15l7-7 7 7" /></svg>
          </button>
          <button onClick={() => stepHit(-1)} disabled={!hits.length} aria-label="Next match (newer)" className="p-1.5 rounded-full text-ink-2 hover:bg-wash disabled:opacity-30">
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" /></svg>
          </button>
          <button onClick={closeSearch} aria-label="Close search" className="p-1.5 rounded-full text-ink-2 hover:bg-wash">
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
          </button>
        </div>
      )}

      {/* MESSAGES */}
      <div ref={scrollRef} onScroll={handleScroll} className="flex-1 px-2 py-4 md:px-6 overflow-y-auto">
        {status === "loading" ? (
          <div className="flex items-center justify-center h-full">
            <div className="w-6 h-6 border-2 border-brand border-t-transparent rounded-full animate-spin" />
          </div>
        ) : status === "error" ? (
          <div className="flex flex-col items-center justify-center h-full gap-2">
            <p className="text-sm text-ink-2">Couldn't load this conversation.</p>
            <button
              onClick={() => {
                setStatus("loading");
                loadLatest();
              }}
              className="text-xs font-medium px-4 py-2 rounded-full bg-brand hover:bg-brand-hover text-white"
            >
              Try again
            </button>
          </div>
        ) : messages.length === 0 ? (
          <div className="flex items-center justify-center h-full">
            <p className="text-sm text-ink-2 bg-panel px-4 py-2 rounded-full shadow-sm">
              No messages yet. Say hello! 👋
            </p>
          </div>
        ) : (
          <>
            {(hasMore || loadingOlder) && (
              <div className="flex justify-center mb-3">
                {loadingOlder ? (
                  <div className="w-5 h-5 border-2 border-brand border-t-transparent rounded-full animate-spin" />
                ) : (
                  <button
                    onClick={loadOlder}
                    className="text-[13px] font-medium px-3.5 py-1.5 rounded-full bg-panel/90 text-brand-text shadow-sm hover:bg-panel"
                  >
                    Load older messages
                  </button>
                )}
              </div>
            )}

            {messages.map((m) => {
              const label = dayLabel(m.createdAt);
              const showDay = label !== lastDay;
              lastDay = label;

              return (
                <div key={m._id}>
                  {showDay && (
                    <div className="flex justify-center my-3">
                      <span className="text-xs font-medium px-3 py-1 rounded-full bg-panel/90 text-ink-2 shadow-sm">
                        {label}
                      </span>
                    </div>
                  )}
                  <Message
                    message={m}
                    own={m.sender === myId}
                    myId={myId}
                    peerName={peer.username}
                    highlighted={highlightId === m._id}
                    onMenu={openMenu}
                    onRetry={(failed) => postMessage(failed.content, failed._id, true, failed.replyTo)}
                    onReplyClick={scrollToMessage}
                    onReact={react}
                  />
                </div>
              );
            })}
          </>
        )}
        <div ref={bottomRef} />
      </div>

      {/* COMPOSER */}
      <div className="bg-panel-2 border-t border-line flex-shrink-0 pb-safe">
        {(replyingTo || editing) && (
          <div className="flex items-center gap-3 px-4 pt-2.5">
            <div className="flex-1 min-w-0 border-l-4 border-brand bg-panel-2 rounded-lg px-3 py-1.5">
              <div className="text-xs font-semibold text-brand-text">
                {editing ? "Editing message" : `Replying to ${replyAuthor}`}
              </div>
              <div className="text-xs text-ink-2 truncate">
                {(editing ?? replyingTo)!.deleted ? "🚫 This message was deleted" : (editing ?? replyingTo)!.content}
              </div>
            </div>
            <button
              onClick={cancelComposerMode}
              aria-label={editing ? "Cancel editing" : "Cancel reply"}
              className="p-1.5 rounded-full text-ink-3 hover:bg-wash"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        )}

        {composerError && (
          <p role="alert" className="px-5 pt-2 text-sm text-red-700 dark:text-red-300">
            {composerError}
          </p>
        )}

        <div className="px-3 py-3 md:px-4">
          <div className="flex items-end gap-2 bg-panel rounded-3xl pl-4 pr-1.5 py-1.5 shadow-sm border border-line focus-within:border-brand transition-colors">
            <textarea
              ref={inputRef}
              value={input}
              onChange={handleInputChange}
              onKeyDown={handleKeyDown}
              rows={1}
              maxLength={MAX_LENGTH}
              placeholder={editing ? "Edit your message" : "Type a message"}
              aria-label="Message"
              className="flex-1 resize-none outline-none bg-transparent text-ink text-base sm:text-[15px] leading-6 py-2 placeholder-ink-3 min-w-0 max-h-[132px]"
            />
            <button
              onClick={handleSend}
              disabled={!input.trim()}
              className="w-10 h-10 rounded-full bg-brand hover:bg-brand-hover disabled:bg-ink-3/40 flex items-center justify-center transition-colors flex-shrink-0"
              aria-label={editing ? "Save edit" : "Send message"}
            >
              {editing ? (
                <svg className="w-4 h-4 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                </svg>
              ) : (
                <svg className="w-4 h-4 text-white" fill="currentColor" viewBox="0 0 24 24">
                  <path d="M2.01 21L23 12 2.01 3 2 10l15 2-15 2z" />
                </svg>
              )}
            </button>
          </div>
        </div>
      </div>

      {menu && (
        <MessageMenu
          anchor={menu.anchor}
          myReaction={menu.message.reactions.find((r) => r.userId === myId)?.emoji ?? null}
          canReply={!menu.message.deleted && !menu.message.failed && !menu.message.pending}
          canReact={!menu.message.deleted && !menu.message.failed && !menu.message.pending}
          canCopy={!menu.message.deleted}
          canEdit={menu.canEdit}
          onClose={closeMenu}
          onReact={(emoji) => {
            react(menu.message, emoji);
            setMenu(null);
          }}
          onReply={() => startReply(menu.message)}
          onCopy={() => {
            navigator.clipboard?.writeText(menu.message.content).catch(() => {});
            setMenu(null);
          }}
          onEdit={() => startEdit(menu.message)}
          onDelete={() => openDelete(menu.message)}
        />
      )}

      {showInfo && <UserInfo user={peer} onClose={() => setShowInfo(false)} onGone={onBack} />}

      {deleteTarget && (
        <DeleteMessageDialog
          message={deleteTarget}
          own={deleteTarget.sender === myId}
          busy={deleting}
          error={deleteError}
          onClose={() => setDeleteTarget(null)}
          onConfirm={confirmDelete}
        />
      )}
    </div>
  );
};

export default ChatBox;
