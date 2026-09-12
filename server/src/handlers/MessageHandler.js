const { nanoid } = require("nanoid");
const Participant = require("../models/Participant");
const { ROLES, canControlPlayback, canManageRoom, isValidAssignableRole } = require("../utils/roles");

// Mirrors the client's YouTube ID shape check (see client/src/utils/youtube.ts).
// The client already only sends parsed/validated IDs, but the server can't
// assume that - a stale client, a direct socket connection, or a future bug
// upstream could all send something else, and this is the last point before
// it gets broadcast to every participant's YT.Player.
const YOUTUBE_ID_RE = /^[a-zA-Z0-9_-]{11}$/;

/**
 * One MessageHandler instance is created per socket connection.
 * It owns:
 *   - registering all inbound event listeners for that socket
 *   - looking up which room/participant that socket belongs to
 *   - validating permissions before mutating room state
 *   - broadcasting results back to the room
 *
 * This keeps index.js thin (just wiring) and keeps all the
 * business/validation logic in one testable place.
 */
class MessageHandler {
  constructor(io, socket, roomManager) {
    this.io = io;
    this.socket = socket;
    this.roomManager = roomManager;

    // Track which room/user this socket is currently attached to.
    this.currentRoomId = null;
    this.currentUserId = null;
  }

  register() {
    this.socket.on("create_room", (payload, ack) => this.handleCreateRoom(payload, ack));
    this.socket.on("join_room", (payload, ack) => this.handleJoinRoom(payload, ack));
    this.socket.on("leave_room", () => this.handleLeaveRoom());

    this.socket.on("play", (payload) => this.handlePlay(payload));
    this.socket.on("pause", (payload) => this.handlePause(payload));
    this.socket.on("seek", (payload) => this.handleSeek(payload));
    this.socket.on("change_video", (payload) => this.handleChangeVideo(payload));
    this.socket.on("request_sync", () => this.handleRequestSync());

    this.socket.on("assign_role", (payload) => this.handleAssignRole(payload));
    this.socket.on("remove_participant", (payload) => this.handleRemoveParticipant(payload));
    this.socket.on("transfer_host", (payload) => this.handleTransferHost(payload));

    this.socket.on("chat_message", (payload) => this.handleChatMessage(payload));

    this.socket.on("disconnect", () => this.handleDisconnect());
  }

  // ---------- helpers ----------

  getRoom() {
    if (!this.currentRoomId) return null;
    return this.roomManager.getRoom(this.currentRoomId);
  }

  getSelf(room) {
    if (!room || !this.currentUserId) return null;
    return room.getParticipant(this.currentUserId);
  }

  emitError(message) {
    this.socket.emit("error_message", { message });
  }

  // ---------- room lifecycle ----------

  handleCreateRoom({ username } = {}, ack) {
    if (!username || !username.trim()) {
      return this.emitError("Username is required to create a room.");
    }

    const room = this.roomManager.createRoom();
    const userId = nanoid(10);
    const host = new Participant({
      userId,
      socketId: this.socket.id,
      username: username.trim(),
      role: ROLES.HOST,
    });
    room.addParticipant(host);

    this.currentRoomId = room.roomId;
    this.currentUserId = userId;
    this.socket.join(room.roomId);

    const responsePayload = {
      roomId: room.roomId,
      userId,
      role: ROLES.HOST,
      state: room.getState(),
      participants: room.getParticipantsList(),
    };

    if (typeof ack === "function") ack({ ok: true, ...responsePayload });
  }

  handleJoinRoom({ roomId, username } = {}, ack) {
    const room = this.roomManager.getRoom(roomId);
    if (!room) {
      const errPayload = { ok: false, message: "Room not found." };
      if (typeof ack === "function") ack(errPayload);
      return this.emitError(errPayload.message);
    }
    if (!username || !username.trim()) {
      const errPayload = { ok: false, message: "Username is required to join a room." };
      if (typeof ack === "function") ack(errPayload);
      return this.emitError(errPayload.message);
    }

    const userId = nanoid(10);
    const participant = new Participant({
      userId,
      socketId: this.socket.id,
      username: username.trim(),
      role: ROLES.PARTICIPANT, // default role for joiners
    });
    room.addParticipant(participant);

    this.currentRoomId = room.roomId;
    this.currentUserId = userId;
    this.socket.join(room.roomId);

    const responsePayload = {
      roomId: room.roomId,
      userId,
      role: participant.role,
      state: room.getState(),
      participants: room.getParticipantsList(),
    };

    if (typeof ack === "function") ack({ ok: true, ...responsePayload });

    // Tell everyone else a new participant joined.
    this.socket.to(room.roomId).emit("user_joined", {
      userId,
      username: participant.username,
      role: participant.role,
      participants: room.getParticipantsList(),
    });
  }

  handleLeaveRoom() {
    this.detachFromRoom();
  }

  handleDisconnect() {
    this.detachFromRoom();
  }

  detachFromRoom() {
    const room = this.getRoom();
    if (!room || !this.currentUserId) return;

    const leavingUser = room.getParticipant(this.currentUserId);
    room.removeParticipant(this.currentUserId);
    this.socket.leave(room.roomId);

    if (leavingUser) {
      // If the host left and other participants remain, promote the
      // longest-tenured remaining participant to Host so the room isn't
      // orphaned without playback control.
      if (leavingUser.role === ROLES.HOST && !room.isEmpty()) {
        const next = Array.from(room.participants.values()).sort(
          (a, b) => a.joinedAt - b.joinedAt
        )[0];
        if (next) next.setRole(ROLES.HOST);
      }

      this.io.to(room.roomId).emit("user_left", {
        userId: leavingUser.userId,
        username: leavingUser.username,
        participants: room.getParticipantsList(),
      });
    }

    this.roomManager.deleteIfEmpty(room.roomId);
    this.currentRoomId = null;
    this.currentUserId = null;
  }

  // ---------- playback control (Host/Moderator only) ----------

  handlePlay({ currentTime } = {}) {
    const room = this.getRoom();
    const self = this.getSelf(room);
    if (!room || !self) return;
    if (!canControlPlayback(self.role)) {
      return this.emitError("You do not have permission to control playback.");
    }
    room.setPlaying(currentTime);
    room.broadcastSyncState(this.io);
  }

  handlePause({ currentTime } = {}) {
    const room = this.getRoom();
    const self = this.getSelf(room);
    if (!room || !self) return;
    if (!canControlPlayback(self.role)) {
      return this.emitError("You do not have permission to control playback.");
    }
    room.setPaused(currentTime);
    room.broadcastSyncState(this.io);
  }

  handleSeek({ time } = {}) {
    const room = this.getRoom();
    const self = this.getSelf(room);
    if (!room || !self) return;
    if (!canControlPlayback(self.role)) {
      return this.emitError("You do not have permission to seek.");
    }
    if (typeof time !== "number" || Number.isNaN(time)) return;
    room.seek(time);
    room.broadcastSyncState(this.io);
  }

  handleChangeVideo({ videoId } = {}) {
    const room = this.getRoom();
    const self = this.getSelf(room);
    if (!room || !self) return;
    if (!canControlPlayback(self.role)) {
      return this.emitError("You do not have permission to change the video.");
    }
    if (!YOUTUBE_ID_RE.test(videoId)) {
      return this.emitError("Invalid video ID.");
    }
    room.changeVideo(videoId);
    room.broadcastSyncState(this.io);
  }

  handleRequestSync() {
    // Lets a client (e.g. one that just joined) pull the current state on demand.
    const room = this.getRoom();
    if (!room) return;
    this.socket.emit("sync_state", room.getState());
  }

  // ---------- role / participant management (Host only) ----------

  handleAssignRole({ userId, role } = {}) {
    const room = this.getRoom();
    const self = this.getSelf(room);
    if (!room || !self) return;
    if (!canManageRoom(self.role)) {
      return this.emitError("Only the host can assign roles.");
    }
    if (!isValidAssignableRole(role)) {
      return this.emitError("Invalid role.");
    }
    const target = room.getParticipant(userId);
    if (!target) return this.emitError("Participant not found.");
    if (target.role === ROLES.HOST) {
      return this.emitError("Use transfer_host to change the host.");
    }

    target.setRole(role);

    this.io.to(room.roomId).emit("role_assigned", {
      userId: target.userId,
      username: target.username,
      role: target.role,
      participants: room.getParticipantsList(),
    });
  }

  handleRemoveParticipant({ userId } = {}) {
    const room = this.getRoom();
    const self = this.getSelf(room);
    if (!room || !self) return;
    if (!canManageRoom(self.role)) {
      return this.emitError("Only the host can remove participants.");
    }
    const target = room.getParticipant(userId);
    if (!target) return this.emitError("Participant not found.");
    if (target.role === ROLES.HOST) {
      return this.emitError("The host cannot remove themselves. Transfer host first.");
    }

    room.removeParticipant(userId);

    // Force-disconnect that participant's socket from the room so their
    // client stops receiving room events and can show a "removed" screen.
    const targetSocket = this.io.sockets.sockets.get(target.socketId);
    if (targetSocket) {
      targetSocket.emit("you_were_removed", { roomId: room.roomId });
      targetSocket.leave(room.roomId);
    }

    this.io.to(room.roomId).emit("participant_removed", {
      userId: target.userId,
      participants: room.getParticipantsList(),
    });
  }

  handleTransferHost({ userId } = {}) {
    const room = this.getRoom();
    const self = this.getSelf(room);
    if (!room || !self) return;
    if (!canManageRoom(self.role)) {
      return this.emitError("Only the host can transfer host.");
    }
    const target = room.getParticipant(userId);
    if (!target) return this.emitError("Participant not found.");
    if (target.userId === self.userId) return;

    self.setRole(ROLES.MODERATOR);
    target.setRole(ROLES.HOST);

    this.io.to(room.roomId).emit("role_assigned", {
      userId: self.userId,
      username: self.username,
      role: self.role,
      participants: room.getParticipantsList(),
    });
    this.io.to(room.roomId).emit("role_assigned", {
      userId: target.userId,
      username: target.username,
      role: target.role,
      participants: room.getParticipantsList(),
    });
  }

  // ---------- chat (bonus) ----------

  handleChatMessage({ text } = {}) {
    const room = this.getRoom();
    const self = this.getSelf(room);
    if (!room || !self) return;
    if (!text || !text.trim()) return;

    this.io.to(room.roomId).emit("chat_message", {
      userId: self.userId,
      username: self.username,
      text: text.trim().slice(0, 500),
      timestamp: Date.now(),
    });
  }
}

module.exports = MessageHandler;
