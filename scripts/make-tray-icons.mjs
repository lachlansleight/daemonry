// Generates the tray PNGs in resources/tray with no dependencies.
//   *Template.png   black on transparent, macOS template images (menu bar adapts them)
//   *-light.png     white on transparent, for dark Windows taskbars
//   alert.png       red, shown while any app is crashed (non-template)
// Each at 16x16 and 32x32 (@2x). Shapes are supersampled for smooth edges.
//
// The glyph is a stylised demon head: round face, two horns, slanted eyes and a wide
// grin cut out of the silhouette. Idle is the same glyph at half alpha.
//
//   node scripts/make-tray-icons.mjs                 write the tray icons
//   node scripts/make-tray-icons.mjs --preview DIR   also write 128px previews to DIR
//   node scripts/make-tray-icons.mjs --app-icon      also write a placeholder build/icon.png
//                                                    (1024px, macOS rounded square); replace
//                                                    it with the real app icon from Figma

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
// Each shape is a function (x, y) -> boolean in a 16-unit coordinate space, y down.

const dist = (x, y, cx, cy) => Math.hypot(x - cx, y - cy)

function inTriangle(px, py, [ax, ay], [bx, by], [cx, cy]) {
  const d1 = (px - bx) * (ay - by) - (ax - bx) * (py - by)
  const d2 = (px - cx) * (by - cy) - (bx - cx) * (py - cy)
  const d3 = (px - ax) * (cy - ay) - (cx - ax) * (py - ay)
  const neg = d1 < 0 || d2 < 0 || d3 < 0
  const pos = d1 > 0 || d2 > 0 || d3 > 0
  return !(neg && pos)
}

function inEllipse(px, py, cx, cy, a, b, angleDeg) {
  const t = (angleDeg * Math.PI) / 180
  const dx = px - cx
  const dy = py - cy
  const u = dx * Math.cos(t) + dy * Math.sin(t)
  const v = -dx * Math.sin(t) + dy * Math.cos(t)
  return (u * u) / (a * a) + (v * v) / (b * b) <= 1
}

// Head circle with two curved, tapered horns growing from its upper sides, then
// slanted eyes and a wide grin cut out. Each horn is a quadratic Bezier spine
// (base, control, tip) swept with a width that tapers to the tip.
const HEAD = { cx: 8, cy: 9.6, r: 5.5 }

const LEFT_HORN = { p0: [4.3, 6.4], pc: [1.6, 4.6], p1: [2.4, 0.9], width: 1.7 }
const RIGHT_HORN = {
  p0: [16 - 4.3, 6.4],
  pc: [16 - 1.6, 4.6],
  p1: [16 - 2.4, 0.9],
  width: 1.7,
}

const SPINE_SAMPLES = 48
function hornSpine({ p0, pc, p1 }) {
  const pts = []
  for (let i = 0; i <= SPINE_SAMPLES; i++) {
    const t = i / SPINE_SAMPLES
    const a = (1 - t) * (1 - t)
    const b = 2 * (1 - t) * t
    const c = t * t
    pts.push([a * p0[0] + b * pc[0] + c * p1[0], a * p0[1] + b * pc[1] + c * p1[1], t])
  }
  return pts
}
const LEFT_SPINE = hornSpine(LEFT_HORN)
const RIGHT_SPINE = hornSpine(RIGHT_HORN)

function inHorn(x, y, spine, width) {
  for (const [sx, sy, t] of spine) {
    const w = width * Math.pow(1 - t, 0.75) + 0.12
    if (dist(x, y, sx, sy) <= w) return true
  }
  return false
}

function demon(x, y) {
  const head = dist(x, y, HEAD.cx, HEAD.cy) <= HEAD.r
  const horns = inHorn(x, y, LEFT_SPINE, LEFT_HORN.width) || inHorn(x, y, RIGHT_SPINE, RIGHT_HORN.width)
  if (!(head || horns)) return false
  const leftEye = inEllipse(x, y, 5.9, 8.6, 1.5, 0.8, 28)
  const rightEye = inEllipse(x, y, 10.1, 8.6, 1.5, 0.8, -28)
  const grin = dist(x, y, 8, 8.9) <= 4.3 && y >= 11.2
  return !(leftEye || rightEye || grin)
}

const shapes = { demon }

function render(shape, size, [r, g, b], alphaScale = 1) {
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
      const alpha = Math.round((hits / (samples * samples)) * 255 * alphaScale)
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
const DIM = 0.5

const files = [
  ['idleTemplate', shapes.demon, BLACK, DIM],
  ['runningTemplate', shapes.demon, BLACK, 1],
  ['idle-light', shapes.demon, WHITE, DIM],
  ['running-light', shapes.demon, WHITE, 1],
  ['alert', shapes.demon, RED, 1],
]

for (const [name, shape, colour, alpha] of files) {
  writeFileSync(join(outDir, `${name}.png`), render(shape, 16, colour, alpha))
  writeFileSync(join(outDir, `${name}@2x.png`), render(shape, 32, colour, alpha))
}
console.log(`wrote ${files.length * 2} icons to ${outDir}`)

const previewFlag = process.argv.indexOf('--preview')
if (previewFlag !== -1 && process.argv[previewFlag + 1]) {
  const previewDir = process.argv[previewFlag + 1]
  mkdirSync(previewDir, { recursive: true })
  for (const [name, shape, colour, alpha] of files) {
    writeFileSync(join(previewDir, `${name}-128.png`), render(shape, 128, colour, alpha))
  }
  console.log(`wrote previews to ${previewDir}`)
}

// --- Placeholder app icon ----------------------------------------------------
// macOS Big Sur grid: 1024 canvas, rounded square of 824 centred, corner radius ~185.
// Dark square with the demon glyph, so the first build has something recognisable.

function renderAppIcon(size) {
  const samples = 3
  const square = size * (824 / 1024)
  const radius = square * 0.2248
  const inset = (size - square) / 2
  const glyphBox = square * 0.62
  const glyphOrigin = (size - glyphBox) / 2
  const bg = [27, 27, 30]
  const fg = [244, 244, 245]

  const inRoundedSquare = (x, y) => {
    const lx = x - inset
    const ly = y - inset
    if (lx < 0 || ly < 0 || lx > square || ly > square) return false
    const cx = Math.min(Math.max(lx, radius), square - radius)
    const cy = Math.min(Math.max(ly, radius), square - radius)
    return Math.hypot(lx - cx, ly - cy) <= radius
  }
  const inGlyph = (x, y) => {
    const gx = ((x - glyphOrigin) / glyphBox) * 16
    const gy = ((y - glyphOrigin) / glyphBox) * 16
    return gx >= 0 && gy >= 0 && gx < 16 && gy < 16 && shapes.demon(gx, gy)
  }

  const rgba = Buffer.alloc(size * size * 4)
  for (let py = 0; py < size; py++) {
    for (let px = 0; px < size; px++) {
      let bgHits = 0
      let fgHits = 0
      for (let sy = 0; sy < samples; sy++) {
        for (let sx = 0; sx < samples; sx++) {
          const x = px + (sx + 0.5) / samples
          const y = py + (sy + 0.5) / samples
          if (inRoundedSquare(x, y)) {
            bgHits++
            if (inGlyph(x, y)) fgHits++
          }
        }
      }
      const total = samples * samples
      const alpha = bgHits / total
      const mix = bgHits === 0 ? 0 : fgHits / bgHits
      const i = (py * size + px) * 4
      rgba[i] = Math.round(bg[0] + (fg[0] - bg[0]) * mix)
      rgba[i + 1] = Math.round(bg[1] + (fg[1] - bg[1]) * mix)
      rgba[i + 2] = Math.round(bg[2] + (fg[2] - bg[2]) * mix)
      rgba[i + 3] = Math.round(alpha * 255)
    }
  }
  return encodePng(size, size, rgba)
}

if (process.argv.includes('--app-icon')) {
  const buildDir = join(dirname(fileURLToPath(import.meta.url)), '..', 'build')
  mkdirSync(buildDir, { recursive: true })
  const target = join(buildDir, 'icon.png')
  writeFileSync(target, renderAppIcon(1024))
  console.log(`wrote placeholder app icon to ${target}`)
}
