import { useEffect, useRef, useState } from "react";
import { socket } from "../socket";
import { isValidYouTubeId } from "../utils/youtube";
import type { RoomState } from "../types";

declare global {
  interface Window {
    YT: any;
    onYouTubeIframeAPIReady: () => void;
  }
}

let apiLoadPromise: Promise<void> | null = null;

function loadYouTubeApi(): Promise<void> {
  if (window.YT && window.YT.Player) return Promise.resolve();
  if (apiLoadPromise) return apiLoadPromise;

  apiLoadPromise = new Promise((resolve) => {
    const prevReady = window.onYouTubeIframeAPIReady;
    window.onYouTubeIframeAPIReady = () => {
      prevReady?.();
      resolve();
    };
    const tag = document.createElement("script");
    tag.src = "https://www.youtube.com/iframe_api";
    document.head.appendChild(tag);
  });
  return apiLoadPromise;
}

// How far apart local vs. server time can drift before we hard-correct it.
const DRIFT_TOLERANCE_SECONDS = 1.5;
// How often we poll the player to detect the local user scrubbing the seek bar.
const POLL_INTERVAL_MS = 1000;

interface Props {
  remoteState: RoomState;
  canControl: boolean;
  containerId: string;
}

export default function VideoPlayer({ remoteState, canControl, containerId }: Props) {
  const playerRef = useRef<any>(null);
  const readyRef = useRef(false);
  const applyingRemoteRef = useRef(false);
  const lastKnownTimeRef = useRef(0);
  const currentVideoIdRef = useRef<string | null>(null);
  const pollRef = useRef<number | null>(null);

  // Surfaces a friendly message instead of letting a bad/unplayable video
  // ID crash or silently freeze the player. Cleared whenever a new,
  // validly-shaped video ID starts loading.
  const [playerError, setPlayerError] = useState<string | null>(null);

  // canControl can change mid-session (the host promotes/demotes someone),
  // but the YT player + its event callbacks are only created once below.
  // Keep a ref in sync so those callbacks always see the *current* value
  // instead of the one captured when the player was created.
  const canControlRef = useRef(canControl);
  useEffect(() => {
    canControlRef.current = canControl;
  }, [canControl]);

  // Create the player once.
  useEffect(() => {
    let cancelled = false;

    loadYouTubeApi().then(() => {
      if (cancelled) return;

      // A videoId can arrive from another client (or an old server
      // record) via the socket, so it is never trusted just because it's
      // non-null - only a value that matches YouTube's ID shape is ever
      // handed to YT.Player. Anything else is treated as "no video yet".
      const initialVideoId = isValidYouTubeId(remoteState.videoId) ? remoteState.videoId : null;

      try {
        // Do not pass `videoId: undefined` to the YouTube API. Some versions
        // of the IFrame API treat the presence of the property itself as an
        // invalid video id and throw "Invalid video id" during construction.
        const playerOptions: any = {
          height: "100%",
          width: "100%",
          playerVars: {
            rel: 0,
            modestbranding: 1,
            // Always enable the native controls/keyboard here - restricting
            // playback for viewers is handled reactively by an overlay in the
            // render below (see .player-lock-overlay), so a role change mid-
            // session takes effect immediately without recreating the iframe.
            controls: 1,
            disablekb: 0,
          },
          events: {
            onReady: () => {
              readyRef.current = true;
              currentVideoIdRef.current = initialVideoId;
              if (initialVideoId) {
                applyRemoteState(remoteState);
              }
            },
            onStateChange: (event: any) => onPlayerStateChange(event),
            onError: (event: any) => onPlayerError(event),
          },
        };

        // Only include videoId when a real ID exists. A newly-created room
        // starts with no video, and the player can be populated later via
        // cueVideoById/loadVideoById after the host chooses a video.
        if (initialVideoId) {
          playerOptions.videoId = initialVideoId;
        }

        playerRef.current = new window.YT.Player(containerId, playerOptions);
      } catch (err) {
        // Defensive: a malformed embed can throw synchronously rather
        // than going through onError. Never let that crash the component.
        console.error("Failed to initialize YouTube player", err);
        setPlayerError("Couldn't load the video player. Try reloading the page.");
      }
    });

    pollRef.current = window.setInterval(pollForManualSeek, POLL_INTERVAL_MS);

    return () => {
      cancelled = true;
      if (pollRef.current) window.clearInterval(pollRef.current);
      playerRef.current?.destroy?.();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Apply updates whenever the server broadcasts a new sync_state.
  useEffect(() => {
    if (!readyRef.current) return;
    applyRemoteState(remoteState);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [remoteState.videoId, remoteState.playState, remoteState.currentTime]);

  function applyRemoteState(state: RoomState) {
    const player = playerRef.current;
    // Re-validate here too: this function runs both on initial ready and
    // on every subsequent sync_state broadcast, and a videoId broadcast
    // by the server is never guaranteed to be a well-formed ID.
    const videoId = isValidYouTubeId(state.videoId) ? state.videoId : null;
    if (!player || !videoId) return;

    applyingRemoteRef.current = true;

    if (currentVideoIdRef.current !== videoId) {
      currentVideoIdRef.current = videoId;
      setPlayerError(null);
      try {
        if (state.playState === "playing") {
          player.loadVideoById(videoId, state.currentTime);
        } else {
          player.cueVideoById(videoId, state.currentTime);
        }
      } catch (err) {
        console.error("Failed to load video", err);
        setPlayerError("This video couldn't be loaded. Ask the host to try a different link.");
      }
    } else {
      const localTime = safeGetCurrentTime(player);
      if (Math.abs(localTime - state.currentTime) > DRIFT_TOLERANCE_SECONDS) {
        player.seekTo(state.currentTime, true);
      }
      if (state.playState === "playing") {
        player.playVideo();
      } else {
        player.pauseVideo();
      }
    }

    lastKnownTimeRef.current = state.currentTime;

    // Release the "we caused this" guard shortly after, once the resulting
    // onStateChange events (triggered by our own play/pause/seek calls)
    // have had a chance to fire and be ignored.
    window.setTimeout(() => {
      applyingRemoteRef.current = false;
    }, 400);
  }

  function safeGetCurrentTime(player: any): number {
    try {
      return player.getCurrentTime?.() ?? 0;
    } catch {
      return 0;
    }
  }

  function onPlayerStateChange(event: any) {
    if (!canControlRef.current) return;
    if (applyingRemoteRef.current) return;

    const player = playerRef.current;
    const time = safeGetCurrentTime(player);
    const YT_STATE = window.YT.PlayerState;

    if (event.data === YT_STATE.PLAYING) {
      lastKnownTimeRef.current = time;
      socket.emit("play", { currentTime: time });
    } else if (event.data === YT_STATE.PAUSED) {
      lastKnownTimeRef.current = time;
      socket.emit("pause", { currentTime: time });
    }
  }

  // YouTube IFrame API error codes: 2 = the videoId is malformed/invalid,
  // 5 = HTML5 player error, 100 = video not found/removed, 101 & 150 =
  // the uploader disabled embedding. All of these mean "this particular
  // video can't play here" rather than something we can retry from -
  // surface a message instead of leaving the user looking at a dead
  // player or letting the rejection go unhandled.
  function onPlayerError(event: any) {
    console.warn("YouTube player error", event?.data);
    setPlayerError(
      event?.data === 101 || event?.data === 150
        ? "The video owner has disabled playback outside of YouTube."
        : "This video can't be played. Ask the host to choose a different one."
    );
  }

  // Detect a manual seek: if we're playing and the elapsed wall-clock time
  // doesn't match the elapsed video time, the user dragged the scrubber.
  // The YouTube IFrame API has no dedicated "onSeek" event, so polling is
  // the standard workaround.
  function pollForManualSeek() {
    if (!canControlRef.current) return;
    if (applyingRemoteRef.current) return;
    const player = playerRef.current;
    if (!player || !window.YT) return;

    try {
      const state = player.getPlayerState();
      if (state !== window.YT.PlayerState.PLAYING) return;

      const time = safeGetCurrentTime(player);
      const expected = lastKnownTimeRef.current + POLL_INTERVAL_MS / 1000;
      if (Math.abs(time - expected) > DRIFT_TOLERANCE_SECONDS) {
        socket.emit("seek", { time });
      }
      lastKnownTimeRef.current = time;
    } catch {
      // player not ready yet; ignore
    }
  }

  return (
    <div className="player-shell">
      <div id={containerId} />
      {!remoteState.videoId && !playerError && (
        <div className="player-empty">
          {canControl
            ? "Paste a YouTube link below to start the party."
            : "Waiting for the host to choose a video..."}
        </div>
      )}
      {playerError && <div className="player-empty error-banner">{playerError}</div>}
      {/* Blocks clicks/keyboard focus on the native YouTube controls for
          viewers. Driven straight off the `canControl` prop (not a ref),
          so it updates the instant the host promotes/demotes someone -
          no iframe recreation or page reload needed. */}
      {remoteState.videoId && !canControl && (
        <div
          className="player-lock-overlay"
          title="Only the host and moderators can control playback"
        />
      )}
    </div>
  );
}
