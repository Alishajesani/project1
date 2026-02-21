import express from "express";
import bcrypt from "bcrypt";
import jwt from "jsonwebtoken";

// Replace this with your DB model (Mongo User model, etc.)
const users = []; // TEMP in-memory (swap with DB)

const router = express.Router();

router.post("/signup", async (req, res) => {
  try {
    const { name, email, password } = req.body;

    if (!name || !email || !password) return res.status(400).json({ message: "Missing fields" });

    const exists = users.find(u => u.email === email);
    if (exists) return res.status(409).json({ message: "Email already exists" });

    const hashed = await bcrypt.hash(password, 10);
    const newUser = { id: Date.now().toString(), name, email, password: hashed };
    users.push(newUser);

    const token = jwt.sign({ id: newUser.id, email }, process.env.JWT_SECRET, { expiresIn: "7d" });

    res.json({ token, user: { id: newUser.id, name, email } });
  } catch (e) {
    res.status(500).json({ message: "Server error" });
  }
});

router.post("/login", async (req, res) => {
  try {
    const { email, password } = req.body;

    const user = users.find(u => u.email === email);
    if (!user) return res.status(401).json({ message: "Invalid credentials" });

    const ok = await bcrypt.compare(password, user.password);
    if (!ok) return res.status(401).json({ message: "Invalid credentials" });

    const token = jwt.sign({ id: user.id, email }, process.env.JWT_SECRET, { expiresIn: "7d" });

    res.json({ token, user: { id: user.id, name: user.name, email: user.email } });
  } catch (e) {
    res.status(500).json({ message: "Server error" });
  }
});

export default router;