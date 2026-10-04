// Tiny example of a daemonry-managed app. Add this folder in daemonry with the command
// `npm start`, or run `npm start` here directly to see it behave as a plain script.
//
// A real app would copy client/daemonry-client.ts next to its own code; this example
// imports it from the repo instead.

import { daemonry } from '../../client/daemonry-client.ts'

console.log(`hello-app starting (pid ${process.pid}), managed by daemonry: ${daemonry.active}`)

daemonry
  .commands([
    { id: 'greet', label: 'Say hello' },
    { id: 'work', label: 'Work for five seconds' },
    { id: 'crash', label: 'Crash on purpose' },
  ])
  .status('Idle')
  .onCommand((id) => {
    console.log(`command received: ${id}`)
    if (id === 'greet') console.log('👋 hello from hello-app')
    else if (id === 'work') work()
    else if (id === 'crash') {
      console.error('crashing on purpose')
      process.exit(1)
    }
  })
  .onShutdown(() => {
    console.log('shutdown requested, tidying up for a second')
    daemonry.status('Shutting down')
    setTimeout(() => {
      console.log('bye')
      process.exit(0)
    }, 1000)
  })

let working = false
function work(): void {
  if (working) return
  working = true
  let left = 5
  const tick = (): void => {
    if (left === 0) {
      working = false
      daemonry.status('Idle')
      console.log('work done')
      return
    }
    daemonry.status(`Working, ${left}s left`)
    left -= 1
    setTimeout(tick, 1000)
  }
  tick()
}

let beats = 0
setInterval(() => {
  beats += 1
  console.log(`heartbeat ${beats}`)
}, 5000)
