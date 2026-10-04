# daemonry

Menu bar supervisor for long-running local console apps. See [DESIGN.md](DESIGN.md) for
the full design, data model, protocol and milestones.

## Status

Milestones 1 to 4 are done. Apps can be configured, started, stopped and restarted from
the tray or the GUI; they run in their own process group with the login shell's
environment, autostart with daemonry, are killed as a tree after the grace period, and
are all stopped on quit. Output goes to rotated log files and a live log view in the
GUI. Apps that include the client declare commands that appear in the tray and GUI,
report a status line, and get a graceful shutdown message. Not yet: packaging and login
item (milestone 5), Windows testing (milestone 6).

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
| `npm run package` | Unpacked app in `release/` for a local test |
| `npm run dist:mac` | DMG and zip in `release/` |
| `npm run dist:win` | NSIS installer, to be run on Windows |

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
