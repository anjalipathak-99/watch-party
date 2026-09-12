# Watch Party

Watch YouTube videos together in real time. One room, one shared video state
(play, pause, seek, current video), broadcast over WebSockets to everyone
in the room. The host controls who else gets to drive playback.

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
