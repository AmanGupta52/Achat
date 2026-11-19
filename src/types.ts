/** Shapes of the data the API sends. Keep in sync with backend/utils/sanitize.js and chatController.js */

export type Relation = "connected" | "sent" | "received" | "none";

/** The logged-in user's own profile. */
export interface SelfUser {
  _id: string;
  username: string;
  email: string | null;
  phone: string | null;
  about: string;
  avatarVersion: number;
  authProvider: "local" | "google";
  isVerified: boolean;
  isOnline: boolean;
  lastSeen: string;
  createdAt: string;
}

/** Another user, as shown in lists / chat header. */
export interface ListUser {
  _id: string;
  username: string;
  email: string | null;
  phone: string | null;
  about: string;
  avatarVersion: number;
  isOnline: boolean;
  lastSeen: string;
  joinedAt: string | null;
  status: Relation;
  // only on "connected accounts" rows
  unreadCount?: number;
  lastMessage?: string | null;
  lastMessageAt?: string | null;
  lastMessageFromMe?: boolean;
}

export interface BlockedUser {
  _id: string;
  username: string;
  avatarVersion: number;
}

/** Anything that can be drawn as an avatar. */
export interface AvatarUser {
  _id?: string;
  username?: string;
  avatarVersion?: number;
  isOnline?: boolean;
}

export interface Reaction {
  userId: string;
  emoji: string;
}

export interface ReplyPreview {
  _id: string;
  sender: string;
  content: string;
  deleted: boolean;
}

export interface ChatMessage {
  _id: string;
  sender: string;
  receiver: string;
  content: string;
  deleted: boolean;
  edited: boolean;
  editableUntil: string;
  delivered: boolean;
  read: boolean;
  createdAt: string;
  replyTo: ReplyPreview | null;
  reactions: Reaction[];
  // client-only state for messages that are still being sent
  pending?: boolean;
  failed?: boolean;
}

export interface SessionPayload {
  accessToken: string;
  user: SelfUser;
}

export interface SearchHit {
  _id: string;
  sender: string;
  createdAt: string;
  snippet: string;
}

export const REACTION_EMOJIS = ["👍", "❤️", "😂", "😮", "😢", "🙏"] as const;
