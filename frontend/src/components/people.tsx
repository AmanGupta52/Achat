import type { ReactNode } from "react";
import type { ListUser } from "../types";

/** Building blocks shared by the chat list (search results, requests) and the "Non-connected users" page. */

/* ───────────────────────── small presentational pieces ───────────────────────── */

export const Skeleton = () => (
  <div className="p-3 space-y-1">
    {[1, 2, 3, 4, 5].map((i) => (
      <div key={i} className="flex items-center gap-3 p-3 rounded-xl animate-pulse">
        <div className="w-11 h-11 rounded-full bg-gray-200 dark:bg-gray-700 flex-shrink-0" />
        <div className="flex-1 space-y-2">
          <div className="h-3 bg-gray-200 dark:bg-gray-700 rounded w-2/3" />
          <div className="h-2.5 bg-gray-100 dark:bg-gray-800 rounded w-1/2" />
        </div>
      </div>
    ))}
  </div>
);

export const EmptyState = ({ title, hint, action }: { title: string; hint?: string; action?: ReactNode }) => (
  <div className="flex flex-col items-center justify-center py-14 px-6 text-center">
    <div className="w-14 h-14 rounded-full bg-gray-100 dark:bg-gray-800 flex items-center justify-center mb-3">
      <svg className="w-7 h-7 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
          d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z" />
      </svg>
    </div>
    <p className="text-sm font-medium text-gray-700 dark:text-gray-200">{title}</p>
    {hint && <p className="text-xs text-gray-400 dark:text-gray-500 mt-1 max-w-[220px]">{hint}</p>}
    {action}
  </div>
);

export const SectionLabel = ({ children, count }: { children: ReactNode; count?: number }) => (
  <div className="px-4 pt-3 pb-1 text-[11px] font-semibold uppercase tracking-wider text-gray-400 dark:text-gray-500 flex items-center gap-2">
    {children}
    {count !== undefined && (
      <span className="px-1.5 py-0.5 rounded-full bg-gray-100 dark:bg-gray-800 text-gray-500 dark:text-gray-400 normal-case tracking-normal">
        {count}
      </span>
    )}
  </div>
);

export const btn = "text-xs font-medium px-3 py-1.5 rounded-full transition-colors disabled:opacity-50 disabled:cursor-not-allowed";

export interface PersonActionsProps {
  user: ListUser;
  busy: boolean;
  onConnect: (u: ListUser) => void;
  onAccept: (u: ListUser) => void;
  onReject: (u: ListUser) => void;
  onCancel: (u: ListUser) => void;
  onBlock: (u: ListUser) => void;
}

/** Right-hand action area of a "person" row, depending on the relationship. */
export const PersonActions = ({ user, busy, onConnect, onAccept, onReject, onCancel, onBlock }: PersonActionsProps) => {
  switch (user.status) {
    case "connected":
      return (
        <span className="flex items-center gap-1 text-xs font-medium text-emerald-600 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-900/30 px-2.5 py-1 rounded-full">
          <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 20 20">
            <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
          </svg>
          Connected
        </span>
      );
    case "sent":
      return (
        <button
          disabled={busy}
          onClick={() => onCancel(user)}
          title="Cancel request"
          className={`${btn} bg-gray-100 dark:bg-gray-700/60 text-gray-600 dark:text-gray-300 hover:bg-red-50 hover:text-red-600 dark:hover:bg-red-900/30 dark:hover:text-red-400`}
        >
          Requested ✕
        </button>
      );
    case "received":
      return (
        <div className="flex flex-wrap justify-end gap-1">
          <button disabled={busy} onClick={() => onAccept(user)} className={`${btn} bg-emerald-600 hover:bg-emerald-700 text-white`}>
            Accept
          </button>
          <button disabled={busy} onClick={() => onReject(user)} className={`${btn} bg-red-100 hover:bg-red-200 dark:bg-red-900/40 dark:hover:bg-red-800/60 text-red-600 dark:text-red-400`}>
            Reject
          </button>
          <button
            disabled={busy}
            onClick={() => onBlock(user)}
            title="Block this user"
            className={`${btn} bg-gray-100 hover:bg-gray-200 dark:bg-gray-700 dark:hover:bg-gray-600 text-gray-600 dark:text-gray-300`}
          >
            Block
          </button>
        </div>
      );
    default:
      return (
        <button disabled={busy} onClick={() => onConnect(user)} className={`${btn} bg-emerald-600 hover:bg-emerald-700 active:bg-emerald-800 text-white`}>
          {busy ? "..." : "Connect"}
        </button>
      );
  }
};

export const rowBase = "flex items-center gap-3 px-3 py-3 mx-1 rounded-xl transition-colors duration-100";
export const rowClickable = "cursor-pointer hover:bg-gray-100 dark:hover:bg-gray-800 active:bg-gray-200 dark:active:bg-gray-700";
