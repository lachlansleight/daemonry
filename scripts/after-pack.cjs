// electron-builder afterPack hook. Without a Developer ID the bundle keeps Electron's
// original ad-hoc signature, which no longer matches the modified bundle. Re-signing
// ad-hoc makes it internally consistent so codesign --verify passes, login items via
// SMAppService behave, and the app still runs locally without Gatekeeper involvement.
// A real signing identity, if ever configured, runs after this hook and replaces it.

const { execFileSync } = require('node:child_process')
const path = require('node:path')

exports.default = async (context) => {
  if (context.electronPlatformName !== 'darwin') return
  const appPath = path.join(context.appOutDir, `${context.packager.appInfo.productFilename}.app`)
  execFileSync('codesign', ['--force', '--deep', '--sign', '-', appPath], { stdio: 'inherit' })
  execFileSync('codesign', ['--verify', '--deep', '--strict', appPath], { stdio: 'inherit' })
  console.log(`  • ad-hoc signed ${appPath}`)
}
