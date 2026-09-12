/**
 * Centralized role definitions + permission checks.
 * Keeping this in one place means every socket handler validates
 * permissions the same way (no duplicated/conflicting logic).
 */

const ROLES = Object.freeze({
  HOST: "host",
  MODERATOR: "moderator",
  PARTICIPANT: "participant",
});

// Roles allowed to control playback (play/pause/seek/change_video)
const PLAYBACK_ROLES = new Set([ROLES.HOST, ROLES.MODERATOR]);

// Roles allowed to manage the room (assign roles / remove participants / transfer host)
const MANAGEMENT_ROLES = new Set([ROLES.HOST]);

function canControlPlayback(role) {
  return PLAYBACK_ROLES.has(role);
}

function canManageRoom(role) {
  return MANAGEMENT_ROLES.has(role);
}

function isValidAssignableRole(role) {
  // Host is auto-assigned only (room creator, or via transfer_host) --
  // it can never be granted through assign_role.
  return role === ROLES.MODERATOR || role === ROLES.PARTICIPANT;
}

module.exports = {
  ROLES,
  canControlPlayback,
  canManageRoom,
  isValidAssignableRole,
};
