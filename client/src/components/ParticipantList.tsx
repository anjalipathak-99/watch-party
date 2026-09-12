import type { ParticipantInfo, Role } from "../types";
import { socket } from "../socket";

interface Props {
  participants: ParticipantInfo[];
  selfUserId: string;
  selfRole: Role;
}

const ROLE_LABEL: Record<Role, string> = {
  host: "Host",
  moderator: "Moderator",
  participant: "Participant",
};

export default function ParticipantList({ participants, selfUserId, selfRole }: Props) {
  const isHost = selfRole === "host";

  const handleRoleChange = (userId: string, role: Role) => {
    socket.emit("assign_role", { userId, role });
  };

  const handleRemove = (userId: string) => {
    socket.emit("remove_participant", { userId });
  };

  const handleTransfer = (userId: string) => {
    if (confirm("Transfer host to this participant? You will become a moderator.")) {
      socket.emit("transfer_host", { userId });
    }
  };

  return (
    <div className="panel">
      <h2>Participants ({participants.length})</h2>
      <div>
        {participants.map((p) => (
          <div className="participant-row" key={p.userId}>
            <div className="participant-name">
              <span className={`role-pill ${p.role}`}>{ROLE_LABEL[p.role]}</span>
              <span className="name">{p.username}</span>
              {p.userId === selfUserId && <span className="you-tag">(you)</span>}
            </div>

            {isHost && p.userId !== selfUserId && (
              <div className="participant-actions">
                <select
                  className="select-role"
                  value={p.role}
                  onChange={(e) => handleRoleChange(p.userId, e.target.value as Role)}
                >
                  <option value="participant">Participant</option>
                  <option value="moderator">Moderator</option>
                </select>
                <button
                  className="btn btn-ghost btn-small"
                  onClick={() => handleTransfer(p.userId)}
                  title="Make this participant the host"
                >
                  Make host
                </button>
                <button
                  className="btn btn-danger btn-small"
                  onClick={() => handleRemove(p.userId)}
                >
                  Remove
                </button>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
