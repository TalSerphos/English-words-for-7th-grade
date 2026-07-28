#!/usr/bin/env node
// Validates data/words-*.json. The important check is the word-by-word rule:
// the Hebrew gloss being taught must actually appear inside the Hebrew sentence.
import { readdirSync, readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const dataDir = join(dirname(fileURLToPath(import.meta.url)), '..', 'data');
const HEBREW = /[֐-׿]/;
const FINALS = { 'ך': 'כ', 'ם': 'מ', 'ן': 'נ', 'ף': 'פ', 'ץ': 'צ' };
const MAX_NON_LITERAL = 15;

// Final letters change form when a suffix is added (חום -> חומים), and niqqud /
// punctuation must not defeat a substring match, so flatten both sides first.
const normalize = (s) =>
  s
    .replace(/[֑-ׇ]/g, '')
    .replace(/[.,!?;:"'’”“()׳״]/g, '')
    .replace(/[ךםןףץ]/g, (c) => FINALS[c])
    .replace(/\s+/g, ' ')
    .trim();

const errors = [];
const warnings = [];
const seenIds = new Map();
let wordCount = 0;
let senseCount = 0;
let nonLiteral = 0;

const files = readdirSync(dataDir).filter((f) => /^words-.*\.json$/.test(f)).sort();
if (files.length === 0) errors.push('no data/words-*.json files found');

for (const file of files) {
  let parsed;
  try {
    parsed = JSON.parse(readFileSync(join(dataDir, file), 'utf8'));
  } catch (e) {
    errors.push(`${file}: invalid JSON — ${e.message}`);
    continue;
  }
  if (!parsed.group || !Array.isArray(parsed.words)) {
    errors.push(`${file}: expected { group, words: [] }`);
    continue;
  }

  for (const word of parsed.words) {
    wordCount++;
    const where = `${file} · "${word.en}"`;
    if (!word.en || typeof word.en !== 'string') {
      errors.push(`${where}: missing "en"`);
      continue;
    }
    if (HEBREW.test(word.en)) errors.push(`${where}: "en" contains Hebrew`);

    const id = word.id || word.en.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
    if (seenIds.has(id)) errors.push(`${where}: duplicate id "${id}" (also in ${seenIds.get(id)})`);
    seenIds.set(id, file);

    if (!Array.isArray(word.senses) || word.senses.length === 0) {
      errors.push(`${where}: needs at least one sense`);
      continue;
    }
    if (word.literal === false) {
      nonLiteral++;
      if (!word.note?.he || !word.note?.en) {
        errors.push(`${where}: literal:false requires a note in both languages`);
      }
    }

    const glosses = new Set();
    word.senses.forEach((sense, i) => {
      senseCount++;
      const at = `${where} [sense ${i + 1}]`;
      for (const field of ['pos', 'he', 'sentence', 'heSentence']) {
        if (!sense[field] || !String(sense[field]).trim()) errors.push(`${at}: missing "${field}"`);
      }
      if (errors.some((e) => e.startsWith(`${at}: missing`))) return;

      if (!HEBREW.test(sense.he)) errors.push(`${at}: "he" has no Hebrew characters`);
      if (!HEBREW.test(sense.heSentence)) errors.push(`${at}: "heSentence" has no Hebrew characters`);
      if (HEBREW.test(sense.sentence)) errors.push(`${at}: English sentence contains Hebrew`);

      if (glosses.has(sense.he)) errors.push(`${at}: repeats the gloss "${sense.he}" of an earlier sense`);
      glosses.add(sense.he);

      // The English word (or one of its tokens) should be visible in its own sentence.
      const tokens = word.en.toLowerCase().replace(/\(.*?\)/g, ' ').split(/[^a-z']+/).filter(Boolean);
      const haystackEn = sense.sentence.toLowerCase();
      // cry -> cries, so allow the y->i inflection when looking for the word.
      const appears = (t) => haystackEn.includes(t) || (t.endsWith('y') && haystackEn.includes(`${t.slice(0, -1)}i`));
      if (tokens.length && !tokens.some(appears)) {
        errors.push(`${at}: "${word.en}" does not appear in its English sentence`);
      }

      // The word-by-word rule.
      if (word.literal === false) return;
      const needle = normalize(sense.heWordInSentence || sense.he);
      const haystack = normalize(sense.heSentence);
      if (!haystack.includes(needle)) {
        errors.push(
          `${at}: word-by-word rule broken — "${sense.heWordInSentence || sense.he}" is not inside "${sense.heSentence}"`
        );
      }
      if (sense.heWordInSentence && normalize(sense.heWordInSentence) === normalize(sense.he)) {
        warnings.push(`${at}: heWordInSentence is identical to he — it can be dropped`);
      }
    });
  }
}

if (nonLiteral > MAX_NON_LITERAL) {
  errors.push(`${nonLiteral} entries use literal:false; at most ${MAX_NON_LITERAL} are allowed — the exemption must stay rare`);
}

for (const w of warnings) console.warn(`warn  ${w}`);
for (const e of errors) console.error(`ERROR ${e}`);

console.log(
  `\n${wordCount} words · ${senseCount} senses · ${files.length} files · ${nonLiteral} non-literal · ${errors.length} errors`
);
process.exit(errors.length ? 1 : 0);
