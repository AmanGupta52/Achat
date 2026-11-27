import { useEffect, useState } from "react";
import Navbar from "../components/Navbar";
import ChatList from "../components/ChatList";
import ChatBox from "../components/ChatBox";
import { App as CapacitorApp } from "@capacitor/app";
import { APP_NAME, IS_NATIVE } from "../config";
import type { ListUser } from "../types";

const EmptyChat = () => (
  <div className="flex-1 hidden md:flex flex-col items-center justify-center bg-chat-bg gap-4 px-6">
    <div className="w-24 h-24 rounded-full bg-brand-soft flex items-center justify-center">
      <svg className="w-12 h-12 text-brand-text" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
          d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
      </svg>
    </div>
    <div className="text-center">
      <p className="text-2xl font-bold tracking-tight text-ink">{APP_NAME}</p>
      <p className="text-[15px] text-ink-2 mt-1">Select a conversation to start chatting</p>
    </div>
  </div>
);

const Chat = () => {
  const [selectedUser, setSelectedUser] = useState<ListUser | null>(null);
  const [unread, setUnread] = useState(0);

  // "(3) Achat" in the browser tab
  useEffect(() => {
    document.title = unread > 0 ? `(${unread > 99 ? "99+" : unread}) ${APP_NAME}` : APP_NAME;
    return () => {
      document.title = APP_NAME;
    };
  }, [unread]);

  // Android back button: close the open chat first, only then leave the app
  useEffect(() => {
    if (!IS_NATIVE) return;
    const handle = CapacitorApp.addListener("backButton", () => {
      if (selectedUser) setSelectedUser(null);
      else CapacitorApp.minimizeApp();
    });
    return () => {
      handle.then((h) => h.remove());
    };
  }, [selectedUser]);

  return (
    <div className="h-dvh flex flex-col overflow-hidden bg-app">
      <Navbar />

      <div className="flex flex-1 min-h-0">
        {/* LEFT: connected accounts / search — hidden on mobile while a chat is open */}
        <div
          className={`flex-col border-r border-line w-full md:w-[340px] lg:w-[380px] flex-shrink-0 min-h-0
            ${selectedUser ? "hidden md:flex" : "flex"}`}
        >
          <ChatList activeUserId={selectedUser?._id} onSelectUser={setSelectedUser} onUnreadChange={setUnread} />
        </div>

        {/* RIGHT: conversation — hidden on mobile until a user is picked */}
        <div className={`flex-col flex-1 min-w-0 min-h-0 ${selectedUser ? "flex" : "hidden md:flex"}`}>
          {selectedUser ? (
            <ChatBox key={selectedUser._id} selectedUser={selectedUser} onBack={() => setSelectedUser(null)} />
          ) : (
            <EmptyChat />
          )}
        </div>
      </div>
    </div>
  );
};

export default Chat;
