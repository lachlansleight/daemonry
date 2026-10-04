# daemonry — design

A macOS menu bar app (Windows later) that runs long-lived local console programs,
mostly Node.js, as supervised child processes. It starts them at login, shows their
state in the menu bar, and lets you send named commands into them.

Package name: `daemonry-app`. Product name shown in the UI: `daemonry`.

## Goals

- One menu bar icon owning a set of configured apps.
- Per app: start, stop, restart, send a declared command, view logs, reveal folder.
- Per app config: name, folder, one launch command, autostart, env vars, stop grace.
- Daemonry itself can launch at login. Each app can autostart when daemonry starts.
- Apps integrate with a single dependency-free TypeScript file. Apps that do not
  integrate still get start/stop/restart/logs, just no commands or status text.
- Crashes are shown, never auto-restarted. The tray icon turns red while any app is crashed.

## Non-goals

- Auto-restart or health checks.
- Apps outliving daemonry. Quitting daemonry stops every app.
- Multiple instances of one app.
- Secrets management. Config is plaintext JSON; secrets stay in each app's own `.env`.

## Architecture

Electron, TypeScript throughout, built with electron-vite, packaged with electron-builder.

```
src/main        Electron main process: supervisor, tray, config, logs, app socket server
src/preload     contextBridge exposing a typed `window.daemonry` API to the renderer
src/renderer    React + Tailwind GUI (dark, minimal, sidebar + main panel)
src/shared      Types shared by all three: config, runtime state, IPC, socket protocol
client/         daemonry-client.ts, the single file apps copy into their source
resources/      Tray icons and app icon
```

The main process is the single source of truth. It owns the config and the runtime
state of every app and broadcasts a full `Snapshot` to the renderer whenever anything
changes. The renderer is a pure view over that snapshot plus a handful of commands.

## Data model

```ts
type AppState = "inactive" | "launching" | "running" | "stopping" | "crashed";

interface AppConfig {
  id: string;                  // 8 random base36 chars, stable for the app's lifetime
  name: string;
  cwd: string;                 // absolute path to the app folder
  command: string;             // one shell command, e.g. "npm start -- --quiet"
  autostart: boolean;          // start when daemonry starts
  env: Record<string, string>; // layered on top of the captured shell environment
  stopGraceMs: number | null;  // null = use the global default
}

interface DaemonryConfig {
  version: 1;
  launchAtLogin: boolean;
  defaultStopGraceMs: number;  // 10000
  apps: AppConfig[];
}

interface AppRuntime {
  id: string;
  state: AppState;
  pid: number | null;
  startedAt: number | null;
  exitCode: number | null;
  exitSignal: string | null;
  connected: boolean;          // the app's socket client is connected
  commands: { id: string; label?: string }[];  // declared by the app over the socket
  statusText: string | null;   // optional one-line status from the app
}
```

Config lives at `<userData>/config.json`, written atomically (temp file then rename).
On macOS that is `~/Library/Application Support/daemonry/config.json`.

## Process lifecycle

**Start.** Spawn `command` through the user's shell with `cwd` and the layered
environment, in its own process group (`detached: true` on POSIX, `windowsHide: true`
on Windows). State becomes `launching`.

**Launching to running.** The app becomes `running` when its client sends `hello`
over the socket, or after three seconds alive if it never connects. If it exits
during that window with a non-zero code it is `crashed`.

**Stop.** In order:

1. Send `{"type":"shutdown"}` over the socket if a client is connected.
2. POSIX: send SIGTERM to the process group.
3. Wait `stopGraceMs` (default ten seconds; reachy-idle needs time to settle the robot).
4. Kill the whole tree: SIGKILL to the process group on POSIX, `taskkill /T /F` on Windows.

State is `stopping` throughout, then `inactive`. A stop requested by the user is never
reported as a crash regardless of exit code.

**Unrequested exit.** Exit code 0 is `inactive`. Anything else, or death by signal, is
`crashed`, with the code and signal kept for display. Starting the app again clears it.

**Restart** is stop followed by start. **Start All** starts every app not already
running. **Stop All** stops every running or launching app. **Quit** runs Stop All
and waits for it before exiting.

## Launch environment

A GUI app launched at login does not inherit the shell's PATH, and this machine loads
nvm from `.zprofile`, so without this step `node` would not be found.

At startup daemonry runs `$SHELL -ilc` once, prints the environment between markers,
and parses it. That captured environment is cached for the session and shown in
Settings with a refresh button. If the shell fails or times out, `process.env` is used.
Windows uses `process.env` directly; the user PATH is already correct there.

Environment layering, lowest to highest:

1. Captured shell environment.
2. The app's configured `env`.
3. Reserved `DAEMONRY_*` variables set by daemonry (see protocol).

dotenv does not override existing variables, so values set here win over an app's `.env`.
That is deliberate: it is how you override PORT or BRIDGE_TOKEN per app.

## App protocol

Transport: newline-delimited JSON over a local socket. Daemonry listens, the app connects.

- macOS/Linux: Unix domain socket at `<tmpdir>/daemonry-<appId>.sock`. Kept in the
  temp dir because macOS caps socket paths at 104 bytes.
- Windows: named pipe `\\.\pipe\daemonry-<appId>`.

Environment variables given to the app:

| Variable | Meaning |
| --- | --- |
| `DAEMONRY_SOCKET` | Socket path or pipe name to connect to |
| `DAEMONRY_APP_ID` | The app's id |
| `DAEMONRY_APP_NAME` | The app's display name |

Messages, app to daemonry:

```jsonc
{ "type": "hello", "protocol": 1, "commands": [{ "id": "sleep", "label": "Sleep" }], "status": "Idle" }
{ "type": "commands", "commands": [ ... ] }   // replace the declared command list
{ "type": "status", "text": "Syncing 42%" }    // one line, shown in menu and GUI
```

Messages, daemonry to app:

```jsonc
{ "type": "welcome", "app": { "id": "k3j9x2ab", "name": "reachy-idle" } }
{ "type": "command", "id": "sleep" }
{ "type": "shutdown" }
```

The client reconnects with backoff whenever the connection drops, so apps run under
`tsx watch` or nodemon keep working across restarts of the inner process. When
`DAEMONRY_SOCKET` is absent the client is inert and every call is a no-op, so apps
still run normally from a terminal.

Client API, one file, zero dependencies, Node `net` only:

```ts
import { daemonry } from "./daemonry-client";

daemonry.active;                                   // true when launched by daemonry
daemonry.commands([{ id: "sleep", label: "Sleep" }, { id: "wake", label: "Wake" }]);
daemonry.onCommand((id) => { /* if (id === "sleep") ... */ });
daemonry.onShutdown(() => { /* optional graceful stop */ });
daemonry.status("Idle");
```

If no `onShutdown` handler is registered, a `shutdown` message invokes the process's
SIGTERM listeners, or exits with code 0 when there are none. This is what gives Windows
a graceful stop. The protocol is language-neutral; a Python client would be a one-file
port speaking the same messages.

## Tray menu

Icon: monochrome template image that follows the macOS menu bar appearance. Hollow
glyph when nothing is running, filled when anything is. A red non-template variant
replaces it while any app is `crashed`.

```
Open daemonry
Start All Apps
Stop All Apps
──────────────
● botchi-server          ▸   Running · pid 4821 · 2h 14m      (disabled status line)
                             Stop
                             Restart
                             ──────────
                             Command: Foo                      (disabled unless running)
                             Command: Bar
                             ──────────
                             View Logs
                             Open in Finder                    ("Show in Explorer" on Windows)
○ reachy-idle            ▸   Inactive
                             Start
                             ...
✕ agent-bridge           ▸   Crashed · exit 1
                             Start
                             ...
──────────────
Quit daemonry
```

Glyphs: `●` running, `◌` launching or stopping, `○` inactive, `✕` crashed. When an app
reports status text it is appended to the status line. The menu is rebuilt from the
snapshot on every state change.

## GUI

Dark, minimal, no explainer text. Tooltips via `title` are fine. Every Tailwind
size, spacing and radius is an explicit pixel value such as `text-[13px]` or `pl-[50px]`.
The Tailwind theme removes the default spacing, font size, radius, leading and tracking
scales so named utilities like `text-lg` do not compile. Colours come from a small
custom palette defined in the theme.

Layout: left sidebar, main panel. macOS uses a hidden inset title bar so the sidebar
runs to the top of the window.

Sidebar, top to bottom:

1. `daemonry` wordmark (window drag region).
2. Home.
3. Settings.
4. Apps header with an add button.
5. One row per app: name, with a status dot and the state word beneath.

Main panel pages:

- **Home.** Every app in a compact list: status, name, uptime, start/stop/restart.
- **Settings.** Launch daemonry at login. Default stop grace. Captured shell
  environment summary with refresh. Config file path.
- **App.** Header with name, state, actions and declared commands. Sections for
  status, live log tail, and the config form. Delete at the bottom.
- **New app.** The same form, empty, which creates the app on save.

## Logging

Each app's stdout and stderr are appended to `<logs>/<appId>.log`, rotated at 5 MB
keeping three files. The last 2000 lines are also kept in memory and streamed to the
renderer for the live tail. Daemonry's own log is `<logs>/daemonry.log`. On macOS
`<logs>` is `~/Library/Logs/daemonry`; on Windows `%APPDATA%\daemonry\logs`.
"View Logs" in the tray opens the GUI straight to that app's log section.

## Platform notes

**macOS.** Dock icon hidden (`LSUIElement`). Login item via
`app.setLoginItemSettings`, only when packaged; it does nothing from a dev build.
Unsigned builds show a one-time Gatekeeper warning. Process group kill via negative pid.

**Windows.** Named pipes, `taskkill /T /F`, `windowsHide`. No SIGTERM, so graceful
stop relies entirely on the socket `shutdown` message. Login item via the registry
through the same Electron API. Finder item reads "Show in Explorer". Written carefully
now, tested later; macOS first.

**Linux.** Not targeted. Nothing in the design precludes it except login items.

## Build and packaging

- `npm run dev` — electron-vite dev server with HMR for the renderer.
- `npm run build` — bundle main, preload and renderer into `out/`.
- `npm run typecheck` — both TypeScript projects.
- `npm run icons` — regenerate tray PNGs from `scripts/make-tray-icons.mjs`.
- `npm run dist:mac` / `npm run dist:win` — electron-builder packages into `release/`.

All packages are devDependencies: Vite bundles the renderer, and the main process has
no runtime dependencies beyond Electron and Node built-ins.

## Milestones

1. **Scaffold.** Tooling, shared types, config store, window, tray with full menu
   structure, renderer shell with all pages and the app form. No processes yet.
2. **Supervisor.** Shell env capture, spawn, state machine, stop sequence, tree kill,
   crash detection, autostart, Stop All on quit, tray icon states.
3. **Logs.** File capture with rotation, in-memory tail, live log view, View Logs.
4. **Protocol.** Socket server per app, `client/daemonry-client.ts`, declared
   commands in the tray and GUI, status text, shutdown message.
5. **Packaging.** Login item, electron-builder config, first `.app`, Gatekeeper notes.
6. **Windows.** Pipes, taskkill, Explorer label, NSIS installer. Test on a Windows machine.
