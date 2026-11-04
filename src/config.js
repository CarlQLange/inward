export const VIEW = { w: 426, h: 240 }
export const BLOCK = 8
export const ROOM = 28
export const ORIGIN = { x: 101, y: 8 }
export const TICK = 1 / 60

export const TUNING = {
  startDepth: 0.25,
  world: {
    fluidRate: 10,
    fireRate: 8,
    chargeRate: 30,
    exciteAtCore: 2,
    flowReach: 8,
    quench: 1.2,
    smokeLife: [5, 8],
    steamLife: [1.5, 3],
    ashLife: 6,
    spark: 0.25,
    chargeTime: 0.35,
    chargeRefractory: 0.9,
    boltEnergy: 44,
  },
  player: {
    hp: 5,
    run: 82,
    accel: 900,
    gravity: 560,
    jump: 212,
    jumpCut: 0.45,
    maxFall: 280,
    coyote: 0.08,
    buffer: 0.1,
    iframes: 1,
    shotEvery: 0.18,
    shotSpeed: 230,
    shotLife: 0.7,
    boltEvery: 0.9,
    swimGravity: 0.35,
    swimMaxFall: 60,
    swimStroke: 112,
    swimRun: 0.7,
    smokeTolerance: 2,
  },
  crawler: { hp: 2, speed: 22, gravity: 500 },
  spitter: { hp: 4, gravity: 500, every: 2.2, range: 120, shotSpeed: 140, wobble: 26, burst: 2 },
  fish: { hp: 2, speed: 26, chase: 44, airDamageEvery: 1 },
  fireball: { gravity: 260, friendlyAfter: 0.25 },
  enemyIframes: 0.4,
  deadPause: 1.5,
  clearedPause: 1.2,
  cardPause: 0.7,
}
