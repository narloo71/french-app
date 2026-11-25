// Pure logic shared by the app and the Node tests: conjugation, answer checking, spaced repetition.
(function (root) {
  'use strict';

  // ---------- Text ----------
  const norm = s => String(s).toLowerCase()
    .replace(/[’‘`´]/g, "'")
    .replace(/\s+/g, ' ')
    .replace(/\s*'\s*/g, "'")
    .trim()
    .replace(/[.!?]+$/, '')
    .trim();
  const plain = s => norm(s).replace(/œ/g, 'oe').replace(/æ/g, 'ae')
    .normalize('NFD').replace(/[̀-ͯ]/g, '');

  // 'exact' | 'accent' (right apart from accents) | 'wrong'
  function check(input, answers) {
    const n = norm(input);
    if (!n) return 'wrong';
    if (answers.some(a => norm(a) === n)) return 'exact';
    const p = plain(input);
    if (answers.some(a => plain(a) === p)) return 'accent';
    return 'wrong';
  }

  // ---------- Vocabulary ----------
  const headword = fr => fr.replace(/^(le|la|les|un|une)\s+/i, '').replace(/^l'/i, '');
  const escapeRe = s => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  // Returns the example sentence with the headword blanked, or null if it doesn't appear verbatim.
  function blankSentence(v) {
    const hw = headword(v.fr);
    const re = new RegExp('(?<!\\p{L})' + escapeRe(hw) + '(?!\\p{L})', 'iu');
    const m = v.ex.match(re);
    if (!m) return null;
    return { text: v.ex.replace(re, '_____'), answer: m[0] };
  }

  // ---------- Conjugation ----------
  const PRON = ['je', 'tu', 'il/elle', 'nous', 'vous', 'ils/elles'];
  const END = {
    imp:  ['ais', 'ais', 'ait', 'ions', 'iez', 'aient'],
    fut:  ['ai', 'as', 'a', 'ons', 'ez', 'ont'],
    cond: ['ais', 'ais', 'ait', 'ions', 'iez', 'aient'],
    subj: ['e', 'es', 'e', 'ions', 'iez', 'ent']
  };
  const TENSES = [
    { id: 'pres', name: 'Présent' },
    { id: 'pc',   name: 'Passé composé' },
    { id: 'imp',  name: 'Imparfait' },
    { id: 'fut',  name: 'Futur simple' },
    { id: 'cond', name: 'Conditionnel présent' },
    { id: 'subj', name: 'Subjonctif présent' }
  ];
  const STARTS_VOWEL = /^[aeiouhyéèêëâàîïôûùœ]/i;

  function pronoun(i, form, tense) {
    let p = (i === 0 && STARTS_VOWEL.test(form)) ? "j'" : PRON[i];
    if (tense === 'subj') p = (i === 2 || i === 5) ? "qu'" + p : 'que ' + p;
    return p;
  }
  const joinPron = (p, f) => p.endsWith("'") ? p + f : p + ' ' + f;

  // Returns 6 rows: { pron, form (display), answers (accepted), full (display with pronoun) }
  function conjugate(verbs, v, tense) {
    let rows;
    switch (tense) {
      case 'pres': rows = v.pres.map(f => [f]); break;
      case 'imp':  rows = END.imp.map(e => [v.imp + e]); break;
      case 'fut':  rows = END.fut.map(e => [v.fut + e]); break;
      case 'cond': rows = END.cond.map(e => [v.fut + e]); break;
      case 'subj': {
        const s = v.subj.length === 6 ? v.subj
          : END.subj.map((e, i) => (i === 3 || i === 4 ? v.subj[1] : v.subj[0]) + e);
        rows = s.map(f => [f]);
        break;
      }
      case 'pc': {
        const aux = verbs.find(x => x.inf === v.aux).pres;
        rows = aux.map((a, i) => {
          if (v.aux !== 'être') return [a + ' ' + v.pp];
          // Agreement with the subject: show (e)/(e)s, accept every valid spelling.
          const suffix = i === 4 ? '(e)(s)' : i >= 3 ? '(e)s' : '(e)';
          const ok = i === 4 ? ['', 'e', 's', 'es'] : i >= 3 ? ['s', 'es'] : ['', 'e'];
          return [a + ' ' + v.pp + suffix, ...ok.map(o => a + ' ' + v.pp + o)];
        });
        break;
      }
      default: throw new Error('Unknown tense ' + tense);
    }
    return rows.map((r, i) => {
      const form = r[0];
      const pron = pronoun(i, form, tense);
      return { pron, form, answers: r.length > 1 ? r.slice(1) : r, full: joinPron(pron, form) };
    });
  }

  // Strip a leading "que", subject pronoun, or elided j' that the learner may have typed.
  function stripPronoun(input) {
    return norm(input)
      .replace(/^(que |qu')/, '')
      .replace(/^(je |j'|tu |il |elle |on |nous |vous |ils |elles )/, '');
  }
  const checkConjugation = (input, row) => check(stripPronoun(input), row.answers);

  // Text for speech: drop agreement markers like "(e)s".
  const speakable = s => s.replace(/\([^)]*\)/g, '');

  // ---------- Spaced repetition (simplified SM-2, day-based) ----------
  // grade: 0 again, 1 hard, 2 good, 3 easy. Returns a new card object.
  function schedule(card, grade, today) {
    const c = card ? { ...card } : { ease: 2.5, ivl: 0, reps: 0, lapses: 0, due: today };
    if (grade === 0) {
      c.reps = 0; c.lapses++; c.ease = Math.max(1.3, c.ease - 0.2); c.ivl = 0; c.due = today;
      return c;
    }
    if (grade === 1) {
      c.ivl = c.reps === 0 ? 1 : Math.max(c.ivl + 1, Math.round(c.ivl * 1.2));
      c.ease = Math.max(1.3, c.ease - 0.15);
    } else if (grade === 2) {
      c.ivl = c.reps === 0 ? 1 : c.reps === 1 ? 3 : Math.max(c.ivl + 1, Math.round(c.ivl * c.ease));
    } else {
      c.ivl = c.reps === 0 ? 4 : Math.max(c.ivl + 1, Math.round(c.ivl * c.ease * 1.3));
      c.ease += 0.15;
    }
    c.reps++;
    c.due = today + c.ivl;
    return c;
  }

  const api = { norm, plain, check, headword, blankSentence, PRON, TENSES, pronoun,
    conjugate, stripPronoun, checkConjugation, speakable, schedule };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.Core = api;
})(typeof window !== 'undefined' ? window : globalThis);
