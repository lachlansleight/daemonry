/// <reference types="vite/client" />

import type { DaemonryApi } from '@shared/ipc'

declare global {
  interface Window {
    daemonry?: DaemonryApi
  }
}

export {}
