// Emberkeep — every tuning number, colour and balance constant in one place.
// The arena is a fixed 1280x720 logical field; the renderer scales it to the window,
// so no rule below depends on the screen size.
export const FIELD = { width: 1280, height: 720 };
export const STEP = 1 / 60;
export const TOTAL_WAVES = 10;
export const BOSS_WAVES = [5, 10];
export const BEST_KEY = 'emberkeep.best.v1';
export const BEST_WAVE_KEY = 'emberkeep.bestwave.v1';

export const PLAYER = {
  x: 640, y: 520, radius: 16,
  maxHp: 100, speed: 250,
  damage: 14, fireInterval: 0.42, bulletSpeed: 560, multishot: 1, pierce: 0,
  critChance: 0.05, magnet: 90, dashCooldown: 1.6, dashTime: 0.18, dashSpeed: 3.2,
};

export const LANTERN = {
  x: 640, y: 360, radius: 26, maxHp: 150,
  glowRadius: 230, burnDps: 7, // shades standing in the lantern light slowly burn
};

export const NOVA = { cooldown: 8, radius: 240, damage: 70 };

// Enemy kinds. `target` is what the kind prefers: 'player', 'lantern' or 'either'.
export const ENEMIES = {
  wisp:  { hp: 12, speed: 108, radius: 11, damage: 6,  xp: 1, score: 50,  target: 'player', color: '#b78cff', glow: '#8b5cf6' },
  shade: { hp: 26, speed: 64,  radius: 15, damage: 10, xp: 2, score: 100, target: 'either', color: '#5eead4', glow: '#14b8a6' },
  spitter:{ hp: 22, speed: 50,  radius: 14, damage: 8,  xp: 2, score: 150, target: 'player', color: '#fb923c', glow: '#ea580c', ranged: true, shotInterval: 2.4, orbSpeed: 190 },
  brute: { hp: 80, speed: 40,  radius: 24, damage: 16, xp: 4, score: 250, target: 'lantern', color: '#f87171', glow: '#dc2626' },
  hollowBrute: { hp: 800, speed: 32, radius: 40, damage: 20, xp: 25, score: 1500, target: 'player', color: '#f472b6', glow: '#db2777', boss: true, shotInterval: 2.0, orbSpeed: 220 },
  hollowKing:  { hp: 1800, speed: 36, radius: 48, damage: 24, xp: 60, score: 5000, target: 'player', color: '#facc15', glow: '#eab308', boss: true, shotInterval: 1.7, orbSpeed: 240 },
};

// Wave composition: how many of each kind join the wave (boss waves add the boss on top).
export function waveComp(n) {
  return {
    wisp: 4 + n * 2,
    shade: n >= 2 ? 2 + n : 0,
    spitter: n >= 3 ? 1 + Math.floor(n / 2) : 0,
    brute: n >= 4 ? Math.floor((n - 2) / 2) : 0,
  };
}
export function waveBoss(n) {
  if (n === 5) return 'hollowBrute';
  if (n === 10) return 'hollowKing';
  return null;
}
export function waveHpScale(n) { return 1 + (n - 1) * 0.16; }
export function waveSpeedScale(n) { return 1 + Math.min(0.45, (n - 1) * 0.05); }

export const XP_NEXT = (level) => 8 + level * 6;
export const WAVE_CLEAR_BONUS = (wave) => 100 * wave;
export const INTERMISSION = 4; // seconds between waves

// Level-up choices. Each has a title, a one-line effect, a max stack count and an apply().
// `id` is stable so the renderer and the autopilot can name the same card.
export const UPGRADES = [
  { id: 'damage',  name: 'Ember Rounds',  desc: '+25% bolt damage',        max: 5, apply: (s) => { s.damage *= 1.25; } },
  { id: 'rapid',   name: 'Rapid Wick',    desc: '+20% fire rate',          max: 5, apply: (s) => { s.fireInterval *= 0.83; } },
  { id: 'split',   name: 'Split Flame',   desc: '+1 bolt per shot',        max: 3, apply: (s) => { s.multishot += 1; } },
  { id: 'pierce',  name: 'Piercing Light',desc: 'Bolts pierce +1 enemy',   max: 3, apply: (s) => { s.pierce += 1; } },
  { id: 'swift',   name: 'Swift Boots',   desc: '+12% move speed',         max: 4, apply: (s) => { s.speed *= 1.12; } },
  { id: 'magnet',  name: 'Magnet Charm',  desc: '+60% ember pickup range', max: 3, apply: (s) => { s.magnet *= 1.6; } },
  { id: 'crit',    name: 'Crit Spark',    desc: '+12% crit chance (x2 dmg)', max: 4, apply: (s) => { s.critChance += 0.12; } },
  { id: 'mantle',  name: 'Iron Mantle',   desc: '+25 max health, heal 25', max: 5, apply: (s) => { s.maxHp += 25; s.hp = Math.min(s.maxHp, s.hp + 25); } },
  { id: 'oil',     name: 'Lantern Oil',   desc: 'Repair the Lantern +45',   max: 5, apply: () => { /* the repair lands in world.applyUpgrade, which owns the Lantern */ } },
  { id: 'dash',    name: 'Long Dash',     desc: 'Dash recharges 30% faster', max: 3, apply: (s) => { s.dashCooldown *= 0.7; } },
];

export const PALETTE = {
  backdrop: '#0b0a1a', backdrop2: '#14122e', ground: '#1a1836',
  arenaEdge: '#3b2f6b', lanternCore: '#ffd166', lanternGlow: '#ff9f1c',
  player: '#ffd166', playerGlow: '#ff9f1c', bullet: '#ffe29a',
  text: '#f5efe0', muted: '#a89fc7', panel: 'rgba(16,14,38,0.92)',
  panelEdge: '#6b5ca8', card: '#221d4d', cardEdge: '#8b7bd8',
  hpGood: '#4ade80', hpWarn: '#facc15', hpBad: '#f87171',
  xp: '#c084fc', nova: '#7dd3fc',
};
export const FONT = 'system-ui, -apple-system, "Segoe UI", sans-serif';
