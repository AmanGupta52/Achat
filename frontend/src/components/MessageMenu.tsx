import { useEffect, useRef, type ReactNode } from "react";
import { REACTION_EMOJIS } from "../types";

const MENU_WIDTH = 224;
const MENU_HEIGHT = 250; // generous estimate, used only to decide whether to open upwards

interface MessageMenuProps {
  anchor: DOMRect;
  myReaction: string | null;
  canReply: boolean;
  canReact: boolean;
  canCopy: boolean;
  canEdit: boolean;
  onClose: () => void;
  onReact: (emoji: string) => void;
  onReply: () => void;
  onCopy: () => void;
  onEdit: () => void;
  onDelete: () => void;
}

const Item = ({ children, onClick, danger = false }: { children: ReactNode; onClick: () => void; danger?: boolean }) => (
  <button
    onClick={onClick}
    className={`w-full flex items-center gap-3 px-4 py-3 text-[15px] text-left transition-colors
      ${danger
        ? "text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/30"
        : "text-ink hover:bg-wash"}`}
  >
    {children}
  </button>
);

const icon = (d: string) => (
  <svg className="w-4 h-4 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d={d} />
  </svg>
);

/** Pop-up opened by the ⌄ button of a message: quick reactions + Reply / Copy / Edit / Delete. */
const MessageMenu = ({
  anchor, myReaction, canReply, canReact, canCopy, canEdit,
  onClose, onReact, onReply, onCopy, onEdit, onDelete,
}: MessageMenuProps) => {
  const ref = useRef<HTMLDivElement>(null);

  // close on outside click, Escape, resize or scroll
  useEffect(() => {
    const onDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose();
    };
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();

    document.addEventListener("mousedown", onDown);
    window.addEventListener("keydown", onKey);
    window.addEventListener("resize", onClose);
    window.addEventListener("scroll", onClose, true);
    return () => {
      document.removeEventListener("mousedown", onDown);
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("resize", onClose);
      window.removeEventListener("scroll", onClose, true);
    };
  }, [onClose]);

  const left = Math.min(Math.max(8, anchor.right - MENU_WIDTH), window.innerWidth - MENU_WIDTH - 8);
  const opensUp = anchor.bottom + MENU_HEIGHT > window.innerHeight && anchor.top > MENU_HEIGHT;
  const top = opensUp ? anchor.top - 6 : anchor.bottom + 6;

  return (
    <div
      ref={ref}
      role="menu"
      aria-label="Message options"
      style={{ position: "fixed", left, top, width: MENU_WIDTH, transform: opensUp ? "translateY(-100%)" : undefined }}
      className="z-40 rounded-xl shadow-xl bg-panel border border-line overflow-hidden"
    >
      {canReact && (
        <div className="flex justify-between px-2.5 py-2 border-b border-line">
          {REACTION_EMOJIS.map((emoji) => (
            <button
              key={emoji}
              onClick={() => onReact(emoji)}
              aria-label={`React ${emoji}`}
              className={`w-9 h-9 rounded-full text-xl flex items-center justify-center transition-transform hover:scale-125
                ${myReaction === emoji ? "bg-brand-soft" : ""}`}
            >
              {emoji}
            </button>
          ))}
        </div>
      )}

      <div className="py-1">
        {canReply && <Item onClick={onReply}>{icon("M3 10h10a8 8 0 018 8v2M3 10l6 6m-6-6l6-6")}Reply</Item>}
        {canCopy && (
          <Item onClick={onCopy}>
            {icon("M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z")}
            Copy
          </Item>
        )}
        {canEdit && (
          <Item onClick={onEdit}>
            {icon("M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.4-9.4a2 2 0 112.8 2.8L11.8 15H9v-2.8l8.6-8.6z")}
            Edit
          </Item>
        )}
        <Item onClick={onDelete} danger>
          {icon("M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16")}
          Delete
        </Item>
      </div>
    </div>
  );
};

export default MessageMenu;
