import { useEffect, useState } from "react";
import api, { getErrorMessage } from "../api";
import Avatar from "./Avatar";
import type { BlockedUser } from "../types";

/** List of people you blocked, with an Unblock button for each. */
const BlockedUsersModal = ({ onClose }: { onClose: () => void }) => {
  const [users, setUsers] = useState<BlockedUser[] | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    api
      .get<BlockedUser[]>("/api/users/blocked")
      .then(({ data }) => setUsers(data))
      .catch((err) => {
        setUsers([]);
        setError(getErrorMessage(err, "Could not load blocked users"));
      });
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const unblock = async (user: BlockedUser) => {
    setBusyId(user._id);
    setError("");
    try {
      await api.delete(`/api/users/block/${user._id}`);
      setUsers((prev) => prev && prev.filter((u) => u._id !== user._id));
    } catch (err) {
      setError(getErrorMessage(err, "Could not unblock. Please try again."));
    } finally {
      setBusyId(null);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4" onClick={onClose} role="presentation">
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Blocked users"
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-sm bg-white dark:bg-gray-800 rounded-2xl shadow-2xl overflow-hidden"
      >
        <div className="flex items-center justify-between px-5 py-4 border-b dark:border-gray-700">
          <h2 className="font-semibold text-gray-900 dark:text-white">Blocked users</h2>
          <button onClick={onClose} aria-label="Close" className="p-1 rounded-full text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-700">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {error && (
          <p role="alert" className="mx-5 mt-3 text-xs text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-900/20 rounded-lg px-3 py-2">
            {error}
          </p>
        )}

        <div className="max-h-80 overflow-y-auto py-2">
          {users === null ? (
            <p className="text-center text-sm text-gray-400 py-8">Loading…</p>
          ) : users.length === 0 ? (
            <p className="text-center text-sm text-gray-500 dark:text-gray-400 py-8 px-6">You haven't blocked anyone.</p>
          ) : (
            users.map((u) => (
              <div key={u._id} className="flex items-center gap-3 px-5 py-2.5">
                <Avatar user={u} />
                <span className="flex-1 min-w-0 truncate text-sm font-medium text-gray-900 dark:text-gray-100">{u.username}</span>
                <button
                  onClick={() => unblock(u)}
                  disabled={busyId === u._id}
                  className="text-xs font-medium px-3 py-1.5 rounded-full bg-emerald-600 hover:bg-emerald-700 text-white disabled:opacity-60"
                >
                  {busyId === u._id ? "…" : "Unblock"}
                </button>
              </div>
            ))
          )}
        </div>

        <p className="px-5 py-3 text-xs text-gray-400 dark:text-gray-500 border-t dark:border-gray-700">
          Unblocking doesn't reconnect you — you'd both need to send a new request.
        </p>
      </div>
    </div>
  );
};

export default BlockedUsersModal;
