let state = 0x9e3779b9

export const rnd = () => {
  state ^= state << 13
  state ^= state >>> 17
  state ^= state << 5
  return (state >>> 0) / 4294967296
}

export const rand = (lo, hi) => lo + rnd() * (hi - lo)
export const pick = list => list[Math.floor(rnd() * list.length)]
