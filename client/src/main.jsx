import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App.jsx";
import "./index.css";
document.documentElement.style.setProperty(
  "--base-url",
  import.meta.env.BASE_URL
);
ReactDOM.createRoot(document.getElementById("root")).render(<App />);
