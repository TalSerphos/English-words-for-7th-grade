// Per-profile progress: daily rollups, streaks, quiz history, XP.
const IDLE_MS = 60000;   // stop the clock after a minute of no interaction
const SEEN_MS = 2000;    // a card counts as practiced after this long on screen
const STREAK_MIN_WORDS = 5;

export const todayKey = (d = new Date()) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

const dayKeyOffset = (offset) => {
  const d = new Date();
  d.setDate(d.getDate() + offset);
  return todayKey(d);
};

export function createStats(store) {
  const days = store.get('days', {});
  const missCounts = store.get('missCounts', {});
  // Consecutive correct answers since a word was last missed. A word leaves the
  // failed list only after enough of them (configurable, default 2).
  const successCounts = store.get('successCounts', {});

  const day = (key = todayKey()) => {
    if (!days[key]) days[key] = { seconds: 0, words: [], quizzes: [], reveals: 0, speaks: 0 };
    return days[key];
  };

  const persist = () => {
    store.set('days', days);
    store.set('missCounts', missCounts);
    store.set('successCounts', successCounts);
  };

  /* ── active-time clock ─────────────────────────────────────────── */
  let ticking = false;
  let lastActivity = Date.now();
  let timer = null;

  const tick = () => {
    if (document.hidden || Date.now() - lastActivity > IDLE_MS) return;
    day().seconds += 1;
    if (day().seconds % 10 === 0) persist();
  };

  const api = {
    startClock() {
      if (ticking) return;
      ticking = true;
      lastActivity = Date.now();
      timer = setInterval(tick, 1000);
    },
    stopClock() {
      ticking = false;
      clearInterval(timer);
      persist();
    },
    poke() {
      lastActivity = Date.now();
    },

    /* ── practice events ─────────────────────────────────────────── */
    markPracticed(wordId) {
      const today = day();
      if (!today.words.includes(wordId)) {
        today.words.push(wordId);
        persist();
        return true;
      }
      return false;
    },
    markReveal() {
      day().reveals += 1;
    },
    markSpeak() {
      day().speaks += 1;
    },

    /* ── quiz events ─────────────────────────────────────────────── */
    recordQuiz({ correct, total, missedIds }) {
      day().quizzes.push({ correct, total, missedIds, at: Date.now() });
      for (const id of missedIds) {
        missCounts[id] = (missCounts[id] ?? 0) + 1;
        // Missing it again resets the run of correct answers.
        delete successCounts[id];
      }
      persist();
    },

    // One correct answer on a failed word. Returns true when the word has now
    // been answered right enough times to leave the failed list for good.
    recordSuccess(wordId, needed) {
      if (!missCounts[wordId]) return false;
      const runs = (successCounts[wordId] ?? 0) + 1;
      if (runs >= needed) {
        delete missCounts[wordId];
        delete successCounts[wordId];
        persist();
        return true;
      }
      successCounts[wordId] = runs;
      persist();
      return false;
    },

    wasMissed: (wordId) => Boolean(missCounts[wordId]),
    successesOn: (wordId) => successCounts[wordId] ?? 0,
    failedCount: () => Object.keys(missCounts).length,
    // Every failed word, worst first — this is what the "words I got wrong" deck uses.
    failedWords: () =>
      Object.entries(missCounts)
        .sort((a, b) => b[1] - a[1])
        .map(([id, misses]) => ({ id, misses, successes: successCounts[id] ?? 0 })),
    troubleWords: () => api.failedWords().slice(0, 12),

    /* ── derived numbers ─────────────────────────────────────────── */
    summary() {
      const entries = Object.entries(days);
      const today = day();

      const uniqueWords = new Set();
      let totalSeconds = 0;
      let quizzes = 0;
      let questions = 0;
      let correct = 0;
      let bestScore = 0;
      let perfect = 0;
      const quizHistory = [];

      for (const [, value] of entries) {
        totalSeconds += value.seconds;
        value.words.forEach((w) => uniqueWords.add(w));
        for (const q of value.quizzes) {
          quizzes += 1;
          questions += q.total;
          correct += q.correct;
          const pct = q.total ? q.correct / q.total : 0;
          bestScore = Math.max(bestScore, pct);
          if (q.total && q.correct === q.total) perfect += 1;
          quizHistory.push({ at: q.at, pct });
        }
      }
      quizHistory.sort((a, b) => a.at - b.at);

      // A day counts once she has practiced enough words on it.
      const qualifies = (key) => (days[key]?.words.length ?? 0) >= STREAK_MIN_WORDS;
      let streak = 0;
      let cursor = qualifies(todayKey()) ? 0 : -1;
      while (qualifies(dayKeyOffset(cursor))) {
        streak += 1;
        cursor -= 1;
      }

      const sortedKeys = Object.keys(days).sort();
      let longest = 0;
      let run = 0;
      let previous = null;
      for (const key of sortedKeys) {
        if (!qualifies(key)) {
          run = 0;
          previous = key;
          continue;
        }
        const gapDay = new Date(`${key}T00:00:00`);
        gapDay.setDate(gapDay.getDate() - 1);
        run = previous === todayKey(gapDay) ? run + 1 : 1;
        longest = Math.max(longest, run);
        previous = key;
      }

      const xp = uniqueWords.size * 2 + correct * 5 + entries.filter(([k]) => qualifies(k)).length * 10;
      const level = Math.floor(xp / 100) + 1;

      return {
        todaySeconds: today.seconds,
        todayWords: today.words.length,
        todayQuizzes: today.quizzes.length,
        totalSeconds,
        uniqueWords: uniqueWords.size,
        streak,
        longestStreak: Math.max(longest, streak),
        quizzes,
        questions,
        correct,
        accuracy: questions ? correct / questions : 0,
        bestScore,
        perfectQuizzes: perfect,
        quizHistory,
        xp,
        level,
        xpIntoLevel: xp % 100,
        activeDays: entries.filter(([k]) => qualifies(k)).length,
      };
    },

    lastDays(count) {
      return Array.from({ length: count }, (_, i) => {
        const key = dayKeyOffset(-(count - 1 - i));
        return { key, ...(days[key] ?? { seconds: 0, words: [], quizzes: [] }) };
      });
    },

    flush: persist,
  };

  return api;
}

export { SEEN_MS };
