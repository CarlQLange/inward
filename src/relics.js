const relic = (id, name, text, icon) => ({ id, name, text, icon })

export const RELICS = [
  relic('fireboots', 'CINDER BOOTS', 'FIRE CANNOT HURT', 'fireboots'),
  relic('rubber', 'RUBBER GLOVES', 'CHARGE CANNOT HURT', 'rubber'),
  relic('gills', 'GILLS', 'SMOKE IS HARMLESS', 'gills'),
  relic('springs', 'COILED SPRINGS', 'DOUBLE JUMP', 'springs'),
  relic('claws', 'CLIMBING CLAWS', 'CLING TO WALLS', 'claws'),
  relic('feather', 'FEATHER', 'HOLD JUMP: FALL SLOWLY', 'feather'),
  relic('coinmagnet', 'MAGNET HEART', 'YOU ARE MAGNETIC', 'coinmagnet'),
  relic('sack', 'GUT SACK', 'CORPSES SPILL THEIR MATTER', 'sack'),
  relic('hands', 'HOT HANDS', 'EVERY SKILL EATS FIRE', 'hands'),
  relic('battery', 'BATTERY', 'SPARE FOOD BANKS A CAST', 'battery'),
  relic('plate', 'REACTIVE PLATE', 'HITS SET OFF BLASTS', 'plate'),
  relic('phoenix', 'PHOENIX', 'RETURN FROM DEATH ONCE', 'phoenix'),
  relic('incendiary', 'FIRE ROUNDS', 'SHOTS LIGHT FIRES', 'incendiary'),
  relic('shock', 'SHOCK ROUNDS', 'SHOTS CARRY CHARGE', 'shock'),
  relic('frostshot', 'COLD ROUNDS', 'SHOTS FREEZE', 'frostshot'),
  relic('pierce', 'GHOST ROUNDS', 'SHOTS PASS THROUGH ALL', 'pierce'),
  relic('spread', 'SCATTER GUN', 'A BLAST THAT KICKS', 'spread'),
  relic('ricochet', 'RICOCHET', 'SHOTS BOUNCE', 'ricochet'),
  relic('stomp', 'IRON BOOTS', 'LAND ON FOES', 'stomp'),
  relic('gem', 'ODD GEM', 'ONLY WORLD KILLS TEACH', 'gem'),
  relic('skull', 'BLOOD SKULL', 'CHAINS OF THREE MEND', 'skull'),
  relic('crown', 'GREEDY CROWN', 'COINS TAKE THE HIT', 'crown'),
  relic('acidskull', 'ACID ROUNDS', 'SHOTS EAT BLOCKS', 'acidskull'),
  relic('wind', 'UPDRAFT', 'GAS LIFTS YOU', 'wind'),
  relic('dice', 'LOADED DICE', 'NEW SKILLS ARRIVE EVOLVED', 'dice'),
  relic('eye', 'THIRD EYE', 'SEE THE WHOLE MAP', 'eye'),
  relic('chain', 'BROKEN CHAIN', 'ONLY HITS BREAK CHAINS', 'chain'),
]

export const RELIC_BY_ID = Object.fromEntries(RELICS.map(r => [r.id, r]))

export const hasRelic = (p, id) => p.relics.has(id)
