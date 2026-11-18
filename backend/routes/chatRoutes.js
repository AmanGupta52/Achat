const express = require("express");
const router = express.Router();

const auth = require("../middleware/authMiddleware");
const { sendMessage, getMessages, markAsRead } = require("../controllers/chatController");

router.use(auth);

router.post("/send", sendMessage);          // send (encrypted + pushed live)
router.put("/read/:userId", markAsRead);    // mark conversation as read
router.get("/:userId", getMessages);        // chat history

module.exports = router;
