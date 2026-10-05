// electron-builder configuration. JavaScript rather than YAML so that mac.icon is only
// set when the Icon Composer document exists: electron-builder refuses a missing path.
//
// Icons: build/daemonry.icon (Icon Composer) gives macOS 26+ its layered glass icon and
// a legacy .icns derived from it. Without it, build/icon.png (1024x1024) is converted to
// .icns and .ico automatically. Windows always uses the PNG.

const { existsSync } = require('node:fs')
const { join } = require('node:path')

const iconComposerDocument = join(__dirname, 'build', 'daemonry.icon')

/** @type {import('electron-builder').Configuration} */
module.exports = {
  appId: 'app.daemonry',
  productName: 'daemonry',
  artifactName: '${productName}-${version}-${os}-${arch}.${ext}',
  directories: { buildResources: 'build', output: 'release' },
  files: ['out/**', 'resources/**', '!**/.DS_Store'],
  asarUnpack: ['resources/**'],
  mac: {
    ...(existsSync(iconComposerDocument) ? { icon: 'build/daemonry.icon' } : {}),
    category: 'public.app-category.developer-tools',
    target: [
      { target: 'dmg', arch: ['arm64'] },
      { target: 'zip', arch: ['arm64'] },
    ],
    extendInfo: { LSUIElement: true },
    // Local build: no Developer ID, no notarization. scripts/after-pack.cjs ad-hoc signs.
    identity: null,
    hardenedRuntime: false,
    gatekeeperAssess: false,
  },
  dmg: { sign: false },
  afterPack: 'scripts/after-pack.cjs',
  win: { target: ['nsis'] },
  nsis: { oneClick: false, perMachine: false, allowToChangeInstallationDirectory: true },
  npmRebuild: false,
}
