const Message = ({ message, own }) => {

    // ----------------------------
    // TEXT (robust extraction)
    // ----------------------------
    const getText = () => {
        if (!message) return "";
        if (typeof message.content === "string") return message.content;
        if (typeof message.content === "object") return message.content?.data || "";
        return "";
    };

    // ----------------------------
    // TIME FORMAT
    // ----------------------------
    const formatTime = (date) => {
        if (!date) return "";
        const d = new Date(date);
        if (isNaN(d.getTime())) return "";
        return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
    };

    // ----------------------------
    // TICK ICONS (SVG, like WhatsApp)
    // ----------------------------
    const SingleTick = () => (
        <svg className="w-3.5 h-3.5 text-gray-400 dark:text-gray-500" viewBox="0 0 16 11" fill="currentColor">
            <path d="M11.071.653a.75.75 0 0 1 .025 1.06L4.801 8.39a.75.75 0 0 1-1.072.018L1.1 5.63a.75.75 0 0 1 1.06-1.06l2.105 2.105L10.01.678a.75.75 0 0 1 1.061-.025z" />
        </svg>
    );

    const DoubleTick = ({ read }) => (
        <svg
            className={`w-4 h-3.5 ${read
                ? "text-blue-500 dark:text-blue-400"
                : "text-gray-400 dark:text-gray-500"
                }`}
            viewBox="0 0 18 11"
            fill="currentColor"
        >
            <path d="M15.01.653a.75.75 0 0 1 .025 1.06l-6.294 6.677a.75.75 0 0 1-1.072.018L5.04 5.63a.75.75 0 1 1 1.06-1.06l2.105 2.105L13.95.678a.75.75 0 0 1 1.061-.025z" />
            <path d="M11.071.653a.75.75 0 0 1 .025 1.06L4.801 8.39a.75.75 0 0 1-1.072.018L1.1 5.63a.75.75 0 0 1 1.06-1.06l2.105 2.105L10.01.678a.75.75 0 0 1 1.061-.025z" />
        </svg>
    );

    const renderTicks = () => {
        if (!own) return null;
        if (message?.read) return <DoubleTick read={true} />;
        if (message?.delivered) return <DoubleTick read={false} />;
        return <SingleTick />;
    };

    const text = getText();

    return (
        <div className={`flex mb-1.5 px-2 ${own ? "justify-end" : "justify-start"}`}>
            <div
                className={`
                    relative max-w-[75%] sm:max-w-[65%]
                    px-3 py-2 rounded-2xl shadow-sm
                    ${own
                        ? `bg-emerald-100 dark:bg-emerald-800
                           text-gray-900 dark:text-gray-100
                           rounded-tr-sm`
                        : `bg-white dark:bg-gray-800
                           text-gray-900 dark:text-gray-100
                           rounded-tl-sm
                           border border-gray-100 dark:border-gray-700/50`
                    }
                `}
            >
                {/* Message tail — own */}
                {own && (
                    <span className="absolute -right-[6px] top-0
                        border-t-[10px] border-t-emerald-100 dark:border-t-emerald-800
                        border-l-[8px] border-l-transparent
                        w-0 h-0" />
                )}

                {/* Message tail — other */}
                {!own && (
                    <span className="absolute -left-[6px] top-0
                        border-t-[10px] border-t-white dark:border-t-gray-800
                        border-r-[8px] border-r-transparent
                        w-0 h-0" />
                )}

                {/* Text */}
                <p className="text-sm leading-relaxed break-words whitespace-pre-wrap pr-1">
                    {text}
                </p>

                {/* Time + ticks */}
                <div className={`flex items-center gap-1 mt-0.5 float-right ml-2 -mb-0.5
                    ${own ? "justify-end" : "justify-start"}`}>
                    <span className="text-[10px] leading-none text-gray-400 dark:text-gray-400 whitespace-nowrap">
                        {formatTime(message?.createdAt)}
                    </span>
                    {renderTicks()}
                </div>

                {/* Clearfix for float */}
                <div className="clear-both" />
            </div>
        </div>
    );
};

export default Message;