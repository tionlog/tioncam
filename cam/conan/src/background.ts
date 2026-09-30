const smooth = (value: number) => value * value * (3 - 2 * value)

/** Paint in screen coordinates so the beam always rises from bottom-left to top-right. */
export function paintBackground(context: CanvasRenderingContext2D, width: number, height: number, beam: number) {
  const gradient = context.createLinearGradient(0, 0, width, height)
  gradient.addColorStop(0, '#010415')
  gradient.addColorStop(.32, '#031952')
  gradient.addColorStop(.56, '#064ed0')
  gradient.addColorStop(.76, '#051b67')
  gradient.addColorStop(1, '#01020b')
  context.fillStyle = gradient
  context.fillRect(0, 0, width, height)

  if (beam <= 0) return
  context.save()
  context.globalAlpha = smooth(beam)
  context.translate(width * .5, height * .53)
  // Match the reference image's diagonal on both portrait and landscape screens.
  context.rotate(-Math.atan2(height * .75, width))
  const length = Math.hypot(width, height) * 1.5
  const glowWidth = Math.max(28, Math.min(width, height) * .11)
  const glow = context.createLinearGradient(0, -glowWidth, 0, glowWidth)
  glow.addColorStop(0, 'rgba(60, 133, 255, 0)')
  glow.addColorStop(.3, 'rgba(68, 156, 255, .12)')
  glow.addColorStop(.44, 'rgba(124, 206, 255, .65)')
  glow.addColorStop(.485, '#e2faff')
  glow.addColorStop(.5, '#ffffff')
  glow.addColorStop(.515, '#e2faff')
  glow.addColorStop(.56, 'rgba(124, 206, 255, .65)')
  glow.addColorStop(.7, 'rgba(68, 156, 255, .12)')
  glow.addColorStop(1, 'rgba(60, 133, 255, 0)')
  context.fillStyle = glow
  context.fillRect(-length / 2, -glowWidth, length, glowWidth * 2)
  context.restore()
}

function drawCover(
  context: CanvasRenderingContext2D,
  source: HTMLCanvasElement,
  width: number,
  height: number,
  sourceWidth: number,
  sourceHeight: number,
  mirrored: boolean,
) {
  const scale = Math.max(width / sourceWidth, height / sourceHeight)
  const drawnWidth = sourceWidth * scale
  const drawnHeight = sourceHeight * scale
  context.save()
  if (mirrored) {
    context.translate(width, 0)
    context.scale(-1, 1)
  }
  context.drawImage(source, (width - drawnWidth) / 2, (height - drawnHeight) / 2, drawnWidth, drawnHeight)
  context.restore()
}

type CloneLayer = {
  source: HTMLCanvasElement
  context: CanvasRenderingContext2D
  amount: number
}

function cutOutPerson(context: CanvasRenderingContext2D, source: HTMLCanvasElement,
  mask: HTMLCanvasElement, width: number, height: number, mirrored: boolean) {
  context.clearRect(0, 0, width, height)
  drawCover(context, source, width, height, source.width, source.height, mirrored)
  context.save()
  context.globalCompositeOperation = 'destination-in'
  context.imageSmoothingEnabled = true
  context.imageSmoothingQuality = 'high'
  drawCover(context, mask, width, height, source.width, source.height, mirrored)
  context.restore()
}

/** Original camera -> background effect -> monochrome clone -> original color person. */
export function composeCameraScene(
  context: CanvasRenderingContext2D,
  foreground: CanvasRenderingContext2D,
  source: HTMLCanvasElement,
  mask: HTMLCanvasElement,
  width: number,
  height: number,
  beam: number,
  amount: number,
  mirrored: boolean,
  clone?: CloneLayer,
) {
  context.clearRect(0, 0, width, height)
  drawCover(context, source, width, height, source.width, source.height, mirrored)
  context.save()
  context.globalAlpha = smooth(amount)
  // An isolated layer keeps beam opacity relative to the background fade.
  foreground.clearRect(0, 0, width, height)
  paintBackground(foreground, width, height, beam)
  context.drawImage(foreground.canvas, 0, 0)
  context.restore()

  if (clone && clone.amount > 0) {
    const progress = smooth(clone.amount)
    cutOutPerson(clone.context, clone.source, mask, width, height, mirrored)
    context.save()
    context.globalAlpha = progress
    context.drawImage(clone.context.canvas,
      -Math.min(width * .22, height * .25) * progress, -height * .035 * progress)
    context.restore()
  }
  cutOutPerson(foreground, source, mask, width, height, mirrored)
  // Full opacity: the face, clothes and body never participate in the fade.
  context.drawImage(foreground.canvas, 0, 0)
}
