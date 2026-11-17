// Keyboard and pointer input. Held keys steer; one-shot presses (start, pause, dash,
// nova, mute, upgrade choice) are queued as bit flags and taken once by the loop, so a
// press between two frames is never lost and never counted twice. Mouse position is kept
// in logical field coordinates (the canvas is scaled to the window).
export const ACTION_CONFIRM = 1;
export const ACTION_PAUSE = 2;
export const ACTION_DASH = 4;
export const ACTION_NOVA = 8;
export const ACTION_MUTE = 16;

const UP = new Set(['ArrowUp', 'KeyW']);
const DOWN = new Set(['ArrowDown', 'KeyS']);
const LEFT = new Set(['ArrowLeft', 'KeyA']);
const RIGHT = new Set(['ArrowRight', 'KeyD']);
const CONFIRM = new Set(['Enter']);
const PAUSE = new Set(['KeyP', 'Escape']);
const DASH = new Set(['Space', 'ShiftLeft', 'ShiftRight']);
const MUTE = new Set(['KeyM']);

export function createInput(canvas) {
  const keys = { up: false, down: false, left: false, right: false };
  let actions = 0;
  let choice = 0; // 1, 2 or 3 when the player picks an upgrade card
  let mouseX = 640;
  let mouseY = 200;
  let mouseDown = false;
  const clicks = []; // {x, y} in logical coordinates, consumed once by the loop

  function toLogical(event) {
    const rect = canvas.getBoundingClientRect();
    const scale = Math.min(rect.width / 1280, rect.height / 720);
    const ox = (rect.width - 1280 * scale) / 2;
    const oy = (rect.height - 720 * scale) / 2;
    return {
      x: (event.clientX - rect.left - ox) / scale,
      y: (event.clientY - rect.top - oy) / scale,
    };
  }

  window.addEventListener('keydown', (event) => {
    if (UP.has(event.code)) keys.up = true;
    else if (DOWN.has(event.code)) keys.down = true;
    else if (LEFT.has(event.code)) keys.left = true;
    else if (RIGHT.has(event.code)) keys.right = true;
    else if (CONFIRM.has(event.code)) { if (!event.repeat) actions |= ACTION_CONFIRM; }
    else if (PAUSE.has(event.code)) { if (!event.repeat) actions |= ACTION_PAUSE; }
    else if (DASH.has(event.code)) { if (!event.repeat) actions |= ACTION_DASH; }
    else if (MUTE.has(event.code)) { if (!event.repeat) actions |= ACTION_MUTE; }
    else if (event.code === 'Digit1') choice = 1;
    else if (event.code === 'Digit2') choice = 2;
    else if (event.code === 'Digit3') choice = 3;
    else if (event.code === 'KeyF') { if (!event.repeat) actions |= ACTION_NOVA; }
    else return;
    event.preventDefault();
  });
  window.addEventListener('keyup', (event) => {
    if (UP.has(event.code)) keys.up = false;
    else if (DOWN.has(event.code)) keys.down = false;
    else if (LEFT.has(event.code)) keys.left = false;
    else if (RIGHT.has(event.code)) keys.right = false;
  });
  // A key released while the tab is hidden never sends keyup: let go on blur.
  window.addEventListener('blur', () => {
    keys.up = keys.down = keys.left = keys.right = false;
    mouseDown = false;
  });
  canvas.addEventListener('pointermove', (event) => {
    const p = toLogical(event);
    mouseX = p.x; mouseY = p.y;
  });
  canvas.addEventListener('pointerdown', (event) => {
    const p = toLogical(event);
    mouseX = p.x; mouseY = p.y;
    mouseDown = true;
    clicks.push({ x: p.x, y: p.y });
    if (event.button === 0) actions |= ACTION_NOVA;
    event.preventDefault();
  });
  window.addEventListener('pointerup', () => { mouseDown = false; });

  return {
    /** Normalised steering vector from held keys (length 0 or 1). */
    moveVector() {
      const x = (keys.right ? 1 : 0) - (keys.left ? 1 : 0);
      const y = (keys.down ? 1 : 0) - (keys.up ? 1 : 0);
      if (x === 0 && y === 0) return { x: 0, y: 0 };
      const len = Math.hypot(x, y);
      return { x: x / len, y: y / len };
    },
    aim() { return { x: mouseX, y: mouseY }; },
    isMouseDown() { return mouseDown; },
    takeActions() { const taken = actions; actions = 0; return taken; },
    takeChoice() { const taken = choice; choice = 0; return taken; },
    takeClicks() { return clicks.splice(0, clicks.length); },
  };
}
