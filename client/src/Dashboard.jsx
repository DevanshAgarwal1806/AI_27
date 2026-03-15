import { useEffect, useRef, useState } from "react";
import { supabase } from "./supabaseClient";
import "./styles/styles.css";

// ─── Typing indicator dots ────────────────────────────────────────────────────
function TypingIndicator() {
  return (
    <div className="chat-bubble assistant typing-bubble">
      <span className="typing-dot" />
      <span className="typing-dot" />
      <span className="typing-dot" />
    </div>
  );
}

// ─── Typewriter hook ──────────────────────────────────────────────────────────
function useTypewriter(fullText, active, speed = 10) {
  const [displayed, setDisplayed] = useState("");
  const [done, setDone] = useState(false);
  const rafRef = useRef(null);
  const idxRef = useRef(0);

  useEffect(() => {
    cancelAnimationFrame(rafRef.current);
    if (!active) { setDisplayed(fullText); setDone(true); return; }
    setDisplayed(""); setDone(false); idxRef.current = 0;
    let last = performance.now();
    const tick = (now) => {
      const el = now - last;
      if (el >= speed) {
        const steps = Math.max(1, Math.floor(el / speed));
        idxRef.current = Math.min(idxRef.current + steps, fullText.length);
        setDisplayed(fullText.slice(0, idxRef.current));
        last = now;
        if (idxRef.current >= fullText.length) { setDone(true); return; }
      }
      rafRef.current = requestAnimationFrame(tick);
    };
    rafRef.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafRef.current);
  }, [fullText, active]);

  return { displayed, done };
}

// ─── Assistant bubble with typewriter ────────────────────────────────────────
function AssistantBubble({ text, animate }) {
  const { displayed, done } = useTypewriter(text, animate);
  return (
    <div className="chat-bubble assistant bubble-animate">
      <div className="bubble-role-label">SYNAPSE</div>
      <div className="bubble-text">
        {displayed}
        {!done && <span className="cursor-blink">▌</span>}
      </div>
    </div>
  );
}

// ─── Extract a human-readable description from any DAG node value ─────────────
function extractDesc(val) {
  if (typeof val === "string") return val.trim();
  if (Array.isArray(val)) {
    if (val.length === 0) return "—";
    const parts = val.map((item) => {
      if (typeof item === "string") return item;
      if (item && typeof item === "object") {
        return (
          item.description || item.desc || item.summary ||
          item.label || item.name || item.title || item.id || null
        );
      }
      return null;
    }).filter(Boolean);
    if (parts.length) return parts.join(" → ");
    return `${val.length} item${val.length !== 1 ? "s" : ""}`;
  }
  if (val && typeof val === "object") {
    const d = val.description || val.desc || val.summary ||
              val.label || val.name || val.title || val.status;
    if (d) return String(d).trim();
    const first = Object.values(val).find((v) => typeof v === "string");
    if (first) return first.trim();
    const arrVal = Object.values(val).find((v) => Array.isArray(v));
    if (arrVal) return extractDesc(arrVal);
    return `${Object.keys(val).length} field${Object.keys(val).length !== 1 ? "s" : ""}`;
  }
  return String(val);
}

// Word-wrap into max 2 lines of maxLen chars each
function wrapText(str, maxLen = 30) {
  const words = str.split(/\s+/);
  const lines = [];
  let cur = "";
  for (const w of words) {
    const test = cur ? cur + " " + w : w;
    if (test.length > maxLen && cur) { lines.push(cur); cur = w; if (lines.length === 2) break; }
    else cur = test;
  }
  if (cur && lines.length < 2) lines.push(cur);
  return lines.map((l, i) => (i === lines.length - 1 && l.length > maxLen) ? l.slice(0, maxLen - 1) + "…" : l);
}

// ─── LandingPage-style DAG for Dashboard (vertical, data-driven) ──────────────
function DagGraph({ dag }) {
  const [activeNode, setActiveNode] = useState(0);

  // 1. Safely handle the incoming JSON as an array
  const dagArray = Array.isArray(dag) ? dag : [];
  const hasData = dagArray.length > 0;

  // 2. Map the array to the existing UI node format
  const nodes = dagArray.map((step, i) => {
    // Alternate nodes left / right of centre for diamond-like feel
    const offsets = [
      { left: "20%" }, { left: "52%" }, { left: "20%" }, { left: "52%" },
      { left: "20%" }, { left: "52%" }, { left: "20%" }, { left: "52%" },
    ];
    const isOrange = i % 2 === 1;
    const desc = step.description || "";

    return {
      index: i, // We need the numeric index for the activeNode animation and edges
      id: step.id, 
      label: i === 0 ? "INPUT" : i === dagArray.length - 1 ? "OUTPUT" : `STEP ${i}`,
      text: step.id, // Display "step_1" etc. as the main key
      desc: desc.length > 28 ? desc.slice(0, 27) + "…" : desc,
      top: `${8 + i * (86 / Math.max(dagArray.length - 1, 1))}%`,
      left: (offsets[i % offsets.length] || { left: "30%" }).left,
      delay: `${i * 0.1}s`,
      orange: isOrange,
      dependencies: step.dependencies || []
    };
  });

  // 3. Build edges by mapping "dependencies" strings back to numeric indices
  const edges = [];
  nodes.forEach((node) => {
    node.dependencies.forEach(depId => {
      const sourceNodeIndex = nodes.findIndex(n => n.id === depId);
      if (sourceNodeIndex !== -1) {
        edges.push([sourceNodeIndex, node.index]);
      }
    });
  });

  // Fallback: If no dependencies are provided, draw linear edges (0→1→2) 
  // to ensure the UI still draws connecting lines like it used to.
  if (edges.length === 0 && nodes.length > 1) {
    nodes.slice(0, -1).forEach((_, i) => edges.push([i, i + 1]));
  }

  // Animation loop
  useEffect(() => {
    if (!hasData) return;
    const interval = setInterval(() => {
      setActiveNode(prev => (prev + 1) % nodes.length);
    }, 1200);
    return () => clearInterval(interval);
  }, [hasData, nodes.length]);

  // SVG coordinate helper
  const VB_W = 280, VB_H = 500;
  const getCenter = (node) => ({
    x: parseFloat(node.left) / 100 * VB_W + 60,
    y: parseFloat(node.top)  / 100 * VB_H + 10,
  });

  if (!hasData) {
    return (
      <div className="dag-empty">
        <div className="dag-empty-icon">◈</div>
        <p>No DAG yet</p>
        <p className="dag-empty-sub">Send a prompt to see the execution graph</p>
      </div>
    );
  }

  return (
    <div className="db-dag-live-wrap">
      <svg className="db-dag-svg" viewBox={`0 0 ${VB_W} ${VB_H}`}>
        <defs>
          <marker id="db-arrow" markerWidth="6" markerHeight="4" refX="3" refY="2" orient="auto">
            <polygon points="0 0, 6 2, 0 4" fill="rgba(0,245,212,0.45)" />
          </marker>
          <filter id="db-glow" x="-40%" y="-40%" width="180%" height="180%">
            <feGaussianBlur stdDeviation="2.5" result="blur" />
            <feMerge><feMergeNode in="blur" /><feMergeNode in="SourceGraphic" /></feMerge>
          </filter>
        </defs>

        {edges.map(([fromIndex, toIndex], i) => {
          const a = getCenter(nodes[fromIndex]);
          const b = getCenter(nodes[toIndex]);
          const isActive = activeNode === fromIndex || activeNode === toIndex;
          return (
            <line
              key={i}
              x1={a.x} y1={a.y}
              x2={b.x} y2={b.y}
              stroke={isActive ? "rgba(0,245,212,0.65)" : "rgba(0,245,212,0.13)"}
              strokeWidth={isActive ? "1.6" : "1"}
              strokeDasharray={isActive ? "none" : "4,4"}
              markerEnd="url(#db-arrow)"
              style={{ transition: "all 0.4s" }}
            />
          );
        })}
      </svg>

      {nodes.map(node => (
        <div
          key={node.id}
          className={[
            "db-dag-node",
            node.orange ? "orange" : "",
            activeNode === node.index ? "active" : "",
          ].filter(Boolean).join(" ")}
          style={{ top: node.top, left: node.left, animationDelay: node.delay }}
        >
          <span className="db-node-label">{node.label}</span>
          <span className="db-node-key">{node.text}</span>
          {node.desc && <span className="db-node-desc">{node.desc}</span>}
        </div>
      ))}
    </div>
  );
}

// ─── Chat messages area ───────────────────────────────────────────────────────
function ChatArea({ messages, loading, animateLastAssistant }) {
  const bottomRef = useRef(null);
  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: "smooth" }); }, [messages, loading]);

  if (messages.length === 0 && !loading) {
    return (
      <div className="chat-welcome">
        <div className="chat-welcome-icon">⬡</div>
        <h3 className="chat-welcome-title">Start a Conversation</h3>
        <p className="chat-welcome-sub">Type your task. SynapseAI orchestrates agents and shows a live execution DAG.</p>
      </div>
    );
  }

  return (
    <div className="chat-messages">
      {messages.map((msg, i) => {
        if (msg.role === "assistant") {
          return <AssistantBubble key={i} text={msg.text} animate={i === messages.length - 1 && animateLastAssistant} />;
        }
        return (
          <div key={i} className="chat-bubble user bubble-animate" style={{ animationDelay: `${i * 25}ms` }}>
            <div className="bubble-role-label">YOU</div>
            <div className="bubble-text">{msg.text}</div>
          </div>
        );
      })}
      {loading && <TypingIndicator />}
      <div ref={bottomRef} />
    </div>
  );
}

// ─── Main Dashboard ───────────────────────────────────────────────────────────
export default function Dashboard() {
  const [user, setUser]               = useState(null);
  const [chats, setChats]             = useState([]);
  const [activeChat, setActiveChat]   = useState(null);
  const [prompt, setPrompt]           = useState("");
  const [loading, setLoading]         = useState(false);
  const [error, setError]             = useState(null);
  const [animateNew, setAnimateNew]   = useState(false);
  const [deletingId, setDeletingId]   = useState(null);
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const textareaRef                   = useRef(null);

  const chatIsComplete = !!(activeChat?.messages?.some((m) => m.role === "assistant"));

  // ── Auth ──────────────────────────────────────────────────────────────────
  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => setUser(session?.user ?? null));
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_e, s) => setUser(s?.user ?? null));
    return () => subscription.unsubscribe();
  }, []);

  // ── Load history ──────────────────────────────────────────────────────────
  useEffect(() => {
    const load = async () => {
      if (!user?.id) { setChats([]); setActiveChat(null); return; }
      const { data, error: err } = await supabase
        .from("chat_history")
        .select("id,user_prompt,final_output,current_dag,created_at")
        .eq("user_id", user.id)
        .order("created_at", { ascending: false });
      if (err) { setError("Failed to load history"); return; }
      if (Array.isArray(data)) {
        const mapped = data.map((r) => ({
          id: r.id, prompt: r.user_prompt,
          final_output: r.final_output, current_dag: r.current_dag, createdAt: r.created_at,
        }));
        setChats(mapped);
        if (mapped.length > 0) openHistoryChat(mapped[0]);
      }
    };
    load();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user]);

  // ── Helpers ───────────────────────────────────────────────────────────────
  const openHistoryChat = (row) => {
    setActiveChat({
      id: row.id,
      messages: [
        { role: "user",      text: row.prompt },
        { role: "assistant", text: row.final_output || "No output returned." },
      ],
      dag: row.current_dag || {},
    });
    setAnimateNew(false); setError(null);
  };

  const handleNewChat = () => {
    setActiveChat(null); setPrompt(""); setError(null); setAnimateNew(false);
    setTimeout(() => textareaRef.current?.focus(), 50);
  };

  // ── Delete chat ───────────────────────────────────────────────────────────
  const handleDelete = async (e, chatId) => {
    e.stopPropagation();
    setDeletingId(chatId);
    const { error: delErr } = await supabase.from("chat_history").delete().eq("id", chatId);
    if (delErr) { setError("Failed to delete chat"); setDeletingId(null); return; }
    setChats((prev) => prev.filter((c) => c.id !== chatId));
    if (activeChat?.id === chatId) { setActiveChat(null); setPrompt(""); }
    setDeletingId(null);
  };

  // ── Submit ────────────────────────────────────────────────────────────────
  const handleSubmit = async () => {
    const trimmed = prompt.trim();
    if (!trimmed || loading || chatIsComplete) return;

    const userMsg = { role: "user", text: trimmed };
    setActiveChat((prev) => ({ id: prev?.id ?? null, messages: [...(prev?.messages ?? []), userMsg], dag: prev?.dag ?? {} }));
    setPrompt(""); setLoading(true); setError(null); setAnimateNew(false);

    try {
      const res = await fetch("http://localhost:8000/run", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ user_prompt: trimmed }),
      });
      if (!res.ok) { const d = await res.json(); throw new Error(d.detail || "Backend error"); }

      const data         = await res.json();
      const assistantMsg = { role: "assistant", text: data.final_output || "Done." };
      const dag          = data.current_dag || {};

      const { data: insertData, error: insertErr } = await supabase
        .from("chat_history")
        .insert([{ user_id: user?.id ?? null, user_email: user?.email ?? null, user_prompt: trimmed, final_output: data.final_output ?? "", current_dag: dag }])
        .select("id,user_prompt,final_output,current_dag,created_at").single();

      if (insertErr) setError("Saved but failed to persist history.");

      const newRow = { id: insertData?.id ?? Date.now(), prompt: trimmed, final_output: data.final_output || "", current_dag: dag, createdAt: insertData?.created_at ?? new Date().toISOString() };
      setChats((prev) => [newRow, ...prev]);
      setAnimateNew(true);
      setActiveChat((prev) => ({ id: newRow.id, messages: [...(prev?.messages ?? [userMsg]), assistantMsg], dag }));
    } catch (err) {
      setError(err.message || "Something went wrong.");
      setActiveChat((prev) => ({ ...prev, messages: [...(prev?.messages ?? []), { role: "assistant", text: "⚠ " + (err.message || "Error") }] }));
    } finally {
      setLoading(false);
    }
  };

  const handleKeyDown = (e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); handleSubmit(); } };

  const currentDag      = activeChat?.dag ?? {};
  const currentMessages = activeChat?.messages ?? [];

  return (
    <>
      <canvas id="synapse-canvas" />
      <nav>
        <a href="/" className="nav-logo">Synapse<span>AI</span></a>
        <button className="btn-signout" onClick={() => supabase.auth.signOut()}>Sign out</button>
      </nav>

      <main className={`db-layout ${sidebarOpen ? "sidebar-open" : "sidebar-closed"}`}>

        {/* ── Sidebar toggle strip (always visible) ── */}
        <div className="sidebar-toggle-strip" onClick={() => setSidebarOpen((v) => !v)} title={sidebarOpen ? "Collapse sidebar" : "Expand sidebar"}>
          <div className="toggle-strip-lines">
            <span /><span /><span />
          </div>
          <div className={`toggle-arrow ${sidebarOpen ? "arrow-left" : "arrow-right"}`}>
            {sidebarOpen ? "‹" : "›"}
          </div>
        </div>

        {/* ── LEFT sidebar ── */}
        <aside className={`db-sidebar ${sidebarOpen ? "sidebar-visible" : "sidebar-hidden"}`}>
          <div className="sidebar-header">
            <span className="sidebar-title">History</span>
            <button className="btn-new-chat" onClick={handleNewChat} title="New Chat">+</button>
          </div>
          <div className="sidebar-list">
            {chats.length === 0 && <div className="sidebar-empty">No history yet</div>}
            {chats.map((chat) => (
              <div
                key={chat.id}
                className={`sidebar-item ${activeChat?.id === chat.id ? "active" : ""}`}
                onClick={() => openHistoryChat(chat)}
              >
                <div className="sidebar-item-inner">
                  <div className="sidebar-item-title">
                    {chat.prompt.slice(0, 32)}{chat.prompt.length > 32 ? "…" : ""}
                  </div>
                  <div className="sidebar-item-time">
                    {new Date(chat.createdAt).toLocaleString([], { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })}
                  </div>
                </div>
                <button
                  className={`btn-delete ${deletingId === chat.id ? "deleting" : ""}`}
                  onClick={(e) => handleDelete(e, chat.id)}
                  title="Delete chat"
                  disabled={deletingId === chat.id}
                >
                  {deletingId === chat.id
                    ? <span className="delete-spinner" />
                    : <svg width="11" height="11" viewBox="0 0 12 12" fill="none">
                        <path d="M1 1L11 11M11 1L1 11" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
                      </svg>}
                </button>
              </div>
            ))}
          </div>
        </aside>

        {/* ── MIDDLE chat ── */}
        <section className="db-chat">
          <div className="db-chat-header">
            <div className="db-header-left">
              <span className="live-dot" />
              <span className="db-chat-title">
                {activeChat
                  ? currentMessages[0]?.text.slice(0, 46) + (currentMessages[0]?.text.length > 46 ? "…" : "")
                  : "New Chat"}
              </span>
            </div>
            {loading && <span className="db-processing-badge">● Processing</span>}
          </div>

          <div className="db-chat-body">
            <ChatArea messages={currentMessages} loading={loading} animateLastAssistant={animateNew} />
          </div>

          {!chatIsComplete && (
            <div className="db-chat-input-wrap">
              {error && <div className="error-message">{error}</div>}
              <div className="db-input-row">
                <textarea
                  ref={textareaRef}
                  className="prompt-input db-textarea"
                  placeholder="Describe your task… (Enter to send)"
                  value={prompt} rows={2}
                  onChange={(e) => setPrompt(e.target.value)}
                  onKeyDown={handleKeyDown}
                  disabled={loading}
                />
                <button className="btn-send" onClick={handleSubmit} disabled={loading || !prompt.trim()}>
                  {loading
                    ? <span className="send-spinner" />
                    : <svg viewBox="0 0 20 20" fill="none" width="16" height="16">
                        <path d="M2 10L18 2L11 18L9 11L2 10Z" fill="currentColor" />
                      </svg>}
                </button>
              </div>
            </div>
          )}

          {chatIsComplete && !loading && (
            <div className="db-chat-locked">
              {error && <div className="error-message" style={{ marginBottom: "0.4rem" }}>{error}</div>}
              <div className="locked-msg">
                <span className="locked-icon">✓</span>
                Session complete
                <button className="btn-new-chat-inline" onClick={handleNewChat}>+ New chat</button>
              </div>
            </div>
          )}
        </section>

        {/* ── RIGHT DAG ── */}
        <section className="db-dag">
          <div className="db-dag-header">
            <div className="db-header-left">
              <span className="db-dag-title">Execution DAG</span>
              {(Array.isArray(currentDag) ? currentDag.length > 0 : Object.keys(currentDag).length > 0) && (
                <span className="dag-live-badge"><span className="dag-live-dot" />LIVE</span>
              )}
            </div>
            <span className="dag-node-count">
              {Array.isArray(currentDag) && currentDag.length > 0
                ? `${currentDag.length} node${currentDag.length !== 1 ? "s" : ""}`
                : Object.keys(currentDag).length > 0
                ? `${Object.keys(currentDag).length} node${Object.keys(currentDag).length !== 1 ? "s" : ""}`
                : "—"}
            </span>
          </div>
          <div className="db-dag-body">
            <DagGraph dag={currentDag} />
          </div>
        </section>

      </main>

      <style>{`
        /* ── Layout ── */
        .db-layout {
          position: relative; z-index: 1;
          display: grid;
          height: 100vh; padding-top: 60px; overflow: hidden;
          transition: grid-template-columns 0.3s cubic-bezier(0.4,0,0.2,1);
        }
        .db-layout.sidebar-open  { grid-template-columns: 14px 200px 1fr 340px; }
        .db-layout.sidebar-closed { grid-template-columns: 14px 0px 1fr 340px; }

        /* ── Sidebar toggle strip ── */
        .sidebar-toggle-strip {
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          gap: 10px;
          width: 14px;
          background: rgba(6,7,12,0.98);
          border-right: 1px solid rgba(0,245,212,0.15);
          cursor: pointer;
          z-index: 10;
          transition: background 0.18s, border-color 0.18s;
          position: relative;
          overflow: hidden;
        }
        .sidebar-toggle-strip:hover {
          background: rgba(0,245,212,0.06);
          border-color: rgba(0,245,212,0.4);
        }
        .sidebar-toggle-strip:hover .toggle-strip-lines span {
          background: rgba(0,245,212,0.7);
        }
        .sidebar-toggle-strip:hover .toggle-arrow {
          color: var(--cyan);
          opacity: 1;
        }
        .toggle-strip-lines {
          display: flex;
          flex-direction: column;
          gap: 3px;
          align-items: center;
        }
        .toggle-strip-lines span {
          display: block;
          width: 4px;
          height: 4px;
          border-radius: 50%;
          background: rgba(0,245,212,0.25);
          transition: background 0.18s, transform 0.18s;
        }
        .toggle-arrow {
          font-size: 10px;
          color: rgba(0,245,212,0.3);
          opacity: 0.6;
          transition: color 0.18s, opacity 0.18s;
          line-height: 1;
          user-select: none;
        }

        /* ── Sidebar ── */
        .db-sidebar {
          display: flex; flex-direction: column;
          background: rgba(6,7,12,0.98); border-right: 1px solid var(--border);
          overflow: hidden;
          transition: width 0.3s cubic-bezier(0.4,0,0.2,1), opacity 0.25s ease;
        }
        .db-sidebar.sidebar-hidden {
          width: 0; opacity: 0; pointer-events: none; border-right: none;
        }
        .db-sidebar.sidebar-visible {
          width: 200px; opacity: 1;
        }
        .sidebar-header {
          display: flex; align-items: center; justify-content: space-between;
          padding: 0.75rem 0.75rem 0.6rem; border-bottom: 1px solid var(--border); flex-shrink: 0;
          white-space: nowrap;
        }
        .sidebar-title {
          font-family: var(--font-display); font-size: 0.58rem;
          letter-spacing: 0.22em; text-transform: uppercase; color: var(--muted);
        }
        .btn-new-chat {
          width: 22px; height: 22px; border-radius: 50%;
          border: 1px solid var(--border); background: transparent;
          color: var(--cyan); font-size: 0.9rem; cursor: pointer;
          display: flex; align-items: center; justify-content: center; transition: all 0.18s;
        }
        .btn-new-chat:hover {
          background: rgba(0,245,212,0.12); border-color: var(--cyan);
          box-shadow: 0 0 10px rgba(0,245,212,0.3);
        }
        .sidebar-list {
          flex: 1; overflow-y: auto; padding: 0.4rem;
          display: flex; flex-direction: column; gap: 0.2rem;
        }
        .sidebar-list::-webkit-scrollbar { width: 2px; }
        .sidebar-list::-webkit-scrollbar-thumb { background: var(--border); border-radius: 2px; }
        .sidebar-empty {
          font-family: var(--font-mono); font-size: 0.65rem; color: var(--muted);
          padding: 0.85rem 0.4rem; text-align: center;
        }

        /* Sidebar item */
        .sidebar-item {
          display: flex; align-items: center; gap: 0.3rem;
          padding: 0.5rem 0.5rem; border: 1px solid transparent; border-radius: 7px;
          cursor: pointer; transition: all 0.16s; white-space: nowrap;
        }
        .sidebar-item:hover { background: rgba(0,245,212,0.05); border-color: rgba(0,245,212,0.15); }
        .sidebar-item.active { background: rgba(0,245,212,0.09); border-color: rgba(0,245,212,0.32); }
        .sidebar-item-inner { flex: 1; min-width: 0; }
        .sidebar-item-title {
          font-family: var(--font-mono); font-size: 0.68rem; color: var(--white);
          line-height: 1.35; margin-bottom: 0.15rem;
          white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
        }
        .sidebar-item.active .sidebar-item-title { color: var(--cyan); }
        .sidebar-item-time { font-family: var(--font-mono); font-size: 0.56rem; color: var(--muted); }

        /* Delete button */
        .btn-delete {
          flex-shrink: 0; width: 18px; height: 18px; border-radius: 4px;
          border: none; background: transparent; color: var(--muted);
          display: flex; align-items: center; justify-content: center;
          cursor: pointer; opacity: 0; transition: all 0.15s;
        }
        .sidebar-item:hover .btn-delete { opacity: 1; }
        .btn-delete:hover { background: rgba(255,80,80,0.15); color: #ff6b6b; }
        .btn-delete.deleting { opacity: 1; }
        .delete-spinner {
          width: 8px; height: 8px; border: 1.5px solid transparent;
          border-top-color: var(--muted); border-radius: 50%;
          animation: spin 0.6s linear infinite;
        }

        /* ── Chat panel ── */
        .db-chat {
          display: flex; flex-direction: column;
          background: rgba(5,5,8,0.92); border-right: 1px solid var(--border); overflow: hidden;
        }
        .db-chat-header {
          padding: 0.7rem 1rem; border-bottom: 1px solid var(--border); flex-shrink: 0;
          background: rgba(7,8,14,0.65); backdrop-filter: blur(10px);
          display: flex; align-items: center; justify-content: space-between;
        }
        .db-header-left { display: flex; align-items: center; gap: 0.45rem; }
        .live-dot {
          width: 5px; height: 5px; border-radius: 50%; flex-shrink: 0;
          background: #00f5d4; box-shadow: 0 0 5px #00f5d4;
          animation: livePulse 2s ease-in-out infinite;
        }
        @keyframes livePulse {
          0%,100% { opacity: 1; box-shadow: 0 0 5px #00f5d4; }
          50%      { opacity: 0.35; box-shadow: 0 0 12px #00f5d4; }
        }
        .db-chat-title { font-family: var(--font-mono); font-size: 0.68rem; letter-spacing: 0.06em; color: var(--muted); }
        .db-processing-badge {
          font-family: var(--font-mono); font-size: 0.55rem; letter-spacing: 0.12em;
          text-transform: uppercase; color: var(--cyan);
          border: 1px solid rgba(0,245,212,0.28); border-radius: 20px; padding: 0.15rem 0.5rem;
          animation: badgeFade 1.3s ease-in-out infinite;
        }
        @keyframes badgeFade { 0%,100% { opacity: 1; } 50% { opacity: 0.35; } }

        .db-chat-body { flex: 1; overflow-y: auto; padding: 1rem 1.25rem; scroll-behavior: smooth; }
        .db-chat-body::-webkit-scrollbar { width: 2px; }
        .db-chat-body::-webkit-scrollbar-thumb { background: var(--border); border-radius: 2px; }

        /* Welcome */
        .chat-welcome {
          display: flex; flex-direction: column; align-items: center; justify-content: center;
          height: 100%; text-align: center; padding: 2rem; gap: 0.6rem;
        }
        .chat-welcome-icon { font-size: 2rem; color: var(--cyan); opacity: 0.35; margin-bottom: 0.4rem; }
        .chat-welcome-title { font-family: var(--font-display); font-size: 0.9rem; font-weight: 700; letter-spacing: 0.08em; color: var(--white); }
        .chat-welcome-sub { font-family: var(--font-mono); font-size: 0.7rem; color: var(--muted); max-width: 340px; line-height: 1.6; }

        /* Messages */
        .chat-messages { display: flex; flex-direction: column; gap: 0.7rem; }
        .bubble-animate { animation: bubblePop 0.25s cubic-bezier(0.34,1.56,0.64,1) both; }
        @keyframes bubblePop { from { opacity: 0; transform: translateY(8px) scale(0.97); } to { opacity: 1; transform: translateY(0) scale(1); } }

        .chat-bubble {
          max-width: 80%; border-radius: 12px; padding: 0.6rem 0.85rem;
          font-family: var(--font-mono); font-size: 0.78rem; line-height: 1.55; border: 1px solid transparent;
        }
        .chat-bubble.user { align-self: flex-end; background: rgba(0,158,206,0.13); border-color: rgba(0,158,206,0.32); }
        .chat-bubble.assistant { align-self: flex-start; background: rgba(0,245,212,0.06); border-color: rgba(0,245,212,0.2); }
        .bubble-role-label {
          font-size: 0.52rem; letter-spacing: 0.2em; text-transform: uppercase;
          margin-bottom: 0.25rem; font-weight: 700;
        }
        .chat-bubble.user .bubble-role-label { color: rgba(0,158,206,0.75); }
        .chat-bubble.assistant .bubble-role-label { color: var(--cyan-dim); }
        .bubble-text { color: var(--white); white-space: pre-wrap; }
        .cursor-blink { display: inline-block; color: var(--cyan); animation: cursorBlink 0.5s step-end infinite; margin-left: 1px; }
        @keyframes cursorBlink { 0%,100% { opacity: 1; } 50% { opacity: 0; } }

        /* Typing dots */
        .typing-bubble { display: flex; align-items: center; gap: 4px; padding: 0.7rem 0.9rem; min-width: 52px; }
        .typing-dot { width: 6px; height: 6px; border-radius: 50%; background: var(--cyan); animation: typingBounce 1.2s ease infinite; }
        .typing-dot:nth-child(2) { animation-delay: 0.18s; }
        .typing-dot:nth-child(3) { animation-delay: 0.36s; }
        @keyframes typingBounce { 0%,60%,100% { transform: translateY(0); opacity: 0.35; } 30% { transform: translateY(-5px); opacity: 1; } }

        /* Input area */
        .db-chat-input-wrap { padding: 0.6rem 0.85rem; border-top: 1px solid var(--border); background: rgba(7,8,14,0.88); flex-shrink: 0; }
        .db-input-row { display: flex; align-items: flex-end; gap: 0.5rem; }
        .db-textarea { flex: 1; min-height: 50px; max-height: 140px; resize: vertical; border-radius: 9px; font-size: 0.77rem; }
        .btn-send {
          width: 38px; height: 38px; border-radius: 9px;
          border: 1px solid var(--cyan); background: var(--cyan); color: var(--bg);
          display: flex; align-items: center; justify-content: center; cursor: pointer; flex-shrink: 0; transition: all 0.18s;
        }
        .btn-send:hover:not(:disabled) { background: var(--white); box-shadow: 0 0 18px rgba(0,245,212,0.4); }
        .btn-send:disabled { opacity: 0.38; cursor: not-allowed; }
        .send-spinner { width: 12px; height: 12px; border: 2px solid transparent; border-top-color: var(--bg); border-radius: 50%; animation: spin 0.7s linear infinite; }
        @keyframes spin { to { transform: rotate(360deg); } }

        /* Locked footer */
        .db-chat-locked { padding: 0.65rem 1rem; border-top: 1px solid var(--border); background: rgba(7,8,14,0.88); flex-shrink: 0; }
        .locked-msg { display: flex; align-items: center; gap: 0.45rem; font-family: var(--font-mono); font-size: 0.7rem; color: var(--muted); }
        .locked-icon { color: var(--cyan); opacity: 0.75; font-size: 0.8rem; }
        .btn-new-chat-inline {
          margin-left: auto; padding: 0.28rem 0.7rem; border-radius: 7px;
          border: 1px solid rgba(0,245,212,0.32); background: rgba(0,245,212,0.07);
          color: var(--cyan); font-family: var(--font-mono); font-size: 0.68rem; cursor: pointer; transition: all 0.18s;
        }
        .btn-new-chat-inline:hover { background: rgba(0,245,212,0.16); border-color: var(--cyan); box-shadow: 0 0 10px rgba(0,245,212,0.2); }

        /* ── DAG panel ── */
        .db-dag { display: flex; flex-direction: column; background: rgba(6,7,12,0.98); overflow: hidden; }
        .db-dag-header {
          display: flex; align-items: center; justify-content: space-between;
          padding: 0.7rem 0.9rem; border-bottom: 1px solid var(--border); flex-shrink: 0;
          background: rgba(7,8,14,0.65); backdrop-filter: blur(10px);
        }
        .db-dag-title { font-family: var(--font-display); font-size: 0.58rem; letter-spacing: 0.2em; text-transform: uppercase; color: var(--muted); }
        .dag-live-badge {
          display: flex; align-items: center; gap: 0.28rem;
          font-family: var(--font-mono); font-size: 0.5rem; letter-spacing: 0.15em;
          color: #00f5d4; border: 1px solid rgba(0,245,212,0.28); border-radius: 20px; padding: 0.12rem 0.4rem;
        }
        .dag-live-dot { width: 4px; height: 4px; border-radius: 50%; background: #00f5d4; animation: livePulse 1.5s ease-in-out infinite; }
        .dag-node-count { font-family: var(--font-mono); font-size: 0.58rem; color: var(--cyan); letter-spacing: 0.1em; }
        .db-dag-body { flex: 1; overflow-y: auto; padding: 1rem 0.5rem 2rem; position: relative; }
        .db-dag-body::-webkit-scrollbar { width: 2px; }
        .db-dag-body::-webkit-scrollbar-thumb { background: var(--border); border-radius: 2px; }

        /* DAG empty */
        .dag-empty { display: flex; flex-direction: column; align-items: center; justify-content: center; height: 100%; text-align: center; gap: 0.4rem; padding: 1.5rem; }
        .dag-empty-icon { font-size: 1.6rem; color: var(--muted); opacity: 0.35; margin-bottom: 0.35rem; }
        .dag-empty p { font-family: var(--font-mono); font-size: 0.72rem; color: var(--muted); }
        .dag-empty-sub { font-size: 0.62rem !important; opacity: 0.55; }

        /* ── LandingPage-style DAG nodes (Dashboard version) ── */
        .db-dag-live-wrap {
          position: relative; width: 100%; min-height: 520px; height: auto;
        }
        .db-dag-svg {
          position: absolute; top: 0; left: 0; width: 100%; height: 100%;
          pointer-events: none; overflow: visible;
        }
        .db-dag-node {
          position: absolute; transform: translate(-50%, -50%);
          display: flex; flex-direction: column; gap: 2px;
          background: rgba(0,245,212,0.06); border: 1px solid rgba(0,245,212,0.3);
          border-radius: 8px; padding: 6px 10px; min-width: 104px; max-width: 132px;
          font-family: var(--font-mono); font-size: 0.62rem; color: var(--white);
          transition: all 0.35s ease;
          animation: dbNodeIn 0.4s cubic-bezier(0.34,1.56,0.64,1) both;
          cursor: default; z-index: 2;
        }
        .db-dag-node.orange { background: rgba(255,107,53,0.08); border-color: rgba(255,107,53,0.35); }
        .db-dag-node.active {
          background: rgba(0,245,212,0.13); border-color: rgba(0,245,212,0.8);
          box-shadow: 0 0 14px rgba(0,245,212,0.28), 0 0 28px rgba(0,245,212,0.10);
          transform: translate(-50%, -50%) scale(1.04);
        }
        .db-dag-node.orange.active {
          background: rgba(255,107,53,0.15); border-color: rgba(255,107,53,0.9);
          box-shadow: 0 0 14px rgba(255,107,53,0.3);
        }
        @keyframes dbNodeIn {
          from { opacity: 0; transform: translate(-50%, -44%) scale(0.9); }
          to   { opacity: 1; transform: translate(-50%, -50%) scale(1); }
        }
        .db-node-label {
          font-size: 0.46rem; letter-spacing: 0.18em; text-transform: uppercase;
          color: var(--cyan); font-weight: 700; opacity: 0.7; margin-bottom: 1px;
        }
        .db-dag-node.orange .db-node-label { color: var(--orange); }
        .db-node-key { font-size: 0.62rem; font-weight: 700; color: var(--white); letter-spacing: 0.03em; line-height: 1.3; word-break: break-word; }
        .db-node-desc { font-size: 0.52rem; color: var(--muted); line-height: 1.35; margin-top: 1px; }

        /* Responsive */
        @media (max-width: 860px) {
          .db-layout { grid-template-columns: 1fr !important; grid-template-rows: auto auto 1fr auto; overflow-y: auto; }
          .sidebar-toggle-strip { display: none; }
          .db-sidebar { width: 100% !important; height: 180px; border-right: none; border-bottom: 1px solid var(--border); }
          .db-sidebar.sidebar-hidden { height: 0; width: 100% !important; }
          .db-dag { height: 340px; border-top: 1px solid var(--border); }
        }
      `}</style>
    </>
  );
}