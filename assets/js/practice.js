import { t } from './i18n.js';
import * as speech from './speech.js';
import { SEEN_MS } from './stats.js';

const COMMIT_PX = 60;      // distance that counts as a deliberate swipe
const FLICK_PX = 24;       // a fast flick commits at a shorter distance
const FLICK_MS = 250;

/* ── highlighting ───────────────────────────────────────────────────
   The whole point of the app is to show which Hebrew word maps to which
   English word, so both sentences mark their target rather than implying it. */
function highlightInto(el, text, needle) {
  el.textContent = '';
  if (!needle) {
    el.textContent = text;
    return;
  }
  let index = text.indexOf(needle);
  if (index === -1) {
    // English inflects (build -> builds) and Hebrew takes prefixes (ספר -> הספר),
    // so fall back to a case-insensitive stem search before giving up.
    const lower = text.toLowerCase();
    index = lower.indexOf(needle.toLowerCase());
    if (index === -1) {
      const stem = needle.length > 3 ? needle.slice(0, -1) : needle;
      index = lower.indexOf(stem.toLowerCase());
      if (index !== -1) needle = text.slice(index, index + stem.length);
    }
  }
  if (index === -1) {
    el.textContent = text;
    return;
  }
  // Extend across the rest of the word so "builds" highlights whole, not "build".
  let end = index + needle.length;
  while (end < text.length && /[\p{L}]/u.test(text[end])) end++;

  el.append(text.slice(0, index));
  const mark = document.createElement('span');
  mark.className = 'hit';
  mark.textContent = text.slice(index, end);
  el.append(mark, text.slice(end));
}

const numberChip = (i) => {
  const chip = document.createElement('span');
  chip.className = 'sense-num';
  chip.textContent = String(i + 1);
  return chip;
};

export function createPractice({ store, stats, favorites, onWordPracticed, onFavoriteChange, onShuffle, toast }) {
  const stage = document.getElementById('card-stage');
  const card = document.getElementById('card');
  const front = card.querySelector('.card-front');
  const back = document.getElementById('card-back');
  const wordEl = document.getElementById('card-word');
  const sentencesEl = document.getElementById('card-sentences');
  const translationsEl = document.getElementById('card-translations');
  const chipEl = document.getElementById('card-senses-chip');
  const progressEl = document.getElementById('practice-progress');
  const deckEl = document.getElementById('practice-deck');
  const cueUp = stage.querySelector('.cue-up');
  const cueDown = stage.querySelector('.cue-down');
  const favBtn = document.getElementById('fav-toggle');
  const shuffleBtn = document.getElementById('shuffle-deck');

  let deck = [];
  let index = 0;
  let revealed = false;
  let seenTimer = null;
  let deckLabel = '';

  /* ── rendering ─────────────────────────────────────────────────── */
  function render() {
    const word = deck[index];
    if (!word) return;

    revealed = false;
    back.hidden = true;
    front.hidden = false;
    card.classList.toggle('multi', word.senses.length > 1);

    wordEl.textContent = word.en;
    chipEl.hidden = word.senses.length < 2;
    if (word.senses.length > 1) chipEl.textContent = t('practice.meanings', { n: word.senses.length });

    sentencesEl.textContent = '';
    word.senses.forEach((sense, i) => {
      const line = document.createElement('p');
      line.className = 'sentence';
      if (word.senses.length > 1) line.append(numberChip(i));
      const span = document.createElement('span');
      highlightInto(span, sense.sentence, word.en.replace(/\s*\(.*?\)\s*/g, ''));
      line.append(span);
      sentencesEl.append(line);
    });

    translationsEl.textContent = '';
    word.senses.forEach((sense, i) => {
      const block = document.createElement('div');

      const pos = document.createElement('div');
      pos.className = 'pos';
      pos.textContent = sense.pos;
      block.append(pos);

      const gloss = document.createElement('div');
      gloss.className = 'tr-word';
      if (word.senses.length > 1) gloss.append(numberChip(i));
      gloss.append(sense.he);
      block.append(gloss);

      const line = document.createElement('p');
      line.className = 'tr-sentence';
      highlightInto(line, sense.heSentence, sense.heWordInSentence ?? sense.he);
      block.append(line);

      translationsEl.append(block);
    });

    if (word.note) {
      const note = document.createElement('p');
      note.className = 'note';
      note.textContent = word.note[document.documentElement.lang] ?? word.note.he;
      translationsEl.append(note);
    }

    renderFavourite();

    progressEl.textContent = t('practice.of', { i: index + 1, n: deck.length });
    deckEl.textContent = deckLabel;
    store.set('position', { index, deckLabel });

    clearTimeout(seenTimer);
    seenTimer = setTimeout(() => countPracticed(), SEEN_MS);
  }

  function countPracticed() {
    const word = deck[index];
    if (!word) return;
    if (stats.markPracticed(word.id)) onWordPracticed(word);
  }

  function renderFavourite() {
    const word = deck[index];
    const starred = Boolean(word && favorites.has(word.id));
    favBtn.textContent = starred ? '★' : '☆';
    favBtn.classList.toggle('on', starred);
    favBtn.setAttribute('aria-pressed', String(starred));
  }

  function toggleFavourite() {
    const word = deck[index];
    if (!word) return;
    const starred = favorites.toggle(word.id);
    renderFavourite();
    toast(t(starred ? 'practice.favAdded' : 'practice.favRemoved'));
    onFavoriteChange?.();
  }

  /* ── actions ───────────────────────────────────────────────────── */
  function go(step) {
    if (!deck.length) return;
    const next = index + step;
    if (next < 0) {
      index = deck.length - 1;
    } else if (next >= deck.length) {
      index = 0;
      toast(t('practice.deckDone'));
    } else {
      index = next;
    }
    render();
  }

  function reveal() {
    const word = deck[index];
    if (!word) return;
    revealed = !revealed;
    back.hidden = !revealed;
    front.hidden = revealed;
    if (revealed) {
      stats.markReveal();
      countPracticed();
    }
  }

  function pronounce() {
    const word = deck[index];
    if (!word) return;
    speech.warmUp();
    if (speech.speak(word.en)) {
      stats.markSpeak();
      countPracticed();
    } else {
      toast(t('practice.speechUnavailable'));
    }
  }

  /* ── gestures ──────────────────────────────────────────────────── */
  let start = null;

  const setTransform = (dx, dy) => {
    card.style.transform = `translate(${dx}px, ${dy}px) rotate(${dx / 28}deg)`;
  };

  // The star sits on top of the card, which owns the gesture handlers — without
  // stopping propagation, tapping it would also start a swipe.
  favBtn.addEventListener('pointerdown', (e) => e.stopPropagation());
  favBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    stats.poke();
    toggleFavourite();
  });

  card.addEventListener('pointerdown', (e) => {
    if (e.button != null && e.button !== 0) return;
    start = { x: e.clientX, y: e.clientY, at: Date.now() };
    card.setPointerCapture?.(e.pointerId);
    card.classList.remove('animating');
    stats.poke();
  });

  card.addEventListener('pointermove', (e) => {
    if (!start) return;
    const dx = e.clientX - start.x;
    const dy = e.clientY - start.y;
    setTransform(dx, dy * 0.5);
    cueUp.classList.toggle('on', dy < -COMMIT_PX / 2 && Math.abs(dy) > Math.abs(dx));
    cueDown.classList.toggle('on', dy > COMMIT_PX / 2 && Math.abs(dy) > Math.abs(dx));
  });

  function endGesture(e) {
    if (!start) return;
    const dx = e.clientX - start.x;
    const dy = e.clientY - start.y;
    const quick = Date.now() - start.at < FLICK_MS;
    const threshold = quick ? FLICK_PX : COMMIT_PX;
    start = null;
    cueUp.classList.remove('on');
    cueDown.classList.remove('on');
    card.classList.add('animating');

    const horizontal = Math.abs(dx) > Math.abs(dy);
    if (horizontal && Math.abs(dx) > threshold) {
      // Fling the card off-screen in the swipe direction, then bring in the next.
      const out = dx > 0 ? window.innerWidth : -window.innerWidth;
      card.style.transform = `translate(${out}px, 0) rotate(${out / 28}deg)`;
      card.style.opacity = '0';
      setTimeout(() => {
        // RTL flips which side "forward" is on, so follow the document direction.
        const forward = document.documentElement.dir === 'rtl' ? dx < 0 : dx > 0;
        go(forward ? 1 : -1);
        card.classList.remove('animating');
        card.style.transform = '';
        card.style.opacity = '';
      }, 200);
      return;
    }

    card.style.transform = '';
    if (!horizontal && Math.abs(dy) > threshold) {
      if (dy < 0) pronounce();
      else reveal();
    }
  }

  card.addEventListener('pointerup', endGesture);
  card.addEventListener('pointercancel', () => {
    start = null;
    card.classList.add('animating');
    card.style.transform = '';
    cueUp.classList.remove('on');
    cueDown.classList.remove('on');
  });

  card.addEventListener('keydown', (e) => {
    const back = document.documentElement.dir === 'rtl' ? 'ArrowRight' : 'ArrowLeft';
    const fwd = document.documentElement.dir === 'rtl' ? 'ArrowLeft' : 'ArrowRight';
    if (e.key === fwd) go(1);
    else if (e.key === back) go(-1);
    else if (e.key === 'ArrowUp') pronounce();
    else if (e.key === 'ArrowDown' || e.key === ' ') reveal();
    else if (e.key === 'f' || e.key === 'F') toggleFavourite();
    else return;
    e.preventDefault();
    stats.poke();
  });

  document.querySelector('.pad').addEventListener('click', (e) => {
    const action = e.target.closest('[data-act]')?.dataset.act;
    if (!action) return;
    stats.poke();
    const rtl = document.documentElement.dir === 'rtl';
    if (action === 'next') go(1);
    else if (action === 'prev') go(-1);
    else if (action === 'speak') pronounce();
    else if (action === 'reveal') reveal();
    void rtl;
  });

  shuffleBtn.addEventListener('click', () => {
    stats.poke();
    onShuffle();
  });

  return {
    setDeck(words, label, { keepPosition = false } = {}) {
      deck = words;
      deckLabel = label;
      const saved = store.get('position', null);
      index = keepPosition && saved?.deckLabel === label && saved.index < words.length ? saved.index : 0;
      render();
    },
    // Reorder the deck in place and go back to the first card.
    reorder(words) {
      deck = words;
      index = 0;
      render();
    },
    refresh: render,
    refreshFavourite: renderFavourite,
    current: () => deck[index],
    size: () => deck.length,
  };
}
