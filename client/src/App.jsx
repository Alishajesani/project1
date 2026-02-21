import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import Chat from "./pages/chat.jsx";
import Login from "./pages/Login.jsx";
import Signup from "./pages/Signup.jsx";

function RequireAuth({ children }) {
  const token = localStorage.getItem("pa_token");
  return token ? children : <Navigate to="/login" replace />;
}

export default function App() {
  return (
    <BrowserRouter basename={import.meta.env.BASE_URL}>
      <Routes>
        <Route path="/login" element={<Login />} />
        <Route path="/signup" element={<Signup />} />

        <Route
          path="/"
          element={
            <RequireAuth>
              <Chat />
            </RequireAuth>
          }
        />

        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  );
}