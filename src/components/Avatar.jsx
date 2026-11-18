const COLORS = [
    "bg-emerald-500", "bg-blue-500", "bg-purple-500", "bg-orange-500",
    "bg-pink-500", "bg-teal-500", "bg-rose-500", "bg-indigo-500",
];

/** Same user → same colour everywhere in the app. */
export const avatarColor = (id) => {
    let h = 0;
    for (const ch of String(id || "")) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
    return COLORS[h % COLORS.length];
};

const SIZES = {
    sm: "w-8 h-8 text-xs",
    md: "w-11 h-11 text-sm",
    lg: "w-16 h-16 text-2xl",
};

const Avatar = ({ user, size = "md", showStatus = false }) => (
    <div className="relative flex-shrink-0">
        <div
            className={`${SIZES[size]} ${avatarColor(user?._id)} rounded-full flex items-center justify-center font-bold text-white select-none`}
        >
            {user?.username?.charAt(0)?.toUpperCase() || "U"}
        </div>
        {showStatus && user?.isOnline && (
            <span className="absolute bottom-0 right-0 w-3 h-3 rounded-full bg-emerald-400 border-2 border-white dark:border-gray-900" />
        )}
    </div>
);

export default Avatar;
