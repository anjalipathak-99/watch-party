// A valid YouTube video ID is exactly 11 characters from this alphabet.
const YOUTUBE_ID_RE = /^[a-zA-Z0-9_-]{11}$/;

/**
 * True if `id` is exactly 11 characters from YouTube's video-ID alphabet.
 * This is the single source of truth for "is this a usable video ID" -
 * used both when parsing user input and when validating a videoId that
 * arrives over the socket (e.g. in a `sync_state` payload) before it is
 * ever handed to the YT.Player API.
 */
export function isValidYouTubeId(id: unknown): id is string {
  return typeof id === "string" && YOUTUBE_ID_RE.test(id);
}

/**
 * Accepts a full YouTube URL (watch, youtu.be, shorts, embed, live),
 * a protocol-relative/schemeless URL ("youtube.com/watch?v=..."), or a
 * bare 11-character video ID, and returns just the video ID - or null
 * if a valid 11-character ID couldn't be found.
 *
 * The return value is always either `null` or a string that passes
 * `isValidYouTubeId`, so callers never need to re-validate it.
 */
export function extractYouTubeId(input: string): string | null {
  const trimmed = input.trim();
  if (!trimmed) return null;

  // Bare video ID already.
  if (YOUTUBE_ID_RE.test(trimmed)) return trimmed;

  // Add a scheme if the user pasted a URL without one (e.g. copy-pasted
  // from an address bar that hides "https://", or typed by hand) so
  // `new URL()` doesn't throw and misclassify it as unparsable.
  const withScheme = /^[a-zA-Z][a-zA-Z0-9+.-]*:\/\//.test(trimmed)
    ? trimmed
    : `https://${trimmed}`;

  let url: URL;
  try {
    url = new URL(withScheme);
  } catch {
    return null;
  }

  const host = url.hostname.toLowerCase().replace(/^www\./, "");
  const candidate = extractCandidate(url, host);

  // Never trust the extracted value on its own - a truncated query
  // param, an extra path segment, or a playlist/list ID pasted in the
  // wrong place could all produce something that isn't a real video ID.
  return candidate && YOUTUBE_ID_RE.test(candidate) ? candidate : null;
}

function extractCandidate(url: URL, host: string): string | null {
  if (host === "youtu.be") {
    // Path is like "/dQw4w9WgXcQ" - take just the first segment, in
    // case of a trailing slash or (non-standard) extra path segments.
    return url.pathname.split("/").filter(Boolean)[0] ?? null;
  }

  if (host === "youtube.com" || host === "m.youtube.com" || host === "music.youtube.com") {
    if (url.pathname === "/watch") {
      return url.searchParams.get("v");
    }
    const match = url.pathname.match(/^\/(embed|shorts|live)\/([^/?#]+)/);
    if (match) return match[2];
  }

  return null;
}
