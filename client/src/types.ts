export type Role = "host" | "moderator" | "participant";

export interface ParticipantInfo {
  userId: string;
  username: string;
  role: Role;
}

export interface RoomState {
  videoId: string | null;
  playState: "playing" | "paused";
  currentTime: number;
}

export interface JoinedRoomInfo {
  roomId: string;
  userId: string;
  role: Role;
  state: RoomState;
  participants: ParticipantInfo[];
}

export interface ChatMessage {
  userId: string;
  username: string;
  text: string;
  timestamp: number;
}
