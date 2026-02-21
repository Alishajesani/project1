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

const API_URL = "http://localhost:5001/api/chat";

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
  // Firebase Auth user (no AuthProvider needed)
  const [user, setUser] = useState(null);
  const uid = user?.uid || null;

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (u) => setUser(u || null));
    return () => unsub();
  }, []);

  // --- persisted toggles ---
  const [isPlus, setIsPlus] = useState(() => localStorage.getItem("pa_plus") === "true");
  const [theme, setTheme] = useState(() => localStorage.getItem("pa_theme") || "light");

  // --- layout state ---
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [showProfileMenu, setShowProfileMenu] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [search, setSearch] = useState("");

  // --- threads (Firestore) ---
  const [threads, setThreads] = useState([]);
  const [activeThreadId, setActiveThreadId] = useState(null);

  // --- messages (Firestore) ---
  const [messages, setMessages] = useState([]);

  // --- composer + tools ---
  const [input, setInput] = useState("");
  const [mode, setMode] = useState("fast"); // fast | advanced
  const [language, setLanguage] = useState("English");
  const [isSending, setIsSending] = useState(false);

  const [attachOpen, setAttachOpen] = useState(false);
  const fileInputRef = useRef(null);
  const photoInputRef = useRef(null);

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
      setMessages([]);
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

    try {
      const chatId = await ensureActiveChat(text);

      // 1) save user msg to Firestore
      await addDoc(collection(db, "users", uid, "chats", chatId, "messages"), {
        role: "user",
        content: text,
        createdAt: serverTimestamp(),
      });

      await updateDoc(doc(db, "users", uid, "chats", chatId), {
        updatedAt: serverTimestamp(),
      });

      await renameChatIfNeeded(chatId, text);

      // 2) build request messages (role/content only)
      const nextMessages = [
        ...messages.map((m) => ({ role: m.role, content: m.content })),
        { role: "user", content: text },
      ];

      // 3) token for server verify (auth ON)
      const token = await user.getIdToken();

      // 4) call backend
      const res = await axios.post(
        API_URL,
        { messages: nextMessages, mode, language },
        {
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
          },
        }
      );

      const reply = res?.data?.reply ?? "(No reply returned)";

      // 5) save assistant msg
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
      const msg =
        err?.response?.data?.error ||
        err?.message ||
        "Request failed (server/CORS/auth)";

      try {
        const chatId = await ensureActiveChat(text);
        await addDoc(collection(db, "users", uid, "chats", chatId, "messages"), {
          role: "assistant",
          content: `⚠️ ${msg}`,
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
      content: "Got it! (Upload parsing comes next.)",
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

  // If not logged in, show simple screen (your router can also protect this page)
  if (!user) {
    return (
      <div style={{ padding: 24, fontFamily: "system-ui" }}>
        <h2>PolyAgent</h2>
        <p>You are not logged in.</p>
        <p>Go to your Login page and sign in, then come back here.</p>
      </div>
    );
  }

  const avatar = initialsFromUser(user);
  const profileName = user?.displayName || user?.email || "User";

  return (
    <div className={`pa-shell ${theme === "dark" ? "theme-dark" : "theme-light"}`}>
      <div className={`pa-sidebar ${sidebarOpen ? "open" : "closed"}`}>
        <div className="pa-sideTop">
          <button className="pa-newChat" onClick={startNewChat}>
            <div className="pa-icon">✏️</div>
            <span>New chat</span>
          </button>

          <div className="pa-searchWrap">
            <input
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
              onClick={() => setActiveThreadId(t.id)}
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

      <div className="pa-main">
        <div className="pa-topbar">
          <button className="pa-topIcon" onClick={() => setSidebarOpen((v) => !v)}>
            ☰
          </button>
          <div className="pa-topTitle">PolyAgent</div>
          <div className="pa-topRight">
            <button
              className="pa-topBtn"
              onClick={() => setTheme((t) => (t === "dark" ? "light" : "dark"))}
            >
              {theme === "dark" ? "☀️" : "🌙"}
            </button>
            <button className="pa-topBtn" onClick={() => setSettingsOpen(true)}>
              Settings
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
                  ＋
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
                  🎙
                </button>

                <button
                  className={`pa-sendBtn ${input && !isSending ? "on" : ""}`}
                  disabled={!input || isSending}
                  onClick={sendMessage}
                >
                  {isSending ? "…" : "↑"}
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