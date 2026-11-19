const express = require("express");
const router = express.Router();

const {
    searchUsers,
    getConnections,
    getRequests,
    getMyRelations,
    getUserById,
    sendRequest,
    cancelRequest,
    acceptRequest,
    rejectRequest,
    removeConnection,
    blockUser,
    unblockUser,
    getBlocked,
    getAvatar,
} = require("../controllers/userController");

const authMiddleware = require("../middleware/authMiddleware");

// 🖼️ public: avatar images are loaded by <img> tags (cached forever via ?v=)
router.get("/:id/avatar", getAvatar);

router.use(authMiddleware);

// ⚠️ Fixed paths MUST be declared before "/:id"
router.get("/", searchUsers);                 // search + discover (?filter=not_connected)
router.get("/connections", getConnections);   // my connected accounts
router.get("/requests", getRequests);         // pending requests
router.get("/relations", getMyRelations);     // ids only (legacy)

router.post("/request/:id", sendRequest);
router.delete("/request/:id", cancelRequest);
router.post("/accept/:id", acceptRequest);
router.post("/reject/:id", rejectRequest);
router.delete("/connection/:id", removeConnection); // disconnect

router.get("/blocked", getBlocked);
router.post("/block/:id", blockUser);
router.delete("/block/:id", unblockUser);

router.get("/:id", getUserById);

module.exports = router;
