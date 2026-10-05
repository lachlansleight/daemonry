# daemonry

Menu bar supervisor for long-running local console apps. See [DESIGN.md](DESIGN.md) for
the full design, data model, protocol and milestones.

## Status

Milestones 1 to 5 are done. Apps can be configured, started, stopped and restarted from
the tray or the GUI; they run in their own process group with the login shell's
environment, autostart with daemonry, are killed as a tree after the grace period, and
are all stopped on quit. Output goes to rotated log files and a live log view in the
GUI. Apps that include the client declare commands that appear in the tray and GUI,
report a status line, and get a graceful shutdown message. It packages into a `.app` that can launch at login. Not yet: Windows testing
(milestone 6).

## Integrating an app

Copy [client/daemonry-client.ts](client/daemonry-client.ts) into your app. It has no
dependencies and does nothing when the app is not launched by daemonry.

```ts
import { daemonry } from './daemonry-client.ts'

daemonry.commands([{ id: 'reload', label: 'Reload config' }])
daemonry.onCommand((id) => { if (id === 'reload') reload() })
daemonry.onShutdown(() => { tidyUp(); process.exit(0) })  // optional
daemonry.status('Idle')                                   // optional
```

[examples/hello-app](examples/hello-app) is a complete tiny example. Add that folder in
daemonry with the command `npm start` and its commands show up in the menu.

## Develop

```bash
npm install
npm run dev
```

`npm run dev` starts the renderer dev server with hot reload and launches Electron. The
app has no dock icon; look for the ring icon in the menu bar. The GUI opens on first run,
or from the tray's "Open daemonry".

Opening `http://localhost:5173` in a normal browser while `npm run dev` is running shows the
renderer against an in-memory mock with three sample apps, useful for UI work without Electron.

Dev switches: `DAEMONRY_USER_DATA=<dir>` runs against a separate profile,
`DAEMONRY_INSPECT_PORT=9333` opens the Node inspector on the main process so
`node scripts/dev-eval.mjs "<expr>"` can drive it, `DAEMONRY_KEEP_DOCK=1` keeps the dock icon,
`DAEMONRY_LOG_MAX_BYTES=20000` rotates app logs early for testing.

Other scripts:

| Script | What it does |
| --- | --- |
| `npm run typecheck` | Type-checks main, preload and renderer |
| `npm run build` | Bundles everything into `out/` |
| `npm run icons` | Regenerates the tray PNGs in `resources/tray` |
| `npm run package` | Unpacked `daemonry.app` in `release/mac-arm64/` |
| `npm run install:mac` | Packages, quits any running copy, and copies the app into `/Applications` |
| `npm run dist:mac` | DMG and zip in `release/` |
| `npm run dist:win` | NSIS installer, to be run on Windows |

## Install on macOS

```bash
npm run install:mac
```

Then open `/Applications/daemonry.app`. Opening it yourself shows the window; a launch at
login stays in the menu bar. Turn on "Launch daemonry at login" in Settings; macOS 13+ may ask you to approve it under System Settings > General > Login
Items, and the Settings page shows an Open button while that is pending.

Notes:

- The build is unsigned apart from an ad-hoc signature, so it runs locally without
  Gatekeeper involvement. A copy that arrives through a download or AirDrop gets
  quarantined and macOS will call it damaged; clear that with
  `xattr -dr com.apple.quarantine /Applications/daemonry.app`.
- Keep the app in `/Applications`. The login item points at that path, and moving the
  bundle makes macOS report it as not found until the toggle is switched off and on.
- The installed app and `npm run dev` share the same config and single-instance lock,
  so quit the installed copy before developing, or give the dev run its own profile
  with `DAEMONRY_USER_DATA=/tmp/daemonry-dev npm run dev`.

## App icon

Recent macOS draws every app icon inside its rounded "glass" square. An icon that is
just a glyph on a transparent background gets shrunk into a default square, which is
what a plain Figma export looks like. Two ways to control the background and glyph:

**Icon Composer (best on macOS 26+).** It ships inside Xcode:
`/Applications/Xcode.app/Contents/Applications/Icon Composer.app`. Make a new macOS
icon, set the background fill (solid or gradient), add the glyph as an SVG or PNG layer,
and save the document as `build/daemonry.icon`. The build picks it up automatically
(`mac.icon` in `electron-builder.cjs`, rendered with Xcode's `actool`) and the system
then handles light, dark, clear and tinted variants itself. A legacy `.icns` is
generated from it too for older macOS.

**Plain PNG.** Put a 1024x1024 PNG at `build/icon.png` and draw the full rounded square
yourself: background colour filling Apple's shape (an 824px square centred in 1024,
corner radius about 185), glyph on top, margin transparent. electron-builder converts
it to `.icns` and `.ico`. This is also the Windows source either way, since Windows
ignores the Icon Composer document.

After reinstalling with a new icon, Finder and the Dock may keep showing the old one
from their cache. `npm run install:mac` touches the bundle and re-registers it, which
usually suffices; otherwise `killall Dock`.

The dock icon appears only while the daemonry window is open; with the window closed
daemonry is a pure menu bar app.

## Paths

| | macOS | Windows |
| --- | --- | --- |
| Config | `~/Library/Application Support/daemonry/config.json` | `%APPDATA%\daemonry\config.json` |
| Logs | `~/Library/Logs/daemonry/` | `%APPDATA%\daemonry\logs\` |

## Layout

```
src/main        Electron main process (config, store, tray, window, ipc, supervisor)
src/preload     window.daemonry bridge
src/renderer    React + Tailwind GUI
src/shared      Types shared by all three
client/         daemonry-client.ts for apps (milestone 4)
resources/tray  Generated tray icons
scripts/        Icon generator
```
