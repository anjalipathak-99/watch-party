const { customAlphabet } = require("nanoid");
const Room = require("./Room");

// Unambiguous alphabet (no 0/O, 1/I/L) so room codes are easy to read aloud/type.
const generateRoomCode = customAlphabet("ABCDEFGHJKMNPQRSTUVWXYZ23456789", 6);

/**
 * Single source of truth for all in-memory rooms.
 * Swappable later for a DB-backed implementation (Postgres/Mongo) without
 * touching socket handler code, since handlers only ever talk to this class.
 */
class RoomManager {
  constructor() {
    this.rooms = new Map(); // roomId -> Room
  }

  createRoom() {
    let roomId = generateRoomCode();
    while (this.rooms.has(roomId)) {
      roomId = generateRoomCode();
    }
    const room = new Room(roomId);
    this.rooms.set(roomId, room);
    return room;
  }

  getRoom(roomId) {
    return this.rooms.get(roomId);
  }

  roomExists(roomId) {
    return this.rooms.has(roomId);
  }

  deleteRoom(roomId) {
    return this.rooms.delete(roomId);
  }

  deleteIfEmpty(roomId) {
    const room = this.rooms.get(roomId);
    if (room && room.isEmpty()) {
      this.rooms.delete(roomId);
      return true;
    }
    return false;
  }

  stats() {
    return {
      roomCount: this.rooms.size,
      totalParticipants: Array.from(this.rooms.values()).reduce(
        (sum, r) => sum + r.size(),
        0
      ),
    };
  }
}

module.exports = RoomManager;
