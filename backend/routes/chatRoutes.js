const express = require("express");
const router = express.Router();

const auth = require("../middleware/authMiddleware");
const { sendMessage, getMessages, markAsRead, deleteMessage } = require("../controllers/chatController");

router.use(auth);

router.post("/send", sendMessage);          // send (encrypted + pushed live)
router.put("/read/:userId", markAsRead);    // mark conversation as read
router.delete("/message/:id", deleteMessage); // ?scope=me | everyone
router.get("/:userId", getMessages);        // chat history

module.exports = router;
