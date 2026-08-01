import { t } from './i18n.js';

// Parenthetical qualifiers ("גדול (רחב מידות)") exist to separate two English
// words that share one Hebrew word. In a multiple-choice list they would make
// the answer stand out by shape, so options show the bare gloss.
const bareGloss = (sense) => sense.he.replace(/\s*\(.*?\)\s*/g, '').trim();

const pickRandom = (list, count) => {
  const pool = list.slice();
  const out = [];
  while (out.length < count && pool.length) {
    out.push(...pool.splice(Math.floor(Math.random() * pool.length), 1));
  }
  return out;
};

export function buildQuiz(buffer, allWords, { quizLength, answerOptions }) {
  const questions = [];
  // Never ask more questions than there are words to ask about.
  const askable = pickRandom(buffer, Math.min(quizLength, buffer.length));

  for (const word of askable) {
    const correct = bareGloss(word.senses[0]);

    // A word's *other* meanings must never be offered as wrong answers.
    const forbidden = new Set(word.senses.map(bareGloss));
    forbidden.add(correct);

    const candidates = [];
    const seen = new Set(forbidden);
    const consider = (candidate) => {
      const gloss = bareGloss(candidate.senses[0]);
      if (seen.has(gloss)) return;
      seen.add(gloss);
      candidates.push(gloss);
    };

    // Distractors come from the words she just reviewed, as requested — that is
    // what makes the quiz discriminating rather than guessable.
    buffer.forEach((other) => other.id !== word.id && consider(other));
    if (candidates.length < answerOptions - 1) {
      pickRandom(allWords, 200).forEach((other) => other.id !== word.id && consider(other));
    }

    const options = [correct, ...pickRandom(candidates, answerOptions - 1)];
    questions.push({
      word,
      correct,
      options: pickRandom(options, options.length), // shuffle
    });
  }

  return questions;
}

export function createQuiz({ stats, settings, onFinish, onPracticeMissed, onWordCleared }) {
  const playEl = document.getElementById('quiz-play');
  const resultsEl = document.getElementById('quiz-results');
  const wordEl = document.getElementById('quiz-word');
  const optionsEl = document.getElementById('quiz-options');
  const progressEl = document.getElementById('quiz-progress');
  const scoreEl = document.getElementById('quiz-score');
  const barEl = document.getElementById('quiz-bar-fill');
  const resultScoreEl = document.getElementById('quiz-result-score');
  const resultLabelEl = document.getElementById('quiz-result-label');
  const missedEl = document.getElementById('quiz-missed');
  const practiceMissedBtn = document.getElementById('quiz-practice-missed');

  let questions = [];
  let at = 0;
  let correctCount = 0;
  let missed = [];
  let comeback = false;
  let locked = false;

  function renderQuestion() {
    const question = questions[at];
    locked = false;
    wordEl.textContent = question.word.en;
    progressEl.textContent = t('quiz.progress', { i: at + 1, n: questions.length });
    scoreEl.textContent = t('quiz.score', { n: correctCount });
    barEl.style.width = `${(at / questions.length) * 100}%`;

    optionsEl.textContent = '';
    for (const option of question.options) {
      const button = document.createElement('button');
      button.className = 'option';
      button.textContent = option;
      button.addEventListener('click', () => answer(button, option));
      optionsEl.append(button);
    }
  }

  function answer(button, chosen) {
    if (locked) return;
    locked = true;
    stats.poke();
    const question = questions[at];
    const right = chosen === question.correct;

    [...optionsEl.children].forEach((child) => {
      child.disabled = true;
      if (child.textContent === question.correct) child.classList.add('correct');
    });
    if (!right) button.classList.add('wrong');

    if (right) {
      correctCount += 1;
      // Getting a word right that she previously missed is worth celebrating —
      // but it only leaves the failed list after enough correct answers in a row.
      if (stats.wasMissed(question.word.id)) {
        comeback = true;
        if (stats.recordSuccess(question.word.id, settings.get('successesToClear'))) {
          onWordCleared?.(question.word);
        }
      }
    } else {
      missed.push(question.word);
    }
    scoreEl.textContent = t('quiz.score', { n: correctCount });

    setTimeout(() => {
      at += 1;
      if (at < questions.length) renderQuestion();
      else finish();
    }, right ? 550 : 1300);
  }

  function finish() {
    barEl.style.width = '100%';
    playEl.hidden = true;
    resultsEl.hidden = false;

    const total = questions.length;
    resultScoreEl.textContent = `${correctCount}/${total}`;
    resultLabelEl.textContent =
      correctCount === total ? t('quiz.perfect') : t('quiz.resultLabel', { correct: correctCount, total });

    missedEl.textContent = '';
    practiceMissedBtn.hidden = missed.length === 0;
    for (const word of missed) {
      const row = document.createElement('div');
      row.className = 'missed-row';
      const en = document.createElement('b');
      en.textContent = word.en;
      const he = document.createElement('span');
      he.textContent = word.senses.map(bareGloss).join(' · ');
      row.append(en, he);
      missedEl.append(row);
    }

    stats.recordQuiz({ correct: correctCount, total, missedIds: missed.map((w) => w.id) });
    onFinish({ correct: correctCount, total, missed, comeback });
  }

  practiceMissedBtn.addEventListener('click', () => onPracticeMissed(missed));

  return {
    start(builtQuestions) {
      questions = builtQuestions;
      at = 0;
      correctCount = 0;
      missed = [];
      comeback = false;
      playEl.hidden = false;
      resultsEl.hidden = true;
      renderQuestion();
    },
    missed: () => missed,
  };
}
