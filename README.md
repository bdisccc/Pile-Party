# Pile Party — Complete standalone source project

A mobile-first, browser-based **real-time multiplayer matching-card game** with room codes, 2–7 players, solo practice, and custom image sets. No installation dependencies are required beyond Node.js 20+.

> **Source disclosure:** This is a self-contained reconstruction of the earlier Pile Party prototype. The original private hosted project's source repository could not be retrieved in this session, so this is **not an exact export of that repository**. It is fully editable and can be run/deployed independently.

## Start locally

1. Install [Node.js](https://nodejs.org/) version 20 or later.
2. Extract this ZIP into a folder.
3. Open a terminal in that folder.
4. Run:

   ```bash
   npm start
   ```

5. Open **http://localhost:3000** on the same computer.

### Windows PowerShell example

```powershell
cd "F:\Downloads\WEB DEVELOPMENT\30 day challenge\PileParty"
npm start
```

The path above is only an example—use the folder where you extracted the ZIP.

## Play with friends

- **On the public Internet:** Deploy this project to a Node.js host that supports long-lived SSE connections (e.g., Render, Railway, a VPS). Set the start command to `npm start`, and let the provider populate its `PORT` environment variable. Share the public HTTPS URL.
- **On the same Wi-Fi:** Run the server on your PC, find your PC's local IPv4 address (`ipconfig` on Windows), and open `http://YOUR-PC-IP:3000` on friends' phones. Your firewall must allow the connection. Use HTTPS when deploying publicly.
- **Create Game** is available from the **Home page**, not the **Join Game page**. On **Join Game**, players only see the join form and a short caveat linking back to Home if they want to host.

## Rules supported

- 2–7 multiplayer, six piles of four cards per player.
- One matching set is four cards with the same image/emoji identity, using four different color frames (instead of the original game’s differently colored clothing artwork).
- Classic mode has four shared center cards; Chaos mode has eight.
- The server requires **discarding to the center before taking** a replacement, one card at a time.
- A player must finish any incomplete swap before opening another pile.
- Completed sets are locked and revealed; first player to complete all six wins.
- Everyone acts simultaneously. The server arbitrates races for shared cards so only one player can take each card.
- The host can start the round or rematch. Solo practice is also available.

Inspired by the *game mechanics* explained in the [Piles rulebook](https://foxmind.co.il/wp-content/uploads/2024/09/Piles-Rules-EN-FM-P.pdf). Official art and branding are **not** included.

## Custom matching sets

In the lobby, the host can upload multiple PNG, JPEG or WEBP pictures. Each uploaded image represents **one four-card set**, with four colored frames. Up to 44 custom set images can be saved in a room. To fill a whole custom-only deck:

| Players | Classic sets needed | Chaos sets needed |
|---:|---:|---:|
| 2 | 13 | 14 |
| 3 | 19 | 20 |
| 4 | 25 | 26 |
| 5 | 31 | 32 |
| 6 | 37 | 38 |
| 7 | 43 | 44 |

**Partial custom decks are supported:** the game automatically uses built-in emoji sets for remaining categories. Pictures are resized in the browser (350px maximum dimension) before uploading to the room server. The host can remove images before starting the round.

## Files

- `server.mjs`: dependency-free Node HTTP server, room state, SSE updates, deck creation, strict move validation, privacy for other players' hands.
- `public/index.html`: HTML entry point.
- `public/styles.css`: responsive mobile UI.
- `public/app.js`: gameplay interface, real-time updates, join/create navigation, uploads, timers.
- `test/game.test.mjs`: basic room, privacy, and move-order tests.
- `package.json`: development/start/test scripts.

## Limitations / production hardening

This is a working multiplayer MVP. **Room state and custom uploads are in memory**, so restarting the server clears all rooms. It does not include accounts, matchmaking, moderation, or an administrative dashboard. For serious public hosting, add Redis/database storage, file/object storage, rate limits, image scanning, secure cookies or a robust session design, reconnection/quit flows, deployment monitoring, and abuse protection. Because each running server keeps its own rooms, deploy one server instance unless you add shared state and event coordination.

For production, keep HTTPS enabled and do not share player session tokens. SSE uses a URL token to authenticate players, which is convenient for a prototype but should be moved to secure cookie sessions in production.

## Tests

```bash
npm test
```

If port 3000 is busy on Windows PowerShell, use:

```powershell
$env:PORT=3001; npm start
```
