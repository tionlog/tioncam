import { createFaceSampler } from './face-alignment'
import type { FacePoint } from './face-alignment'

const clamp = (n: number, low = 0, high = 1) => Math.max(low, Math.min(high, n))
const soft = (n: number) => { const t = clamp(n); return t * t * (3 - 2 * t) }
const oval = (u: number, v: number, x: number, y: number, rx: number, ry: number) => Math.exp(-2 * (((u - x) / rx) ** 2 + ((v - y) / ry) ** 2))

/** Derive an opaque, lighting-neutral albedo. The editable photo stays intact. */
export function renderSkinTexture(source: HTMLCanvasElement, alignment?: readonly FacePoint[], target = document.createElement('canvas')) {
  const size = 256
  const work = document.createElement('canvas')
  work.width = work.height = size
  const context = work.getContext('2d', { willReadFrequently: true })!
  context.drawImage(source, 0, 0, size, size)
  const input = context.getImageData(0, 0, size, size)
  const aligned = context.createImageData(size, size)
  const sample = createFaceSampler(alignment)
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    const [u, v] = sample(x / (size - 1), y / (size - 1))
    const sx = clamp(u) * (size - 1), sy = clamp(v) * (size - 1)
    const x0 = Math.floor(sx), y0 = Math.floor(sy)
    const x1 = Math.min(size - 1, x0 + 1), y1 = Math.min(size - 1, y0 + 1)
    for (let channel = 0; channel < 4; channel++) {
      const a = input.data[(y0 * size + x0) * 4 + channel] * (1 - sx + x0) + input.data[(y0 * size + x1) * 4 + channel] * (sx - x0)
      const b = input.data[(y1 * size + x0) * 4 + channel] * (1 - sx + x0) + input.data[(y1 * size + x1) * 4 + channel] * (sx - x0)
      aligned.data[(y * size + x) * 4 + channel] = a * (1 - sy + y0) + b * (sy - y0)
    }
  }

  // Sample cheeks/forehead, not eyes, lips or background; preserve skin tone.
  const channels: number[][] = [[], [], []]
  for (let y = 0; y < size; y += 2) for (let x = 0; x < size; x += 2) {
    const u = x / size, v = y / size, offset = (y * size + x) * 4
    if (aligned.data[offset + 3] < 230) continue
    if (Math.max(oval(u, v, .28, .57, .13, .095), oval(u, v, .72, .57, .13, .095), oval(u, v, .5, .20, .17, .085)) < .3) continue
    channels.forEach((values, c) => values.push(aligned.data[offset + c]))
  }
  const skin = channels.map((values, c) => {
    values.sort((a, b) => a - b)
    return values.length ? values[Math.floor(values.length * .5)] : [190, 137, 112][c]
  })

  // Bilateral smoothing removes pores/compression noise but preserves edges.
  const smooth = new Uint8ClampedArray(aligned.data.length)
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    const offset = (y * size + x) * 4
    const sums = [0, 0, 0]
    let total = 0
    for (let dy = -3; dy <= 3; dy++) for (let dx = -3; dx <= 3; dx++) {
      const neighbor = (clamp(y + dy, 0, size - 1) * size + clamp(x + dx, 0, size - 1)) * 4
      const difference = (aligned.data[neighbor] - aligned.data[offset]) ** 2
        + (aligned.data[neighbor + 1] - aligned.data[offset + 1]) ** 2
        + (aligned.data[neighbor + 2] - aligned.data[offset + 2]) ** 2
      const weight = Math.exp(-(dx * dx + dy * dy) / 10 - difference / 3200) * aligned.data[neighbor + 3] / 255
      for (let c = 0; c < 3; c++) sums[c] += aligned.data[neighbor + c] * weight
      total += weight
    }
    for (let c = 0; c < 3; c++) smooth[offset + c] = total > .001 ? sums[c] / total : skin[c]
    smooth[offset + 3] = aligned.data[offset + 3]
  }

  // Remove broad photographic shading so scene lights shade head and body.
  context.putImageData(new ImageData(smooth, size, size), 0, 0)
  const blurred = document.createElement('canvas')
  blurred.width = blurred.height = size
  const blurContext = blurred.getContext('2d')!
  blurContext.fillStyle = `rgb(${skin.join(',')})`
  blurContext.fillRect(0, 0, size, size)
  blurContext.filter = 'blur(13px)'
  blurContext.drawImage(work, 0, 0)
  const broad = blurContext.getImageData(0, 0, size, size).data
  const output = context.createImageData(size, size)
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    const u = x / (size - 1), v = y / (size - 1), offset = (y * size + x) * 4
    const features = Math.max(
      oval(u, v, .29, .4, .19, .09), oval(u, v, .71, .4, .19, .09),
      oval(u, v, .29, .295, .20, .065), oval(u, v, .71, .295, .20, .065),
      oval(u, v, .5, .59, .11, .055) * .42, oval(u, v, .5, .735, .23, .10),
    )
    const edge = 1 - soft((Math.hypot((u - .5) / .49, (v - .5) / .5) - .70) / .24)
    const coverage = soft((smooth[offset + 3] / 255 - .15) / .7) * edge
    const cheek = oval(u, v, .25, .61, .15, .13) + oval(u, v, .75, .61, .15, .13)
    for (let c = 0; c < 3; c++) {
      const flat = smooth[offset + c] - (broad[offset + c] - skin[c]) * .93
      const detail = (flat - skin[c]) * (.055 + .945 * features ** .7) * coverage
      output.data[offset + c] = skin[c] + detail + cheek * [8, -4, -3][c]
    }
    output.data[offset + 3] = 255
  }
  context.putImageData(output, 0, 0)
  target.width = target.height = 512
  const targetContext = target.getContext('2d')!
  targetContext.imageSmoothingEnabled = true
  targetContext.imageSmoothingQuality = 'high'
  targetContext.drawImage(work, 0, 0, 512, 512)
  return target
}
