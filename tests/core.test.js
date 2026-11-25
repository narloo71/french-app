// Run with: node --test tests/
const test = require('node:test');
const assert = require('node:assert/strict');
globalThis.window = globalThis;
require('../data/verbs.js');
require('../data/vocab.js');
const C = require('../js/core.js');
const V = inf => VERBS.find(v => v.inf === inf);
const forms = (inf, t) => C.conjugate(VERBS, V(inf), t).map(r => r.full);

test('présent with elision', () => {
  assert.deepEqual(forms('avoir', 'pres'), ["j'ai", 'tu as', 'il/elle a', 'nous avons', 'vous avez', 'ils/elles ont']);
  assert.equal(forms('aimer', 'pres')[0], "j'aime");
  assert.equal(forms('être', 'pres')[0], 'je suis');
});

test('imparfait, futur, conditionnel from stems', () => {
  assert.deepEqual(forms('être', 'imp'), ["j'étais", 'tu étais', 'il/elle était', 'nous étions', 'vous étiez', 'ils/elles étaient']);
  assert.equal(forms('voir', 'imp')[3], 'nous voyions');
  assert.deepEqual(forms('aller', 'fut'), ["j'irai", 'tu iras', 'il/elle ira', 'nous irons', 'vous irez', 'ils/elles iront']);
  assert.equal(forms('pouvoir', 'cond')[0], 'je pourrais');
  assert.equal(forms('venir', 'cond')[5], 'ils/elles viendraient');
});

test('subjonctif, two-stem and fully irregular', () => {
  assert.deepEqual(forms('venir', 'subj'), ['que je vienne', 'que tu viennes', "qu'il/elle vienne", 'que nous venions', 'que vous veniez', "qu'ils/elles viennent"]);
  assert.deepEqual(forms('avoir', 'subj'), ["que j'aie", 'que tu aies', "qu'il/elle ait", 'que nous ayons', 'que vous ayez', "qu'ils/elles aient"]);
  assert.equal(forms('voir', 'subj')[3], 'que nous voyions');
  assert.equal(forms('aller', 'subj')[0], "que j'aille");
});

test('passé composé with avoir and être agreement', () => {
  assert.equal(forms('prendre', 'pc')[0], "j'ai pris");
  assert.equal(forms('aller', 'pc')[0], 'je suis allé(e)');
  assert.equal(forms('aller', 'pc')[3], 'nous sommes allé(e)s');
  const row = C.conjugate(VERBS, V('aller'), 'pc')[3];
  assert.equal(C.checkConjugation('sommes allés', row), 'exact');
  assert.equal(C.checkConjugation('nous sommes allées', row), 'exact');
  assert.equal(C.checkConjugation('sommes allé', row), 'wrong');
});

test('answer checking: pronouns, accents, punctuation', () => {
  const row = C.conjugate(VERBS, V('être'), 'subj')[2];
  assert.equal(C.checkConjugation('soit', row), 'exact');
  assert.equal(C.checkConjugation("qu'il soit", row), 'exact');
  assert.equal(C.checkConjugation('Qu’elle soit.', row), 'exact');
  const r2 = C.conjugate(VERBS, V('recevoir'), 'pres')[0];
  assert.equal(C.checkConjugation('recois', r2), 'accent');
  assert.equal(C.check('  La  Réunion ', ['la réunion']), 'exact');
  assert.equal(C.check('', ['x']), 'wrong');
});

test('every verb conjugates in every tense without gaps', () => {
  for (const v of VERBS) for (const t of C.TENSES) {
    const rows = C.conjugate(VERBS, v, t.id);
    assert.equal(rows.length, 6, v.inf + ' ' + t.id);
    for (const r of rows) assert.ok(r.form && !r.form.includes('undefined'), v.inf + ' ' + t.id);
  }
});

test('vocabulary data is well formed and unique', () => {
  const ids = new Set();
  for (const v of VOCAB) {
    for (const k of ['fr', 'en', 'ex', 'exEn', 't']) assert.ok(v[k], `${v.fr} missing ${k}`);
    assert.ok(!ids.has(v.fr), 'duplicate ' + v.fr);
    ids.add(v.fr);
  }
  const blanks = VOCAB.filter(v => C.blankSentence(v)).length;
  assert.ok(blanks > VOCAB.length / 2, 'enough fill-in-the-blank items: ' + blanks);
  assert.equal(C.blankSentence({ fr: 'le car', ex: "On a pris le car pour aller." }).answer, 'car');
});

test('spaced repetition intervals grow and lapses reset', () => {
  let c = C.schedule(null, 2, 100);
  assert.equal(c.due, 101);
  c = C.schedule(c, 2, 101); assert.equal(c.ivl, 3);
  c = C.schedule(c, 2, 104); assert.ok(c.ivl >= 7);
  const lapsed = C.schedule(c, 0, 120);
  assert.equal(lapsed.due, 120); assert.equal(lapsed.reps, 0); assert.ok(lapsed.ease < c.ease);
  assert.equal(C.schedule(null, 3, 0).ivl, 4);
});

test('interface strings: every key has English and French, and every key used exists', () => {
  require('../js/i18n.js');
  for (const [k, v] of Object.entries(STRINGS)) {
    assert.ok(Array.isArray(v) && v.length === 2 && v[0] && v[1], 'bad string ' + k);
    const holes = s => (s.match(/\{\d\}/g) || []).sort().join();
    assert.equal(holes(v[0]), holes(v[1]), 'placeholder mismatch in ' + k);
  }
  const src = require('fs').readFileSync(require('path').join(__dirname, '../js/app.js'), 'utf8');
  const used = [...src.matchAll(/\bt[p]?\('([a-zA-Z0-9_]+)'\s*[,)]/g)].map(m => m[1]);
  for (const k of used) assert.ok(STRINGS[k], 'missing string ' + k);
  for (const prefix of ['tense_', 'lvl', 'g', 'q_', 'fb_', 'nav_']) assert.ok(Object.keys(STRINGS).some(k => k.startsWith(prefix)), prefix);
  for (const tn of C.TENSES) assert.ok(STRINGS['tense_' + tn.id], 'tense ' + tn.id);
});
