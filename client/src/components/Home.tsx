import { useState, FormEvent } from "react";
import { socket } from "../socket";
import type { JoinedRoomInfo } from "../types";

interface Props {
  onJoined: (info: JoinedRoomInfo) => void;
  error: string | null;
  clearError: () => void;
}

export default function Home({ onJoined, error, clearError }: Props) {
  const [username, setUsername] = useState("");
  const [roomCode, setRoomCode] = useState("");
  const [busy, setBusy] = useState<"create" | "join" | null>(null);

  const handleCreate = (e: FormEvent) => {
    e.preventDefault();
    if (!username.trim()) return;
    clearError();
    setBusy("create");
    socket.emit("create_room", { username: username.trim() }, (res: any) => {
      setBusy(null);
      if (res?.ok) onJoined(res);
    });
  };

  const handleJoin = (e: FormEvent) => {
    e.preventDefault();
    if (!username.trim() || !roomCode.trim()) return;
    clearError();
    setBusy("join");
    socket.emit(
      "join_room",
      { username: username.trim(), roomId: roomCode.trim().toUpperCase() },
      (res: any) => {
        setBusy(null);
        if (res?.ok) onJoined(res);
      }
    );
  };

  return (
    <div className="home">
      <div className="home-mark">
        <span className="bulb" />
      </div>
      <h1 className="brand">Watch Party</h1>
      <p className="tagline">
        Pick a video, share a code, and hit play at the same moment as
        everyone in the room.
      </p>

      {error && <div className="error-banner">{error}</div>}

      <form onSubmit={handleCreate}>
        <div className="field">
          <label htmlFor="username">Your name</label>
          <input
            id="username"
            placeholder="e.g. Riya"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            maxLength={24}
            required
          />
        </div>
        <button className="btn btn-primary" disabled={busy !== null}>
          {busy === "create" ? "Creating room..." : "Start a new room"}
        </button>
      </form>

      <div className="divider-or">or join one</div>

      <form onSubmit={handleJoin}>
        <div className="field">
          <label htmlFor="roomCode">Room code</label>
          <input
            id="roomCode"
            placeholder="e.g. 7K4M2Q"
            value={roomCode}
            onChange={(e) => setRoomCode(e.target.value)}
            maxLength={8}
            style={{ textTransform: "uppercase" }}
            required
          />
        </div>
        <button className="btn btn-ghost" style={{ width: "100%" }} disabled={busy !== null}>
          {busy === "join" ? "Joining..." : "Join room"}
        </button>
      </form>

      <p className="connection-note">
        Playback control starts with the host. The host can promote others to
        moderator from inside the room.
      </p>
    </div>
  );
}
