import Ticks from "./Ticks";
import { formatClock } from "../utils/time";
import type { ChatMessage } from "../types";

interface MessageProps {
  message: ChatMessage;
  own: boolean;
  myId: string;
  peerName: string;
  highlighted: boolean;
  onMenu: (message: ChatMessage, anchor: DOMRect) => void;
  onRetry: (message: ChatMessage) => void;
  onReplyClick: (messageId: string) => void;
  onReact: (message: ChatMessage, emoji: string) => void;
}

const Message = ({ message, own, myId, peerName, highlighted, onMenu, onRetry, onReplyClick, onReact }: MessageProps) => {
  const deleted = message.deleted;
  const bubbleBg = own ? "bg-bubble-out" : "bg-bubble-in";

  // 👍 ×2  ❤️ ×1 …
  const groups = Object.values(
    message.reactions.reduce<Record<string, { emoji: string; count: number; mine: boolean }>>((acc, r) => {
      const g = (acc[r.emoji] ||= { emoji: r.emoji, count: 0, mine: false });
      g.count += 1;
      if (r.userId === myId) g.mine = true;
      return acc;
    }, {})
  );

  return (
    <div id={`msg-${message._id}`} className={`flex mb-1.5 px-2 ${own ? "justify-end" : "justify-start"}`}>
      <div className={`max-w-[85%] sm:max-w-[70%] lg:max-w-[60%] flex flex-col ${own ? "items-end" : "items-start"}`}>
        <div
          className={`group relative px-3 py-2 min-h-[2.6rem] rounded-2xl shadow-sm ${bubbleBg}
            text-ink transition-shadow duration-300
            ${own ? "rounded-tr-sm" : "rounded-tl-sm border border-line"}
            ${message.failed ? "ring-1 ring-red-400" : ""}
            ${highlighted ? "ring-2 ring-yellow-400 shadow-lg shadow-yellow-300/40" : ""}`}
        >
          {/* options menu — hover on desktop, always visible on touch screens */}
          {!message.pending && (
            <button
              onClick={(e) => onMenu(message, e.currentTarget.getBoundingClientRect())}
              aria-label="Message options"
              title="Options"
              className={`absolute top-1 right-1 z-10 w-6 h-6 rounded-full ${bubbleBg} shadow-sm flex items-center justify-center
                text-ink-2 hover:text-ink transition-opacity
                opacity-0 group-hover:opacity-100 focus:opacity-100 [@media(hover:none)]:opacity-70`}
            >
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M19 9l-7 7-7-7" />
              </svg>
            </button>
          )}

          {/* quoted message */}
          {message.replyTo && !deleted && (
            <button
              onClick={() => onReplyClick(message.replyTo!._id)}
              className="block w-full text-left mb-1.5 rounded-lg border-l-4 border-brand bg-black/5 dark:bg-white/10 px-2.5 py-1.5 hover:bg-black/10 dark:hover:bg-white/15 transition-colors"
            >
              <span className="block text-xs font-semibold text-brand-text">
                {message.replyTo.sender === myId ? "You" : peerName}
              </span>
              <span className="block text-[13px] text-ink-2 truncate">
                {message.replyTo.deleted ? "🚫 This message was deleted" : message.replyTo.content}
              </span>
            </button>
          )}

          {deleted ? (
            <p className="text-sm italic text-ink-2 flex items-center gap-1.5">
              <svg className="w-3.5 h-3.5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                <circle cx="12" cy="12" r="9" strokeWidth={2} />
                <path strokeWidth={2} strokeLinecap="round" d="M5.6 5.6l12.8 12.8" />
              </svg>
              {own ? "You deleted this message" : "This message was deleted"}
              <span className="inline-block w-14" />
            </p>
          ) : (
            <p className="text-[15px] leading-relaxed break-words whitespace-pre-wrap [overflow-wrap:anywhere]">
              {message.content}
              {/* invisible spacer so the time never overlaps the last line */}
              <span className={`inline-block ${message.edited ? "w-28" : own ? "w-20" : "w-14"}`} />
            </p>
          )}

          <div className="absolute bottom-1 right-2.5 flex items-center gap-1">
            {message.edited && !deleted && <span className="text-[11px] leading-none text-ink-2 italic">edited</span>}
            <span className="text-[11px] leading-none text-ink-2 whitespace-nowrap">{formatClock(message.createdAt)}</span>
            {own && !deleted && <Ticks message={message} />}
          </div>
        </div>

        {groups.length > 0 && (
          <div className="flex gap-1 -mt-1.5 mb-1 px-1.5 relative z-[1]">
            {groups.map((g) => (
              <button
                key={g.emoji}
                onClick={() => onReact(message, g.emoji)}
                aria-label={`${g.emoji} reaction${g.mine ? " (yours — tap to remove)" : ""}`}
                className={`flex items-center gap-0.5 text-sm px-1.5 py-0.5 rounded-full shadow-sm border transition-colors
                  ${g.mine ? "bg-brand-soft border-brand" : "bg-panel border-line"}`}
              >
                <span>{g.emoji}</span>
                {g.count > 1 && <span className="text-xs font-medium text-ink-2">{g.count}</span>}
              </button>
            ))}
          </div>
        )}

        {message.failed && (
          <button onClick={() => onRetry(message)} className="mt-1 text-sm text-red-700 dark:text-red-300 hover:underline font-semibold">
            Not sent — tap to retry
          </button>
        )}
      </div>
    </div>
  );
};

export default Message;
