import type { ChatMessage } from "../types";

/** WhatsApp-style delivery ticks. */
const Ticks = ({ message }: { message: Pick<ChatMessage, "failed" | "pending" | "delivered" | "read"> }) => {
  if (message.failed) {
    return <span className="text-red-500 text-xs font-bold leading-none">!</span>;
  }

  if (message.pending) {
    return (
      <svg className="w-3 h-3 text-gray-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5}>
        <circle cx="12" cy="12" r="9" />
        <path strokeLinecap="round" d="M12 7v5l3 2" />
      </svg>
    );
  }

  if (message.delivered || message.read) {
    return (
      <svg
        className={`w-4 h-3.5 ${message.read ? "text-blue-500 dark:text-blue-400" : "text-gray-400 dark:text-gray-500"}`}
        viewBox="0 0 18 11"
        fill="currentColor"
      >
        <path d="M15.01.653a.75.75 0 0 1 .025 1.06l-6.294 6.677a.75.75 0 0 1-1.072.018L5.04 5.63a.75.75 0 1 1 1.06-1.06l2.105 2.105L13.95.678a.75.75 0 0 1 1.061-.025z" />
        <path d="M11.071.653a.75.75 0 0 1 .025 1.06L4.801 8.39a.75.75 0 0 1-1.072.018L1.1 5.63a.75.75 0 0 1 1.06-1.06l2.105 2.105L10.01.678a.75.75 0 0 1 1.061-.025z" />
      </svg>
    );
  }

  return (
    <svg className="w-3.5 h-3.5 text-gray-400 dark:text-gray-500" viewBox="0 0 16 11" fill="currentColor">
      <path d="M11.071.653a.75.75 0 0 1 .025 1.06L4.801 8.39a.75.75 0 0 1-1.072.018L1.1 5.63a.75.75 0 0 1 1.06-1.06l2.105 2.105L10.01.678a.75.75 0 0 1 1.061-.025z" />
    </svg>
  );
};

export default Ticks;
