const express = require("express");
const { requireFirebaseAuth } = require("../middleware/firebaseAuth");
const { chat } = require("../controllers/aiController");

const router = express.Router();
router.post("/", requireFirebaseAuth, chat);

module.exports = router;
