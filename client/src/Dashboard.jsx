import { useEffect, useState } from "react";
import { supabase } from "./supabaseClient";
import "./styles/styles.css";

export default function Dashboard() {
  const [user, setUser] = useState(null);
  const [chats, setChats] = useState([]);
  const [selectedChatId, setSelectedChatId] = useState(null);
  const [prompt, setPrompt] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setUser(session?.user ?? null);
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (_event, session) => setUser(session?.user ?? null)
    );
    return () => subscription.unsubscribe();
  }, []);

  useEffect(() => {
    const loadChatHistory = async () => {
      if (!user?.id) {
        setChats([]);
        setSelectedChatId(null);
        return;
      }

      const { data, error } = await supabase
        .from("chat_history")
        .select("id,user_prompt,final_output,current_dag,created_at")
        .eq("user_id", user.id)
        .order("created_at", { ascending: false });

      if (error) {
        console.error("Supabase load chat history error", error);
        setError("Failed to load chat history");
        return;
      }

      if (Array.isArray(data)) {
        const mapped = data.map((row) => ({
          id: row.id,
          prompt: row.user_prompt,
          final_output: row.final_output,
          current_dag: row.current_dag, 
          createdAt: row.created_at,
        }));

        setChats(mapped);
        if (mapped.length > 0) {
          setSelectedChatId(mapped[0].id);
        }
      }
    };

    loadChatHistory();
  }, [user]);

  const handleSignOut = async () => {
    await supabase.auth.signOut();
  };

  const handleNewChat = () => {
    setPrompt("");
    setSelectedChatId(null);
    setError(null);
  };

  const handleSelectChat = (id) => {
    setSelectedChatId(id);
    setError(null);
  };

  const handleSubmit = async (event) => {
    event.preventDefault();

    const trimmedPrompt = prompt.trim();
    if (!trimmedPrompt) return;

    setLoading(true);
    setError(null);

    try {
      const response = await fetch("http://localhost:8000/run", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ user_prompt: trimmedPrompt }),
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.detail || "Failed to call backend");
      }

      const data = await response.json();

      const payload = {
        user_id: user?.id ?? null,
        user_email: user?.email ?? null,
        user_prompt: trimmedPrompt,
        final_output: data.final_output ?? "",
        current_dag: data.current_dag ?? {},
      };

      const { error: insertError, data: insertData } = await supabase
        .from("chat_history")
        .insert([payload])
        .select("id,user_prompt,final_output,current_dag,created_at")
        .single();

      if (insertError) {
        console.error("Supabase insert chat error", insertError);
        setError("Failed to save chat history");
      }

      const chat = {
        id: insertData?.id ?? Date.now(),
        prompt: trimmedPrompt,
        final_output: data.final_output || "",
        current_dag: data.current_dag || {},
        createdAt: insertData?.created_at ?? new Date().toISOString(),
      };

      setChats((prev) => [chat, ...prev]);
      setSelectedChatId(chat.id);
      setPrompt("");
    } catch (err) {
      setError(err.message || "Something went wrong");
    } finally {
      setLoading(false);
    }
  };

  const email = user?.email ?? "…";
  const name  = user?.user_metadata?.full_name
              || user?.user_metadata?.name
              || email.split("@")[0];
  const avatar = user?.user_metadata?.avatar_url;
  const selectedChat = chats.find((chat) => chat.id === selectedChatId);

  return (
    <>
      <canvas id="synapse-canvas" />

      <nav>
        <a href="/" className="nav-logo">Synapse<span>AI</span></a>
        <button className="btn-signout" style={{ marginLeft: "auto" }} onClick={handleSignOut}>
          Sign out
        </button>
      </nav>

      <main className="dashboard-container">
        <aside className="left-panel">
          <div className="measure-header">
            <button className="btn-primary" onClick={handleNewChat}>
              + New Chat
            </button>
          </div>

          <div className="chat-list">
            {chats.length === 0 && (
              <div className="empty-state">No chats yet. Start a new chat.</div>
            )}
            {chats.map((chat) => (
              <button
                key={chat.id}
                className={`chat-item ${selectedChatId === chat.id ? "selected" : ""}`}
                onClick={() => handleSelectChat(chat.id)}
              >
                <div className="chat-item-title">{chat.prompt.slice(0, 40)}{chat.prompt.length > 40 ? "..." : ""}</div>
                <div className="chat-item-time">{new Date(chat.createdAt).toLocaleTimeString()}</div>
              </button>
            ))}
          </div>

          <div className="chat-input-area">
            <form onSubmit={handleSubmit} className="input-form">
              <textarea
                placeholder="Enter your prompt here..."
                value={prompt}
                onChange={(e) => setPrompt(e.target.value)}
                rows={4}
                className="prompt-input"
              />
              <button type="submit" className="btn-primary" disabled={loading}>
                {loading ? "Running..." : "Send Prompt"}
              </button>
            </form>
            {error && <div className="error-message">{error}</div>}
          </div>

          {selectedChat && (
            <div className="chat-history">
              <div className="chat-bubble user">Prompt: {selectedChat.prompt}</div>
              <div className="chat-bubble assistant">{selectedChat.final_output || "No output returned"}</div>
            </div>
          )}
        </aside>

        <section className="right-panel">
          <h2>Current DAG</h2>
          <div className="dag-output">
            {selectedChat ? (
              <pre>{JSON.stringify(selectedChat.current_dag, null, 2)}</pre>
            ) : (
              <div className="empty-state">No DAG yet. Send a prompt to generate the DAG.</div>
            )}
          </div>
        </section>
      </main>
    </>
  );
}
