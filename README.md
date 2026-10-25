# Kirby Super Star · Together

A static GitHub Pages player for the supplied Kirby Super Star (USA) ROM, with two-player WebRTC rooms, a landscape touch controller, and a checkpoint-based level launcher.

Play at **https://jpdieffe.github.io/kirby_ss/** once the Pages deployment completes.

## Play together

1. The host selects **Create a room**, then **Invite** to copy or share the room link.
2. A friend opens that link and selects **Join**, or enters the two-character room code (for example, `K7`). Codes are case-insensitive. Existing ten-character invitations still work for older rooms.
3. The host presses **Start** to pass the intro/title screen and chooses an adventure. Kirby must inhale an enemy, gain its ability, then press **A** to create a helper. The guest controls the helper on SNES controller port two.
4. Keep the host's tab visible. Switching away pauses the emulator; leaving ends the room. A disconnected guest can rejoin using the same code while the host stays connected.

The host runs one Snes9x emulator. Its canvas and game audio stream to the guest; the guest sends controller snapshots back. This is host-streamed multiplayer, not deterministic emulation on both devices. The guest never needs to run or download the ROM. Video encoding, network round-trip time, and the host device determine responsiveness.

## Controls

| SNES | Keyboard | Action |
| --- | --- | --- |
| D-pad | Arrow keys | Move |
| B | Z | Jump |
| Y | S | Inhale / attack |
| A | X | Create / manage helper |
| X | A | Game-specific action |
| L / R | Q / W | Guard |
| Start | Enter | Start / pause |
| Select | Shift | Select |

Both players also have multitouch controls and support for one standard-mapped USB/Bluetooth gamepad per browser. Buttons and D-pad support simultaneous input; the D-pad supports sliding and diagonals. Input releases on blur, canceled touches, and disconnect. Remote held buttons expire after 600 ms without input snapshots.

## Phones

Use landscape in a current Android Chrome or iOS Safari browser. Touch controls sit to the left and right of the game. The guest taps the audio prompt to allow playback. Android can request fullscreen and orientation lock where available. iPhone users rotate manually and can use Safari's **Add to Home Screen** for more space. The app requests a screen wake lock where supported.

Desktop Chromium and phone-sized layouts are covered by automated tests. Actual Android/iPhone hardware and cross-carrier networks still need device testing. This is an online site, not an offline PWA.

## Level launcher

Open **Levels** during a host or solo game. Save the current moment with a name, then **Play** to restore it immediately. Checkpoints restore the entire game state, including lives and progress. They are stored in IndexedDB on the host browser, independent of the game's native save files. Use **Export** / **Import** for backups or sharing. Clearing site data removes local saves.

The launcher includes captured starting points for **Spring Breeze / Green Greens**, **The Great Cave Offensive**, and the original **adventure selection menu**. These start with fresh progress, not your current inventory. They were captured in this exact ROM/core combination. Additional levels can be bookmarked during gameplay.

This implements reliable level selection through captured states, not arbitrary ROM memory warps. Other unvisited levels need a checkpoint captured through gameplay first. Imported checkpoints must match the pinned emulator version and SHA-256 of the supplied ROM archive. Guests follow the host's selected state automatically through the game stream.

## Networking

GitHub Pages serves the static app. PeerJS 1.5.5 uses its public signaling service for room discovery; signaling is not hosted on GitHub Pages. Default STUN servers discover direct routes. Room codes use two letters/digits from an alphabet without ambiguous characters. Occupied codes are retried automatically, up to 20 distinct attempts, and each room admits only one guest. These short codes identify rooms; they are not passwords.

Some carrier networks, VPNs, and restrictive NATs cannot connect directly. **Help → Connection settings** accepts an optional TURN URL, username, and credential, and a custom secure PeerServer hostname/port/path. Configure these before creating/joining a room on both browsers. TURN relays the encrypted WebRTC traffic and is no longer a purely direct route. No relay is bundled or guaranteed by the public signaling service. Connection settings remain in tab memory; no credentials are committed or stored by this app.

No microphone, camera, account, analytics, or application backend is required. The host captures only the emulator canvas and audio. The public signaling and STUN services still observe connection metadata.

## Run and test

Requires Node.js 22+.

```sh
npm ci
npm start
```

Open `http://127.0.0.1:4173`. Localhost is a secure context for WebRTC; testing on a physical phone requires an HTTPS origin, such as the deployed Pages site.

```sh
npm run check
npm test
npm run test:browser
npm run test:network
```

Browser tests use an installed Google Chrome via Playwright. The network test needs internet access to the signaling service. It creates separate browser contexts, checks video/audio tracks and visible game pixels, validates guest input arriving at port two, rejects a third player, and verifies disconnect release and rejoining. Screenshots are written under ignored `test-results/`.

## Deploy

The workflow in `.github/workflows/pages.yml` runs checks and deploys only `site/` on pushes to `main`. Repository **Settings → Pages → Source** must be **GitHub Actions**. All asset URLs are relative and work under `/kirby_ss/`.

The included `scripts/github.mjs` is an optional maintainer helper for this repository. It uses the existing Git credential helper in memory and never prints its token. `inspect`, `enable-pages`, `status`, and `jobs RUN_ID` inspect or configure Pages. It is not part of the deployed website.

## Dependencies and source

- [EmulatorJS v4.2.3](https://github.com/EmulatorJS/EmulatorJS/tree/v4.2.3), GPL-3.0. Runtime, archive decoders, and Snes9x standard/legacy cores are vendored from `https://cdn.emulatorjs.org/4.2.3/data/`. The sole loader modification disables its external update probe to keep the pinned runtime self-contained. The adapter uses internal `gameManager` APIs; upgrade the runtime, core, and checkpoint format together and retest.
- [EmulatorJS RetroArch](https://github.com/EmulatorJS/RetroArch) and [core build tooling](https://github.com/EmulatorJS/build), with [Snes9x source](https://github.com/snes9xgit/snes9x). Retained license files are under `site/vendor/emulator/`.
- [PeerJS 1.5.5](https://github.com/peers/peerjs/tree/v1.5.5), MIT. The installed npm package is copied to `site/vendor/peerjs.min.js`; its license is retained alongside it.

The supplied game archive is `site/roms/kirby-super-star.zip`, SHA-256 `a273714fd76def1e6dcdd4c698516a4a6fdf7a4ff7df56ae2612bfd8842105fc`. Game assets retain their original ownership; Kirby and Kirby Super Star belong to Nintendo / HAL Laboratory. This is an unofficial fan project, not an affiliation or endorsement.
