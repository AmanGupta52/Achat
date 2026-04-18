import Navbar from '../components/Navbar';
import ChatList from '../components/ChatList';
import ChatBox from '../components/ChatBox';
import { useState } from 'react';

const Chat = () => {
    const [selectedUser, setSelectedUser] = useState(null);

    const handleSelectUser = (user) => {
        setSelectedUser(user);
    };

    const handleBack = () => {
        setSelectedUser(null);
    };

    return (
        <div className="h-screen flex flex-col overflow-hidden bg-gray-100 dark:bg-gray-950">
            <Navbar />

            <div className="flex flex-1 overflow-hidden">

                {/* LEFT: USER LIST — hidden on mobile when chat is open */}
                <div
                    className={`
                        flex flex-col border-r dark:border-gray-700
                        w-full md:w-[340px] lg:w-[380px] flex-shrink-0
                        ${selectedUser ? 'hidden md:flex' : 'flex'}
                    `}
                >
                    <ChatList onSelectUser={handleSelectUser} />
                </div>

                {/* RIGHT: CHAT BOX — hidden on mobile when no user selected */}
                <div
                    className={`
                        flex flex-col flex-1 min-w-0
                        ${selectedUser ? 'flex' : 'hidden md:flex'}
                    `}
                >
                    <ChatBox
                        selectedUser={selectedUser}
                        onBack={handleBack}
                        onUserRefresh={(freshUser) => setSelectedUser(freshUser)}
                    />
                </div>

            </div>
        </div>
    );
};

export default Chat;