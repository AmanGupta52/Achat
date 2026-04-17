const express = require("express");
const router = express.Router();

const {
    searchUsers,
    getMyRelations,
    sendRequest,
    acceptRequest,
    rejectRequest,
} = require("../controllers/userController");

const authMiddleware = require("../middleware/authMiddleware");


/**
 * 🔍 SEARCH USERS
 */
router.get("/", authMiddleware, searchUsers);


/**
 * 📊 GET MY RELATIONS
 * (connections + sent + received in one call)
 */
router.get("/relations", authMiddleware, getMyRelations);


/**
 * 📤 SEND CONNECTION REQUEST
 */
router.post("/request/:id", authMiddleware, sendRequest);


/**
 * ✅ ACCEPT REQUEST
 */
router.post("/accept/:id", authMiddleware, acceptRequest);


/**
 * ❌ REJECT REQUEST
 */
router.post("/reject/:id", authMiddleware, rejectRequest);

module.exports = router;