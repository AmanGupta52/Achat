const Message = ({ message, own }) => {

    // ----------------------------
    // TEXT (robust extraction)
    // ----------------------------
    const getText = () => {
        if (!message) return "";

        // normal case (your backend sends string)
        if (typeof message.content === "string") {
            return message.content;
        }

        // fallback (in case encrypted object leaks)
        if (typeof message.content === "object") {
            return message.content?.data || "";
        }

        return "";
    };

    // ----------------------------
    // TIME FORMAT
    // ----------------------------
    const formatTime = (date) => {
        if (!date) return "";

        const d = new Date(date);
        if (isNaN(d.getTime())) return "";

        return d.toLocaleTimeString([], {
            hour: "2-digit",
            minute: "2-digit",
        });
    };

    // ----------------------------
    // ✅ TICK LOGIC
    // ----------------------------
    const renderTicks = () => {
        if (!own) return null;

        if (message?.read) {
            return (
                <span className="text-[10px] text-blue-500">
                    ✓✓
                </span>
            );
        }

        if (message?.delivered) {
            return (
                <span className="text-[10px] text-gray-500">
                    ✓✓
                </span>
            );
        }

        return (
            <span className="text-[10px] text-gray-400">
                ✓
            </span>
        );
    };

    return (
        <div className={`flex mb-2 ${own ? "justify-end" : "justify-start"}`}>
            <div
                className={`max-w-[70%] p-3 rounded-lg shadow-sm ${own
                    ? "bg-emerald-100 text-gray-800 dark:bg-emerald-700 dark:text-white"
                    : "bg-white text-gray-800 dark:bg-gray-800 dark:text-white"
                    }`}
            >
                <p className="text-sm break-words">
                    {getText()}
                </p>

                <div className="flex justify-end items-center gap-1 mt-1">
                    <span className="text-[10px] text-gray-400 dark:text-gray-300">
                        {formatTime(message?.createdAt)}
                    </span>

                    {renderTicks()}
                </div>
            </div>
        </div>
    );
};

export default Message;