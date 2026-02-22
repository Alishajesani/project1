import { useEffect, useMemo, useRef, useState } from "react";
import axios from "axios";

import { auth, db } from "../firebase";
import { onAuthStateChanged, signOut } from "firebase/auth";

import {
  addDoc,
  collection,
  doc,
  limit,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  updateDoc,
  getDoc,
} from "firebase/firestore";

const API_BASE_RAW = import.meta.env.VITE_API_BASE;
const API_BASE_FALLBACK = import.meta.env.DEV ? "http://localhost:5001" : "";
const API_BASE = (API_BASE_RAW || API_BASE_FALLBACK).replace(/\/$/, "");

// VITE_API_BASE should be like: http://localhost:5001  OR  https://your-backend.com
// (do NOT include "/api" at the end)
const API_URL = API_BASE ? `${API_BASE}/api/chat` : "";

function formatDate(d) {
  try {
    const jsDate = d?.toDate ? d.toDate() : new Date(d);
    return jsDate.toISOString().slice(0, 10);
  } catch {
    return "";
  }
}

function makeTitleFromFirstUserMessage(text) {
  const t = (text || "").trim();
  if (!t) return "New chat";
  const words = t.replace(/\s+/g, " ").split(" ").slice(0, 6).join(" ");
  return words.length < t.length ? `${words}…` : words;
}

function initialsFromUser(user) {
  const name = user?.displayName || user?.email || "U";
  const parts = String(name).trim().split(/\s+/).filter(Boolean);
  const a = parts[0]?.[0] || "U";
  const b = parts[1]?.[0] || "";
  return (a + b).toUpperCase();
}

export default function Chat() {
  // ✅ Firebase Auth user (no AuthProvider)
  const [user, setUser] = useState(null);
  const uid = user?.uid || null;

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (u) => setUser(u || null));
    return () => unsub();
  }, []);

  // --- persisted toggles ---
  const [isPlus, setIsPlus] = useState(() => localStorage.getItem("pa_plus") === "true");
  const [theme, setTheme] = useState(() => localStorage.getItem("pa_theme") || "light");

  // ✅ detect phone (used for ChatGPT-style sidebar behavior)
  const isPhone =
    typeof window !== "undefined"
      ? window.matchMedia("(max-width: 768px)").matches
      : false;

  // --- layout state ---
  // ✅ phone starts closed, ipad/mac starts open
  const [sidebarOpen, setSidebarOpen] = useState(() => !isPhone);
  const [showProfileMenu, setShowProfileMenu] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [search, setSearch] = useState("");

  const closeSidebar = () => {
    if (isPhone) setSidebarOpen(false);
  };

  // --- threads (Firestore) ---
  const [threads, setThreads] = useState([]); // [{id,title,createdAt,updatedAt}]
  const [activeThreadId, setActiveThreadId] = useState(null);

  // --- messages (Firestore) ---
  const [messages, setMessages] = useState([]); // [{id, role, content, createdAt}]

  // --- composer + tools ---
  const [input, setInput] = useState("");
  const [mode, setMode] = useState("fast"); // fast | advanced
  const [language, setLanguage] = useState("English");
  const [isSending, setIsSending] = useState(false);

  const [attachOpen, setAttachOpen] = useState(false);
  const fileInputRef = useRef(null);
  const photoInputRef = useRef(null);
  const searchInputRef = useRef(null);
  const [isListening, setIsListening] = useState(false);
  const speechRef = useRef(null);

  // Close dropdowns when clicking outside
  useEffect(() => {
    const onDoc = (e) => {
      const el = e.target;
      if (el?.closest?.(".pa-profileBar") || el?.closest?.(".pa-leftTools")) return;
      setShowProfileMenu(false);
      setAttachOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, []);

  // Persist plus/theme locally
  useEffect(() => localStorage.setItem("pa_plus", String(isPlus)), [isPlus]);
  useEffect(() => localStorage.setItem("pa_theme", theme), [theme]);

  // 1) Subscribe to chats list
  useEffect(() => {
    if (!uid) {
      setThreads([]);
      setActiveThreadId(null);
      return;
    }

    const q1 = query(
      collection(db, "users", uid, "chats"),
      orderBy("updatedAt", "desc"),
      limit(50)
    );

    const unsub = onSnapshot(q1, (snap) => {
      const list = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
      setThreads(list);

      if (!activeThreadId && list.length) setActiveThreadId(list[0].id);
    });

    return () => unsub();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [uid]);

  // 2) Subscribe to messages for active chat
  useEffect(() => {
    if (!uid || !activeThreadId) {
      setMessages([]);
      return;
    }

    const q2 = query(
      collection(db, "users", uid, "chats", activeThreadId, "messages"),
      orderBy("createdAt", "asc"),
      limit(500)
    );

    const unsub = onSnapshot(q2, (snap) => {
      setMessages(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
    });

    return () => unsub();
  }, [uid, activeThreadId]);

  const filteredThreads = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return threads;
    return threads.filter((t) => (t.title || "").toLowerCase().includes(q));
  }, [threads, search]);

  const startNewChat = async () => {
    if (!uid) return;

    setInput("");
    setAttachOpen(false);
    setShowProfileMenu(false);

    const chatRef = await addDoc(collection(db, "users", uid, "chats"), {
      title: "New chat",
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });

    await addDoc(collection(db, "users", uid, "chats", chatRef.id, "messages"), {
      role: "assistant",
      content: "Hi! I’m PolyAgent. Ask me anything.",
      createdAt: serverTimestamp(),
    });

    setActiveThreadId(chatRef.id);
    closeSidebar(); // ✅ on phone, close after starting
  };

  const renameChatIfNeeded = async (chatId, firstUserText) => {
    try {
      const chatDocRef = doc(db, "users", uid, "chats", chatId);
      const snap = await getDoc(chatDocRef);
      const data = snap.data();
      if (!data) return;
      if (data.title && data.title !== "New chat") return;

      await updateDoc(chatDocRef, {
        title: makeTitleFromFirstUserMessage(firstUserText),
        updatedAt: serverTimestamp(),
      });
    } catch {}
  };

  const ensureActiveChat = async (firstUserText) => {
    if (activeThreadId) return activeThreadId;

    const chatRef = await addDoc(collection(db, "users", uid, "chats"), {
      title: "New chat",
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });

    await addDoc(collection(db, "users", uid, "chats", chatRef.id, "messages"), {
      role: "assistant",
      content: "Hi! I’m PolyAgent. Ask me anything.",
      createdAt: serverTimestamp(),
    });

    setActiveThreadId(chatRef.id);

    if (firstUserText) await renameChatIfNeeded(chatRef.id, firstUserText);
    return chatRef.id;
  };

  const sendMessage = async () => {
    const text = input.trim();
    if (!text || isSending || !uid) return;

    setInput("");
    setIsSending(true);

    if (!API_URL) {
      throw new Error(
        "API base URL is not set. Set VITE_API_BASE (e.g. http://localhost:5001 for local, or your deployed backend URL for GitHub Pages)."
      );
    }

    try {
      const chatId = await ensureActiveChat(text);

      // save user msg
      await addDoc(collection(db, "users", uid, "chats", chatId, "messages"), {
        role: "user",
        content: text,
        createdAt: serverTimestamp(),
      });

      await updateDoc(doc(db, "users", uid, "chats", chatId), {
        updatedAt: serverTimestamp(),
      });

      await renameChatIfNeeded(chatId, text);

      // token for server verify
      const token = await auth.currentUser?.getIdToken?.();

      // call backend (IMPORTANT: server must allow CORS)
      const res = await axios.post(
        API_URL,
        { messages: [...messages, { role: "user", content: text }], mode, language },
        {
          headers: {
            "Content-Type": "application/json",
            ...(token ? { Authorization: `Bearer ${token}` } : {}),
          },
        }
      );

      const reply = res?.data?.reply ?? "(No reply returned)";

      // save assistant msg
      await addDoc(collection(db, "users", uid, "chats", chatId, "messages"), {
        role: "assistant",
        content: reply,
        createdAt: serverTimestamp(),
      });

      await updateDoc(doc(db, "users", uid, "chats", chatId), {
        updatedAt: serverTimestamp(),
      });
    } catch (err) {
      console.error("Chat request failed:", err);
      const status = err?.response?.status;
      const url = err?.config?.url;

      const msg =
        err?.response?.data?.error ||
        err?.message ||
        "Request failed (likely CORS, wrong URL, or server down)";

      const extra =
        status === 404
          ? ` (404 Not Found)\nCheck your API URL: ${url || API_URL}.\nYour VITE_API_BASE must NOT end with /api.`
          : status
          ? ` (HTTP ${status})`
          : url
          ? `\nURL: ${url}`
          : "";

      try {
        const chatId = await ensureActiveChat(text);
        await addDoc(collection(db, "users", uid, "chats", chatId, "messages"), {
          role: "assistant",
          content: `⚠️ ${msg}${extra}\n\nIf you’re on GitHub Pages, your backend must be deployed and use https.\nIf you’re local, make sure the backend is running on http://localhost:5001 and that /api/chat exists.`,
          createdAt: serverTimestamp(),
        });
        await updateDoc(doc(db, "users", uid, "chats", chatId), {
          updatedAt: serverTimestamp(),
        });
      } catch {}
    } finally {
      setIsSending(false);
    }
  };

  const togglePlus = () => {
    setIsPlus((v) => {
      const next = !v;
      if (!v) setMode("advanced");
      return next;
    });
  };

  const openFilePicker = () => {
    if (!isPlus) {
      setSettingsOpen(true);
      setAttachOpen(false);
      return;
    }
    fileInputRef.current?.click();
    setAttachOpen(false);
  };

  const openPhotoPicker = () => {
    if (!isPlus) {
      setSettingsOpen(true);
      setAttachOpen(false);
      return;
    }
    photoInputRef.current?.click();
    setAttachOpen(false);
  };

  const handlePickedFiles = async (files) => {
    if (!files || !files.length || !uid) return;

    const list = Array.from(files).map((f) => `${f.name} (${Math.round(f.size / 1024)} KB)`);
    const chatId = await ensureActiveChat("Attachments");

    await addDoc(collection(db, "users", uid, "chats", chatId, "messages"), {
      role: "user",
      content: `📎 Attached: ${list.join(", ")}`,
      createdAt: serverTimestamp(),
    });

    await addDoc(collection(db, "users", uid, "chats", chatId, "messages"), {
      role: "assistant",
      content: "Got it! (Upload parsing comes next.) For now, I can confirm the file was selected.",
      createdAt: serverTimestamp(),
    });

    await updateDoc(doc(db, "users", uid, "chats", chatId), { updatedAt: serverTimestamp() });
  };

  const startVoice = () => {
    if (!isPlus) {
      setSettingsOpen(true);
      return;
    }

    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SR) return;

    const rec = new SR();
    speechRef.current = rec;
    rec.continuous = false;
    rec.interimResults = false;
    rec.lang =
      language === "Hindi"
        ? "hi-IN"
        : language === "Punjabi"
        ? "pa-IN"
        : language === "Spanish"
        ? "es-ES"
        : language === "French"
        ? "fr-FR"
        : language === "Chinese"
        ? "zh-CN"
        : "en-US";

    rec.onstart = () => setIsListening(true);
    rec.onend = () => setIsListening(false);
    rec.onerror = () => setIsListening(false);
    rec.onresult = (e) => {
      const t = e.results?.[0]?.[0]?.transcript || "";
      setInput((prev) => (prev ? prev + " " + t : t));
    };

    rec.start();
  };

  const avatar = initialsFromUser(user);
  const profileName = user?.displayName || user?.email || "User";

  return (
    <div
      className={`pa-shell ${theme === "dark" ? "theme-dark" : "theme-light"}`}
      style={{
        // ✅ watermark image path that works on GitHub Pages too
        "--watermark-url": `url(${import.meta.env.BASE_URL}polyagent-watermark.png)`,
      }}
    >
      <div className={`pa-sidebar ${sidebarOpen ? "open" : "closed"}`}>
        <div className="pa-sideTop">
          <button className="pa-newChat" onClick={startNewChat}>
          <div className="pa-icon" aria-hidden="true">
            <svg viewBox="0 0 24 24" width="18" height="18">
              <path
                fill="currentColor"
                d="M3 17.25V21h3.75L17.81 9.94l-3.75-3.75L3 17.25zm2.92 2.83H5v-.92l8.06-8.06.92.92L5.92 20.08zM20.71 7.04a1.003 1.003 0 0 0 0-1.42L18.37 3.29a1.003 1.003 0 0 0-1.42 0l-1.83 1.83 3.75 3.75 1.84-1.83z"
              />
            </svg>
          </div>
            <span>New chat</span>
          </button>

          <div className="pa-searchWrap">
            <span className="pa-searchIcon" aria-hidden="true">
              <svg viewBox="0 0 24 24" width="18" height="18">
                <path
                  fill="currentColor"
                  d="M10 2a8 8 0 1 0 4.9 14.3l4.4 4.4 1.4-1.4-4.4-4.4A8 8 0 0 0 10 2zm0 2a6 6 0 1 1 0 12 6 6 0 0 1 0-12z"
                />
              </svg>
            </span>

            <input
              ref={searchInputRef}
              className="pa-search"
              placeholder="Search"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
        </div>

        <div className="pa-threadList">
          {filteredThreads.map((t) => (
            <button
              key={t.id}
              className={`pa-thread ${t.id === activeThreadId ? "active" : ""}`}
              onClick={() => {
                setActiveThreadId(t.id);
                closeSidebar(); // ✅ phone: close after selecting
              }}
            >
              <div className="pa-threadTitle">{t.title || "New chat"}</div>
              <div className="pa-threadMeta">{formatDate(t.createdAt)}</div>
            </button>
          ))}
        </div>

        <div className="pa-profileBar">
          <button className="pa-profileBtn" onClick={() => setShowProfileMenu((v) => !v)}>
            <div className="pa-avatar">{avatar}</div>
            <div className="pa-profileName">{profileName}</div>
            <div className="pa-caret">▾</div>
          </button>

          {showProfileMenu && (
            <div className="pa-menu">
              <button
                className="pa-menuItem"
                onClick={() => {
                  setSettingsOpen(true);
                  setShowProfileMenu(false);
                }}
              >
                Settings
              </button>

              <button
                className="pa-menuItem danger"
                onClick={async () => {
                  await signOut(auth);
                }}
              >
                Log out
              </button>
            </div>
          )}
        </div>
      </div>

      {/* ✅ CLICK OUTSIDE TO CLOSE (phone only) */}
      {isPhone && sidebarOpen && (
        <div
          className="pa-overlay"
          onMouseDown={closeSidebar}
          onTouchStart={closeSidebar}
        />
      )}

      <div className="pa-main">
        <div className="pa-topbar">
          <button className="pa-topIcon" onClick={() => setSidebarOpen((v) => !v)}>
            ☰
          </button>
          <div className="pa-topTitle">PolyAgent</div>
          <div className="pa-topRight">
            <button className="pa-topBtn" onClick={() => setTheme((t) => (t === "dark" ? "light" : "dark"))}>
            {theme === "dark" ? (
              <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true">
                <path fill="currentColor" d="M6.76 4.84l-1.8-1.79-1.41 1.41 1.79 1.8 1.42-1.42zM1 11h3v2H1v-2zm10-10h2v3h-2V1zm9.66 3.46-1.41-1.41-1.8 1.79 1.42 1.42 1.79-1.8zM17 11h3v2h-3v-2zm-5 3a4 4 0 1 1 0-8 4 4 0 0 1 0 8zm0 6h2v3h-2v-3zm7.24-1.84 1.8 1.79 1.41-1.41-1.79-1.8-1.42 1.42zM4.34 19.54l1.41 1.41 1.8-1.79-1.42-1.42-1.79 1.8z"/>
              </svg>
            ) : (
              <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true">
                <path fill="currentColor" d="M21.64 13a9 9 0 0 1-10.63-10.63A8 8 0 1 0 21.64 13z"/>
              </svg>
            )}
            </button>
            <button className="pa-topBtn" onClick={() => setSettingsOpen(true)}>
            <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true">
              <path fill="currentColor" d="M19.14 12.94c.04-.31.06-.63.06-.94s-.02-.63-.06-.94l2.03-1.58a.5.5 0 0 0 .12-.64l-1.92-3.32a.5.5 0 0 0-.6-.22l-2.39.96a7.4 7.4 0 0 0-1.63-.94l-.36-2.54a.5.5 0 0 0-.5-.42h-3.84a.5.5 0 0 0-.5.42l-.36 2.54c-.58.22-1.12.52-1.63.94l-2.39-.96a.5.5 0 0 0-.6.22L2.71 7.84a.5.5 0 0 0 .12.64l2.03 1.58c-.04.31-.06.63-.06.94s.02.63.06.94L2.83 14.52a.5.5 0 0 0-.12.64l1.92 3.32c.13.23.4.32.6.22l2.39-.96c.5.41 1.05.72 1.63.94l.36 2.54c.04.24.25.42.5.42h3.84c.25 0 .46-.18.5-.42l.36-2.54c.58-.22 1.12-.52 1.63-.94l2.39.96c.2.1.47.01.6-.22l1.92-3.32a.5.5 0 0 0-.12-.64l-2.03-1.58zM12 15.5A3.5 3.5 0 1 1 12 8a3.5 3.5 0 0 1 0 7.5z"/>
            </svg>
            </button>
          </div>
        </div>

        <div className="pa-chatScroll">
          <div className="pa-chatInner">
            {messages.map((msg, i) => (
              <div key={msg.id || i} className={`pa-row ${msg.role === "user" ? "user" : "assistant"}`}>
                <div className="pa-bubble">
                  <div className="pa-bubbleRole">{msg.role === "user" ? "You" : "Agent"}</div>
                  <div className="pa-bubbleText">{msg.content}</div>
                </div>
              </div>
            ))}
            {!messages.length && (
              <div className="pa-row assistant">
                <div className="pa-bubble">
                  <div className="pa-bubbleRole">Agent</div>
                  <div className="pa-bubbleText">Hi! I’m PolyAgent. Ask me anything.</div>
                </div>
              </div>
            )}
          </div>
        </div>

        <div className="pa-composerWrap">
          <div className="pa-composer">
            <div className="pa-composerRow" style={{ position: "relative" }}>
              <div className="pa-leftTools">
                <button type="button" className="pa-iconBtn" onClick={() => setAttachOpen((v) => !v)}>
                <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true">
                  <path fill="currentColor" d="M11 5h2v14h-2V5zm-6 6h14v2H5v-2z"/>
                </svg>
                </button>

                {attachOpen && (
                  <div className="pa-attachMenu">
                    <button className="pa-attachItem" onClick={openFilePicker}>
                      Upload file {!isPlus && <span className="pa-lock">Plus</span>}
                    </button>
                    <button className="pa-attachItem" onClick={openPhotoPicker}>
                      Upload photo {!isPlus && <span className="pa-lock">Plus</span>}
                    </button>
                  </div>
                )}

                <input
                  ref={fileInputRef}
                  type="file"
                  multiple
                  style={{ display: "none" }}
                  onChange={(e) => handlePickedFiles(e.target.files)}
                />
                <input
                  ref={photoInputRef}
                  type="file"
                  accept="image/*"
                  capture="environment"
                  style={{ display: "none" }}
                  onChange={(e) => handlePickedFiles(e.target.files)}
                />
              </div>

              <textarea
                className="pa-textarea"
                placeholder="Message PolyAgent..."
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault();
                    sendMessage();
                  }
                }}
              />

              <div className="pa-rightTools">
                <button className={`pa-micBtn ${isListening ? "on" : ""}`} onClick={startVoice} type="button">
                <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true">
                  <path fill="currentColor" d="M12 14a3 3 0 0 0 3-3V6a3 3 0 0 0-6 0v5a3 3 0 0 0 3 3zm5-3a5 5 0 0 1-10 0H5a7 7 0 0 0 6 6.92V21h2v-3.08A7 7 0 0 0 19 11h-2z"/>
                </svg>
                </button>

                <button
                  className={`pa-sendBtn ${input && !isSending ? "on" : ""}`}
                  disabled={!input || isSending}
                  onClick={sendMessage}
                >
                  {isSending ? (
  <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true">
    <path fill="currentColor" d="M12 6a1.5 1.5 0 1 0 0 3 1.5 1.5 0 0 0 0-3zm0 5a1.5 1.5 0 1 0 0 3 1.5 1.5 0 0 0 0-3zm0 5a1.5 1.5 0 1 0 0 3 1.5 1.5 0 0 0 0-3z"/>
  </svg>
) : (
  <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true">
    <path fill="currentColor" d="M3 12l18-9-6.5 18-2.6-7.1L3 12zm9.3 2.3 1.6 4.4L17.6 8.6l-5.3 5.7z"/>
  </svg>
)}
                </button>
              </div>
            </div>

            <div className="pa-subRow">
              <button
                type="button"
                className={`pa-chip ${mode === "fast" ? "active" : ""}`}
                onClick={() => setMode("fast")}
              >
                ⚡ Fast Local <span className="pa-chipHint">Free</span>
              </button>

              <button
                type="button"
                className={`pa-chip ${mode === "advanced" ? "active" : ""} ${!isPlus ? "locked" : ""}`}
                onClick={() => setMode("advanced")}
                title={!isPlus ? "Plus only" : "Advanced"}
              >
                🧠 Advanced <span className="pa-chipHint">Plus only</span>
              </button>

              <div className="pa-spacer" />

              <select className="pa-select" value={language} onChange={(e) => setLanguage(e.target.value)}>
                <option>English</option>
                <option>Hindi</option>
                <option>Punjabi</option>
                <option>Spanish</option>
                <option>French</option>
                <option>Chinese</option>
              </select>
            </div>

            <div className="pa-tip">Enter to send · Shift+Enter for new line</div>
          </div>
        </div>

        {settingsOpen && (
          <div className="pa-modalOverlay" onMouseDown={() => setSettingsOpen(false)}>
            <div className="pa-modal" onMouseDown={(e) => e.stopPropagation()}>
              <div className="pa-modalHeader">
                <div className="pa-modalTitle">Settings</div>
                <button className="pa-x" onClick={() => setSettingsOpen(false)}>
                  ✕
                </button>
              </div>

              <div className="pa-modalBody">
                <div className="pa-settingGroup">
                  <div className="pa-settingLabel">Account</div>
                  <div className="pa-settingRow">
                    <div>
                      <div className="pa-settingName">Subscription</div>
                      <div className="pa-settingHint">Plus unlocks Advanced model, file/photo attach, and voice.</div>
                    </div>
                    <button className={`pa-primaryBtn ${isPlus ? "on" : ""}`} onClick={togglePlus}>
                      {isPlus ? "Plus active" : "Upgrade to Plus"}
                    </button>
                  </div>
                </div>

                <div className="pa-settingGroup">
                  <div className="pa-settingLabel">App</div>
                  <div className="pa-settingRow">
                    <div>
                      <div className="pa-settingName">Theme</div>
                      <div className="pa-settingHint">Switch between Dark / Light.</div>
                    </div>
                    <button
                      className="pa-secondaryBtn"
                      onClick={() => setTheme((t) => (t === "dark" ? "light" : "dark"))}
                    >
                      {theme === "dark" ? "Light" : "Dark"}
                    </button>
                  </div>
                </div>

                <div className="pa-settingFooter">
                  <button className="pa-secondaryBtn" onClick={() => setSettingsOpen(false)}>
                    Done
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}