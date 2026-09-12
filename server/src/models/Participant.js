const { ROLES } = require("../utils/roles");

/**
 * Represents a single connected user inside a Room.
 * userId is stable for the lifetime of the connection and is what
 * the frontend/clients use to refer to a participant (assign_role,
 * remove_participant, transfer_host all key off userId, not socketId,
 * so logic never breaks if a socketId needs to be swapped out later
 * e.g. on reconnect).
 */
class Participant {
  constructor({ userId, socketId, username, role = ROLES.PARTICIPANT }) {
    this.userId = userId;
    this.socketId = socketId;
    this.username = username;
    this.role = role;
    this.joinedAt = Date.now();
  }

  setRole(role) {
    this.role = role;
  }

  toJSON() {
    return {
      userId: this.userId,
      username: this.username,
      role: this.role,
    };
  }
}

module.exports = Participant;
