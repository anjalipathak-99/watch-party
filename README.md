# Watch Party

Watch YouTube videos together in real time. One room, one shared video state
(play, pause, seek, current video), broadcast over WebSockets to everyone
in the room. The host controls who else gets to drive playback.

**Live URL:** _add your deployed URL here after deploying, e.g._
`https://watch-party-xxxx.onrender.com`

---

## 1. Tech stack

| Layer      | Choice                                   |
|------------|-------------------------------------------|
| Frontend   | React + TypeScript + Vite                 |
| Backend    | Node.js + Express                         |
| Realtime   | Socket.IO (WebSocket transport, polling fallback) |
| Video      | YouTube IFrame Player API                 |
| Storage    | In-memory (per the assignment's "optional for MVP" note - see [Persistence](#persistence-not-implemented)) |

The project is two independent apps in one repo:

```
watch-party/
  server/   Express + Socket.IO backend (the source of truth for room state)
  client/   React + Vite frontend (the YouTube player + UI)
```

They talk to each other only over the network (REST for a couple of small
health/lookup endpoints, WebSockets for everything real-time), so they can
be deployed to two different platforms.

---

## 2. Run it locally

You'll need Node.js 18+.

### Backend

```bash
cd server
cp .env.example .env      # defaults are fine for local dev
npm install
npm run dev                # nodemon, restarts on change
# -> Watch Party server listening on port 4000
```

### Frontend

In a second terminal:

```bash
cd client
cp .env.example .env      # VITE_SERVER_URL=http://localhost:4000
npm install
npm run dev
# -> Local: http://localhost:5173
```

Open `http://localhost:5173` in two browser windows (or one normal + one
incognito) to test synchronization between "two users."

---

## 3. How it works (architecture overview)

```
 Browser A (Host)                Browser B (Participant)
      |                                  |
      |  socket.io (WebSocket)           |  socket.io (WebSocket)
      v                                  v
 +------------------------------------------------------+
 |                  Express + Socket.IO server            |
 |                                                        |
 |   MessageHandler (1 per connected socket)              |
 |     - validates permissions before touching state      |
 |     - delegates state changes to a Room                |
 |     - broadcasts the result to io.to(roomId)           |
 |                                                        |
 |   RoomManager                                          |
 |     - Map<roomId, Room>                                |
 |     - creates unique 6-char room codes                 |
 |                                                        |
 |   Room (one per party)                                 |
 |     - Map<userId, Participant>                         |
 |     - videoId / playState / currentTime                |
 +------------------------------------------------------+
```

**Flow for a playback action (e.g. the host presses pause):**

1. The YouTube IFrame Player in Browser A fires `onStateChange`.
2. `VideoPlayer.tsx` checks it's a real user action (not one we just applied
   ourselves from a remote sync) and the local user is allowed to control
   playback, then emits `socket.emit("pause", { currentTime })`.
3. The server's `MessageHandler.handlePause` looks up the caller's `Room`
   and `Participant`, calls `canControlPlayback(role)` to check permission,
   updates `Room.playState`/`currentTime`, and calls
   `room.broadcastSyncState(io)`.
4. `broadcastSyncState` emits `sync_state` to every socket in that room
   (via a Socket.IO room keyed by `roomId` - this is what `socket.join(roomId)`
   is for).
5. Every client's `VideoPlayer.tsx` receives `sync_state`, sets a
   "we caused this, don't re-emit" guard, and calls `pauseVideo()` /
   `seekTo()` on its own YouTube player instance to match.

The server is the single source of truth: no client trusts another client's
video element directly, everything routes through the server so state can
be validated and kept consistent even if messages arrive slightly
out of order.

**Why polling for seeks?** The YouTube IFrame API has no `onSeek` event.
The client polls `getCurrentTime()` once a second while playing and, if the
elapsed time doesn't match what's expected (i.e. it jumped), treats that as
a manual seek and emits it. This is a standard workaround, not a Socket.IO
limitation.

---

## 4. Role-based access control

| Role        | Assigned by         | Can do |
|-------------|----------------------|--------|
| Host        | Automatic (room creator), or via "Make host" | Everything below, plus assign roles, remove participants, transfer host |
| Moderator   | Host                 | Play / pause / seek / change video |
| Participant | Host (default for joiners) | Watch only |

Enforcement lives entirely on the server, in `server/src/utils/roles.js`
and `server/src/handlers/MessageHandler.js` - every playback or
room-management event re-checks the caller's current role in the `Room`
before doing anything, and rejects (`error_message`) otherwise. The client
also disables/hides controls for restricted roles as a UX nicety, but that
is not what makes it secure - a participant who edited their browser's JS
would still be rejected server-side.

If the host leaves, the server automatically promotes the
longest-tenured remaining participant to host so the room isn't left
without control.

---

## 5. WebSocket events

Matches the assignment's suggested event list, with a couple of small
additions (`create_room`, `request_sync`, `chat_message`, `transfer_host`,
`you_were_removed`) needed to make a complete app.

**Client -> Server**
- `create_room { username }` -> ack `{ ok, roomId, userId, role, state, participants }`
- `join_room { roomId, username }` -> ack `{ ok, roomId, userId, role, state, participants }`
- `leave_room {}`
- `play { currentTime }` / `pause { currentTime }` / `seek { time }` / `change_video { videoId }` - Host/Moderator only
- `request_sync {}` - pull current state on demand
- `assign_role { userId, role }` / `remove_participant { userId }` / `transfer_host { userId }` - Host only
- `chat_message { text }`

**Server -> Clients**
- `sync_state { playState, currentTime, videoId }`
- `user_joined` / `user_left { ..., participants }`
- `role_assigned { userId, username, role, participants }`
- `participant_removed { userId, participants }`
- `you_were_removed { roomId }` - sent only to the removed user
- `chat_message { userId, username, text, timestamp }`
- `error_message { message }` - permission denied / bad input

---

## 6. Persistence (not implemented)

Rooms live in memory (`RoomManager`'s `Map`). This means a server restart
clears all rooms, and this codebase can't run multiple server instances
without a shared adapter (see below). This was an explicit scope cut for
the MVP - the assignment marks a database as optional. `RoomManager` is
written as the single access point for room data specifically so it could
be swapped for a Postgres/Mongo-backed version later without touching any
Socket.IO handler code.

---

## 7. Deployment

The two apps deploy independently.

### Backend -> Render (or Railway)

1. Push this repo to GitHub.
2. New Web Service on Render, root directory `server`.
3. Build command: `npm install` - Start command: `npm start`.
4. Environment variables:
   - `CLIENT_ORIGIN` = your deployed frontend URL (e.g. `https://watch-party.vercel.app`)
5. Render gives you a public URL like `https://watch-party-server.onrender.com`.

### Frontend -> Vercel (or Netlify / Render static site)

1. New Project on Vercel, root directory `client`.
2. Framework preset: Vite. Build command `npm run build`, output dir `dist`.
3. Environment variable:
   - `VITE_SERVER_URL` = your deployed backend URL from above.
4. Deploy -> you get a public URL like `https://watch-party.vercel.app`.

Update `CLIENT_ORIGIN` on the backend once you know the final frontend URL
(CORS + Socket.IO's CORS config both read it), and redeploy the backend.

**Platform limits worth knowing about:** Render's free tier spins a web
service down after inactivity, so the first request/connection after idle
can be slow (~30-60s) while it wakes up - expected, not a bug.

---

## 8. Trade-offs / known limitations

- **In-memory state only** - see [Persistence](#persistence-not-implemented).
- **Single server instance** - `io.to(roomId)` works because every client
  connects to the same process. Scaling to multiple instances needs the
  Socket.IO Redis adapter (Pub/Sub) so an event emitted on one instance
  reaches sockets connected to another - noted here rather than built,
  since the assignment lists this under bonus/scalability, not MVP.
- **Seek detection is heuristic** (polling + drift threshold), not exact,
  because the YouTube IFrame API doesn't expose a seek event.
- **No authentication** - usernames are self-reported per session, per the
  assignment's "watch only" MVP scope; `userId`s are server-generated and
  not guessable, which is enough to prevent casual spoofing but is not a
  real auth system.

---

## 9. Code walkthrough map

If asked to explain the code, here's where each concept lives:

- **Socket.IO usage**: `server/src/index.js` (server setup),
  `server/src/handlers/MessageHandler.js` (all event handling),
  `client/src/socket.ts` (client instance), `client/src/components/RoomView.tsx`
  (client-side listeners).
- **React structure**: `client/src/App.tsx` (routing between Home/Room),
  `client/src/components/*` (one component per concern).
- **Role-based logic**: `server/src/utils/roles.js` (the rules),
  `server/src/handlers/MessageHandler.js` (where they're enforced).
- **OOP design (bonus)**: `Room`, `Participant`, `RoomManager`,
  `MessageHandler` in `server/src/models` and `server/src/handlers`.
