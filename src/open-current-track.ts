import { Clipboard, closeMainWindow, showToast, Toast } from "@raycast/api";
import { execFile } from "node:child_process";

const FIELD_SEPARATOR = "\u001f";
const MIN_DIRECT_MATCH_SCORE = 160;

type SpotifyTrack = {
  uri: string;
  name: string;
  artist: string;
  album: string;
  durationMs: number;
};

type AppleMusicSong = {
  trackName?: string;
  artistName?: string;
  collectionName?: string;
  trackTimeMillis?: number;
  trackViewUrl?: string;
};

export default async function command() {
  await closeMainWindow();

  const toast = await showToast({
    style: Toast.Style.Animated,
    title: "Opening current Spotify track",
    message: "Reading Spotify...",
  });

  try {
    const track = await getCurrentSpotifyTrack();
    await Clipboard.copy(track.uri);

    toast.message = "Finding the Apple Music match...";

    const destination = await findAppleMusicDestination(track);
    await openInMusic(destination.url);

    toast.style = Toast.Style.Success;
    toast.title = "Opened in Apple Music";
    toast.message = destination.exact
      ? `${track.name} by ${track.artist} • Spotify URI copied`
      : `Opened Apple Music search • Spotify URI copied`;
  } catch (error) {
    toast.style = Toast.Style.Failure;
    toast.title = "Couldn't open the track";
    toast.message = getErrorMessage(error);
  }
}

async function getCurrentSpotifyTrack(): Promise<SpotifyTrack> {
  const output = await runAppleScript(`
    if application "Spotify" is not running then error "Spotify is not running."

    tell application "Spotify"
      if player state is stopped then error "Spotify is not currently on a track."

      set currentTrack to current track
      set trackUri to id of currentTrack
      set trackUrl to spotify url of currentTrack
      set trackName to name of currentTrack
      set trackArtist to artist of currentTrack
      set trackAlbum to album of currentTrack
      set trackDuration to duration of currentTrack

      return trackUri & (ASCII character 31) & trackUrl & (ASCII character 31) & trackName & (ASCII character 31) & trackArtist & (ASCII character 31) & trackAlbum & (ASCII character 31) & (trackDuration as string)
    end tell
  `);

  const [rawUri = "", rawUrl = "", name = "", artist = "", album = "", duration = "0"] = output.split(FIELD_SEPARATOR);
  const uri = rawUri.trim() || rawUrl.trim();

  if (!uri || !name.trim() || !artist.trim()) {
    throw new Error("Spotify didn't return enough track details.");
  }

  return {
    uri,
    name: name.trim(),
    artist: artist.trim(),
    album: album.trim(),
    durationMs: Number(duration) || 0,
  };
}

async function findAppleMusicDestination(track: SpotifyTrack): Promise<{ url: string; exact: boolean }> {
  const fallbackUrl = buildAppleMusicSearchUrl(track);

  try {
    const bestMatch = await findBestAppleMusicMatch(track);
    if (bestMatch?.trackViewUrl) {
      return { url: bestMatch.trackViewUrl, exact: true };
    }
  } catch {
    // If the catalog request fails, we can still open the search page directly in Music.
  }

  return { url: fallbackUrl, exact: false };
}

async function findBestAppleMusicMatch(track: SpotifyTrack): Promise<AppleMusicSong | undefined> {
  const country = getCountryCode();
  const params = new URLSearchParams({
    term: `${track.name} ${track.artist}`,
    media: "music",
    entity: "song",
    limit: "10",
    country,
  });

  const response = await fetch(`https://itunes.apple.com/search?${params.toString()}`);
  if (!response.ok) {
    throw new Error(`Apple Music search failed with status ${response.status}.`);
  }

  const payload = (await response.json()) as { results?: AppleMusicSong[] };
  const candidates = payload.results?.filter((result) => Boolean(result.trackName && result.artistName && result.trackViewUrl)) ?? [];

  const scoredCandidates = candidates
    .map((candidate) => ({
      candidate,
      score: scoreCandidate(track, candidate),
    }))
    .sort((left, right) => right.score - left.score);

  if (!scoredCandidates[0] || scoredCandidates[0].score < MIN_DIRECT_MATCH_SCORE) {
    return undefined;
  }

  return scoredCandidates[0].candidate;
}

function scoreCandidate(track: SpotifyTrack, candidate: AppleMusicSong): number {
  const trackName = normalizeTitle(track.name);
  const candidateName = normalizeTitle(candidate.trackName ?? "");
  const trackArtist = normalizeText(track.artist);
  const candidateArtist = normalizeText(candidate.artistName ?? "");
  const trackAlbum = normalizeText(track.album);
  const candidateAlbum = normalizeText(candidate.collectionName ?? "");

  let score = 0;

  if (trackName === candidateName) {
    score += 120;
  } else if (candidateName.startsWith(trackName) || trackName.startsWith(candidateName)) {
    score += 90;
  } else if (candidateName.includes(trackName) || trackName.includes(candidateName)) {
    score += 60;
  }

  if (trackArtist === candidateArtist) {
    score += 110;
  } else if (candidateArtist.includes(trackArtist) || trackArtist.includes(candidateArtist)) {
    score += 70;
  }

  if (trackAlbum && candidateAlbum) {
    if (trackAlbum === candidateAlbum) {
      score += 25;
    } else if (candidateAlbum.includes(trackAlbum) || trackAlbum.includes(candidateAlbum)) {
      score += 10;
    }
  }

  if (track.durationMs > 0 && candidate.trackTimeMillis) {
    const diff = Math.abs(track.durationMs - candidate.trackTimeMillis);
    if (diff <= 1500) {
      score += 35;
    } else if (diff <= 4000) {
      score += 20;
    } else if (diff > 15000) {
      score -= 40;
    }
  }

  return score;
}

function buildAppleMusicSearchUrl(track: SpotifyTrack): string {
  const country = getCountryCode().toLowerCase();
  const params = new URLSearchParams({
    term: `${track.name} ${track.artist}`,
  });

  return `https://music.apple.com/${country}/search?${params.toString()}`;
}

function normalizeTitle(value: string): string {
  return normalizeText(
    value
      .replace(/\((.*?)\)/g, " ")
      .replace(/\[(.*?)\]/g, " ")
      .replace(/\b(feat\.?|featuring)\b.*$/i, " "),
  );
}

function normalizeText(value: string): string {
  return value
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9]+/g, " ")
    .trim()
    .toLowerCase();
}

function getCountryCode(): string {
  const localeCandidates = [Intl.DateTimeFormat().resolvedOptions().locale, process.env.LANG].filter(Boolean) as string[];

  for (const locale of localeCandidates) {
    try {
      const region = new Intl.Locale(locale).maximize().region;
      if (region) {
        return region.toUpperCase();
      }
    } catch {
      const match = locale.match(/[-_]([a-zA-Z]{2})/);
      if (match?.[1]) {
        return match[1].toUpperCase();
      }
    }
  }

  return "US";
}

async function runAppleScript(script: string): Promise<string> {
  const lines = script
    .split("\n")
    .map((line) => line.trimEnd())
    .filter((line) => line.length > 0);

  const args = lines.flatMap((line) => ["-e", line]);
  return runCommand("/usr/bin/osascript", args);
}

async function openInMusic(url: string): Promise<void> {
  await runCommand("/usr/bin/open", ["-a", "Music", url]);
}

async function runCommand(command: string, args: string[]): Promise<string> {
  return await new Promise((resolve, reject) => {
    execFile(command, args, (error, stdout, stderr) => {
      if (error) {
        reject(new Error(stderr.trim() || error.message));
        return;
      }

      resolve(stdout.trim());
    });
  });
}

function getErrorMessage(error: unknown): string {
  if (error instanceof Error && error.message.trim()) {
    return error.message.trim();
  }

  return "Something went wrong.";
}
