// Emberkeep's simulation: waves, enemies, the Keeper, the Lantern, bolts, embers and
// level-up choices. Pure rules, no drawing and no sound: the renderer paints `state`
// and main.js turns the returned events into sound and screen changes. The simulation
// runs in fixed 1/60 s steps, so a replay from the same seed always plays the same way.
import {
  FIELD, PLAYER, LANTERN, NOVA, ENEMIES, TOTAL_WAVES, UPGRADES,
  waveComp, waveBoss, waveHpScale, waveSpeedScale, XP_NEXT,
  WAVE_CLEAR_BONUS, INTERMISSION,
} from './config.js';
import { shuffled } from './random.js';

export const EVENT_HIT = 1;
export const EVENT_OVER = 2;
export const EVENT_WIN = 4;
export const EVENT_LEVELUP = 8;
export const EVENT_WAVE = 16;
export const EVENT_LANTERN_HIT = 32;
export const EVENT_NOVA = 64;

function dist(ax, ay, bx, by) { return Math.hypot(ax - bx, ay - by); }

export function createWorld(random) {
  let nextId = 1;
  const state = {};

  function reset() {
    nextId = 1;
    Object.assign(state, {
      time: 0, wave: 0, wavePhase: 'intermission', phaseTimer: 2.5,
      spawnQueue: [], spawnTimer: 0, banner: 'WAVE 1 INCOMING', bannerTimer: 2.5,
      player: {
        x: PLAYER.x, y: PLAYER.y, radius: PLAYER.radius,
        hp: PLAYER.maxHp, maxHp: PLAYER.maxHp, speed: PLAYER.speed,
        damage: PLAYER.damage, fireInterval: PLAYER.fireInterval,
        bulletSpeed: PLAYER.bulletSpeed, multishot: PLAYER.multishot,
        pierce: PLAYER.pierce, critChance: PLAYER.critChance, magnet: PLAYER.magnet,
        dashCooldown: PLAYER.dashCooldown, fireTimer: 0, dashTimer: 0,
        dashCd: 0, invuln: 0, aimX: 640, aimY: 200, dashX: 0, dashY: 0,
      },
      lanternHp: LANTERN.maxHp, lanternMaxHp: LANTERN.maxHp,
      enemies: [], bullets: [], orbs: [], embers: [], pickups: [],
      particles: [], floats: [],
      kills: 0, score: 0, level: 1, xp: 0, xpNext: XP_NEXT(1),
      choices: null, pendingLevels: 0, choicesTaken: {},
      novaCd: 0, boss: null, over: null, shake: 0, shotBoost: 1,
      stars: [], // background stars, fixed at reset so the title never flickers
    });
    for (let i = 0; i < 90; i += 1) {
      state.stars.push({ x: random() * FIELD.width, y: random() * FIELD.height, r: 0.6 + random() * 1.6, tw: random() * 6.28 });
    }
  }

  function burst(x, y, color, n, speed) {
    for (let i = 0; i < n; i += 1) {
      const a = random() * Math.PI * 2;
      const v = (0.3 + random() * 0.7) * speed;
      state.particles.push({ x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v, life: 0.4 + random() * 0.35, maxLife: 0.75, color, size: 2 + random() * 3 });
    }
    if (state.particles.length > 320) state.particles.splice(0, state.particles.length - 320);
  }

  function floatText(x, y, text, color) {
    state.floats.push({ x, y, text, color, life: 0.9 });
    if (state.floats.length > 40) state.floats.shift();
  }

  function spawnPoint() {
    // An arena edge, at least 260 away from the Keeper so nothing spawns on top of them.
    for (let tries = 0; tries < 12; tries += 1) {
      const edge = Math.floor(random() * 4);
      let x, y;
      if (edge === 0) { x = 40 + random() * 1200; y = 36; }
      else if (edge === 1) { x = 40 + random() * 1200; y = 684; }
      else if (edge === 2) { x = 36; y = 40 + random() * 640; }
      else { x = 1244; y = 40 + random() * 640; }
      if (dist(x, y, state.player.x, state.player.y) > 260) return { x, y };
    }
    return { x: 640, y: 40 };
  }

  function spawnEnemy(kind) {
    const def = ENEMIES[kind];
    const scale = waveHpScale(state.wave);
    const p = spawnPoint();
    const enemy = {
      id: nextId++, kind, x: p.x, y: p.y, radius: def.radius,
      hp: def.hp * scale, maxHp: def.hp * scale,
      speed: def.speed * waveSpeedScale(state.wave),
      damage: def.damage, xp: def.xp, score: def.score,
      target: def.target === 'either' ? (random() < 0.5 ? 'player' : 'lantern') : def.target,
      color: def.color, glow: def.glow, boss: !!def.boss,
      ranged: !!def.ranged, shotTimer: 1 + random() * 1.5,
      attackCd: 0, wobble: random() * 6.28, summonTimer: 6,
      hitFlash: 0,
    };
    state.enemies.push(enemy);
    if (def.boss) state.boss = enemy;
    return enemy;
  }

  function startWave(n) {
    state.wave = n;
    state.wavePhase = 'fighting';
    const comp = waveComp(n);
    const queue = [];
    for (const [kind, count] of Object.entries(comp)) {
      for (let i = 0; i < count; i += 1) queue.push(kind);
    }
    state.spawnQueue = shuffled(random, queue);
    const boss = waveBoss(n);
    if (boss) state.spawnQueue.unshift(boss);
    state.spawnTimer = 0.4;
    state.banner = boss === 'hollowKing' ? 'THE HOLLOW KING' : boss ? 'WAVE 5 — HOLLOW BRUTE' : `WAVE ${n}`;
    state.bannerTimer = 2.2;
  }

  function rollChoices() {
    const available = UPGRADES.filter((u) => (state.choicesTaken[u.id] || 0) < u.max);
    const pool = available.length >= 3 ? available : UPGRADES.filter((u) => (state.choicesTaken[u.id] || 0) < u.max + 2);
    state.choices = shuffled(random, pool).slice(0, 3);
  }

  function applyUpgrade(id) {
    const def = UPGRADES.find((u) => u.id === id);
    if (!def || !state.choices || !state.choices.some((c) => c.id === id)) return false;
    def.apply(state.player);
    // Lantern Oil writes to the world, not the player: apply it here as well.
    if (id === 'oil') state.lanternHp = Math.min(state.lanternMaxHp, state.lanternHp + 45);
    state.choicesTaken[id] = (state.choicesTaken[id] || 0) + 1;
    state.choices = null;
    state.pendingLevels -= 1;
    if (state.pendingLevels > 0) rollChoices();
    return true;
  }

  function killEnemy(enemy, index) {
    state.enemies.splice(index, 1);
    state.kills += 1;
    state.score += enemy.score;
    burst(enemy.x, enemy.y, enemy.glow, enemy.boss ? 46 : 12, enemy.boss ? 260 : 160);
    floatText(enemy.x, enemy.y - enemy.radius - 6, `+${enemy.score}`, '#ffe29a');
    for (let i = 0; i < enemy.xp; i += 1) {
      state.embers.push({ x: enemy.x + (random() - 0.5) * 30, y: enemy.y + (random() - 0.5) * 30, vx: (random() - 0.5) * 60, vy: (random() - 0.5) * 60, value: 1 });
    }
    const roll = random();
    if (enemy.boss) {
      state.pickups.push({ x: enemy.x - 30, y: enemy.y, kind: 'heart' });
      state.pickups.push({ x: enemy.x + 30, y: enemy.y, kind: 'oil' });
    } else if (roll < 0.05) {
      state.pickups.push({ x: enemy.x, y: enemy.y, kind: 'heart' });
    } else if (roll < 0.09) {
      state.pickups.push({ x: enemy.x, y: enemy.y, kind: 'oil' });
    }
    if (enemy.boss) {
      state.boss = null;
      state.shake = 0.6;
      if (enemy.kind === 'hollowKing') {
        state.over = { won: true, reason: 'The Hollow King is unmade. Dawn returns to the Hollow.' };
        return EVENT_WIN;
      }
    }
    return 0;
  }

  function damagePlayer(amount, fromX, fromY) {
    const p = state.player;
    if (p.invuln > 0 || p.dashTimer > 0 || state.over) return 0;
    p.hp -= amount;
    p.invuln = 0.9;
    state.shake = Math.max(state.shake, 0.35);
    burst(p.x, p.y, '#f87171', 10, 150);
    const dx = p.x - fromX, dy = p.y - fromY, len = Math.hypot(dx, dy) || 1;
    p.x = Math.min(FIELD.width - 20, Math.max(20, p.x + (dx / len) * 26));
    p.y = Math.min(FIELD.height - 20, Math.max(20, p.y + (dy / len) * 26));
    if (p.hp <= 0) {
      p.hp = 0;
      state.over = { won: false, reason: 'The Keeper has fallen. The dark closes in.' };
      return EVENT_OVER;
    }
    return EVENT_HIT;
  }

  function damageLantern(amount) {
    if (state.over) return 0;
    state.lanternHp -= amount;
    state.shake = Math.max(state.shake, 0.25);
    burst(LANTERN.x, LANTERN.y, '#ffb347', 8, 120);
    if (state.lanternHp <= 0) {
      state.lanternHp = 0;
      state.over = { won: false, reason: 'The Last Lantern went dark. The Hollow is silent.' };
      return EVENT_OVER;
    }
    return EVENT_LANTERN_HIT;
  }

  function fireNova() {
    const p = state.player;
    if (state.novaCd > 0 || state.over) return 0;
    state.novaCd = NOVA.cooldown;
    burst(p.x, p.y, '#7dd3fc', 40, 380);
    let events = EVENT_NOVA;
    for (let i = state.enemies.length - 1; i >= 0; i -= 1) {
      const e = state.enemies[i];
      if (dist(p.x, p.y, e.x, e.y) < NOVA.radius + e.radius) {
        e.hp -= NOVA.damage;
        e.hitFlash = 0.15;
        floatText(e.x, e.y - e.radius - 4, `${NOVA.damage}`, '#7dd3fc');
        if (e.hp <= 0) events |= killEnemy(e, i);
      }
    }
    return events;
  }

  function stepAttract(dt) {
    state.time += dt;
    if (state.enemies.length < 7 && random() < dt * 0.8) {
      const kinds = ['wisp', 'wisp', 'shade'];
      spawnEnemy(kinds[Math.floor(random() * kinds.length)]);
    }
    for (const e of state.enemies) {
      e.wobble += dt * 2;
      const tx = LANTERN.x, ty = LANTERN.y;
      const dx = tx - e.x, dy = ty - e.y, len = Math.hypot(dx, dy) || 1;
      const px = -dy / len, py = dx / len;
      e.x += (dx / len * e.speed * 0.4 + px * Math.sin(e.wobble) * 30) * dt;
      e.y += (dy / len * e.speed * 0.4 + py * Math.sin(e.wobble) * 30) * dt;
      if (dist(e.x, e.y, LANTERN.x, LANTERN.y) < LANTERN.radius + e.radius + 30) {
        e.x = LANTERN.x + (e.x - LANTERN.x) * 1.02;
        e.y = LANTERN.y + (e.y - LANTERN.y) * 1.02;
      }
    }
    updateFx(dt);
  }

  function updateFx(dt) {
    for (let i = state.particles.length - 1; i >= 0; i -= 1) {
      const pt = state.particles[i];
      pt.life -= dt;
      pt.x += pt.vx * dt; pt.y += pt.vy * dt;
      pt.vx *= 0.96; pt.vy *= 0.96;
      if (pt.life <= 0) state.particles.splice(i, 1);
    }
    for (let i = state.floats.length - 1; i >= 0; i -= 1) {
      const f = state.floats[i];
      f.life -= dt; f.y -= 34 * dt;
      if (f.life <= 0) state.floats.splice(i, 1);
    }
    if (state.shake > 0) state.shake = Math.max(0, state.shake - dt * 1.4);
    if (state.bannerTimer > 0) state.bannerTimer -= dt;
  }

  /** Advance the world one fixed step. `control` is {mx, my, aimX, aimY, nova, dash}. */
  function step(dt, control, attract) {
    if (attract) { stepAttract(dt); return 0; }
    if (state.over || state.choices) return 0; // frozen on end screens and level-up cards
    let events = 0;
    state.time += dt;
    const p = state.player;
    p.fireTimer -= dt; p.dashCd -= dt; p.invuln -= dt; state.novaCd -= dt;

    // --- waves ---
    if (state.wavePhase === 'intermission') {
      state.phaseTimer -= dt;
      if (state.phaseTimer <= 0) {
        const next = state.wave + 1;
        if (next > TOTAL_WAVES) { /* victory already handled by the boss kill */ }
        else { startWave(next); events |= EVENT_WAVE; }
      }
    } else {
      if (state.spawnQueue.length > 0) {
        state.spawnTimer -= dt;
        if (state.spawnTimer <= 0) {
          // Spawn in pairs when the queue is long, so fights stay dense instead of
          // trickling in one shade at a time while the Keeper waits.
          const burst = state.spawnQueue.length > 14 ? 2 : 1;
          for (let b = 0; b < burst && state.spawnQueue.length > 0; b += 1) spawnEnemy(state.spawnQueue.shift());
          state.spawnTimer = Math.max(0.3, 0.75 - state.wave * 0.04);
        }
      } else if (state.enemies.length === 0) {
        state.score += WAVE_CLEAR_BONUS(state.wave);
        floatText(LANTERN.x, LANTERN.y - 60, `WAVE ${state.wave} CLEAR  +${WAVE_CLEAR_BONUS(state.wave)}`, '#4ade80');
        state.wavePhase = 'intermission';
        state.phaseTimer = INTERMISSION;
        state.banner = state.wave >= TOTAL_WAVES ? '' : `WAVE ${state.wave + 1} INCOMING`;
        state.bannerTimer = 2.2;
      }
    }

    // --- player movement & dash ---
    if (control.dash && p.dashCd <= 0 && (control.mx !== 0 || control.my !== 0)) {
      p.dashTimer = PLAYER.dashTime;
      p.dashCd = p.dashCooldown;
      p.dashX = control.mx; p.dashY = control.my;
      burst(p.x, p.y, '#7dd3fc', 8, 120);
    }
    const speed = p.dashTimer > 0 ? p.speed * PLAYER.dashSpeed : p.speed;
    if (p.dashTimer > 0) {
      p.dashTimer -= dt;
      p.x += p.dashX * speed * dt;
      p.y += p.dashY * speed * dt;
    } else {
      p.x += control.mx * speed * dt;
      p.y += control.my * speed * dt;
    }
    p.x = Math.min(FIELD.width - 20, Math.max(20, p.x));
    p.y = Math.min(FIELD.height - 20, Math.max(20, p.y));
    p.aimX = control.aimX; p.aimY = control.aimY;
    if (control.nova) events |= fireNova();

    // --- auto-fire toward the aim point ---
    if (p.fireTimer <= 0 && !state.over) {
      p.fireTimer = p.fireInterval;
      const base = Math.atan2(p.aimY - p.y, p.aimX - p.x);
      const count = p.multishot;
      for (let i = 0; i < count; i += 1) {
        const spread = (i - (count - 1) / 2) * 0.14;
        const a = base + spread;
        state.bullets.push({
          x: p.x + Math.cos(a) * 22, y: p.y + Math.sin(a) * 22,
          vx: Math.cos(a) * p.bulletSpeed, vy: Math.sin(a) * p.bulletSpeed,
          damage: p.damage * state.shotBoost, pierce: p.pierce,
          crit: random() < p.critChance, life: 1.1,
        });
      }
    }

    // --- player bolts ---
    for (let i = state.bullets.length - 1; i >= 0; i -= 1) {
      const b = state.bullets[i];
      b.x += b.vx * dt; b.y += b.vy * dt; b.life -= dt;
      let dead = b.life <= 0 || b.x < 0 || b.x > FIELD.width || b.y < 0 || b.y > FIELD.height;
      if (!dead) {
        for (let j = state.enemies.length - 1; j >= 0; j -= 1) {
          const e = state.enemies[j];
          if (dist(b.x, b.y, e.x, e.y) < e.radius + 7) {
            const dmg = Math.round(b.damage * (b.crit ? 2 : 1));
            e.hp -= dmg;
            e.hitFlash = 0.12;
            floatText(e.x, e.y - e.radius - 4, b.crit ? `${dmg}!` : `${dmg}`, b.crit ? '#facc15' : '#ffe29a');
            burst(b.x, b.y, e.glow, 4, 110);
            if (e.hp <= 0) events |= killEnemy(e, j);
            if (b.pierce > 0) { b.pierce -= 1; }
            else { dead = true; }
            break;
          }
        }
      }
      if (dead) state.bullets.splice(i, 1);
      if (state.over) break;
    }
    if (events & EVENT_WIN || events & EVENT_OVER) { updateFx(dt); return events; }

    // --- enemies ---
    for (let i = state.enemies.length - 1; i >= 0; i -= 1) {
      const e = state.enemies[i];
      e.hitFlash -= dt; e.attackCd -= dt; e.wobble += dt * 2;
      const target = e.target === 'lantern'
        ? { x: LANTERN.x, y: LANTERN.y }
        : { x: p.x, y: p.y };
      const dx = target.x - e.x, dy = target.y - e.y;
      const len = Math.hypot(dx, dy) || 1;
      // Lantern light burns shades that stand in it.
      if (dist(e.x, e.y, LANTERN.x, LANTERN.y) < LANTERN.glowRadius && !e.boss) {
        e.hp -= LANTERN.burnDps * dt;
        if (e.hp <= 0) { events |= killEnemy(e, i); continue; }
      }
      if (e.ranged || e.boss) {
        // Keep a firing distance, strafe sideways, shoot aimed orbs.
        const want = e.boss ? 300 : 260;
        const d = dist(e.x, e.y, p.x, p.y);
        const toward = d > want + 30 ? 1 : d < want - 60 ? -1 : 0;
        const px = -dy / len, py = dx / len;
        const strafe = Math.sin(e.wobble * 0.7) > 0 ? 1 : -1;
        e.x += (dx / len * e.speed * toward + px * strafe * e.speed * 0.45) * dt;
        e.y += (dy / len * e.speed * toward + py * strafe * e.speed * 0.45) * dt;
        e.shotTimer -= dt;
        if (e.shotTimer <= 0 && d < 520) {
          e.shotTimer = ENEMIES[e.kind].shotInterval;
          const shots = e.kind === 'hollowKing' ? 8 : e.kind === 'hollowBrute' ? 3 : 1;
          for (let s = 0; s < shots; s += 1) {
            const a = shots === 1
              ? Math.atan2(p.y - e.y, p.x - e.x)
              : Math.atan2(p.y - e.y, p.x - e.x) + (s - (shots - 1) / 2) * 0.35;
            const sp = ENEMIES[e.kind].orbSpeed;
            state.orbs.push({ x: e.x, y: e.y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, damage: e.damage, life: 4, radius: 7 });
          }
          if (e.kind === 'hollowKing') burst(e.x, e.y, '#facc15', 10, 140);
        }
        if (e.kind === 'hollowKing') {
          e.summonTimer -= dt;
          if (e.summonTimer <= 0 && state.enemies.length < 26) {
            e.summonTimer = 7;
            spawnEnemy('wisp'); spawnEnemy('wisp');
            floatText(e.x, e.y - 60, 'THE KING CALLS', '#facc15');
          }
        }
      } else {
        // Chasers, with a sideways wobble so they never march in a straight line.
        const px = -dy / len, py = dx / len;
        const wob = e.kind === 'wisp' ? Math.sin(e.wobble * 2.2) * 55 : Math.sin(e.wobble) * 14;
        e.x += (dx / len * e.speed + px * wob) * dt;
        e.y += (dy / len * e.speed + py * wob) * dt;
      }
      e.x = Math.min(FIELD.width - 16, Math.max(16, e.x));
      e.y = Math.min(FIELD.height - 16, Math.max(16, e.y));
      // Contact with the Keeper.
      if (dist(e.x, e.y, p.x, p.y) < e.radius + p.radius - 2) {
        events |= damagePlayer(e.damage, e.x, e.y);
        const kx = (e.x - p.x) / (len || 1), ky = (e.y - p.y) / (len || 1);
        e.x += kx * 18; e.y += ky * 18;
        if (events & EVENT_OVER) { updateFx(dt); return events; }
      }
      // Contact with the Lantern (brutes and shades that chose it chew on it).
      if (e.target === 'lantern' && dist(e.x, e.y, LANTERN.x, LANTERN.y) < e.radius + LANTERN.radius) {
        if (e.attackCd <= 0) {
          e.attackCd = 0.9;
          events |= damageLantern(e.damage);
          const kx = (e.x - LANTERN.x) / (dist(e.x, e.y, LANTERN.x, LANTERN.y) || 1);
          const ky = (e.y - LANTERN.y) / (dist(e.x, e.y, LANTERN.x, LANTERN.y) || 1);
          e.x += kx * 22; e.y += ky * 22;
          if (events & EVENT_OVER) { updateFx(dt); return events; }
        }
      }
    }

    // --- enemy orbs ---
    for (let i = state.orbs.length - 1; i >= 0; i -= 1) {
      const o = state.orbs[i];
      o.x += o.vx * dt; o.y += o.vy * dt; o.life -= dt;
      let dead = o.life <= 0 || o.x < 0 || o.x > FIELD.width || o.y < 0 || o.y > FIELD.height;
      if (!dead && dist(o.x, o.y, p.x, p.y) < o.radius + p.radius - 2) {
        events |= damagePlayer(o.damage, o.x - o.vx * 0.05, o.y - o.vy * 0.05);
        dead = true;
        if (events & EVENT_OVER) { state.orbs.splice(i, 1); updateFx(dt); return events; }
      }
      if (!dead && dist(o.x, o.y, LANTERN.x, LANTERN.y) < o.radius + LANTERN.radius) {
        events |= damageLantern(Math.ceil(o.damage / 2));
        dead = true;
        if (events & EVENT_OVER) { state.orbs.splice(i, 1); updateFx(dt); return events; }
      }
      if (dead) state.orbs.splice(i, 1);
    }

    // --- embers (XP) drift, magnetise, collect ---
    for (let i = state.embers.length - 1; i >= 0; i -= 1) {
      const g = state.embers[i];
      g.x += g.vx * dt; g.y += g.vy * dt;
      g.vx *= 0.94; g.vy *= 0.94;
      const d = dist(g.x, g.y, p.x, p.y);
      if (d < p.magnet) {
        const pull = 520 * (1 - d / p.magnet) + 120;
        g.x += ((p.x - g.x) / (d || 1)) * pull * dt;
        g.y += ((p.y - g.y) / (d || 1)) * pull * dt;
      }
      if (d < 24) {
        state.embers.splice(i, 1);
        state.xp += g.value;
        state.score += 5;
        if (state.xp >= state.xpNext) {
          state.xp -= state.xpNext;
          state.level += 1;
          state.xpNext = XP_NEXT(state.level);
          state.pendingLevels += 1;
          rollChoices();
          events |= EVENT_LEVELUP;
          burst(p.x, p.y, '#c084fc', 22, 200);
        }
      }
    }

    // --- pickups ---
    for (let i = state.pickups.length - 1; i >= 0; i -= 1) {
      const pk = state.pickups[i];
      const d = dist(pk.x, pk.y, p.x, p.y);
      if (d < p.magnet * 0.7) {
        pk.x += ((p.x - pk.x) / (d || 1)) * 260 * dt;
        pk.y += ((p.y - pk.y) / (d || 1)) * 260 * dt;
      }
      if (d < 26) {
        state.pickups.splice(i, 1);
        if (pk.kind === 'heart') {
          p.hp = Math.min(p.maxHp, p.hp + 25);
          floatText(p.x, p.y - 30, '+25 HP', '#4ade80');
        } else {
          state.lanternHp = Math.min(state.lanternMaxHp, state.lanternHp + 20);
          floatText(LANTERN.x, LANTERN.y - 50, '+20 LANTERN', '#4ade80');
        }
      }
    }

    updateFx(dt);
    return events;
  }

  reset();
  return { state, reset, step, applyUpgrade, rollChoices };
}
