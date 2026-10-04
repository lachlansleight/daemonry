// Per-app log file. Milestone 3 adds rotation and the in-memory tail for the GUI;
// for now the job is to drain the child's pipes somewhere useful so it never blocks.

import { createWriteStream, mkdirSync, type WriteStream } from 'node:fs'
import { dirname } from 'node:path'
import { log } from './log'

export class AppLogWriter {
  private stream: WriteStream | null = null

  constructor(readonly file: string) {
    try {
      mkdirSync(dirname(file), { recursive: true })
      this.stream = createWriteStream(file, { flags: 'a' })
      this.stream.on('error', (err) => {
        log.error(`app log unwritable: ${file}`, err.message)
        this.stream = null
      })
    } catch (err) {
      log.error(`app log unopenable: ${file}`, err)
    }
  }

  write(chunk: Buffer | string): void {
    this.stream?.write(chunk)
  }

  marker(text: string): void {
    this.write(`\n[daemonry ${new Date().toISOString()}] ${text}\n`)
  }

  close(): void {
    this.stream?.end()
    this.stream = null
  }
}
