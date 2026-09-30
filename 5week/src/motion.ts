import * as THREE from 'three'

export type MotionState = {
  id: string
  angle: number
  latitude: number
  speed: number
  greetingUntil: number
  meetingTarget: THREE.Vector3 | null
  dragging: boolean
  heading: THREE.Vector3
  fallenUntil: number
  collisionCooldown: number
  fallTilt: number
  walking: boolean
}

export function residentNormal(resident: Pick<MotionState, 'angle' | 'latitude'>) {
  return new THREE.Vector3(Math.cos(resident.latitude) * Math.cos(resident.angle), Math.sin(resident.latitude), Math.cos(resident.latitude) * Math.sin(resident.angle))
}

function setNormal(resident: MotionState, normal: THREE.Vector3) {
  resident.angle = Math.atan2(normal.z, normal.x)
  resident.latitude = Math.asin(THREE.MathUtils.clamp(normal.y, -1, 1))
}

export function stepResidentMotion(residents: readonly MotionState[], time: number, delta: number) {
  const positions = residents.map(residentNormal)
  const fallen: string[] = []
  const spacing = .17 // About 42 cm on the moon, matching the larger chibi heads.

  for (let i = 0; i < residents.length; i++) {
    const a = residents[i]
    if (a.dragging) continue
    for (let j = i + 1; j < residents.length; j++) {
      const b = residents[j]
      if (b.dragging) continue
      const distance = positions[i].distanceTo(positions[j])
      if (distance >= spacing) continue
      const towardB = positions[j].clone().sub(positions[i])
      const aForward = a.heading.dot(towardB)
      const bForward = b.heading.dot(towardB.clone().negate())
      const aMoving = time >= a.greetingUntil && (!a.meetingTarget || positions[i].distanceTo(a.meetingTarget) > .025)
      const bMoving = time >= b.greetingUntil && (!b.meetingTarget || positions[j].distanceTo(b.meetingTarget) > .025)
      if (a.fallenUntil <= time && b.fallenUntil <= time
        && a.collisionCooldown <= time && b.collisionCooldown <= time
        && ((aMoving && aForward > 0) || (bMoving && bForward > 0) || distance < .001)) {
        // The leader along the approaching resident's path takes the tumble.
        // Equal head-on approaches use stable input order to prevent flicker.
        const leader = aMoving && (!bMoving || aForward >= bForward) ? b : a
        leader.fallenUntil = time + 2800
        leader.collisionCooldown = time + 4500
        const follower = leader === a ? b : a
        follower.collisionCooldown = time + 1600
        fallen.push(leader.id)
      }
      // Resolve contact immediately instead of allowing intersecting bodies to
      // accumulate. Fallen residents stay put; the standing resident steps back.
      const separation = towardB.lengthSq() > 1e-8 ? towardB.normalize() : a.heading.clone().normalize()
      const correction = spacing - distance + .004
      const aWeight = a.fallenUntil > time ? 0 : b.fallenUntil > time ? 1 : .5
      const bWeight = b.fallenUntil > time ? 0 : a.fallenUntil > time ? 1 : .5
      positions[i].addScaledVector(separation, -correction * aWeight).normalize()
      positions[j].addScaledVector(separation, correction * bWeight).normalize()
    }
  }

  for (let i = 0; i < residents.length; i++) {
    const resident = residents[i]
    if (resident.dragging) { resident.walking = false; continue }
    const position = positions[i]
    const isDown = resident.fallenUntil > time
    resident.fallTilt = THREE.MathUtils.lerp(resident.fallTilt, isDown ? Math.PI * .46 : 0, 1 - Math.exp(-delta * (isDown ? 10 : 5)))
    resident.walking = !isDown && time >= resident.greetingUntil
    if (resident.meetingTarget && position.distanceTo(resident.meetingTarget) < .025) resident.walking = false
    if (!resident.walking) { setNormal(resident, position); continue }
    let desired = resident.meetingTarget
      ? resident.meetingTarget.clone().sub(position).projectOnPlane(position).normalize()
      : resident.heading.clone().projectOnPlane(position).normalize()
    if (desired.lengthSq() < .01) desired = new THREE.Vector3(-Math.sin(resident.angle), 0, Math.cos(resident.angle))
    for (let j = 0; j < residents.length; j++) {
      if (i === j || residents[j].dragging) continue
      const obstacle = residents[j]
      const offset = positions[j].clone().sub(position).projectOnPlane(position)
      const distance = position.distanceTo(positions[j])
      const ahead = offset.dot(desired)
      if (obstacle.fallenUntil > time && distance < .40 && ahead > -.025) {
        const sideways = new THREE.Vector3().crossVectors(position, desired).normalize()
        const side = offset.dot(sideways) >= 0 ? -1 : 1
        desired.addScaledVector(sideways, side * 4.2 * (1 - distance / .40))
        desired.addScaledVector(offset.normalize(), -1.2 * (1 - distance / .40)).normalize()
      } else if (distance < spacing * 1.25 && ahead > 0) {
        // Gentle separation after contact also avoids immediate repeat falls.
        if (resident.collisionCooldown > time || obstacle.collisionCooldown > time) desired.addScaledVector(offset.normalize(), -.8).normalize()
      }
    }
    resident.heading.lerp(desired, 1 - Math.exp(-delta * 12)).projectOnPlane(position).normalize()
    let speed = resident.meetingTarget ? .48 : resident.speed
    if (resident.meetingTarget) speed = Math.min(speed, position.distanceTo(resident.meetingTarget) / Math.max(delta, .001))
    position.addScaledVector(resident.heading, speed * delta).normalize()
    resident.heading.projectOnPlane(position).normalize()
    setNormal(resident, position)
  }
  return fallen
}
