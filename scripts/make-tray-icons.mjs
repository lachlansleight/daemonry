// Generates the tray PNGs in resources/tray with no dependencies.
//   *Template.png   black on transparent, macOS template images (menu bar adapts them)
//   *-light.png     white on transparent, for dark Windows taskbars
//   alert.png       red, shown while any app is crashed (non-template)
// Each at 16x16 and 32x32 (@2x). Shapes are supersampled for smooth edges.

import { deflateSync } from 'node:zlib'
import { mkdirSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const outDir = join(dirname(fileURLToPath(import.meta.url)), '..', 'resources', 'tray')
mkdirSync(outDir, { recursive: true })

// --- PNG encoding -----------------------------------------------------------

const CRC_TABLE = new Uint32Array(256).map((_, n) => {
  let c = n
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
  return c >>> 0
})

function crc32(buf) {
  let c = 0xffffffff
  for (const byte of buf) c = CRC_TABLE[(c ^ byte) & 0xff] ^ (c >>> 8)
  return (c ^ 0xffffffff) >>> 0
}

function chunk(type, data) {
  const len = Buffer.alloc(4)
  len.writeUInt32BE(data.length)
  const typeAndData = Buffer.concat([Buffer.from(type, 'ascii'), data])
  const crc = Buffer.alloc(4)
  crc.writeUInt32BE(crc32(typeAndData))
  return Buffer.concat([len, typeAndData, crc])
}

function encodePng(width, height, rgba) {
  const ihdr = Buffer.alloc(13)
  ihdr.writeUInt32BE(width, 0)
  ihdr.writeUInt32BE(height, 4)
  ihdr[8] = 8 // bit depth
  ihdr[9] = 6 // RGBA
  ihdr[10] = 0
  ihdr[11] = 0
  ihdr[12] = 0
  const stride = width * 4
  const raw = Buffer.alloc((stride + 1) * height)
  for (let y = 0; y < height; y++) {
    raw[y * (stride + 1)] = 0 // filter: none
    rgba.copy(raw, y * (stride + 1) + 1, y * stride, (y + 1) * stride)
  }
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ])
}

// --- Shapes -----------------------------------------------------------------
// Each shape is a function (x, y) -> boolean in a 16-unit coordinate space.

const dist = (x, y, cx, cy) => Math.hypot(x - cx, y - cy)

// Radii are chosen so the 1x (16px) render lands on whole pixels: a 2px ring from
// r=5 to r=7 around the pixel corner at (8,8). Thin antialiased strokes look like a
// smudge on non-Retina menu bars, so nothing here is thinner than 2px.
const shapes = {
  // Hollow ring: nothing running.
  idle: (x, y) => {
    const d = dist(x, y, 8, 8)
    return d <= 7 && d >= 5
  },
  // Ring with a filled centre: something running.
  running: (x, y) => {
    const d = dist(x, y, 8, 8)
    return (d <= 7 && d >= 5) || d <= 2.5
  },
  // Filled disc with an exclamation mark cut out: a crash.
  alert: (x, y) => {
    const d = dist(x, y, 8, 8)
    if (d > 7) return false
    const bar = x >= 7 && x <= 9 && y >= 3.5 && y <= 9
    const dot = dist(x, y, 8, 11.5) <= 1.25
    return !(bar || dot)
  },
}

function render(shape, size, [r, g, b]) {
  const scale = size / 16
  const samples = 8
  const rgba = Buffer.alloc(size * size * 4)
  for (let py = 0; py < size; py++) {
    for (let px = 0; px < size; px++) {
      let hits = 0
      for (let sy = 0; sy < samples; sy++) {
        for (let sx = 0; sx < samples; sx++) {
          const x = (px + (sx + 0.5) / samples) / scale
          const y = (py + (sy + 0.5) / samples) / scale
          if (shape(x, y)) hits++
        }
      }
      const alpha = Math.round((hits / (samples * samples)) * 255)
      const i = (py * size + px) * 4
      rgba[i] = r
      rgba[i + 1] = g
      rgba[i + 2] = b
      rgba[i + 3] = alpha
    }
  }
  return encodePng(size, size, rgba)
}

const BLACK = [0, 0, 0]
const WHITE = [255, 255, 255]
const RED = [255, 90, 90]

const files = [
  ['idleTemplate', shapes.idle, BLACK],
  ['runningTemplate', shapes.running, BLACK],
  ['idle-light', shapes.idle, WHITE],
  ['running-light', shapes.running, WHITE],
  ['alert', shapes.alert, RED],
]

for (const [name, shape, colour] of files) {
  writeFileSync(join(outDir, `${name}.png`), render(shape, 16, colour))
  writeFileSync(join(outDir, `${name}@2x.png`), render(shape, 32, colour))
}
console.log(`wrote ${files.length * 2} icons to ${outDir}`)
