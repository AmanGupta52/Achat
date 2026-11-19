const express = require("express");
const router = express.Router();

const auth = require("../middleware/authMiddleware");
const c = require("../controllers/chatController");

router.use(auth);

router.post("/send", c.sendMessage);                      // send (optionally { replyToId })
router.put("/read/:userId", c.markAsRead);                // mark conversation as read

router.put("/message/:id/reaction", c.reactToMessage);    // { emoji } (null removes)
router.put("/message/:id", c.editMessage);                // { content }
router.delete("/message/:id", c.deleteMessage);           // ?scope=me | everyone

router.get("/:userId/search", c.searchMessages);          // ?q=
router.get("/:userId", c.getMessages);                    // ?limit=&before=

module.exports = router;
