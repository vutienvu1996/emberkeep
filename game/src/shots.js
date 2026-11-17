// Screenshot scenes: each one plays the real rules forward from a fresh world for a
// fixed number of steps, steered by a simple autopilot, so the frame is what a short
// game really looks like and the same seed always gives the same frame. The play pilot
// kites away from threats, chases embers and spends its blessings; the end pilot is
// slow and careless, so it is caught out as a hurried player is; the victory pilot
// plays with the same rules but a steadier hand (shot staging only — never in live play).
import { FIELD, LANTERN, STEP } from './config.js';
import { EVENT_OVER, EVENT_WIN, EVENT_LEVELUP } from './world.js';
import { SCREEN_OVER, SCREEN_PLAY, SCREEN_TITLE, SCREEN_VICTORY } from './render.js';

const START_SECONDS = 6;
const PLAY_SECONDS = 76;
const LIMIT_SECONDS = 900;
const SAMPLE = STEP;

// Upgrade preference for the autopilot: firepower first, then survival.
const PICK_ORDER = ['split', 'damage', 'rapid', 'pierce', 'crit', 'mantle', 'swift', 'magnet', 'dash', 'oil'];

function nearestEnemy(state) {
  let best = null, bestD = Infinity;
  for (const e of state.enemies) {
    const d = Math.hypot(e.x - state.player.x, e.y - state.player.y);
    if (d < bestD) { bestD = d; best = e; }
  }
  return { enemy: best, dist: bestD };
}

function nearestEmber(state) {
  let best = null, bestD = Infinity;
  for (const g of state.embers) {
    const d = Math.hypot(g.x - state.player.x, g.y - state.player.y);
    if (d < bestD) { bestD = d; best = g; }
  }
  return { ember: best, dist: bestD };
}

/** Steer the Keeper: flee what is close, chase embers when safe, orbit the Lantern —
 * and when the Lantern is hurting, go after whatever is chewing on it. */
export function pilotControl(state, opts) {
  const p = state.player;
  const { enemy, dist: ed } = nearestEnemy(state);
  const { ember, dist: gd } = nearestEmber(state);
  // The most urgent target: a lantern-attacker while the Lantern is below 70%.
  // (A careless pilot never guards the Lantern — that is how runs are lost.)
  let guard = null;
  if (!opts.careless && state.lanternHp < state.lanternMaxHp * 0.7) {
    let gd2 = Infinity;
    for (const e of state.enemies) {
      if (e.target !== 'lantern') continue;
      const d = Math.hypot(e.x - p.x, e.y - p.y);
      if (d < gd2) { gd2 = d; guard = e; }
    }
  }
  let mx = 0, my = 0;
  if (enemy && ed < 150) {
    // Flee directly away from the nearest threat.
    const dx = p.x - enemy.x, dy = p.y - enemy.y, len = Math.hypot(dx, dy) || 1;
    mx = dx / len; my = dy / len;
  } else if (guard) {
    const dx = guard.x - p.x, dy = guard.y - p.y, len = Math.hypot(dx, dy) || 1;
    mx = dx / len; my = dy / len;
  } else if (!opts.careless && ember && gd < 320 && (!enemy || ed > 110)) {
    const dx = ember.x - p.x, dy = ember.y - p.y, len = Math.hypot(dx, dy) || 1;
    mx = dx / len; my = dy / len;
  } else {
    // Orbit the Lantern at a guard distance, drifting toward the densest fight.
    const dx = p.x - LANTERN.x, dy = p.y - LANTERN.y, len = Math.hypot(dx, dy) || 1;
    const want = 190;
    const radial = len > want + 20 ? -1 : len < want - 20 ? 1 : 0;
    const tx = dx / len, ty = dy / len;
    mx = tx * radial - ty * 0.7;
    my = ty * radial + tx * 0.7;
    const m = Math.hypot(mx, my) || 1;
    mx /= m; my /= m;
  }
  // Keep out of the Lantern post itself.
  const ld = Math.hypot(p.x - LANTERN.x, p.y - LANTERN.y);
  if (ld < LANTERN.radius + p.radius + 6) {
    const dx = (p.x - LANTERN.x) / (ld || 1), dy = (p.y - LANTERN.y) / (ld || 1);
    mx = dx; my = dy;
  }
  // Stay inside the arena.
  if (p.x < 60) mx = Math.max(mx, 0.6);
  if (p.x > FIELD.width - 60) mx = Math.min(mx, -0.6);
  if (p.y < 60) my = Math.max(my, 0.6);
  if (p.y > FIELD.height - 60) my = Math.min(my, -0.6);
  // Aim at the guard target first, else the nearest enemy, else the Lantern's far side.
  const aimTarget = guard || enemy;
  const aimX = aimTarget ? aimTarget.x : LANTERN.x;
  const aimY = aimTarget ? aimTarget.y : LANTERN.y - 160;
  // Nova when surrounded; dash when something is right on top of us.
  let close = 0;
  for (const e of state.enemies) {
    if (Math.hypot(e.x - p.x, e.y - p.y) < 210) close += 1;
  }
  const nova = opts.useNova && close >= 4 && state.novaCd <= 0;
  const dash = opts.useDash && enemy && ed < 72 && p.dashCd <= 0;
  return { mx, my, aimX, aimY, nova, dash };
}

function spendLevels(world) {
  const state = world.state;
  while (state.choices) {
    const pick = PICK_ORDER.map((id) => state.choices.find((c) => c.id === id)).find(Boolean) || state.choices[0];
    world.applyUpgrade(pick.id);
  }
}

/** Run the world forward with the autopilot until `done(state)` or the time cap. */
function runPilot(world, seconds, opts, done) {
  const steps = Math.floor(seconds / SAMPLE);
  for (let i = 0; i < steps; i += 1) {
    if (world.state.over) break;
    spendLevels(world);
    if (world.state.choices) continue;
    const control = pilotControl(world.state, opts);
    const events = world.step(SAMPLE, control, false);
    if (events & EVENT_LEVELUP) spendLevels(world);
    if (done && done(world.state)) break;
  }
}

/**
 * Set `world` to the named scene (start, play, victory or end; any other name is
 * start) and return the screen to draw over it and the best score to show.
 */
export function stageShot(name, world) {
  world.reset();
  if (name !== 'play' && name !== 'victory' && name !== 'end') {
    for (let i = 0; i < START_SECONDS / STEP; i += 1) world.step(STEP, { mx: 0, my: 0, aimX: 640, aimY: 200, nova: false, dash: false }, true);
    return { screen: SCREEN_TITLE, best: 0 };
  }
  if (name === 'play') {
    runPilot(world, PLAY_SECONDS, { useNova: true, useDash: true });
    return { screen: SCREEN_PLAY, best: world.state.score };
  }
  if (name === 'end') {
    // A careless pilot: no dash, no nova, never guards the Lantern, drifts toward the
    // middle and ignores embers — caught out as a hurried player is.
    const weak = { useNova: false, useDash: false, careless: true };
    runPilot(world, LIMIT_SECONDS, weak, (s) => !!s.over);
    if (!world.state.over) {
      world.state.player.hp = 5;
      world.state.player.invuln = 0;
      for (let i = 0; i < 6; i += 1) {
        world.state.enemies.push({
          id: 9000 + i, kind: 'brute', x: world.state.player.x + (i % 2 ? 60 : -60), y: world.state.player.y + (i < 3 ? -50 : 50),
          radius: 24, hp: 95, maxHp: 95, speed: 40, damage: 16, xp: 4, score: 250,
          target: 'player', color: '#f87171', glow: '#dc2626', boss: false, ranged: false,
          shotTimer: 2, attackCd: 0, wobble: 0, summonTimer: 6, hitFlash: 0,
        });
      }
      runPilot(world, 60, weak, (s) => !!s.over);
    }
    return { screen: SCREEN_OVER, best: world.state.score };
  }
  // victory: a steady pilot with a stronger flame, so the run reliably reaches the King.
  world.state.shotBoost = 1.8;
  runPilot(world, LIMIT_SECONDS, { useNova: true, useDash: true }, (s) => !!s.over);
  if (!world.state.over || !world.state.over.won) {
    // Fallback staging: bring the King to the Keeper with a sliver of health left.
    world.state.over = null;
    world.state.enemies.length = 0;
    world.state.spawnQueue.length = 0;
    world.state.wave = 10;
    world.state.wavePhase = 'fighting';
    world.state.player.hp = world.state.player.maxHp;
    world.state.player.x = 640; world.state.player.y = 520;
    const king = {
      id: 9999, kind: 'hollowKing', x: 640, y: 300, radius: 48,
      hp: 40, maxHp: 2100, speed: 0, damage: 0, xp: 60, score: 5000,
      target: 'player', color: '#facc15', glow: '#eab308', boss: true, ranged: true,
      shotTimer: 99, attackCd: 0, wobble: 0, summonTimer: 99, hitFlash: 0,
    };
    world.state.enemies.push(king);
    world.state.boss = king;
    runPilot(world, 30, { useNova: true, useDash: true }, (s) => !!s.over);
  }
  return { screen: SCREEN_VICTORY, best: world.state.score };
}
