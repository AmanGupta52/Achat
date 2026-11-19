import { useEffect, useState } from "react";
import api, { getErrorMessage } from "../api";
import Avatar from "./Avatar";
import { formatJoined, formatLastSeen } from "../utils/time";
import type { ListUser } from "../types";

const Row = ({ label, value }: { label: string; value?: string | null }) => (
  <div className="px-5 py-3">
    <div className="text-[11px] uppercase tracking-wider text-gray-400 dark:text-gray-500">{label}</div>
    <div className="text-sm text-gray-900 dark:text-gray-100 mt-0.5 break-words">{value || "—"}</div>
  </div>
);

type Action = "disconnect" | "block";

interface Props {
  user: ListUser;
  onClose: () => void;
  /** called after the user was disconnected or blocked (the chat can no longer stay open) */
  onGone: () => void;
}

const COPY: Record<Action, { button: string; confirm: string; busy: string; done: string }> = {
  disconnect: {
    button: "Disconnect",
    confirm: "You won't be able to message each other until you connect again. Your chat history is kept.",
    busy: "Disconnecting…",
    done: "Yes, disconnect",
  },
  block: {
    button: "Block",
    confirm:
      "They will be disconnected and won't be able to find you, send you requests or message you. They won't be notified. You can unblock them any time from the menu.",
    busy: "Blocking…",
    done: "Yes, block",
  },
};

/**
 * Slide-over "Contact info" panel, opened by clicking the name in the chat header.
 * Contains Disconnect and Block (each with a confirmation step).
 */
const UserInfo = ({ user, onClose, onGone }: Props) => {
  const [confirming, setConfirming] = useState<Action | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && !busy && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [busy, onClose]);

  const perform = async (action: Action) => {
    setBusy(true);
    setError("");
    try {
      if (action === "disconnect") await api.delete(`/api/users/connection/${user._id}`);
      else await api.post(`/api/users/block/${user._id}`);
      onGone();
    } catch (err) {
      setError(getErrorMessage(err, "That didn't work. Please try again."));
      setBusy(false);
    }
  };

  return (
    <div className="absolute inset-0 z-20 flex justify-end bg-black/40" onClick={() => !busy && onClose()} role="presentation">
      <aside
        role="dialog"
        aria-label="Contact info"
        onClick={(e) => e.stopPropagation()}
        className="w-full sm:w-80 h-full bg-white dark:bg-gray-900 shadow-2xl flex flex-col"
      >
        <div className="h-16 px-3 flex items-center gap-3 bg-gray-50 dark:bg-gray-800 border-b dark:border-gray-700 flex-shrink-0">
          <button
            onClick={onClose}
            aria-label="Close contact info"
            className="p-2 rounded-full hover:bg-gray-200 dark:hover:bg-gray-700 text-gray-600 dark:text-gray-300"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
          <h2 className="font-semibold text-gray-900 dark:text-white">Contact info</h2>
        </div>

        <div className="flex-1 overflow-y-auto">
          <div className="flex flex-col items-center py-7 px-4 border-b dark:border-gray-800">
            <Avatar user={user} size="xl" />
            <h3 className="mt-3 text-xl font-semibold text-gray-900 dark:text-white text-center break-words max-w-full">
              {user.username}
            </h3>
            <p className={`text-sm mt-0.5 ${user.isOnline ? "text-emerald-600 dark:text-emerald-400" : "text-gray-500 dark:text-gray-400"}`}>
              {user.isOnline ? "online" : formatLastSeen(user.lastSeen)}
            </p>
            <span className="mt-3 inline-flex items-center gap-1 text-xs font-medium text-emerald-600 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-900/30 px-2.5 py-1 rounded-full">
              <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 20 20">
                <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
              </svg>
              Connected
            </span>
          </div>

          <div className="divide-y divide-gray-100 dark:divide-gray-800">
            <Row label="About" value={user.about} />
            <Row label="Email" value={user.email} />
            <Row label="Phone" value={user.phone} />
            <Row label="Member since" value={formatJoined(user.joinedAt)} />
          </div>

          <div className="p-5 border-t dark:border-gray-800 space-y-3">
            {error && (
              <p role="alert" className="text-xs text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-900/20 rounded-lg px-3 py-2">
                {error}
              </p>
            )}

            {confirming ? (
              <div className="space-y-3">
                <p className="text-sm text-gray-700 dark:text-gray-300">
                  {confirming === "block" ? "Block" : "Disconnect from"} <b>{user.username}</b>? {COPY[confirming].confirm}
                </p>
                <div className="flex gap-2">
                  <button
                    onClick={() => { setConfirming(null); setError(""); }}
                    disabled={busy}
                    className="flex-1 py-2.5 rounded-full text-sm font-medium text-gray-600 dark:text-gray-300 bg-gray-100 dark:bg-gray-800 hover:bg-gray-200 dark:hover:bg-gray-700 disabled:opacity-60"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={() => perform(confirming)}
                    disabled={busy}
                    className="flex-1 py-2.5 rounded-full text-sm font-medium bg-red-600 hover:bg-red-700 text-white disabled:opacity-60"
                  >
                    {busy ? COPY[confirming].busy : COPY[confirming].done}
                  </button>
                </div>
              </div>
            ) : (
              <>
                <button
                  onClick={() => setConfirming("disconnect")}
                  className="w-full flex items-center justify-center gap-2 py-2.5 rounded-full text-sm font-medium text-red-600 dark:text-red-400 border border-red-200 dark:border-red-900/50 hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7a4 4 0 11-8 0 4 4 0 018 0zM9 14a6 6 0 00-6 6v1h12v-1a6 6 0 00-6-6zM21 12h-6" />
                  </svg>
                  Disconnect
                </button>
                <button
                  onClick={() => setConfirming("block")}
                  className="w-full flex items-center justify-center gap-2 py-2.5 rounded-full text-sm font-medium bg-red-600 hover:bg-red-700 text-white transition-colors"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <circle cx="12" cy="12" r="9" strokeWidth={2} />
                    <path strokeWidth={2} strokeLinecap="round" d="M5.6 5.6l12.8 12.8" />
                  </svg>
                  Block
                </button>
              </>
            )}
          </div>
        </div>
      </aside>
    </div>
  );
};

export default UserInfo;
