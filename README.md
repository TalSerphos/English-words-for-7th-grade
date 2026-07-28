# מילים באנגלית · English Words

A phone-first vocabulary trainer for the Israeli Ministry of Education
**Foundation Level: Lexis – Band I** word list (7th grade) — 613 words with
swipe cards, Hebrew translations, quizzes, streaks and awards.

No build step, no server: it is a static site that runs entirely in the browser.

## Live site

<https://talserphos.github.io/English-words-for-7th-grade/>

### Turning Pages on (one time)

1. Merge this branch into `main`.
2. Go to **Settings → Pages → Build and deployment → Source: GitHub Actions**.

Every push to `main` then validates the word data and redeploys.

Tell her to open the link on her phone and use **Share → Add to Home Screen**.
It installs as an app, opens full-screen, and works offline.

## How to use it

| Gesture | What happens |
| --- | --- |
| swipe **right** | next word |
| swipe **left** | previous word |
| swipe **up** | hear the word pronounced |
| swipe **down** | reveal the Hebrew translation |

Arrow keys do the same on a laptop, and there are four buttons under the card.
The word order is reshuffled at every sign-in, but a page reload keeps her place.

After every 25 words practiced (configurable) the app offers a quiz: 10 questions
drawn from the words she just saw, 4 possible answers each, with the wrong answers
taken from the meanings of those same words.

## Accounts

Several people can each have their own profile on one device. "Remember me on
this phone" keeps her signed in indefinitely, so the app opens straight to the
cards.

**Be clear-eyed about what the password does.** Accounts live in this browser's
`localStorage`. Passwords are never stored — only a PBKDF2-SHA256 hash (210,000
iterations, random 16-byte salt) — but anyone who can open developer tools on the
device can bypass the lock. It keeps a sibling out of her stats; it is not
security, and there is no server that could make it so.

Progress does not sync between devices. Her phone and a laptop keep separate
stats. If sync is ever wanted, `assets/js/store.js` is the only file that touches
storage, so a Firebase/Supabase backend can slot in behind it.

## The word data

`data/words-*.json`, split into seven letter groups. One entry per English word;
words with several meanings carry several `senses` rather than becoming duplicate
cards.

```json
{
  "en": "right",
  "senses": [
    { "pos": "n",   "he": "ימין",  "sentence": "my right hand",
      "heSentence": "יד ימין שלי" },
    { "pos": "adj", "he": "נכונה", "sentence": "the right answer",
      "heSentence": "התשובה הנכונה", "heWordInSentence": "הנכונה" }
  ]
}
```

### The word-by-word rule

The Hebrew sentence exists to **teach the word**, not to read as naturally as
possible. The gloss being taught must appear verbatim inside the Hebrew sentence:

> `back` → `בחזרה`, so *"Give back the money!"* → **"תן בחזרה את הכסף!"**
> — not *"תחזיר את הכסף!"*, which is better Hebrew but teaches nothing about `בחזרה`.

Consequently, sentences are chosen for how well they survive word-by-word
translation: short subject-verb-object, no idioms, no English `do`-support, no
phrasal verbs that collapse into one unrelated Hebrew verb. Slightly stiff Hebrew
is the intended trade-off.

Where a verb genuinely cannot appear unchanged (`run` → `לרוץ`, but *"I run fast"*
→ *"אני רץ מהר"*), the sense records `heWordInSentence` with the inflected form
actually used. Hebrew prefixes on the gloss (ו/ה/ב/כ/ל/מ/ש) are fine — `ספר`
inside `הספר` is still the same word.

Run the checker after any edit:

```bash
node tools/validate-words.mjs
```

It enforces the rule mechanically — every sense's gloss must be a substring of its
Hebrew sentence — plus unique ids, required fields, no Hebrew in English fields,
and that each English word appears in its own sentence. CI runs it before deploying.

A handful of grammatical words (`a/an`, `will`) have no Hebrew counterpart at all.
Those are marked `"literal": false` with a note explaining the difference, and the
validator caps how many entries may use that exemption so it cannot become a
loophole.

## Settings

| Setting | Default | Range |
| --- | --- | --- |
| Words before a quiz is offered | 25 | 5–100 |
| Answer options per question | 4 | 2–6 |
| Questions per quiz | 10 | 3–20 |
| Daily goal | 10 min / 25 words | — |
| Interface language | Hebrew | Hebrew / English |

Questions per quiz is clamped to the number of words available, so no combination
of settings can produce an impossible quiz.

## Running locally

```bash
python3 -m http.server 8000
# then open http://localhost:8000
```

## Layout

```
index.html                  single page, view swapping
assets/css/app.css          design system, RTL via logical properties
assets/js/
  main.js                   boot, routing, home + stats rendering
  auth.js                   PBKDF2 accounts, profiles, sessions
  store.js                  namespaced localStorage (the only storage layer)
  i18n.js                   Hebrew/English strings, dir switching
  deck.js                   word loading, seeded shuffle, deck filters
  practice.js               swipe gestures, card rendering, highlighting
  quiz.js                   question building, scoring, results
  stats.js                  time on task, streaks, daily rollups, XP
  awards.js                 badge table
  settings.js               per-profile preferences with clamping
data/words-*.json           the word list
tools/validate-words.mjs    data checker (also runs in CI)
sw.js                       offline cache
```

Vocabulary list © Israeli Ministry of Education. Example sentences marked
`"fromPdf": true` are taken from the syllabus itself; the rest were written for
this app.
