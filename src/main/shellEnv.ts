// Captures the user's login shell environment once, so apps launched from a
// login-started GUI process still find nvm, Homebrew, conda and friends.

import { execFile } from 'node:child_process'
import { existsSync } from 'node:fs'
import { delimiter, join } from 'node:path'
import { EMPTY_SHELL_ENV, type ShellEnvSummary } from '@shared/types'
import { log } from './log'

const MARKER = '__DAEMONRY_ENV__'
const TIMEOUT_MS = 20_000
/** Set while capturing so slow rc files can skip work: `[ -n "$DAEMONRY_ENV_CAPTURE" ] && return`. */
const CAPTURE_FLAG = 'DAEMONRY_ENV_CAPTURE'
/** Per-process noise from the capture shell that must not leak into apps. */
const DROP = new Set([CAPTURE_FLAG, 'PWD', 'OLDPWD', 'SHLVL', '_'])

export class ShellEnv {
  private env: Record<string, string> = cleanEnv(process.env)
  private summaryValue: ShellEnvSummary = {
    ...EMPTY_SHELL_ENV,
    shell: defaultShell(),
    varCount: Object.keys(this.env).length,
  }

  /** The shell apps are launched through on POSIX. */
  shellPath(): string {
    return this.summaryValue.shell
  }

  get(): Record<string, string> {
    return { ...this.env }
  }

  summary(): ShellEnvSummary {
    return this.summaryValue
  }

  async capture(): Promise<ShellEnvSummary> {
    const shell = defaultShell()
    if (process.platform === 'win32') {
      // GUI processes on Windows already get the user's PATH.
      this.env = cleanEnv(process.env)
      this.summaryValue = summarise(shell, this.env, null)
      return this.summaryValue
    }
    try {
      this.env = await captureFromShell(shell)
      this.summaryValue = summarise(shell, this.env, null)
      log.info('shell environment captured', {
        shell,
        vars: this.summaryValue.varCount,
        node: this.summaryValue.nodePath,
      })
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      log.error('shell environment capture failed; using the process environment', message)
      this.env = cleanEnv(process.env)
      this.summaryValue = summarise(shell, this.env, message)
    }
    return this.summaryValue
  }
}

function defaultShell(): string {
  if (process.platform === 'win32') return process.env['ComSpec'] ?? 'cmd.exe'
  return process.env['SHELL'] || '/bin/zsh'
}

function cleanEnv(source: NodeJS.ProcessEnv): Record<string, string> {
  const out: Record<string, string> = {}
  for (const [key, value] of Object.entries(source)) {
    if (typeof value === 'string' && !DROP.has(key)) out[key] = value
  }
  return out
}

function captureFromShell(shell: string): Promise<Record<string, string>> {
  // Interactive + login so both .zprofile (nvm here) and .zshrc (conda, pyenv) run.
  // Markers isolate the dump from anything the rc files print.
  const script = `printf '${MARKER}'; env -0; printf '${MARKER}'`
  return new Promise((resolve, reject) => {
    execFile(
      shell,
      ['-ilc', script],
      {
        timeout: TIMEOUT_MS,
        maxBuffer: 16 * 1024 * 1024,
        encoding: 'utf8',
        env: { ...process.env, [CAPTURE_FLAG]: '1', TERM: process.env['TERM'] ?? 'xterm-256color' },
      },
      (error, stdout) => {
        const out = String(stdout)
        const first = out.indexOf(MARKER)
        const last = out.lastIndexOf(MARKER)
        if (first === -1 || last === first) {
          reject(error ?? new Error('no environment dump in shell output'))
          return
        }
        const env: Record<string, string> = {}
        for (const entry of out.slice(first + MARKER.length, last).split('\0')) {
          const eq = entry.indexOf('=')
          if (eq <= 0) continue
          const key = entry.slice(0, eq)
          if (!DROP.has(key)) env[key] = entry.slice(eq + 1)
        }
        if (!env['PATH']) {
          reject(new Error('shell environment had no PATH'))
          return
        }
        resolve(env)
      },
    )
  })
}

function summarise(shell: string, env: Record<string, string>, error: string | null): ShellEnvSummary {
  const pathEntries = (env['PATH'] ?? '').split(delimiter).filter(Boolean)
  const binary = process.platform === 'win32' ? 'node.exe' : 'node'
  const nodeDir = pathEntries.find((dir) => existsSync(join(dir, binary)))
  return {
    shell,
    ok: error === null,
    error,
    capturedAt: Date.now(),
    nodePath: nodeDir ? join(nodeDir, binary) : null,
    pathEntries,
    varCount: Object.keys(env).length,
  }
}
