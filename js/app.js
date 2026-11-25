// UI: a small hash-routed single-page app. Logic lives in core.js.
(function () {
  'use strict';
  const C = window.Core, VOCAB = window.VOCAB, VERBS = window.VERBS;
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
    cards: {}, days: {}, newCount: { day: -1, n: 0 },
    settings: { newPerDay: 10, rate: 0.9, autoSpeak: true, direction: 'fr-en', themes: [],
      verbTenses: ['pres', 'pc', 'imp', 'fut'], verbList: [] }
  });
  function load() {
    try {
      const d = JSON.parse(localStorage.getItem(KEY) || 'null');
      if (d && d.cards) { const def = defaults(); return { ...def, ...d, settings: { ...def.settings, ...(d.settings || {}) } }; }
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
  const speakBtn = text => TTS.ok ? `<button type="button" class="speak" data-say="${esc(text)}" aria-label="Écouter">🔊</button>` : '';
  // Any element with data-say speaks on tap, without triggering the tap underneath (e.g. flipping a card).
  document.addEventListener('click', e => {
    const b = e.target.closest('[data-say]');
    if (b) { e.stopPropagation(); e.preventDefault(); speak(b.dataset.say); }
  }, true);

  // ---------- Vocabulary helpers ----------
  const THEMES = [...new Set(VOCAB.map(v => v.t))];
  const pool = () => { const t = S.settings.themes; const p = VOCAB.filter(v => !t.length || t.includes(v.t)); return p.length >= 4 ? p : VOCAB; };
  const gTag = v => v.g ? ` <span class="g">(${esc(v.g)})</span>` : '';
  const progressBar = (i, n) => `<div class="progress"><i style="width:${n ? i / n * 100 : 0}%"></i></div>`;

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
    <input type="text" id="ans" autocomplete="off" autocapitalize="off" autocorrect="off" spellcheck="false" placeholder="Votre réponse" lang="fr">
    ${accentBar()}<button class="btn primary block" id="check">Vérifier</button></form>`;
  const FEEDBACK = { exact: ['ok', '✓ Correct !'], accent: ['almost', '≈ Presque ! Attention aux accents.'], wrong: ['no', '✗ Pas tout à fait.'] };
  function lockForm() { $('#ans').disabled = true; $('#check')?.remove(); $('.accents')?.remove(); }

  // ---------- Home ----------
  function home() {
    const t = today(), p = pool();
    const due = p.filter(v => S.cards[v.fr] && S.cards[v.fr].due <= t).length;
    const fresh = Math.min(p.filter(v => !S.cards[v.fr]).length, Math.max(0, S.settings.newPerDay - newUsedToday()));
    const learned = VOCAB.filter(v => S.cards[v.fr]).length;
    const ds = S.days[t] || { reviewed: 0, total: 0 };
    const w = VOCAB[t % VOCAB.length];
    view.innerHTML = `
      <h1>Bonjour !</h1>
      <div class="stats">
        <div class="stat"><b>${streak()}</b><span>jours de suite 🔥</span></div>
        <div class="stat"><b>${learned}</b><span>mots vus sur ${VOCAB.length}</span></div>
        <div class="stat"><b>${ds.reviewed + ds.total}</b><span>exercices aujourd'hui</span></div>
      </div>
      <div class="panel wotd">
        <div class="kind">Mot du jour · ${esc(w.t)}</div>
        <div class="word">${esc(w.fr)}${gTag(w)} ${speakBtn(w.fr)}</div>
        <div>${esc(w.en)}</div>
        <p class="example" style="justify-content:flex-start">« ${esc(w.ex)} » ${speakBtn(w.ex)}</p>
        <div class="muted small">${esc(w.exEn)}</div>
      </div>
      <div class="menu">
        <a class="btn ${due + fresh ? 'primary' : ''}" href="#cards">🃏 Réviser les cartes <small>${due} à revoir · ${fresh} nouvelles</small></a>
        <a class="btn" href="#quiz">✅ Quiz de vocabulaire <small>10 questions</small></a>
        <a class="btn" href="#verbs">🔤 Conjugaison <small>${VERBS.length} verbes</small></a>
      </div>
      ${TTS.ok ? '' : '<p class="muted small">La synthèse vocale n\'est pas disponible dans ce navigateur.</p>'}`;
  }

  // ---------- Flashcards ----------
  let session = null;
  function cardsView() {
    const t = today(), p = pool();
    const due = shuffle(p.filter(v => S.cards[v.fr] && S.cards[v.fr].due <= t));
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
    s.dir = S.settings.direction === 'mixed' ? pick(['fr-en', 'en-fr']) : S.settings.direction;
    const front = s.dir === 'fr-en'
      ? `<div class="word">${esc(v.fr)}${gTag(v)} ${speakBtn(v.fr)}</div>`
      : `<div class="word">${esc(v.en)}</div>`;
    view.innerHTML = `
      ${progressBar(s.done, s.total)}
      <div class="panel flash" id="flash">
        <div class="theme">${esc(v.t)}${S.cards[v.fr] ? '' : ' · nouveau'}</div>
        ${front}
        <div id="back"></div>
        <p class="muted small" id="tap">Touchez la carte pour la retourner</p>
      </div>
      <div id="actions"><button class="btn primary block" id="flip">Voir la réponse</button></div>`;
    $('#flash').onclick = flip; $('#flip').onclick = flip;
    if (s.dir === 'fr-en' && S.settings.autoSpeak) speak(v.fr);
  }
  function intervalLabel(v, g) {
    if (g === 0) return 'à revoir';
    const ivl = C.schedule(S.cards[v.fr], g, today()).ivl;
    return ivl === 1 ? '1 jour' : ivl + ' jours';
  }
  function flip() {
    const s = session; if (s.flipped) return; s.flipped = true;
    const v = s.queue[0];
    const answer = s.dir === 'fr-en'
      ? `<div class="word" style="font-size:1.4rem">${esc(v.en)}</div>`
      : `<div class="word">${esc(v.fr)}${gTag(v)} ${speakBtn(v.fr)}</div>`;
    $('#back').innerHTML = `<hr>${answer}<p class="example">« ${esc(v.ex)} » ${speakBtn(v.ex)}</p><div class="muted small">${esc(v.exEn)}</div>`;
    $('#tap').remove();
    const labels = ['Encore', 'Difficile', 'Bien', 'Facile'], cls = ['again', '', 'good', ''];
    $('#actions').innerHTML = `<div class="grades">${labels.map((l, g) =>
      `<button class="btn ${cls[g]}" data-grade="${g}">${l}<small>${intervalLabel(v, g)}</small></button>`).join('')}</div>`;
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
      <h1>${nothingDue ? 'Rien à réviser' : 'Bravo !'}</h1>
      <p>${nothingDue ? 'Toutes vos cartes sont à jour.' : `${session.total} cartes terminées.`} Revenez demain pour la suite.</p>
      <div class="row">
        ${left.length ? `<button class="btn primary" id="more">+10 nouvelles cartes</button>` : ''}
        <a class="btn" href="#quiz">Faire un quiz</a>
      </div></div>`;
    if (left.length) $('#more').onclick = () => startSession(shuffle(left).slice(0, 10));
  }

  // ---------- Vocabulary quiz ----------
  let quiz = null;
  function quizView() {
    const p = pool(), qs = [], used = new Set();
    const types = ['mcFrEn', 'mcEnFr', 'type', 'blank', 'blank'];
    if (TTS.ok) types.push('listen');
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
      case 'mcFrEn': return { type, v, kind: 'Que veut dire…', prompt: `${esc(v.fr)}${gTag(v)} ${speakBtn(v.fr)}`, options: shuffle([v.en, ...distract('en')]), answer: v.en };
      case 'listen': return { type, v, kind: 'Écoutez et choisissez', prompt: `<button type="button" class="btn" data-say="${esc(v.fr)}">🔊 Réécouter</button>`, options: shuffle([v.en, ...distract('en')]), answer: v.en };
      case 'mcEnFr': return { type, v, kind: 'Comment dit-on…', prompt: esc(v.en), options: shuffle([v.fr, ...distract('fr')]), answer: v.fr };
      case 'type': return { type, v, kind: 'Écrivez en français', prompt: esc(v.en), answers: [v.fr, C.headword(v.fr)] };
      case 'blank': {
        const b = C.blankSentence(v);
        if (!b) return null;
        return { type, v, kind: 'Complétez la phrase', answers: [b.answer],
          prompt: `« ${esc(b.text)} »<div class="muted small" style="font-weight:400;margin-top:6px">${esc(v.exEn)}</div>` };
      }
    }
  }
  function showQuestion() {
    const q = quiz.qs[quiz.i];
    if (!q) return quizFinished();
    view.innerHTML = `
      ${progressBar(quiz.i, quiz.qs.length)}
      <div class="panel">
        <div class="kind">Question ${quiz.i + 1}/${quiz.qs.length} · ${q.kind}</div>
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
    const [cls, msg] = FEEDBACK[r];
    $('#fb').innerHTML = `
      <div class="feedback ${cls}">${msg}<div class="answer" style="margin-top:6px">${esc(v.fr)}${gTag(v)} = ${esc(v.en)}</div></div>
      <p class="example" style="justify-content:flex-start">« ${esc(v.ex)} » ${speakBtn(v.ex)}</p>
      <button class="btn primary block" id="next">${quiz.i + 1 < quiz.qs.length ? 'Suivant →' : 'Voir le résultat'}</button>`;
    $('#next').onclick = () => { quiz.i++; showQuestion(); };
    $('#next').focus({ preventScroll: true });
    if (S.settings.autoSpeak && q.type !== 'listen' && q.type !== 'mcFrEn') speak(v.fr);
  }
  const verdict = (s, n) => s === n ? 'Parfait ! 🏆' : s >= n * 0.7 ? 'Très bien ! 👏' : 'Continuez, ça vient ! 💪';
  function quizFinished() {
    const n = quiz.qs.length, s = quiz.score;
    view.innerHTML = `<div class="panel empty"><h1>Résultat</h1><div class="score">${s}/${n}</div><p>${verdict(s, n)}</p>
      <div class="row"><button class="btn primary" id="again">Nouveau quiz</button><a class="btn" href="#cards">Cartes</a></div></div>`;
    $('#again').onclick = quizView;
  }

  // ---------- Verbs ----------
  let verbMode = 'drill', tableVerb = 'être', drill = null;
  const V = inf => VERBS.find(v => v.inf === inf);
  const tenseName = id => C.TENSES.find(t => t.id === id).name;
  const conjTable = (v, t, hl = -1) => `<table class="conj">${C.conjugate(VERBS, v, t).map((r, i) =>
    `<tr class="${i === hl ? 'hl' : ''}" data-say="${esc(r.full)}"><td>${esc(r.full)}</td><td>${TTS.ok ? '🔊' : ''}</td></tr>`).join('')}</table>`;

  function verbsView() {
    view.innerHTML = `<h1>Conjugaison</h1>
      <div class="seg"><button data-mode="drill">Entraînement</button><button data-mode="table">Tableaux</button></div>
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
        <h2 style="margin-top:0">Temps</h2>
        <div class="chips">${C.TENSES.map(t => `<button class="chip ${st.verbTenses.includes(t.id) ? 'on' : ''}" data-tense="${t.id}">${t.name}</button>`).join('')}</div>
        <h2>Verbes <span class="muted small">(aucun sélectionné = tous)</span></h2>
        <div class="chips">${VERBS.map(v => `<button class="chip ${st.verbList.includes(v.inf) ? 'on' : ''}" data-verb="${esc(v.inf)}">${esc(v.inf)}</button>`).join('')}</div>
      </div>
      <button class="btn primary block" id="start">Commencer (10 questions)</button>`;
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
    const pron = q.t === 'subj' ? ((q.p === 2 || q.p === 5) ? "qu'" : 'que ') + C.PRON[q.p] : C.PRON[q.p];
    view.innerHTML = `
      ${progressBar(drill.i, drill.qs.length)}
      <div class="panel">
        <div class="kind">${drill.i + 1}/${drill.qs.length} · ${tenseName(q.t)}</div>
        <div class="prompt">${esc(q.v.inf)} <span class="muted small" style="font-weight:400">(${esc(q.v.en)})</span></div>
        ${answerForm(`<b style="color:var(--ink);font-size:1.1rem">${esc(pron)}</b> …`)}
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
      const [cls, msg] = FEEDBACK[r];
      $('#fb').innerHTML = `
        <div class="feedback ${cls}">${msg}<div class="answer" style="margin-top:6px">${esc(row.full)}</div></div>
        <div class="muted small">${tenseName(q.t)} de « ${esc(q.v.inf)} » :</div>
        ${conjTable(q.v, q.t, q.p)}
        <button class="btn primary block" id="next" style="margin-top:12px">${drill.i + 1 < drill.qs.length ? 'Suivant →' : 'Voir le résultat'}</button>`;
      $('#next').onclick = () => { drill.i++; showDrill(); };
      $('#next').focus({ preventScroll: true });
      if (S.settings.autoSpeak) speak(row.full);
    };
    $('#ans').focus();
  }
  function drillFinished() {
    const n = drill.qs.length, s = drill.score;
    view.innerHTML = `<div class="panel empty"><h1>Résultat</h1><div class="score">${s}/${n}</div><p>${verdict(s, n)}</p>
      <div class="row"><button class="btn primary" id="again">Encore 10</button><button class="btn" id="setup">Changer les réglages</button></div></div>`;
    $('#again').onclick = startDrill;
    $('#setup').onclick = verbsView;
  }
  function verbTables() {
    const v = V(tableVerb);
    $('#vbody').innerHTML = `
      <select id="vsel" aria-label="Verbe">${VERBS.map(x => `<option value="${esc(x.inf)}" ${x.inf === tableVerb ? 'selected' : ''}>${esc(x.inf)} — ${esc(x.en)}</option>`).join('')}</select>
      <p class="muted small">Auxiliaire : <b>${v.aux}</b> · participe passé : <b>${esc(v.pp)}</b>${TTS.ok ? ' · touchez une ligne pour l\'écouter' : ''}</p>
      ${C.TENSES.map(t => `<div class="panel"><h2 style="margin-top:0">${t.name}</h2>${conjTable(v, t.id)}</div>`).join('')}`;
    $('#vsel').onchange = e => { tableVerb = e.target.value; verbTables(); };
  }

  // ---------- Settings ----------
  function voiceStatus() {
    if (!TTS.ok) return 'Synthèse vocale indisponible dans ce navigateur.';
    if (TTS.voice) return `Voix : ${esc(TTS.voice.name)}`;
    return 'Aucune voix française détectée. Si le test reste muet : Paramètres Android › Synthèse vocale › installez le français.';
  }
  function settingsView() {
    const st = S.settings;
    view.innerHTML = `<h1>Réglages</h1>
      <div class="panel">
        <h2 style="margin-top:0">Cartes</h2>
        <div class="setting"><label for="npd">Nouvelles cartes par jour</label>
          <select id="npd" style="width:auto">${[5, 10, 15, 20, 30].map(n => `<option ${n === st.newPerDay ? 'selected' : ''}>${n}</option>`).join('')}</select></div>
        <div class="setting"><label for="dir">Sens des cartes</label>
          <select id="dir" style="width:auto"><option value="fr-en">Français → anglais</option><option value="en-fr">Anglais → français</option><option value="mixed">Mélangé</option></select></div>
        <h2>Thèmes <span class="muted small">(aucun = tous)</span></h2>
        <div class="chips">${THEMES.map(t => `<button class="chip ${st.themes.includes(t) ? 'on' : ''}" data-theme="${esc(t)}">${esc(t)} · ${VOCAB.filter(v => v.t === t).length}</button>`).join('')}</div>
      </div>
      <div class="panel">
        <h2 style="margin-top:0">Prononciation</h2>
        <div class="setting"><label for="auto">Lecture automatique</label><input type="checkbox" class="toggle" id="auto" ${st.autoSpeak ? 'checked' : ''}></div>
        <div class="setting"><label for="rate">Vitesse <b id="rv">${st.rate.toFixed(1)}</b></label><input type="range" id="rate" min="0.5" max="1.3" step="0.1" value="${st.rate}"></div>
        <div class="setting"><span class="small" id="vs">${voiceStatus()}</span><button class="btn" data-say="Bonjour ! Comment allez-vous aujourd'hui ?">🔊 Tester</button></div>
      </div>
      <div class="panel">
        <h2 style="margin-top:0">Progression</h2>
        <p class="small muted">Votre progression est enregistrée sur ce téléphone uniquement. Exportez-la de temps en temps pour la garder en sécurité.</p>
        <div class="row"><button class="btn" id="exp">⬇ Exporter</button><label class="btn">⬆ Importer<input type="file" id="imp" accept=".json,application/json" hidden></label></div>
        <button class="btn block" id="reset" style="margin-top:10px;color:var(--red)">Tout réinitialiser</button>
      </div>
      <p class="muted small" style="text-align:center">${VOCAB.length} mots · ${VERBS.length} verbes · hors ligne ✓</p>`;
    $('#dir').value = st.direction;
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
        if (!confirm('Remplacer la progression actuelle par ce fichier ?')) return;
        localStorage.setItem(KEY, JSON.stringify(d)); S = load(); alert('Progression importée.'); location.hash = '#home';
      }).catch(() => alert('Fichier invalide.'));
    };
    $('#reset').onclick = () => {
      if (!confirm('Effacer toute votre progression ? Cette action est irréversible.')) return;
      S = defaults(); save(); location.hash = '#home';
    };
    if (TTS.ok) speechSynthesis.addEventListener('voiceschanged', () => { const el = $('#vs'); if (el) el.innerHTML = voiceStatus(); }, { once: true });
  }

  // ---------- Router ----------
  const routes = { home, cards: cardsView, quiz: quizView, verbs: verbsView, settings: settingsView };
  function route() {
    if (TTS.ok) speechSynthesis.cancel();
    const r = location.hash.slice(1) || 'home';
    (routes[r] || home)();
    $$('.tabs a').forEach(a => a.classList.toggle('on', a.getAttribute('href') === '#' + r));
    window.scrollTo(0, 0);
  }
  window.addEventListener('hashchange', route);
  route();
})();
