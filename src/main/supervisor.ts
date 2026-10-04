// Process supervisor. The interface is final; milestone 2 implements the bodies
// (shell env capture, spawn, state machine, stop sequence, tree kill, crash detection).

import type { ActionResult } from '@shared/ipc'
import type { AppId } from '@shared/types'
import { log } from './log'
import type { Store } from './store'

export class Supervisor {
  constructor(private readonly store: Store) {}

  start(id: AppId): Promise<ActionResult> {
    return this.notYet('start', id)
  }

  stop(id: AppId): Promise<ActionResult> {
    return this.notYet('stop', id)
  }

  restart(id: AppId): Promise<ActionResult> {
    return this.notYet('restart', id)
  }

  sendCommand(id: AppId, commandId: string): Promise<ActionResult> {
    return this.notYet(`command ${commandId}`, id)
  }

  startAll(): Promise<ActionResult> {
    return this.notYet('startAll')
  }

  stopAll(): Promise<ActionResult> {
    return this.notYet('stopAll')
  }

  private async notYet(action: string, id?: AppId): Promise<ActionResult> {
    const name = id ? this.store.getApp(id)?.name ?? id : 'all apps'
    log.warn(`supervisor: ${action} requested for ${name}, but the supervisor is not implemented yet`)
    return { ok: false, error: 'Supervisor not implemented yet' }
  }
}
