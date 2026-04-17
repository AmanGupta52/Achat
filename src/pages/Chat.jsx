import Navbar from '../components/Navbar';
import ChatList from '../components/ChatList';
import ChatBox from '../components/ChatBox';
import { useState } from 'react';

const Chat = () => {
    const [selectedUser, setSelectedUser] = useState(null);

    return (
        <div className="h-screen flex flex-col overflow-hidden">
            <Navbar />

            <div className="flex flex-1 overflow-hidden">

                {/* LEFT: USER LIST */}
                <div className="w-1/3 flex flex-col">
                    <ChatList onSelectUser={setSelectedUser} />
                </div>

                {/* RIGHT: CHAT BOX */}
                <div className="w-2/3 flex flex-col">
                    <ChatBox selectedUser={selectedUser} />
                </div>

            </div>
        </div>
    );
};

export default Chat;