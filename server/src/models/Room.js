const { ROLES } = require("../utils/roles");

/**
 * Room owns:
 *  - the participant roster (Map<userId, Participant>)
 *  - the shared playback state (videoId, playState, currentTime)
 *  - broadcast helpers, so socket handlers never touch io.to(...) with
 *    hand-rolled payload shapes -- they call room.broadcastX(io) instead.
 */
class Room {
  constructor(roomId) {
    this.roomId = roomId;
    this.participants = new Map(); // userId -> Participant
    this.videoId = null;
    this.playState = "paused"; // 'playing' | 'paused'
    this.currentTime = 0;
    this.lastUpdatedAt = Date.now();
    this.createdAt = Date.now();
  }

  // ---------- participant management ----------

  addParticipant(participant) {
    this.participants.set(participant.userId, participant);
    return participant;
  }

  removeParticipant(userId) {
    return this.participants.delete(userId);
  }

  getParticipant(userId) {
    return this.participants.get(userId);
  }

  findBySocketId(socketId) {
    for (const p of this.participants.values()) {
      if (p.socketId === socketId) return p;
    }
    return undefined;
  }

  getParticipantsList() {
    return Array.from(this.participants.values()).map((p) => p.toJSON());
  }

  getHost() {
    return Array.from(this.participants.values()).find(
      (p) => p.role === ROLES.HOST
    );
  }

  hasAnotherHost(excludingUserId) {
    return Array.from(this.participants.values()).some(
      (p) => p.role === ROLES.HOST && p.userId !== excludingUserId
    );
  }

  isEmpty() {
    return this.participants.size === 0;
  }

  size() {
    return this.participants.size;
  }

  // ---------- playback state ----------

  setPlaying(currentTime) {
    this.playState = "playing";
    if (typeof currentTime === "number") this.currentTime = currentTime;
    this.lastUpdatedAt = Date.now();
  }

  setPaused(currentTime) {
    this.playState = "paused";
    if (typeof currentTime === "number") this.currentTime = currentTime;
    this.lastUpdatedAt = Date.now();
  }

  seek(time) {
    this.currentTime = time;
    this.lastUpdatedAt = Date.now();
  }

  changeVideo(videoId) {
    this.videoId = videoId;
    this.currentTime = 0;
    this.playState = "paused";
    this.lastUpdatedAt = Date.now();
  }

  getState() {
    return {
      videoId: this.videoId,
      playState: this.playState,
      currentTime: this.currentTime,
    };
  }

  // ---------- broadcast helpers ----------

  broadcastSyncState(io) {
    io.to(this.roomId).emit("sync_state", this.getState());
  }
}

module.exports = Room;
