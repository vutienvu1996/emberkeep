// Emberkeep's renderer: every pixel is drawn in code — no images, no fonts to load.
// One canvas at the fixed 1280x720 logical size; CSS scales it to the window. Screens:
// title, play, level-up cards, paused, game over and victory, each readable at a glance.
import { FIELD, LANTERN, NOVA, TOTAL_WAVES, PALETTE, FONT } from './config.js';

export const SCREEN_TITLE = 'title';
export const SCREEN_PLAY = 'play';
export const SCREEN_LEVELUP = 'levelup';
export const SCREEN_PAUSED = 'paused';
export const SCREEN_OVER = 'over';
export const SCREEN_VICTORY = 'victory';

function fmtTime(t) {
  const m = Math.floor(t / 60);
  const s = Math.floor(t % 60);
  return `${m}:${s < 10 ? '0' : ''}${s}`;
}

export function createRenderer(canvas) {
  canvas.width = FIELD.width;
  canvas.height = FIELD.height;
  const ctx = canvas.getContext('2d');

  function rr(x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  }

  function bar(x, y, w, h, frac, good, warn, bad, label) {
    ctx.fillStyle = 'rgba(0,0,0,0.55)';
    rr(x, y, w, h, h / 2); ctx.fill();
    const f = Math.max(0, Math.min(1, frac));
    ctx.fillStyle = f > 0.5 ? good : f > 0.25 ? warn : bad;
    if (f > 0.01) { rr(x + 2, y + 2, (w - 4) * f, h - 4, (h - 4) / 2); ctx.fill(); }
    ctx.strokeStyle = 'rgba(255,255,255,0.35)';
    ctx.lineWidth = 1;
    rr(x, y, w, h, h / 2); ctx.stroke();
    if (label) {
      ctx.fillStyle = PALETTE.text;
      ctx.font = `700 13px ${FONT}`;
      ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
      ctx.fillText(label, x + 8, y + h / 2 + 0.5);
    }
  }

  function drawBackground(state) {
    const g = ctx.createRadialGradient(640, 360, 60, 640, 360, 780);
    g.addColorStop(0, PALETTE.backdrop2);
    g.addColorStop(1, PALETTE.backdrop);
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, FIELD.width, FIELD.height);
    // Stars.
    for (const s of state.stars) {
      const a = 0.25 + 0.45 * (0.5 + 0.5 * Math.sin(state.time * 0.9 + s.tw));
      ctx.globalAlpha = a;
      ctx.fillStyle = '#d9d4ff';
      ctx.beginPath(); ctx.arc(s.x, s.y, s.r, 0, Math.PI * 2); ctx.fill();
    }
    ctx.globalAlpha = 1;
    // Arena floor: faint concentric rings and rune dots around the Lantern.
    ctx.strokeStyle = 'rgba(139,123,216,0.20)';
    ctx.lineWidth = 2;
    for (const r of [90, 170, 250, 330]) {
      ctx.beginPath(); ctx.arc(LANTERN.x, LANTERN.y, r, 0, Math.PI * 2); ctx.stroke();
    }
    ctx.strokeStyle = PALETTE.arenaEdge;
    ctx.lineWidth = 4;
    ctx.strokeRect(14, 14, FIELD.width - 28, FIELD.height - 28);
    // Lantern glow on the floor.
    const pulse = 1 + 0.05 * Math.sin(state.time * 2);
    const glow = ctx.createRadialGradient(LANTERN.x, LANTERN.y, 10, LANTERN.x, LANTERN.y, LANTERN.glowRadius * pulse);
    glow.addColorStop(0, 'rgba(255,159,28,0.28)');
    glow.addColorStop(1, 'rgba(255,159,28,0)');
    ctx.fillStyle = glow;
    ctx.fillRect(0, 0, FIELD.width, FIELD.height);
  }

  function drawLantern(state) {
    const hpFrac = state.lanternHp / state.lanternMaxHp;
    const flick = 0.85 + 0.15 * Math.sin(state.time * 7) * Math.sin(state.time * 3.1);
    const glow = ctx.createRadialGradient(LANTERN.x, LANTERN.y, 4, LANTERN.x, LANTERN.y, 60 * flick);
    glow.addColorStop(0, 'rgba(255,209,102,0.95)');
    glow.addColorStop(0.4, 'rgba(255,159,28,0.5)');
    glow.addColorStop(1, 'rgba(255,159,28,0)');
    ctx.fillStyle = glow;
    ctx.beginPath(); ctx.arc(LANTERN.x, LANTERN.y, 60 * flick, 0, Math.PI * 2); ctx.fill();
    // Post + hanging lantern.
    ctx.fillStyle = '#4a3f7a';
    ctx.fillRect(LANTERN.x - 4, LANTERN.y + 6, 8, 26);
    ctx.fillStyle = '#2c2450';
    rr(LANTERN.x - 16, LANTERN.y - 14, 32, 24, 6); ctx.fill();
    ctx.fillStyle = hpFrac > 0.25 ? PALETTE.lanternCore : '#f87171';
    ctx.beginPath(); ctx.arc(LANTERN.x, LANTERN.y - 2, 8 * flick, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#8b7bd8';
    ctx.fillRect(LANTERN.x - 10, LANTERN.y - 20, 20, 5);
    // Lantern HP ring.
    ctx.strokeStyle = 'rgba(255,255,255,0.25)';
    ctx.lineWidth = 3;
    ctx.beginPath(); ctx.arc(LANTERN.x, LANTERN.y, LANTERN.radius + 8, 0, Math.PI * 2); ctx.stroke();
    ctx.strokeStyle = hpFrac > 0.5 ? '#4ade80' : hpFrac > 0.25 ? '#facc15' : '#f87171';
    ctx.beginPath(); ctx.arc(LANTERN.x, LANTERN.y, LANTERN.radius + 8, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * hpFrac); ctx.stroke();
  }

  function drawEnemy(e) {
    ctx.save();
    ctx.translate(e.x, e.y);
    ctx.shadowColor = e.glow;
    ctx.shadowBlur = 14;
    ctx.fillStyle = e.color;
    ctx.strokeStyle = 'rgba(0,0,0,0.45)';
    ctx.lineWidth = 2;
    const r = e.radius;
    if (e.kind === 'wisp') {
      ctx.rotate(Math.sin(e.wobble * 3) * 0.3);
      ctx.beginPath();
      ctx.moveTo(0, -r); ctx.lineTo(r * 0.8, 0); ctx.lineTo(0, r); ctx.lineTo(-r * 0.8, 0);
      ctx.closePath(); ctx.fill(); ctx.stroke();
    } else if (e.kind === 'shade') {
      ctx.beginPath();
      ctx.arc(0, -r * 0.2, r * 0.95, Math.PI, 0);
      ctx.lineTo(r * 0.95, r * 0.7);
      ctx.quadraticCurveTo(r * 0.45, r * 0.3, 0, r * 0.8);
      ctx.quadraticCurveTo(-r * 0.45, r * 0.3, -r * 0.95, r * 0.7);
      ctx.closePath(); ctx.fill(); ctx.stroke();
      ctx.fillStyle = '#0b0a1a';
      ctx.beginPath(); ctx.arc(-r * 0.35, -r * 0.25, r * 0.16, 0, Math.PI * 2); ctx.fill();
      ctx.beginPath(); ctx.arc(r * 0.35, -r * 0.25, r * 0.16, 0, Math.PI * 2); ctx.fill();
    } else if (e.kind === 'spitter') {
      ctx.beginPath();
      for (let i = 0; i < 3; i += 1) {
        const a = -Math.PI / 2 + (i * Math.PI * 2) / 3;
        ctx.lineTo(Math.cos(a) * r, Math.sin(a) * r);
        const b = a + Math.PI / 3;
        ctx.lineTo(Math.cos(b) * r * 0.45, Math.sin(b) * r * 0.45);
      }
      ctx.closePath(); ctx.fill(); ctx.stroke();
      ctx.fillStyle = '#0b0a1a';
      ctx.beginPath(); ctx.arc(0, 0, r * 0.3, 0, Math.PI * 2); ctx.fill();
    } else if (e.kind === 'hollowKing') {
      ctx.beginPath(); ctx.arc(0, 0, r, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
      ctx.fillStyle = '#fff7cc';
      ctx.beginPath();
      ctx.moveTo(-r * 0.7, -r * 0.55); ctx.lineTo(-r * 0.35, -r * 1.25); ctx.lineTo(0, -r * 0.7);
      ctx.lineTo(r * 0.35, -r * 1.25); ctx.lineTo(r * 0.7, -r * 0.55);
      ctx.closePath(); ctx.fill();
      ctx.fillStyle = '#0b0a1a';
      ctx.beginPath(); ctx.arc(-r * 0.3, -r * 0.1, r * 0.12, 0, Math.PI * 2); ctx.fill();
      ctx.beginPath(); ctx.arc(r * 0.3, -r * 0.1, r * 0.12, 0, Math.PI * 2); ctx.fill();
    } else {
      // brute and hollowBrute: a cracked stone hulk.
      rr(-r, -r * 0.9, r * 2, r * 1.8, 8); ctx.fill(); ctx.stroke();
      ctx.strokeStyle = 'rgba(0,0,0,0.6)';
      ctx.beginPath(); ctx.moveTo(-r * 0.4, -r * 0.5); ctx.lineTo(0, 0); ctx.lineTo(-r * 0.2, r * 0.6); ctx.stroke();
      ctx.fillStyle = '#fff';
      ctx.beginPath(); ctx.arc(-r * 0.35, -r * 0.3, r * 0.12, 0, Math.PI * 2); ctx.fill();
      ctx.beginPath(); ctx.arc(r * 0.35, -r * 0.3, r * 0.12, 0, Math.PI * 2); ctx.fill();
    }
    ctx.restore();
    if (e.hitFlash > 0) {
      ctx.globalAlpha = 0.65;
      ctx.fillStyle = '#ffffff';
      ctx.beginPath(); ctx.arc(e.x, e.y, e.radius, 0, Math.PI * 2); ctx.fill();
      ctx.globalAlpha = 1;
    }
    if (e.boss || e.kind === 'brute') {
      const w = e.boss ? 120 : 46;
      bar(e.x - w / 2, e.y - e.radius - 16, w, 7, e.hp / e.maxHp, '#f87171', '#f87171', '#f87171');
    }
  }

  function drawPlayer(state) {
    const p = state.player;
    if (p.invuln > 0 && Math.floor(state.time * 14) % 2 === 0 && p.dashTimer <= 0) ctx.globalAlpha = 0.45;
    ctx.save();
    ctx.translate(p.x, p.y);
    // A gold ring on the floor so the Keeper always reads against the dark.
    ctx.strokeStyle = 'rgba(255,209,102,0.55)';
    ctx.lineWidth = 2;
    ctx.beginPath(); ctx.ellipse(0, p.radius * 0.9, p.radius + 6, (p.radius + 6) * 0.45, 0, 0, Math.PI * 2); ctx.stroke();
    ctx.shadowColor = PALETTE.playerGlow;
    ctx.shadowBlur = 16;
    // Cloak, bright enough to read at a glance.
    ctx.fillStyle = '#6b5ca8';
    ctx.beginPath();
    ctx.moveTo(0, -p.radius - 4);
    ctx.quadraticCurveTo(p.radius + 6, 0, p.radius * 0.7, p.radius);
    ctx.quadraticCurveTo(0, p.radius * 0.7, -p.radius * 0.7, p.radius);
    ctx.quadraticCurveTo(-p.radius - 6, 0, 0, -p.radius - 4);
    ctx.closePath(); ctx.fill();
    // Hood + face.
    ctx.fillStyle = PALETTE.player;
    ctx.beginPath(); ctx.arc(0, -4, 11, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#0b0a1a';
    ctx.beginPath(); ctx.arc(-3.5, -5, 1.8, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.arc(3.5, -5, 1.8, 0, Math.PI * 2); ctx.fill();
    // Hand lantern.
    const la = Math.atan2(p.aimY - p.y, p.aimX - p.x);
    ctx.fillStyle = '#ffd166';
    ctx.beginPath(); ctx.arc(Math.cos(la) * 18, Math.sin(la) * 18, 5, 0, Math.PI * 2); ctx.fill();
    ctx.restore();
    ctx.globalAlpha = 1;
    // Aim tick.
    ctx.strokeStyle = 'rgba(255,226,154,0.5)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(p.x + Math.cos(la) * 26, p.y + Math.sin(la) * 26);
    ctx.lineTo(p.x + Math.cos(la) * 36, p.y + Math.sin(la) * 36);
    ctx.stroke();
    // Dash cooldown ring.
    if (p.dashCd > 0) {
      ctx.strokeStyle = 'rgba(125,211,252,0.7)';
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.radius + 7, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * (1 - p.dashCd / p.dashCooldown));
      ctx.stroke();
    }
  }

  function drawHud(state, best, muted) {
    const p = state.player;
    ctx.textBaseline = 'top';
    // Top-left: Keeper HP and Lantern HP.
    bar(24, 22, 240, 20, p.hp / p.maxHp, PALETTE.hpGood, PALETTE.hpWarn, PALETTE.hpBad, `KEEPER  ${Math.ceil(p.hp)}/${p.maxHp}`);
    bar(24, 48, 240, 20, state.lanternHp / state.lanternMaxHp, PALETTE.hpGood, PALETTE.hpWarn, PALETTE.hpBad, `LANTERN  ${Math.ceil(state.lanternHp)}/${state.lanternMaxHp}`);
    // Top-centre: wave and boss.
    ctx.fillStyle = PALETTE.text;
    ctx.font = `800 22px ${FONT}`;
    ctx.textAlign = 'center'; ctx.textBaseline = 'top';
    ctx.fillText(state.wave === 0 ? 'GET READY' : `WAVE ${state.wave} / ${TOTAL_WAVES}`, 640, 20);
    if (state.boss) {
      ctx.font = `700 13px ${FONT}`;
      ctx.fillStyle = '#facc15';
      ctx.fillText(state.boss.kind === 'hollowKing' ? 'THE HOLLOW KING' : 'HOLLOW BRUTE', 640, 48);
      bar(520, 66, 240, 10, state.boss.hp / state.boss.maxHp, '#f87171', '#f87171', '#f87171');
    }
    // Top-right: score, kills, time, best.
    ctx.textAlign = 'right';
    ctx.textBaseline = 'top';
    ctx.font = `800 20px ${FONT}`;
    ctx.fillStyle = PALETTE.text;
    ctx.fillText(`SCORE ${state.score}`, 1256, 20);
    ctx.font = `600 14px ${FONT}`;
    ctx.fillStyle = PALETTE.muted;
    ctx.fillText(`KILLS ${state.kills}   TIME ${fmtTime(state.time)}   BEST ${Math.max(best, state.score)}`, 1256, 46);
    ctx.fillText(muted ? 'MUTED (M)' : 'M — SOUND', 1256, 66);
    // Bottom: XP bar and level.
    const xpFrac = state.xp / state.xpNext;
    bar(24, 688, 900, 14, xpFrac, PALETTE.xp, PALETTE.xp, PALETTE.xp, `LV ${state.level}   XP ${state.xp}/${state.xpNext}`);
    // Bottom-right: Nova and Dash readiness (kept clear of the canvas edge).
    ctx.textAlign = 'right';
    ctx.font = `700 14px ${FONT}`;
    ctx.fillStyle = state.novaCd <= 0 ? PALETTE.nova : PALETTE.muted;
    ctx.fillText(state.novaCd <= 0 ? 'NOVA READY — CLICK / F' : `NOVA ${state.novaCd.toFixed(1)}s`, 1256, 664);
    ctx.fillStyle = p.dashCd <= 0 ? '#7dd3fc' : PALETTE.muted;
    ctx.fillText(p.dashCd <= 0 ? 'DASH READY — SPACE' : `DASH ${Math.max(0, p.dashCd).toFixed(1)}s`, 1256, 686);
    // Wave banner.
    if (state.bannerTimer > 0 && state.banner) {
      ctx.globalAlpha = Math.min(1, state.bannerTimer);
      ctx.fillStyle = PALETTE.text;
      ctx.font = `800 44px ${FONT}`;
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.shadowColor = '#ff9f1c'; ctx.shadowBlur = 24;
      ctx.fillText(state.banner, 640, 180);
      ctx.shadowBlur = 0;
      ctx.globalAlpha = 1;
    }
  }

  function drawCards(state) {
    ctx.fillStyle = 'rgba(5,4,18,0.72)';
    ctx.fillRect(0, 0, FIELD.width, FIELD.height);
    ctx.textBaseline = 'top';
    ctx.fillStyle = PALETTE.text;
    ctx.font = `800 40px ${FONT}`;
    ctx.textAlign = 'center'; ctx.textBaseline = 'top';
    ctx.fillText(`LEVEL ${state.level} — CHOOSE A BLESSING`, 640, 110);
    ctx.font = `600 17px ${FONT}`;
    ctx.fillStyle = PALETTE.muted;
    ctx.fillText('Click a card, or press 1 / 2 / 3. The choice shapes the rest of the run.', 640, 162);
    const cards = state.choices || [];
    const w = 300, h = 220, gap = 36;
    const x0 = 640 - (cards.length * w + (cards.length - 1) * gap) / 2;
    cards.forEach((c, i) => {
      const x = x0 + i * (w + gap), y = 250;
      ctx.fillStyle = PALETTE.card;
      rr(x, y, w, h, 16); ctx.fill();
      ctx.strokeStyle = PALETTE.cardEdge;
      ctx.lineWidth = 2; rr(x, y, w, h, 16); ctx.stroke();
      ctx.fillStyle = '#facc15';
      ctx.font = `800 20px ${FONT}`;
      ctx.textAlign = 'center';
      ctx.fillText(`[${i + 1}]`, x + w / 2, y + 22);
      ctx.fillStyle = PALETTE.text;
      ctx.font = `800 24px ${FONT}`;
      ctx.fillText(c.name, x + w / 2, y + 58);
      ctx.fillStyle = PALETTE.muted;
      ctx.font = `600 17px ${FONT}`;
      const words = c.desc.split(' ');
      let line = '', ly = y + 108;
      for (const word of words) {
        if ((line + word).length > 22) { ctx.fillText(line.trim(), x + w / 2, ly); line = ''; ly += 24; }
        line += `${word} `;
      }
      ctx.fillText(line.trim(), x + w / 2, ly);
      const taken = state.choicesTaken[c.id] || 0;
      ctx.fillStyle = '#8b93a3';
      ctx.font = `600 13px ${FONT}`;
      ctx.fillText(taken > 0 ? `Owned x${taken}` : 'New blessing', x + w / 2, y + h - 28);
    });
  }

  function panel(x, y, w, h) {
    ctx.fillStyle = PALETTE.panel;
    rr(x, y, w, h, 18); ctx.fill();
    ctx.strokeStyle = PALETTE.panelEdge;
    ctx.lineWidth = 2; rr(x, y, w, h, 18); ctx.stroke();
  }

  function statLines(state, lines, y0) {
    // Label right-aligned, value left-aligned — never stacked on the same centre.
    ctx.textBaseline = 'top';
    lines.forEach(([label, value], i) => {
      const y = y0 + i * 34;
      ctx.font = `600 19px ${FONT}`;
      ctx.fillStyle = PALETTE.muted;
      ctx.textAlign = 'right';
      ctx.fillText(label, 612, y);
      ctx.font = `800 19px ${FONT}`;
      ctx.fillStyle = PALETTE.text;
      ctx.textAlign = 'left';
      ctx.fillText(value, 628, y);
    });
    ctx.textAlign = 'center';
  }

  function drawTitle(state, best, bestWave) {
    ctx.fillStyle = 'rgba(5,4,18,0.45)';
    ctx.fillRect(0, 0, FIELD.width, FIELD.height);
    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';
    ctx.shadowColor = '#ff9f1c'; ctx.shadowBlur = 30;
    ctx.fillStyle = '#ffd166';
    ctx.font = `800 84px ${FONT}`;
    ctx.fillText('EMBERKEEP', 640, 108);
    ctx.shadowBlur = 0;
    ctx.fillStyle = PALETTE.text;
    ctx.font = `700 26px ${FONT}`;
    ctx.fillText('Last Lantern of the Hollow', 640, 200);
    ctx.font = `600 18px ${FONT}`;
    ctx.fillStyle = PALETTE.muted;
    ctx.fillText('Shades swarm the dark. Guard the Last Lantern, slay the Hollow King on Wave 10,', 640, 246);
    ctx.fillText('and do not let the light go out.', 640, 272);
    panel(340, 320, 600, 168);
    ctx.fillStyle = PALETTE.text;
    ctx.font = `700 17px ${FONT}`;
    ctx.textAlign = 'left';
    const rows = [
      ['MOVE', 'WASD or Arrow keys'],
      ['AIM + FIRE', 'Mouse — bolts fly at your cursor, automatically'],
      ['NOVA BLAST', 'Click or F — a burst that clears everything near you'],
      ['DASH', 'Space — a quick, invulnerable dash'],
      ['PAUSE / SOUND', 'P to pause   •   M to mute'],
    ];
    rows.forEach(([k, v], i) => {
      ctx.fillStyle = '#facc15';
      ctx.fillText(k, 370, 348 + i * 30);
      ctx.fillStyle = PALETTE.text;
      ctx.fillText(v, 540, 348 + i * 30);
    });
    ctx.textAlign = 'center';
    ctx.font = `800 22px ${FONT}`;
    ctx.fillStyle = best > 0 ? PALETTE.text : PALETTE.muted;
    ctx.fillText(best > 0 ? `BEST SCORE ${best}  •  BEST WAVE ${bestWave} / ${TOTAL_WAVES}` : 'No runs yet — light your first lantern.', 640, 516);
    ctx.font = `800 24px ${FONT}`;
    ctx.fillStyle = Math.floor(state.time * 2) % 2 === 0 ? '#ffd166' : '#f5efe0';
    ctx.fillText('CLICK OR PRESS ENTER TO BEGIN', 640, 566);
    ctx.font = `600 14px ${FONT}`;
    ctx.fillStyle = PALETTE.muted;
    ctx.fillText('Level up to choose blessings • Embers are XP • The lantern light burns shades • Bosses on Waves 5 and 10', 640, 610);
  }

  function drawOver(state, best, bestWave) {
    ctx.fillStyle = 'rgba(8,4,16,0.78)';
    ctx.fillRect(0, 0, FIELD.width, FIELD.height);
    panel(320, 120, 640, 470);
    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';
    ctx.fillStyle = '#f87171';
    ctx.font = `800 52px ${FONT}`;
    ctx.fillText('THE LIGHT FADES', 640, 148);
    ctx.fillStyle = PALETTE.text;
    ctx.font = `600 19px ${FONT}`;
    ctx.fillText(state.over ? state.over.reason : '', 640, 218);
    statLines(state, [
      ['SCORE', `${state.score}`],
      ['WAVE REACHED', `${Math.max(1, state.wave)} / ${TOTAL_WAVES}`],
      ['SHADES SLAIN', `${state.kills}`],
      ['TIME SURVIVED', fmtTime(state.time)],
      ['BEST SCORE', `${Math.max(best, state.score)}   •   BEST WAVE ${Math.max(bestWave, state.wave)}`],
    ], 272);
    ctx.font = `800 23px ${FONT}`;
    ctx.fillStyle = Math.floor(state.time * 2) % 2 === 0 ? '#ffd166' : '#f5efe0';
    ctx.fillText('PRESS ENTER OR CLICK TO TRY AGAIN', 640, 522);
  }

  function drawVictory(state, best) {
    ctx.fillStyle = 'rgba(8,6,20,0.72)';
    ctx.fillRect(0, 0, FIELD.width, FIELD.height);
    panel(320, 100, 640, 510);
    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';
    ctx.shadowColor = '#ffd166'; ctx.shadowBlur = 26;
    ctx.fillStyle = '#ffd166';
    ctx.font = `800 54px ${FONT}`;
    ctx.fillText('DAWN RETURNS', 640, 126);
    ctx.shadowBlur = 0;
    ctx.fillStyle = PALETTE.text;
    ctx.font = `600 19px ${FONT}`;
    ctx.fillText(state.over ? state.over.reason : 'The Hollow King is unmade.', 640, 196);
    const stars = 1 + (state.lanternHp > state.lanternMaxHp * 0.5 ? 1 : 0) + (state.player.hp > 50 ? 1 : 0);
    ctx.font = '44px sans-serif';
    ctx.textBaseline = 'middle';
    for (let i = 0; i < 3; i += 1) {
      ctx.fillStyle = i < stars ? '#facc15' : 'rgba(255,255,255,0.22)';
      ctx.fillText('★', 640 + (i - 1) * 64, 258);
    }
    ctx.textBaseline = 'top';
    ctx.font = `600 15px ${FONT}`;
    ctx.fillStyle = PALETTE.muted;
    ctx.fillText(stars === 3 ? 'A flawless keeping — lantern and Keeper both standing strong.' : stars === 2 ? 'The dawn returns, though the keeping cost more than it should.' : 'The dawn returns — barely. The Hollow will test you again.', 640, 292);
    statLines(state, [
      ['FINAL SCORE', `${state.score}`],
      ['SHADES SLAIN', `${state.kills}`],
      ['TIME', fmtTime(state.time)],
      ['LEVEL REACHED', `${state.level}`],
      ['BEST SCORE', `${Math.max(best, state.score)}`],
    ], 330);
    ctx.font = `800 23px ${FONT}`;
    ctx.fillStyle = Math.floor(state.time * 2) % 2 === 0 ? '#ffd166' : '#f5efe0';
    ctx.fillText('PRESS ENTER OR CLICK TO PLAY AGAIN', 640, 556);
  }

  function drawPaused() {
    ctx.fillStyle = 'rgba(5,4,18,0.66)';
    ctx.fillRect(0, 0, FIELD.width, FIELD.height);
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = PALETTE.text;
    ctx.font = `800 48px ${FONT}`;
    ctx.fillText('PAUSED', 640, 320);
    ctx.font = `600 19px ${FONT}`;
    ctx.fillStyle = PALETTE.muted;
    ctx.fillText('Press P or Esc to keep fighting — the dark waits for no one.', 640, 372);
  }

  function draw(state, screen, best, bestWave, muted) {
    ctx.save();
    if (state.shake > 0) {
      ctx.translate((Math.random() - 0.5) * state.shake * 22, (Math.random() - 0.5) * state.shake * 22);
    }
    drawBackground(state);
    // World layer (also behind the title, where the attract mode drifts shades).
    for (const g of state.embers) {
      ctx.fillStyle = '#c084fc';
      ctx.shadowColor = '#a855f7'; ctx.shadowBlur = 10;
      ctx.beginPath(); ctx.arc(g.x, g.y, 5, 0, Math.PI * 2); ctx.fill();
      ctx.shadowBlur = 0;
    }
    for (const pk of state.pickups) {
      ctx.fillStyle = pk.kind === 'heart' ? '#4ade80' : '#ffd166';
      ctx.shadowColor = ctx.fillStyle; ctx.shadowBlur = 12;
      ctx.beginPath(); ctx.arc(pk.x, pk.y, 10, 0, Math.PI * 2); ctx.fill();
      ctx.shadowBlur = 0;
      ctx.fillStyle = '#0b0a1a';
      ctx.font = `800 13px ${FONT}`;
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText(pk.kind === 'heart' ? '+' : '◉', pk.x, pk.y + 0.5);
    }
    drawLantern(state);
    for (const e of state.enemies) drawEnemy(e);
    for (const o of state.orbs) {
      ctx.fillStyle = '#fb7185';
      ctx.shadowColor = '#e11d48'; ctx.shadowBlur = 12;
      ctx.beginPath(); ctx.arc(o.x, o.y, o.radius, 0, Math.PI * 2); ctx.fill();
      ctx.shadowBlur = 0;
    }
    for (const b of state.bullets) {
      ctx.fillStyle = PALETTE.bullet;
      ctx.shadowColor = '#ff9f1c'; ctx.shadowBlur = 10;
      ctx.beginPath(); ctx.arc(b.x, b.y, b.crit ? 8 : 6, 0, Math.PI * 2); ctx.fill();
      ctx.shadowBlur = 0;
    }
    if (screen !== SCREEN_TITLE) drawPlayer(state);
    for (const pt of state.particles) {
      ctx.globalAlpha = Math.max(0, pt.life / pt.maxLife);
      ctx.fillStyle = pt.color;
      ctx.beginPath(); ctx.arc(pt.x, pt.y, pt.size, 0, Math.PI * 2); ctx.fill();
    }
    ctx.globalAlpha = 1;
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    for (const f of state.floats) {
      ctx.globalAlpha = Math.min(1, f.life / 0.5);
      ctx.fillStyle = f.color;
      ctx.font = `800 15px ${FONT}`;
      ctx.fillText(f.text, f.x, f.y);
    }
    ctx.globalAlpha = 1;
    ctx.restore();

    if (screen === SCREEN_TITLE) drawTitle(state, best, bestWave);
    else if (screen === SCREEN_LEVELUP) { drawHud(state, best, muted); drawCards(state); }
    else if (screen === SCREEN_PAUSED) { drawHud(state, best, muted); drawPaused(); }
    else if (screen === SCREEN_OVER) drawOver(state, best, bestWave);
    else if (screen === SCREEN_VICTORY) drawVictory(state, best);
    else drawHud(state, best, muted);
  }

  return { draw };
}
