# Spotify to Apple Music

This is a tiny local Raycast extension with one command:

- It reads the current Spotify track.
- It copies that Spotify track URI to your clipboard.
- It finds the closest Apple Music match.
- It opens the song in the macOS Music app.

## Run it locally

1. Install dependencies with `npm install`.
2. Start Raycast development with `npm run dev`.
3. Run `Spotify to Apple Music` from Raycast.

## Notes

- The first run may trigger macOS automation prompts for Spotify and Music.
- If the extension cannot confidently match the exact song, it falls back to opening the Apple Music search page for the current track.
