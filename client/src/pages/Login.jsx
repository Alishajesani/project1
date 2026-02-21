// Login.jsx
import { useMemo, useState } from "react";
import { useNavigate, Link } from "react-router-dom";
import { signInWithEmailAndPassword, GoogleAuthProvider, signInWithPopup } from "firebase/auth";
import { auth } from "../firebase";

export default function Login() {
  const nav = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  const [showPw, setShowPw] = useState(false);
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);

  const provider = useMemo(() => new GoogleAuthProvider(), []);

  async function onSubmit(e) {
    e.preventDefault();
    setErr("");
    setBusy(true);
    try {
      const cred = await signInWithEmailAndPassword(auth, email.trim(), password);
      const token = await cred.user.getIdToken();
      localStorage.setItem("pa_token", token);
      nav("/", { replace: true });
    } catch (e) {
      setErr(e?.message || "Login failed");
    } finally {
      setBusy(false);
    }
  }

  async function onGoogle() {
    setErr("");
    setBusy(true);
    try {
      const cred = await signInWithPopup(auth, provider);
      const token = await cred.user.getIdToken();
      localStorage.setItem("pa_token", token);
      nav("/", { replace: true });
    } catch (e) {
      setErr(e?.message || "Google sign-in failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="auth-page">
      <form className="auth-card" onSubmit={onSubmit}>
        <div className="auth-brand">
          <div className="auth-logo">PA</div>
          <div>
            <div className="auth-title">PolyAgent</div>
            <div className="auth-subtitle">Welcome back</div>
          </div>
        </div>

        <label>Email</label>
        <input
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          autoComplete="email"
        />

        <label>Password</label>
        <div className="auth-inputWrap">
          <input
            type={showPw ? "text" : "password"}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete="current-password"
          />
          <button
            type="button"
            className="auth-eye"
            onClick={() => setShowPw((s) => !s)}
            aria-label={showPw ? "Hide password" : "Show password"}
            title={showPw ? "Hide password" : "Show password"}
          >
            {showPw ? "🙈" : "👁️"}
          </button>
        </div>

        {err && <p className="auth-error">{err}</p>}

        <button type="submit" disabled={busy}>
          {busy ? "Please wait…" : "Continue"}
        </button>

        <p className="auth-foot">
          No account? <Link to="/signup">Sign up</Link>
        </p>

        {/* icon-only google button at the bottom */}
        <div className="auth-bottom">
          <button
            type="button"
            className="auth-google-icon"
            onClick={onGoogle}
            disabled={busy}
            title="Continue with Google"
            aria-label="Continue with Google"
          >
            <span className="gmark" aria-hidden="true">G</span>
          </button>
        </div>
      </form>
    </div>
  );
}