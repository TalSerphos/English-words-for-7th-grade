import { t, setLang, currentLang, applyStatic } from './i18n.js';
import { app as appStore, storeFor } from './store.js';
import * as auth from './auth.js';
import { loadWords, shuffle, newSeed, filterDeck } from './deck.js';
import { createStats, todayKey } from './stats.js';
import { createSettings } from './settings.js';
import { createFavorites } from './favorites.js';
import { createPractice } from './practice.js';
import { buildQuiz, createQuiz } from './quiz.js';
import { evaluate, allAwards, describe } from './awards.js';

const $ = (id) => document.getElementById(id);

const appEl = $('app');
const authEl = $('auth');
const toastEl = $('toast');

let words = [];
let groups = [];
let store = null;
let stats = null;
let settings = null;
let favorites = null;
let practice = null;
let quiz = null;
let quizBuffer = [];
let selectedGroup = 'all';
let currentView = 'home';

/* ── small helpers ──────────────────────────────────────────────── */
let toastTimer = null;
function toast(message) {
  toastEl.textContent = message;
  toastEl.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => {
    toastEl.hidden = true;
  }, 2600);
}

const minutes = (seconds) => Math.round(seconds / 60);

/* ── confetti ───────────────────────────────────────────────────── */
function confetti() {
  const canvas = $('confetti');
  const ctx = canvas.getContext('2d');
  canvas.hidden = false;
  canvas.width = innerWidth;
  canvas.height = innerHeight;
  const colors = ['#7c5cff', '#b06bff', '#34d399', '#fbbf24', '#fb7185'];
  const bits = Array.from({ length: 110 }, () => ({
    x: Math.random() * canvas.width,
    y: -20 - Math.random() * canvas.height * 0.5,
    r: 4 + Math.random() * 6,
    vx: -1.5 + Math.random() * 3,
    vy: 2 + Math.random() * 4,
    spin: Math.random() * Math.PI,
    color: colors[(Math.random() * colors.length) | 0],
  }));

  let frames = 0;
  (function draw() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    for (const bit of bits) {
      bit.x += bit.vx;
      bit.y += bit.vy;
      bit.spin += 0.1;
      ctx.save();
      ctx.translate(bit.x, bit.y);
      ctx.rotate(bit.spin);
      ctx.fillStyle = bit.color;
      ctx.fillRect(-bit.r / 2, -bit.r / 2, bit.r, bit.r * 0.6);
      ctx.restore();
    }
    if (++frames < 190) requestAnimationFrame(draw);
    else canvas.hidden = true;
  })();
}

/* ── awards ─────────────────────────────────────────────────────── */
let awardQueue = [];

function showNextAward() {
  const award = awardQueue.shift();
  const pop = $('award-pop');
  if (!award) {
    pop.hidden = true;
    return;
  }
  const { title, desc, icon } = describe(award, currentLang());
  $('award-pop-icon').textContent = icon;
  $('award-pop-title').textContent = title;
  $('award-pop-desc').textContent = desc;
  pop.hidden = false;
  confetti();
}

function checkAwards(extra = {}) {
  const summary = stats.summary();
  const { fresh } = evaluate(store, summary, {
    goalMinutes: settings.get('goalMinutes'),
    goalWords: settings.get('goalWords'),
    hour: new Date().getHours(),
    comeback: false,
    ...extra,
  });
  if (fresh.length) {
    awardQueue.push(...fresh);
    if ($('award-pop').hidden) showNextAward();
  }
}

/* ── views ──────────────────────────────────────────────────────── */
function showView(name) {
  currentView = name;
  document.querySelectorAll('.view').forEach((view) => {
    view.classList.toggle('active', view.id === `view-${name}`);
  });
  document.querySelectorAll('#tabbar .tab').forEach((tab) => {
    tab.classList.toggle('active', tab.dataset.view === name);
  });
  $('topbar-title').textContent =
    name === 'home' ? t('app.title') : t(`nav.${name === 'quiz' ? 'practice' : name}`);

  if (name === 'home') renderHome();
  if (name === 'stats') renderStats();
  if (name === 'settings') renderSettings();
  if (name === 'practice') stats.startClock();
  else if (name !== 'quiz') stats.stopClock();
}

/* ── home ───────────────────────────────────────────────────────── */
function renderHome() {
  const summary = stats.summary();
  const user = auth.currentUser();
  $('home-greeting').textContent = t('home.greeting', { name: user?.displayName ?? '' });
  $('home-streak').textContent = summary.streak;
  $('home-today-min').textContent = minutes(summary.todaySeconds);
  $('home-today-words').textContent = summary.todayWords;

  const goalPct = Math.min(
    1,
    Math.max(
      summary.todaySeconds / (settings.get('goalMinutes') * 60),
      summary.todayWords / settings.get('goalWords')
    )
  );
  const circumference = 2 * Math.PI * 52;
  $('goal-ring-fg').style.strokeDasharray = `${goalPct * circumference} ${circumference}`;
  $('goal-pct').textContent = `${Math.round(goalPct * 100)}%`;

  const list = $('deck-list');
  list.textContent = '';
  for (const deck of deckOptions()) {
    const button = document.createElement('button');
    button.className = `deck${deck.group === selectedGroup ? ' selected' : ''}${deck.special ? ' special' : ''}`;
    const name = document.createElement('b');
    name.textContent = deck.label;
    const count = document.createElement('small');
    count.textContent = deck.count === 1 ? t('home.wordsCountOne') : t('home.wordsCount', { n: deck.count });
    button.append(name, count);
    button.disabled = deck.count === 0;
    button.addEventListener('click', () => {
      selectedGroup = deck.group;
      renderHome();
    });
    list.append(button);
  }
}

// The letter decks plus the two curated ones. Both curated decks are always
// listed (disabled when empty) so she knows they exist before filling them.
function deckOptions() {
  return [
    { group: 'all', label: t('home.allWords'), count: words.length },
    { group: 'failed', label: t('home.failedDeck'), count: stats.failedCount(), special: true },
    { group: 'favorites', label: t('home.favoritesDeck'), count: favorites.count(), special: true },
    ...groups.map((g) => ({ group: g.group, label: g.group, count: g.count })),
  ];
}

function wordsInDeck(group) {
  if (group === 'failed') {
    const index = new Map(words.map((w) => [w.id, w]));
    return stats.failedWords().map((f) => index.get(f.id)).filter(Boolean);
  }
  if (group === 'favorites') {
    const wanted = new Set(favorites.ids());
    return words.filter((w) => wanted.has(w.id));
  }
  return filterDeck(words, group);
}

function deckLabelFor(group) {
  return deckOptions().find((d) => d.group === group)?.label ?? group;
}

function startPractice(customWords, label) {
  const pool = customWords ?? wordsInDeck(selectedGroup);
  if (!pool.length) {
    toast(t('home.emptyDeck'));
    return;
  }
  const deck = customWords ?? shuffle(pool, currentSeed());
  practice.setDeck(deck, label ?? deckLabelFor(selectedGroup), { keepPosition: !customWords });
  showView('practice');
}

// One seed per profile per day: a reload keeps her place, but a new day deals a
// new order. Without this, "stay signed in" meant the same order forever.
function currentSeed() {
  const saved = store.get('seed', null);
  if (saved && saved.day === todayKey()) return saved.value;
  return resetSeed();
}

function resetSeed() {
  const value = newSeed();
  store.set('seed', { value, day: todayKey() });
  return value;
}

// Manual reshuffle: new order for every deck, starting from the first card.
function shuffleAll() {
  resetSeed();
  store.remove('position');
  if (currentView === 'practice') {
    const pool = wordsInDeck(selectedGroup);
    if (pool.length) practice.reorder(shuffle(pool, currentSeed()));
  }
  toast(t('home.shuffled'));
}

/* ── quiz flow ──────────────────────────────────────────────────── */
function onWordPracticed(word) {
  if (!quizBuffer.some((w) => w.id === word.id)) quizBuffer.push(word);
  store.set('quizBuffer', quizBuffer.map((w) => w.id));
  checkAwards();

  if (quizBuffer.length >= settings.get('wordsBeforeQuiz')) offerQuiz();
}

function offerQuiz() {
  const sheet = $('quiz-offer');
  if (!sheet.hidden || currentView !== 'practice') return;
  const length = settings.effectiveQuizLength(quizBuffer.length);
  $('quiz-offer-title').textContent = t('quiz.offerTitle', { n: quizBuffer.length });
  $('quiz-offer-body').textContent = t('quiz.offerBody', { q: length });
  sheet.hidden = false;
}

function beginQuiz() {
  const questions = buildQuiz(quizBuffer, words, {
    quizLength: settings.effectiveQuizLength(quizBuffer.length),
    answerOptions: settings.effectiveOptions(quizBuffer.length),
  });
  quizBuffer = [];
  store.set('quizBuffer', []);
  quiz.start(questions);
  showView('quiz');
  stats.startClock();
}

/* ── stats ──────────────────────────────────────────────────────── */
// "none" would stretch bars and dots into distorted pills on a wide screen.
function svg(children, viewBox = '0 0 300 120') {
  return `<svg viewBox="${viewBox}" preserveAspectRatio="xMidYMid meet" role="img">${children}</svg>`;
}

function renderStats() {
  const summary = stats.summary();

  $('level-num').textContent = summary.level;
  $('level-xp').textContent = t('stats.xp', { cur: summary.xpIntoLevel, next: 100 });
  $('xp-fill').style.width = `${summary.xpIntoLevel}%`;

  const cells = [
    [minutes(summary.totalSeconds), t('stats.totalMinutes')],
    [summary.uniqueWords, t('stats.totalWords')],
    [summary.longestStreak, t('stats.longestStreak')],
    [summary.quizzes, t('stats.quizzes')],
    [`${Math.round(summary.accuracy * 100)}%`, t('stats.accuracy')],
    [`${summary.uniqueWords}/${words.length}`, t('stats.uniqueOf', { n: words.length })],
  ];
  const grid = $('stat-grid');
  grid.textContent = '';
  for (const [value, label] of cells) {
    const box = document.createElement('div');
    box.className = 'stat';
    const b = document.createElement('b');
    b.textContent = value;
    const span = document.createElement('span');
    span.textContent = label;
    box.append(b, span);
    grid.append(box);
  }

  // 7-day minutes bar chart
  const week = stats.lastDays(7);
  const peak = Math.max(1, ...week.map((d) => d.seconds / 60));
  const bars = week
    .map((d, i) => {
      const height = Math.max(2, (d.seconds / 60 / peak) * 84);
      const x = i * 42 + 8;
      const label = new Date(`${d.key}T00:00:00`).toLocaleDateString(currentLang(), { weekday: 'narrow' });
      return `<rect class="bar${d.seconds ? '' : ' dim'}" x="${x}" y="${96 - height}" width="26" height="${height}" rx="6"></rect>
              <text x="${x + 13}" y="112" text-anchor="middle">${label}</text>
              <text x="${x + 13}" y="${88 - height}" text-anchor="middle">${minutes(d.seconds) || ''}</text>`;
    })
    .join('');
  $('chart-week').innerHTML = svg(bars);

  // quiz accuracy trend
  const history = summary.quizHistory.slice(-10);
  if (history.length < 2) {
    $('chart-quiz').textContent = t('stats.noQuizzes');
  } else {
    const step = 280 / (history.length - 1);
    const points = history.map((q, i) => [10 + i * step, 100 - q.pct * 84]);
    const path = points.map(([x, y], i) => `${i ? 'L' : 'M'}${x.toFixed(1)},${y.toFixed(1)}`).join(' ');
    const dots = points.map(([x, y]) => `<circle class="dot" cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="3"></circle>`).join('');
    $('chart-quiz').innerHTML = svg(`<path class="line" d="${path}"></path>${dots}`);
  }

  // words to review
  const review = $('review-list');
  review.textContent = '';
  const trouble = stats.troubleWords();
  if (!trouble.length) {
    review.textContent = t('stats.noReview');
  } else {
    const index = new Map(words.map((w) => [w.id, w]));
    const needed = settings.get('successesToClear');
    for (const { id, misses, successes } of trouble) {
      const word = index.get(id);
      if (!word) continue;
      const row = document.createElement('div');
      row.className = 'review-row';
      const en = document.createElement('b');
      en.textContent = word.en;
      const he = document.createElement('span');
      he.textContent = word.senses[0].he;
      const count = document.createElement('span');
      count.className = 'miss';
      // Show how close the word is to clearing, not just how often it was missed.
      count.textContent =
        successes > 0
          ? t('stats.needsMore', { n: Math.max(1, needed - successes) })
          : t('stats.missedTimes', { n: misses });
      row.append(en, he, count);
      review.append(row);
    }

    const practiceFailed = document.createElement('button');
    practiceFailed.className = 'ghost';
    practiceFailed.textContent = t('stats.practiceFailed');
    practiceFailed.addEventListener('click', () => {
      selectedGroup = 'failed';
      startPractice();
    });
    review.append(practiceFailed);
  }

  // awards
  const unlocked = new Set(store.get('awards', []));
  const awardsGrid = $('awards-grid');
  awardsGrid.textContent = '';
  for (const award of allAwards()) {
    const { title, desc, icon } = describe(award, currentLang());
    const box = document.createElement('div');
    box.className = `award${unlocked.has(award.id) ? ' unlocked' : ''}`;
    const ico = document.createElement('div');
    ico.className = 'ico';
    ico.textContent = icon;
    const name = document.createElement('b');
    name.textContent = title;
    const note = document.createElement('small');
    note.textContent = desc;
    box.append(ico, name, note);
    awardsGrid.append(box);
  }
}

/* ── settings ───────────────────────────────────────────────────── */
const SETTING_FIELDS = {
  'set-words-before-quiz': 'wordsBeforeQuiz',
  'set-answer-options': 'answerOptions',
  'set-quiz-length': 'quizLength',
  'set-successes-to-clear': 'successesToClear',
  'set-goal-minutes': 'goalMinutes',
  'set-goal-words': 'goalWords',
};

function renderSettings() {
  const values = settings.all();
  for (const [id, key] of Object.entries(SETTING_FIELDS)) $(id).value = values[key];
}

function wireSettings() {
  for (const [id, key] of Object.entries(SETTING_FIELDS)) {
    $(id).addEventListener('change', (e) => {
      const saved = settings.update({ [key]: e.target.value });
      e.target.value = saved[key];
      const flag = $('settings-saved');
      flag.hidden = false;
      setTimeout(() => {
        flag.hidden = true;
      }, 1600);
    });
  }

  $('sign-out').addEventListener('click', () => {
    stats.stopClock();
    auth.signOut();
    location.reload();
  });
}

/* ── auth screen ────────────────────────────────────────────────── */
let authMode = 'signin';

function renderAuth() {
  const profiles = auth.listProfiles();
  const picker = $('profile-picker');
  const form = $('auth-form');
  const list = $('profile-list');

  applyStatic();
  $('auth-error').hidden = true;

  const showPicker = profiles.length > 0 && authMode === 'picker';
  picker.hidden = !showPicker;
  form.hidden = showPicker;
  $('auth-back').hidden = profiles.length === 0;

  if (showPicker) {
    list.textContent = '';
    for (const profile of profiles) {
      const button = document.createElement('button');
      button.className = 'profile';
      button.type = 'button';
      const face = document.createElement('span');
      face.className = 'face';
      face.style.background = profile.avatarColor;
      face.textContent = profile.displayName.slice(0, 1).toUpperCase();
      const meta = document.createElement('span');
      const name = document.createElement('b');
      name.textContent = profile.displayName;
      const since = document.createElement('small');
      since.textContent = new Date(profile.createdAt).toLocaleDateString(currentLang());
      meta.append(name, since);
      button.append(face, meta);
      button.addEventListener('click', () => {
        authMode = 'signin';
        renderAuth();
        $('auth-username').value = profile.displayName;
        $('auth-password').focus();
      });
      list.append(button);
    }
    return;
  }

  const signingUp = authMode === 'signup';
  $('auth-mode-label').textContent = signingUp ? t('auth.createTitle') : t('auth.signInTitle');
  $('auth-submit').textContent = signingUp ? t('auth.signUp') : t('auth.signIn');
  $('auth-password').autocomplete = signingUp ? 'new-password' : 'current-password';
}

function wireAuth() {
  $('show-new-account').addEventListener('click', () => {
    authMode = 'signup';
    $('auth-username').value = '';
    $('auth-password').value = '';
    renderAuth();
  });

  $('auth-back').addEventListener('click', () => {
    authMode = 'picker';
    renderAuth();
  });

  $('auth-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const name = $('auth-username').value;
    const password = $('auth-password').value;
    const remember = $('auth-remember').checked;
    const error = $('auth-error');
    error.hidden = true;

    try {
      if (authMode === 'signup') await auth.createAccount(name, password);
      await auth.signIn(name, password, remember);
      await enterApp();
    } catch (err) {
      error.textContent = t(`auth.${err.message}`) ?? err.message;
      error.hidden = false;
    }
  });
}

/* ── boot ───────────────────────────────────────────────────────── */
async function enterApp() {
  const user = auth.currentUser();
  if (!user) return;

  store = storeFor(user.username);
  stats = createStats(store);
  settings = createSettings(store);

  setLang(settings.get('lang'));
  $('lang-toggle').textContent = currentLang() === 'he' ? 'EN' : 'עב';
  $('user-chip').textContent = user.displayName.slice(0, 1).toUpperCase();
  $('user-chip').style.background = user.avatarColor;

  favorites = createFavorites(store);

  // A fresh sign-in reshuffles; a reload keeps the order so she keeps her place.
  // (The per-day seed in currentSeed() is what stops a permanently signed-in
  // phone from showing the same order forever.)
  const lastSession = store.get('lastSession', null);
  const sessionMark = appStore.get('bootId', null);
  if (lastSession !== sessionMark) {
    resetSeed();
    store.set('lastSession', sessionMark);
    quizBuffer = [];
    store.set('quizBuffer', []);
  } else {
    const bufferIds = new Set(store.get('quizBuffer', []));
    quizBuffer = words.filter((w) => bufferIds.has(w.id));
  }

  practice = createPractice({
    store,
    stats,
    favorites,
    onWordPracticed,
    onFavoriteChange: () => {
      if (currentView === 'home') renderHome();
    },
    onShuffle: shuffleAll,
    toast,
  });

  quiz = createQuiz({
    stats,
    settings,
    onFinish: ({ comeback }) => {
      stats.flush();
      checkAwards({ comeback });
    },
    onPracticeMissed: (missed) => {
      if (missed.length) startPractice(missed, t('quiz.missedTitle'));
      else showView('practice');
    },
    onWordCleared: (word) => toast(t('stats.clearedWord', { word: word.en })),
  });

  authEl.hidden = true;
  appEl.hidden = false;
  showView('home');
}

function wireChrome() {
  document.querySelectorAll('#tabbar .tab').forEach((tab) => {
    tab.addEventListener('click', () => {
      const view = tab.dataset.view;
      if (view === 'practice') startPractice();
      else showView(view);
    });
  });

  $('start-practice').addEventListener('click', () => startPractice());
  $('go-stats').addEventListener('click', () => showView('stats'));
  $('shuffle-all').addEventListener('click', shuffleAll);

  $('lang-toggle').addEventListener('click', () => {
    const next = currentLang() === 'he' ? 'en' : 'he';
    setLang(next);
    if (settings) settings.update({ lang: next });
    $('lang-toggle').textContent = next === 'he' ? 'EN' : 'עב';
    if (practice) practice.refresh();
    showView(currentView);
    renderAuth();
  });

  $('quiz-offer-yes').addEventListener('click', () => {
    $('quiz-offer').hidden = true;
    beginQuiz();
  });
  $('quiz-offer-no').addEventListener('click', () => {
    $('quiz-offer').hidden = true;
    // Declining is free: the buffer keeps filling and we ask again next time.
    quizBuffer = [];
    store.set('quizBuffer', []);
  });

  $('quiz-done').addEventListener('click', () => showView('practice'));
  $('award-pop-close').addEventListener('click', showNextAward);

  document.addEventListener('visibilitychange', () => {
    if (document.hidden) stats?.stopClock();
    else if (currentView === 'practice' || currentView === 'quiz') stats?.startClock();
  });
  addEventListener('pagehide', () => stats?.flush());
}

async function boot() {
  // One id per page load: lets a fresh sign-in reshuffle while a reload does not.
  if (!appStore.get('bootId', null) || !auth.currentUser()) appStore.set('bootId', Date.now());

  try {
    const data = await loadWords();
    words = data.words;
    groups = data.groups;
  } catch (err) {
    document.body.textContent = `Could not load the word list: ${err.message}`;
    return;
  }

  setLang(appStore.get('lang', 'he'));
  wireChrome();
  wireAuth();
  wireSettings();

  if (auth.currentUser()) {
    await enterApp();
  } else {
    authMode = auth.hasAccounts() ? 'picker' : 'signup';
    authEl.hidden = false;
    renderAuth();
  }
}

boot();

if ('serviceWorker' in navigator) {
  addEventListener('load', () => navigator.serviceWorker.register('sw.js').catch(() => {}));
}
