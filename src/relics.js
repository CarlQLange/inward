const relic = (id, name, text, icon) => ({ id, name, text, icon })

export const RELICS = [
  relic('fireboots', 'CINDER BOOTS', 'FIRE CANNOT HURT', 'fireboots'),
  relic('rubber', 'RUBBER GLOVES', 'CHARGE CANNOT HURT', 'rubber'),
  relic('gills', 'GILLS', 'SMOKE IS HARMLESS', 'gills'),
  relic('springs', 'COILED SPRINGS', 'DOUBLE JUMP', 'springs'),
  relic('claws', 'CLIMBING CLAWS', 'CLING TO WALLS', 'claws'),
  relic('feather', 'FEATHER', 'HOLD JUMP: FALL SLOWLY', 'feather'),
  relic('coinmagnet', 'MAGNET HEART', 'YOU ARE MAGNETIC', 'coinmagnet'),
  relic('sack', 'GUT SACK', 'KILLED FOES SPILL THEIR MATERIAL', 'sack'),
  relic('hands', 'HOT HANDS', 'FIRE RECHARGES ALL SKILLS', 'hands'),
  relic('battery', 'BATTERY', 'EXTRA RECHARGE IS SAVED AS SPARE USES', 'battery'),
  relic('plate', 'REACTIVE PLATE', 'GETTING HIT SETS OFF A BLAST', 'plate'),
  relic('phoenix', 'PHOENIX', 'RETURN FROM DEATH ONCE', 'phoenix'),
  relic('incendiary', 'FIRE ROUNDS', 'SHOTS LIGHT FIRES', 'incendiary'),
  relic('shock', 'SHOCK ROUNDS', 'SHOTS CARRY CHARGE', 'shock'),
  relic('frostshot', 'COLD ROUNDS', 'SHOTS FREEZE', 'frostshot'),
  relic('pierce', 'GHOST ROUNDS', 'SHOTS PASS THROUGH FOES AND WALLS', 'pierce'),
  relic('spread', 'SCATTER GUN', 'FIRES A SPREAD THAT KNOCKS YOU BACK', 'spread'),
  relic('ricochet', 'RICOCHET', 'SHOTS BOUNCE', 'ricochet'),
  relic('stomp', 'IRON BOOTS', 'LANDING ON FOES HURTS THEM', 'stomp'),
  relic('gem', 'ODD GEM', 'ONLY WORLD KILLS LEVEL YOU UP', 'gem'),
  relic('skull', 'BLOOD SKULL', 'A CHAIN OF THREE HEALS A HEART', 'skull'),
  relic('crown', 'GREEDY CROWN', 'HITS COST COINS INSTEAD OF HEARTS', 'crown'),
  relic('acidskull', 'ACID ROUNDS', 'SHOTS DISSOLVE BLOCKS', 'acidskull'),
  relic('wind', 'UPDRAFT', 'GAS LIFTS YOU', 'wind'),
  relic('dice', 'LOADED DICE', 'NEW SKILLS COME EVOLVED', 'dice'),
  relic('eye', 'THIRD EYE', 'SEE THE WHOLE MAP', 'eye'),
  relic('chain', 'BROKEN CHAIN', 'ONLY HITS BREAK CHAINS', 'chain'),
]

export const RELIC_BY_ID = Object.fromEntries(RELICS.map(r => [r.id, r]))

export const hasRelic = (p, id) => p.relics.has(id)
