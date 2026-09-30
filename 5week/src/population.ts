export const characterStyles = ['rabbit', 'astronaut', 'sprout', 'tinkerbell'] as const
export type CharacterStyle = typeof characterStyles[number]
export const characterNames: Record<CharacterStyle, string> = {
  rabbit: '달토끼', astronaut: '우주인', sprout: '새싹이', tinkerbell: '팅커벨',
}

type ResidentWithVest = { style: CharacterStyle; vest: { visible: boolean } }

export function updateRareVests(residents: readonly ResidentWithVest[]) {
  const counts: Record<CharacterStyle, number> = { rabbit: 0, astronaut: 0, sprout: 0, tinkerbell: 0 }
  for (const resident of residents) counts[resident.style] += 1
  const minimum = Math.min(...characterStyles.map((style) => counts[style]))
  const candidates = characterStyles.filter((style) => counts[style] === minimum)
  // All four types participate, including empty populations. An absent type
  // cannot wear a vest; tied minima never confer the designation.
  const rarest = minimum > 0 && candidates.length === 1 ? candidates[0] : null
  for (const resident of residents) resident.vest.visible = resident.style === rarest
  return { counts, rarest }
}
