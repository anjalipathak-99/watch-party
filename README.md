# Watch Party

Watch YouTube videos together in real time. One room, one shared video state (play, pause, seek, current video), broadcast over WebSockets to everyone in the room. The host controls who else gets to drive playback.

**Live URL:** https://watch-party-chi.vercel.app/

---

## 1. Tech Stack

| Layer | Choice |
|---|---|
| Frontend | React + TypeScript + Vite |
| Backend | Node.js + Express |
| Realtime | Socket.IO |
| Video | YouTube IFrame Player API |
| Storage | In-memory |

The project is two independent apps in one repository:

```text
watch-party/
  server/   Express + Socket.IO backend
  client/   React + Vite frontend
```

The frontend and backend communicate over the network. REST is used for small health/lookup endpoints, while WebSockets are used for real-time communication.

---

## 2. Run It Locally

You'll need Node.js 18+.

### Backend

Open a terminal:

```bash
cd server
cp .env.example .env
npm install
npm run dev
```

The backend runs on:

```text
http://localhost:4000
```

### Frontend

Open a second terminal:

```bash
cd client
cp .env.example .env
npm install
npm run dev
```

The frontend runs on:

```text
http://localhost:5173
```

Open `http://localhost:5173` in two browser windows, or one normal window and one incognito window, to test synchronization between two users.

---

## 3. How It Works

```text
 Browser A (Host)                Browser B (Participant)
      |                                  |
      |         Socket.IO                |
      v                                  v
 +------------------------------------------------------+
 |              Node.js + Express + Socket.IO            |
 |                                                        |
 |   MessageHandler                                       |
 |     - validates permissions                            |
 |     - handles WebSocket events                        |
 |     - updates room state                               |
 |     - broadcasts updates                               |
 |                                                        |
 |   RoomManager                                          |
 |     - manages all rooms                                |
 |     - creates unique room codes                        |
 |                                                        |
 |   Room                                                 |
 |     - participants                                     |
 |     - videoId                                          |
 |     - playState                                        |
 |     - currentTime                                      |
 +------------------------------------------------------+
```

### Playback Synchronization Flow

For example, when the Host presses Pause:

1. The YouTube player detects the pause action.
2. The frontend sends a `pause` event through Socket.IO.
3. The backend identifies the user's room and role.
4. The backend checks whether the user has permission to control playback.
5. The room state is updated.
6. The server broadcasts the new state to everyone in the room.
7. Every connected client receives the `sync_state` event.
8. Each client's YouTube player is updated to match the shared state.

The backend acts as the source of truth for room state.

### Seek Synchronization

The YouTube IFrame API does not provide a dedicated `onSeek` event. Therefore, the client periodically checks the playback position to detect manual seeking and sends the updated time to the server.

---

## 4. Role-Based Access Control

The application supports three roles.

| Role | Assigned By | Permissions |
|---|---|---|
| Host | Automatically assigned to room creator | Full control |
| Moderator | Assigned by Host | Play, pause, seek, change video |
| Participant | Default for users joining a room | Watch only |

### Host

The Host can:

- Play video
- Pause video
- Seek
- Change the YouTube video
- Assign the Moderator role
- Remove participants
- Transfer Host role

### Moderator

The Moderator can:

- Play video
- Pause video
- Seek
- Change the YouTube video

### Participant

The Participant can:

- Watch the video
- View other participants
- Use chat

Participants cannot control playback.

### Backend Permission Validation

Role validation is performed on the backend.

The relevant files are:

```text
server/src/utils/roles.js
server/src/handlers/MessageHandler.js
```

Before processing playback or room-management events, the server checks the user's current role.

For example:

```text
Participant
    |
    | play event
    v
Backend
    |
    | permission check
    v
Rejected
```

This prevents users from bypassing the frontend restrictions by modifying client-side JavaScript.

If the Host leaves the room, the server automatically promotes the longest-tenured remaining participant to Host.

---

## 5. WebSocket Events

The application uses Socket.IO for real-time communication.

### Client → Server

```text
create_room
join_room
leave_room
play
pause
seek
change_video
request_sync
assign_role
remove_participant
transfer_host
chat_message
```

### Server → Client

```text
sync_state
user_joined
user_left
role_assigned
participant_removed
you_were_removed
chat_message
error_message
```

### Important Events

#### create_room

Creates a new watch party.

```text
{ username }
```

The creator automatically becomes the Host.

#### join_room

Allows another user to join an existing room.

```text
{ roomId, username }
```

New users receive the Participant role by default.

#### play

Requests playback.

```text
{ currentTime }
```

Only Host and Moderator users are allowed to perform this action.

#### pause

Requests pause.

```text
{ currentTime }
```

Only Host and Moderator users are allowed.

#### seek

Synchronizes the playback position.

```text
{ time }
```

Only Host and Moderator users are allowed.

#### change_video

Changes the shared YouTube video.

```text
{ videoId }
```

Only Host and Moderator users are allowed.

#### assign_role

Allows the Host to assign a new role.

```text
{ userId, role }
```

#### remove_participant

Allows the Host to remove a participant.

```text
{ userId }
```

#### chat_message

Sends a chat message to everyone in the room.

```text
{ text }
```

---

## 6. YouTube Integration

The application uses the YouTube IFrame Player API.

Users can enter a YouTube video URL and the application extracts the YouTube video ID.

The video is embedded using the YouTube player.

The application synchronizes:

```text
Video ID
Play / Pause state
Current playback time
```

The YouTube player is controlled through the IFrame Player API.

---

## 7. Room Management

Each watch party has a unique room code.

Example:

```text
AB12CD
```

The room contains:

```text
Room
 ├── Room ID
 ├── Participants
 ├── Video ID
 ├── Play State
 └── Current Time
```

Each participant has:

```text
User ID
Username
Role
```

The backend manages rooms using `RoomManager`.

---

## 8. Persistence

Rooms are stored in memory.

This means:

- Rooms disappear when the server restarts.
- Room state is not permanently stored.
- Multiple backend instances would require shared storage.

For an MVP, this keeps the application simple.

A future version could use:

```text
PostgreSQL
MongoDB
Redis
```

For multiple Socket.IO server instances, the Socket.IO Redis adapter could be used to synchronize events between servers.

---

## 9. Deployment

The frontend and backend are deployed separately.

### Frontend

Platform:

```text
Vercel
```

Live application:

```text
https://watch-party-chi.vercel.app/
```

Frontend technology:

```text
React + TypeScript + Vite
```

### Backend

Platform:

```text
Render
```

Backend URL:

```text
https://watch-party-server-mazz.onrender.com
```

Backend technology:

```text
Node.js + Express + Socket.IO
```

### Environment Variables

#### Frontend

```text
VITE_SERVER_URL=https://watch-party-server-mazz.onrender.com
```

#### Backend

```text
CLIENT_ORIGIN=https://watch-party-chi.vercel.app
```

The frontend uses `VITE_SERVER_URL` to connect to the deployed backend.

The backend uses `CLIENT_ORIGIN` for CORS and Socket.IO configuration.

---

## 10. Deployment Configuration

### Backend - Render

The backend is located in:

```text
server/
```

Render configuration:

```text
Root Directory: server
Build Command: npm install
Start Command: npm start
```

### Frontend - Vercel

The frontend is located in:

```text
client/
```

Vercel configuration:

```text
Root Directory: client
Framework: Vite
Build Command: npm run build
Output Directory: dist
```

---

## 11. Trade-offs and Known Limitations

### In-Memory Storage

Room data is stored in memory instead of a database.

Advantages:

- Simple implementation
- No database configuration required
- Suitable for an MVP

Limitation:

- Data is lost when the server restarts.

### Single Server Instance

The current implementation assumes clients in a room are connected to the same backend instance.

For horizontal scaling, a shared Socket.IO adapter such as Redis would be needed.

### Seek Detection

YouTube's IFrame API does not provide a direct seek event.

The application therefore uses periodic playback-time checks to detect manual seeking.

### Authentication

The application does not use a full authentication system.

Users provide a username when creating or joining a room.

User IDs are generated by the server for the current session.

A future version could add:

- User registration
- Login
- JWT authentication
- Persistent user accounts

### Render Free Tier

The Render free tier can put an inactive service to sleep.

As a result, the first request after a period of inactivity may take longer while the backend wakes up.

---

## 12. Project Structure

```text
watch-party/
│
├── client/
│   ├── src/
│   │   ├── components/
│   │   │   ├── Home.tsx
│   │   │   ├── ParticipantList.tsx
│   │   │   ├── RoomView.tsx
│   │   │   ├── VideoPlayer.tsx
│   │   │   └── Chat.tsx
│   │   │
│   │   ├── socket.ts
│   │   ├── types.ts
│   │   ├── utils/
│   │   │   └── youtube.ts
│   │   └── App.tsx
│   │
│   ├── package.json
│   ├── vite.config.ts
│   └── .env.example
│
├── server/
│   ├── src/
│   │   ├── handlers/
│   │   │   └── MessageHandler.js
│   │   │
│   │   ├── models/
│   │   │   ├── Room.js
│   │   │   ├── Participant.js
│   │   │   └── RoomManager.js
│   │   │
│   │   ├── utils/
│   │   │   └── roles.js
│   │   │
│   │   └── index.js
│   │
│   ├── package.json
│   └── .env.example
│
└── README.md
```

---

## 13. Code Walkthrough

### Socket.IO

Main files:

```text
server/src/index.js
server/src/handlers/MessageHandler.js
client/src/socket.ts
client/src/components/RoomView.tsx
```

These files handle the real-time connection and WebSocket events.

### React

Main files:

```text
client/src/App.tsx
client/src/components/
```

React components are separated according to their responsibilities.

### YouTube Player

Main file:

```text
client/src/components/VideoPlayer.tsx
```

This component manages the YouTube player and synchronization.

### Role-Based Access

Main files:

```text
server/src/utils/roles.js
server/src/handlers/MessageHandler.js
```

These files define and enforce permissions.

### OOP Design

The backend uses classes for:

```text
Room
Participant
RoomManager
MessageHandler
```

This separates room management, participant information, and WebSocket event handling.

---

## 14. Testing

The application can be tested using two browser windows.

Example:

```text
Browser 1
    ↓
Create Room
    ↓
Host

Browser 2
    ↓
Join Room
    ↓
Participant
```

Then test:

- Create room
- Join room
- Participant list
- YouTube video
- Play synchronization
- Pause synchronization
- Seek synchronization
- Change video synchronization
- Host permissions
- Moderator permissions
- Participant restrictions
- Assign Moderator
- Remove participant
- Transfer Host
- Chat

---

## 15. Future Improvements

Possible improvements include:

- PostgreSQL or MongoDB persistence
- Redis Socket.IO adapter
- User authentication
- Persistent user accounts
- Improved seek synchronization
- Reactions and emojis
- Room history
- Private rooms
- Password-protected rooms
- Improved scalability
- Mobile-responsive UI

---

## 16. Assignment Requirements Covered

The project implements the main requirements:

- Real-time synchronization
- Room-based model
- YouTube integration
- WebSockets using Socket.IO
- Host, Moderator and Participant roles
- Backend permission validation
- Create and join rooms
- Participant list
- Role management
- Playback synchronization
- Video changing
- Public deployment
- README documentation
- Architecture overview
- OOP-based backend structure

---

## 17. Live Application

### Frontend

https://watch-party-chi.vercel.app/

### Backend

https://watch-party-server-mazz.onrender.com

---

## Author

Developed as an internship assignment.
