// window.daemonry comes from the preload. When the renderer is opened in a plain browser
// (vite dev server without Electron) a mock stands in so the UI can be previewed.

import type { DaemonryApi } from '@shared/ipc'
import { createMockApi } from './mock'

export const isMock = typeof window.daemonry === 'undefined'
export const api: DaemonryApi = window.daemonry ?? createMockApi()
