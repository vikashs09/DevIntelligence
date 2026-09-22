import { useEffect, useMemo, useRef, useState } from "react";
import { AtSign, Hash, Paperclip, Send, UserRound, UsersRound, Wifi, WifiOff } from "lucide-react";
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
  const socketRef = useRef(null);
  const endRef = useRef(null);

  const roomKey = mode === "group" ? `group:${channel}` : `dm:${peer?._id || peer?.id || ""}`;
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
      transports: ["websocket", "polling"],
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
      socket.emit("leave-room", { type: mode, channel, peerId: peer?._id });
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
      }
    );
  }

  return (
    <div className="page chat-page">
      <div className="page-title">
        <div>
          <span className="eyebrow">REAL-TIME COLLABORATION</span>
          <h1>Chat</h1>
          <p>Group channels, private conversations and mention-driven notifications.</p>
        </div>
        <div className={`live-pill ${connected ? "online" : "offline"}`}>
          {connected ? <Wifi size={15} /> : <WifiOff size={15} />}
          {connected ? "Connected" : "Offline"}
        </div>
      </div>

      <div className="chat-layout">
        <aside className="channel-list">
          <b>GROUP CHANNELS</b>
          {GROUPS.map((item) => (
            <button
              key={item.id}
              className={`channel ${mode === "group" && channel === item.id ? "active" : ""}`}
              onClick={() => { setMode("group"); setChannel(item.id); setPeer(null); }}
            >
              <Hash size={16} /> {item.name}
            </button>
          ))}

          <b>PEOPLE</b>
          {members.filter((m) => m._id !== user.id).map((member) => (
            <button
              key={member._id}
              className={`channel ${mode === "direct" && peer?._id === member._id ? "active" : ""}`}
              onClick={() => { setMode("direct"); setPeer(member); }}
            >
              <div className="mini-avatar">{member.name?.[0]?.toUpperCase()}</div>
              <span>{member.name}</span>
              <small>{member.role}</small>
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
            <span className="chat-type">{mode === "group" ? <><UsersRound size={13} /> Group</> : <><UserRound size={13} /> Private</>}</span>
          </div>

          {error && <div className="chat-error">{error}</div>}

          <div className="messages">
            {loading ? (
              <div className="chat-empty"><div className="chat-loader" /><p>Loading messages…</p></div>
            ) : messages.length === 0 ? (
              <div className="chat-empty">
                {mode === "group" ? <Hash size={28} /> : <UserRound size={28} />}
                <h3>{activeTitle}</h3>
                <p>Nothing here yet. Start the conversation.</p>
              </div>
            ) : (
              messages.map((m) => (
                <MessageBubble key={m._id} message={m} own={String(m.sender?._id || m.sender) === String(user.id)} />
              ))
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
            <div className="chat-compose">
              <button type="button" className="icon-btn" disabled title="Attachments can be enabled with object storage">
                <Paperclip size={18} />
              </button>
              <input
                value={text}
                onChange={handleTextChange}
                placeholder={connected ? `Message ${activeTitle}… use @ to tag` : "Connecting…"}
                maxLength={4000}
                disabled={!connected || sending || (mode === "direct" && !peer)}
              />
              <button className="primary send" disabled={!connected || !text.trim() || sending || (mode === "direct" && !peer)}>
                <Send size={17} />
              </button>
            </div>
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
