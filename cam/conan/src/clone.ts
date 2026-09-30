/** Pixel conversion also works on browsers without CanvasRenderingContext2D.filter. */
export function grayscalePixels(pixels: Uint8ClampedArray) {
  for (let i = 0; i < pixels.length; i += 4) {
    const luminance = Math.round(pixels[i] * .2126 + pixels[i + 1] * .7152 + pixels[i + 2] * .0722)
    pixels[i] = pixels[i + 1] = pixels[i + 2] = luminance
  }
}

export function updateCloneSource(context: CanvasRenderingContext2D, source: HTMLCanvasElement) {
  if (context.canvas.width !== source.width || context.canvas.height !== source.height) {
    context.canvas.width = source.width
    context.canvas.height = source.height
  }
  context.drawImage(source, 0, 0)
  const pixels = context.getImageData(0, 0, source.width, source.height)
  grayscalePixels(pixels.data)
  context.putImageData(pixels, 0, 0)
}
