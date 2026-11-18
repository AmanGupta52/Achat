import Ticks from "./Ticks";
import { formatClock } from "../utils/time";

const Message = ({ message, own, onRetry, onDelete }) => {
    const text = typeof message?.content === "string" ? message.content : message?.content?.data || "";
    const deleted = !!message?.deleted;
    const bubbleBg = own ? "bg-emerald-100 dark:bg-emerald-800" : "bg-white dark:bg-gray-800";

    return (
        <div className={`flex mb-1.5 px-2 ${own ? "justify-end" : "justify-start"}`}>
            <div className="max-w-[80%] sm:max-w-[65%] flex flex-col items-end">
                <div
                    className={`group relative px-3 py-2 min-h-[2.6rem] rounded-2xl shadow-sm ${bubbleBg}
                        text-gray-900 dark:text-gray-100
                        ${own ? "rounded-tr-sm" : "rounded-tl-sm border border-gray-100 dark:border-gray-700/50"}
                        ${message?.failed ? "ring-1 ring-red-400" : ""}`}
                >
                    {/* delete menu — hover on desktop, always visible on touch screens */}
                    {!message?.pending && onDelete && (
                        <button
                            onClick={() => onDelete(message)}
                            aria-label="Message options"
                            title="Delete"
                            className={`absolute top-0.5 right-0.5 z-10 w-5 h-5 rounded-full ${bubbleBg} shadow-sm flex items-center justify-center
                                text-gray-500 hover:text-gray-800 dark:text-gray-400 dark:hover:text-white transition-opacity
                                opacity-0 group-hover:opacity-100 focus:opacity-100 [@media(hover:none)]:opacity-70`}
                        >
                            <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M19 9l-7 7-7-7" />
                            </svg>
                        </button>
                    )}

                    {deleted ? (
                        <p className="text-sm italic text-gray-500 dark:text-gray-300 flex items-center gap-1.5">
                            <svg className="w-3.5 h-3.5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <circle cx="12" cy="12" r="9" strokeWidth={2} />
                                <path strokeWidth={2} strokeLinecap="round" d="M5.6 5.6l12.8 12.8" />
                            </svg>
                            {own ? "You deleted this message" : "This message was deleted"}
                            <span className="inline-block w-16" />
                        </p>
                    ) : (
                        <p className="text-sm leading-relaxed break-words whitespace-pre-wrap [overflow-wrap:anywhere]">
                            {text}
                            {/* invisible spacer so the time never overlaps the last line */}
                            <span className="inline-block w-20" />
                        </p>
                    )}

                    <div className="absolute bottom-1 right-2 flex items-center gap-1">
                        <span className="text-[10px] leading-none text-gray-500 dark:text-gray-400 whitespace-nowrap">
                            {formatClock(message?.createdAt)}
                        </span>
                        {own && !deleted && <Ticks message={message} />}
                    </div>
                </div>

                {message?.failed && (
                    <button
                        onClick={() => onRetry?.(message)}
                        className="mt-1 text-xs text-red-500 hover:text-red-600 font-medium"
                    >
                        Not sent — tap to retry
                    </button>
                )}
            </div>
        </div>
    );
};

export default Message;
