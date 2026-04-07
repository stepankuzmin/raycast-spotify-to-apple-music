import { Clipboard, open, showHUD } from "@raycast/api";
import { execFile } from "node:child_process";

const SEPARATOR = "\u001f";

type SpotifyTrack = {
  uri: string;
  name: string;
  artist: string;
};

type AppleMusicSong = {
  trackName?: string;
  artistName?: string;
  trackViewUrl?: string;
};

export default async function command() {
  try {
    const track = await getCurrentSpotifyTrack();
    await Clipboard.copy(track.uri);
    await open(await findAppleMusicUrl(track), "Music");
    await showHUD("Opened in Apple Music");
  } catch (error) {
    await showHUD(getErrorMessage(error));
  }
}

async function getCurrentSpotifyTrack(): Promise<SpotifyTrack> {
  const output = await runAppleScript(`
    if application "Spotify" is not running then error "Spotify is not running."

    tell application "Spotify"
      if player state is stopped then error "Spotify is not currently on a track."

      return (id of current track) & (ASCII character 31) & (name of current track) & (ASCII character 31) & (artist of current track)
    end tell
  `);

  const [uri = "", name = "", artist = ""] = output.split(SEPARATOR).map((value) => value.trim());

  if (!uri || !name || !artist) {
    throw new Error("Spotify didn't return enough track details.");
  }

  return { uri, name, artist };
}

async function findAppleMusicUrl(track: SpotifyTrack): Promise<string> {
  const country = getCountryCode();
  try {
    const params = new URLSearchParams({
      term: `${track.artist} ${track.name}`,
      media: "music",
      entity: "song",
      limit: "5",
      country,
    });

    const response = await fetch(`https://itunes.apple.com/search?${params.toString()}`);
    if (!response.ok) {
      throw new Error(`Apple Music search failed with status ${response.status}.`);
    }

    const payload = (await response.json()) as { results?: AppleMusicSong[] };
    const exactishMatch = payload.results?.find((song) => isSameSong(track, song));
    return exactishMatch?.trackViewUrl ?? buildAppleMusicSearchUrl(track, country);
  } catch {
    return buildAppleMusicSearchUrl(track, country);
  }
}

function isSameSong(track: SpotifyTrack, song: AppleMusicSong): boolean {
  const trackTitle = normalizeTitle(track.name);
  const songTitle = normalizeTitle(song.trackName ?? "");
  const trackArtist = normalizeText(track.artist);
  const songArtist = normalizeText(song.artistName ?? "");

  return trackTitle === songTitle && (trackArtist === songArtist || trackArtist.includes(songArtist) || songArtist.includes(trackArtist));
}

function buildAppleMusicSearchUrl(track: SpotifyTrack, country = getCountryCode()): string {
  const params = new URLSearchParams({
    term: `${track.artist} ${track.name}`,
  });

  return `https://music.apple.com/${country.toLowerCase()}/search?${params.toString()}`;
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
  const locale = Intl.DateTimeFormat().resolvedOptions().locale || process.env.LANG || "";
  return locale.match(/[-_]([a-zA-Z]{2})/)?.[1]?.toUpperCase() ?? "US";
}

async function runAppleScript(script: string): Promise<string> {
  return await new Promise((resolve, reject) => {
    execFile("/usr/bin/osascript", ["-e", script], (error, stdout, stderr) => {
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
