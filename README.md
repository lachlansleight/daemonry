# daemonry

Menu bar supervisor for long-running local console apps. See [DESIGN.md](DESIGN.md) for
the full design, data model, protocol and milestones.

## Status

Milestone 1 (scaffold) is done: tooling, shared types, config store, window, tray with the
full menu structure, and the renderer with every page and the app form. Start, stop,
restart and commands are wired through to a supervisor that is not implemented yet; they
log a warning and return an error until milestone 2.

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
