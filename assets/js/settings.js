const DEFAULTS = {
  wordsBeforeQuiz: 25,
  answerOptions: 4,
  quizLength: 10,
  goalMinutes: 10,
  goalWords: 25,
  lang: 'he',
};

const LIMITS = {
  wordsBeforeQuiz: [5, 100],
  answerOptions: [2, 6],
  quizLength: [3, 20],
  goalMinutes: [1, 120],
  goalWords: [1, 300],
};

const clamp = (key, value) => {
  const [min, max] = LIMITS[key];
  const n = Math.round(Number(value));
  return Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : DEFAULTS[key];
};

export function createSettings(store) {
  let values = { ...DEFAULTS, ...store.get('settings', {}) };

  return {
    all: () => ({ ...values }),
    get: (key) => values[key],
    update(patch) {
      for (const [key, value] of Object.entries(patch)) {
        values[key] = key in LIMITS ? clamp(key, value) : value;
      }
      store.set('settings', values);
      return { ...values };
    },
    // A quiz can never have more questions than words available, no matter how
    // the two settings are combined.
    effectiveQuizLength: (available) => Math.max(1, Math.min(values.quizLength, available)),
    effectiveOptions: (available) => Math.max(2, Math.min(values.answerOptions, Math.max(2, available))),
  };
}

export { DEFAULTS, LIMITS };
