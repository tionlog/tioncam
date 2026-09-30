/** Returns false for empty/corrupt masks, even when pose landmarks were detected. */
export function writePersonMask(values: Float32Array, rgba: Uint8ClampedArray, dedicated = false) {
  if (!values.length || rgba.length !== values.length * 4) return false
  let foreground = 0
  let background = 0
  for (let i = 0; i < values.length; i++) {
    const confidence = values[i]
    if (!Number.isFinite(confidence)) return false
    if (confidence > .5) foreground++
    if (confidence < .1) background++
    // Keep the interior fully opaque; feather only the silhouette boundary.
    const alpha = dedicated
      ? Math.max(0, Math.min(1, (confidence - .12) / .56))
      : Math.max(0, Math.min(1, (confidence - .08) / .42))
    rgba[i * 4 + 3] = Math.round(alpha * alpha * (3 - 2 * alpha) * 255)
  }
  return foreground >= values.length * .005 && background >= values.length * .005
}
