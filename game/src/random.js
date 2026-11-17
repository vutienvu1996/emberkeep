// A small seeded random generator (mulberry32): the same seed gives the same game,
// which is what makes the screenshot scenes repeatable frame for frame.
export function createRandom(seed) {
  let a = seed | 0;
  return function random() {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Pick an element of `items` with weights from `weight(item)`. */
export function weightedPick(random, items, weight) {
  let total = 0;
  for (const item of items) total += weight(item);
  let roll = random() * total;
  for (const item of items) {
    roll -= weight(item);
    if (roll <= 0) return item;
  }
  return items[items.length - 1];
}

/** A shuffled copy of `items`, using the seeded generator. */
export function shuffled(random, items) {
  const out = items.slice();
  for (let i = out.length - 1; i > 0; i -= 1) {
    const j = Math.floor(random() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}
