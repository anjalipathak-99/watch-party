import { useEffect, useRef, useState, FormEvent } from "react";
import { socket } from "../socket";
import type { ChatMessage } from "../types";

interface Props {
  selfUserId: string;
}

export default function Chat({ selfUserId }: Props) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [text, setText] = useState("");
  const logRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const onMessage = (msg: ChatMessage) => {
      setMessages((prev) => [...prev, msg]);
    };
    socket.on("chat_message", onMessage);
    return () => {
      socket.off("chat_message", onMessage);
    };
  }, []);

  useEffect(() => {
    logRef.current?.scrollTo({ top: logRef.current.scrollHeight });
  }, [messages]);

  const handleSend = (e: FormEvent) => {
    e.preventDefault();
    if (!text.trim()) return;
    socket.emit("chat_message", { text: text.trim() });
    setText("");
  };

  return (
    <div className="panel chat-panel">
      <h2>Chat</h2>
      <div className="chat-log" ref={logRef}>
        {messages.length === 0 && (
          <p style={{ color: "var(--text-dim)", fontSize: "0.85rem" }}>
            No messages yet. Say hello.
          </p>
        )}
        {messages.map((m, i) => (
          <div className="chat-msg" key={i}>
            <div className="chat-author">
              {m.userId === selfUserId ? "You" : m.username}
            </div>
            <div className="chat-text">{m.text}</div>
          </div>
        ))}
      </div>
      <form className="chat-form" onSubmit={handleSend}>
        <input
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="Send a message"
          maxLength={500}
        />
        <button className="btn btn-primary btn-small">Send</button>
      </form>
    </div>
  );
}
