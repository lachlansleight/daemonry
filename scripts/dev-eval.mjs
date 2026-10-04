// Evaluate an expression inside the running daemonry main process, via the Node
// inspector. Start daemonry with DAEMONRY_INSPECT_PORT set, then for example:
//
//   node scripts/dev-eval.mjs "__daemonry.store.snapshot().runtime"
//   node scripts/dev-eval.mjs "await __daemonry.supervisor.start('abc12345')"
//
// `__daemonry` holds { app, store, supervisor }. Top-level await is allowed.

const port = process.env.DAEMONRY_INSPECT_PORT ?? '9333'
const expression = process.argv.slice(2).join(' ')
if (!expression) {
  console.error('usage: node scripts/dev-eval.mjs "<expression>"')
  process.exit(2)
}

const targets = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json()
const target = targets.find((t) => t.webSocketDebuggerUrl)
if (!target) {
  console.error('no inspector target found')
  process.exit(1)
}

const ws = new WebSocket(target.webSocketDebuggerUrl)
await new Promise((resolve, reject) => {
  ws.onopen = resolve
  ws.onerror = reject
})
const reply = new Promise((resolve) => {
  ws.onmessage = (event) => {
    const msg = JSON.parse(String(event.data))
    if (msg.id === 1) resolve(msg)
  }
})
ws.send(
  JSON.stringify({
    id: 1,
    method: 'Runtime.evaluate',
    params: {
      expression: `(async () => (${expression}))()`,
      awaitPromise: true,
      returnByValue: true,
    },
  }),
)
const msg = await reply
ws.close()
if (msg.result?.exceptionDetails) {
  console.error(msg.result.exceptionDetails.exception?.description ?? msg.result.exceptionDetails.text)
  process.exit(1)
}
const value = msg.result?.result?.value
console.log(typeof value === 'string' ? value : JSON.stringify(value, null, 2))
