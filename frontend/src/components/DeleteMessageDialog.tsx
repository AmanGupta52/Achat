import { useEffect } from "react";
import type { ChatMessage } from "../types";

interface Props {
  message: ChatMessage;
  own: boolean;
  busy: boolean;
  error: string;
  onClose: () => void;
  onConfirm: (scope: "me" | "everyone") => void;
}

/**
 * "Delete message?" dialog:
 *  - Delete for everyone → only for your own, already-sent messages
 *  - Delete for me       → removes it from your view only
 */
const DeleteMessageDialog = ({ message, own, busy, error, onClose, onConfirm }: Props) => {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && !busy && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [busy, onClose]);

  const canDeleteForEveryone = own && !message.failed && !message.deleted;

  return (
    <div
      className="absolute inset-0 z-30 bg-black/50 flex items-center justify-center p-4"
      onClick={() => !busy && onClose()}
      role="presentation"
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Delete message"
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-xs bg-panel rounded-2xl shadow-2xl p-5"
      >
        <h3 className="text-base font-semibold text-ink">Delete message?</h3>
        <p className="text-sm text-ink-2 mt-1.5">
          {canDeleteForEveryone
            ? "You can remove it for everyone in this chat, or just for yourself."
            : "This removes the message from your view only. The other person keeps their copy."}
        </p>

        {error && (
          <p role="alert" className="mt-3 text-sm text-red-700 dark:text-red-300 bg-red-50 dark:bg-red-900/20 rounded-lg px-3 py-2">
            {error}
          </p>
        )}

        <div className="mt-4 flex flex-col gap-2">
          {canDeleteForEveryone && (
            <button
              disabled={busy}
              onClick={() => onConfirm("everyone")}
              className="w-full py-3 rounded-full text-[15px] font-medium bg-red-600 hover:bg-red-700 text-white disabled:opacity-60 transition-colors"
            >
              {busy ? "Deleting…" : "Delete for everyone"}
            </button>
          )}
          <button
            disabled={busy}
            onClick={() => onConfirm("me")}
            className={`w-full py-3 rounded-full text-[15px] font-medium disabled:opacity-60 transition-colors
              ${canDeleteForEveryone
                ? "bg-red-50 hover:bg-red-100 dark:bg-red-900/30 dark:hover:bg-red-900/50 text-red-600 dark:text-red-400"
                : "bg-red-600 hover:bg-red-700 text-white"}`}
          >
            {busy && !canDeleteForEveryone ? "Deleting…" : "Delete for me"}
          </button>
          <button
            disabled={busy}
            onClick={onClose}
            className="w-full py-3 rounded-full text-[15px] font-medium text-ink-2 hover:bg-wash transition-colors"
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
};

export default DeleteMessageDialog;
