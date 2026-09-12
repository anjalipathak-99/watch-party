import { useEffect, useState, useCallback } from "react";
import { socket } from "./socket";
import Home from "./components/Home";
import RoomView from "./components/RoomView";
import type { JoinedRoomInfo } from "./types";

export default function App() {
  const [joined, setJoined] = useState<JoinedRoomInfo | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  useEffect(() => {
    socket.connect();

    const onErrorMessage = ({ message }: { message: string }) => {
      setError(message);
    };
    const onRemoved = () => {
      setJoined(null);
      setToast("You were removed from the room by the host.");
    };
    const onDisconnect = () => {
      setToast("Disconnected from server. Reconnecting...");
    };
    const onConnect = () => {
      setToast(null);
    };

    socket.on("error_message", onErrorMessage);
    socket.on("you_were_removed", onRemoved);
    socket.on("disconnect", onDisconnect);
    socket.on("connect", onConnect);

    return () => {
      socket.off("error_message", onErrorMessage);
      socket.off("you_were_removed", onRemoved);
      socket.off("disconnect", onDisconnect);
      socket.off("connect", onConnect);
    };
  }, []);

  const handleJoined = useCallback((info: JoinedRoomInfo) => {
    setError(null);
    setJoined(info);
  }, []);

  const handleLeave = useCallback(() => {
    socket.emit("leave_room");
    setJoined(null);
  }, []);

  return (
    <div className="screen">
      {!joined ? (
        <Home onJoined={handleJoined} error={error} clearError={() => setError(null)} />
      ) : (
        <RoomView initial={joined} onLeave={handleLeave} />
      )}
      {toast && <div className="toast">{toast}</div>}
    </div>
  );
}
