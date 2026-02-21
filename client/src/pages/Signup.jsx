// Signup.jsx
import { useMemo, useState } from "react";
import { useNavigate, Link } from "react-router-dom";
import {
  createUserWithEmailAndPassword,
  updateProfile,
  GoogleAuthProvider,
  signInWithPopup,
} from "firebase/auth";
import { auth } from "../firebase";

export default function Signup() {
  const nav = useNavigate();

  const [name, setName] = useState("");
  const [email, setEmail] = useState("");

  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");

  const [showPw, setShowPw] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);

  const [err, setErr] = useState("");
  const [loading, setLoading] = useState(false);

  const provider = useMemo(() => new GoogleAuthProvider(), []);

  async function onSubmit(e) {
    e.preventDefault();
    setErr("");

    if (password.length < 6) {
      setErr("Password must be at least 6 characters.");
      return;
    }
    if (password !== confirmPassword) {
      setErr("Passwords do not match.");
      return;
    }

    setLoading(true);
    try {
      const cred = await createUserWithEmailAndPassword(auth, email.trim(), password);
      if (name.trim()) await updateProfile(cred.user, { displayName: name.trim() });

      const token = await cred.user.getIdToken();
      localStorage.setItem("pa_token", token);

      nav("/", { replace: true });
    } catch (e) {
      setErr(e?.message || "Signup failed");
    } finally {
      setLoading(false);
    }
  }

  async function onGoogle() {
    setErr("");
    setLoading(true);
    try {
      const cred = await signInWithPopup(auth, provider);

      // Optional: if they typed a name before clicking Google
      if (name.trim() && !cred.user.displayName) {
        await updateProfile(cred.user, { displayName: name.trim() });
      }

      const token = await cred.user.getIdToken();
      localStorage.setItem("pa_token", token);

      nav("/", { replace: true });
    } catch (e) {
      setErr(e?.message || "Google sign-in failed");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="auth-page">
      <form className="auth-card" onSubmit={onSubmit}>
        <div className="auth-brand">
          <div className="auth-logo">PA</div>
          <div>
            <div className="auth-title">PolyAgent</div>
            <div className="auth-subtitle">Create your account</div>
          </div>
        </div>

        <label>Name</label>
        <input value={name} onChange={(e) => setName(e.target.value)} autoComplete="name" />

        <label>Email</label>
        <input value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" />

        <label>Password</label>
        <div className="auth-inputWrap">
          <input
            type={showPw ? "text" : "password"}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete="new-password"
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

        <label>Confirm Password</label>
        <div className="auth-inputWrap">
          <input
            type={showConfirm ? "text" : "password"}
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
            autoComplete="new-password"
          />
          <button
            type="button"
            className="auth-eye"
            onClick={() => setShowConfirm((s) => !s)}
            aria-label={showConfirm ? "Hide confirm password" : "Show confirm password"}
            title={showConfirm ? "Hide password" : "Show password"}
          >
            {showConfirm ? "🙈" : "👁️"}
          </button>
        </div>

        {err && <p className="auth-error">{err}</p>}

        <button type="submit" disabled={loading}>
          {loading ? "Please wait…" : "Create account"}
        </button>

        <p className="auth-foot">
          Have an account? <Link to="/login">Login</Link>
        </p>

        {/* icon-only google button at the bottom */}
        <div className="auth-bottom">
          <button
            type="button"
            className="auth-google-icon"
            onClick={onGoogle}
            disabled={loading}
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