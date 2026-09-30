import type { Point3 } from './gesture'

type Point2 = { x: number; y: number }

export type CostumeFrame = {
  eyeA: Point2
  eyeB: Point2
  eyeAOuter: Point2
  eyeAInner: Point2
  eyeBInner: Point2
  eyeBOuter: Point2
  mouthA: Point2
  mouthB: Point2
  upperLip: Point2
  lowerLip: Point2
  nose: Point2
  chin: Point2
  forehead: Point2
  cheekA: Point2
  cheekB: Point2
  shoulderA: Point2
  shoulderB: Point2
  hipA: Point2
  hipB: Point2
}

const center = (a: Point2, b: Point2): Point2 => ({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 })
const dist = (a: Point2, b: Point2) => Math.hypot(a.x - b.x, a.y - b.y)
const visible = (point: (Point3 & { visibility?: number }) | undefined) =>
  !!point && Number.isFinite(point.x) && Number.isFinite(point.y) && (point.visibility ?? 1) >= .45
const poseVisible = (point: (Point3 & { visibility?: number }) | undefined) =>
  !!point && Number.isFinite(point.x) && Number.isFinite(point.y) && (point.visibility ?? 1) >= .25

export function getCostumeFrame(face: Point3[], pose: (Point3 & { visibility?: number })[]): CostumeFrame | null {
  if (face.length < 468) return null
  const needed = [1, 10, 152, 234, 454, 33, 133, 362, 263, 61, 291, 13, 14]
  if (needed.some(index => !visible(face[index]))) return null
  const f = (index: number): Point2 => ({ x: face[index].x, y: face[index].y })
  const eyeA = center(f(33), f(133))
  const eyeB = center(f(362), f(263))
  const faceWidth = dist(f(234), f(454))
  const faceHeight = dist(f(10), f(152))
  if (faceWidth < .055 || faceHeight < .075 || dist(eyeA, eyeB) < faceWidth * .24) return null
  const shoulderA = visible(pose[11]) ? pose[11] : { x: f(234).x - faceWidth * .27, y: f(152).y + faceHeight * .24 }
  const shoulderB = visible(pose[12]) ? pose[12] : { x: f(454).x + faceWidth * .27, y: f(152).y + faceHeight * .24 }
  if (dist(shoulderA, shoulderB) < faceWidth * .8) return null
  const torsoHeight = faceHeight * 1.5
  const hipA = visible(pose[23]) && pose[23].y > shoulderA.y + faceHeight * .35
    ? pose[23] : { x: shoulderA.x, y: shoulderA.y + torsoHeight }
  const hipB = visible(pose[24]) && pose[24].y > shoulderB.y + faceHeight * .35
    ? pose[24] : { x: shoulderB.x, y: shoulderB.y + torsoHeight }
  return {
    eyeA, eyeB, eyeAOuter: f(33), eyeAInner: f(133), eyeBInner: f(362), eyeBOuter: f(263),
    mouthA: f(61), mouthB: f(291), upperLip: f(13), lowerLip: f(14), nose: f(1),
    chin: f(152), forehead: f(10), cheekA: f(234), cheekB: f(454),
    shoulderA, shoulderB, hipA, hipB,
  }
}

/** Approximate a wearable frame from the body tracker when a hand hides the face mesh. */
export function getPoseCostumeFrame(pose: (Point3 & { visibility?: number })[]): CostumeFrame | null {
  const [nose, earA, earB, shoulderA, shoulderB] = [pose[0], pose[7], pose[8], pose[11], pose[12]]
  if (![nose, shoulderA, shoulderB].every(poseVisible)) return null
  const shoulderWidth = dist(shoulderA, shoulderB)
  const earsVisible = poseVisible(earA) && poseVisible(earB) && Math.abs(earA.x - earB.x) >= .055
  const faceWidth = earsVisible ? Math.abs(earA.x - earB.x) : shoulderWidth * .55
  const faceHeight = faceWidth * 1.5
  if (faceWidth < .055 || shoulderWidth < faceWidth * .8) return null
  const midX = earsVisible ? (earA.x + earB.x) / 2 : nose.x
  const left = midX - faceWidth / 2
  const right = midX + faceWidth / 2
  const eyeY = nose.y - faceHeight * .21
  const eyeA = poseVisible(pose[2]) ? pose[2] : { x: left + faceWidth * .3, y: eyeY }
  const eyeB = poseVisible(pose[5]) ? pose[5] : { x: right - faceWidth * .3, y: eyeY }
  const halfEye = faceWidth * .08
  const mouthY = nose.y + faceHeight * .27
  const chinY = nose.y + faceHeight * .55
  const hipA = poseVisible(pose[23]) && pose[23].y > shoulderA.y + faceHeight * .35
    ? pose[23] : { x: shoulderA.x, y: shoulderA.y + faceHeight * 1.5 }
  const hipB = poseVisible(pose[24]) && pose[24].y > shoulderB.y + faceHeight * .35
    ? pose[24] : { x: shoulderB.x, y: shoulderB.y + faceHeight * 1.5 }
  return {
    eyeA, eyeB,
    eyeAOuter: { x: eyeA.x - halfEye, y: eyeA.y },
    eyeAInner: { x: eyeA.x + halfEye, y: eyeA.y },
    eyeBInner: { x: eyeB.x - halfEye, y: eyeB.y },
    eyeBOuter: { x: eyeB.x + halfEye, y: eyeB.y },
    mouthA: { x: midX - faceWidth * .17, y: mouthY },
    mouthB: { x: midX + faceWidth * .17, y: mouthY },
    upperLip: { x: midX, y: mouthY - faceHeight * .025 },
    lowerLip: { x: midX, y: mouthY + faceHeight * .025 },
    nose: { x: nose.x, y: nose.y },
    chin: { x: midX, y: chinY },
    forehead: { x: midX, y: nose.y - faceHeight * .45 },
    cheekA: { x: left, y: nose.y + faceHeight * .1 },
    cheekB: { x: right, y: nose.y + faceHeight * .1 },
    shoulderA, shoulderB, hipA, hipB,
  }
}

export function isHandBelowLips(frame: CostumeFrame, hands: Point3[][],
  pose: (Point3 & { visibility?: number })[] = []) {
  const faceWidth = dist(frame.cheekA, frame.cheekB)
  const faceHeight = dist(frame.forehead, frame.chin)
  const inChinArea = (p: Point3 | undefined) => !!p && Number.isFinite(p.x) && Number.isFinite(p.y)
    && Math.abs(p.x - frame.chin.x) < faceWidth * .82
    && p.y >= frame.lowerLip.y - faceHeight * .08
    && p.y <= frame.chin.y + faceHeight * .38

  // Any part of a tracked hand below the lips is enough. Requiring a specific
  // finger or wrist angle loses the gesture when the face hides those points.
  if (hands.some(hand => hand.some(inChinArea))) return true

  // Fall back to the body model's hand and wrist points when the detailed hand
  // mesh disappears against the face. These indices belong to the two hands.
  return [15, 16, 17, 18, 19, 20, 21, 22].some(index =>
    (pose[index]?.visibility ?? 1) >= .2 && inChinArea(pose[index]))
}

type ScreenFrame = { [K in keyof CostumeFrame]: Point2 }

function projectFrame(frame: CostumeFrame, width: number, height: number,
  sourceWidth: number, sourceHeight: number, mirrored: boolean): ScreenFrame {
  const scale = Math.max(width / sourceWidth, height / sourceHeight)
  const offsetX = (width - sourceWidth * scale) / 2
  const offsetY = (height - sourceHeight * scale) / 2
  return Object.fromEntries(Object.entries(frame).map(([key, p]) => {
    const x = offsetX + p.x * sourceWidth * scale
    return [key, { x: mirrored ? width - x : x, y: offsetY + p.y * sourceHeight * scale }]
  })) as ScreenFrame
}

function polygon(context: CanvasRenderingContext2D, points: Point2[],
  fill: string | CanvasGradient, stroke = '', lineWidth = 1) {
  context.beginPath()
  points.forEach((p, i) => i ? context.lineTo(p.x, p.y) : context.moveTo(p.x, p.y))
  context.closePath()
  context.fillStyle = fill
  context.fill()
  if (stroke) {
    context.strokeStyle = stroke
    context.lineWidth = lineWidth
    context.stroke()
  }
}

/** Draw tracked accessories directly in screen space; no bitmap asset is needed. */
export function drawCostume(context: CanvasRenderingContext2D, frame: CostumeFrame,
  width: number, height: number, sourceWidth: number, sourceHeight: number, mirrored: boolean) {
  const p = projectFrame(frame, width, height, sourceWidth, sourceHeight, mirrored)
  const faceWidth = dist(p.cheekA, p.cheekB)
  const faceHeight = dist(p.forehead, p.chin)
  const shoulderMid = center(p.shoulderA, p.shoulderB)
  const hipMid = center(p.hipA, p.hipB)
  const shoulderWidth = dist(p.shoulderA, p.shoulderB)
  const torsoHeight = Math.max(faceHeight * 1.05, dist(shoulderMid, hipMid))
  const shoulderLeft = p.shoulderA.x < p.shoulderB.x ? p.shoulderA : p.shoulderB
  const shoulderRight = p.shoulderA.x < p.shoulderB.x ? p.shoulderB : p.shoulderA
  const shoulderSlant = shoulderRight.y - shoulderLeft.y
  const body = (x: number, y: number): Point2 => ({
    x: shoulderMid.x + x * shoulderWidth + y * (hipMid.x - shoulderMid.x),
    y: shoulderMid.y + x * shoulderSlant + y * torsoHeight,
  })
  const move = (path: Path2D, x: number, y: number) => { const q = body(x, y); path.moveTo(q.x, q.y) }
  const line = (path: Path2D, x: number, y: number) => { const q = body(x, y); path.lineTo(q.x, q.y) }
  const curve = (path: Path2D, a: number, b: number, c: number, d: number, e: number, f: number) => {
    const p1 = body(a, b), p2 = body(c, d), p3 = body(e, f)
    path.bezierCurveTo(p1.x, p1.y, p2.x, p2.y, p3.x, p3.y)
  }
  const ink = Math.max(1.5, faceWidth * .008)

  context.save()
  context.lineJoin = 'round'
  context.lineCap = 'round'

  // Tailored jacket silhouette, following the detected shoulders and torso.
  const jacket = new Path2D()
  move(jacket, -.18, -.06)
  curve(jacket, -.34, -.09, -.52, -.01, -.58, .07)
  curve(jacket, -.67, .18, -.66, .34, -.67, .44)
  line(jacket, -.71, 1.08)
  line(jacket, .71, 1.08)
  line(jacket, .67, .44)
  curve(jacket, .66, .34, .67, .18, .58, .07)
  curve(jacket, .52, -.01, .34, -.09, .18, -.06)
  jacket.closePath()
  const jacketColor = context.createLinearGradient(0, shoulderMid.y, 0, shoulderMid.y + torsoHeight)
  jacketColor.addColorStop(0, '#294970')
  jacketColor.addColorStop(.45, '#152e52')
  jacketColor.addColorStop(1, '#091b35')
  context.fillStyle = jacketColor
  context.fill(jacket)
  context.strokeStyle = '#081322'
  context.lineWidth = ink * 2
  context.stroke(jacket)

  polygon(context, [body(-.58, .07), body(-.42, .16), body(-.47, .71), body(-.71, 1.08)],
    'rgba(3,13,29,.22)')
  polygon(context, [body(.58, .07), body(.42, .16), body(.47, .71), body(.71, 1.08)],
    'rgba(3,13,29,.19)')

  const shirtColor = context.createLinearGradient(0, shoulderMid.y, 0, shoulderMid.y + torsoHeight)
  shirtColor.addColorStop(0, '#f9faf7')
  shirtColor.addColorStop(.55, '#e4e8ed')
  shirtColor.addColorStop(1, '#c1cad6')
  polygon(context, [body(-.18, -.07), body(.18, -.07), body(.21, 1.08), body(-.21, 1.08)],
    shirtColor, '#233348', ink)
  polygon(context, [body(-.18, -.08), body(0, .025), body(-.075, .20)], '#f6f8f8', '#516070', ink)
  polygon(context, [body(.18, -.08), body(0, .025), body(.075, .20)], '#e1e7ed', '#516070', ink)

  for (const side of [-1, 1]) {
    const lapel = new Path2D()
    move(lapel, side * .56, .06)
    line(lapel, side * .19, -.07)
    line(lapel, side * .07, .10)
    line(lapel, side * .25, .245)
    line(lapel, side * .13, .32)
    line(lapel, side * .34, .56)
    line(lapel, side * .45, .22)
    lapel.closePath()
    context.fillStyle = side < 0 ? '#24466d' : '#1b385c'
    context.fill(lapel)
    context.strokeStyle = '#07172a'
    context.lineWidth = ink * 1.3
    context.stroke(lapel)
    const seam = new Path2D()
    move(seam, side * .53, .07)
    line(seam, side * .245, .24)
    line(seam, side * .13, .32)
    context.strokeStyle = 'rgba(99,137,177,.5)'
    context.lineWidth = ink * .7
    context.stroke(seam)
  }

  const shirtSeam = new Path2D()
  move(shirtSeam, 0, .19)
  line(shirtSeam, 0, 1.08)
  context.strokeStyle = 'rgba(81,95,112,.55)'
  context.lineWidth = ink
  context.stroke(shirtSeam)
  for (const y of [.41, .68, .94]) {
    const button = body(.015, y)
    context.beginPath()
    context.arc(button.x, button.y, Math.max(1.7, ink * .9), 0, Math.PI * 2)
    context.fillStyle = '#77818f'
    context.fill()
  }

  // Layered red bow tie with folded wings and a raised central knot.
  const bowColor = context.createLinearGradient(0, body(0, .04).y, 0, body(0, .17).y)
  bowColor.addColorStop(0, '#9c2630')
  bowColor.addColorStop(.5, '#c9363d')
  bowColor.addColorStop(1, '#6f1c29')
  polygon(context, [body(-.19, .035), body(-.035, .065), body(-.035, .135),
    body(-.19, .17), body(-.165, .105)], bowColor, '#391723', ink * 1.5)
  polygon(context, [body(.19, .035), body(.035, .065), body(.035, .135),
    body(.19, .17), body(.165, .105)], bowColor, '#391723', ink * 1.5)
  polygon(context, [body(-.17, .06), body(-.06, .087), body(-.17, .115)],
    'rgba(69,9,23,.48)')
  polygon(context, [body(.17, .06), body(.06, .087), body(.17, .115)],
    'rgba(69,9,23,.48)')
  polygon(context, [body(-.047, .057), body(.047, .057), body(.052, .145), body(-.052, .145)],
    '#9d2a32', '#391723', ink * 1.4)
  polygon(context, [body(-.035, .069), body(.028, .069), body(.027, .091), body(-.035, .091)],
    'rgba(244,112,111,.25)')

  // Light cel shading follows the jaw without replacing the camera face.
  const cheekLeft = p.cheekA.x < p.cheekB.x ? p.cheekA : p.cheekB
  const cheekRight = p.cheekA.x < p.cheekB.x ? p.cheekB : p.cheekA
  const jawShade = context.createLinearGradient(p.nose.x, 0, cheekRight.x, 0)
  jawShade.addColorStop(0, 'rgba(12,24,43,0)')
  jawShade.addColorStop(1, 'rgba(12,24,43,.19)')
  context.beginPath()
  context.moveTo(p.nose.x, p.nose.y)
  context.lineTo(cheekRight.x, cheekRight.y)
  context.quadraticCurveTo(cheekRight.x - faceWidth * .04, p.chin.y - faceHeight * .12, p.chin.x, p.chin.y)
  context.closePath()
  context.fillStyle = jawShade
  context.fill()
  context.beginPath()
  context.moveTo(cheekLeft.x, cheekLeft.y + faceHeight * .07)
  context.bezierCurveTo(cheekLeft.x + faceWidth * .04, p.chin.y - faceHeight * .18,
    p.chin.x - faceWidth * .17, p.chin.y - faceHeight * .015, p.chin.x, p.chin.y)
  context.bezierCurveTo(p.chin.x + faceWidth * .17, p.chin.y - faceHeight * .015,
    cheekRight.x - faceWidth * .04, p.chin.y - faceHeight * .18,
    cheekRight.x, cheekRight.y + faceHeight * .07)
  context.strokeStyle = 'rgba(20,24,36,.58)'
  context.lineWidth = ink
  context.stroke()

  const noseSize = Math.max(2.5, faceWidth * .023)
  polygon(context, [
    { x: p.nose.x - noseSize * .7, y: p.nose.y },
    { x: p.nose.x + noseSize * .5, y: p.nose.y - noseSize * .2 },
    { x: p.nose.x + noseSize, y: p.nose.y + noseSize * .8 },
    { x: p.nose.x, y: p.nose.y + noseSize },
  ], 'rgba(79,51,45,.42)', 'rgba(36,31,34,.72)', Math.max(1, ink * .65))

  const lipWidth = dist(p.mouthA, p.mouthB)
  const mouthMid = center(p.mouthA, p.mouthB)
  const lipY = (p.upperLip.y + p.lowerLip.y) / 2
  context.beginPath()
  context.moveTo(mouthMid.x - lipWidth * .33, lipY)
  context.quadraticCurveTo(mouthMid.x, lipY + faceHeight * .012,
    mouthMid.x + lipWidth * .33, lipY)
  context.strokeStyle = 'rgba(48,27,33,.84)'
  context.lineWidth = Math.max(1.5, ink * .9)
  context.stroke()
  const fangX = mouthMid.x + lipWidth * .2
  const fangY = lipY - faceHeight * .012
  const fangHeight = Math.max(faceHeight * .082, dist(p.upperLip, p.lowerLip) * .95)
  const fangWidth = lipWidth * .065
  const fang = new Path2D()
  fang.moveTo(fangX - fangWidth, fangY)
  fang.quadraticCurveTo(fangX, fangY + fangHeight * .08, fangX + fangWidth, fangY)
  fang.bezierCurveTo(fangX + fangWidth * .7, fangY + fangHeight * .4,
    fangX + fangWidth * .1, fangY + fangHeight * .85,
    fangX - fangWidth * .14, fangY + fangHeight)
  fang.bezierCurveTo(fangX - fangWidth * .32, fangY + fangHeight * .64,
    fangX - fangWidth * .68, fangY + fangHeight * .32,
    fangX - fangWidth, fangY)
  fang.closePath()
  const enamel = context.createLinearGradient(0, fangY, 0, fangY + fangHeight)
  enamel.addColorStop(0, '#ffffff')
  enamel.addColorStop(.7, '#f9fbff')
  enamel.addColorStop(1, '#b6c6d5')
  context.fillStyle = enamel
  context.fill(fang)
  context.strokeStyle = '#53414a'
  context.lineWidth = Math.max(1, ink * .75)
  context.stroke(fang)
  context.beginPath()
  context.moveTo(fangX - fangWidth * .43, fangY + fangHeight * .19)
  context.lineTo(fangX - fangWidth * .14, fangY + fangHeight * .72)
  context.strokeStyle = 'rgba(255,255,255,.78)'
  context.lineWidth = Math.max(1, ink * .5)
  context.stroke()

  // Each lens scales with its own eye, so the frame narrows naturally on a turned face.
  // Sorting after projection keeps the top of the frame upright in a mirrored selfie.
  const eyes = [
    { center: p.eyeA, span: dist(p.eyeAOuter, p.eyeAInner) },
    { center: p.eyeB, span: dist(p.eyeBInner, p.eyeBOuter) },
  ].sort((a, b) => a.center.x - b.center.x)
  const eyeMid = center(eyes[0].center, eyes[1].center)
  const angle = Math.atan2(eyes[1].center.y - eyes[0].center.y,
    eyes[1].center.x - eyes[0].center.x)
  const eyeGap = dist(eyes[0].center, eyes[1].center)
  const averageSpan = Math.max(1, (eyes[0].span + eyes[1].span) / 2)
  const baseWidth = Math.min(faceWidth * .47, eyeGap * .9,
    Math.max(faceWidth * .41, eyeGap * .78))
  const widths = eyes.map(eye => baseWidth * Math.max(.78, Math.min(1.2, eye.span / averageSpan)))
  const heights = widths.map(lensWidth => faceHeight * .33 * lensWidth / baseWidth)
  context.save()
  context.translate(eyeMid.x, eyeMid.y + faceHeight * .025)
  context.rotate(angle)
  const lens = (cx: number, lensWidth: number, lensHeight: number) => {
    const left = cx - lensWidth * .51, right = cx + lensWidth * .51
    const top = -lensHeight * .5, bottom = lensHeight * .5
    const path = new Path2D()
    path.moveTo(left + lensWidth * .14, top)
    path.bezierCurveTo(left + lensWidth * .3, top - lensHeight * .035,
      right - lensWidth * .28, top - lensHeight * .035,
      right - lensWidth * .13, top)
    path.bezierCurveTo(right + lensWidth * .015, top + lensHeight * .07,
      right + lensWidth * .035, top + lensHeight * .31,
      right, top + lensHeight * .56)
    path.bezierCurveTo(right - lensWidth * .045, bottom - lensHeight * .01,
      right - lensWidth * .23, bottom + lensHeight * .055, cx, bottom + lensHeight * .055)
    path.bezierCurveTo(left + lensWidth * .2, bottom + lensHeight * .055,
      left + lensWidth * .025, bottom - lensHeight * .01,
      left, top + lensHeight * .56)
    path.bezierCurveTo(left - lensWidth * .025, top + lensHeight * .31,
      left + lensWidth * .005, top + lensHeight * .07,
      left + lensWidth * .14, top)
    path.closePath()
    return path
  }
  const centers = [-eyeGap / 2, eyeGap / 2]

  // Side arms sit against the temples and pass behind the lens rims.
  for (const [index, side] of [-1, 1].entries()) {
    const outer = centers[index] + side * widths[index] * .49
    const end = side * Math.max(faceWidth * .61, Math.abs(outer) + faceWidth * .07)
    const arm = new Path2D()
    arm.moveTo(outer, -heights[index] * .22)
    arm.lineTo(end, -heights[index] * .12)
    arm.lineTo(end, heights[index] * .09)
    arm.lineTo(outer, heights[index] * .05)
    arm.closePath()
    context.fillStyle = '#12294b'
    context.fill(arm)
    context.strokeStyle = '#071529'
    context.lineWidth = Math.max(1.5, faceWidth * .014)
    context.stroke(arm)
    context.beginPath()
    context.moveTo(outer, -heights[index] * .18)
    context.lineTo(end, -heights[index] * .08)
    context.strokeStyle = 'rgba(110,142,198,.55)'
    context.lineWidth = Math.max(1, faceWidth * .008)
    context.stroke()
  }

  for (let index = 0; index < 2; index++) {
    const cx = centers[index], lensWidth = widths[index], lensHeight = heights[index]
    const path = lens(cx, lensWidth, lensHeight)
    // Bloom spills onto the cheeks, while a darker offset grounds the frame.
    context.save()
    context.shadowColor = 'rgba(209,219,255,.92)'
    context.shadowBlur = faceWidth * .23
    context.fillStyle = '#fff'
    context.fill(path)
    context.fill(path)
    context.restore()
    const glass = context.createRadialGradient(cx, -lensHeight * .08, lensHeight * .05,
      cx, 0, lensWidth * .7)
    glass.addColorStop(0, '#fff')
    glass.addColorStop(.78, '#fff')
    glass.addColorStop(1, '#e4eaff')
    context.fillStyle = glass
    context.fill(path)

    context.save()
    context.shadowColor = 'rgba(4,11,27,.6)'
    context.shadowBlur = faceWidth * .044
    context.shadowOffsetY = faceWidth * .014
    context.strokeStyle = '#071426'
    context.lineWidth = Math.max(3, faceWidth * .043)
    context.stroke(path)
    context.restore()
    context.strokeStyle = '#244d83'
    context.lineWidth = Math.max(2, faceWidth * .03)
    context.stroke(path)
    context.strokeStyle = '#0b1b35'
    context.lineWidth = Math.max(1.5, faceWidth * .018)
    context.stroke(path)
    context.strokeStyle = 'rgba(157,178,255,.86)'
    context.lineWidth = Math.max(1, faceWidth * .004)
    context.stroke(path)

    // A slim rim highlight reads as molded acetate rather than a flat outline.
    context.beginPath()
    context.moveTo(cx - lensWidth * .38, -lensHeight * .51)
    context.quadraticCurveTo(cx, -lensHeight * .57, cx + lensWidth * .35, -lensHeight * .51)
    context.strokeStyle = 'rgba(130,163,210,.75)'
    context.lineWidth = Math.max(1, faceWidth * .008)
    context.stroke()
  }

  const bridgeLeft = centers[0] + widths[0] * .49
  const bridgeRight = centers[1] - widths[1] * .49
  const bridgeHeight = Math.min(heights[0], heights[1])
  const bridge = new Path2D()
  bridge.moveTo(bridgeLeft, -bridgeHeight * .22)
  bridge.bezierCurveTo(bridgeLeft + (bridgeRight - bridgeLeft) * .28, -bridgeHeight * .38,
    bridgeRight - (bridgeRight - bridgeLeft) * .28, -bridgeHeight * .38,
    bridgeRight, -bridgeHeight * .22)
  context.strokeStyle = '#071426'
  context.lineWidth = Math.max(2.5, faceWidth * .038)
  context.stroke(bridge)
  context.strokeStyle = '#315b96'
  context.lineWidth = Math.max(1.25, faceWidth * .019)
  context.stroke(bridge)
  context.strokeStyle = 'rgba(168,190,230,.7)'
  context.lineWidth = Math.max(1, faceWidth * .004)
  context.stroke(bridge)
  for (const x of [bridgeLeft + faceWidth * .008, bridgeRight - faceWidth * .008]) {
    context.beginPath()
    context.ellipse(x, bridgeHeight * .15, faceWidth * .026, faceHeight * .025,
      0, 0, Math.PI * 2)
    context.fillStyle = 'rgba(188,205,232,.15)'
    context.fill()
  }
  context.restore()
  context.restore()
}

/** Let the live camera hand sit in front of the glasses and jacket. */
export function revealTrackedHands(context: CanvasRenderingContext2D, hands: Point3[][],
  width: number, height: number, sourceWidth: number, sourceHeight: number, mirrored: boolean) {
  const scale = Math.max(width / sourceWidth, height / sourceHeight)
  const offsetX = (width - sourceWidth * scale) / 2
  const offsetY = (height - sourceHeight * scale) / 2
  const project = (p: Point3): Point2 => {
    const x = offsetX + p.x * sourceWidth * scale
    return { x: mirrored ? width - x : x, y: offsetY + p.y * sourceHeight * scale }
  }
  context.save()
  context.globalCompositeOperation = 'destination-out'
  context.fillStyle = '#000'
  context.strokeStyle = '#000'
  context.lineCap = 'round'
  context.lineJoin = 'round'
  for (const hand of hands) {
    if (hand.length !== 21 || hand.some(p => !Number.isFinite(p.x) || !Number.isFinite(p.y))) continue
    const points = hand.map(project)
    const palmWidth = dist(points[5], points[17])
    if (palmWidth < 4 || palmWidth > width * .55) continue
    const palm = new Path2D()
    palm.moveTo(points[0].x, points[0].y)
    for (const index of [5, 9, 13, 17]) palm.lineTo(points[index].x, points[index].y)
    palm.closePath()
    context.fill(palm)
    context.lineWidth = palmWidth * .27
    context.stroke(palm)
    for (const chain of [[1, 2, 3, 4], [5, 6, 7, 8], [9, 10, 11, 12],
      [13, 14, 15, 16], [17, 18, 19, 20]]) {
      context.beginPath()
      context.moveTo(points[chain[0]].x, points[chain[0]].y)
      for (const index of chain.slice(1)) context.lineTo(points[index].x, points[index].y)
      context.lineWidth = palmWidth * (chain[0] === 1 ? .25 : .20)
      context.stroke()
      const tip = points[chain[3]]
      context.beginPath()
      context.arc(tip.x, tip.y, palmWidth * .095, 0, Math.PI * 2)
      context.fill()
    }
  }
  context.restore()
}
