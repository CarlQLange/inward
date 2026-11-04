const relic = (id, name, text, icon) => ({ id, name, text, icon })

export const RELICS = [
  relic('fireboots', 'CINDER BOOTS', 'FIRE AND LAVA CANNOT HURT YOU', 'fireboots'),
  relic('rubber', 'RUBBER GLOVES', 'CHARGE CANNOT HURT YOU', 'rubber'),
  relic('gills', 'GILLS', 'SMOKE IS HARMLESS. SWIM FASTER.', 'gills'),
  relic('springs', 'COILED SPRINGS', 'JUMP AGAIN IN THE AIR', 'springs'),
  relic('claws', 'CLIMBING CLAWS', 'CLING TO WALLS AND KICK OFF THEM', 'claws'),
  relic('feather', 'FEATHER', 'HOLD JUMP TO FALL SLOWLY', 'feather'),
  relic('coinmagnet', 'COIN MAGNET', 'COINS FLY TO YOU', 'coinmagnet'),
  relic('sack', 'SCAVENGER SACK', 'FOES DROP MORE', 'sack'),
  relic('hands', 'QUICK HANDS', 'SKILLS RECOVER FASTER', 'hands'),
  relic('battery', 'BATTERY', 'KILLS RECHARGE YOUR SKILLS', 'battery'),
  relic('plate', 'REACTIVE PLATE', 'TAKING A HIT SETS OFF A BLAST', 'plate'),
  relic('phoenix', 'PHOENIX', 'COME BACK FROM DEATH ONCE', 'phoenix'),
  relic('incendiary', 'FIRE ROUNDS', 'SHOTS LIGHT WHAT THEY HIT', 'incendiary'),
  relic('shock', 'SHOCK ROUNDS', 'SHOTS CHARGE WHAT THEY HIT', 'shock'),
  relic('frostshot', 'COLD ROUNDS', 'SHOTS CHILL FOES AND FREEZE WATER', 'frostshot'),
  relic('pierce', 'PIERCING ROUNDS', 'SHOTS PASS THROUGH FOES', 'pierce'),
  relic('spread', 'SCATTER GUN', 'THREE SHOTS AT ONCE', 'spread'),
  relic('ricochet', 'RICOCHET', 'SHOTS BOUNCE OFF WALLS', 'ricochet'),
  relic('stomp', 'IRON BOOTS', 'LANDING ON FOES HURTS THEM', 'stomp'),
  relic('gem', 'ODD GEM', 'MORE EXPERIENCE FROM EVERYTHING', 'gem'),
  relic('skull', 'BLOOD SKULL', 'KILLS SOMETIMES HEAL YOU', 'skull'),
  relic('crown', 'GREEDY CROWN', 'COINS ALSO GIVE SCORE', 'crown'),
  relic('acidskull', 'ACID ROUNDS', 'SHOTS EAT THE BLOCKS THEY HIT', 'acidskull'),
  relic('wind', 'TAILWIND', 'RUN AND JUMP FASTER', 'wind'),
  relic('dice', 'LOADED DICE', 'EVERY LEVEL OFFERS TWO NEW SKILLS', 'dice'),
  relic('eye', 'THIRD EYE', 'SEE EVERY ROOM AND LOCK ON THE MAP', 'eye'),
  relic('chain', 'BROKEN CHAIN', 'CHAINS LAST MUCH LONGER', 'chain'),
]

export const RELIC_BY_ID = Object.fromEntries(RELICS.map(r => [r.id, r]))

export const hasRelic = (p, id) => p.relics.has(id)
