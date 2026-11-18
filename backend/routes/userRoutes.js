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
} = require("../controllers/userController");

const authMiddleware = require("../middleware/authMiddleware");

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

router.get("/:id", getUserById);

module.exports = router;
