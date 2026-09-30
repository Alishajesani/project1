const express = require("express");
const cors = require("cors");
require("dotenv").config();

const app = express();
const port = process.env.PORT || 5001;

app.use(express.json());

// ✅ CORS (works with Express 5 + fixes preflight)
const ALLOWED_ORIGINS = new Set([
  "http://localhost:5173",
  "http://localhost:5175",
  "http://127.0.0.1:5173",
  "http://127.0.0.1:5175",
  "https://alishajesani.github.io",
]);

const corsOptions = {
  origin: (origin, cb) => {
    // allow Postman/curl (no origin) + same-origin
    if (!origin) return cb(null, true);
    if (ALLOWED_ORIGINS.has(origin)) return cb(null, true);
    return cb(new Error(`CORS blocked for origin: ${origin}`));
  },
  methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
  allowedHeaders: ["Content-Type", "Authorization"],
};

app.use(cors(corsOptions));
// IMPORTANT in Express 5: use "/*" NOT "*"


// routes
const healthRoute = require("./routes/health");
app.use("/api/health", healthRoute);

const chatRoute = require("./routes/chat");
app.use("/api/chat", chatRoute);

app.get("/", (req, res) => {
  res.send("AI Agent Backend is running 🤖🚀");
});

console.log("✅ Routes loaded: /api/health, /api/chat (Firebase protected)");

app.listen(port, () => {
  console.log(`Server is running on http://localhost:${port}`);
});
