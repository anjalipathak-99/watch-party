Watch Party

Watch YouTube videos together in real time. One room, one shared video state (play, pause, seek, current video), broadcast over WebSockets to everyone in the room. The host controls who else gets to drive playback.

Live URL: https://watch-party-chi.vercel.app/

1. Tech Stack

Frontend: React + TypeScript + Vite
Backend: Node.js + Express
Realtime: Socket.IO
Video: YouTube IFrame Player API
Storage: In-memory

The project is two independent apps in one repository:

watch-party/
  server/   Express + Socket.IO backend
  client/   React + Vite frontend

The frontend and backend communicate over the network. REST is used for small health/lookup endpoints, while WebSockets are used for real-time communication.

2. Run It Locally

You'll need Node.js 18+.

Backend:
cd server
cp .env.example .env
npm install
npm run dev

Backend URL:
http://localhost:4000

Frontend (in a second terminal):
cd client
cp .env.example .env
npm install
npm run dev

Frontend URL:
http://localhost:5173

Open the frontend in two browser windows, or one normal window and one incognito window, to test synchronization between two users.

3. How It Works

Architecture:

Browser A (Host)                 Browser B (Participant)
       |                                  |
       |            Socket.IO             |
       v                                  v
+------------------------------------------------------+
|           Node.js + Express + Socket.IO              |
|                                                      |
| MessageHandler                                       |
|   - validates permissions                            |
|   - handles WebSocket events                        |
|   - updates room state                               |
|   - broadcasts updates                               |
|                                                      |
| RoomManager                                          |
|   - manages all rooms                                |
|   - creates unique room codes                        |
|                                                      |
| Room                                                 |
|   - participants                                     |
|   - videoId                                          |
|   - playState                                        |
|   - currentTime                                      |
+------------------------------------------------------+

Playback synchronization flow:
1. The YouTube player detects a playback action.
2. The frontend sends an event through Socket.IO.
3. The backend identifies the user's room and role.
4. The backend checks permission.
5. The room state is updated.
6. The server broadcasts the new state to everyone.
7. Clients receive sync_state.
8. Each YouTube player is updated to match the shared state.

The backend acts as the source of truth for room state.

Seek synchronization:
The YouTube IFrame API does not provide a dedicated onSeek event. The client periodically checks the playback position to detect manual seeking and sends the updated time to the server.

4. Role-Based Access Control

The application supports three roles.

Host:
- Automatically assigned to the room creator
- Play, pause, seek, change video
- Assign Moderator
- Remove participants
- Transfer Host

Moderator:
- Assigned by Host
- Play, pause, seek, change video

Participant:
- Default role for users joining a room
- Watch video
- View participants
- Use chat
- Cannot control playback

Backend permission validation is performed in:
server/src/utils/roles.js
server/src/handlers/MessageHandler.js

Before processing playback or room-management events, the server checks the user's current role.

If the Host leaves, the server automatically promotes the longest-tenured remaining participant to Host.

5. WebSocket Events

Client -> Server:
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

Server -> Client:
sync_state
user_joined
user_left
role_assigned
participant_removed
you_were_removed
chat_message
error_message

Important payload examples:
create_room { username }
join_room { roomId, username }
play { currentTime }
pause { currentTime }
seek { time }
change_video { videoId }
assign_role { userId, role }
remove_participant { userId }
chat_message { text }

6. YouTube Integration

The application uses the YouTube IFrame Player API.

Users can enter a YouTube video URL and the application extracts the YouTube video ID.

The application synchronizes:
- Video ID
- Play / Pause state
- Current playback time

The YouTube player is controlled through the IFrame Player API.

7. Room Management

Each watch party has a unique room code.

Example:
AB12CD

Room:
  - Room ID
  - Participants
  - Video ID
  - Play State
  - Current Time

Each participant has:
  - User ID
  - Username
  - Role

The backend manages rooms using RoomManager.

8. Persistence

Rooms are stored in memory.

This means:
- Rooms disappear when the server restarts.
- Room state is not permanently stored.
- Multiple backend instances would require shared storage.

For an MVP, this keeps the application simple.

A future version could use PostgreSQL, MongoDB, or Redis.

For multiple Socket.IO server instances, the Socket.IO Redis adapter could be used to synchronize events between servers.

9. Deployment

Frontend:
Platform: Vercel
Live application: https://watch-party-chi.vercel.app/
Technology: React + TypeScript + Vite

Backend:
Platform: Render
Backend URL: https://watch-party-server-mazz.onrender.com
Technology: Node.js + Express + Socket.IO

Environment variables:

Frontend:
VITE_SERVER_URL=https://watch-party-server-mazz.onrender.com

Backend:
CLIENT_ORIGIN=https://watch-party-chi.vercel.app

Backend - Render:
Root Directory: server
Build Command: npm install
Start Command: npm start

Frontend - Vercel:
Root Directory: client
Framework: Vite
Build Command: npm run build
Output Directory: dist

The Render free tier can put an inactive service to sleep, so the first request after inactivity may take longer while the backend wakes up.

10. Trade-offs and Known Limitations

In-Memory Storage:
Room data is stored in memory instead of a database. This is simple and suitable for an MVP, but data is lost when the server restarts.

Single Server Instance:
The current implementation assumes clients in a room are connected to the same backend instance. Horizontal scaling would require a shared Socket.IO adapter such as Redis.

Seek Detection:
YouTube's IFrame API does not provide a direct seek event, so periodic playback-time checks are used.

Authentication:
The application does not use a full authentication system. Users provide a username when creating or joining a room. User IDs are generated by the server for the current session.

11. Project Structure

watch-party/
|
+-- client/
|   +-- src/
|       +-- components/
|       |   +-- Home.tsx
|       |   +-- ParticipantList.tsx
|       |   +-- RoomView.tsx
|       |   +-- VideoPlayer.tsx
|       |   +-- Chat.tsx
|       +-- socket.ts
|       +-- types.ts
|       +-- utils/
|           +-- youtube.ts
|       +-- App.tsx
|   +-- package.json
|   +-- vite.config.ts
|   +-- .env.example
|
+-- server/
|   +-- src/
|       +-- handlers/
|       |   +-- MessageHandler.js
|       +-- models/
|       |   +-- Room.js
|       |   +-- Participant.js
|       |   +-- RoomManager.js
|       +-- utils/
|       |   +-- roles.js
|       +-- index.js
|   +-- package.json
|   +-- .env.example
|
+-- README.md

12. Code Walkthrough

Socket.IO:
server/src/index.js
server/src/handlers/MessageHandler.js
client/src/socket.ts
client/src/components/RoomView.tsx

React:
client/src/App.tsx
client/src/components/

YouTube Player:
client/src/components/VideoPlayer.tsx

Role-Based Access:
server/src/utils/roles.js
server/src/handlers/MessageHandler.js

OOP Design:
Room
Participant
RoomManager
MessageHandler

The classes separate room management, participant information, and WebSocket event handling.

13. Testing

Test using two browser windows.

Browser 1:
Create Room -> Host

Browser 2:
Join Room -> Participant

Test:
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

14. Future Improvements

Possible improvements:
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

15. Assignment Requirements Covered

The project implements:
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

16. Live Application

Frontend:
https://watch-party-chi.vercel.app/

Backend:
https://watch-party-server-mazz.onrender.com

Author

Developed as an internship assignment.

