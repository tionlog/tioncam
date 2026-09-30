import { characterNames } from './population'
import type { Resident } from './resident'

export function residentProfile(resident: Resident) {
  const fragment = document.createDocumentFragment()
  const portrait = document.createElement('canvas')
  portrait.width = portrait.height = 80
  portrait.className = `profile-portrait profile-${resident.style}`
  portrait.setAttribute('aria-hidden', 'true')
  portrait.getContext('2d')!.drawImage(resident.faceTexture.image as HTMLCanvasElement, 0, 0, 80, 80)
  const text = document.createElement('span')
  text.className = 'profile-text'
  const name = document.createElement('strong')
  name.textContent = resident.name
  const style = document.createElement('small')
  style.textContent = characterNames[resident.style]
  text.append(name, style)
  fragment.append(portrait, text)
  return fragment
}
