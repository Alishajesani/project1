const express = require("express");
const { requireFirebaseAuth } = require("../middleware/FirebaseAuth");

const router = express.Router();
router.post("/", requireFirebaseAuth, async (req, res) => {
  console.log("CONTENT-TYPE:", req.headers["content-type"]);
  console.log("BODY:", req.body);

  const { messages, mode, language } = req.body || {};

  if (!Array.isArray(messages)) {
    return res.status(400).json({
      error: "Missing/invalid JSON body. Send { messages: [...] } with Content-Type: application/json",
    });
  }

  // ✅ TEST RESPONSE (so you know route + auth + body works)
  return res.json({
    reply: `✅ Server received ${messages.length} messages. mode=${mode || "?"} language=${language || "?"}`,
  });
});

module.exports = router;