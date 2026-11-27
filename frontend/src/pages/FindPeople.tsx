import { useCallback, useEffect, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import api, { isCanceled } from "../api";
import { socket } from "../socket";
import Avatar from "../components/Avatar";
import { EmptyState, PersonActions, SectionLabel, Skeleton, rowBase } from "../components/people";
import { usePersonActions } from "../hooks/usePersonActions";
import type { ListUser, Relation } from "../types";

const PAGE_SIZE = 30;

interface Page {
  /** the search text this list belongs to (so an old response can never overwrite a newer search) */
  key: string | null;
  items: ListUser[];
  hasMore: boolean;
  error: boolean;
}

/**
 * Separate page opened by the green floating button in the chat list:
 * everyone you are not connected with yet, with search and a Connect button for each.
 */
const FindPeople = () => {
  const navigate = useNavigate();
  const location = useLocation();

  const [search, setSearch] = useState("");
  const [page, setPage] = useState<Page>({ key: null, items: [], hasMore: false, error: false });
  const [refreshTick, setRefreshTick] = useState(0);
  const [loadingMore, setLoadingMore] = useState(false);

  const term = search.trim();
  const loading = page.key !== term;

  const fetchPage = useCallback(async (searchText: string, skip: number, signal?: AbortSignal) => {
    const { data } = await api.get<ListUser[]>("/api/users", {
      // ask for one extra person: if it comes back there is another page
      params: { search: searchText || undefined, filter: "not_connected", limit: PAGE_SIZE + 1, skip },
      signal,
    });
    return { items: data.slice(0, PAGE_SIZE), hasMore: data.length > PAGE_SIZE };
  }, []);

  // first page (debounced while typing, stale responses are cancelled)
  useEffect(() => {
    const controller = new AbortController();
    const timer = setTimeout(
      async () => {
        try {
          const first = await fetchPage(term, 0, controller.signal);
          setPage({ key: term, ...first, error: false });
        } catch (err) {
          if (isCanceled(err)) return;
          setPage({ key: term, items: [], hasMore: false, error: true });
        }
      },
      term ? 300 : 0
    );
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [term, refreshTick, fetchPage]);

  // realtime: someone accepted / sent a request / blocked, or went online
  useEffect(() => {
    const reload = () => setRefreshTick((t) => t + 1);
    const onPresence = ({ userId, isOnline, lastSeen }: { userId: string; isOnline: boolean; lastSeen: string }) =>
      setPage((prev) => ({ ...prev, items: prev.items.map((u) => (u._id === userId ? { ...u, isOnline, lastSeen } : u)) }));

    socket.on("request_received", reload);
    socket.on("request_accepted", reload);
    socket.on("request_rejected", reload);
    socket.on("connection_removed", reload);
    socket.on("connect", reload);
    socket.on("presence", onPresence);
    return () => {
      socket.off("request_received", reload);
      socket.off("request_accepted", reload);
      socket.off("request_rejected", reload);
      socket.off("connection_removed", reload);
      socket.off("connect", reload);
      socket.off("presence", onPresence);
    };
  }, []);

  const { busyId, notice, setNotice, actions } = usePersonActions({
    onSuccess: (id, next: Relation | "removed") =>
      setPage((prev) => ({
        ...prev,
        items: prev.items
          .map((u) => (u._id === id && next !== "removed" ? { ...u, status: next } : u))
          // once connected (or blocked) a person no longer belongs on this page
          .filter((u) => !(u._id === id && (next === "removed" || next === "connected"))),
      })),
    onError: () => setRefreshTick((t) => t + 1),
  });

  const loadMore = async () => {
    if (loadingMore) return;
    setLoadingMore(true);
    try {
      const next = await fetchPage(term, page.items.length);
      setPage((prev) =>
        prev.key !== term
          ? prev
          : {
              ...prev,
              items: [...prev.items, ...next.items.filter((n) => !prev.items.some((p) => p._id === n._id))],
              hasMore: next.hasMore,
            }
      );
    } catch {
      setNotice("Could not load more people. Please try again.");
    } finally {
      setLoadingMore(false);
    }
  };

  // arrived here from the chat list → go back there; opened directly → go to the chat list
  const goBack = () => (location.key !== "default" ? navigate(-1) : navigate("/", { replace: true }));

  return (
    <div className="h-dvh flex flex-col bg-app">
      <header className="flex-shrink-0 bg-bar text-white pt-safe shadow-md dark:border-b dark:border-line">
        <div className="h-14 flex items-center gap-1 px-2">
        <button onClick={goBack} aria-label="Back to chats" className="p-2 rounded-full hover:bg-white/10 active:bg-white/20 transition-colors">
          <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
          </svg>
        </button>
        <div className="min-w-0">
          <h1 className="text-lg font-semibold leading-tight">Find people</h1>
          <p className="text-[13px] text-white/85 leading-tight">People you can connect with</p>
        </div>
        </div>
      </header>

      <main className="flex-1 min-h-0 flex justify-center md:p-4">
        <div className="w-full max-w-xl flex flex-col min-h-0 bg-panel md:rounded-2xl md:shadow md:overflow-hidden">
          <div className="px-3 pt-3 pb-2 bg-panel-2 border-b border-line flex-shrink-0">
            <div className="flex items-center gap-2 bg-panel-2 border border-line rounded-full px-4 py-2 shadow-sm focus-within:border-brand focus-within:ring-2 focus-within:ring-brand/25 transition">
              <svg className="w-4 h-4 text-ink-3 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
              </svg>
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search name, email or phone…"
                aria-label="Search non-connected users"
                autoFocus
                className="flex-1 text-base sm:text-[15px] bg-transparent outline-none text-ink placeholder-ink-3 min-w-0"
              />
              {search && (
                <button onClick={() => setSearch("")} aria-label="Clear search" className="text-ink-3 hover:text-ink">
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              )}
            </div>
          </div>

          {notice && (
            <div className="px-4 py-2.5 text-sm text-red-700 dark:text-red-300 bg-red-50 dark:bg-red-900/20 border-b border-red-100 dark:border-red-900/30 flex items-center justify-between gap-2">
              <span>{notice}</span>
              <button onClick={() => setNotice("")} aria-label="Dismiss" className="font-bold">
                ×
              </button>
            </div>
          )}

          <div className="flex-1 overflow-y-auto pb-[calc(1.5rem+env(safe-area-inset-bottom,0px))]">
            {loading ? (
              <Skeleton />
            ) : page.error ? (
              <EmptyState
                title="Couldn't load users"
                hint="Check your connection and try again."
                action={
                  <button onClick={() => setRefreshTick((t) => t + 1)} className="mt-3 text-xs font-medium text-brand-text hover:underline">
                    Retry
                  </button>
                }
              />
            ) : page.items.length === 0 ? (
              <EmptyState
                title={term ? "No users found" : "You're connected with everyone 🎉"}
                hint={term ? "Try a different name, email or phone number." : "There is nobody left to connect with right now."}
              />
            ) : (
              <div className="py-1">
                <SectionLabel count={page.items.length}>{page.hasMore ? "Not connected (more below)" : "Not connected"}</SectionLabel>
                {page.items.map((u) => (
                  <div key={u._id} className={rowBase}>
                    <Avatar user={u} showStatus />
                    <div className="flex-1 min-w-0">
                      <div className="text-[15px] font-semibold text-ink truncate">{u.username}</div>
                      <div className="text-sm text-ink-2 truncate mt-0.5">{u.email || u.phone || "—"}</div>
                    </div>
                    <div className="flex-shrink-0 max-w-[55%]">
                      <PersonActions user={u} busy={busyId === u._id} {...actions} />
                    </div>
                  </div>
                ))}

                {page.hasMore && (
                  <div className="flex justify-center py-3">
                    <button
                      onClick={loadMore}
                      disabled={loadingMore}
                      className="text-sm font-medium px-5 py-2 rounded-full border border-line text-brand-text hover:bg-brand-soft disabled:opacity-60"
                    >
                      {loadingMore ? "Loading…" : "Show more"}
                    </button>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </main>
    </div>
  );
};

export default FindPeople;
