// Word loading + deck ordering.
const FILES = ['a-b', 'c-d', 'e-g', 'h-l', 'm-p', 'q-s', 't-z'];

let cache = null;

export async function loadWords() {
  if (cache) return cache;
  const groups = await Promise.all(
    FILES.map(async (name) => {
      const res = await fetch(`data/words-${name}.json`);
      if (!res.ok) throw new Error(`could not load words-${name}.json`);
      return res.json();
    })
  );

  const words = [];
  for (const group of groups) {
    for (const word of group.words) {
      words.push({
        ...word,
        group: group.group,
        id: word.id ?? word.en.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, ''),
      });
    }
  }
  cache = { words, groups: groups.map((g) => ({ group: g.group, count: g.words.length })) };
  return cache;
}

export const byId = (words) => new Map(words.map((w) => [w.id, w]));

/* ── deterministic shuffle ──────────────────────────────────────────
   The order is randomized per login, but a mid-session refresh must not
   reshuffle and lose her place — so the order comes from a stored seed. */
function mulberry32(seed) {
  return function () {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function shuffle(items, seed) {
  const random = mulberry32(seed);
  const out = items.slice();
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

export const newSeed = () => (crypto.getRandomValues(new Uint32Array(1))[0] || Date.now()) >>> 0;

export function filterDeck(words, group) {
  return group === 'all' ? words.slice() : words.filter((w) => w.group === group);
}
