type DateInput = string | number | Date | null | undefined;

const DAY = 24 * 60 * 60 * 1000;
const startOfDay = (d: Date): number => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();

const toDate = (value: DateInput): Date | null => {
  if (!value) return null;
  const d = new Date(value);
  return isNaN(d.getTime()) ? null : d;
};

const daysAgo = (d: Date): number => Math.round((startOfDay(new Date()) - startOfDay(d)) / DAY);

export const formatClock = (value: DateInput): string => {
  const d = toDate(value);
  return d ? d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) : "";
};

/** Label for the day dividers inside a chat: Today / Yesterday / 12 Mar 2025 */
export const dayLabel = (value: DateInput): string => {
  const d = toDate(value);
  if (!d) return "";
  const diff = daysAgo(d);
  if (diff === 0) return "Today";
  if (diff === 1) return "Yesterday";
  return d.toLocaleDateString([], { day: "numeric", month: "short", year: "numeric" });
};

/** Short time shown on the right of a chat-list row */
export const formatListTime = (value: DateInput): string => {
  const d = toDate(value);
  if (!d) return "";
  const diff = daysAgo(d);
  if (diff === 0) return formatClock(d);
  if (diff === 1) return "Yesterday";
  if (diff < 7) return d.toLocaleDateString([], { weekday: "short" });
  return d.toLocaleDateString([], { day: "2-digit", month: "2-digit", year: "2-digit" });
};

export const formatLastSeen = (value: DateInput): string => {
  const d = toDate(value);
  if (!d) return "offline";
  const diff = daysAgo(d);
  if (diff === 0) return `last seen today at ${formatClock(d)}`;
  if (diff === 1) return `last seen yesterday at ${formatClock(d)}`;
  return `last seen ${d.toLocaleDateString([], { day: "numeric", month: "short" })}`;
};

export const formatJoined = (value: DateInput): string => {
  const d = toDate(value);
  return d ? d.toLocaleDateString([], { month: "long", year: "numeric" }) : "";
};
