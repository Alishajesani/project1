import { useEffect, useMemo, useState } from "react";
import { onAuthStateChanged } from "firebase/auth";
import { auth } from "../../firebase";
import { AuthContext } from "./authContext";

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (u) => {
      setUser(u || null);
      setLoading(false);
    });
    return () => unsub();
  }, []);

  const value = useMemo(() => ({ user, loading }), [user, loading]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
