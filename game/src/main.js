// Boot and the one loop: input is read every frame, the world advances in fixed 1/60 s
// steps (several in a slow frame, none in a fast one), and the renderer paints what is
// there. Screens: title, play, level-up cards, paused, game over and victory.
//
// ?seed=N fixes the spawn pattern. ?shot=start|play|victory|end (with &seed=N) stages
// that scene instead of running the loop, paints it twice and sets window.__shotReady
// for a screenshot.
import { BEST_KEY, BEST_WAVE_KEY, STEP, TOTAL_WAVES } from './config.js';
import { createRandom } from './random.js';
import { createAudio } from './audio.js';
import { createWorld, EVENT_HIT, EVENT_OVER, EVENT_WIN, EVENT_LEVELUP, EVENT_WAVE, EVENT_LANTERN_HIT, EVENT_NOVA } from './world.js';
import { ACTION_CONFIRM, ACTION_PAUSE, ACTION_DASH, ACTION_NOVA, ACTION_MUTE, createInput } from './input.js';
import { createRenderer, SCREEN_OVER, SCREEN_PAUSED, SCREEN_PLAY, SCREEN_TITLE, SCREEN_LEVELUP, SCREEN_VICTORY } from './render.js';
import { stageShot } from './shots.js';

const MAX_FRAME = 0.25;

const params = new URLSearchParams(window.location.search);
const shot = params.get('shot');
const seedParam = Number.parseInt(params.get('seed') ?? '', 10);
const seed = Number.isInteger(seedParam) ? seedParam : Math.floor(Math.random() * 4294967296);

const canvas = document.getElementById('game');
const status = document.getElementById('status');
const world = createWorld(createRandom(seed));
const renderer = createRenderer(canvas);
const audio = createAudio();

function readBest(key) {
  try { return Number.parseInt(window.localStorage.getItem(key) ?? '0', 10) || 0; }
  catch { return 0; }
}
function saveBest(key, value) {
  try { window.localStorage.setItem(key, String(value)); }
  catch { /* Storage can be off: the best then lasts this visit only. */ }
}

function runShot(name) {
  const scene = stageShot(name, world);
  let painted = 0;
  function paint() {
    renderer.draw(world.state, scene.screen, scene.best, Math.max(1, world.state.wave), false);
    painted += 1;
    if (painted < 2) requestAnimationFrame(paint);
    else window.__shotReady = true;
  }
  requestAnimationFrame(paint);
}

function runGame() {
  const input = createInput(canvas);
  let screen = SCREEN_TITLE;
  let best = readBest(BEST_KEY);
  let bestWave = readBest(BEST_WAVE_KEY);
  let muted = false;
  let accumulator = 0;
  let last = performance.now();
  let novaQueued = false;
  let dashQueued = false;

  function announce(message) { status.textContent = message; }

  function startGame() {
    world.reset();
    accumulator = 0;
    novaQueued = false;
    dashQueued = false;
    input.takeActions();
    input.takeClicks();
    screen = SCREEN_PLAY;
    audio.unlock();
    audio.waveHorn();
    announce('Playing. Defend the Last Lantern. Survive to Wave 10 and slay the Hollow King.');
  }

  function finishRun() {
    if (world.state.score > best) { best = world.state.score; saveBest(BEST_KEY, best); }
    if (world.state.wave > bestWave) { bestWave = world.state.wave; saveBest(BEST_WAVE_KEY, bestWave); }
  }

  function endGame(won) {
    finishRun();
    screen = won ? SCREEN_VICTORY : SCREEN_OVER;
    if (won) { audio.victory(); announce(`Victory! Score ${world.state.score}. Best ${best}.`); }
    else { audio.gameOver(); announce(`Game over. Score ${world.state.score}. Best ${best}.`); }
  }

  // Card geometry, kept in step with render.js drawCards: 300x220 cards, 36 gap, y 250.
  function cardAt(x, y) {
    const choices = world.state.choices;
    if (!choices) return -1;
    const w = 300, h = 220, gap = 36;
    const x0 = 640 - (choices.length * w + (choices.length - 1) * gap) / 2;
    for (let i = 0; i < choices.length; i += 1) {
      const cx = x0 + i * (w + gap);
      if (x >= cx && x <= cx + w && y >= 250 && y <= 250 + h) return i;
    }
    return -1;
  }

  function pickCard(index) {
    const choices = world.state.choices;
    if (!choices || index < 0 || index >= choices.length) return;
    const name = choices[index].name;
    const id = choices[index].id;
    if (world.applyUpgrade(id)) {
      audio.levelup();
      announce(`Blessing chosen: ${name}.`);
      screen = SCREEN_PLAY;
    }
  }

  function handleInput() {
    const actions = input.takeActions();
    if (actions & ACTION_MUTE) {
      muted = audio.toggleMute();
      announce(muted ? 'Sound muted.' : 'Sound on.');
    }
    if (actions & ACTION_NOVA) novaQueued = true;
    if (actions & ACTION_DASH) dashQueued = true;
    const choice = input.takeChoice();
    const clicks = input.takeClicks();
    if (screen === SCREEN_TITLE) {
      if ((actions & ACTION_CONFIRM) || clicks.length > 0) { audio.click(); startGame(); }
    } else if (screen === SCREEN_OVER || screen === SCREEN_VICTORY) {
      if ((actions & ACTION_CONFIRM) || clicks.length > 0) { audio.click(); startGame(); }
    } else if (screen === SCREEN_LEVELUP) {
      if (choice >= 1 && choice <= 3) pickCard(choice - 1);
      else for (const c of clicks) {
        const hit = cardAt(c.x, c.y);
        if (hit >= 0) { pickCard(hit); break; }
      }
    } else if (screen === SCREEN_PLAY) {
      if (actions & ACTION_PAUSE) {
        screen = SCREEN_PAUSED;
        announce('Paused.');
      }
    } else if (screen === SCREEN_PAUSED) {
      if (actions & (ACTION_PAUSE | ACTION_CONFIRM)) {
        screen = SCREEN_PLAY;
        announce('Playing.');
      }
    }
    // A click that started the game must not also fire a nova on the first frame.
    if (screen !== SCREEN_PLAY) { novaQueued = false; dashQueued = false; }
  }

  function step() {
    if (screen === SCREEN_TITLE) {
      world.step(STEP, { mx: 0, my: 0, aimX: 640, aimY: 200, nova: false, dash: false }, true);
      return;
    }
    if (screen !== SCREEN_PLAY) return;
    const move = input.moveVector();
    const aim = input.aim();
    const control = {
      mx: move.x, my: move.y, aimX: aim.x, aimY: aim.y,
      nova: novaQueued, dash: dashQueued,
    };
    novaQueued = false;
    dashQueued = false;
    const events = world.step(STEP, control, false);
    if (events & EVENT_NOVA) audio.nova();
    if (events & EVENT_HIT) audio.hurt();
    if (events & EVENT_LANTERN_HIT) audio.lanternHurt();
    if (events & EVENT_WAVE) audio.waveHorn();
    if (events & EVENT_LEVELUP) {
      audio.levelup();
      screen = SCREEN_LEVELUP;
      announce(`Level ${world.state.level}! Choose a blessing: 1, 2 or 3.`);
    }
    if (events & EVENT_WIN) endGame(true);
    else if (events & EVENT_OVER) endGame(false);
    if (world.state.boss && world.state.wavePhase === 'fighting' && !world.state.over) {
      // Boss entrance sting, once per boss: the horn already sounded at wave start.
    }
  }

  function frame(now) {
    requestAnimationFrame(frame);
    accumulator += Math.min((now - last) / 1000, MAX_FRAME);
    last = now;
    handleInput();
    if (screen === SCREEN_TITLE || screen === SCREEN_PLAY) {
      let guard = 0;
      while (accumulator >= STEP && (screen === SCREEN_TITLE || screen === SCREEN_PLAY) && guard < 40) {
        step();
        accumulator -= STEP;
        guard += 1;
      }
      if (guard >= 40) accumulator = 0;
    } else {
      accumulator = 0;
    }
    renderer.draw(world.state, screen, best, bestWave, muted);
  }

  // Leaving the tab pauses a running game rather than letting shades feed unseen.
  document.addEventListener('visibilitychange', () => {
    if (document.hidden && screen === SCREEN_PLAY) {
      screen = SCREEN_PAUSED;
      announce('Paused.');
    }
  });
  // First gesture unlocks sound (and starts the quiet music loop).
  window.addEventListener('pointerdown', () => audio.unlock(), { once: true });
  window.addEventListener('keydown', () => audio.unlock(), { once: true });

  announce('Emberkeep. Press Enter or click to begin. Defend the Last Lantern.');
  requestAnimationFrame(frame);
}

if (shot) runShot(shot);
else runGame();
