import { useEffect, useMemo, useRef, useState } from "react";
import { AtSign, Hash, Paperclip, Send, UserRound, UsersRound, Wifi, WifiOff, Sparkles, Search, Smile, MessageCircle, ArrowDown, Copy, Check } from "lucide-react";
import { io } from "socket.io-client";
import { api, getToken } from "../services/api";

const SOCKET_URL = import.meta.env.VITE_SOCKET_URL || "http://localhost:5000";
const GROUPS = [
  { id: "general", name: "general", description: "Team-wide conversation" },
  { id: "development", name: "development", description: "Development discussion" },
  { id: "announcements", name: "announcements", description: "Team announcements" },
];

export default function Chat({ user }) {
  const [mode, setMode] = useState("group");
  const [channel, setChannel] = useState("general");
  const [members, setMembers] = useState([]);
  const [peer, setPeer] = useState(null);
  const [messages, setMessages] = useState([]);
  const [text, setText] = useState("");
  const [mentionQuery, setMentionQuery] = useState("");
  const [connected, setConnected] = useState(false);
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState("");
  const [threadInsight,setThreadInsight]=useState("");
  const [threadBusy,setThreadBusy]=useState(false);
  const [insightKind,setInsightKind]=useState("summary");
  const [chatSearch,setChatSearch]=useState("");
  const [showSearch,setShowSearch]=useState(false);
  const [showEmoji,setShowEmoji]=useState(false);
  const [copied,setCopied]=useState("");
  const socketRef = useRef(null);
  const endRef = useRef(null);

  const roomKey = mode === "group" ? `group:${channel}` : `dm:${peer?._id || peer?.id || ""}`;
  const visibleMessages = useMemo(() => messages.filter(m => String(m.text || m.content || "").toLowerCase().includes(chatSearch.toLowerCase())), [messages, chatSearch]);
  const activeTitle = mode === "group" ? `# ${channel}` : peer ? peer.name : "Direct message";

  const filteredMembers = useMemo(() => {
    if (!mentionQuery) return [];
    const q = mentionQuery.toLowerCase();
    return members.filter((m) => m._id !== user.id && m.name.toLowerCase().includes(q)).slice(0, 6);
  }, [mentionQuery, members, user.id]);

  useEffect(() => {
    api.get("/team/members").then((r) => setMembers(r.data.members || [])).catch(() => {});
  }, []);

  useEffect(() => {
    let mounted = true;
    const token = getToken();
    if (!token) {
      setError("Session expired. Please login again.");
      setLoading(false);
      return;
    }

    async function load() {
      try {
        setLoading(true);
        setError("");
        const endpoint = mode === "group"
          ? `/chat/group/${channel}`
          : peer ? `/chat/dm/${peer._id}` : null;
        if (!endpoint) {
          setMessages([]);
          setLoading(false);
          return;
        }
        const r = await api.get(endpoint);
        if (mounted) setMessages(r.data.messages || []);
      } catch (err) {
        if (mounted) setError(err.response?.data?.message || "Unable to load messages.");
      } finally {
        if (mounted) setLoading(false);
      }
    }

    load();

    const socket = io(SOCKET_URL, {
      auth: { token },
      // Polling-first prevents premature WebSocket-close warnings during
      // React StrictMode mounts and rapid room navigation.
      transports: ["polling"],
      reconnection: true,
      reconnectionAttempts: 10,
      reconnectionDelay: 800,
    });

    socketRef.current = socket;

    socket.on("connect", () => {
      if (!mounted) return;
      setConnected(true);
      setError("");
      socket.emit("join-room", { type: mode, channel, peerId: peer?._id });
    });

    socket.on("message:new", (message) => {
      if (!mounted || !message) return;
      const matches = mode === "group"
        ? message.type === "group" && message.channel === channel
        : message.type === "direct" &&
          ((String(message.sender?._id || message.sender) === String(peer?._id)) ||
           (String(message.recipient?._id || message.recipient) === String(user.id)));

      if (!matches) return;

      setMessages((current) =>
        current.some((m) => m._id === message._id) ? current : [...current, message]
      );
    });

    socket.on("connect_error", (err) => {
      if (mounted) {
        setConnected(false);
        setError(err.message === "Unauthorized" ? "Session expired. Please login again." : err.message);
      }
    });

    socket.on("disconnect", () => mounted && setConnected(false));

    return () => {
      mounted = false;
      if (socket.connected) socket.emit("leave-room", { type: mode, channel, peerId: peer?._id });
      socket.removeAllListeners();
      socket.disconnect();
      socketRef.current = null;
    };
  }, [mode, channel, peer?._id, user.id]);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  function chooseMention(member) {
    const match = text.match(/(^|\s)@([^\s]*)$/);
    if (!match) return;
    const next = text.slice(0, match.index + match[1].length) + `@${member.name} `;
    setText(next);
    setMentionQuery("");
  }

  function handleTextChange(e) {
    const value = e.target.value;
    setText(value);
    const match = value.match(/(^|\s)@([^\s]*)$/);
    setMentionQuery(match ? match[2] : "");
  }

  async function summarizeThread(kind='summary') {
    const snippet=messages.slice(-18).map(m=>`${m.sender?.name||'Member'}: ${String(m.text||m.content||'').slice(0,200)}`).join('\n').slice(0,3000);
    if(!snippet.trim())return;
    setThreadBusy(true);setThreadInsight('');setInsightKind(kind);
    try{
      const question=kind==='reply'?'Draft a concise, professional reply to this conversation. Clearly distinguish suggestions from commitments.':'Summarize key decisions, blockers, owners and next actions from this chat thread. Do not invent missing owners.';
      const r=await api.post('/ai/chat',{question:`${question}\n\nChat excerpt:\n${snippet}`,conversation:[]});
      if(!r.data?.success)throw Error(r.data?.message||'AI unavailable');
      setThreadInsight(r.data.answer||'No summary available');
    }catch(e){setError(e.response?.data?.message||e.message||'Thread analysis failed')}finally{setThreadBusy(false)}
  }

  async function copyMessage(message) {
    try { await navigator.clipboard.writeText(message.text || message.content || ""); setCopied(String(message._id)); window.setTimeout(() => setCopied(""), 1300); } catch { setError("Clipboard access not available."); }
  }

  function send(e) {
    e.preventDefault();
    const clean = text.trim();
    if (!clean || !connected || sending) return;

    const mentions = members
      .filter((m) => new RegExp(`@${escapeRegExp(m.name)}\\b`, "i").test(clean))
      .map((m) => m._id);

    setSending(true);
    setError("");

    socketRef.current?.emit(
      "send-message",
      { type: mode, channel, peerId: peer?._id, text: clean, mentions },
      (response) => {
        setSending(false);
        if (!response?.success) {
          setError(response?.message || "Message failed.");
          return;
        }
        setText("");
        setMentionQuery("");
        setShowEmoji(false);
      }
    );
  }

  return (
    <div className="page chat-page">
      <div className="page-title">
        <div>
          <span className="eyebrow">REAL-TIME COLLABORATION</span>
          <h1>Team conversations <span className="chat-title-spark"><Sparkles size={19}/></span></h1>
          <p>One creative space to brainstorm, discuss and build together.</p>
        </div>
        <div className={`live-pill ${connected ? "online" : "offline"}`}>
          {connected ? <Wifi size={15} /> : <WifiOff size={15} />}
          {connected ? "Connected" : "Offline"}
        </div>
      </div>

      <div className="chat-ai-tools"><button onClick={()=>summarizeThread('summary')} disabled={threadBusy||!messages.length}><Sparkles size={15}/> Summarize thread</button><button onClick={()=>summarizeThread('reply')} disabled={threadBusy||!messages.length}><MessageCircle size={15}/> Smart reply</button>{threadBusy&&<span className="upgrade-muted">Analyzing conversation…</span>}</div>
      {threadInsight&&<section className="context-ai-result" aria-live="polite"><div className="context-ai-head"><strong>AI conversation insight</strong><button onClick={()=>setThreadInsight('')} aria-label="Close thread insight">×</button></div><div className="upgrade-result">{threadInsight}</div><div className="chat-insight-actions">{insightKind === "reply" && <button onClick={()=>{setText(threadInsight);setThreadInsight("")}}>Use as draft</button>}<button onClick={()=>navigator.clipboard?.writeText(threadInsight).catch(()=>setError("Cannot copy insight"))}>Copy text</button></div></section>}
      <div className="chat-layout">
        <aside className="channel-list">
          <div className="chat-sidebar-caption"><span>CHANNELS</span><Hash size={14}/></div>
          {GROUPS.map((item) => (
            <button
              key={item.id}
              className={`channel ${mode === "group" && channel === item.id ? "active" : ""}`}
              onClick={() => { setMode("group"); setChannel(item.id); setPeer(null); }}
            >
              <span className="chat-channel-glyph"><Hash size={16}/></span><span className="chat-channel-copy"><strong>{item.name}</strong><small>{item.description}</small></span>
            </button>
          ))}

          <div className="chat-sidebar-caption"><span>DIRECT MESSAGES</span><UsersRound size={14}/></div>
          {members.filter((m) => m._id !== user.id).map((member) => (
            <button
              key={member._id}
              className={`channel ${mode === "direct" && peer?._id === member._id ? "active" : ""}`}
              onClick={() => { setMode("direct"); setPeer(member); }}
            >
              <div className="mini-avatar">{member.name?.[0]?.toUpperCase()}</div>
              <span className="chat-channel-copy"><strong>{member.name}</strong><small>{member.role}</small></span>
            </button>
          ))}

          {!members.length && <div className="empty mini">No other team members yet.</div>}
        </aside>

        <section className="chat-box">
          <div className="chat-head">
            <div>
              <b>{mode === "group" ? <Hash size={17} /> : <UserRound size={17} />} {activeTitle}</b>
              <small>{mode === "group" ? GROUPS.find((g) => g.id === channel)?.description : peer?.email}</small>
            </div>
            <div className="chat-head-controls"><button className={showSearch ? "active" : ""} type="button" title="Search this conversation" aria-label="Search conversation" onClick={()=>{setShowSearch(v=>!v);setChatSearch("")}}><Search size={17}/></button><span className="chat-type">{mode === "group" ? <><UsersRound size={13} /> Group</> : <><UserRound size={13} /> Private</>}</span></div>
          </div>

          {showSearch && <label className="chat-search-bar"><Search size={16}/><input autoFocus value={chatSearch} placeholder="Find messages in this conversation" onChange={e=>setChatSearch(e.target.value)}/><span>{visibleMessages.length} results</span></label>}
          {error && <div className="chat-error">{error}</div>}

          <div className="messages">
            {loading ? (
              <div className="chat-empty"><div className="chat-loader" /><p>Loading messages…</p></div>
            ) : messages.length === 0 ? (
              <div className="chat-empty">
                {mode === "group" ? <Hash size={28} /> : <UserRound size={28} />}
                <h3>{activeTitle}</h3>
                <p>Every great idea starts with a conversation. Say hello to your team!</p><div className="chat-starters"><button onClick={()=>setText("Hey team! 👋 What are we working on today?")}>👋 Say hello</button><button onClick={()=>setText("💡 I have an idea to share: ")}>💡 Share idea</button><button onClick={()=>setText("🚀 Quick project update: ")}>🚀 Post update</button></div>
              </div>
            ) : (
              visibleMessages.length ? visibleMessages.map((m, i) => {
                const previous = visibleMessages[i-1];
                const currentDate = m.createdAt && new Date(m.createdAt).toDateString();
                const previousDate = previous?.createdAt && new Date(previous.createdAt).toDateString();
                return <div key={m._id || i}>{currentDate !== previousDate && <div className="chat-day-divider"><span>{currentDate === new Date().toDateString() ? "Today" : currentDate || "Conversation"}</span></div>}<div className="chat-message-row"><MessageBubble message={m} own={String(m.sender?._id || m.sender) === String(user.id)} /><button className="chat-copy-message" title="Copy message" aria-label="Copy message" onClick={()=>copyMessage(m)}>{copied === String(m._id) ? <Check size={14}/> : <Copy size={14}/>}</button></div></div>;
              }) : <div className="chat-empty">No messages match your search.</div>
            )}
            <div ref={endRef} />
          </div>

          <form className="chat-compose-wrap" onSubmit={send}>
            {mentionQuery && filteredMembers.length > 0 && (
              <div className="mention-menu">
                {filteredMembers.map((member) => (
                  <button type="button" key={member._id} onClick={() => chooseMention(member)}>
                    <span className="mini-avatar">{member.name[0].toUpperCase()}</span>
                    <span><strong>{member.name}</strong><small>{member.role}</small></span>
                  </button>
                ))}
              </div>
            )}
            <div className="chat-compose-hint"><Sparkles size={13}/> Tip: use @ to mention teammates</div>
            {showEmoji && <div className="chat-emoji-picker">{["😀","🎉","👏","🔥","💡","🚀","✅","❤️","👀","🙌"].map(emoji=><button key={emoji} type="button" onClick={()=>{setText(t=>t+emoji);setShowEmoji(false)}}>{emoji}</button>)}</div>}
            <div className="chat-compose">
              <button type="button" className="icon-btn" disabled title="Attachments can be enabled with object storage">
                <Paperclip size={18} />
              </button>
              <button type="button" className="icon-btn chat-emoji-toggle" aria-label="Insert emoji" title="Insert emoji" onClick={()=>setShowEmoji(x=>!x)}><Smile size={18}/></button>
              <textarea
                rows={2}
                value={text}
                onChange={handleTextChange}
                onKeyDown={e=>{if(e.key==="Enter"&&!e.shiftKey){e.preventDefault();send(e)}}}
                placeholder={connected ? `Message ${activeTitle}… use @ to tag` : "Connecting…"}
                maxLength={4000}
                disabled={!connected || sending || (mode === "direct" && !peer)}
              />
              <button className="primary send" disabled={!connected || !text.trim() || sending || (mode === "direct" && !peer)}>
                <Send size={17} />
              </button>
            </div>
            <span className="chat-compose-footer">Enter to send · Shift + Enter for new line</span>
          </form>
        </section>
      </div>
    </div>
  );
}

function MessageBubble({ message, own }) {
  const sender = message.sender || {};
  const name = sender.name || "Unknown";
  return (
    <div className={`message ${own ? "own" : ""}`}>
      <div className="avatar">{sender.avatar ? <img src={sender.avatar} alt="" /> : name[0]?.toUpperCase()}</div>
      <div className="message-content">
        <div className="message-meta">
          <b>{name}</b>
          {sender.role && <span>{sender.role.replace("_", " ")}</span>}
          <time>{message.createdAt ? new Date(message.createdAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) : ""}</time>
        </div>
        <p>{renderMentions(message.text)}</p>
      </div>
    </div>
  );
}

function renderMentions(text = "") {
  return text.split(/(@[A-Za-z0-9_][A-Za-z0-9 _-]*?)(?=\s|$)/g).map((part, i) =>
    part.startsWith("@") ? <mark key={i}>{part}</mark> : part
  );
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
