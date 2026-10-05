// Copies the freshly packaged daemonry.app into /Applications, quitting a running
// copy first so the bundle can be replaced. Run via `npm run install:mac`.

import { execSync, spawnSync } from 'node:child_process'
import { existsSync, readdirSync, rmSync } from 'node:fs'
import { join } from 'node:path'

const releaseDir = new URL('../release/', import.meta.url).pathname
const built = readdirSync(releaseDir)
  .filter((d) => d.startsWith('mac'))
  .map((d) => join(releaseDir, d, 'daemonry.app'))
  .find((p) => existsSync(p))
if (!built) {
  console.error('no packaged daemonry.app found under release/; run `npm run package` first')
  process.exit(1)
}

const target = '/Applications/daemonry.app'
// Ask a running copy to quit (it stops its apps first), then wait for it.
spawnSync('osascript', ['-e', 'tell application id "app.daemonry" to quit'], { stdio: 'ignore' })
for (let i = 0; i < 30; i++) {
  const running = spawnSync('pgrep', ['-f', '/Applications/daemonry.app/Contents/MacOS/daemonry']).status === 0
  if (!running) break
  execSync('sleep 1')
}

if (existsSync(target)) rmSync(target, { recursive: true, force: true })
execSync(`ditto "${built}" "${target}"`)

// Finder and the Dock cache icons by bundle; nudge LaunchServices so a new icon shows.
execSync(`touch "${target}"`)
spawnSync(
  '/System/Library/Frameworks/CoreServices.framework/Frameworks/LaunchServices.framework/Support/lsregister',
  ['-f', target],
  { stdio: 'ignore' },
)

console.log(`installed ${target}`)
console.log('open it with:  open /Applications/daemonry.app')
console.log('if Finder still shows the old icon:  killall Dock')
