import { useState } from "react";
import { API_BASE_URL } from "../config";
import type { AvatarUser } from "../types";

const COLORS = [
  "bg-emerald-500", "bg-blue-500", "bg-purple-500", "bg-orange-500",
  "bg-pink-500", "bg-teal-500", "bg-rose-500", "bg-indigo-500",
];

/** Same user → same colour everywhere in the app. */
export const avatarColor = (id?: string): string => {
  let h = 0;
  for (const ch of String(id || "")) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return COLORS[h % COLORS.length];
};

export const avatarUrl = (user: AvatarUser): string | null =>
  user._id && user.avatarVersion ? `${API_BASE_URL}/api/users/${user._id}/avatar?v=${user.avatarVersion}` : null;

const SIZES = {
  sm: "w-8 h-8 text-xs",
  md: "w-11 h-11 text-sm",
  lg: "w-16 h-16 text-2xl",
  xl: "w-28 h-28 text-5xl",
} as const;

interface AvatarProps {
  user: AvatarUser | null | undefined;
  size?: keyof typeof SIZES;
  showStatus?: boolean;
  className?: string;
}

const Avatar = ({ user, size = "md", showStatus = false, className = "" }: AvatarProps) => {
  // if the picture fails to load we fall back to the letter circle
  const [brokenSrc, setBrokenSrc] = useState<string | null>(null);
  const src = user ? avatarUrl(user) : null;
  const showImage = !!src && brokenSrc !== src;

  return (
    <div className={`relative flex-shrink-0 ${className}`}>
      {showImage ? (
        <img
          src={src}
          alt=""
          onError={() => setBrokenSrc(src)}
          className={`${SIZES[size]} rounded-full object-cover select-none bg-gray-200 dark:bg-gray-700`}
        />
      ) : (
        <div
          className={`${SIZES[size]} ${avatarColor(user?._id)} rounded-full flex items-center justify-center font-bold text-white select-none`}
        >
          {user?.username?.charAt(0)?.toUpperCase() || "U"}
        </div>
      )}
      {showStatus && user?.isOnline && (
        <span className="absolute bottom-0 right-0 w-3 h-3 rounded-full bg-emerald-400 border-2 border-white dark:border-gray-900" />
      )}
    </div>
  );
};

export default Avatar;
