import { useEffect, useState, FormEvent } from "react";
import { socket } from "../socket";
import VideoPlayer from "./VideoPlayer";
import ParticipantList from "./ParticipantList";
import Chat from "./Chat";
import { extractYouTubeId } from "../utils/youtube";
import type { JoinedRoomInfo, ParticipantInfo, Role, RoomState } from "../types";

interface Props {
  initial: JoinedRoomInfo;
  onLeave: () => void;
}

export default function RoomView({ initial, onLeave }: Props) {
  const [participants, setParticipants] = useState<ParticipantInfo[]>(initial.participants);
  const [roomState, setRoomState] = useState<RoomState>(initial.state);
  const [videoInput, setVideoInput] = useState("");
  const [videoError, setVideoError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  // Derive "my" role from the live participant list instead of tracking it
  // as separate state. This is the single source of truth the server sends
  // on every roster change (join/leave/role_assigned/removed), so it stays
  // correct even for roles that change as a side-effect of someone else's
  // action - e.g. the host disconnecting and another participant being
  // auto-promoted to host, which has no dedicated "role_assigned" event.
  const selfEntry = participants.find((p) => p.userId === initial.userId);
  const selfRole: Role = selfEntry?.role ?? initial.role;
  const canControl = selfRole === "host" || selfRole === "moderator";

  useEffect(() => {
    const onSync = (state: RoomState) => setRoomState(state);
    const onUserJoined = ({ participants }: { participants: ParticipantInfo[] }) =>
      setParticipants(participants);
    const onUserLeft = ({ participants }: { participants: ParticipantInfo[] }) =>
      setParticipants(participants);
    const onRoleAssigned = ({ participants }: { participants: ParticipantInfo[] }) => {
      setParticipants(participants);
    };
    const onParticipantRemoved = ({ participants }: { participants: ParticipantInfo[] }) =>
      setParticipants(participants);

    socket.on("sync_state", onSync);
    socket.on("user_joined", onUserJoined);
    socket.on("user_left", onUserLeft);
    socket.on("role_assigned", onRoleAssigned);
    socket.on("participant_removed", onParticipantRemoved);

    // In case sync_state was broadcast before this listener attached.
    socket.emit("request_sync");

    return () => {
      socket.off("sync_state", onSync);
      socket.off("user_joined", onUserJoined);
      socket.off("user_left", onUserLeft);
      socket.off("role_assigned", onRoleAssigned);
      socket.off("participant_removed", onParticipantRemoved);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleChangeVideo = (e: FormEvent) => {
    e.preventDefault();
    const id = extractYouTubeId(videoInput);
    if (!id) {
      setVideoError("Please enter a valid YouTube video URL.");
      return;
    }
    setVideoError(null);
    socket.emit("change_video", { videoId: id });
    setVideoInput("");
  };

  const copyRoomCode = () => {
    navigator.clipboard?.writeText(initial.roomId);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  return (
    <div className="room">
      <div className="room-header">
        <div>
          <span className="room-code-label">ROOM CODE</span>
          <span className="room-code">{initial.roomId}</span>
          <button
            className="btn btn-ghost btn-small"
            style={{ marginLeft: 12 }}
            onClick={copyRoomCode}
          >
            {copied ? "Copied" : "Copy"}
          </button>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <span className={`role-pill ${selfRole}`}>
            {selfRole === "host" ? "Host" : selfRole === "moderator" ? "Moderator" : "Participant"}
          </span>
          <button className="btn btn-ghost btn-small" onClick={onLeave}>
            Leave room
          </button>
        </div>
      </div>

      <div className="room-body">
        <div className="video-column">
          <VideoPlayer remoteState={roomState} canControl={canControl} containerId="yt-player" />

          {canControl ? (
            <form className="video-form" onSubmit={handleChangeVideo}>
              <input
                value={videoInput}
                onChange={(e) => setVideoInput(e.target.value)}
                placeholder="Paste a YouTube link to play it for everyone"
              />
              <button className="btn btn-primary" style={{ width: "auto" }}>
                Load video
              </button>
            </form>
          ) : (
            <div className="locked-note">
              Only the host and moderators can change the video or control playback.
            </div>
          )}
          {videoError && <div className="error-banner">{videoError}</div>}
        </div>

        <div className="sidebar">
          <ParticipantList
            participants={participants}
            selfUserId={initial.userId}
            selfRole={selfRole}
          />
          <Chat selfUserId={initial.userId} />
        </div>
      </div>
    </div>
  );
}
