// Declarative badge table. Everything is evaluated from the stats summary, so
// awards can be added without touching any other file.
const AWARDS = [
  { id: 'streak-3',    icon: '🔥', he: ['3 ימים ברצף', 'תרגלת שלושה ימים ברצף'],           en: ['3-day streak', 'Practiced three days in a row'],        test: (s) => s.streak >= 3 },
  { id: 'streak-7',    icon: '🔥', he: ['שבוע ברצף', 'תרגלת שבעה ימים ברצף'],               en: ['Week streak', 'Practiced seven days in a row'],         test: (s) => s.streak >= 7 },
  { id: 'streak-14',   icon: '⚡', he: ['שבועיים ברצף', '14 ימים ברצף'],                    en: ['Two weeks', '14 days in a row'],                        test: (s) => s.streak >= 14 },
  { id: 'streak-30',   icon: '🏆', he: ['חודש ברצף', '30 ימים ברצף'],                       en: ['A month', '30 days in a row'],                          test: (s) => s.streak >= 30 },
  { id: 'streak-100',  icon: '👑', he: ['100 ימים', '100 ימים ברצף'],                       en: ['100 days', '100 days in a row'],                        test: (s) => s.streak >= 100 },

  { id: 'words-25',    icon: '🌱', he: ['25 מילים', 'תרגלת 25 מילים שונות'],                 en: ['25 words', 'Practiced 25 different words'],             test: (s) => s.uniqueWords >= 25 },
  { id: 'words-100',   icon: '🌿', he: ['100 מילים', 'תרגלת 100 מילים שונות'],               en: ['100 words', 'Practiced 100 different words'],           test: (s) => s.uniqueWords >= 100 },
  { id: 'words-250',   icon: '🌳', he: ['250 מילים', 'תרגלת 250 מילים שונות'],               en: ['250 words', 'Practiced 250 different words'],           test: (s) => s.uniqueWords >= 250 },
  { id: 'words-all',   icon: '🎓', he: ['אלופת Band I', 'ראית את כל המילים ברשימה'],          en: ['Band I Champion', 'Saw every word on the list'],        test: (s) => s.uniqueWords >= 600 },

  { id: 'time-30m',    icon: '⏱️', he: ['חצי שעה', 'חצי שעה של תרגול'],                      en: ['Half an hour', 'Half an hour of practice'],             test: (s) => s.totalSeconds >= 1800 },
  { id: 'time-5h',     icon: '⏰', he: ['5 שעות', '5 שעות של תרגול'],                         en: ['5 hours', 'Five hours of practice'],                    test: (s) => s.totalSeconds >= 18000 },
  { id: 'time-20h',    icon: '🕰️', he: ['20 שעות', '20 שעות של תרגול'],                      en: ['20 hours', 'Twenty hours of practice'],                 test: (s) => s.totalSeconds >= 72000 },

  { id: 'goal-day',    icon: '🎯', he: ['יעד יומי', 'השגת את היעד היומי'],                    en: ['Daily goal', 'Hit the daily goal'],                     test: (s, g) => s.todaySeconds >= g.goalMinutes * 60 || s.todayWords >= g.goalWords },
  { id: 'perfect-week',icon: '📅', he: ['שבוע מושלם', 'תרגלת כל יום במשך שבוע'],              en: ['Perfect week', 'Practiced every day for a week'],       test: (s) => s.streak >= 7 },
  { id: 'early-bird',  icon: '🐦', he: ['ציפור בוקר', 'תרגלת לפני 8 בבוקר'],                  en: ['Early bird', 'Practiced before 8am'],                   test: (s, g) => g.hour < 8 && s.todayWords > 0 },
  { id: 'night-owl',   icon: '🦉', he: ['ינשוף לילה', 'תרגלת אחרי 10 בלילה'],                 en: ['Night owl', 'Practiced after 10pm'],                    test: (s, g) => g.hour >= 22 && s.todayWords > 0 },

  { id: 'quiz-first',  icon: '📝', he: ['הבוחן הראשון', 'סיימת בוחן ראשון'],                  en: ['First quiz', 'Finished a first quiz'],                  test: (s) => s.quizzes >= 1 },
  { id: 'quiz-perfect',icon: '💯', he: ['ניקוד מושלם', 'בוחן בלי אף טעות'],                   en: ['Perfect score', 'A quiz with no mistakes'],             test: (s) => s.perfectQuizzes >= 1 },
  { id: 'quiz-perfect5',icon: '🌟',he: ['5 מושלמים', 'חמישה בחנים בלי טעויות'],               en: ['5 perfect', 'Five flawless quizzes'],                   test: (s) => s.perfectQuizzes >= 5 },
  { id: 'quiz-10',     icon: '🧠', he: ['10 בחנים', 'סיימת 10 בחנים'],                        en: ['10 quizzes', 'Finished ten quizzes'],                   test: (s) => s.quizzes >= 10 },
  { id: 'quiz-50',     icon: '🧩', he: ['50 בחנים', 'סיימת 50 בחנים'],                        en: ['50 quizzes', 'Finished fifty quizzes'],                 test: (s) => s.quizzes >= 50 },
  { id: 'quiz-100',    icon: '🏅', he: ['100 בחנים', 'סיימת 100 בחנים'],                      en: ['100 quizzes', 'Finished a hundred quizzes'],            test: (s) => s.quizzes >= 100 },
  { id: 'sharpshooter',icon: '🎪', he: ['קליעה למטרה', '80% הצלחה ב־100 שאלות'],              en: ['Sharpshooter', '80% accuracy over 100 questions'],      test: (s) => s.questions >= 100 && s.accuracy >= 0.8 },
  { id: 'comeback',    icon: '🔄', he: ['קאמבק', 'ענית נכון על מילה שפעם טעית בה'],           en: ['Comeback', 'Got a previously-missed word right'],       test: (s, g) => g.comeback },
];

export const allAwards = () => AWARDS;

export const describe = (award, lang) => {
  const [title, desc] = award[lang] ?? award.he;
  return { title, desc, icon: award.icon };
};

// Returns the awards newly unlocked by this evaluation and persists the set.
export function evaluate(store, summary, context) {
  const unlocked = new Set(store.get('awards', []));
  const fresh = [];

  for (const award of AWARDS) {
    if (unlocked.has(award.id)) continue;
    let passed = false;
    try {
      passed = award.test(summary, context);
    } catch {
      passed = false;
    }
    if (passed) {
      unlocked.add(award.id);
      fresh.push(award);
    }
  }

  if (fresh.length) store.set('awards', [...unlocked]);
  return { fresh, unlocked };
}
