const relic = (id, name, text, icon) => ({ id, name, text, icon })

export const RELICS = [
  relic('fireboots', 'CINDER BOOTS', 'FIRE CANNOT HURT', 'fireboots'),
  relic('rubber', 'RUBBER GLOVES', 'CHARGE CANNOT HURT', 'rubber'),
  relic('gills', 'GILLS', 'SMOKE IS HARMLESS', 'gills'),
  relic('springs', 'COILED SPRINGS', 'DOUBLE JUMP', 'springs'),
  relic('claws', 'CLIMBING CLAWS', 'CLING TO WALLS', 'claws'),
  relic('feather', 'FEATHER', 'HOLD JUMP: FALL SLOWLY', 'feather'),
  relic('coinmagnet', 'COIN MAGNET', 'COINS COME TO YOU', 'coinmagnet'),
  relic('sack', 'SCAVENGER SACK', 'FOES DROP MORE', 'sack'),
  relic('hands', 'QUICK HANDS', 'SKILLS RECOVER FASTER', 'hands'),
  relic('battery', 'BATTERY', 'KILLS RECHARGE SKILLS', 'battery'),
  relic('plate', 'REACTIVE PLATE', 'HITS SET OFF BLASTS', 'plate'),
  relic('phoenix', 'PHOENIX', 'RETURN FROM DEATH ONCE', 'phoenix'),
  relic('incendiary', 'FIRE ROUNDS', 'SHOTS LIGHT FIRES', 'incendiary'),
  relic('shock', 'SHOCK ROUNDS', 'SHOTS CARRY CHARGE', 'shock'),
  relic('frostshot', 'COLD ROUNDS', 'SHOTS FREEZE', 'frostshot'),
  relic('pierce', 'PIERCING ROUNDS', 'SHOTS PIERCE', 'pierce'),
  relic('spread', 'SCATTER GUN', 'THREE SHOTS', 'spread'),
  relic('ricochet', 'RICOCHET', 'SHOTS BOUNCE', 'ricochet'),
  relic('stomp', 'IRON BOOTS', 'LAND ON FOES', 'stomp'),
  relic('gem', 'ODD GEM', 'MORE EXPERIENCE', 'gem'),
  relic('skull', 'BLOOD SKULL', 'KILLS SOMETIMES HEAL', 'skull'),
  relic('crown', 'GREEDY CROWN', 'COINS GIVE SCORE', 'crown'),
  relic('acidskull', 'ACID ROUNDS', 'SHOTS EAT BLOCKS', 'acidskull'),
  relic('wind', 'TAILWIND', 'FASTER', 'wind'),
  relic('dice', 'LOADED DICE', 'TWO NEW SKILLS', 'dice'),
  relic('eye', 'THIRD EYE', 'SEE THE WHOLE MAP', 'eye'),
  relic('chain', 'BROKEN CHAIN', 'CHAINS LAST LONGER', 'chain'),
]

export const RELIC_BY_ID = Object.fromEntries(RELICS.map(r => [r.id, r]))

export const hasRelic = (p, id) => p.relics.has(id)
