import Ticks from "./Ticks";
import { formatClock } from "../utils/time";

const Message = ({ message, own, onRetry }) => {
    const text = typeof message?.content === "string" ? message.content : message?.content?.data || "";

    return (
        <div className={`flex mb-1.5 px-2 ${own ? "justify-end" : "justify-start"}`}>
            <div className="max-w-[80%] sm:max-w-[65%] flex flex-col items-end">
                <div
                    className={`relative px-3 py-2 rounded-2xl shadow-sm
                        ${own
                            ? "bg-emerald-100 dark:bg-emerald-800 text-gray-900 dark:text-gray-100 rounded-tr-sm"
                            : "bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 rounded-tl-sm border border-gray-100 dark:border-gray-700/50"
                        }
                        ${message?.failed ? "ring-1 ring-red-400" : ""}`}
                >
                    <p className="text-sm leading-relaxed break-words whitespace-pre-wrap [overflow-wrap:anywhere]">
                        {text}
                        {/* invisible spacer so the time never overlaps the last line */}
                        <span className="inline-block w-20" />
                    </p>

                    <div className="absolute bottom-1 right-2 flex items-center gap-1">
                        <span className="text-[10px] leading-none text-gray-500 dark:text-gray-400 whitespace-nowrap">
                            {formatClock(message?.createdAt)}
                        </span>
                        {own && <Ticks message={message} />}
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
