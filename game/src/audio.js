// All sound is synthesised with WebAudio — no audio files, nothing to download.
// The context is created lazily on the first user gesture (browsers block audio before
// one); every call is guarded so the game plays silently, never crashes, when audio
// is unavailable (headless screenshots, muted tab, no gesture yet).
export function createAudio() {
  let ctx = null;
  let master = null;
  let muted = false;
  let musicTimer = null;
  let musicStep = 0;

  function ensure() {
    if (ctx || muted) return ctx;
    try {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return null;
      ctx = new AC();
      master = ctx.createGain();
      master.gain.value = 0.35;
      master.connect(ctx.destination);
    } catch {
      ctx = null;
    }
    return ctx;
  }

  function tone(freq, dur, type, vol, slideTo) {
    if (!ensure() || ctx.state !== 'running') return;
    try {
      const t0 = ctx.currentTime;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = type;
      osc.frequency.setValueAtTime(freq, t0);
      if (slideTo) osc.frequency.exponentialRampToValueAtTime(Math.max(20, slideTo), t0 + dur);
      gain.gain.setValueAtTime(vol, t0);
      gain.gain.exponentialRampToValueAtTime(0.001, t0 + dur);
      osc.connect(gain);
      gain.connect(master);
      osc.start(t0);
      osc.stop(t0 + dur + 0.02);
    } catch { /* sound is decoration; never break the game */ }
  }

  function noise(dur, vol, lowpass) {
    if (!ensure() || ctx.state !== 'running') return;
    try {
      const t0 = ctx.currentTime;
      const len = Math.max(1, Math.floor(ctx.sampleRate * dur));
      const buf = ctx.createBuffer(1, len, ctx.sampleRate);
      const data = buf.getChannelData(0);
      for (let i = 0; i < len; i += 1) data[i] = (Math.random() * 2 - 1) * (1 - i / len);
      const src = ctx.createBufferSource();
      src.buffer = buf;
      const filter = ctx.createBiquadFilter();
      filter.type = 'lowpass';
      filter.frequency.value = lowpass;
      const gain = ctx.createGain();
      gain.gain.setValueAtTime(vol, t0);
      gain.gain.exponentialRampToValueAtTime(0.001, t0 + dur);
      src.connect(filter); filter.connect(gain); gain.connect(master);
      src.start(t0);
    } catch { /* ignore */ }
  }

  // A slow, quiet lantern-lullaby: a minor arpeggio that steps every 0.42 s.
  const MELODY = [220, 261.6, 329.6, 392, 329.6, 261.6, 196, 246.9];
  function startMusic() {
    if (musicTimer || !ensure()) return;
    musicTimer = window.setInterval(() => {
      if (muted || !ctx || ctx.state !== 'running') return;
      const note = MELODY[musicStep % MELODY.length];
      tone(note, 0.5, 'sine', 0.05);
      if (musicStep % 4 === 0) tone(note / 2, 0.8, 'triangle', 0.04);
      musicStep += 1;
    }, 420);
  }

  return {
    unlock() { ensure(); if (ctx && ctx.state === 'suspended') ctx.resume().catch(() => {}); startMusic(); },
    toggleMute() {
      muted = !muted;
      if (master) master.gain.value = muted ? 0 : 0.35;
      return muted;
    },
    isMuted() { return muted; },
    shoot() { tone(720 + Math.random() * 120, 0.09, 'square', 0.05, 320); },
    hit() { noise(0.06, 0.08, 900); },
    enemyDie() { tone(340, 0.22, 'sawtooth', 0.07, 70); noise(0.12, 0.06, 700); },
    pickup() { tone(880, 0.1, 'sine', 0.06, 1320); },
    heal() { tone(523, 0.16, 'sine', 0.07, 784); tone(784, 0.2, 'sine', 0.05, 1046); },
    levelup() { [523, 659, 784, 1046].forEach((f, i) => window.setTimeout(() => tone(f, 0.22, 'triangle', 0.08), i * 70)); },
    waveHorn() { tone(196, 0.5, 'sawtooth', 0.09, 196); tone(294, 0.5, 'sawtooth', 0.06, 294); },
    bossRoar() { tone(90, 0.8, 'sawtooth', 0.12, 45); noise(0.5, 0.1, 300); },
    nova() { tone(180, 0.5, 'sine', 0.12, 900); noise(0.35, 0.1, 2400); },
    dash() { noise(0.14, 0.07, 3000); },
    hurt() { tone(140, 0.25, 'sawtooth', 0.1, 60); },
    lanternHurt() { tone(110, 0.3, 'square', 0.07, 55); },
    gameOver() { [392, 330, 262, 196].forEach((f, i) => window.setTimeout(() => tone(f, 0.4, 'triangle', 0.09), i * 180)); },
    victory() { [523, 659, 784, 1046, 1318].forEach((f, i) => window.setTimeout(() => tone(f, 0.35, 'triangle', 0.09), i * 120)); },
    click() { tone(660, 0.06, 'sine', 0.05); },
  };
}
