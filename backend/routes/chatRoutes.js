const express = require("express");
const router = express.Router();

const auth = require("../middleware/authMiddleware");

const {
    sendMessage,
    getMessages,
    markAsRead, // ✅ NEW
} = require("../controllers/chatController");

/**
 * 📩 SEND MESSAGE
 */
router.post("/send", auth, sendMessage);
/**
 * 👁️ MARK MESSAGES AS READ (NEW)
 */
router.put("/read/:userId", auth, markAsRead);

/**
 * 📜 GET CHAT HISTORY
 */
router.get("/:userId", auth, getMessages);


module.exports = router;