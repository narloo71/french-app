// UI: a small hash-routed single-page app. Logic lives in core.js, interface text in i18n.js.
(function () {
  'use strict';
  const C = window.Core, VOCAB = window.VOCAB, VERBS = window.VERBS, STRINGS = window.STRINGS, PRON_EN = window.PRON_EN;
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => [...r.querySelectorAll(s)];
  const view = $('#view');
  const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const shuffle = a => { a = [...a]; for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };
  const pick = a => a[Math.floor(Math.random() * a.length)];
  const toggleIn = (arr, x) => { const i = arr.indexOf(x); i < 0 ? arr.push(x) : arr.splice(i, 1); };

  // ---------- Storage ----------
  const KEY = 'francais-app-v1';
  const defaults = () => ({
    cards: {}, days: {}, newCount: { day: -1, n: 0 }, maxLevel: 1,
    settings: { newPerDay: 10, rate: 0.9, autoSpeak: true, direction: 'auto', immersion: 'auto', themes: [],
      verbTenses: ['pres', 'pc', 'imp', 'fut'], verbList: [] }
  });
  function load() {
    try {
      const d = JSON.parse(localStorage.getItem(KEY) || 'null');
      if (d && d.cards) {
        const def = defaults();
        const fromV1 = d.settings && !('immersion' in d.settings); // saved before immersion levels existed
        const s = { ...def, ...d, settings: { ...def.settings, ...(d.settings || {}) } };
        if (fromV1) s.settings.direction = 'auto';
        return s;
      }
    } catch (e) { /* corrupted: start fresh */ }
    return defaults();
  }
  let S = load();
  const save = () => { try { localStorage.setItem(KEY, JSON.stringify(S)); } catch (e) { /* storage full or blocked */ } };

  const today = () => { const d = new Date(); return Math.floor((d.getTime() - d.getTimezoneOffset() * 60000) / 86400000); };
  const dayStats = () => (S.days[today()] ||= { reviewed: 0, correct: 0, total: 0 });
  const active = n => { const d = S.days[n]; return !!d && (d.reviewed > 0 || d.total > 0); };
  function streak() { let n = today(), s = 0; if (!active(n)) n--; while (active(n)) { s++; n--; } return s; }
  const newUsedToday = () => S.newCount.day === today() ? S.newCount.n : 0;

  // ---------- Immersion levels ----------
  // 1 English UI · 2 French with English glosses · 3 French UI · 4 French UI, translations hidden.
  const LEVEL_AT = [0, 15, 40, 75]; // words learned needed to reach levels 1..4
  const learnedCount = () => VOCAB.filter(v => S.cards[v.fr] && S.cards[v.fr].reps >= 2).length;
  function level() {
    if (S.settings.immersion !== 'auto') return +S.settings.immersion;
    const n = learnedCount();
    const reached = LEVEL_AT.reduce((l, th, i) => n >= th ? i + 1 : l, 1);
    if (reached > (S.maxLevel || 1)) { S.maxLevel = reached; save(); } // never drop back a level
    return S.maxLevel || 1;
  }
  const fill = (s, args) => s.replace(/\{(\d)\}/g, (_, i) => args[i]);
  // HTML text for the current level. Level 2 shows French with a small English gloss.
  function t(key, ...args) {
    const [en, fr] = STRINGS[key].map(s => fill(s, args));
    const lv = level();
    if (lv === 1) return esc(en);
    if (lv === 2 && en !== fr) return `<span class="bi">${esc(fr)}<span class="gloss">${esc(en)}</span></span>`;
    return esc(fr);
  }
  // Plain text (for <option>, placeholders, dialogs): level 2 puts the English in brackets.
  function tp(key, ...args) {
    const [en, fr] = STRINGS[key].map(s => fill(s, args));
    const lv = level();
    return lv === 1 ? en : lv === 2 && en !== fr ? `${fr} (${en})` : fr;
  }
  const translation = text => level() >= 4
    ? `<button type="button" class="reveal" data-reveal="${esc(text)}">${t('showTranslation')}</button>`
    : `<div class="muted small">${esc(text)}</div>`;
  function cardDirection() {
    const d = S.settings.direction;
    if (d === 'mixed') return pick(['fr-en', 'en-fr']);
    if (d !== 'auto') return d;
    const enFrChance = [0, 0, 0.2, 0.5, 0.7][level()];
    return Math.random() < enFrChance ? 'en-fr' : 'fr-en';
  }
  // Early levels lean on recognition (multiple choice); later ones on production (typing).
  function quizTypes() {
    const byLevel = {
      1: ['mcFrEn', 'mcFrEn', 'mcEnFr', 'listen'],
      2: ['mcFrEn', 'mcEnFr', 'listen', 'blank'],
      3: ['mcFrEn', 'mcEnFr', 'listen', 'blank', 'type'],
      4: ['mcEnFr', 'listen', 'blank', 'blank', 'type', 'type']
    }[level()];
    return TTS.ok ? byLevel : byLevel.filter(x => x !== 'listen');
  }

  // ---------- Speech ----------
  const TTS = { ok: 'speechSynthesis' in window, voice: null };
  function pickVoice() {
    const vs = speechSynthesis.getVoices();
    TTS.voice = vs.find(v => v.lang.replace('_', '-') === 'fr-FR') || vs.find(v => /^fr/i.test(v.lang)) || null;
  }
  if (TTS.ok) { pickVoice(); speechSynthesis.addEventListener('voiceschanged', pickVoice); }
  function speak(text) {
    if (!TTS.ok || !text) return;
    speechSynthesis.cancel();
    const u = new SpeechSynthesisUtterance(C.speakable(text));
    u.lang = 'fr-FR';
    if (TTS.voice) u.voice = TTS.voice;
    u.rate = S.settings.rate;
    speechSynthesis.speak(u);
  }
  const speakBtn = text => TTS.ok ? `<button type="button" class="speak" data-say="${esc(text)}" aria-label="🔊">🔊</button>` : '';
  // data-say speaks and data-reveal shows a hidden translation, without triggering the tap underneath (e.g. flipping a card).
  document.addEventListener('click', e => {
    const say = e.target.closest('[data-say]');
    if (say) { e.stopPropagation(); e.preventDefault(); speak(say.dataset.say); return; }
    const rev = e.target.closest('[data-reveal]');
    if (rev) {
      e.stopPropagation(); e.preventDefault();
      const div = document.createElement('div'); div.className = 'muted small'; div.textContent = rev.dataset.reveal;
      rev.replaceWith(div);
    }
  }, true);

  // ---------- Vocabulary helpers ----------
  const THEMES = [...new Set(VOCAB.map(v => v.t))];
  const pool = () => { const th = S.settings.themes; const p = VOCAB.filter(v => !th.length || th.includes(v.t)); return p.length >= 4 ? p : VOCAB; };
  const gTag = v => v.g ? ` <span class="g">(${esc(v.g)})</span>` : '';
  const progressBar = (i, n) => `<div class="progress"><i style="width:${n ? Math.min(100, Math.max(0, i / n * 100)) : 0}%"></i></div>`;

  const ACCENTS = ['é', 'è', 'ê', 'à', 'â', 'ç', 'ù', 'û', 'ô', 'î', 'ï', 'ë', 'œ'];
  const accentBar = () => `<div class="accents">${ACCENTS.map(a => `<button type="button" data-acc="${a}">${a}</button>`).join('')}</div>`;
  function bindAccents() {
    $$('[data-acc]').forEach(b => {
      const keepFocus = e => e.preventDefault();
      b.onpointerdown = keepFocus; b.onmousedown = keepFocus;
      b.onclick = () => {
        const i = $('#ans'); if (!i || i.disabled) return;
        const s = i.selectionStart ?? i.value.length, e = i.selectionEnd ?? i.value.length;
        i.value = i.value.slice(0, s) + b.dataset.acc + i.value.slice(e);
        i.focus(); i.setSelectionRange(s + 1, s + 1);
      };
    });
  }
  const answerForm = label => `<form id="f">${label ? `<label for="ans" class="muted">${label}</label>` : ''}
    <input type="text" id="ans" autocomplete="off" autocapitalize="off" autocorrect="off" spellcheck="false" placeholder="${esc(tp('yourAnswer'))}" lang="fr">
    ${accentBar()}<button class="btn primary block" id="check">${t('check')}</button></form>`;
  const feedbackBox = r => `<div class="feedback ${{ exact: 'ok', accent: 'almost', wrong: 'no' }[r]}">${t('fb_' + r)}`;
  function lockForm() { $('#ans').disabled = true; $('#check')?.remove(); $('.accents')?.remove(); }
  const verdict = (s, n) => t(s === n ? 'perfect' : s >= n * 0.7 ? 'veryGood' : 'keepGoing');

  // ---------- Home ----------
  function home() {
    const now = today(), p = pool(), lv = level();
    const due = p.filter(v => S.cards[v.fr] && S.cards[v.fr].due <= now).length;
    const fresh = Math.min(p.filter(v => !S.cards[v.fr]).length, Math.max(0, S.settings.newPerDay - newUsedToday()));
    const learned = learnedCount();
    const ds = S.days[now] || { reviewed: 0, total: 0 };
    const w = VOCAB[now % VOCAB.length];
    const leveledUp = S.shownLevel !== undefined && lv > S.shownLevel;
    if (S.shownLevel !== lv) { S.shownLevel = lv; save(); }

    let levelInfo;
    if (S.settings.immersion !== 'auto') levelInfo = `<div class="muted small">${t('fixedLevel')}</div>`;
    else if (lv >= 4) levelInfo = `<div class="muted small">${t('maxLevel')}</div>`;
    else {
      levelInfo = `<div class="muted small">${t('toNext', Math.max(1, LEVEL_AT[lv] - learned))}</div>`;
    }

    view.innerHTML = `
      ${leveledUp ? `<div class="feedback ok">🎉 ${t('levelUp')}</div>` : ''}
      <h1>${t('hello')}</h1>
      <div class="stats">
        <div class="stat"><b>${streak()} 🔥</b><span>${t('streak')}</span></div>
        <div class="stat"><b>${learned}</b><span>${t('learnedOf', VOCAB.length)}</span></div>
        <div class="stat"><b>${ds.reviewed + ds.total}</b><span>${t('today')}</span></div>
      </div>
      <div class="panel level">
        <div class="kind">${t('immersion')}</div>
        <div class="lvname">${t('levelN', lv)} · ${t('lvl' + lv)}</div>
        <div class="dots">${[1, 2, 3, 4].map(i => `<i class="${i <= lv ? 'on' : ''}"></i>`).join('')}</div>
        ${levelInfo}
      </div>
      <div class="panel wotd">
        <div class="kind">${t('wotd')} · ${esc(w.t)}</div>
        <div class="word">${esc(w.fr)}${gTag(w)} ${speakBtn(w.fr)}</div>
        <div>${esc(w.en)}</div>
        <p class="example" style="justify-content:flex-start">« ${esc(w.ex)} » ${speakBtn(w.ex)}</p>
        ${translation(w.exEn)}
      </div>
      <div class="menu">
        <a class="btn ${due + fresh ? 'primary' : ''}" href="#cards">🃏 ${t('reviewCards')} <small>${t('dueNew', due, fresh)}</small></a>
        <a class="btn" href="#quiz">✅ ${t('vocabQuiz')} <small>${t('tenQuestions')}</small></a>
        <a class="btn" href="#verbs">🔤 ${t('conjugation')} <small>${t('nVerbs', VERBS.length)}</small></a>
      </div>
      ${TTS.ok ? '' : `<p class="muted small">${t('noTts')}</p>`}`;
  }

  // ---------- Flashcards ----------
  let session = null;
  function cardsView() {
    const now = today(), p = pool();
    const due = shuffle(p.filter(v => S.cards[v.fr] && S.cards[v.fr].due <= now));
    const fresh = shuffle(p.filter(v => !S.cards[v.fr])).slice(0, Math.max(0, S.settings.newPerDay - newUsedToday()));
    startSession(due.concat(fresh));
  }
  function startSession(queue) {
    session = { queue, done: 0, total: queue.length, flipped: false, dir: 'fr-en' };
    queue.length ? showCard() : cardsFinished(true);
  }
  function showCard() {
    const s = session, v = s.queue[0];
    if (!v) return cardsFinished(false);
    s.flipped = false;
    s.dir = cardDirection();
    const front = s.dir === 'fr-en'
      ? `<div class="word">${esc(v.fr)}${gTag(v)} ${speakBtn(v.fr)}</div>`
      : `<div class="word">${esc(v.en)}</div>`;
    view.innerHTML = `
      ${progressBar(s.done, s.total)}
      <div class="panel flash" id="flash">
        <div class="theme">${esc(v.t)}${S.cards[v.fr] ? '' : ' · ' + t('isNew')}</div>
        ${front}
        <div id="back"></div>
        <p class="muted small" id="tap">${t('tapFlip')}</p>
      </div>
      <div id="actions"><button class="btn primary block" id="flip">${t('showAnswer')}</button></div>`;
    $('#flash').onclick = flip; $('#flip').onclick = flip;
    if (s.dir === 'fr-en' && S.settings.autoSpeak) speak(v.fr);
  }
  function intervalLabel(v, g) {
    if (g === 0) return t('againSoon');
    const ivl = C.schedule(S.cards[v.fr], g, today()).ivl;
    return ivl === 1 ? t('oneDay') : t('nDays', ivl);
  }
  function flip() {
    const s = session; if (s.flipped) return; s.flipped = true;
    const v = s.queue[0];
    const answer = s.dir === 'fr-en'
      ? `<div class="word" style="font-size:1.4rem">${esc(v.en)}</div>`
      : `<div class="word">${esc(v.fr)}${gTag(v)} ${speakBtn(v.fr)}</div>`;
    $('#back').innerHTML = `<hr>${answer}<p class="example">« ${esc(v.ex)} » ${speakBtn(v.ex)}</p>${translation(v.exEn)}`;
    $('#tap').remove();
    const cls = ['again', '', 'good', ''];
    $('#actions').innerHTML = `<div class="grades">${[0, 1, 2, 3].map(g =>
      `<button class="btn ${cls[g]}" data-grade="${g}">${t('g' + g)}<small>${intervalLabel(v, g)}</small></button>`).join('')}</div>`;
    $$('[data-grade]').forEach(b => b.onclick = () => rate(+b.dataset.grade));
    if (s.dir === 'en-fr' && S.settings.autoSpeak) speak(v.fr);
  }
  function rate(g) {
    const s = session, v = s.queue.shift();
    if (!S.cards[v.fr]) {
      if (S.newCount.day !== today()) S.newCount = { day: today(), n: 0 };
      S.newCount.n++;
    }
    S.cards[v.fr] = C.schedule(S.cards[v.fr], g, today());
    dayStats().reviewed++;
    if (g === 0) s.queue.splice(Math.min(3, s.queue.length), 0, v); // see it again shortly
    else s.done++;
    save();
    showCard();
  }
  function cardsFinished(nothingDue) {
    const left = pool().filter(v => !S.cards[v.fr]);
    view.innerHTML = `<div class="panel empty">
      <div class="big">${nothingDue ? '☕' : '🎉'}</div>
      <h1>${t(nothingDue ? 'nothingDue' : 'wellDone')}</h1>
      <p>${nothingDue ? t('upToDate') : t('nFinished', session.total)} ${t('comeBack')}</p>
      <div class="row">
        ${left.length ? `<button class="btn primary" id="more">${t('moreCards')}</button>` : ''}
        <a class="btn" href="#quiz">${t('takeQuiz')}</a>
      </div></div>`;
    if (left.length) $('#more').onclick = () => startSession(shuffle(left).slice(0, 10));
  }

  // ---------- Vocabulary quiz ----------
  let quiz = null;
  function quizView() {
    const p = pool(), qs = [], used = new Set(), types = quizTypes();
    for (let guard = 0; qs.length < 10 && guard < 1000; guard++) {
      const v = pick(p);
      if (used.has(v.fr) && used.size < p.length) continue;
      const q = makeQuestion(pick(types), v, p);
      if (q) { qs.push(q); used.add(v.fr); }
    }
    quiz = { qs, i: 0, score: 0 };
    showQuestion();
  }
  function makeQuestion(type, v, p) {
    const distract = key => {
      const seen = new Set([v[key]]);
      return shuffle(p.length >= 4 ? p : VOCAB).filter(x => !seen.has(x[key]) && seen.add(x[key])).slice(0, 3).map(x => x[key]);
    };
    switch (type) {
      case 'mcFrEn': return { type, v, prompt: `${esc(v.fr)}${gTag(v)} ${speakBtn(v.fr)}`, options: shuffle([v.en, ...distract('en')]), answer: v.en };
      case 'listen': return { type, v, prompt: `<button type="button" class="btn" data-say="${esc(v.fr)}">🔊 ${t('replay')}</button>`, options: shuffle([v.en, ...distract('en')]), answer: v.en };
      case 'mcEnFr': return { type, v, prompt: esc(v.en), options: shuffle([v.fr, ...distract('fr')]), answer: v.fr };
      case 'type': return { type, v, prompt: esc(v.en), answers: [v.fr, C.headword(v.fr)] };
      case 'blank': {
        const b = C.blankSentence(v);
        if (!b) return null;
        return { type, v, answers: [b.answer],
          prompt: `« ${esc(b.text)} »<div style="font-weight:400;margin-top:6px">${translation(v.exEn)}</div>` };
      }
    }
  }
  function showQuestion() {
    const q = quiz.qs[quiz.i];
    if (!q) return quizFinished();
    view.innerHTML = `
      ${progressBar(quiz.i, quiz.qs.length)}
      <div class="panel">
        <div class="kind">${t('questionN', quiz.i + 1, quiz.qs.length)} · ${t('q_' + q.type)}</div>
        <div class="prompt">${q.prompt}</div>
        ${q.options
          ? `<div class="options">${q.options.map((o, i) => `<button class="btn" data-opt="${i}">${esc(o)}</button>`).join('')}</div>`
          : answerForm('')}
        <div id="fb"></div>
      </div>`;
    if (q.options) $$('[data-opt]').forEach(b => b.onclick = () => {
      const ok = q.options[+b.dataset.opt] === q.answer;
      $$('[data-opt]').forEach(x => {
        x.disabled = true;
        if (q.options[+x.dataset.opt] === q.answer) x.classList.add('right'); else if (x === b) x.classList.add('wrong');
      });
      finishQuestion(q, ok ? 'exact' : 'wrong');
    });
    else {
      bindAccents();
      $('#f').onsubmit = e => {
        e.preventDefault();
        if (!$('#ans').value.trim()) return;
        const r = C.check($('#ans').value, q.answers);
        lockForm(); finishQuestion(q, r);
      };
      $('#ans').focus();
    }
    if (q.type === 'listen' || (q.type === 'mcFrEn' && S.settings.autoSpeak)) speak(q.v.fr);
  }
  function finishQuestion(q, r) {
    const v = q.v, ok = r !== 'wrong';
    if (ok) quiz.score++;
    const d = dayStats(); d.total++; if (ok) d.correct++;
    if (!ok && S.cards[v.fr]) S.cards[v.fr].due = today(); // missed: bring the card back for review
    save();
    $('#fb').innerHTML = `
      ${feedbackBox(r)}<div class="answer" style="margin-top:6px">${esc(v.fr)}${gTag(v)} = ${esc(v.en)}</div></div>
      <p class="example" style="justify-content:flex-start">« ${esc(v.ex)} » ${speakBtn(v.ex)}</p>
      <button class="btn primary block" id="next">${t(quiz.i + 1 < quiz.qs.length ? 'next' : 'seeResult')}</button>`;
    $('#next').onclick = () => { quiz.i++; showQuestion(); };
    $('#next').focus({ preventScroll: true });
    if (S.settings.autoSpeak && q.type !== 'listen' && q.type !== 'mcFrEn') speak(v.fr);
  }
  function quizFinished() {
    const n = quiz.qs.length, s = quiz.score;
    view.innerHTML = `<div class="panel empty"><h1>${t('result')}</h1><div class="score">${s}/${n}</div><p>${verdict(s, n)}</p>
      <div class="row"><button class="btn primary" id="again">${t('newQuiz')}</button><a class="btn" href="#cards">${t('cards')}</a></div></div>`;
    $('#again').onclick = quizView;
  }

  // ---------- Verbs ----------
  let verbMode = 'drill', tableVerb = 'être', drill = null;
  const V = inf => VERBS.find(v => v.inf === inf);
  const conjTable = (v, tense, hl = -1) => `<table class="conj">${C.conjugate(VERBS, v, tense).map((r, i) =>
    `<tr class="${i === hl ? 'hl' : ''}" data-say="${esc(r.full)}"><td>${esc(r.full)}${level() <= 2 ? ` <span class="muted small">${esc(PRON_EN[i])}</span>` : ''}</td><td>${TTS.ok ? '🔊' : ''}</td></tr>`).join('')}</table>`;

  function verbsView() {
    view.innerHTML = `<h1>${t('conjugation')}</h1>
      <div class="seg"><button data-mode="drill">${t('practice')}</button><button data-mode="table">${t('tables')}</button></div>
      <div id="vbody"></div>`;
    $$('[data-mode]').forEach(b => {
      b.classList.toggle('on', b.dataset.mode === verbMode);
      b.onclick = () => { verbMode = b.dataset.mode; verbsView(); };
    });
    verbMode === 'drill' ? drillSetup() : verbTables();
  }
  function drillSetup() {
    const st = S.settings;
    $('#vbody').innerHTML = `<div class="panel">
        <h2 style="margin-top:0">${t('tenses')}</h2>
        <div class="chips">${C.TENSES.map(x => `<button class="chip ${st.verbTenses.includes(x.id) ? 'on' : ''}" data-tense="${x.id}">${t('tense_' + x.id)}</button>`).join('')}</div>
        <h2>${t('verbs')} <span class="muted small">${t('noneAll')}</span></h2>
        <div class="chips">${VERBS.map(v => `<button class="chip ${st.verbList.includes(v.inf) ? 'on' : ''}" data-verb="${esc(v.inf)}">${esc(v.inf)}</button>`).join('')}</div>
      </div>
      <button class="btn primary block" id="start">${t('start')}</button>`;
    $$('[data-tense]').forEach(b => b.onclick = () => {
      if (st.verbTenses.length === 1 && st.verbTenses[0] === b.dataset.tense) return; // keep at least one
      toggleIn(st.verbTenses, b.dataset.tense); b.classList.toggle('on'); save();
    });
    $$('[data-verb]').forEach(b => b.onclick = () => { toggleIn(st.verbList, b.dataset.verb); b.classList.toggle('on'); save(); });
    $('#start').onclick = startDrill;
  }
  function startDrill() {
    const st = S.settings;
    const verbs = st.verbList.map(V).filter(Boolean);
    const list = verbs.length ? verbs : VERBS;
    const qs = Array.from({ length: 10 }, () => ({ v: pick(list), t: pick(st.verbTenses), p: Math.floor(Math.random() * 6) }));
    drill = { qs, i: 0, score: 0 };
    showDrill();
  }
  function showDrill() {
    const q = drill.qs[drill.i];
    if (!q) return drillFinished();
    const lv = level();
    const pron = q.t === 'subj' ? ((q.p === 2 || q.p === 5) ? "qu'" : 'que ') + C.PRON[q.p] : C.PRON[q.p];
    const pronHint = lv <= 2 ? ` <span class="muted small">(${esc(PRON_EN[q.p])})</span>` : '';
    view.innerHTML = `
      ${progressBar(drill.i, drill.qs.length)}
      <div class="panel" data-q="${esc(q.v.inf)}|${q.t}|${q.p}">
        <div class="kind">${drill.i + 1}/${drill.qs.length} · ${t('tense_' + q.t)}</div>
        <div class="prompt">${esc(q.v.inf)}${lv <= 3 ? ` <span class="muted small" style="font-weight:400">(${esc(q.v.en)})</span>` : ''}</div>
        ${answerForm(`<b style="color:var(--ink);font-size:1.1rem">${esc(pron)}</b>${pronHint} …`)}
        <div id="fb"></div>
      </div>`;
    bindAccents();
    $('#f').onsubmit = e => {
      e.preventDefault();
      if (!$('#ans').value.trim()) return;
      const row = C.conjugate(VERBS, q.v, q.t)[q.p];
      const r = C.checkConjugation($('#ans').value, row);
      lockForm();
      if (r !== 'wrong') drill.score++;
      const d = dayStats(); d.total++; if (r !== 'wrong') d.correct++; save();
      $('#fb').innerHTML = `
        ${feedbackBox(r)}<div class="answer" style="margin-top:6px">${esc(row.full)}</div></div>
        <div class="muted small">${t('tenseOf', STRINGS['tense_' + q.t][level() === 1 ? 0 : 1], q.v.inf)}</div>
        ${conjTable(q.v, q.t, q.p)}
        <button class="btn primary block" id="next" style="margin-top:12px">${t(drill.i + 1 < drill.qs.length ? 'next' : 'seeResult')}</button>`;
      $('#next').onclick = () => { drill.i++; showDrill(); };
      $('#next').focus({ preventScroll: true });
      if (S.settings.autoSpeak) speak(row.full);
    };
    $('#ans').focus();
  }
  function drillFinished() {
    const n = drill.qs.length, s = drill.score;
    view.innerHTML = `<div class="panel empty"><h1>${t('result')}</h1><div class="score">${s}/${n}</div><p>${verdict(s, n)}</p>
      <div class="row"><button class="btn primary" id="again">${t('ten_more')}</button><button class="btn" id="setup">${t('changeSettings')}</button></div></div>`;
    $('#again').onclick = startDrill;
    $('#setup').onclick = verbsView;
  }
  function verbTables() {
    const v = V(tableVerb);
    $('#vbody').innerHTML = `
      <select id="vsel" aria-label="${esc(tp('verb'))}">${VERBS.map(x => `<option value="${esc(x.inf)}" ${x.inf === tableVerb ? 'selected' : ''}>${esc(x.inf)} — ${esc(x.en)}</option>`).join('')}</select>
      <p class="muted small">${t('auxiliary')} : <b>${v.aux}</b> · ${t('pastParticiple')} : <b>${esc(v.pp)}</b>${TTS.ok ? ' · ' + t('tapLine') : ''}</p>
      ${C.TENSES.map(x => `<div class="panel"><h2 style="margin-top:0">${t('tense_' + x.id)}</h2>${conjTable(v, x.id)}</div>`).join('')}`;
    $('#vsel').onchange = e => { tableVerb = e.target.value; verbTables(); };
  }

  // ---------- Settings ----------
  function voiceStatus() {
    if (!TTS.ok) return t('noTts');
    return TTS.voice ? t('voice', TTS.voice.name) : t('noVoice');
  }
  function settingsView() {
    const st = S.settings;
    const opt = (value, label, current) => `<option value="${value}" ${String(current) === String(value) ? 'selected' : ''}>${esc(label)}</option>`;
    view.innerHTML = `<h1>${t('settings')}</h1>
      <div class="panel">
        <h2 style="margin-top:0">${t('immersion')}</h2>
        <div class="setting"><label for="imm">${t('interfaceLang')}</label>
          <select id="imm" style="width:auto">
            ${opt('auto', tp('immAuto'), st.immersion)}
            ${[1, 2, 3, 4].map(i => opt(i, `${i} · ${tp('lvl' + i)}`, st.immersion)).join('')}
          </select></div>
        <p class="muted small">${t('immNote')} ${t('learnedHint')}</p>
      </div>
      <div class="panel">
        <h2 style="margin-top:0">${t('cards')}</h2>
        <div class="setting"><label for="npd">${t('newPerDay')}</label>
          <select id="npd" style="width:auto">${[5, 10, 15, 20, 30].map(n => opt(n, n, st.newPerDay)).join('')}</select></div>
        <div class="setting"><label for="dir">${t('direction')}</label>
          <select id="dir" style="width:auto">
            ${opt('auto', tp('dirAuto'), st.direction)}${opt('fr-en', tp('frEn'), st.direction)}${opt('en-fr', tp('enFr'), st.direction)}${opt('mixed', tp('mixed'), st.direction)}
          </select></div>
        <h2>${t('themes')} <span class="muted small">${t('noneAllThemes')}</span></h2>
        <div class="chips">${THEMES.map(x => `<button class="chip ${st.themes.includes(x) ? 'on' : ''}" data-theme="${esc(x)}">${esc(x)} · ${VOCAB.filter(v => v.t === x).length}</button>`).join('')}</div>
      </div>
      <div class="panel">
        <h2 style="margin-top:0">${t('pronunciation')}</h2>
        <div class="setting"><label for="auto">${t('autoSpeak')}</label><input type="checkbox" class="toggle" id="auto" ${st.autoSpeak ? 'checked' : ''}></div>
        <div class="setting"><label for="rate">${t('speed')} <b id="rv">${st.rate.toFixed(1)}</b></label><input type="range" id="rate" min="0.5" max="1.3" step="0.1" value="${st.rate}"></div>
        <div class="setting"><span class="small" id="vs">${voiceStatus()}</span><button class="btn" data-say="Bonjour ! Comment allez-vous aujourd'hui ?">🔊 ${t('test')}</button></div>
      </div>
      <div class="panel">
        <h2 style="margin-top:0">${t('progress')}</h2>
        <p class="small muted">${t('progressNote')}</p>
        <div class="row"><button class="btn" id="exp">⬇ ${t('export')}</button><label class="btn">⬆ ${t('import')}<input type="file" id="imp" accept=".json,application/json" hidden></label></div>
        <button class="btn block" id="reset" style="margin-top:10px;color:var(--red)">${t('resetAll')}</button>
      </div>
      <p class="muted small" style="text-align:center">${t('footer', VOCAB.length, VERBS.length)}</p>`;
    $('#imm').onchange = e => { st.immersion = e.target.value; save(); settingsView(); renderNav(); };
    $('#npd').onchange = e => { st.newPerDay = +e.target.value; save(); };
    $('#dir').onchange = e => { st.direction = e.target.value; save(); };
    $('#auto').onchange = e => { st.autoSpeak = e.target.checked; save(); };
    $('#rate').oninput = e => { st.rate = +e.target.value; $('#rv').textContent = st.rate.toFixed(1); save(); };
    $$('[data-theme]').forEach(b => b.onclick = () => { toggleIn(st.themes, b.dataset.theme); b.classList.toggle('on'); save(); });
    $('#exp').onclick = () => {
      const blob = new Blob([JSON.stringify(S)], { type: 'application/json' });
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = `francais-progression-${new Date().toISOString().slice(0, 10)}.json`;
      a.click();
      setTimeout(() => URL.revokeObjectURL(a.href), 1000);
    };
    $('#imp').onchange = e => {
      const f = e.target.files[0]; if (!f) return;
      f.text().then(txt => {
        const d = JSON.parse(txt);
        if (!d || typeof d.cards !== 'object') throw new Error('format');
        if (!confirm(tp('confirmImport'))) return;
        localStorage.setItem(KEY, JSON.stringify(d)); S = load(); alert(tp('imported')); location.hash = '#home';
      }).catch(() => alert(tp('invalidFile')));
    };
    $('#reset').onclick = () => {
      if (!confirm(tp('confirmReset'))) return;
      S = defaults(); save(); location.hash = '#home';
    };
    if (TTS.ok) speechSynthesis.addEventListener('voiceschanged', () => { const el = $('#vs'); if (el) el.innerHTML = voiceStatus(); }, { once: true });
  }

  // ---------- Router ----------
  function renderNav() {
    const lv = level();
    document.documentElement.lang = lv === 1 ? 'en' : 'fr';
    $$('.tabs a').forEach(a => { a.querySelector('em').textContent = STRINGS['nav_' + a.dataset.nav][lv === 1 ? 0 : 1]; });
    $('.gear').setAttribute('aria-label', tp('settingsLabel'));
  }
  const routes = { home, cards: cardsView, quiz: quizView, verbs: verbsView, settings: settingsView };
  function route() {
    if (TTS.ok) speechSynthesis.cancel();
    const r = location.hash.slice(1) || 'home';
    renderNav();
    (routes[r] || home)();
    $$('.tabs a').forEach(a => a.classList.toggle('on', a.getAttribute('href') === '#' + r));
    window.scrollTo(0, 0);
  }
  if ('scrollRestoration' in history) history.scrollRestoration = 'manual';
  window.addEventListener('hashchange', route);
  route();
})();
