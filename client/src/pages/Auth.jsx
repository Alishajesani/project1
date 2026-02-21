import { useState } from "react";
import { auth, googleProvider, appleProvider, db } from "../firebase";
import {
  signInWithPopup,
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
} from "firebase/auth";
import { doc, setDoc, serverTimestamp } from "firebase/firestore";

export default function AuthPage() {
  const [mode, setMode] = useState("login"); // login | signup
  const [email, setEmail] = useState("");
  const [pass, setPass] = useState("");
  const [err, setErr] = useState("");

  const ensureUserDoc = async (u) => {
    await setDoc(
      doc(db, "users", u.uid),
      {
        email: u.email || "",
        name: u.displayName || "",
        isPlus: false,
        createdAt: serverTimestamp(),
      },
      { merge: true }
    );
  };

  const onGoogle = async () => {
    setErr("");
    const res = await signInWithPopup(auth, googleProvider);
    await ensureUserDoc(res.user);
  };

  const onApple = async () => {
    setErr("");
    const res = await signInWithPopup(auth, appleProvider);
    await ensureUserDoc(res.user);
  };

  const onEmail = async () => {
    setErr("");
    try {
      const res =
        mode === "signup"
          ? await createUserWithEmailAndPassword(auth, email, pass)
          : await signInWithEmailAndPassword(auth, email, pass);

      await ensureUserDoc(res.user);
    } catch (e) {
      setErr(e.message);
    }
  };

  return (
    <div style={{ minHeight: "100vh", display: "grid", placeItems: "center" }}>
      <div style={{ width: 360, border: "1px solid #ddd", borderRadius: 16, padding: 18 }}>
        <h2 style={{ marginTop: 0 }}>{mode === "login" ? "Welcome back" : "Create your account"}</h2>

        <button onClick={onGoogle} style={{ width: "100%", padding: 10, borderRadius: 12, marginBottom: 10 }}>
          Continue with Google
        </button>

        <button onClick={onApple} style={{ width: "100%", padding: 10, borderRadius: 12, marginBottom: 12 }}>
          Continue with Apple
        </button>

        <div style={{ display: "grid", gap: 10 }}>
          <input placeholder="Email" value={email} onChange={(e) => setEmail(e.target.value)} />
          <input placeholder="Password" type="password" value={pass} onChange={(e) => setPass(e.target.value)} />
          <button onClick={onEmail} style={{ padding: 10, borderRadius: 12 }}>
            {mode === "login" ? "Log in" : "Sign up"}
          </button>
        </div>

        {err && <div style={{ color: "crimson", marginTop: 10 }}>{err}</div>}

        <div style={{ marginTop: 12, fontSize: 14 }}>
          {mode === "login" ? (
            <span>
              Don’t have an account?{" "}
              <button onClick={() => setMode("signup")} style={{ border: 0, background: "transparent", color: "blue" }}>
                Sign up
              </button>
            </span>
          ) : (
            <span>
              Already have an account?{" "}
              <button onClick={() => setMode("login")} style={{ border: 0, background: "transparent", color: "blue" }}>
                Log in
              </button>
            </span>
          )}
        </div>
      </div>
    </div>
  );
}