/* app.js — interfaccia: lezioni, generazione bozza, editor, modalità studente */
(function () {
  'use strict';
  const L = window.VLLang, EX = window.VLEx, G = window.VLGen, AI = window.VLAI, ACT = window.VLAct;
  const $ = function (s, r) { return (r || document).querySelector(s); };
  const $$ = function (s, r) { return Array.from((r || document).querySelectorAll(s)); };

  function el(tag, attrs) {
    const node = document.createElement(tag);
    if (attrs) for (const k in attrs) {
      if (k === 'class') node.className = attrs[k];
      else if (k === 'text') node.textContent = attrs[k];
      else if (k === 'html') node.innerHTML = attrs[k];
      else if (k.indexOf('on') === 0) node.addEventListener(k.slice(2), attrs[k]);
      else if (attrs[k] != null) node.setAttribute(k, attrs[k]);
    }
    for (let i = 2; i < arguments.length; i++) {
      const c = arguments[i];
      if (c == null) continue;
      if (Array.isArray(c)) c.forEach(function (x) { if (x != null) node.appendChild(typeof x === 'string' ? document.createTextNode(x) : x); });
      else node.appendChild(typeof c === 'string' ? document.createTextNode(c) : c);
    }
    return node;
  }
  function toast(msg, ms) {
    const t = $('#toast'); t.textContent = msg; t.classList.add('show');
    clearTimeout(toast._t); toast._t = setTimeout(function () { t.classList.remove('show'); }, ms || 2600);
  }
  function undoKeyLabel() { return /Mac|iPhone|iPad/.test(navigator.platform || '') ? '\u2318Z' : 'Ctrl+Z'; }
  /** Barra "si può tornare indietro": messaggio + "↶ Annulla" cliccabile + la scorciatoia. Ha un elemento SUO
   *  (un avviso qualsiasi non deve cancellare la via d'uscita) e vive più a lungo di un avviso normale. */
  let undoBarEl = null;
  function dismissUndoBar(e) { if (undoBarEl && undoBarEl.contains(e.target)) return; hideUndoBar(); }
  function hideUndoBar() {
    clearTimeout(toastUndo._t);
    document.removeEventListener('pointerdown', dismissUndoBar, true);
    if (undoBarEl) { undoBarEl.classList.remove('show'); document.body.classList.remove('undo-open'); }
  }
  function toastUndo(msg, onUndo, ms) {
    const life = ms || 6000;
    if (!undoBarEl) { undoBarEl = el('div', { id: 'undo-bar', class: 'undo-bar', role: 'status' }); document.body.appendChild(undoBarEl); }
    undoBarEl.innerHTML = '';
    undoBarEl.appendChild(el('span', { text: msg }));
    undoBarEl.appendChild(el('button', { class: 'undo', text: '\u21b6 Annulla', onclick: function () { hideUndoBar(); onUndo(); } }));
    undoBarEl.appendChild(el('kbd', { text: undoKeyLabel(), title: 'Funziona anche dopo che questo avviso è sparito' }));
    // riga che si consuma: si vede quanto tempo resta (e col mouse sopra il conto si ferma)
    const life$ = el('div', { class: 'life' }); life$.style.animationDuration = life + 'ms';
    undoBarEl.appendChild(life$);
    undoBarEl.classList.add('show');
    document.body.classList.add('undo-open');   // l'avviso normale si sposta più in alto: non si coprono
    clearTimeout(toastUndo._t); toastUndo._t = setTimeout(hideUndoBar, life);
    undoBarEl.onmouseenter = function () { clearTimeout(toastUndo._t); life$.style.animationPlayState = 'paused'; };
    undoBarEl.onmouseleave = function () { life$.style.animationPlayState = 'running'; clearTimeout(toastUndo._t); toastUndo._t = setTimeout(hideUndoBar, 2500); };
    // appena si torna a lavorare (un clic altrove) la barra si toglie di mezzo da sola
    document.removeEventListener('pointerdown', dismissUndoBar, true);
    setTimeout(function () { if (undoBarEl.classList.contains('show')) document.addEventListener('pointerdown', dismissUndoBar, true); }, 500);
  }
  // v87 (Edoardo, 17/9: "sta caricando da troppo tempo"): l'attesa dev'essere leggibile e interrompibile.
  // L'overlay dice a che punto e', da quanto aspetta, e offre una via d'uscita quando chi chiama ne registra una.
  let ovT0 = 0, ovTimer = null, ovCancel = null;
  /**
   * v116: il ritmo della gara U/Play nella scritta del caricamento. Parte con la U davanti (il marchio fermo, leggibile),
   * dopo poco Play salta davanti e le lettere ballano; poi la U si riprende il posto e tutto si ferma. Gira SOLO mentre
   * l'overlay e' aperto (niente timer a vuoto) e per chi ha chiesto meno animazioni resta il marchio fermo.
   */
  let plTimer = null;
  function plRun(on) {
    const st = $('#pl-stage');
    if (on && plTimer) return;   // overlay(true, 'altro testo') mentre gira gia': la gara continua, non riparte
    if (plTimer) { clearTimeout(plTimer); plTimer = null; }
    if (!st) return;
    st.classList.remove('go');
    if (!on) return;
    if (window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    // U davanti 0,7 s la prima volta (poi 1,9 s: il tempo di vedere la pausa), Play davanti 2,6 s
    (function tick(go, wait) {
      plTimer = setTimeout(function () { st.classList.toggle('go', go); tick(!go, go ? 2600 : 1900); }, wait);
    })(true, 700);
  }
  function overlay(show, text) {
    $('#overlay').classList.toggle('show', !!show);
    plRun(!!show);
    if (text) $('#overlay-text').textContent = text;
    const step = $('#overlay-step'), time = $('#overlay-time'), btn = $('#overlay-cancel');
    if (ovTimer) { clearInterval(ovTimer); ovTimer = null; }
    if (step) step.textContent = '';
    if (time) time.textContent = '';
    if (btn) btn.hidden = true;
    if (!show) { ovCancel = null; $('#overlay-text').textContent = 'Un attimo…'; return; }
    ovT0 = Date.now();
    ovTimer = setInterval(function () {
      const s = Math.round((Date.now() - ovT0) / 1000);
      const t = $('#overlay-time'); if (!t) return;
      if (s < 8) { t.textContent = ''; return; }   // sotto gli 8 secondi il cronometro e' solo ansia
      t.textContent = (s < 60 ? s + 's' : Math.floor(s / 60) + 'm ' + String(s % 60).padStart(2, '0') + 's')
        + (s > 90 ? ' · un video lungo può richiedere qualche minuto' : '');
    }, 1000);
  }
  /** Riga sotto le mascotte: cosa sta succedendo davvero. */
  function overlayStep(msg) { const e = $('#overlay-step'); if (e) e.textContent = msg || ''; }
  /** Registra (o toglie) la via d'uscita: il pulsante compare solo se c'e' qualcosa da annullare. */
  function overlayCancel(fn) { ovCancel = fn || null; const b = $('#overlay-cancel'); if (b) b.hidden = !fn; }
  /**
   * v90 (Edoardo, 18/9: "se metto il cursore su una pausa e scorro giù per vedere i numeri dei tagli, non mi
   * fa scorrere in giù"): la colonna sinistra dell'editor è un'area di scorrimento dentro la pagina. Quando il
   * puntatore ci sta sopra la rotella muove LEI, e arrivata a fondo corsa il browser si "aggrappa" a quella
   * (scroll latching): le rotellate successive sparivano nel nulla finché non si staccava il dito. Qui il
   * passaggio di consegne lo facciamo a mano: a fondo (o a inizio) corsa la rotella muove la pagina, subito.
   */
  /**
   * v93 (Edoardo, 18/9: "voglio che mi venga segnalato con un pop-up al centro di 2 secondi che poi scompare da
   * solo"): avviso grande in mezzo allo schermo, senza pulsanti e senza bloccare niente (non è un dialog: non
   * ruba il fuoco e non ferma il lavoro). Il toast in basso resta per le conferme; questo è per le cose da vedere.
   */
  function centerNote(text, ms) {
    const vecchio = $('#center-note'); if (vecchio) vecchio.remove();
    const n = el('div', { id: 'center-note', class: 'center-note', role: 'status', 'aria-live': 'polite' }, el('div', { class: 'cn-box', text: text }));
    (document.fullscreenElement || document.body).appendChild(n);
    setTimeout(function () { n.classList.add('out'); setTimeout(function () { n.remove(); }, 300); }, ms || 2000);
  }
  /** Esercizi vicini (quello prima e quello dopo) con lo stesso tipo: numeri, per l'avviso. */
  function sameTypeNeighbours(ls, ex) {
    const i = ls.exercises.indexOf(ex);
    if (i === -1) return [];
    return [i - 1, i + 1].filter(function (k) { return ls.exercises[k] && ls.exercises[k].type === ex.type; }).map(function (k) { return k + 1; });
  }
  /**
   * v95: il video che ti segue. Nell'editor la colonna sinistra scorre per conto suo, quindi lavorando in fondo
   * (tagli, esercizi) il player finisce fuori schermo. Quando esce, si stacca e va in alto a destra, sopra la
   * colonna di destra; quando torna in vista riprende il suo posto. Si può chiudere per la sessione (✕) e
   * "↑ Al video" riporta la colonna sul player.
   */
  function bindMiniPlayer() {
    const stage = $('#e-stage');
    if (!stage || typeof IntersectionObserver !== 'function') return;
    const bar = el('div', { id: 'mini-bar' },
      el('button', { type: 'button', text: '↑ Al video', title: 'Torna al player nella colonna', onclick: function () { stage.scrollIntoView({ behavior: 'smooth', block: 'center' }); } }),
      el('button', { type: 'button', class: 'mb-x', text: '✕', title: 'Chiudi il video staccato (torna alla prossima apertura dell\'editor)', onclick: function () { S.editor.noMini = true; document.body.classList.remove('mini-player'); bar.remove(); } }));
    // il riquadro non deve MAI coprire la barra dei pulsanti dell'editor (Soluzioni, Link studente…): finché
    // quella è a schermo, il video si mette sotto di lei. Senza questo, con la colonna scorsa ma la pagina in
    // cima, il video si piazzava sopra i pulsanti e non erano piu' cliccabili.
    const sistemaAltezza = function () {
      const eb = document.querySelector('.editor-bar');
      const r = eb ? eb.getBoundingClientRect() : null;
      const top = r && r.bottom > 0 && r.top < window.innerHeight ? Math.max(108, Math.round(r.bottom) + 12) : 108;
      document.body.style.setProperty('--minitop', top + 'px');
    };
    const io = new IntersectionObserver(function (ents) {
      const e = ents[ents.length - 1];
      const fuori = S.view === 'editor' && !S.editor.noMini && e.intersectionRatio < 0.3;
      document.body.classList.toggle('mini-player', fuori);
      if (fuori) { sistemaAltezza(); if (!bar.isConnected) document.body.appendChild(bar); }
      else if (bar.isConnected) bar.remove();
    }, { threshold: [0, 0.3, 0.6] });
    io.observe(stage);
    window.addEventListener('scroll', function () { if (document.body.classList.contains('mini-player')) sistemaAltezza(); }, { passive: true });
    window.addEventListener('resize', function () { if (document.body.classList.contains('mini-player')) sistemaAltezza(); }, { passive: true });
  }
  function bindNestedScroll() {
    const box = document.querySelector('.editor-left'); if (!box) return;
    box.addEventListener('wheel', function (e) {
      if (e.ctrlKey || e.deltaY === 0) return;
      if (getComputedStyle(box).overflowY !== 'auto') return;      // sotto i 960px la colonna non scorre da sé
      const limite = box.scrollHeight - box.clientHeight;
      const fine = e.deltaY > 0 ? box.scrollTop >= limite - 1 : box.scrollTop <= 0;
      if (!fine) return;                                           // la colonna ha ancora strada: scorre lei
      const doc = document.scrollingElement || document.documentElement;
      const puo = e.deltaY > 0 ? doc.scrollTop < doc.scrollHeight - doc.clientHeight - 1 : doc.scrollTop > 0;
      if (!puo) return;
      window.scrollBy(0, e.deltaY);
      e.preventDefault();
    }, { passive: false });
  }
  function bindOverlayCancel() {
    const b = $('#overlay-cancel'); if (!b) return;
    b.onclick = function () { const f = ovCancel; if (!f) return; ovCancel = null; b.hidden = true; overlayStep('Annullo…'); f(); };
  }
  function uid() { return Date.now().toString(36) + Math.random().toString(36).slice(2, 7); }
  function slugify(s) { return L.normalize(s || 'lezione').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 60) || 'lezione'; }
  function fmt(t) { return L.fmtTime(t); }
  function fmtMin(t) { t = Math.round(t); return Math.floor(t / 60) + ':' + String(t % 60).padStart(2, '0'); }
  function b64url(str) { return btoa(unescape(encodeURIComponent(str))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, ''); }
  function unb64url(s) { s = s.replace(/-/g, '+').replace(/_/g, '/'); while (s.length % 4) s += '='; return decodeURIComponent(escape(atob(s))); }
  function download(name, text) {
    const a = el('a', { href: URL.createObjectURL(new Blob([text], { type: 'application/json' })), download: name });
    document.body.appendChild(a); a.click(); setTimeout(function () { URL.revokeObjectURL(a.href); a.remove(); }, 500);
  }
  function copyText(t) {
    if (navigator.clipboard && navigator.clipboard.writeText) return navigator.clipboard.writeText(t).then(function () { toast('Copiato'); }, function () { toast('Copia manualmente il testo'); });
    toast('Copia manualmente il testo');
  }

  // ---------- stato e persistenza ----------
  const S = {
    lessons: {}, currentId: null, view: 'home', player: null, loop: null, mock: false, speed: 1, standalone: false,
    settings: { apiKey: '', model: AI.DEFAULT_MODEL },
    editor: { replay: null, altIdx: {}, previewId: null, focusKey: null },
    student: null
  };
  /** Lezioni salvate con versioni precedenti: il riordino ora tiene maiuscola iniziale e punto finale (si ricostruisce a parità di parole). */
  function migrateLesson(ls) {
    if (!ls || !Array.isArray(ls.exercises)) return ls;
    ls.exercises.forEach(function (ex) {
      if (ex.type !== 'scramble' || !ex.data || !Array.isArray(ex.data.words) || !ex.sentence) return;
      const nb = EX.buildExercise('scramble', ex.sentence, { lang: ls.lang, seed: 7 });
      if (!nb) return;
      const same = L.normalize(nb.data.words.join(' ')) === L.normalize(ex.data.words.join(' '));
      if (same && nb.data.words.join(' ') !== ex.data.words.join(' ')) ex.data = nb.data;
    });
    syncMarkers(ls);   // lezioni fatte prima della v55: il segnaposto torna a coincidere con la fine della frase
    lessonFlow(ls);
    return ls;
  }
  /** Struttura della lezione (v36): ls.flow = sezioni in ordine ({kind:'vocab'} | {kind:'video'} | {kind:'talk', id});
   *  ls.talks = [{id, questions:[{id,text,help}]}] (più sezioni "Parliamone", prima o dopo il video).
   *  Migra il vecchio ls.talk e garantisce l'integrità: un solo vocab, un solo video, talk allineati. */
  function lessonFlow(ls) {
    if (!Array.isArray(ls.talks)) {
      const old = ls.talk && Array.isArray(ls.talk.questions) ? ls.talk.questions : [];
      ls.talks = [{ id: 't1', questions: old }];
    }
    delete ls.talk;
    ls.talks.forEach(function (sec, i) { if (!sec.id) sec.id = 't' + (i + 1); if (!Array.isArray(sec.questions)) sec.questions = []; sec.questions.forEach(function (q) { if (q && !q.id) q.id = uid(); }); });
    if (!Array.isArray(ls.acts)) ls.acts = [];   // attività-gioco dentro la lezione (Memory, Quiz, …)
    ls.acts.forEach(function (a, i) { if (!a.id) a.id = 'a' + (i + 1); if (!a.data) a.data = {}; });
    if (!Array.isArray(ls.flow)) ls.flow = [{ kind: 'vocab' }, { kind: 'video' }, { kind: 'talk', id: ls.talks[0].id }];
    // integrità: niente doppioni, niente sezioni fantasma, tutte le sezioni presenti
    const seen = { vocab: false, video: false, talk: {}, act: {} };
    ls.flow = ls.flow.filter(function (s) {
      if (!s || !s.kind) return false;
      if (s.kind === 'vocab') { if (seen.vocab) return false; seen.vocab = true; return true; }
      if (s.kind === 'video') { if (seen.video) return false; seen.video = true; return true; }
      if (s.kind === 'talk') { if (!s.id || seen.talk[s.id] || !ls.talks.some(function (t) { return t.id === s.id; })) return false; seen.talk[s.id] = true; return true; }
      if (s.kind === 'act') { if (!s.id || seen.act[s.id] || !ls.acts.some(function (a) { return a.id === s.id; })) return false; seen.act[s.id] = true; return true; }
      return false;
    });
    if (!seen.video) ls.flow.push({ kind: 'video' });
    if (!seen.vocab) ls.flow.unshift({ kind: 'vocab' });
    // v96: il media della SEZIONE (v95, vissuta poche ore) diventa quello della prima domanda
    ls.talks.forEach(function (t) { if (t.media) { const q0 = (t.questions || [])[0]; if (q0 && !q0.media) q0.media = t.media; delete t.media; } });
    ls.talks.forEach(function (t) { if (!seen.talk[t.id]) ls.flow.push({ kind: 'talk', id: t.id }); });
    ls.acts.forEach(function (a) { if (!seen.act[a.id]) ls.flow.push({ kind: 'act', id: a.id }); });
    return ls.flow;
  }
  function talkSection(ls, id) { return (ls.talks || []).find(function (t) { return t.id === id; }); }
  function actSection(ls, id) { return (ls.acts || []).find(function (a) { return a.id === id; }); }
  /** true se la sezione "Parliamone" sta prima del video (domande per entrare nel tema). */
  function talkBefore(ls, id) {
    const f = lessonFlow(ls);
    const vi = f.findIndex(function (s) { return s.kind === 'video'; });
    const ti = f.findIndex(function (s) { return s.kind === 'talk' && s.id === id; });
    return ti > -1 && ti < vi;
  }
  function loadState() {
    try { S.lessons = JSON.parse(localStorage.getItem('vle.lessons') || '{}') || {}; } catch (e) { S.lessons = {}; }
    Object.keys(S.lessons).forEach(function (id) { migrateLesson(S.lessons[id]); });
    try { Object.assign(S.settings, JSON.parse(localStorage.getItem('vle.settings') || '{}') || {}); } catch (e) { /* ignore */ }
  }
  // Una scheda che non ha modificato niente non deve MAI riscrivere il magazzino: la sua fotografia e' vecchia
  // e sovrascriverebbe quello che nel frattempo ha salvato un'altra scheda (o un altro computer).
  let saveArmed = false;
  function saveLessons() {
    // i campi che iniziano con "_" sono cache di sessione (candidati foto, lessico): non si salvano
    saveArmed = false;
    try { localStorage.setItem('vle.lessons', JSON.stringify(S.lessons, function (k, v) { return k.charAt(0) === '_' ? undefined : v; })); } catch (e) { toast('Impossibile salvare nel browser: ' + e.message); }
    if (CLOUD.sync) CLOUD.sync.noteLocalChange();   // il cloud capisce da solo cosa è cambiato (confronto per impronta)
  }
  function saveSettings() { try { localStorage.setItem('vle.settings', JSON.stringify(S.settings)); } catch (e) { /* ignore */ } }
  const saveDebounced = (function () { let t; return function () { saveArmed = true; clearTimeout(t); t = setTimeout(function () { saveLessons(); const s = $('#e-saved'); if (s) { s.textContent = 'Salvato'; setTimeout(function () { s.textContent = ''; }, 1500); } }, 400); }; })();
  function current() { return S.lessons[S.currentId]; }
  function touch(lesson) { syncMarkers(lesson); lesson.updatedAt = new Date().toISOString(); undoNote(lesson); saveDebounced(); }
  // chiusura/ricarica della pagina: salva subito quello che il debounce non ha ancora scritto
  window.addEventListener('pagehide', function () { try { if (saveArmed) saveLessons(); } catch (e) { /* ignore */ } });

  // ---------- ANNULLA / RIPETI (pulsante + Cmd/Ctrl+Z) ----------
  // Storia della lezione aperta nell'editor: a ogni touch() si confronta lo stato con l'ultimo "fermo immagine" e, se è
  // cambiato, si mette da parte quello precedente. Modifiche ravvicinate (digitazione) si fondono in una sola operazione.
  const UNDO = { id: null, base: null, stack: [], redo: [], last: 0, busy: false, MAX: 60, BYTES: 40e6 };
  function snapshot(ls) { return JSON.stringify(ls, function (k, v) { return (k.charAt(0) === '_' || k === 'updatedAt') ? undefined : v; }); }
  function undoButtons() {
    const can = UNDO.id != null && S.currentId === UNDO.id;
    const mac = /Mac|iPhone|iPad/.test(navigator.platform || '');
    ['#btn-undo', '#a-undo', '#c-undo'].forEach(function (s) { const b = $(s); if (!b) return; b.disabled = !(can && UNDO.stack.length); b.title = 'Annulla l\'ultima modifica (' + (mac ? '⌘Z' : 'Ctrl+Z') + ')'; });
    ['#btn-redo', '#a-redo', '#c-redo'].forEach(function (s) { const b = $(s); if (!b) return; b.disabled = !(can && UNDO.redo.length); b.title = 'Ripeti la modifica annullata (' + (mac ? '⇧⌘Z' : 'Ctrl+Y') + ')'; });
  }
  /** All'apertura di una lezione nell'editor: stessa lezione → si tiene la storia (ma il punto di partenza è lo stato attuale); altra → si riparte. */
  function undoOpen(ls) {
    if (UNDO.busy) return;
    if (!ls) { UNDO.id = null; UNDO.base = null; UNDO.stack = []; UNDO.redo = []; undoButtons(); return; }
    if (UNDO.id !== ls.id) { UNDO.id = ls.id; UNDO.stack = []; UNDO.redo = []; UNDO.last = 0; }
    UNDO.base = snapshot(ls);
    undoButtons();
  }
  function undoNote(ls) {
    if (UNDO.busy || !ls || !ls.id) return;
    if (UNDO.id !== ls.id) { undoOpen(ls); return; }   // lezione diversa: da qui in poi
    const now = snapshot(ls);
    if (now === UNDO.base) return;
    const t = Date.now();
    if (t - UNDO.last > 700 || !UNDO.stack.length) {
      UNDO.stack.push(UNDO.base);
      let bytes = 0; UNDO.stack.forEach(function (s) { bytes += s.length; });
      while (UNDO.stack.length > UNDO.MAX || (bytes > UNDO.BYTES && UNDO.stack.length > 1)) bytes -= UNDO.stack.shift().length;
    }
    UNDO.last = t; UNDO.base = now; UNDO.redo = [];
    undoButtons();
  }
  function undoApply(json) {
    const ls = JSON.parse(json);
    const cur = S.lessons[ls.id];
    if (cur) Object.keys(cur).forEach(function (k) { if (k.charAt(0) === '_') ls[k] = cur[k]; });   // cache di sessione: si conservano
    ls.updatedAt = new Date().toISOString();
    migrateLesson(ls);
    S.lessons[ls.id] = ls;
    UNDO.busy = true;
    try {
      saveLessons();
      UNDO.base = snapshot(ls);
      UNDO.last = 0;
      if (S.view === 'act' && ls.activity) openActEditor(ls.id);
      if (S.view === 'conv' && ls.conv) openConvEditor(ls.id);
      else if (S.view === 'editor') { editorHeader(ls); renderEditorBody(); }
    } finally { UNDO.busy = false; }
    undoButtons();
  }
  function undo() {
    if (UNDO.id == null || S.currentId !== UNDO.id || !UNDO.stack.length) return false;
    const prev = UNDO.stack.pop(); UNDO.redo.push(UNDO.base);
    undoApply(prev); toast('Annullato' + (UNDO.stack.length ? ' (' + UNDO.stack.length + ' ancora da annullare)' : ''));
    return true;
  }
  function redo() {
    if (UNDO.id == null || S.currentId !== UNDO.id || !UNDO.redo.length) return false;
    const next = UNDO.redo.pop(); UNDO.stack.push(UNDO.base);
    undoApply(next); toast('Ripetuto');
    return true;
  }
  document.addEventListener('keydown', function (e) {
    if (!(e.metaKey || e.ctrlKey) || e.altKey) return;
    const k = (e.key || '').toLowerCase();
    if (k !== 'z' && k !== 'y') return;
    const inEditor = S.view === 'editor' || S.view === 'act' || S.view === 'conv';
    if (!inEditor) {   // portfolio (o studente): Cmd/Ctrl+Z riporta indietro l'ultima lezione/attività eliminata
      if (k === 'z' && !e.shiftKey && trashFresh()) { e.preventDefault(); hideUndoBar(); restoreDeleted(); }
      return;
    }
    const t = e.target, tag = t && t.tagName;
    // dentro un campo di testo il browser annulla la digitazione da solo (e il modello segue gli eventi input)
    if (tag === 'INPUT' && !/^(checkbox|radio|range|button|file|color)$/i.test(t.type || '')) return;
    if (tag === 'TEXTAREA' || (t && t.isContentEditable)) return;
    const wantRedo = k === 'y' || e.shiftKey;
    if (wantRedo ? redo() : undo()) e.preventDefault();
    else if (k === 'z') { e.preventDefault(); toast(wantRedo ? 'Niente da ripetere' : 'Niente da annullare'); }
  });
  // ---------- SCHEDA RIMASTA INDIETRO: l'app è una pagina sola, una scheda aperta da giorni continua a girare col codice vecchio
  //  (niente Annulla, niente pulsanti nuovi… e salvando può sovrascrivere il lavoro fatto in una scheda aggiornata) ----------
  const APP_VER = (function () { const t = document.querySelector('script[src*="app.js"]'); const m = t && /[?&]v=([^&"']+)/.exec(t.getAttribute('src') || ''); return m ? m[1] : ''; })();
  let appBarEl = null;
  function appBar(msg) {
    if (appBarEl) return;   // una sola volta: non deve diventare un tormento
    appBarEl = el('div', { class: 'app-bar', role: 'alert' },
      el('span', { text: msg }),
      el('button', { class: 'go', text: '↻ Ricarica', onclick: function () { location.href = location.pathname + (location.search ? location.search + '&' : '?') + 'u=' + Date.now() + location.hash; } }),
      el('button', { class: 'later', text: 'Più tardi', title: 'Nascondi (te lo richiedo alla prossima apertura)', onclick: function () { appBarEl.remove(); } }));
    document.body.appendChild(appBarEl);
  }
  let lastCheck = 0;
  async function checkAppVersion() {
    if (appBarEl || !APP_VER || S.standalone || S.view === 'student') return;
    lastCheck = Date.now();
    try {
      const r = await fetch('index.html?u=' + Date.now(), { cache: 'no-store' });
      if (!r.ok) return;
      const m = /app\.js\?v=([^"']+)/.exec(await r.text());
      if (m && m[1] !== APP_VER) appBar('C\'è una versione più nuova dell\'app: questa scheda è aperta da un po\' e sta usando quella vecchia.');
    } catch (e) { /* offline: pazienza */ }
  }
  // un'altra scheda ha salvato: questa ha in memoria una fotografia vecchia e salvando la sovrascriverebbe
  window.addEventListener('storage', function (e) {
    if (e.key !== 'vle.lessons' || S.view === 'student' || S.standalone) return;
    // niente di mio in sospeso e sono nel portfolio: prendo quello che ha salvato l'altra scheda invece di restare indietro
    if (!saveArmed && S.view === 'home') { loadState(); renderHome(); return; }
    appBar('Le lezioni sono state salvate in un\'altra scheda: questa è rimasta indietro e salvando potrebbe sovrascriverle.');
  });
  document.addEventListener('visibilitychange', function () { if (!document.hidden && Date.now() - lastCheck > 300000) checkAppVersion(); });
  setTimeout(checkAppVersion, 8000);
  setInterval(checkAppVersion, 900000);

  // ---------- CESTINO: l'ultima lezione/attività eliminata si può riportare indietro (pulsante nell'avviso o Cmd/Ctrl+Z) ----------
  const TRASH = { lesson: null, at: 0, WINDOW: 5 * 60000 };
  function trashFresh() { return !!TRASH.lesson && Date.now() - TRASH.at < TRASH.WINDOW; }
  function restoreDeleted() {
    const ls = TRASH.lesson; if (!ls) return false;
    TRASH.lesson = null;
    ls.updatedAt = new Date().toISOString();
    migrateLesson(ls);
    S.lessons[ls.id] = ls;
    // era un ripensamento: la lezione non deve essere cancellata anche nel cloud
    if (CLOUD.sync && CLOUD.sync.state && CLOUD.sync.state.deleted) delete CLOUD.sync.state.deleted[ls.id];
    saveLessons();
    if (S.view === 'home') renderHome();
    toast((ls.activity ? 'Attività' : 'Lezione') + ' ripristinata: ' + (ls.title || 'senza titolo'));
    return true;
  }
  /** Ogni "✕/Elimina" dentro l'editor dice come tornare indietro: l'annullamento c'è già (la modifica passa da touch),
   *  ma se nessuno lo dice l'utente crede che sia definitivo e rifà il lavoro a mano. */
  function undoBarFor(what) { toastUndo('Eliminato: ' + what, function () { if (!undo()) toast('Niente da annullare'); }); }
  /** Unico punto di eliminazione di una lezione/attività: mette da parte una copia e lo dice con la via d'uscita. */
  function deleteLesson(ls) {
    if (!ls) return;
    const what = ls.activity ? 'Attività' : 'Lezione';
    try { TRASH.lesson = JSON.parse(JSON.stringify(ls, function (k, v) { return k.charAt(0) === '_' ? undefined : v; })); TRASH.at = Date.now(); } catch (e) { TRASH.lesson = null; }
    delete S.lessons[ls.id];
    saveLessons();
    renderHome();
    toastUndo(what + ' eliminata: ' + (ls.title || 'senza titolo'), restoreDeleted);
  }
  ['#btn-undo', '#a-undo', '#c-undo'].forEach(function (s) { const b = $(s); if (b) b.addEventListener('click', function () { if (!undo()) toast('Niente da annullare'); }); });
  ['#btn-redo', '#a-redo', '#c-redo'].forEach(function (s) { const b = $(s); if (b) b.addEventListener('click', function () { if (!redo()) toast('Niente da ripetere'); }); });

  // ---------- cloud (Supabase, opzionale) ----------
  // Le lezioni restano in localStorage (cache); con l'accesso vengono anche caricate nel cloud e unite tra i computer (vince l'ultima modifica).
  const CLOUD = { client: null, sync: null, user: null, ready: null, announce: false, lastRun: 0 };
  function cloudConfigured() { return !!(window.VLSync && (window.VLSync.CONFIG.url || (S.mock && window.__vlCloud))); }
  /* v115 (Edoardo, dopo il caso di Mariachiara: "senza accesso non si può aprire una lezione, si può vedere che c'è
     ma per aprirla si deve fare il log in... si deve scrivere qualcosa che incentiva a fare un log in"): NON un muro
     prima di creare o guardare una lezione (ribalterebbe la v102, "l'app funziona SENZA account per scelta", e col
     tetto Supabase di 2 email di codice/ora rischierebbe di intasare proprio il primo utilizzo, il momento in cui i
     Reel devono convincere un insegnante a provare il prodotto). Il blocco riguarda SOLO l'EDITOR della video-lezione
     (dove si personalizzano esercizi, tagli, parole): senza account la si può generare, aprirla e usarla in classe
     così com'è, ma non modificarla. `lessonEditLocked()` è vera solo quando il cloud esiste come funzione (altrimenti
     bloccare non avrebbe senso: non ci sarebbe nessun accesso da fare) E non c'è un utente connesso.
     In modalità test (S.mock) NON si usa cloudConfigured() as-is: quella vede sempre "configurato" perché
     VLSync.CONFIG.url è l'indirizzo VERO di produzione, caricato comunque anche dal server statico dei test — la
     stragrande maggioranza degli scenari smoke apre l'editor senza mai simulare un login (mai avevano bisogno di
     cloud finto per testare il motore degli esercizi) e si bloccherebbe qui in massa. In mock, quindi, il cloud
     conta come "attivo" solo se lo scenario lo dichiara ESPLICITAMENTE con window.__vlCloud (la stessa convenzione
     già usata da cloudConfigured() per il ramo mock, e dagli scenari cloud/community/login esistenti): chi vuole
     testare DAVVERO questo blocco lo fa in un contesto isolato con __vlCloud presente e user() che risolve null. */
  function lessonEditLocked() { const cloudActive = S.mock ? !!window.__vlCloud : cloudConfigured(); return cloudActive && !CLOUD.user; }
  /* Href per aprire una PROPRIA lezione (video/attività/conversazione) in un'altra scheda col tasto destro: usa
     l'id locale via ?id=&mode=student, un meccanismo che esisteva già in init() per altri scopi (link "salvato nei
     preferiti"/ricaricato) — qui esteso a comprendere anche le conversazioni. Funziona solo su QUESTO browser
     (l'id è locale, non portabile): per condividere con altri c'è già "🔗 Condividi" (v78), che incorpora i dati.
     Le sfide in classe restano ESCLUSE apposta: aprirle non "mostra" la lezione, la METTE IN ONDA (una sessione dal
     vivo con un PIN), e due schede che ospitano la stessa sfida in parallelo confonderebbero solo gli studenti. */
  function localOpenHref(ls) { return '?id=' + encodeURIComponent(ls.id) + '&mode=student'; }
  /* Href per aprire in un'altra scheda una lezione ALTRUI vista in Community: qui l'id locale non serve a niente
     (quella lezione non è in questo browser), quindi si riusa lo stesso formato #d= già collaudato da "🔗 Condividi"
     — i dati viaggiano incorporati nel link, la scheda nuova li legge da sola in init() senza bisogno di rete né di
     essere connessi. Copre solo video e attività (stesso payload di studentPayload/actPayload, stesso ramo #d= che
     l'app sa già interpretare): conversazioni e sfide in classe restano senza anteprima per ora, come oggi. */
  function communityHref(r) {
    const ls = r.data || {}; const kind = homeKind(ls);
    try {
      if (kind === 'act') return '#d=' + b64url(JSON.stringify(actPayload(ls)));
      if (kind === 'video') return '#d=' + b64url(JSON.stringify(studentPayload(ls)));
    } catch (e) { /* payload non costruibile (dati corrotti): niente link, resta solo "+ Copia" */ }
    return null;
  }
  /** Anteprima in pagina di una lezione della Community (clic sinistro): NIENTE S.standalone = true qui, a
   *  differenza del link #d= aperto a freddo in una scheda nuova — quello è pensato per chi non ha nessun contesto
   *  app (uno studente), questo per un insegnante già connesso che sta solo guardando il lavoro di un collega.
   *  S.standalone resta un interruttore "acceso una volta sola all'avvio" (mai spento altrove nel codice): se lo
   *  accendessi qui rimarrebbe acceso per il resto della sessione, nascondendo barre e pulsanti che dovrebbero
   *  restare visibili una volta tornati alla Community. Il pulsante "✎ Modifica" resta comunque nascosto da solo
   *  (openStudent/openActPlay lo mostrano solo se S.lessons[ls.id] esiste, ed essendo una lezione non sua non
   *  esisterà mai): la protezione "non è tua" non dipende da standalone. */
  function openCommunityPreview(r) {
    const ls = r.data || {}; const kind = homeKind(ls);
    if (kind === 'act') return openActPlay(null, ls);
    if (kind === 'video') return openStudent(null, false, Object.assign({}, ls, { options: ls.options || {}, cuts: ls.cuts || [] }));
  }
  function loadScript(src) {
    return new Promise(function (resolve, reject) {
      const sc = document.createElement('script'); sc.src = src; sc.async = true;
      sc.onload = function () { resolve(); }; sc.onerror = function () { reject(new Error('Impossibile caricare la libreria del cloud (sei offline?)')); };
      document.head.appendChild(sc);
    });
  }
  function loadSyncState() { try { return JSON.parse(localStorage.getItem('vle.sync') || 'null'); } catch (e) { return null; } }
  function saveSyncState(st) { try { localStorage.setItem('vle.sync', JSON.stringify(st)); } catch (e) { /* ignore */ } }
  // v108 (Edoardo, testando la Community con un secondo account sullo stesso browser: "vedo tutte e tre le lezioni che ho fatto io,
  // anche se ne ho copiate solo due"): "vle.lessons" e' UNA chiave sola nel browser, non per-account — se un secondo insegnante
  // accede sullo stesso computer senza aver mai fatto logout/pulizia, la libreria del primo resta li' e sembra "sua". Il motore di
  // sync (sync.js) gia' si accorge del cambio account e riparte da zero per il proprio STATO di sincronizzazione (state.owner),
  // ma non tocca la cache locale delle lezioni: quella andrebbe comunque pushata (con owner = il nuovo utente) al primo giro utile.
  // "vle.owner" ricorda a CHI appartiene la cache di QUESTO browser; quando arriva un utente autenticato diverso da quello
  // registrato l'ultima volta, la cache locale si svuota PRIMA che il motore di sync possa leggerla, cosi' il nuovo account parte
  // pulito e scarica solo le proprie lezioni dal cloud. Un primo accesso (nessun proprietario registrato: uso da ospite prima del
  // login, o primo login mai fatto su questo browser) NON svuota niente: serve a poter continuare a lavorare offline e poi accedere.
  function localOwnerGuard(user) {
    if (!user) return;
    let prev = null;
    try { prev = localStorage.getItem('vle.owner'); } catch (e) { /* ignore */ }
    if (prev && prev !== user.id) {
      S.lessons = {}; saveLessons();
      toast('Account diverso da quello usato prima su questo browser: le lezioni locali di prima sono state tolte per non mescolarle tra insegnanti.');
    }
    try { localStorage.setItem('vle.owner', user.id); } catch (e) { /* ignore */ }
  }
  /** Applica in locale ciò che arriva dal cloud (lezioni nuove o aggiornate, eliminazioni fatte altrove). */
  function applyCloud(ch) {
    const skipped = [], replaced = [], removed = [];
    (ch.remove || []).forEach(function (id) {
      if (!S.lessons[id]) return;
      if (S.view === 'student' && S.currentId === id) { skipped.push(id); return; }   // lezione in corso: si toglie alla prossima apertura
      delete S.lessons[id]; removed.push(id);
    });
    (ch.replace || []).forEach(function (ls) {
      if (S.view === 'student' && S.currentId === ls.id) { skipped.push(ls.id); return; }
      migrateLesson(ls); S.lessons[ls.id] = ls; replaced.push(ls.id);
    });
    if (replaced.length || removed.length) {
      saveLessons();
      if (S.view === 'home') renderHome();
      else if (S.view === 'editor' && replaced.indexOf(S.currentId) >= 0) { openEditor(S.currentId); toast('Lezione aggiornata dal cloud (modificata su un altro computer)'); }
      else if (S.view === 'editor' && removed.indexOf(S.currentId) >= 0) { renderHome(); toast('Questa lezione è stata eliminata da un altro computer'); }
      if (S.view === 'home' && !CLOUD.announce) { const n = replaced.length + removed.length; toast(n === 1 ? '1 lezione aggiornata dal cloud' : n + ' lezioni aggiornate dal cloud'); }
    }
    return { skipped: skipped };
  }
  function initCloud() {
    if (CLOUD.ready) return CLOUD.ready;
    if (S.standalone || !cloudConfigured()) return Promise.resolve(null);
    CLOUD.ready = (async function () {
      let adapter;
      if (S.mock && window.__vlCloud) adapter = window.__vlCloud;   // test: cloud finto in memoria
      else {
        if (!window.supabase) await loadScript(window.VLSync.CONFIG.lib);
        CLOUD.client = window.supabase.createClient(window.VLSync.CONFIG.url, window.VLSync.CONFIG.anonKey);
        adapter = window.VLSync.supabaseAdapter(CLOUD.client);
        CLOUD.client.auth.onAuthStateChange(function (ev, session) {
          if (session && isStudentUser(session.user)) { studentInTeacherArea(); return; }   // v133
          const before = CLOUD.user && CLOUD.user.id;
          CLOUD.user = session ? session.user : null;
          localOwnerGuard(CLOUD.user);
          renderAccount();
          // v105: il pulsante "Pubblica" dipende da CLOUD.user (senza account non c'e' dove pubblicare) — se la home e' gia'
          // disegnata quando l'accesso cambia, va ridisegnata anche lei, non solo il pallino dell'account.
          if (S.view === 'home' && CLOUD.user && CLOUD.user.id !== before) renderHome();
          if (S.view === 'classes' && CLOUD.user && CLOUD.user.id !== before) renderClasses();   // v125
          if (ev === 'SIGNED_IN' && CLOUD.user && CLOUD.user.id !== before) { CLOUD.announce = true; runSync(); }
        });
      }
      CLOUD.adapter = adapter;   // v105: la community legge le righe pubblicate di TUTTI, il motore di sync (sopra) solo le proprie
      CLOUD.sync = window.VLSync.createSync({ adapter: adapter, getLocal: function () { return S.lessons; }, apply: applyCloud, save: saveLessons, loadState: loadSyncState, saveState: saveSyncState, onStatus: function () { renderAccount(); } });
      CLOUD.user = await adapter.user();
      if (isStudentUser(CLOUD.user)) { studentInTeacherArea(); return CLOUD.sync; }   // v133
      localOwnerGuard(CLOUD.user);
      renderAccount();
      // v105: la sessione si puo' ripristinare DOPO il primo renderHome() (fatto all'avvio, prima che initCloud finisca):
      // senza questo, il pulsante "Pubblica" resta assente finche' qualcos'altro non ridisegna la home (es. un cambio di vista).
      if (CLOUD.user && S.view === 'home') renderHome();
      if (CLOUD.user && S.view === 'classes') renderClasses();   // v125: la sessione arriva dopo il primo disegno
      if (CLOUD.user) { CLOUD.announce = !CLOUD.sync.state.lastSync; runSync(); }
      return CLOUD.sync;
    })().catch(function (e) { toast(e.message); CLOUD.ready = null; return null; });
    return CLOUD.ready;
  }
  /** v133 (Edoardo: "dobbiamo creare la scelta tra teacher o student alla registrazione"): gli account studente hanno
   *  user_metadata.role = 'student' (li crea stuLoginBox). Se uno studente entra dall'area docente ("Accedi"), non vede
   *  l'area docente vuota: si esce dalla sessione docente e si apre "I miei compiti", dove entra come studente. Gli
   *  account senza ruolo (tutti quelli creati prima) restano docenti. */
  function isStudentUser(u) { return !!(u && u.user_metadata && u.user_metadata.role === 'student'); }
  function studentInTeacherArea() {
    CLOUD.user = null;
    try { CLOUD.client.auth.signOut({ scope: 'local' }); } catch (e) { /* ignora */ }
    const d = $('#dlg-account'); if (d && d.open) d.close();
    toast(stuBrowserLang() === 'it' ? 'Questo è un account studente: ti porto ai tuoi compiti.' : 'This is a student account: taking you to your assignments.', 6000);
    openMine();
  }
  function runSync() {
    if (!CLOUD.sync) return Promise.resolve(null);
    CLOUD.lastRun = Date.now();
    return CLOUD.sync.sync().then(function (r) {
      if (CLOUD.announce) {
        CLOUD.announce = false;
        const parts = [];
        if (r.pushed) parts.push(r.pushed + (r.pushed === 1 ? ' lezione caricata' : ' lezioni caricate'));
        if (r.pulled) parts.push(r.pulled + (r.pulled === 1 ? ' lezione scaricata' : ' lezioni scaricate'));
        if (r.dropped) parts.push(r.dropped + (r.dropped === 1 ? ' eliminata' : ' eliminate'));
        toast(parts.length ? 'Cloud: ' + parts.join(', ') : 'Cloud: tutto sincronizzato', 3500);
      }
      return r;
    }).catch(function () { CLOUD.announce = false; return null; });   // l'errore è già nel pulsante dell'account
  }
  function relTime(iso) {
    const d = (Date.now() - Date.parse(iso)) / 1000;
    if (d < 60) return 'adesso'; if (d < 3600) return Math.round(d / 60) + ' min fa'; if (d < 86400) return Math.round(d / 3600) + ' h fa';
    return 'il ' + new Date(iso).toLocaleDateString('it-IT');
  }
  function cloudStatusText() {
    const st = CLOUD.sync && CLOUD.sync.status; if (!st) return '';
    if (st.state === 'syncing') return 'Sincronizzazione in corso…';
    if (st.state === 'error') return 'Errore di sincronizzazione: ' + st.message + (st.pending ? ' (' + st.pending + ' da caricare, riprovo da solo)' : '');
    if (st.pending) return st.pending + (st.pending === 1 ? ' modifica da caricare' : ' modifiche da caricare');
    return st.lastSync ? 'Sincronizzato ' + relTime(st.lastSync) + '.' : 'Non ancora sincronizzato.';
  }
  function renderAccount() {
    const b = $('#btn-account'); if (!b) return;
    const on = cloudConfigured() && !S.standalone;
    b.style.display = on ? '' : 'none';
    // v106: sotto i 640px il pallino di stato vive anche sul pulsante ☰ (la nav e' chiusa dentro un pannello a
    // tendina), altrimenti l'accesso "connesso"/"in corso"/"errore" sarebbe invisibile a menu chiuso.
    const td = $('#nav-toggle-dot');
    if (td) td.style.display = on ? '' : 'none';
    if (!on) return;
    const st = CLOUD.sync ? CLOUD.sync.status : null, u = CLOUD.user;
    const dot = !u ? 'off' : st && st.state === 'error' ? 'bad' : st && (st.state === 'syncing' || st.pending) ? 'busy' : 'ok';
    b.innerHTML = '';
    b.appendChild(el('span', { class: 'dot ' + dot }));
    b.appendChild(document.createTextNode(' ' + (u ? (u.email || 'account') : 'Accedi')));
    b.title = u ? cloudStatusText() : 'Salva le lezioni nel cloud per ritrovarle su ogni computer';
    if (td) td.className = 'dot ' + dot;
    renderStorageBanner();
    if ($('#dlg-account').open) fillAccountDialog();
  }
  /* v102 (Edoardo, davanti al portfolio senza aver fatto l'accesso: "non ha senso, se non ho un profilo e non ho
     fatto l'accesso perche' dovrei poter vedere un portfolio?"). L'app funziona SENZA account per scelta: chi prova
     la piattaforma non deve registrarsi prima di capire se gli piace, e i link studente non toccano il cloud. Quindi
     il portfolio resta visibile; quello che mancava era dire DOVE stanno le lezioni. L'avviso c'era gia'
     (#home-storage-hint) ma era una riga grigia in fondo alla pagina, sotto due righe di spiegazioni: nessuno lo
     leggeva, e infatti Edoardo si e' trovato due volte in un giorno davanti a una libreria vuota senza capire perche'
     (il cambio di dominio, che ha lasciato le lezioni nel magazzino del vecchio indirizzo, e poi il telefono). Ora la
     riga sta SOPRA le card, dove l'occhio passa per forza: gialla finche' non c'e' l'accesso (le lezioni vivono solo
     in questo browser, una pulizia della cronologia le cancella e non c'e' cestino), verde quando c'e'. Sparisce se
     il portfolio e' vuoto: a chi non ha ancora niente l'allarme non serve e fa solo paura. La versione dell'app,
     che prima stava nell'avviso grigio, e' finita qui: serve per rispondere in un secondo a "che versione vedi?". */
  function renderStorageBanner() {
    const b = $('#storage-banner'); if (!b) return;
    const vuoto = Object.keys(S.lessons || {}).length === 0;
    if (vuoto || S.standalone || !cloudConfigured()) { b.hidden = true; b.innerHTML = ''; return; }
    const u = CLOUD.user;
    b.hidden = false;
    b.className = 'stor ' + (u ? 'ok' : 'warn');
    b.innerHTML = '';
    b.appendChild(el('span', { class: 'stor-ico', text: u ? '\u2601' : '\ud83d\udcbb' }));
    const txt = el('span', { class: 'stor-txt' });
    if (u) {
      txt.appendChild(el('b', { text: 'Le tue lezioni sono anche nel cloud.' }));
      txt.appendChild(document.createTextNode(' Le ritrovi su ogni dispositivo dove entri con ' + (u.email || 'la stessa email') + '. ' + cloudStatusText()));
    } else {
      txt.appendChild(el('b', { text: 'Queste lezioni esistono solo su questo computer.' }));
      txt.appendChild(document.createTextNode(" Se pulisci la cronologia del browser spariscono, e non c’è modo di recuperarle. Con l’accesso le copi nel cloud e le ritrovi anche sul telefono."));
    }
    b.appendChild(txt);
    if (!u) b.appendChild(el('button', { class: 'small primary stor-go', text: 'Accedi', onclick: function () { $('#btn-account').click(); } }));
    if (APP_VER) b.appendChild(el('span', { class: 'stor-ver', text: 'v' + APP_VER }));
  }

  // v101: l'accesso ha due passi (email, poi codice di 6 cifre). v113 (Edoardo: "vorrei che il codice fosse solo la
  // prima volta poi dopo aver messo il codice faccia scegliere la password"): scelta fra tre modi possibili discussa
  // in chat (memoria nel browser / tabella pubblica con rischio di enumerazione / scelta manuale) — Edoardo ha
  // scelto la terza, quella senza automatismi e senza schema nuovo: il dialogo mostra SEMPRE sia il campo password
  // sia "invia un codice", decide l'insegnante quale usare, non l'app. Il codice resta comunque la via per chi la
  // password non l'ha mai impostata o l'ha dimenticata (funziona anche da "recupero password": rientrando col
  // codice si arriva di nuovo al passo 3 e si può impostarne una nuova, che sovrascrive la vecchia).
  // ACC.step vale 'email' | 'code'. ACC.offerPw e' INDIPENDENTE da ACC.step: diventa true appena un verifyOtp riesce
  // e resta true (mostrando il passo 3, "imposta una password") finche' l'insegnante non salva o salta — DOPO
  // quel momento vince comunque lo stato "connesso" (acc-in), quindi va controllato PRIMA di controllare `u`.
  const ACC = { step: 'email', email: '', offerPw: false };
  function fillAccountDialog() {
    const u = CLOUD.user, offer = u && ACC.offerPw, code = !u && ACC.step === 'code';
    $('#acc-out').style.display = (u || code) ? 'none' : '';
    $('#acc-step2').style.display = code ? '' : 'none';
    $('#acc-step3').style.display = offer ? '' : 'none';
    $('#acc-in').style.display = (u && !offer) ? '' : 'none';
    if (code) $('#acc-sent-to').textContent = ACC.email;
    if (u) { $('#acc-who').textContent = u.email || ''; $('#acc-state').textContent = cloudStatusText(); }
  }
  $('#btn-account').addEventListener('click', function () {
    initCloud().then(function () {
      // riaprendo si ricomincia da capo: un codice vecchio non vale piu', e l'offerta della password (se non e' la
      // prima apertura dopo un accesso col codice) non deve ripresentarsi da sola a ogni riapertura del dialogo
      ACC.step = 'email'; ACC.offerPw = false; clearTimeout(ACC.otpTimer);
      $('#acc-otp').value = ''; $('#acc-msg2').textContent = ''; $('#acc-password').value = ''; $('#acc-newpw').value = ''; $('#acc-msg3').textContent = '';
      fillAccountDialog(); $('#acc-msg').textContent = ''; $('#dlg-account').showModal();
      if (!CLOUD.user) $('#acc-email').focus();
    });
  });
  $$('#acc-close, #acc-close2').forEach(function (b) { b.addEventListener('click', function () { $('#dlg-account').close(); }); });
  $('#acc-email').addEventListener('keydown', function (e) { if (e.key === 'Enter') { e.preventDefault(); $('#acc-login').click(); } });
  $('#acc-password').addEventListener('keydown', function (e) { if (e.key === 'Enter') { e.preventDefault(); $('#acc-login').click(); } });

  /** Messaggio leggibile per gli errori dell'accesso: codice sbagliato/scaduto, password sbagliata, tetto di invii. */
  function authError(e) {
    const m = String(e && e.message || e);
    if (/rate limit|too many/i.test(m)) return 'Troppe richieste in poco tempo. Se il codice ti è già arrivato usalo (vale un\'ora, guarda anche nello spam); altrimenti riprova fra qualche minuto.';
    if (/invalid login credentials/i.test(m)) return 'Email o password sbagliate. Se non hai ancora impostato una password, usa "Invia un codice".';
    if (/expired|invalid/i.test(m)) return 'Codice sbagliato o scaduto. Controlla le cifre, oppure fattene mandare un altro.';
    if (/signups? not allowed|disabled/i.test(m)) return 'Le registrazioni nuove sono chiuse in questo momento.';
    if (/password.*(least|short|length|characters)/i.test(m)) return 'La password è troppo corta per i requisiti del progetto: provane una più lunga.';
    return 'Non ha funzionato: ' + m;
  }

  /** v113: accesso con la password, per chi l'ha già impostata (passo 3, dopo un codice). Stesso account di sempre:
      Supabase Auth non distingue "utenti col codice" da "utenti con password", sono due modi di entrare nello
      STESSO account con la stessa email. */
  $('#acc-login').addEventListener('click', function () {
    const email = $('#acc-email').value.trim(), pw = $('#acc-password').value, msg = $('#acc-msg'), btn = $('#acc-login');
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) { msg.textContent = 'Scrivi un indirizzo email valido.'; return; }
    if (!pw) { msg.textContent = 'Scrivi la password, oppure usa "Invia un codice" se non ne hai ancora una.'; return; }
    if (!CLOUD.client) { msg.textContent = 'Cloud non disponibile in questo momento.'; return; }
    btn.disabled = true; msg.textContent = 'Accesso in corso…';
    CLOUD.client.auth.signInWithPassword({ email: email, password: pw })
      .then(function (res) {
        if (res.error) throw res.error;
        // onAuthStateChange (SIGNED_IN) e' quello che aggiorna CLOUD.user e lancia la sincronizzazione: se e' gia'
        // arrivato quando questa promessa si risolve, il dialogo si aggiorna SUBITO invece di aspettare il giro
        // dell'evento; se non e' ancora arrivato, non si tocca nulla qui (mai mostrare "sloggato" per un attimo:
        // sarebbe peggio di aspettare) e ci pensa renderAccount(), chiamato dall'evento appena arriva.
        $('#acc-password').value = ''; msg.textContent = '';
        if (CLOUD.user) fillAccountDialog();
        toast('Sei dentro: le lezioni si stanno allineando');
      })
      .catch(function (e) { msg.textContent = authError(e); })
      .then(function () { btn.disabled = false; });
  });

  /** Passo 1: chiede il codice. NIENTE emailRedirectTo: l'app vive su due indirizzi (dominio nuovo e vecchio URL di GitHub)
      e un redirect non autorizzato farebbe fallire l'accesso; col codice non c'è nessun indirizzo da autorizzare. */
  function sendCode(email, msg, btn) {
    if (!CLOUD.client) { msg.textContent = 'Cloud non disponibile in questo momento.'; return Promise.resolve(false); }
    btn.disabled = true; msg.textContent = 'Invio in corso…';
    return CLOUD.client.auth.signInWithOtp({ email: email, options: { data: { role: 'teacher' } } })   // v133: il ruolo vale solo per gli account nuovi
      .then(function (res) { if (res.error) throw res.error; return true; })
      .catch(function (e) { msg.textContent = authError(e); return false; })
      .then(function (ok) { btn.disabled = false; return ok; });
  }

  $('#acc-send').addEventListener('click', function () {
    const email = $('#acc-email').value.trim(), msg = $('#acc-msg');
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) { msg.textContent = 'Scrivi un indirizzo email valido.'; return; }
    sendCode(email, msg, $('#acc-send')).then(function (ok) {
      if (!ok) return;
      ACC.email = email; ACC.step = 'code';
      clearTimeout(ACC.otpTimer); $('#acc-otp').value = ''; $('#acc-msg2').textContent = '';
      fillAccountDialog(); $('#acc-otp').focus();
    });
  });

  // Passo 2: il codice. Si accettano solo cifre (chi incolla dalla mail si porta dietro spazi e a capo).
  // v102: la lunghezza NON e' fissa a 6 - Supabase la decide da un'impostazione del progetto (GOTRUE_MAILER_OTP_LENGTH,
  // Authentication -> Email nel pannello) e puo' valere 6 come 8; assumerla qui aveva troncato i codici piu' lunghi
  // e bloccato l'accesso (Edoardo, 19/9: "perche' mi chiede 6 cifre ma me ne arrivano 8 per email"). Si entra da soli
  // quando la digitazione si ferma con almeno 6 cifre scritte (l'incolla arriva in un colpo solo, quindi basta un
  // piccolo ritardo), MAI a un conteggio fisso di caratteri.
  $('#acc-otp').addEventListener('input', function () {
    const pulito = this.value.replace(/\D/g, '').slice(0, 12);
    if (pulito !== this.value) this.value = pulito;
    clearTimeout(ACC.otpTimer);
    if (pulito.length >= 6) ACC.otpTimer = setTimeout(function () { $('#acc-verify').click(); }, 350);
  });
  $('#acc-otp').addEventListener('keydown', function (e) { if (e.key === 'Enter') { e.preventDefault(); clearTimeout(ACC.otpTimer); $('#acc-verify').click(); } });

  $('#acc-verify').addEventListener('click', function () {
    clearTimeout(ACC.otpTimer);
    const token = $('#acc-otp').value.replace(/\D/g, ''), msg = $('#acc-msg2');
    if (token.length < 6) { msg.textContent = 'Il codice sembra incompleto.'; return; }
    if (!CLOUD.client) { msg.textContent = 'Cloud non disponibile in questo momento.'; return; }
    $('#acc-verify').disabled = true; msg.textContent = 'Controllo…';
    CLOUD.client.auth.verifyOtp({ email: ACC.email, token: token, type: 'email' })
      .then(function (res) {
        if (res.error) throw res.error;
        // Da qui in poi fa tutto onAuthStateChange (SIGNED_IN): aggiorna CLOUD.user e lancia la sincronizzazione.
        // v113: PRIMA di mostrare "Connesso come...", si offre di impostare una password (passo 3) — chi la
        // password non l'ha mai voluta puo' sempre saltare, e da qui in avanti tornera' a usare il codice.
        ACC.step = 'email'; ACC.offerPw = true; msg.textContent = '';
        fillAccountDialog();
      })
      .catch(function (e) { msg.textContent = authError(e); $('#acc-otp').select(); })
      .then(function () { $('#acc-verify').disabled = false; });
  });

  $('#acc-resend').addEventListener('click', function () {
    sendCode(ACC.email, $('#acc-msg2'), $('#acc-resend')).then(function (ok) {
      if (ok) { $('#acc-msg2').textContent = 'Ne abbiamo mandato un altro a ' + ACC.email + '. Vale solo l\'ultimo arrivato.'; clearTimeout(ACC.otpTimer); $('#acc-otp').value = ''; $('#acc-otp').focus(); }
    });
  });
  $('#acc-back').addEventListener('click', function () {
    ACC.step = 'email'; $('#acc-msg').textContent = ''; fillAccountDialog(); $('#acc-email').focus(); $('#acc-email').select();
  });

  /** v113, passo 3: imposta una password sull'account appena verificato col codice. updateUser() su una sessione
      GIA' autenticata non manda nessuna email di conferma (a differenza di un signUp): e' esattamente il motivo
      per cui questa via non consuma la quota di 2 email/ora di Supabase, a differenza di un altro codice. */
  $('#acc-setpw').addEventListener('click', function () {
    const pw = $('#acc-newpw').value, msg = $('#acc-msg3'), btn = $('#acc-setpw');
    if (pw.length < 8) { msg.textContent = 'La password deve avere almeno 8 caratteri.'; return; }
    if (!CLOUD.client) { msg.textContent = 'Cloud non disponibile in questo momento.'; return; }
    btn.disabled = true; msg.textContent = 'Salvo…';
    CLOUD.client.auth.updateUser({ password: pw })
      .then(function (res) {
        if (res.error) throw res.error;
        ACC.offerPw = false; $('#acc-newpw').value = ''; msg.textContent = '';
        fillAccountDialog();
        toast('Password impostata: la prossima volta entri subito con email e password');
      })
      .catch(function (e) { msg.textContent = authError(e); })
      .then(function () { btn.disabled = false; });
  });
  $('#acc-skippw').addEventListener('click', function () {
    ACC.offerPw = false; $('#acc-newpw').value = ''; $('#acc-msg3').textContent = '';
    fillAccountDialog();
    toast('Sei dentro: le lezioni si stanno allineando');
  });
  $('#acc-sync').addEventListener('click', function () { CLOUD.announce = true; runSync().then(function () { if ($('#dlg-account').open) fillAccountDialog(); }); });
  $('#acc-logout').addEventListener('click', function () {
    const done = function () { CLOUD.user = null; renderAccount(); $('#dlg-account').close(); toast('Sei uscito: le lezioni restano in questo browser e nel cloud'); };
    if (CLOUD.client) CLOUD.client.auth.signOut({ scope: 'local' }).then(done, done); else done();   // solo questo browser: l'altro computer resta connesso
  });
  document.addEventListener('visibilitychange', function () { if (document.visibilityState === 'visible' && CLOUD.sync && CLOUD.user && Date.now() - CLOUD.lastRun > 20000) runSync(); });
  window.addEventListener('online', function () { if (CLOUD.sync && CLOUD.user) runSync(); });

  function studentPayload(lesson) {
    const vb = lesson.vocab ? { support: lesson.vocab.support, cards: lesson.vocab.cards, theme: lesson.vocab.theme, words: (lesson.vocab.words || []).filter(function (w) { return w.selected && w.word; }).map(function (w) { return { id: w.id, word: w.word, translation: w.translation, image: w.image, selected: true, inExercise: w.inExercise }; }) } : undefined;
    return { v: 1, id: lesson.id, title: lesson.title, videoId: lesson.videoId, lang: lesson.lang, duration: lesson.duration,
      levelBand: lesson.levelBand || undefined, audience: lesson.audience || undefined,   // v79/v83: etichette community (ls.level resta il CEFR della generazione!)
      exercises: lesson.exercises, cuts: lesson.cuts, options: lesson.options, vocab: vb,
      flow: lessonFlow(lesson),
      talks: (lesson.talks || []).map(function (sec) { return { id: sec.id, questions: sec.questions.filter(function (q) { return q.text; }).map(function (q) { return { id: q.id, text: q.text, help: q.help, kind: q.kind, media: q.media || undefined }; }) }; }),
      acts: (lesson.acts || []).filter(function (a) { return ACT.validate(a).length === 0; }).map(function (a) { return { id: a.id, type: a.type, theme: a.theme, title: a.title, data: a.data }; }),
      lines: lesson.videoId === 'demo' ? lesson.lines : undefined };
  }

  // ---------- video ----------
  function extractVideoId(url) {
    const s = String(url || '').trim();
    if (/^[\w-]{11}$/.test(s)) return s;
    const m = s.match(/(?:v=|\/embed\/|youtu\.be\/|\/shorts\/|\/live\/|\/v\/)([\w-]{11})/);
    return m ? m[1] : null;
  }
  let ytPromise = null;
  function loadYT() {
    if (ytPromise) return ytPromise;
    ytPromise = new Promise(function (resolve, reject) {
      if (window.YT && window.YT.Player) return resolve(window.YT);
      const prev = window.onYouTubeIframeAPIReady;
      window.onYouTubeIframeAPIReady = function () { if (prev) prev(); resolve(window.YT); };
      const sc = document.createElement('script');
      sc.src = 'https://www.youtube.com/iframe_api';
      sc.onerror = function () { reject(new Error('Impossibile caricare l\'API di YouTube (sei offline?)')); };
      document.head.appendChild(sc);
      setTimeout(function () { reject(new Error('L\'API di YouTube non risponde')); }, 20000);
    });
    return ytPromise;
  }

  function MockPlayer(container, lesson, speed) {
    const self = this;
    this.t = 0; this.playing = false; this.ended = false; this.speed = speed || 1;
    this.dur = lesson.duration || 60; this.lines = lesson.lines || [];
    const box = el('div', { class: 'mock' });
    const tag = el('div', { class: 'tag', text: 'PLAYER FINTO (nessun video) · velocità ×' + this.speed });
    const cap = el('div', { class: 'caption' });
    const time = el('div', { class: 'time' });
    const bar = el('div', { class: 'bar' }, el('div'));
    const btn = el('button', { class: 'small', text: '▶ / ❚❚', onclick: function () { self.playing ? self.pause() : self.play(); } });
    box.appendChild(tag); box.appendChild(cap); box.appendChild(time); box.appendChild(bar); box.appendChild(btn);
    container.appendChild(box);
    this.render = function () {
      const ln = self.lines.find(function (l) { return self.t >= l.start && self.t < l.end; });
      cap.textContent = ln ? ln.text : (self.ended ? '— fine —' : '…');
      time.textContent = fmt(self.t) + ' / ' + fmt(self.dur) + (self.playing ? ' ▶' : ' ❚❚');
      bar.firstChild.style.width = (100 * self.t / self.dur) + '%';
    };
    this.timer = setInterval(function () {
      if (self.playing) { self.t += 0.1 * self.speed; if (self.t >= self.dur) { self.t = self.dur; self.playing = false; self.ended = true; } }
      self.render();
    }, 100);
    this.render();
  }
  MockPlayer.prototype.time = function () { return this.t; };
  MockPlayer.prototype.duration = function () { return this.dur; };
  MockPlayer.prototype.seek = function (t) { this.t = Math.max(0, Math.min(this.dur, t)); this.ended = false; this.render(); };
  MockPlayer.prototype.play = function () { if (this.t >= this.dur) this.t = 0; this.playing = true; this.ended = false; };
  MockPlayer.prototype.pause = function () { this.playing = false; };
  MockPlayer.prototype.state = function () { return this.ended ? 0 : this.playing ? 1 : 2; };
  MockPlayer.prototype.destroy = function () { clearInterval(this.timer); };
MockPlayer.prototype.mute = function () { this.muted = true; };
MockPlayer.prototype.unmute = function () { this.muted = false; };
  MockPlayer.prototype.kind = 'mock';

  function wrapYT(p) {
    return {
      kind: 'yt', raw: p,
      time: function () { try { return p.getCurrentTime() || 0; } catch (e) { return 0; } },
      duration: function () { try { return p.getDuration() || 0; } catch (e) { return 0; } },
      seek: function (t) { try { p.seekTo(Math.max(0, t), true); } catch (e) { /* ignore */ } },
      play: function () { try { p.playVideo(); } catch (e) { /* ignore */ } },
      pause: function () { try { p.pauseVideo(); } catch (e) { /* ignore */ } },
      state: function () { try { return p.getPlayerState(); } catch (e) { return -1; } },
      mute: function () { try { p.mute(); } catch (e) { /* ignore */ } },
      unmute: function () { try { p.unMute(); } catch (e) { /* ignore */ } },
      destroy: function () { try { p.destroy(); } catch (e) { /* ignore */ } }
    };
  }

  function destroyPlayer() { if (S.player) { S.player.destroy(); S.player = null; } }

  /** Crea il player nel contenitore. opts: { onError(code), onState(state), lesson } */
  function createPlayer(container, videoId, opts) {
    opts = opts || {};
    destroyPlayer();
    container.innerHTML = '';
    if (videoId === 'demo' || S.mock) {
      const mp = new MockPlayer(container, opts.lesson || { duration: 60, lines: [] }, S.speed);
      S.player = mp;
      return Promise.resolve(mp);
    }
    const div = el('div');
    container.appendChild(div);
    return loadYT().then(function (YT) {
      return new Promise(function (resolve) {
        // cc_load_policy: 3 (non documentato) = sottotitoli spenti all'avvio; iv_load_policy: 3 = niente annotazioni
        // controls: 0 = niente barra/comandi di YouTube (la barra è quella dell'app); resta il clic sul video per pausa/play
        const vars = { rel: 0, playsinline: 1, modestbranding: 1, controls: opts.controls === false ? 0 : 1, cc_load_policy: 3, iv_load_policy: 3 };
        if (opts.start > 0) vars.start = Math.floor(opts.start);
        if (/^https?:/.test(location.protocol)) vars.origin = location.origin;
        const p = new YT.Player(div, {
          width: '100%', height: '100%', videoId: videoId, playerVars: vars,
          events: {
            onReady: function (e) { hideCaptions(e.target); const w = wrapYT(e.target); S.player = w; resolve(w); },
            onError: function (e) { if (opts.onError) opts.onError(e.data); },
            onStateChange: function (e) { if (e.data === 1) hideCaptions(e.target); if (opts.onState) opts.onState(e.data); },
            // il modulo sottotitoli viene caricato (o ricaricato) dal player quando vuole: è il momento sicuro per spegnerlo
            onApiChange: function (e) { captionsOff(e.target); }
          }
        });
        setTimeout(function () { if (!S.player) { const w = wrapYT(p); S.player = w; resolve(w); } }, 8000);
      });
    });
  }
  /**
   * Sottotitoli di YouTube spenti: sono esercizi di ascolto.
   * Il modulo "captions" esiste solo dopo che il player lo ha caricato (evento onApiChange, o poco dopo il PLAYING):
   * prima di allora setOption non fa nulla. Quindi: si spegne in onApiChange, si ripete dopo ogni PLAYING e ogni ~2 s
   * durante la riproduzione (la preferenza "CC attivi" dell'utente di YouTube può riaccenderli, ad es. dopo un seek).
   * Se la traccia resta impostata nonostante setOption, come ultima risorsa si scarica il modulo.
   */
  function captionsOff(p) {
    try {
      const mods = p.getOptions ? p.getOptions() : null;
      if (!mods || mods.indexOf('captions') === -1) return false;   // modulo non ancora caricato
      p.setOption('captions', 'track', {});
      let tr = null;
      try { tr = p.getOption('captions', 'track'); } catch (e) { /* ignore */ }
      if (tr && tr.languageCode) { try { p.unloadModule('captions'); } catch (e) { /* ignore */ } }
      return true;
    } catch (e) { return false; }
  }
  function hideCaptions(p) {
    captionsOff(p);
    [300, 1000, 2500, 5000, 9000].forEach(function (ms) { setTimeout(function () { captionsOff(p); }, ms); });
  }
  function ytErrorText(code) {
    if (code === 2) return 'ID del video non valido.';
    if (code === 5) return 'Errore del player HTML5.';
    if (code === 100) return 'Video non trovato o privato.';
    if (code === 101 || code === 150) return 'Il proprietario non permette di incorporare questo video: scegline un altro.';
    return 'Errore YouTube ' + code;
  }

  // ---------- fascia copri-sottotitoli ----------
  // Alcuni video hanno i sottotitoli stampati nell'immagine (non sono i CC di YouTube: non si possono spegnere).
  // Opzione per lezione: una fascia sfocata sopra il player, in percentuale del player (così segue anche il player ridotto
  // nell'angolo e lo schermo intero), trascinabile e ridimensionabile; la posizione viene salvata con la lezione.
  // NB: è un elemento sopra il player incorporato, che le regole per gli sviluppatori di YouTube non consentono: resta
  // un'opzione esplicita, spenta di default, per l'uso personale in classe.
  const COVER_DEFAULT = { x: 12, y: 71, w: 76, h: 13 };
  function coverState(ls) {
    if (!ls.options) ls.options = {};
    if (!ls.options.cover) ls.options.cover = Object.assign({ on: false }, COVER_DEFAULT);
    return ls.options.cover;
  }
  function clamp(v, a, b) { return Math.max(a, Math.min(b, v)); }
  function renderCover(box, ls) {
    if (!box) return;
    const old = box.querySelector('.cover'); if (old) old.remove();
    const c = coverState(ls);
    if (!c.on) return;
    const d = el('div', { class: 'cover', title: 'Copre i sottotitoli stampati nel video: trascina per spostare, angolo in basso a destra per ridimensionare' });
    const grip = el('div', { class: 'grip' });
    d.appendChild(el('span', { class: 'lbl', text: '▬ sottotitoli coperti' }));
    d.appendChild(grip);
    const apply = function () { d.style.left = c.x + '%'; d.style.top = c.y + '%'; d.style.width = c.w + '%'; d.style.height = c.h + '%'; };
    apply();
    let drag = null;
    d.addEventListener('pointerdown', function (e) {
      if (e.button !== 0) return;
      const r = box.getBoundingClientRect();
      drag = { mode: e.target === grip ? 'resize' : 'move', sx: e.clientX, sy: e.clientY, x: c.x, y: c.y, w: c.w, h: c.h, rw: r.width || 1, rh: r.height || 1 };
      try { d.setPointerCapture(e.pointerId); } catch (err) { /* ignore */ }
      box.classList.add('dragging');
      e.preventDefault();
    });
    d.addEventListener('pointermove', function (e) {
      if (!drag) return;
      const dx = 100 * (e.clientX - drag.sx) / drag.rw, dy = 100 * (e.clientY - drag.sy) / drag.rh;
      if (drag.mode === 'move') { c.x = clamp(drag.x + dx, 0, 100 - c.w); c.y = clamp(drag.y + dy, 0, 100 - c.h); }
      else { c.w = clamp(drag.w + dx, 10, 100 - c.x); c.h = clamp(drag.h + dy, 4, 100 - c.y); }
      apply();
    });
    const end = function () { if (!drag) return; drag = null; box.classList.remove('dragging'); c.x = Math.round(c.x * 10) / 10; c.y = Math.round(c.y * 10) / 10; c.w = Math.round(c.w * 10) / 10; c.h = Math.round(c.h * 10) / 10; touch(ls); };
    d.addEventListener('pointerup', end);
    d.addEventListener('pointercancel', end);
    box.appendChild(d);
  }
  function setCover(ls, on, box, checkboxIds) {
    coverState(ls).on = !!on; touch(ls);
    renderCover(box, ls);
    (checkboxIds || []).forEach(function (id) { const cb = $(id); if (cb) cb.checked = !!on; });
  }
  $('#e-cover').addEventListener('change', function () { const ls = current(); if (ls) setCover(ls, $('#e-cover').checked, $('#e-player'), ['#s-cover']); });
  $('#s-cover').addEventListener('change', function () { const ls = S.student && S.student.lesson; if (ls) setCover(ls, $('#s-cover').checked, $('#s-player'), ['#e-cover']); });

  // ---------- loop ----------
  function startLoop() { stopLoop(); S.loop = setInterval(tick, 200); }
  function stopLoop() { if (S.loop) { clearInterval(S.loop); S.loop = null; } }
  function tick() {
    if (!S.player) return;
    // controllo periodico: sottotitoli sempre spenti durante la riproduzione
    if (S.player.kind === 'yt' && S.player.state() === 1) {
      const now = Date.now();
      if (!S.capAt || now - S.capAt > 2000) { S.capAt = now; captionsOff(S.player.raw); }
    }
    if (S.view === 'editor') editorTick();
    else if (S.view === 'student') studentTick();
  }

  // ---------- navigazione ----------
  function show(view) {
    S.view = view;
    $$('.view').forEach(function (v) { v.classList.toggle('active', v.id === 'view-' + view); });
    document.body.className = document.body.className.replace(/\bview-\S+/g, '').trim();
    document.body.classList.add('view-' + view);
    $$('#nav button[data-view]').forEach(function (b) { b.classList.toggle('primary', b.dataset.view === view && view === 'new'); });
    window.scrollTo(0, 0);
    if (view !== 'editor' && view !== 'student') { stopLoop(); destroyPlayer(); }
    if (!S.standalone) { renderAccount(); initCloud(); }   // solo per l'insegnante: gli studenti (link) non caricano la libreria del cloud
  }
  document.addEventListener('click', function (e) {
    const b = e.target.closest('[data-view]');
    if (!b) return;
    const v = b.dataset.view;
    if (v === 'home') renderHome();
    else if (v === 'new') openNew();
    else if (v === 'community') renderCommunity();
    else if (v === 'classes') renderClasses();   // v125
  });
  // v106 (Edoardo, screenshot da telefono: la nav sotto i 640px e' un pannello a tendina dietro il pulsante ☰,
  // vedi styles.css). Si chiude da sola alla scelta di una voce (ogni pulsante dentro #nav naviga o apre un dialogo,
  // quindi lasciarla aperta sarebbe solo confusione), non solo ricliccando ☰.
  (function () {
    const toggle = $('#nav-toggle'), nav = $('#nav');
    if (!toggle || !nav) return;
    function setOpen(open) { nav.classList.toggle('open', open); toggle.setAttribute('aria-expanded', open ? 'true' : 'false'); }
    toggle.addEventListener('click', function () { setOpen(!nav.classList.contains('open')); });
    nav.addEventListener('click', function (e) { if (e.target.closest('button')) setOpen(false); });
  })();

  // v109 (Edoardo: "comprimi 'lezione da video/giochi/conversazione/sfida' in un menù a tendina a fianco al
  // titolo, così di default si vedono già le lezioni"): il pannello con i 4 servizi parte chiuso, si apre col
  // pulsante "+ Nuovo…" e si richiude da solo appena si sceglie una voce (naviga o apre un dialogo) o si clicca
  // fuori — stesso schema del menu ☰ qui sopra.
  (function () {
    const toggle = $('#svc-toggle'), panel = $('#services');
    if (!toggle || !panel) return;
    function setOpen(open) { panel.classList.toggle('open', open); toggle.setAttribute('aria-expanded', open ? 'true' : 'false'); }
    toggle.addEventListener('click', function (e) { e.stopPropagation(); setOpen(!panel.classList.contains('open')); });
    panel.addEventListener('click', function () { setOpen(false); });
    document.addEventListener('click', function (e) { if (panel.classList.contains('open') && !panel.contains(e.target) && e.target !== toggle) setOpen(false); });
    document.addEventListener('keydown', function (e) { if (e.key === 'Escape' && panel.classList.contains('open')) setOpen(false); });
  })();

  // ---------- HOME ----------
  function bookmarkletUrl() {
    if (!window.VL_BOOKMARKLET) return '';
    const base = location.origin + location.pathname;
    return 'javascript:' + encodeURIComponent('(' + window.VL_BOOKMARKLET.toString() + ')(' + JSON.stringify(base) + ')');
  }
  function renderBookmarklet() {
    const a = $('#bookmarklet-link'); if (!a) return;
    const url = bookmarkletUrl();
    if (!url || !/^https?:/.test(location.protocol)) { $('#bookmarklet-card').style.display = 'none'; return; }
    a.setAttribute('href', url);
    a.onclick = function (e) { e.preventDefault(); toast('Trascina il pulsante nella barra dei preferiti, poi usalo su YouTube'); };
    $('#bookmarklet-code').textContent = url;
    $('#bookmarklet-copy').onclick = function () { copyText(url); };
    const a2 = $('#plat-bookmarklet');
    if (a2) { a2.setAttribute('href', url); a2.onclick = function (e) { e.preventDefault(); toast('Trascina il pulsante nella barra dei preferiti, poi usalo sulla pagina della tua lezione'); }; }
  }
  /* v120 "Importa da altre piattaforme" (Edoardo: "voglio su PauseLearn un tasto importa da altre piattaforme, che
     inizialmente è compatibile con ISLCollective"). Senza server l'app non può leggere la pagina di un altro sito
     (CORS), quindi la lettura la fa il pulsante dei preferiti DENTRO quella pagina (bookmarklet.js), come per YouTube;
     la conversione è in platforms.js (VLPlat, testato in test/platforms.test.js). La lezione arriva senza trascrizione:
     gli esercizi portano le loro frasi, quindi per lo studente è completa; nell'editor Helper/"Altra frase"/parole dal
     video non hanno materiale. Stessa lezione importata due volte: si apre quella già presente, non si duplica. */
  function importFromPlatform(payload) {
    if (!window.VLPlat) return toast('Modulo di importazione non caricato: ricarica la pagina', 6000);
    // v122 (Edoardo: "se una persona vuole importare una lezione in inglese o in tedesco, come può fare se il sito ha
    // soltanto una regola?"): la lingua di studio NON è fissa. Si rileva dalle frasi (VLPlat.detectLanguage) e si
    // chiede conferma in un dialogo con le stesse lingue di "Nuova lezione" (#f-lang): una lingua nuova aggiunta lì
    // (e in lang.js) arriva qui da sola. Il campo `language` di ISLCollective non si usa: dice "en" anche per l'italiano.
    const langs = Array.prototype.map.call($('#f-lang').options, function (o) { return { value: o.value, label: o.textContent }; });
    const det = VLPlat.detectLanguage(payload, langs.map(function (l) { return l.value; }));
    const sel = $('#pl-lang'); sel.innerHTML = '';
    langs.forEach(function (l) { sel.appendChild(el('option', { value: l.value, text: l.label, selected: l.value === det.lang ? 'selected' : null })); });
    $('#pl-title').textContent = payload.title || '(senza titolo)';
    $('#pl-detect').textContent = det.sure ? 'Rilevata dalle frasi degli esercizi: ' + (langs.find(function (l) { return l.value === det.lang; }) || {}).label + '. Cambiala se non è giusta.' : 'Non sono sicuro della lingua: controlla prima di continuare.';
    const dlg = $('#dlg-platform-lang');
    const ok = $('#pl-ok'), cancel = $('#pl-cancel');
    ok.onclick = function () { dlg.close(); finishPlatformImport(payload, sel.value); };
    cancel.onclick = function () { dlg.close(); renderHome(); toast('Importazione annullata'); };
    show('home'); renderHome();
    dlg.showModal();
  }
  function finishPlatformImport(payload, lang) {
    let out;
    try { out = VLPlat.convert(payload, { lang: lang, uid: uid }); } catch (e) { return toast('Importazione non riuscita: ' + e.message, 6000); }
    if (out.set) return finishSetImport(out);   // v126: Wayground → set di esercizi (niente video)
    const src = out.lesson.importedFrom || {};
    const already = Object.keys(S.lessons).find(function (id) { const l = S.lessons[id]; return l && l.importedFrom && l.importedFrom.site === src.site && src.id && String(l.importedFrom.id) === String(src.id); });   // v121: id numero o stringa
    if (already) {
      toast('Questa lezione era già stata importata da ' + platformName(src.site) + ': apro quella. Per reimportarla, prima eliminala.', 7000);
      return openEditor(already);
    }
    if (!out.lesson.exercises.length) return toast('Nessun esercizio convertibile in questa lezione' + (out.skipped.length ? ' (' + out.skipped.length + ' non riconosciuti)' : ''), 7000);
    const ls = newLesson(out.lesson);
    saveLessons();
    openEditor(ls.id);
    const msg = 'Importata da ' + platformName(src.site) + ': ' + out.lesson.exercises.length + ' esercizi' + (out.lesson.cuts.length ? ', ' + out.lesson.cuts.length + (out.lesson.cuts.length === 1 ? ' taglio' : ' tagli') : '')
      + (out.skipped.length ? ' · ' + out.skipped.length + ' non convertibili (' + out.skipped.map(function (s) { return 'n.' + s.n; }).join(', ') + ')' : '')
      + '. Controlla tempi e frasi: la trascrizione del video non c\'è, ma per lo studente la lezione è completa.';
    toast(msg, 9000);
  }
  /** v126: un quiz importato (Wayground) diventa un SET di esercizi: lo stesso oggetto della Sfida in classe (ls.chal),
   *  che si assegna come compito (📋 Assegna) o si gioca in classe. Stesso quiz due volte: si apre quello già presente. */
  function finishSetImport(out) {
    const src = out.set.importedFrom || {};
    const already = Object.keys(S.lessons).find(function (id) { const l = S.lessons[id]; return l && l.chal && l.importedFrom && l.importedFrom.site === src.site && src.id && String(l.importedFrom.id) === String(src.id); });
    if (already) { toast('Questo quiz era già stato importato da ' + platformName(src.site) + ': apro quello. Per reimportarlo, prima eliminalo.', 7000); return openChalSet(already); }
    if (!out.set.items.length) return toast('Nessuna domanda convertibile in questo quiz' + (out.skipped.length ? ' (' + out.skipped.length + ' di tipi che PauseLearn non ha)' : ''), 7000);
    const id = 'chal-' + Date.now().toString(36);
    S.lessons[id] = { id: id, title: out.set.title || 'Quiz importato', lang: out.set.lang || 'it', chal: { items: out.set.items }, importedFrom: src, updatedAt: new Date().toISOString() };
    if (out.set.cover) S.lessons[id].chal.coverUrl = out.set.cover;   // v183: lo sfondo dell'app di LearningApps fa da copertina
    saveLessons();
    openChalSet(id);
    toast('Importato da ' + platformName(src.site) + ': ' + out.set.items.length + ' esercizi' + (out.skipped.length ? ' · ' + out.skipped.length + ' non convertibili (' + out.skipped.map(function (x) { return 'n.' + x.n; }).join(', ') + ')' : '') + '. Ora puoi assegnarlo a una classe (📋 Assegna) o giocarlo in classe.', 9000);
  }
  function platformName(site) { return (window.VLPlat && VLPlat.PLATFORMS[site] && VLPlat.PLATFORMS[site].name) || site || 'altra piattaforma'; }
  $('#btn-platform').addEventListener('click', function () { $('#dlg-platform').showModal(); });
  $('#plat-close').addEventListener('click', function () { $('#dlg-platform').close(); });
  /* v105 (community, Edoardo: "voglio che la mia collega trovi le mie lezioni online anche quando si registra"): pubblicare
     una lezione la rende leggibile a CHIUNQUE abbia un account (non solo alla collega, e non a chi non si è registrato:
     regola nel database, non un filtro dell'interfaccia), ma resta una scelta per singola voce, spenta di default — niente
     esce dal proprio account finché non lo si dice esplicitamente. Il campo vive dentro `ls` come level/audience (v79) e
     viaggia col resto della lezione: niente colonna nuova nel database, solo una nuova regola di lettura su quella già
     esistente (`data->>published`). */
  function togglePublish(ls) {
    ls.published = !ls.published; ls.updatedAt = new Date().toISOString();
    saveLessons(); renderHome();
    toast(ls.published ? 'Pubblicata: la vedranno gli insegnanti che hanno un account (Community)' : 'Tolta dalla Community');
  }
  function publishBtn(ls) {
    if (!cloudConfigured() || !CLOUD.user) return null;   // serve un account: senza, non c'è dove pubblicarla né chi la vedrebbe
    return el('button', { class: 'small' + (ls.published ? ' ok' : ''), text: ls.published ? '🌐 Pubblicata ✓' : '🌐 Pubblica', title: ls.published ? 'Visibile nella Community agli insegnanti registrati: clicca per ritirarla' : 'Rendila visibile nella Community agli insegnanti registrati', onclick: function () { togglePublish(ls); } });
  }
  /* v110 (Edoardo: "il fine per me è la pubblicazione... mi serve un promemoria, se non pubblicano rimane lì"): fascia
     NON bloccante sulla card di ogni lezione non pubblicata (niente pop-up: un'interruzione ripetuta a ogni apertura
     punirebbe anche chi ha deciso apposta di non pubblicare, e spingerebbe a pubblicare contenuto acerbo solo per
     zittirla — vedi la discussione in chat).
     v112 (Edoardo: "'non proporla più' sostituiscilo con 'ricordamelo più tardi'"): NON è stato un cambio di sola
     etichetta. Il pulsante della v110 (ls.publishSkip) era un opt-out PERMANENTE: una volta chiuso, quella lezione
     non riceveva più la fascia, punto, e non esisteva alcun modo di riaccenderla dall'interfaccia. "Ricordamelo più
     tardi" promette il contrario: un ritorno futuro. Tenere la logica vecchia sotto l'etichetta nuova avrebbe reso il
     pulsante bugiardo (l'insegnante lo legge come "fra un po' me lo richiede", ma non sarebbe successo mai più).
     Sostituito con uno SNOOZE vero: ls.publishSnoozeUntil (timestamp ISO), 3 giorni da quando si preme il pulsante —
     scelto come compromesso fra "quasi subito" (rischia di essere identico al pop-up ripetuto appena scartato) e
     "praticamente per sempre" (il difetto della v110); se in futuro 3 giorni si rivelano troppi o troppo pochi, il
     numero è isolato in SNOOZE_DAYS, non sparso nel codice. Il pulsante "Pubblica" nella riga delle azioni resta
     comunque sempre lì: pubblicare prima dei 3 giorni è sempre possibile, lo snooze riguarda solo il promemoria. */
  var PUBLISH_SNOOZE_DAYS = 3;
  function publishNudge(ls) {
    if (!cloudConfigured() || !CLOUD.user) return null;
    if (ls.published) return null;
    if (ls.publishSnoozeUntil && new Date(ls.publishSnoozeUntil).getTime() > Date.now()) return null;
    return el('div', { class: 'pub-nudge' },
      el('span', { text: '🌐 Non ancora pubblicata: pubblicandola contribuisci alla Community, e trovi più facilmente quella degli altri.' }),
      el('button', { class: 'small primary', text: 'Pubblica ora', onclick: function () { togglePublish(ls); } }),
      el('button', { class: 'link', text: 'Ricordamelo più tardi', onclick: function () {
        ls.publishSnoozeUntil = new Date(Date.now() + PUBLISH_SNOOZE_DAYS * 86400000).toISOString();
        ls.updatedAt = new Date().toISOString(); saveLessons(); renderHome();
      } }));
  }
  /** Tipo di una voce del portfolio: lezione video, attività standalone o conversazione. */
  function homeKind(ls) {
    if (ls.activity && !Array.isArray(ls.exercises)) return 'act';
    if (ls.conv && !Array.isArray(ls.exercises)) return 'conv';
    if (ls.chal && !Array.isArray(ls.exercises)) return 'chal';
    return 'video';
  }
  /** v145 (Edoardo: "nella sezione esercitazioni voglio poter creare delle cartelle"). Una cartella è un NOME: ogni
   *  esercitazione ha ls.folder (viaggia nel cloud con la lezione); l'elenco delle cartelle = quelle usate + quelle create e
   *  ancora vuote (S.settings.chalFolders, solo in questo browser finché non ci metti qualcosa). Niente cartelle annidate.
   *  Barra sopra la lista (solo nella scheda 📝 Esercitazioni): Tutte, una per cartella, Senza cartella, + Nuova cartella;
   *  con una cartella aperta: Rinomina ed Elimina (a due clic, le esercitazioni NON si cancellano: tornano senza cartella).
   *  Su ogni card il menu "📁 Sposta in…". */
  function chalFolders() {
    const set = {};
    (S.settings.chalFolders || []).forEach(function (f) { if (f) set[f] = 1; });
    Object.keys(S.lessons).forEach(function (k) { const ls = S.lessons[k]; if (homeKind(ls) === 'chal' && ls.folder) set[ls.folder] = 1; });
    return Object.keys(set).sort(function (a, b) { return a.localeCompare(b, 'it', { sensitivity: 'base' }); });
  }
  function folderAdd(name) {
    name = String(name || '').trim().replace(/\s+/g, ' ').slice(0, 60);
    if (!name) return '';
    const ex = chalFolders().find(function (f) { return f.toLowerCase() === name.toLowerCase(); });
    if (ex) return ex;
    S.settings.chalFolders = (S.settings.chalFolders || []).concat([name]); saveSettings();
    return name;
  }
  function folderSet(ls, name) { if (name) ls.folder = name; else delete ls.folder; saveDebounced(); }
  function renderHomeFolders(all, visible) {
    const box = $('#home-folders'); if (!box) return;
    box.innerHTML = '';
    box.style.display = visible ? '' : 'none';
    if (!visible) return;
    const sets = all.filter(function (ls) { return homeKind(ls) === 'chal'; });
    const folders = chalFolders();
    if (S.homeFolder && S.homeFolder !== '\u0000' && folders.indexOf(S.homeFolder) === -1) S.homeFolder = '';
    const cnt = function (f) { return sets.filter(function (ls) { return (ls.folder || '') === f; }).length; };
    const chip = function (val, label) {
      return el('button', { class: 'fchip folder' + ((S.homeFolder || '') === val ? ' on' : ''), text: label, onclick: function () { S.homeFolder = val; renderHome(); } });
    };
    const row = el('div', { class: 'fchips' });
    row.appendChild(chip('', 'Tutte (' + sets.length + ')'));
    folders.forEach(function (f) { row.appendChild(chip(f, '📁 ' + f + ' (' + cnt(f) + ')')); });
    if (folders.length) row.appendChild(chip('\u0000', 'Senza cartella (' + cnt('') + ')'));
    const nameIn = el('input', { type: 'text', class: 'folder-new', placeholder: 'Nome della cartella', maxlength: '60', style: 'display:none' });
    const addBtn = el('button', { class: 'fchip folder-add', text: '+ Nuova cartella' });
    const create = function () { const n = folderAdd(nameIn.value); if (!n) { nameIn.focus(); return; } S.homeFolder = n; renderHome(); toast('Cartella «' + n + '» creata: spostaci le esercitazioni con il menu 📁 sulla card'); };
    addBtn.addEventListener('click', function () { if (nameIn.style.display === 'none') { nameIn.style.display = ''; addBtn.textContent = 'Crea'; nameIn.focus(); } else create(); });
    nameIn.addEventListener('keydown', function (e) { if (e.key === 'Enter') create(); if (e.key === 'Escape') renderHome(); });
    row.appendChild(nameIn); row.appendChild(addBtn);
    box.appendChild(row);
    if (S.homeFolder && S.homeFolder !== '\u0000') {
      const cur = S.homeFolder;
      const rn = el('button', { class: 'small', text: '✎ Rinomina cartella' });
      rn.addEventListener('click', function () {
        const inp = el('input', { type: 'text', value: cur, maxlength: '60' });
        const ok = el('button', { class: 'small primary', text: 'Salva' });
        const go = function () {
          const n = String(inp.value || '').trim().replace(/\s+/g, ' ').slice(0, 60); if (!n || n === cur) return renderHome();
          Object.keys(S.lessons).forEach(function (k) { const ls = S.lessons[k]; if (homeKind(ls) === 'chal' && ls.folder === cur) ls.folder = n; });
          S.settings.chalFolders = (S.settings.chalFolders || []).filter(function (f) { return f !== cur && f !== n; }).concat([n]); saveSettings();
          saveDebounced(); S.homeFolder = n; renderHome();
        };
        ok.addEventListener('click', go); inp.addEventListener('keydown', function (e) { if (e.key === 'Enter') go(); });
        rn.replaceWith(inp, ok); inp.focus(); inp.select();
      });
      box.appendChild(el('div', { class: 'row folder-tools' }, rn,
        twoStep('Elimina cartella', function () {
          Object.keys(S.lessons).forEach(function (k) { const ls = S.lessons[k]; if (homeKind(ls) === 'chal' && ls.folder === cur) delete ls.folder; });
          S.settings.chalFolders = (S.settings.chalFolders || []).filter(function (f) { return f !== cur; }); saveSettings();
          saveDebounced(); S.homeFolder = ''; renderHome(); toast('Cartella eliminata: le esercitazioni sono rimaste, senza cartella');
        }),
        el('span', { class: 'hint', text: 'Eliminando la cartella le esercitazioni restano.' })));
    }
  }
  function folderSelect(ls) {
    const sel = el('select', { class: 'small folder-sel', title: 'Sposta questa esercitazione in una cartella' });
    sel.appendChild(el('option', { value: '', text: ls.folder ? '📁 ' + ls.folder : '📁 Sposta in…' }));
    chalFolders().forEach(function (f) { if (f !== ls.folder) sel.appendChild(el('option', { value: 'f:' + f, text: f })); });
    if (ls.folder) sel.appendChild(el('option', { value: 'none', text: '— togli dalla cartella —' }));
    sel.appendChild(el('option', { value: 'new', text: '+ Nuova cartella…' }));
    sel.addEventListener('change', function () {
      const v = sel.value;
      if (v === 'new') {
        const inp = el('input', { type: 'text', class: 'folder-new', placeholder: 'Nome della cartella', maxlength: '60' });
        const ok = el('button', { class: 'small primary', text: 'Crea e sposta' });
        const go = function () { const n = folderAdd(inp.value); if (!n) { inp.focus(); return; } folderSet(ls, n); renderHome(); toast('Spostata in «' + n + '»'); };
        ok.addEventListener('click', go); inp.addEventListener('keydown', function (e) { if (e.key === 'Enter') go(); if (e.key === 'Escape') renderHome(); });
        sel.replaceWith(inp, ok); inp.focus(); return;
      }
      if (v === 'none') { folderSet(ls, ''); renderHome(); toast('Tolta dalla cartella'); return; }
      if (v.indexOf('f:') === 0) { folderSet(ls, v.slice(2)); renderHome(); toast('Spostata in «' + v.slice(2) + '»'); }
    });
    return sel;
  }
  function renderHome() {
    show('home');
    const svcPanel = $('#services'), svcToggle = $('#svc-toggle');   // v109: si richiude tornando/restando in home
    if (svcPanel) svcPanel.classList.remove('open');
    if (svcToggle) svcToggle.setAttribute('aria-expanded', 'false');
    renderBookmarklet();
    renderStorageBanner();   // v102: il numero di lezioni cambia (importa, elimina), e con zero lezioni la riga sparisce
    const list = $('#lesson-list');
    list.innerHTML = '';
    const all = Object.values(S.lessons).sort(function (a, b) { return (b.updatedAt || '').localeCompare(a.updatedAt || ''); });
    // chip dei filtri con i conteggi veri + ricerca per titolo (v65, home PauseLearn)
    const counts = { all: all.length, video: 0, act: 0, conv: 0, chal: 0 };
    all.forEach(function (ls) { counts[homeKind(ls)]++; });
    const fbox = $('#home-filter');
    if (fbox) {
      fbox.innerHTML = '';
      [['all', 'Tutte'], ['video', '\ud83c\udfac Lezioni'], ['act', '\ud83c\udfb2 Attivit\u00e0'], ['conv', '\ud83d\udcac Conversazioni'], ['chal', '\ud83d\udcdd Esercitazioni']].forEach(function (f) {
        const b = el('button', { class: 'fchip' + ((S.homeFilter || 'all') === f[0] ? ' on' : ''), text: f[1] + ' (' + counts[f[0]] + ')', onclick: function () { S.homeFilter = f[0]; renderHome(); } });
        fbox.appendChild(b);
      });
    }
    const q = L.normalize(S.homeSearch || '');
    const inChal = (S.homeFilter || 'all') === 'chal';
    renderHomeFolders(all, inChal);
    const items = all.filter(function (ls) {
      if ((S.homeFilter || 'all') !== 'all' && homeKind(ls) !== (S.homeFilter || 'all')) return false;
      if (q && L.normalize(ls.title || '').indexOf(q) === -1) return false;
      // v145: nella scheda Esercitazioni la cartella scelta filtra ('' = tutte, '\u0000' = senza cartella)
      if (inChal && S.homeFolder) { const f = ls.folder || ''; if (S.homeFolder === '\u0000' ? f : f !== S.homeFolder) return false; }
      return true;
    });
    if (!all.length) { list.appendChild(el('p', { class: 'muted', text: 'Nessuna lezione ancora. Crea la prima con una delle card qui sopra, oppure prova la demo.' })); return; }
    if (!items.length) { list.appendChild(el('p', { class: 'muted', text: inChal && S.homeFolder && S.homeFolder !== '\u0000' && !q ? 'Cartella vuota: sposta qui un\'esercitazione con il menu 📁 sulla sua card (da "Tutte"), oppure creane una nuova adesso: nasce in questa cartella.' : 'Niente che corrisponda al filtro o alla ricerca.' })); return; }
    items.forEach(function (ls) {
      // attività standalone: card con l'emoji del tipo, Apri = gioca
      if (ls.activity && !Array.isArray(ls.exercises)) {
        const t = ACT.TYPES[ls.activity.type] || { emoji: '🎲', label: 'Attività' };
        const th = ACT.THEMES.find(function (x) { return x.id === ls.activity.theme; });
        const openA = function () { openActPlay(ls.id); };
        const hrefA = localOpenHref(ls);   // v115: tasto destro → apri in un'altra scheda (stesso browser)
        const nItems = (ls.activity.data.pairs || ls.activity.data.questions || ls.activity.data.words || ls.activity.data.items || []).length;
        const cardA = el('div', { class: 'lesson-card' },
          el('a', { class: 'thumb act-thumb', href: hrefA, onclick: function (e) { e.preventDefault(); openA(); }, title: 'Gioca' }, t.emoji),
          el('div', { class: 'body' },
            el('a', { class: 'title', href: hrefA, text: ls.title || '(attività senza titolo)', onclick: function (e) { e.preventDefault(); openA(); } }),
            el('div', { class: 'meta', text: t.label + ' · ' + nItems + ' elementi' + (th ? ' · tema ' + th.name : '') + (ls.updatedAt ? ' · ' + new Date(ls.updatedAt).toLocaleDateString('it-IT') : '') }),
            publishNudge(ls),
            el('div', { class: 'actions' },
              el('a', { class: 'btnlink small primary', href: hrefA, text: '▶ Gioca', title: 'Tasto destro o rotella del mouse: apri in un\'altra scheda', onclick: function (e) { if (e.ctrlKey || e.metaKey || e.shiftKey) return; e.preventDefault(); openA(); } }),
              el('button', { class: 'small', text: '✎ Modifica', onclick: function () { openActEditor(ls.id); } }),
              el('button', { class: 'small', text: 'Esporta', onclick: function () { download(slugify(ls.title || 'attivita') + '.json', JSON.stringify(actPayload(ls), null, 1)); } }),
              publishBtn(ls),
              el('button', { class: 'small danger', text: 'Elimina', onclick: function () { if (confirm('Eliminare "' + (ls.title || 'attività senza titolo') + '"?')) deleteLesson(ls); } }))));
        list.appendChild(cardA);
        return;
      }
      // set della Sfida in classe: si apre l'editor, "Gioca" lancia il dialog della sfida
      if (ls.chal && !Array.isArray(ls.exercises)) {
        const nIt = (ls.chal.items || []).length;
        const openS = function () { openChalSet(ls.id); };
        const cardS = el('div', { class: 'lesson-card' },
          chalCoverThumb(ls, openS),
          el('div', { class: 'body' },
            el('div', { class: 'title', text: ls.title || '(set senza titolo)', onclick: openS }),
            el('div', { class: 'meta', text: (ls.folder ? '📁 ' + ls.folder + ' · ' : '') + 'Esercitazione · ' + nIt + (nIt === 1 ? ' esercizio' : ' esercizi') + (ls.importedFrom ? ' · da ' + platformName(ls.importedFrom.site) : '') + (ls.updatedAt ? ' · ' + new Date(ls.updatedAt).toLocaleDateString('it-IT') : '') }),
            publishNudge(ls),
            el('div', { class: 'actions' },
              el('button', { class: 'small primary', text: '📋 Assegna', title: 'Compito o esercitazione per una classe: vedi chi l\'ha fatto e cosa ha sbagliato', onclick: function () { openAssignDialog(ls); } }),   // v126
              el('button', { class: 'small', text: '📱 Sfida in classe', title: 'Gioco dal vivo con classifica, come Kahoot', onclick: function () { openChalNew(ls.id); } }),
              el('button', { class: 'small', text: '✎ Modifica', onclick: openS }),
              folderSelect(ls),
              el('button', { class: 'small', text: 'Esporta', onclick: function () { download(slugify(ls.title || 'sfida') + '.json', JSON.stringify({ v: 1, id: ls.id, title: ls.title, chal: ls.chal }, null, 1)); } }),
              publishBtn(ls),
              el('button', { class: 'small danger', text: 'Elimina', onclick: function () { if (confirm('Eliminare "' + (ls.title || 'set senza titolo') + '"?')) deleteLesson(ls); } }))));
        list.appendChild(cardS);
        return;
      }
      // conversazione standalone: nessun video, si apre il foglio A4
      if (ls.conv && !Array.isArray(ls.exercises)) {
        const u = ls.conv;
        const openC = function () { openConvPrint(ls.id); };
        const hrefC = localOpenHref(ls);   // v115: tasto destro → apri in un'altra scheda (stesso browser)
        // anteprima: la prima foto dell'unita' (v66, 'perch\u00E9 non c'\u00E8 nessuna anteprima?'); senza foto resta il fumetto
        const convPh = (u.photos || []).find(function (p) { return p.url; });
        const cardC = el('div', { class: 'lesson-card' },
          el('a', { class: 'thumb act-thumb conv-thumb', href: hrefC, style: convPh ? 'background-image:url(' + convPh.url.replace(/["\\)]/g, '') + ');background-size:cover;background-position:center' : '', onclick: function (e) { e.preventDefault(); openC(); }, title: 'Apri il foglio' }, convPh ? '' : '\uD83D\uDCAC'),
          el('div', { class: 'body' },
            el('a', { class: 'title', href: hrefC, text: ls.title || '(conversazione senza titolo)', onclick: function (e) { e.preventDefault(); openC(); } }),
            el('div', { class: 'meta', text: 'Conversazione \u00b7 ' + (u.questions || []).length + ' domande \u00b7 livello ' + (u.level || 'B1') + (u.focus ? ' \u00b7 ' + u.focus : '') + (ls.updatedAt ? ' \u00b7 ' + new Date(ls.updatedAt).toLocaleDateString('it-IT') : '') }),
            publishNudge(ls),
            el('div', { class: 'actions' },
              el('a', { class: 'btnlink small primary', href: hrefC, text: '\uD83D\uDDA8 Foglio A4', title: 'Tasto destro o rotella del mouse: apri in un\'altra scheda', onclick: function (e) { if (e.ctrlKey || e.metaKey || e.shiftKey) return; e.preventDefault(); openC(); } }),
              el('button', { class: 'small', text: '\u270E Modifica', onclick: function () { openConvEditor(ls.id); } }),
              el('button', { class: 'small', text: 'Esporta', onclick: function () { download(slugify(ls.title || 'conversazione') + '.json', JSON.stringify({ v: 1, id: ls.id, title: ls.title, conv: ls.conv }, null, 1)); } }),
              publishBtn(ls),
              el('button', { class: 'small danger', text: 'Elimina', onclick: function () { if (confirm('Eliminare "' + (ls.title || 'conversazione senza titolo') + '"?')) deleteLesson(ls); } }))));
        list.appendChild(cardC);
        return;
      }
      const eff = G.effectiveDuration(ls.cuts || [], ls.duration);
      const thumbStyle = ls.videoId && ls.videoId !== 'demo' ? 'background-image:url(https://i.ytimg.com/vi/' + ls.videoId + '/mqdefault.jpg)' : '';
      const open = function () { openStudent(ls.id); };
      const href = localOpenHref(ls);   // v115: tasto destro → apri in un'altra scheda (stesso browser)
      const card = el('div', { class: 'lesson-card' },
        el('a', { class: 'thumb', href: href, style: thumbStyle, onclick: function (e) { e.preventDefault(); open(); }, title: 'Apri la lezione' }, el('div', { class: 'play', text: '▶' })),
        el('div', { class: 'body' },
          el('a', { class: 'title', href: href, text: ls.title || '(senza titolo)', onclick: function (e) { e.preventDefault(); open(); } }),
          el('div', { class: 'meta', text: (ls.exercises || []).length + ' esercizi · ' + fmtMin(eff) + (eff < ls.duration - 1 ? ' (video ' + fmtMin(ls.duration) + ')' : '') + (LEVEL_LABELS[ls.levelBand] ? ' · ' + LEVEL_LABELS[ls.levelBand] : '') + (audienceLabel(ls.audience) ? ' · ' + audienceLabel(ls.audience) : '') + (ls.ai && ls.ai.model ? ' · AI' : '') + (ls.updatedAt ? ' · ' + new Date(ls.updatedAt).toLocaleDateString('it-IT') : '') }),
          publishNudge(ls),
          el('div', { class: 'actions' },
            el('a', { class: 'btnlink small primary', href: href, text: '▶ Apri', title: 'Tasto destro o rotella del mouse: apri in un\'altra scheda', onclick: function (e) { if (e.ctrlKey || e.metaKey || e.shiftKey) return; e.preventDefault(); open(); } }),
            el('button', { class: 'small', text: '✎ Modifica', onclick: function () { if (lessonEditLocked()) return openEditLockedDialog(ls); openEditor(ls.id); } }),
            el('button', { class: 'small', text: '🔗 Condividi', title: 'Link studente', onclick: function () { openShare(ls); } }),   // v78
            el('button', { class: 'small', text: '📋 Assegna', title: 'Assegna a una classe come compito: vedi chi l\'ha fatto e cosa ha sbagliato', onclick: function () { openAssignDialog(ls); } }),   // v125
            el('button', { class: 'small', text: 'Esporta', onclick: function () { download(slugify(ls.title) + '.json', JSON.stringify(studentPayload(ls), null, 1)); } }),
            publishBtn(ls),
            el('button', { class: 'small danger', text: 'Elimina', onclick: function () { if (confirm('Eliminare "' + ls.title + '"?')) deleteLesson(ls); } }))));
      list.appendChild(card);
    });
  }
  // ---------- COMMUNITY (v105) ----------
  // COMM.rows: null = non ancora caricato, [] = caricato e vuoto. Si ricarica solo entrando nella vista (niente polling).
  const COMM = { rows: null, loading: false };
  function renderCommunity() {
    show('community');
    const list = $('#community-list');
    if (!cloudConfigured() || !CLOUD.user) {
      list.innerHTML = '';
      list.appendChild(el('p', { class: 'muted', text: 'Per vedere le lezioni pubblicate dagli altri insegnanti serve un account gratuito: accedi dal pulsante in alto.' }));
      return;
    }
    if (COMM.rows === null) { loadCommunity(); return; }
    renderCommunityList();
  }
  function loadCommunity() {
    if (COMM.loading) return;
    COMM.loading = true;
    const list = $('#community-list');
    list.innerHTML = '';
    list.appendChild(el('p', { class: 'muted', text: 'Carico…' }));
    CLOUD.adapter.community().then(function (rows) {
      COMM.rows = rows || [];
      COMM.loading = false;
      renderCommunityList();
    }).catch(function (err) {
      COMM.loading = false;
      list.innerHTML = '';
      list.appendChild(el('p', { class: 'muted', text: 'Non sono riuscito a caricare la Community: ' + err.message }));
    });
  }
  function renderCommunityList() {
    const list = $('#community-list');
    list.innerHTML = '';
    const rows = COMM.rows || [];
    const mine = CLOUD.user && CLOUD.user.id;
    // v109 (Edoardo: "voglio che ci fossero le lezioni in ordine di data, prima la più recente"): niente ordine dal
    // server, quindi lo si applica qui una volta sola, PRIMA del filtro di ricerca (così l'ordine resta stabile
    // mentre si digita).
    const others = rows.filter(function (r) { return r.owner !== mine; })
      .sort(function (a, b) { return (b.updated_at || '').localeCompare(a.updated_at || ''); });
    if (!rows.length) { list.appendChild(el('p', { class: 'muted', text: 'Nessuna lezione pubblicata ancora: quando un insegnante pubblica una lezione, comparirà qui.' })); return; }
    const q = L.normalize(($('#comm-search') && $('#comm-search').value) || '');
    const items = others.filter(function (r) { return !q || L.normalize((r.title || '')).indexOf(q) !== -1; });
    if (!items.length) {
      // v109 (Edoardo: "ho cercato vaccino/vaccini e non appare nulla ma c'è un video sui vaccini" — l'unica
      // pubblicata era la SUA, ed è per design esclusa dalla propria vista Community, vedi riga "others" sopra;
      // prima i due casi condividevano un unico messaggio ambiguo, ora sono separati per non sembrare un bug di ricerca).
      const msg = !others.length
        ? 'Le lezioni pubblicate finora sono solo le tue: qui in Community vedi quelle degli ALTRI insegnanti (le tue sono già in "Le tue lezioni"). Appena un collega pubblica qualcosa comparirà qui.'
        : 'Nessuna lezione pubblicata corrisponde alla ricerca.';
      list.appendChild(el('p', { class: 'muted', text: msg }));
      return;
    }
    const KIND_LABEL = { video: '🎬 Lezione', act: '🎲 Attività', conv: '💬 Conversazione', chal: '📝 Esercitazione' };
    items.forEach(function (r) {
      const ls = r.data || {};
      const label = KIND_LABEL[homeKind(ls)] || '🎬 Lezione';
      const thumbStyle = ls.videoId && ls.videoId !== 'demo' ? 'background-image:url(https://i.ytimg.com/vi/' + ls.videoId + '/mqdefault.jpg)' : '';
      // v115: "apri in un'altra scheda" col tasto destro, anche in Community (finora nessuna card era cliccabile:
      // solo "+ Copia alla cieca"). href non null solo per video/attività (v. communityHref); conv/chal restano
      // come prima, senza anteprima: il tag resta 'div', non 'a'.
      const href = communityHref(r);
      const openPreview = href ? function () { openCommunityPreview(r); } : null;
      const thumbTag = href ? 'a' : 'div';
      const thumbBase = { class: 'thumb' + (thumbStyle ? '' : ' act-thumb'), title: href ? 'Anteprima' : undefined };
      if (href) { thumbBase.href = href; thumbBase.onclick = function (e) { e.preventDefault(); openPreview(); }; }
      const thumb = thumbStyle
        ? el(thumbTag, Object.assign({ style: thumbStyle }, thumbBase), el('div', { class: 'play', text: '▶' }))
        : el(thumbTag, thumbBase, label.split(' ')[0]);
      const titleAttrs = Object.assign({ class: 'title', text: ls.title || '(senza titolo)' }, href ? { href: href, onclick: function (e) { e.preventDefault(); openPreview(); } } : {});
      const card = el('div', { class: 'lesson-card' },
        thumb,
        el('div', { class: 'body' },
          el(href ? 'a' : 'div', titleAttrs),
          el('div', { class: 'meta', text: label + (r.updated_at ? ' · ' + new Date(r.updated_at).toLocaleDateString('it-IT') : '') }),
          el('div', { class: 'actions' },
            el('button', { class: 'small primary', text: '+ Copia nelle tue lezioni', onclick: function () { copyFromCommunity(r); } }))));
      list.appendChild(card);
    });
  }
  /** Copia una lezione pubblicata da un altro insegnante nella propria libreria: nuovo id, non più "pubblicata" (la copia parte privata). */
  function copyFromCommunity(row) {
    const ls = JSON.parse(JSON.stringify(row.data || {}));
    ls.id = uid();
    delete ls.published;
    delete ls.publishSnoozeUntil;   // v110/v112: se l'originale aveva rimandato il promemoria, la copia (nuova, mai pubblicata) lo riceve subito
    ls.updatedAt = new Date().toISOString();
    S.lessons[ls.id] = ls;
    saveLessons();
    toast('Copiata tra le tue lezioni: "' + (ls.title || 'senza titolo') + '"');
  }
  $('#import-file').addEventListener('change', function (e) {
    const f = e.target.files[0]; if (!f) return;
    const r = new FileReader();
    r.onload = function () {
      try {
        const ls = JSON.parse(r.result);
        if (ls && ls.conv && !Array.isArray(ls.exercises)) {
          ls.id = ls.id && !S.lessons[ls.id] ? ls.id : uid();
          ls.updatedAt = new Date().toISOString();
          S.lessons[ls.id] = ls; saveLessons(); renderHome(); toast('Conversazione importata');
          return;
        }
        if (ls && ls.activity && !Array.isArray(ls.exercises)) {
          ls.id = ls.id && !S.lessons[ls.id] ? ls.id : uid();
          ls.updatedAt = new Date().toISOString();
          S.lessons[ls.id] = ls; saveLessons(); renderHome(); toast('Attività importata');
          return;
        }
        if (!ls || !Array.isArray(ls.exercises)) throw new Error('formato non riconosciuto');
        ls.id = ls.id && !S.lessons[ls.id] ? ls.id : uid();
        ls.options = ls.options || { strict: false, fx: true };
        ls.cuts = ls.cuts || [];
        ls.updatedAt = new Date().toISOString();
        S.lessons[ls.id] = ls; saveLessons(); renderHome(); toast('Lezione importata');
      } catch (err) { toast('Importazione fallita: ' + err.message); }
    };
    r.readAsText(f);
    e.target.value = '';
  });
  $('#btn-new-act').addEventListener('click', function () { openActNew(newActivity); });
  $('#home-search').addEventListener('input', function () { S.homeSearch = this.value; renderHome(); });
  $('#comm-search').addEventListener('input', function () { renderCommunityList(); });
  // (la card #svc-qr e' agganciata nel blocco Sfida in classe, piu' sotto)
  $('#btn-demo').addEventListener('click', function () {
    if (!window.VL_DEMO) return toast('Dati demo non trovati');
    const parsed = G.parseTranscript(window.VL_DEMO.transcript);
    const ls = newLesson({ title: window.VL_DEMO.title, videoId: 'demo', videoUrl: '', lang: 'it', level: 'B1', lines: parsed.lines, duration: window.VL_DEMO.duration, transcriptRaw: window.VL_DEMO.transcript });
    ls.params = { n: 8, target: 600, types: G.ALL_TYPES.slice(), range: 'smart', contextBefore: 25, ai: false, focus: '' };
    overlay(true);
    setTimeout(function () {
      generate(ls, false).then(function () { overlay(false); openEditor(ls.id); });
    }, 50);
  });

  // ---- v73: tour di benvenuto ('il mio sito deve essere a prova di stupido, tutto facile da capire') ----
  // Al primo accesso dell'insegnante (mai sulle rotte studente) e riapribile dal "?" in alto.
  const TOUR_N = 4;
  let tourIx = 0;
  function tourPaint() {
    $$('#dlg-tour .tour-slide').forEach(function (s, i) { s.hidden = i !== tourIx; });
    $$('#tour-dots i').forEach(function (d, i) { d.classList.toggle('on', i === tourIx); });
    $('#tour-prev').style.visibility = tourIx === 0 ? 'hidden' : '';
    $('#tour-next').textContent = tourIx === TOUR_N - 1 ? 'Chiudi' : 'Avanti ▶';
  }
  function openTour() { tourIx = 0; tourPaint(); $('#dlg-tour').showModal(); }
  $('#tour-prev').addEventListener('click', function () { if (tourIx > 0) { tourIx--; tourPaint(); } });
  $('#tour-next').addEventListener('click', function () { if (tourIx < TOUR_N - 1) { tourIx++; tourPaint(); } else $('#dlg-tour').close(); });
  $('#btn-tour').addEventListener('click', openTour);
  $('#tour-demo').addEventListener('click', function () { $('#dlg-tour').close(); $('#btn-demo').click(); });
  $('#tour-bm').addEventListener('click', function () {   // v74: il tour porta DAVVERO al pulsante dei preferiti
    $('#dlg-tour').close();
    const nb = document.querySelector('#nav [data-view=home]'); if (nb) nb.click();
    const card = $('#bookmarklet-card');
    card.scrollIntoView({ behavior: 'smooth', block: 'center' });
    card.classList.add('spot'); setTimeout(function () { card.classList.remove('spot'); }, 2600);
  });
  $('#tour-new').addEventListener('click', function () { $('#dlg-tour').close(); const b = document.querySelector('#nav [data-view=new]'); if (b) b.click(); });
  function maybeTour() {
    if (S.standalone || S.settings.tourSeen) return;
    S.settings.tourSeen = true; saveSettings();   // segnato subito: il "?" resta per rivederlo
    openTour();
  }

  function newLesson(base) {
    const ls = Object.assign({ v: 1, id: uid(), title: '', videoId: '', videoUrl: '', lang: 'it', level: 'B1', duration: 0, lines: [], chunks: [], exercises: [], cuts: [],
      options: { strict: false, fx: true }, params: {}, ai: null, warnings: [], createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() }, base);
    S.lessons[ls.id] = ls;
    return ls;
  }

  /** Genera (o rigenera) esercizi e tagli per la lezione. */
  function generate(ls, useAI) {
    const p = ls.params;
    const duration = ls.duration;
    if (ls.transcriptRaw) { const rp = G.parseTranscript(ls.transcriptRaw); if (rp.lines.length) ls.lines = rp.lines; }
    const chunks = G.annotate(G.buildChunks(ls.lines, { duration: duration, lang: ls.lang }), { lang: ls.lang, duration: duration });
    ls.chunks = chunks; ls._vocab = null;
    const warnings = [];
    let promise;
    if (useAI && S.settings.apiKey) {
      overlay(true);
      overlayStep('L\'AI sta leggendo la trascrizione e preparando esercizi e tagli.');
      // v87: si puo' annullare e tenersi la bozza fatta con le regole, invece di restare a guardare le mascotte
      const ctl = typeof AbortController === 'function' ? new AbortController() : null;
      if (ctl) overlayCancel(function () { ctl.abort(); });
      const auto = p.n === 'auto' || !(p.n > 0);
      const nEff = auto ? G.autoCount(p.target && p.target > 0 ? Math.min(p.target, duration) : duration) : p.n;
      promise = AI.generateWithAI({ signal: ctl ? ctl.signal : null, onStep: function (st) {
          overlayStep(st.step === 1
            ? 'L\'AI sta leggendo la trascrizione e preparando esercizi e tagli.'
            : 'Il piano era troppo lungo per una risposta sola: riprovo in versione più leggera (' + st.step + ' di ' + st.total + ').');
        }, chunks: chunks, duration: duration, target: p.target, n: nEff, auto: auto, types: p.types, range: p.range, lang: ls.lang, level: ls.level, focus: p.focus, support: vocabState(ls).support, tricky: !!p.tricky, apiKey: S.settings.apiKey, model: S.settings.model })
        .then(function (r) {
          ls.ai = { model: r.ai.model, cost: r.ai.cost, usage: r.ai.usage, notes: r.notes, title: r.title, when: new Date().toISOString() };
          if (r.title && !ls.title) ls.title = r.title;
          return { exercises: r.exercises, cuts: r.cuts, stats: r.stats, warnings: r.warnings, vocab: r.vocab };
        })
        .catch(function (e) {
          // v87: annullato a mano o scaduto il tempo, si dice cos'e' successo senza far sembrare tutto rotto
          if (e.aborted) { warnings.push('Generazione AI annullata: la bozza qui sotto è fatta con le regole. Per la scelta multipla e le parole utili usa i pulsanti AI nell\'editor.'); return null; }
          if (e.timedOut) { warnings.push('L\'AI non ha risposto in tempo (' + e.message.replace(/^l'AI non ha risposto entro /, '') + ', anche riprovando più leggeri): bozza generata con le regole. Riprova, oppure genera con meno esercizi.'); return null; }
          // v86: il troncamento ha un messaggio suo, con il numero vero di token scritti dal modello e cosa fare
          warnings.push(e.truncated
            ? 'Il modello ha scritto ' + (e.outputTokens || '?') + ' token senza chiudere il piano, anche riprovando con meno esercizi: bozza generata con le regole. Gli esercizi ci sono; per la scelta multipla e le parole utili usa i pulsanti AI nell\'editor.'
            : 'AI non usata: ' + e.message + '. Bozza generata con le regole.');
          return null;
        });
    } else {
      if (useAI && !S.settings.apiKey) warnings.push('Nessuna chiave API salvata: bozza generata con le regole (Impostazioni AI per aggiungerla).');
      promise = Promise.resolve(null);
    }
    return promise.then(function (r) {
      overlayCancel(null);   // v87: da qui in poi lavorano le regole, non c'e' piu' niente da annullare
      if (!r) {
        const d = G.generateDraft({ chunks: chunks, lines: ls.lines, duration: duration, n: p.n, target: p.target, tolerance: p.tolerance, types: p.types, range: p.range, lang: ls.lang, contextBefore: p.contextBefore, seed: (Date.now() % 100000) + 1 });
        // v85: se il pianificatore si e' fermato per non rompere il senso, lo si dice chiaro (la comprensione
        // vince sul minutaggio: meglio 40 secondi in piu' che una frase che serviva a capire, tolta di nascosto)
        const corto = d.stats.shortfall > Math.max(5, p.tolerance || 0);
        const perSenso = corto && d.stats.senseBlocked > 0;
        r = { exercises: d.exercises, cuts: d.cuts, stats: d.stats, warnings: corto
          ? [perSenso
            ? 'Durata ' + fmtMin(d.stats.effective) + ' invece di ' + fmtMin(d.stats.target) + ': per arrivarci avrei dovuto togliere frasi che servono a capire il video (spiegazioni, domande con la risposta, riferimenti). Se vuoi scendere ancora, aggiungi un taglio a mano.'
            : 'Durata target non raggiungibile senza tagliare gli esercizi: mancano ' + Math.round(d.stats.shortfall) + 's.']
          : [] };
        if ((p.types || []).indexOf('mc') !== -1) r.warnings.push('Scelta multipla: le regole non sanno scrivere domande, quindi nella bozza non c\'è; nell\'editor cambia il tipo di un esercizio in "Scelta multipla" (con la chiave AI domanda e risposte arrivano da sole).');
        ls.ai = null;
      }
      ls.exercises = r.exercises;
      ls.cuts = r.cuts;
      ls.warnings = warnings.concat(r.warnings || []);
      ls.stats = r.stats;
      // parole utili: dal modello (con traduzioni) o dalle regole (da tradurre nell'editor)
      const vb = vocabState(ls);
      const proposed = (r.vocab && r.vocab.length) ? r.vocab.map(function (v) { return { word: v.word, translation: v.translation, inExercise: v.inExercise, source: 'ai' }; })
        : G.vocabCandidates(chunks, ls.exercises, { lang: ls.lang, n: 14, support: vb.support, level: ls.level }).map(function (v) { return { word: v.word, translation: '', inExercise: v.inExercises, source: 'rules' }; });
      vb.words = proposed.map(function (v) { return Object.assign({ id: uid(), image: '', selected: true }, v); });
      touch(ls);
      saveLessons();
      return ls;
    });
  }

  // ---------- parole utili (modello dati) ----------
  /** ls.vocab = { support, words:[{id, word, translation, image, selected, inExercise, source}], cards:{matching, flashcards, write}, starred:[{word, translation}] } */
  function vocabState(ls) {
    if (!ls.vocab) ls.vocab = { support: ls.lang === 'en' ? 'it' : 'en', words: [], cards: { matching: true, flashcards: true, write: false }, starred: [] };
    if (!ls.vocab.cards) ls.vocab.cards = { matching: true, flashcards: true, write: false };
    if (!ls.vocab.words) ls.vocab.words = [];
    if (!ls.vocab.starred) ls.vocab.starred = [];
    if (!ls.vocab.support) ls.vocab.support = ls.lang === 'en' ? 'it' : 'en';
    return ls.vocab;
  }
  function selectedVocab(ls) { return vocabState(ls).words.filter(function (w) { return w.selected && w.word; }); }
  /** Parole con qualcosa sul "retro" (traduzione o foto): solo queste possono stare nelle schede. */
  function cardVocab(ls) { return selectedVocab(ls).filter(function (w) { return w.translation || w.image; }); }

  // ---------- NUOVA LEZIONE ----------
  const N = { videoId: null, duration: 0, ok: false };
  $('#f-nauto').addEventListener('change', function () { $('#f-n').disabled = $('#f-nauto').checked; updateNHint(); });
  $('#r-nauto').addEventListener('change', function () { $('#r-n').disabled = $('#r-nauto').checked; });
  function updateNHint() {
    const h = $('#f-n-hint'); if (!h) return;
    if (!$('#f-nauto').checked) { h.textContent = ''; return; }
    let d = N.duration;
    if (!d) { const pt = G.parseTranscript($('#f-transcript').value); if (pt.lines.length) d = pt.lines[pt.lines.length - 1].end + 2; }
    const t = d > 0 ? selectedTarget(d) : NaN;
    // v80: niente coda "dove c'è una frase di senso compiuto" — faceva andare la riga a capo nella colonna
    // stretta, e la spiegazione sta già nel tooltip della spunta "Automatico"
    h.textContent = t > 0 ? '≈ ' + G.autoCount(t) + ' esercizi per ' + fmtMin(t) + ' di video' : '';
  }
  function showFormError(msg) {
    const box = $('#f-error'); box.innerHTML = '';
    if (msg) box.appendChild(el('div', { class: 'notice bad', text: msg }));
  }
  function openNew(prefill) {
    show('new');
    $('#f-ai').checked = !!S.settings.apiKey;
    $('#f-ai-status').textContent = S.settings.apiKey ? 'chiave salvata · modello ' + S.settings.model : 'nessuna chiave: apri "Impostazioni AI" per aggiungerla';
    N.videoId = null; N.duration = 0; N.ok = false;
    $('#f-video-status').textContent = 'Incolla il link: controllo che il video esista e che si possa incorporare.';
    $('#f-player').innerHTML = '';
    $('#f-transcript-status').textContent = '';
    $('#f-duration-hint').textContent = '';
    $('#new-title').textContent = 'Nuova lezione';
    $('#f-range').value = 'full'; $('#f-target').style.display = 'none';
    showFormError('');
    if (prefill) {
      $('#f-url').value = prefill.v ? 'https://www.youtube.com/watch?v=' + prefill.v : (prefill.url || '');
      $('#f-title').value = prefill.title || '';
      $('#f-transcript').value = prefill.transcript || '';
      if (prefill.duration > 0) { N.duration = prefill.duration; }
      $('#new-title').textContent = 'Nuova lezione (importata da YouTube)';
      updateTranscriptStatus();
      suggestRange();
      if (!(prefill.transcript || '').trim()) showFormError('Questo video non ha una trascrizione disponibile: non è utilizzabile, a meno di incollare la trascrizione a mano qui a destra (o scegliere un altro video).');
      checkVideo();
    }
  }
  /** Propone "circa 10 minuti" se il video è più lungo di 11 minuti, altrimenti tutto il video. */
  function suggestRange() {
    let d = N.duration || 0;
    let estimated = false;
    if (!d) {
      const p = G.parseTranscript($('#f-transcript').value);
      if (p.lines.length) { d = p.lines[p.lines.length - 1].end + 2; estimated = true; }
    }
    const sel = $('#f-range');
    if (d > 660) sel.value = '600';
    else if (d > 0) sel.value = 'full';
    $('#f-target').style.display = sel.value === 'custom' ? '' : 'none';
    if (d > 0) $('#f-duration-hint').textContent = (estimated ? 'Durata stimata dalla trascrizione: ' : 'Durata del video: ') + fmtMin(d);
    updateNHint();
  }
  $('#f-range').addEventListener('change', function () { $('#f-target').style.display = $('#f-range').value === 'custom' ? '' : 'none'; updateNHint(); });
  $('#f-target').addEventListener('change', updateNHint);
  function selectedTarget(duration) {
    const v = $('#f-range').value;
    if (v === 'full') return duration;
    if (v === 'custom') { const t = L.parseTime($('#f-target').value.trim()); return isNaN(t) || t <= 0 ? NaN : Math.min(t, duration); }
    return Math.min(parseInt(v, 10), duration);
  }
  $('#btn-yt-go').addEventListener('click', function () { const id = extractVideoId($('#f-url').value); if (!id) return toast('Prima incolla il link del video'); window.open('https://www.youtube.com/watch?v=' + id, '_blank'); toast('Sul video premi il preferito ▶ PauseLearn: la lezione arriva qui da sola', 5000); });
  $('#f-url').addEventListener('change', checkVideo);
  $('#f-url').addEventListener('paste', function () { setTimeout(checkVideo, 50); });
  function checkVideo() {
    const id = extractVideoId($('#f-url').value);
    const st = $('#f-video-status');
    if (!id) { st.textContent = 'Link non riconosciuto.'; N.videoId = null; $('#f-yt-go').style.display = 'none'; return; }
    // senza trascrizione, la via più corta è: apri il video su YouTube e premi lì il preferito
    $('#f-yt-go').style.display = G.parseTranscript($('#f-transcript').value).lines.length ? 'none' : '';
    if (id === N.videoId) return;
    N.videoId = id; N.ok = false; N.duration = 0;
    st.textContent = 'Carico il player…';
    createPlayer($('#f-player'), id, {
      onError: function (code) { st.textContent = '⚠ ' + ytErrorText(code); N.ok = false; },
      onState: function () { readDuration(); }
    }).then(function (p) {
      N.ok = true;
      st.textContent = 'Video caricato. Se parte, l\'embed è permesso.';
      setTimeout(readDuration, 800);
      setTimeout(readDuration, 2500);
    }).catch(function (e) { st.textContent = '⚠ ' + e.message; });
  }
  function readDuration() {
    if (!S.player || S.view !== 'new') return;
    const d = S.player.duration();
    if (d > 0 && Math.abs(d - N.duration) > 1) { const had = N.duration > 0; N.duration = d; if (!had) suggestRange(); else $('#f-duration-hint').textContent = 'Durata del video: ' + fmtMin(d); }
  }
  function updateTranscriptStatus() {
    const p = G.parseTranscript($('#f-transcript').value);
    const go = $('#f-yt-go'); if (go) go.style.display = (p.lines.length || !extractVideoId($('#f-url').value)) ? 'none' : '';
    const st = $('#f-transcript-status');
    if (!p.lines.length) {
      const raw = $('#f-transcript').value.trim();
      // testo con tempi ma senza righe valide = quasi sempre l'elenco dei capitoli, non la trascrizione
      st.textContent = !raw ? '' : (/\d{1,2}:\d{2}/.test(raw) ? '⚠ Questo sembra l\'elenco dei CAPITOLI, non la trascrizione: su YouTube apri la descrizione → "Mostra trascrizione" e riprova (pulsante per il browser o copia-incolla).' : '⚠ Non trovo i tempi (0:00, 0:03…): copia il testo dal pannello "Mostra trascrizione".');
      return;
    }
    const last = p.lines[p.lines.length - 1];
    st.textContent = '✓ ' + p.lines.length + ' righe (' + p.format + '), ultimo tempo ' + fmtMin(last.start) + (N.duration ? '' : ' — durata stimata ' + fmtMin(last.end + 2));
    if (!N.duration) { N.duration = 0; }
  }
  $('#f-transcript').addEventListener('input', function () { showFormError(''); updateTranscriptStatus(); if (!N.duration && $('#f-range').value === 'full') suggestRange(); });
  $('#btn-generate').addEventListener('click', function () {
    const url = $('#f-url').value.trim();
    const id = extractVideoId(url);
    const parsed = G.parseTranscript($('#f-transcript').value);
    showFormError('');
    if (!id) return showFormError('Inserisci un link YouTube valido (es. https://www.youtube.com/watch?v=…).');
    if (!parsed.lines.length) {
      const raw = $('#f-transcript').value.trim();
      return showFormError(raw
        ? (/\d{1,2}:\d{2}/.test(raw) ? 'Il testo ricevuto sembra l\'elenco dei capitoli, non la trascrizione (i capitoli hanno tempi e titoli, ma non le frasi). Su YouTube apri la descrizione → "Mostra trascrizione", poi clicca di nuovo il pulsante per il browser o copia il pannello a mano.' : 'La trascrizione incollata non ha i tempi (0:00, 0:07…): senza tempi il video non è utilizzabile. Copia il testo dal pannello "Mostra trascrizione" di YouTube.')
        : 'Manca la trascrizione: questo video non è utilizzabile finché non la incolli a mano (YouTube → Mostra trascrizione) o non usi il pulsante per il browser. Se YouTube non la offre, scegli un altro video.');
    }
    const types = $$('#f-types input[value]:checked').map(function (i) { return i.value; });
    if (!types.length) return showFormError('Scegli almeno un tipo di esercizio.');
    const last = parsed.lines[parsed.lines.length - 1];
    const duration = N.duration > last.start ? N.duration : last.end + 2;
    let target = selectedTarget(duration);
    if (isNaN(target) || target <= 0) return showFormError('Durata personalizzata non valida: usa il formato mm:ss (es. 9:30).');
    const ls = newLesson({
      title: $('#f-title').value.trim() || ('Lezione ' + new Date().toLocaleDateString('it-IT')),
      videoId: id, videoUrl: url, lang: $('#f-lang').value, level: $('#f-level').value, lines: parsed.lines, duration: duration, transcriptRaw: $('#f-transcript').value
    });
    ls.params = { tricky: $('#f-tricky').checked, n: $('#f-nauto').checked ? 'auto' : Math.max(1, parseInt($('#f-n').value, 10) || 10), target: target, tolerance: $('#f-range').value === 'custom' ? 0 : Math.round(target * 0.1), types: types, range: G.RANGES[$('#f-words').value] || null, contextBefore: parseInt($('#f-ctx').value, 10) || 25, ai: $('#f-ai').checked, focus: $('#f-focus').value.trim() };
    overlay(true);
    generate(ls, ls.params.ai).then(function () {
      overlay(false);
      // v115: senza accesso la bozza appena generata si apre così com'è (non nell'editor) — vedi lessonEditLocked
      if (lessonEditLocked()) { openStudent(ls.id); openEditLockedDialog(ls); } else { openEditor(ls.id); }
    }).catch(function (e) { overlay(false); toast('Errore: ' + e.message); console.error(e); });
  });

  // ---------- TIMELINE ----------
  /**
   * Linea del tempo "compressa" (studente): i tagli non esistono, la durata è quella reale dopo i tagli.
   * toV: tempo del video → posizione sulla barra; toR: posizione sulla barra → tempo del video.
   */
  function timeMap(lesson) {
    const D = lesson.duration || 1;
    const keep = G.keepRanges(lesson.cuts || [], D);
    const V = keep.reduce(function (a, r) { return a + (r.end - r.start); }, 0) || 1;
    const toV = function (t) { let v = 0; for (const r of keep) { if (t >= r.end) v += r.end - r.start; else if (t > r.start) { v += t - r.start; break; } else break; } return v; };
    const toR = function (v) { let acc = 0; for (const r of keep) { const len = r.end - r.start; if (v <= acc + len) return r.start + (v - acc); acc += len; } return D; };
    return { V: V, toV: toV, toR: toR };
  }
  /** v90: un colore per taglio (ciclo di 8 tinte ben distinte), usato sulla barra e sulla riga della lista. */
  const CUT_HUES = [8, 200, 42, 268, 150, 330, 24, 190];
  function cutColorStyle(i) {
    const h = CUT_HUES[i % CUT_HUES.length];
    return '--cutc:hsl(' + h + ' 62% 58%);--cutc-lite:hsl(' + h + ' 70% 90%);--cutc-ink:hsl(' + h + ' 70% 26%)';
  }
  function renderTimeline(container, lesson, o) {
    o = o || {};
    container.innerHTML = '';
    const D = lesson.duration || 1;
    const tm = o.collapseCuts ? timeMap(lesson) : null;
    const span = tm ? tm.V : D;
    const pos = function (t) { return 100 * Math.min(span, tm ? tm.toV(t) : t) / span; };
    const track = el('div', { class: 'track' });
    const tagli = [];
    if (!tm) (lesson.cuts || []).forEach(function (c, i) {
      // v90 (Edoardo: "le parti tagliate sono tutte uguali… metti dei numeri sotto i tagli sulla barra, che
      // corrispondono ai numeri sotto dove si può modificare"): ogni taglio ha il suo colore e il suo ✄N.
      const l = 100 * c.start / D, w = 100 * (c.end - c.start) / D;
      track.appendChild(el('div', { class: 'cut', style: 'left:' + l + '%;width:' + w + '%;' + cutColorStyle(i), title: '✄' + (i + 1) + ' · taglio ' + fmt(c.start) + '–' + fmt(c.end) + (c.reason ? ' (' + c.reason + ')' : '') }));
      // due righe alternate: con tagli vicini (o attaccati) le etichette non si sovrappongono; ai bordi
      // l'etichetta si allinea dentro la barra invece di finire fuori schermo
      const centro = l + w / 2;
      const ancora = centro < 4 ? 'translateX(0)' : (centro > 96 ? 'translateX(-100%)' : 'translateX(-50%)');
      // v91: cliccabile — porta alla riga del taglio e la fa lampeggiare due volte
      tagli.push(el('button', { type: 'button', class: 'cut-n' + (i % 2 ? ' giu' : ''), style: 'left:' + centro + '%;transform:' + ancora + ';' + cutColorStyle(i), text: '✄' + (i + 1),
        title: '✄' + (i + 1) + ' · ' + fmt(c.start) + '–' + fmt(c.end) + ' (' + fmtMin(c.end - c.start) + ') · clicca per vedere questo taglio qui sotto',
        onclick: function (e) { e.stopPropagation(); focusCut(i); } }));
    });
    track.addEventListener('click', function (e) {
      if (!o.onSeek) return;
      const r = track.getBoundingClientRect();
      const v = span * (e.clientX - r.left) / r.width;
      o.onSeek(tm ? tm.toR(v) : v, e);
    });
    container.appendChild(track);
    container.classList.toggle('has-cutn', tagli.length > 0);
    tagli.forEach(function (n) { container.appendChild(n); });
    (lesson.exercises || []).forEach(function (ex, i) {
      const r = o.results && o.results[ex.id];
      // v92 (Edoardo: "se ho già confermato un esercizio diventa verde, voglio che anche su questa barra sia verde"):
      // il pallino dell'editor segue il segno "✓ Controllato" della card. Solo nell'editor: per lo studente il
      // verde vuole dire "risposta giusta", e un esercizio controllato dal docente non è un esercizio fatto da lui.
      const rev = !!(o.reviewed && ex.reviewed);
      const m = el('div', { 'data-ex': ex.id, class: 'marker' + (o.done && o.done.has(ex.id) ? ' done' + (r ? (r.correct ? ' ok' : ' bad') : '') : '') + (rev ? ' rev' : '') + (o.activeId === ex.id ? ' active' : ''), text: String(i + 1), style: 'left:' + pos(ex.markerTime) + '%', title: fmt(tm ? tm.toV(ex.markerTime) : ex.markerTime) + ' · ' + EX.LABELS[ex.type] + (rev ? ' · controllato' : '') });
      // I segnaposto non si trascinano (troppo facile spostarli per sbaglio): l'orario si cambia nel campo "ferma il video a" della scheda.
      if (o.onMarker) m.addEventListener('click', function (e) { e.stopPropagation(); o.onMarker(ex); });
      container.appendChild(m);
    });
    container.appendChild(el('div', { class: 'cursor', style: 'left:0%' }));
    container.appendChild(el('div', { class: 'labels' }, el('span', { text: '0:00' }), el('span', { text: fmtMin(span) })));
    container._timeMap = tm;
  }
  function drawCursor(container, t, D) {
    const c = container && container.querySelector('.cursor');
    if (c && container._timeMap) { const tm = container._timeMap; c.style.left = (100 * Math.min(tm.toV(t), tm.V) / tm.V) + '%'; return; }
    if (c) c.style.left = (100 * Math.min(t, D) / (D || 1)) + '%';
  }
  /**
   * Il segnaposto (dove il video si ferma) e' SEMPRE la fine della frase. Prima era un terzo tempo separato,
   * tenuto 0,1 s dopo la fine: un numero in piu' da capire e da tenere allineato a mano, per un margine che
   * la frase ha gia' dentro di se' (i tempi salvati arrivano 0,35 s dopo l'ultima parola). Segnalato da Edoardo
   * il 2/9: "voglio solo due numeri, e devono essere identici quando provo l'esercizio con lo studente".
   */
  function syncMarkers(lesson) { (lesson.exercises || []).forEach(function (e) { if (e && e.segment) e.markerTime = e.segment.end; }); }
  function sortExercises(lesson) { syncMarkers(lesson); lesson.exercises.sort(function (a, b) { return a.markerTime - b.markerTime; }); }

  // ---------- EDITOR ----------
  function openEditor(id) {
    S.currentId = id;
    const ls = current();
    if (!ls) return renderHome();
    S.editor.noMini = false;   // v95: il video staccato torna disponibile a ogni apertura dell'editor
    show('editor');
    closePreview();
    editorHeader(ls);
    undoOpen(ls);
    createPlayer($('#e-player'), ls.videoId, { lesson: ls, onError: function (code) { toast(ytErrorText(code), 5000); } })
      .then(function () { startLoop(); renderCover($('#e-player'), ls); })
      .catch(function (e) { toast('Player non disponibile: ' + e.message, 6000); });
    renderEditorBody();
  }
  /** Campi della barra e opzioni della lezione (titolo, interruttori): all'apertura e dopo Annulla/Ripeti. */
  // v79 ('vorrei il livello del video... e che si capisca per quali studenti è pensato'): etichette della lezione
  // per il portfolio e, domani, per la community. Viaggiano nello studentPayload.
  const LEVEL_LABELS = { beginner: 'Principiante', intermediate: 'Intermedio', advanced: 'Avanzato' };
  function fillAudienceSelect() {
    const sel = $('#e-audience'); if (!sel || sel.options.length) return;
    sel.appendChild(el('option', { value: '', text: 'non indicato' }));
    TR_LANGS.forEach(function (l) { sel.appendChild(el('option', { value: l[0], text: l[1] + ' ' + l[2] })); });
  }
  function audienceLabel(code) {
    const l = TR_LANGS.find(function (x) { return x[0] === code; });
    return l ? 'per chi parla ' + l[2].toLowerCase() : '';
  }
  function editorHeader(ls) {
    $('#e-title').value = ls.title || '';
    fillAudienceSelect();
    // v83: MIGRAZIONE dal pasticcio v79 — ls.level è il CEFR della generazione (A1-C1, dal form Nuova lezione)
    // e NON va toccato; l'etichetta community sta in ls.levelBand. Se la v79 ha scritto la fascia dentro level,
    // la si sposta (il CEFR originario è perso: resta vuoto, la generazione usa il default B1).
    if (!ls.levelBand && LEVEL_LABELS[ls.level]) { ls.levelBand = ls.level; delete ls.level; }
    $('#e-level').value = ls.levelBand || '';
    $('#e-audience').value = ls.audience || '';
    $('#e-strict').checked = !!ls.options.strict;
    $('#e-fx').checked = ls.options.fx !== false;
    $('#e-lock').checked = !!ls.options.lock;
    $('#e-eatad').checked = ls.options.eatAd !== false;
    $('#e-cover').checked = !!coverState(ls).on;
    showSync(ls);
  }
  // ---------- sincronia audio: un solo numero per lezione, regolabile a mano o a orecchio ----------
  function fmtOffset(o) { return (o > 0 ? '+' : o < 0 ? '−' : '') + Math.abs(o).toFixed(1).replace('.', ',') + ' s'; }
  function showSync(ls) {
    const v = $('#e-sync-val'); if (!v) return;
    const o = audioOffset(ls);
    v.textContent = fmtOffset(o);
    v.style.color = o ? 'var(--marker)' : '';
    const z = $('#e-sync-zero'); if (z) z.style.display = o ? '' : 'none';
  }
  function setOffset(ls, o) {
    ls.options.audioOffset = Math.max(-3, Math.min(3, Math.round(o * 10) / 10));
    touch(ls); showSync(ls);
  }
  function bumpOffset(d) { const ls = current(); if (!ls) return; setOffset(ls, audioOffset(ls) + d); toast('Sincronia audio: ' + fmtOffset(audioOffset(ls)) + ' · prova con ▶ su una frase', 3500); }
  $('#e-sync-minus').addEventListener('click', function () { bumpOffset(-0.1); });
  $('#e-sync-plus').addEventListener('click', function () { bumpOffset(0.1); });
  $('#e-sync-zero').addEventListener('click', function () { const ls = current(); if (ls) { setOffset(ls, 0); toast('Sincronia azzerata'); } });
  // Calibrazione a orecchio: si ascolta una frase da 3 s prima e si preme quando comincia davvero.
  // Al tempo premuto si tolgono 0,25 s di tempo di reazione: e' una stima, e infatti resta il ritocco a mano ±0,1.
  const SYNC = { ex: null, t0: 0, off: 0 };
  $('#e-sync-cal').addEventListener('click', function () {
    const ls = current(); if (!ls) return;
    const ex = (ls.exercises || []).filter(function (e) { return e.segment && e.sentence; })[0];
    if (!ex) return toast('Serve almeno un esercizio con una frase');
    if (!S.player) return toast('Il video non è ancora pronto');
    SYNC.ex = ex; SYNC.off = null;
    $('#sync-sentence').textContent = ex.sentence;
    $('#sync-out').textContent = '';
    $('#sync-apply').style.display = 'none';
    $('#sync-again').style.display = 'none';
    $('#sync-go').textContent = '▶ Ascolta e premi quando comincia';
    $('#sync-go').disabled = false;
    $('#dlg-sync').showModal();
  });
  $('#sync-close').addEventListener('click', function () { if (S.player) S.player.pause(); S.editor.replay = null; $('#dlg-sync').close(); });
  $('#sync-again').addEventListener('click', function () { $('#sync-go').disabled = false; $('#sync-go').textContent = '▶ Ascolta e premi quando comincia'; $('#sync-out').textContent = ''; $('#sync-apply').style.display = 'none'; $('#sync-again').style.display = 'none'; });
  $('#sync-go').addEventListener('click', function () {
    const ls = current(), ex = SYNC.ex; if (!ls || !ex || !S.player) return;
    const b = $('#sync-go');
    if (b.textContent.indexOf('Adesso') === -1) {
      // primo clic: parte l'ascolto dai 3 secondi prima, SENZA offset (si sta misurando l'errore vero)
      playSegment({ start: Math.max(0, ex.segment.start - 3), end: ex.segment.end + 1 }, true);
      b.textContent = '⏱ Adesso! (premi alla prima parola)';
      $('#sync-out').textContent = 'Ascolta…';
      return;
    }
    const t = S.player.time();
    S.player.pause(); S.editor.replay = null;
    const off = Math.round((t - 0.25 - ex.segment.start) * 10) / 10;
    SYNC.off = Math.max(-3, Math.min(3, off));
    $('#sync-out').innerHTML = 'La frase comincia davvero <b>' + fmtOffset(SYNC.off) + '</b> rispetto a quello che dice la trascrizione.'
      + (Math.abs(SYNC.off) < 0.1 ? ' Praticamente in orario: puoi lasciare tutto com\'è.' : ' Applicandolo, tutte le frasi della lezione si spostano di altrettanto.');
    $('#sync-apply').style.display = '';
    $('#sync-again').style.display = '';
    b.disabled = true;
  });
  $('#sync-apply').addEventListener('click', function () {
    const ls = current(); if (!ls || SYNC.off == null) return;
    setOffset(ls, SYNC.off);
    $('#dlg-sync').close();
    toast('Sincronia audio: ' + fmtOffset(audioOffset(ls)) + ' su tutta la lezione · ritocca con −0,1 / +0,1 · annulla con ' + undoKeyLabel(), 6000);
  });
  $('#e-title').addEventListener('change', function () { const ls = current(); if (ls) { ls.title = $('#e-title').value.trim(); touch(ls); } });
  $('#e-fx').addEventListener('change', function () { const ls = current(); if (ls) { ls.options.fx = $('#e-fx').checked; touch(ls); } });
  function lessonVocab(ls) {
    if (!ls._vocab) ls._vocab = G.vocabulary(ls.chunks || [], ls.lang);
    return ls._vocab;
  }
  $('#e-strict').addEventListener('change', function () { const ls = current(); if (ls) { ls.options.strict = $('#e-strict').checked; touch(ls); } });
  $('#e-lock').addEventListener('change', function () { const ls = current(); if (ls) { ls.options.lock = $('#e-lock').checked; touch(ls); } });
  $('#e-eatad').addEventListener('change', function () { const ls = current(); if (ls) { ls.options.eatAd = $('#e-eatad').checked; touch(ls); } });
  $('#e-level').addEventListener('change', function () { const ls = current(); if (ls) { ls.levelBand = $('#e-level').value; touch(ls); } });
  $('#e-audience').addEventListener('change', function () { const ls = current(); if (ls) { ls.audience = $('#e-audience').value; touch(ls); } });
  $('#btn-student').addEventListener('click', function () { openStudent(S.currentId, true); });
  // v78 ('quando clicco su modifica, ci sia un pulsante "soluzioni"... un recap con tutti gli esercizi e le
  // soluzioni in lista'): riepilogo per l'insegnante, in ordine di tempo, a schermo grande.
  function solutionRows(ls) {
    return (ls.exercises || []).slice().sort(function (a, b) { return (a.markerTime || 0) - (b.markerTime || 0); });
  }
  // v81 ('metti la frase direttamente con l'errore e la parola la barri... trova soluzioni simili per tutte le
  // tipologie... voglio ogni frase una sola volta'): OGNI esercizio = UNA frase, con la soluzione DENTRO —
  // parole dei gap evidenziate, parola in piu' barrata, parola sbagliata barrata + correzione accanto,
  // parola mancante evidenziata, riordino = la frase giusta e basta. Niente riga "Soluzione:" doppione.
  // v98: la riga e' una funzione a parte perche' la usano SIA il dialogo SIA il foglio da stampare: una sola
  // resa, cosi' la carta non puo' dire una cosa diversa dallo schermo.
  function solutionRow(ex, i) {
    const d = ex.data || {};
    const row = el('div', { class: 'sol-row' });
    row.appendChild(el('div', { class: 'sol-head', text: (i + 1) + ' \u00b7 ' + fmtMin(ex.markerTime || 0) + ' \u00b7 ' + (EX.LABELS[ex.type] || ex.type) }));
    const sent = el('div', { class: 'sol-sent' });
    const addTok = function (t, cls) {
      sent.appendChild(cls ? el('span', { class: cls, text: t }) : document.createTextNode(t));
      sent.appendChild(document.createTextNode(' '));
    };
    if ((ex.type === 'gap' || ex.type === 'gapbank') && Array.isArray(d.tokens)) {
      const inGap = new Set(d.gapIndices || []);
      d.tokens.forEach(function (t, k) { addTok(t, inGap.has(k) ? 'sol-hit' : null); });
    } else if (ex.type === 'missing' && Array.isArray(d.tokens)) {
      d.tokens.forEach(function (t, k) { addTok(t, k === d.missingIndex ? 'sol-hit' : null); });
    } else if ((ex.type === 'extra' || ex.type === 'wrong') && Array.isArray(d.shown)) {
      const bad = ex.type === 'extra' ? d.extraIndex : d.wrongIndex;
      d.shown.forEach(function (t, k) {
        addTok(t, k === bad ? 'sol-strike' : null);
        if (ex.type === 'wrong' && k === bad) addTok(d.answer, 'sol-fix');
      });
    } else if (ex.type === 'mc') {
      sent.appendChild(document.createTextNode(d.question || ''));
      sent.appendChild(el('div', {}, el('span', { class: 'sol-fix', text: '\u2713 ' + ((d.options && d.options[d.correct]) || '') })));
    } else {
      sent.appendChild(document.createTextNode(ex.sentence || ''));
    }
    row.appendChild(sent);
    return row;
  }
  $('#btn-solutions').addEventListener('click', function () {
    const ls = current(); if (!ls) return;
    const box = $('#solutions-body'); box.innerHTML = '';
    const exs = solutionRows(ls);
    if (!exs.length) box.appendChild(el('p', { class: 'hint', text: 'Questa lezione non ha ancora esercizi.' }));
    exs.forEach(function (ex, i) { box.appendChild(solutionRow(ex, i)); });
    $('#dlg-solutions').showModal();
  });
  // v98 (Edoardo: 'e' possibile un pulsante tipo "stampa" qualora un docente voglia stamparle?'): foglio per
  // l'insegnante. NON si stampa il dialogo (in Chrome un <dialog> modale sta nel top layer e in stampa si porta
  // dietro mezza pagina): si riempie #print-area, si mette la classe 'printing' sul body e il CSS di stampa
  // nasconde tutto il resto. I margini li fa il padding di #print-area, perche' la @page del foglio A4 della
  // conversazione ha gia' margin: 0 e vale per tutta l'app.
  function printSolutions(ls) {
    if (!ls) return;
    const area = $('#print-area'); area.innerHTML = '';
    const exs = solutionRows(ls);
    // v100/v101 (Edoardo: 'a una certa ti daro' il logo e voglio che ci sia il logo nelle soluzioni'): dalla v101
    // c'e' il marchio vero, lo stesso lockup della barra (mascotte Play + wordmark). Sono <img> e non immagini di
    // sfondo perche' quelle non si stampano se l'insegnante non spunta 'Grafica di sfondo' nella finestra di stampa:
    // un logo che compare o sparisce a seconda di una casella non e' un logo. Il foglio e' stretto, quindi il lockup
    // sta in orizzontale in alto a destra e NON e' piu' un quadrato: se il marchio cambia forma si rivede .pr-logo.
    const testa = el('div', { class: 'pr-head' },
      el('div', { class: 'pr-head-txt' },
        el('div', { class: 'pr-kicker', text: 'Soluzioni' }),
        el('h1', { class: 'pr-title', text: ls.title || 'Lezione' }),
        el('div', { class: 'pr-sub', text: (exs.length === 1 ? '1 esercizio' : exs.length + ' esercizi') + ' \u00b7 foglio per l\'insegnante \u00b7 ' + new Date().toLocaleDateString('it-IT') })),
      el('div', { class: 'pr-logo' },
        el('img', { class: 'pr-logo-play', src: 'data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHZpZXdCb3g9IjAgMCAzOTkgNDUwIiB3aWR0aD0iMzk5IiBoZWlnaHQ9IjQ1MCI+IDxnIHRyYW5zZm9ybT0idHJhbnNsYXRlKDAsNDUwKSBzY2FsZSgwLjEsLTAuMSkiIGZpbGw9IiNlZTg0MzMiPjxwYXRoIGQ9Ik00MjEgNDMzNSBjLTE3MiAtNDggLTMyMiAtMTg0IC0zODcgLTM1MCAtMTkgLTQ5IC0xOSAtOTQgLTE5IC0xODIwIGwwIC0xNzcwIDIzIC02NSBjNTQgLTE1NyAxNzcgLTI3NyAzMjYgLTMxNiA3NSAtMjAgMTk1IC0xOCAyNjQgNSA1NSAxOSAxMjcgNTUgNjUyIDMyMyA1ODYgMzAwIDEzMzQgNzA1IDIxMjAgMTE0NiAzMDcgMTcyIDM2NCAyMDggNDIwIDI2MyAxMDMgMTAxIDE2MCAyMzEgMTYwIDM2NCAwIDExMiAtNTMgMjQyIC0xMzYgMzM0IC02NiA3MyAtNDE5IDMwMiAtODk5IDU4MSAtNDA0IDIzNiAtMTQzMiA4NDUgLTE5MTggMTEzOCAtMTIwIDcyIC0yNDQgMTQxIC0yNzUgMTUzIC03NCAyOSAtMjUwIDM2IC0zMzEgMTR6IG02NTQgLTEyNjkgYzEzMiAtMzUgMjM3IC0xMjIgMzAwIC0yNDkgMzQgLTY5IDM5IC04NyA0MyAtMTc1IDYgLTExOSAtOCAtMTg5IC01NSAtMjg0IC00NSAtODkgLTE0MyAtMTkwIC0yMjkgLTIzNSAtMTk1IC0xMDQgLTQyMiAtNzUgLTU2OSA3MiAtMTkzIDE5MyAtMTkxIDUyNSA0IDcyMyAxMDcgMTA5IDIyOCAxNjEgMzcxIDE2MiA0NyAwIDEwOCAtNiAxMzUgLTE0eiBtMTE5MCAtMzYxIGM4NCAtMjIgMTUyIC02MiAyMTUgLTEyNSAxOTMgLTE5MyAxODUgLTQ5MiAtMTcgLTcwMiAtMTYzIC0xNjkgLTQwMCAtMjE1IC01OTcgLTExNiAtMTYyIDgyIC0yNTcgMjQwIC0yNTggNDMyIDAgMTA4IDI3IDIwMCA4NyAyOTAgMTIwIDE4MSAzNjEgMjc1IDU3MCAyMjF6IG0tNzIwIC0xMTc5IGM0MCAtMTcgNjUgLTYwIDY1IC0xMTMgMCAtMzIgLTcgLTQ0IC01NCAtODkgLTYzIC01OSAtMTc4IC0xMjIgLTI4NiAtMTU2IC02MyAtMTkgLTk1IC0yMyAtMjA1IC0yMiAtMTE0IDAgLTEzOSA0IC0yMDQgMjcgLTQxIDE1IC05MyAzOCAtMTE2IDUyIC03MCA0MSAtMTUzIDEyMyAtMTY0IDE2MSAtMjAgNzQgMjcgMTQ0IDk4IDE0NCAzOCAwIDYzIC0xNCAxNDUgLTc5IDI5IC0yMyA3OCAtNDkgMTE4IC02MiA1NyAtMTggODQgLTIxIDE2MSAtMTcgMTExIDYgMTk0IDM3IDI4MCAxMDQgODYgNjcgMTA2IDczIDE2MiA1MHoiLz48L2c+IDxnIHRyYW5zZm9ybT0idHJhbnNsYXRlKDAsNDUwKSBzY2FsZSgwLjEsLTAuMSkiIGZpbGw9IiNmZmZmZmYiPjxwYXRoIGQ9Ik03OTAgMzA1NyBjLTkxIC0zMSAtMTUzIC03MCAtMjIxIC0xMzkgLTE5NSAtMTk4IC0xOTcgLTUzMCAtNCAtNzIzIDE0NyAtMTQ3IDM3NCAtMTc2IDU2OSAtNzIgODYgNDUgMTg0IDE0NiAyMjkgMjM1IDQ3IDk1IDYxIDE2NSA1NSAyODQgLTQgODggLTkgMTA2IC00MyAxNzUgLTYzIDEyNyAtMTY4IDIxNCAtMzAwIDI0OSAtNzkgMjIgLTIwOSAxNyAtMjg1IC05eiBtMzc4IC0yNjMgYzE0MiAtNTkgMTc4IC0yNDkgNjkgLTM2NiAtNjggLTczIC0xOTIgLTk0IC0yNzcgLTQ3IC04NCA0NiAtMTMxIDE2OSAtMTAxIDI2MiA0MyAxMjggMTkxIDIwMSAzMDkgMTUxeiIvPiA8cGF0aCBkPSJNMjAxMCAyNzA0IGMtMTgxIC00NyAtMzE3IC0xNzMgLTM3OCAtMzQ4IC00NyAtMTM1IC0yNyAtMzA4IDQ5IC00MjggNjQgLTk5IDE4MyAtMTgzIDI5NyAtMjA3IDExNSAtMjQgMjIwIC05IDMzNyA0OCA2MSAzMCA5NyA1NyAxNDggMTA5IDE2NCAxNzAgMjAzIDQwMyA5OSA1OTYgLTM1IDY1IC0xMjMgMTUzIC0xODggMTg4IC0xMDUgNTYgLTI0OCA3MyAtMzY0IDQyeiBtMzc3IC0yODAgYzIwNiAtMTIwIDExMiAtNDM1IC0xMjkgLTQzNCAtMTc1IDEgLTI4MSAxNzkgLTIwMiAzMzggNDUgOTAgMTMxIDEzNiAyMzQgMTI3IDMyIC00IDcyIC0xNiA5NyAtMzF6Ii8+PC9nPiA8ZyB0cmFuc2Zvcm09InRyYW5zbGF0ZSgwLDQ1MCkgc2NhbGUoMC4xLC0wLjEpIiBmaWxsPSIjMTYyNDRhIj48cGF0aCBkPSJNMTAwNSAyNzk1IGMtNzQgLTI5IC0xMzcgLTEwOSAtMTUxIC0xOTMgLTkgLTU4IDE4IC0xNDAgNTggLTE3OSA0OSAtNDYgOTAgLTYzIDE1MyAtNjMgMTkzIDAgMzAzIDIxMyAxODggMzY4IC00OSA2NiAtMTY2IDk4IC0yNDggNjd6Ii8+IDxwYXRoIGQ9Ik0yMTY0IDI0MzEgYy03NSAtMzQgLTEzNCAtMTI2IC0xMzQgLTIxMSAwIC04MyA0OSAtMTYzIDEyMyAtMjAyIDMxIC0xNyA1OSAtMjIgMTA3IC0yMiA3MSAxIDEyNSAyMiAxNzIgNjggMTEwIDExMSA3NSAzMDIgLTY3IDM2NyAtNTMgMjQgLTE0NyAyNCAtMjAxIDB6Ii8+IDxwYXRoIGQ9Ik0xNDYzIDE1MzAgYy0xMiAtNSAtNDggLTI5IC04MCAtNTQgLTg2IC02NyAtMTY5IC05OCAtMjgwIC0xMDQgLTc3IC00IC0xMDQgLTEgLTE2MSAxNyAtNDAgMTMgLTg5IDM5IC0xMTggNjIgLTgyIDY1IC0xMDcgNzkgLTE0NSA3OSAtNzEgMCAtMTE4IC03MCAtOTggLTE0NCAxMSAtMzggOTQgLTEyMCAxNjQgLTE2MSAyMyAtMTQgNzUgLTM3IDExNiAtNTIgNjUgLTIzIDkwIC0yNyAyMDQgLTI3IDExMCAtMSAxNDIgMyAyMDUgMjIgMTA4IDM0IDIyMyA5NyAyODYgMTU2IDQ3IDQ1IDU0IDU3IDU0IDg5IDAgNTMgLTI1IDk2IC02NSAxMTMgLTM5IDE2IC01MSAxNiAtODIgNHoiLz48L2c+IDwvc3ZnPg==', alt: '' }),
        el('img', { class: 'pr-logo-wm', src: 'data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHZpZXdCb3g9IjAgMCAxNTIzIDE4OCIgd2lkdGg9IjE1MjMiIGhlaWdodD0iMTg4IiByb2xlPSJpbWciIGFyaWEtbGFiZWw9IlBhdXNlTGVhcm4iPiA8dGl0bGU+UGF1c2VMZWFybjwvdGl0bGU+IDwhLS0gTWFyY2hpbyBQYXVzZUxlYXJuOiBsYSBzY3JpdHRhIGRpc2VnbmF0YSBkYSBFZG9hcmRvLCB2ZXR0b3JpYWxpenphdGEuIExhIFUgc29ubyBsZSBkdWUgYmFycmUgZGkgUGF1c2EgY29uIGxhIGZhY2NpYS4gLS0+IDxnIHRyYW5zZm9ybT0idHJhbnNsYXRlKDAsMTg4KSBzY2FsZSgwLjEsLTAuMSkiIGZpbGw9IiMyZjZmZjAiPjxwYXRoIGQ9Ik0zMTE3IDE3ODAgYy01NSAtMTQgLTkwIC0zNSAtMTI0IC03NCAtNTggLTY1IC01OCAtNjQgLTU4IC02MzYgMCAtNTg3IDAgLTU4NSA3MiAtNzIyIDk4IC0xODggMjk0IC0yOTggNTI5IC0yOTggODMgMCA5NCAyIDEwNCAyMCA3IDE0IDEwIDI1OCA4IDc4NyAtMyA3NjQgLTMgNzY4IC0yNSA4MDggLTI3IDUxIC01OCA3OSAtMTA4IDEwMiAtMzIgMTMgLTc0IDE3IC0yMDAgMTkgLTg4IDIgLTE3NyAtMSAtMTk4IC02eiBtMjU4IC01OTkgYzUyIC0yMyAxMDIgLTgxIDExMSAtMTI2IDI0IC0xMjggLTYzIC0yMzYgLTE5MCAtMjM2IC02NyAwIC0xMjQgMjcgLTE2MyA3NyAtMjIgMzAgLTI4IDQ5IC0zMSAxMDMgLTMgNTkgMCA3MSAyNiAxMTIgNTIgODEgMTU3IDExMSAyNDcgNzB6IG0tMTYwIC01MTcgYzQwIC0yMSA1OSAtMjUgOTggLTIwIDI2IDMgNjEgMTQgNzYgMjYgMzkgMjcgNjMgMjYgNTkgLTEgLTcgLTQ4IC0xMDggLTg3IC0xOTAgLTc1IC01NiA4IC0xMTIgNDQgLTExNiA3NCAtNCAyOSAxMSAyOCA3MyAtNHoiLz4gPHBhdGggZD0iTTM4OTQgMTc3OSBjLTUyIC0xMiAtMTIxIC03MSAtMTQ1IC0xMjMgLTE4IC0zOSAtMTkgLTg1IC0xOSAtODEyIDAgLTU4NiAzIC03NzMgMTIgLTc4MiAxNyAtMTcgMTcxIC0xNSAyNDMgMyAxNjUgNDIgMzE4IDE2MiAzODkgMzA1IDYzIDEzMCA2NiAxNTYgNjYgNzExIDAgNTM4IC0yIDU2NSAtNTUgNjI4IC0xNCAxNiAtNDcgNDAgLTczIDUzIC00MyAyMSAtNjIgMjMgLTIxMiAyNSAtOTEgMSAtMTgzIC0zIC0yMDYgLTh6IG0yNzUgLTU5OSBjNDggLTI0IDg3IC03MCAxMDEgLTExOCAxMiAtNDYgMTIgLTU4IC0xIC0xMDUgLTEzIC01MCAtNzEgLTExMyAtMTE2IC0xMjggLTE5IC02IC02MiAtOSAtOTQgLTcgLTQ2IDMgLTY3IDExIC05NiAzNCAtODAgNjQgLTk5IDE2NiAtNDcgMjUwIDUzIDg3IDE2NSAxMTkgMjUzIDc0eiBtLTE3OCAtNTEyIGM0MyAtMzIgMTI5IC0zMSAxODcgMiAzMSAxOCA0NSAyMSA1MyAxMyAxOSAtMTkgMyAtMzkgLTUyIC02NyAtNTYgLTI4IC0xMDEgLTMyIC0xNjEgLTE2IC00NyAxMyAtOTkgNTYgLTkxIDc1IDcgMjEgMjkgMTggNjQgLTd6Ii8+IDxwYXRoIGQ9Ik0xMDAgMTc0OCBjLTMwIC0xNSAtNTMgLTM3IC02NyAtNjMgbC0yMyAtNDAgMCAtNzQzIGMwIC03MjUgMCAtNzQ0IDIwIC03ODIgMTMgLTI2IDM0IC00NyA2MCAtNjAgMzQgLTE3IDU5IC0yMCAxODIgLTIwIDEyMyAwIDE0OSAzIDE4MiAyMCA4MSA0MSA5NCA4MyA5NSAyOTggMSAyMjkgLTEwIDIxNiAyMDIgMjI1IDE5MSA4IDI3OSAyNiAzODkgNzkgMTUzIDc0IDI2MCAyMDkgMzA3IDM4OCAyMSA4MCAyMyAyNTMgNCAzMzAgLTQ5IDE5OSAtMTg3IDMzMyAtMzg2IDM3NSAtNTUgMTIgLTE1OSAxNSAtNDk1IDE1IC00MjIgMCAtNDI2IDAgLTQ3MCAtMjJ6IG02OTcgLTQyNyBjNTIgLTI0IDgzIC03OSA4MyAtMTQ4IDAgLTk0IC01NyAtMTU2IC0xNTMgLTE2OCAtNzAgLTkgLTEyNSAxMCAtMTU0IDU0IC0xOSAyOCAtMjMgNDcgLTIzIDEwOCAwIDg5IDE4IDEzNSA2MyAxNTcgNDQgMjEgMTMzIDIwIDE4NCAtM3oiLz4gPHBhdGggZD0iTTYxMjUgMTc1OCBjLTUwIC0xOCAtODIgLTQ2IC0xMDQgLTkxIC0yMSAtNDMgLTIxIC01NCAtMjEgLTc2NCBsMCAtNzIwIDIzIC00NCBjMTYgLTMxIDM2IC01MSA2NyAtNjcgbDQ0IC0yMiA1NDkgMCBjNTI0IDAgNTQ5IDEgNTg2IDIwIDIxIDEwIDUwIDMzIDY0IDQ5IDUxIDYxIDYxIDIwOCAyMCAyODkgLTIyIDQyIC02OCA3NyAtMTIyIDkyIC0yMCA2IC0xNjggMTAgLTM0MyAxMCBsLTMwNyAwIC0yMCAyNiBjLTI4IDM1IC0yOCAxMDIgLTEgMTM3IGwyMSAyNiAyNzIgMyAyNzIgMyA0NyAyNyBjNTggMzUgODcgODEgMTAwIDE2MSAxOCAxMDMgLTE5IDE5MSAtOTcgMjMxIC0zNyAxOSAtNjEgMjEgLTMxOCAyNiAtMjc4IDUgLTI3OSA1IC0yOTggMjkgLTI2IDMyIC0yNSA5NSAxIDEyMSAxOSAxOSAzMyAyMCAzMDMgMjAgMTU1IDAgMzA4IDQgMzQxIDEwIDEwMSAxNiAxNTkgODEgMTcyIDE5MyAxMyAxMTMgLTQyIDIxMSAtMTMzIDIzNiAtNTIgMTUgLTEwNzcgMTMgLTExMTggLTF6Ii8+IDxwYXRoIGQ9Ik04OTAwIDE3NjMgYy04MSAtMTMgLTEzNyAtNTcgLTE1OSAtMTIyIC04IC0yNCAtMTEgLTI0MSAtMTEgLTc0NSAwIC02NzIgMSAtNzEzIDE5IC03NTIgMTAgLTIzIDM0IC01MiA1MiAtNjUgbDM0IC0yNCA1MDUgLTMgYzU2NyAtMyA1NDMgLTUgNjA0IDcxIDI4IDM2IDMxIDQ2IDM0IDEyOCAzIDc0IDEgOTYgLTE3IDEzMiAtMjQgNTAgLTYxIDgxIC0xMTcgOTYgLTIzIDYgLTEzOSAxMSAtMjg2IDExIGwtMjQ3IDAgLTIwIDI2IGMtMjcgMzUgLTI4IDEwMyAtMiAxMzUgMTkgMjQgMjEgMjQgMjgzIDI5IDI4MiA1IDI5NSA4IDM0NCA2MiA0NSA0OSA1OSA4OSA1OSAxNzMgMCA3MCAtNCA4NiAtMjggMTI4IC0yMiAzOCAtNDEgNTQgLTgwIDczIC01MCAyMyAtNTkgMjQgLTMwMCAyNCBsLTI0OCAwIC0yNCAyNSBjLTMyIDMxIC0zNCA5NiAtNSAxMjUgMTkgMTkgMzMgMjAgMzIzIDIwIDM0MSAwIDM3OSA2IDQzNCA2MiA0NSA0NyA2MyA5NiA2MyAxNzUgLTEgMTIxIC01NCAxOTMgLTE2MCAyMTMgLTUwIDEwIC05OTUgMTIgLTEwNTAgM3oiLz4gPHBhdGggZD0iTTEyMDIwIDE3NjQgYy04NyAtMTcgLTE0MCAtNjEgLTE2MCAtMTMzIC03IC0yNyAtMTAgLTI3MCAtOCAtNzUzIDMgLTY5NSA0IC03MTQgMjMgLTc0OCAxMiAtMjEgMzkgLTQ0IDY1IC01OCA0MCAtMjAgNTkgLTIyIDE4NCAtMjIgMTcwIDAgMjEwIDE0IDI1NCA4OCAyNiA0NiAyNyA1MyAzMiAyMzIgbDUgMTg1IDE3MyAtMjIyIGM5NSAtMTIyIDE4OSAtMjM1IDIwOSAtMjUwIGwzNiAtMjggMjAzIC0zIGMxODUgLTMgMjA4IC0xIDI0OSAxNyA3NSAzMyAxMDUgMTExIDcwIDE4NCAtOCAxOCAtNDggNzMgLTg4IDEyMiAtNDAgNTAgLTExNiAxNDQgLTE3MCAyMTAgLTUzIDY2IC05NyAxMjIgLTk3IDEyNSAwIDMgMzIgMjAgNzAgMzggNDIgMjAgOTUgNTYgMTMzIDkyIDExMSAxMDQgMTYwIDIyNyAxNjAgNDA1IC0xIDI3NiAtMTI2IDQ0MyAtMzc5IDUwMSAtNTcgMTQgLTE0NyAxNyAtNTA0IDE5IC0yMzkgMiAtNDQ2IDEgLTQ2MCAtMXogbTYzNyAtNDU0IGM1MCAtMzAgNjggLTY1IDY4IC0xMzYgMCAtNjcgLTE1IC05OCAtNjggLTEzOCAtMzMgLTI1IC0xMzQgLTM0IC0xNzcgLTE2IC01NiAyMyAtNzAgNTMgLTcwIDE0NyAwIDEzNCAyNCAxNjIgMTQwIDE2MyA1NyAwIDgzIC01IDEwNyAtMjB6Ii8+PC9nPiA8ZyB0cmFuc2Zvcm09InRyYW5zbGF0ZSgwLDE4OCkgc2NhbGUoMC4xLC0wLjEpIiBmaWxsPSIjZWU4NDMzIj48cGF0aCBkPSJNMjAyMCAxODAwIGMtMTM1IC0yOSAtMjE1IC0xMDUgLTI4NSAtMjcyIC0xMDIgLTI0MyAtMzExIC03NTEgLTQ0MCAtMTA3NCAtOTYgLTIzNyAtMTA0IC0yODMgLTYyIC0zNDUgNDAgLTYxIDczIC03MCAyMzQgLTY3IDEzOSAzIDE0MiAzIDE4NSAzMyA1MiAzNyA4MSA3OSAxMDMgMTQ4IDkgMjkgMjggNjIgNDEgNzQgMjUgMjMgMjkgMjMgMjk0IDIzIGwyNzAgMCAyOCAtMjcgYzE3IC0xNyAzNiAtNTEgNDYgLTg0IDIyIC03OCA1MyAtMTIwIDEwNiAtMTQ2IDM5IC0yMCA1OSAtMjMgMTc1IC0yMyAxMTYgMCAxMzQgMyAxNzAgMjMgMjMgMTMgNDggMzcgNTcgNTcgMzIgNjMgMjQgMTA5IC02OCAzNzUgLTI5MyA4NTYgLTM4OCAxMTIyIC00MTcgMTE2NyAtMzcgNTcgLTEwMCAxMDIgLTE3MiAxMjMgLTYzIDE5IC0yMDYgMjcgLTI2NSAxNXogbTE0NCAtNjc2IGM5IC04IDE2IC0xNyAxNiAtMTggMCAtMiAxMyAtNDggMjkgLTEwMiAxNiAtNTUgMzkgLTEzNSA1MSAtMTc4IDIxIC03OSAyMSAtODAgMiAtMTA1IC0xOSAtMjUgLTIzIC0yNiAtMTUyIC0yOSAtMTQ1IC0zIC0xODAgNyAtMTgwIDUxIDAgMzcgMTExIDM1OCAxMzEgMzc4IDIzIDIzIDgyIDI1IDEwMyAzeiIvPiA8cGF0aCBkPSJNNTExMCAxNzk5IGMtOTQgLTEyIC0yMTUgLTUzIC0yODkgLTk2IC0zNSAtMjEgLTkyIC02OCAtMTI2IC0xMDUgLTEwMCAtMTA2IC0xNDUgLTIyMSAtMTQ1IC0zNzEgMSAtMTQyIDQxIC0yMzkgMTM5IC0zMzggODEgLTgyIDE4NSAtMTM0IDQxNSAtMjExIDE3NSAtNTggMjE2IC04NCAyMTYgLTEzNiAwIC00MyAtNDIgLTg5IC05MyAtMTAzIC05NCAtMjUgLTIwOSAxMSAtMzIyIDEwMSAtMTE0IDkxIC0xOTQgMTEwIC0yODUgNjkgLTkyIC00MSAtMTM0IC0xMDcgLTEzNSAtMjA5IC0xIC0xNjQgMTQwIC0yOTggMzgwIC0zNjEgMTAzIC0yNyAzNTQgLTM3IDQ3NiAtMTkgMTE3IDE3IDI1NSA2MyAzMjUgMTA4IDgwIDUzIDE1MCAxMzAgMTg0IDIwNSA5MyAyMDUgNTIgNDUxIC05OCA1ODggLTczIDY3IC0xNzEgMTE1IC0zNzcgMTg0IC05NCAzMiAtMTgyIDY0IC0xOTcgNzEgLTQzIDIyIC02OCA1NSAtNjggODkgMCA4OCAxMTQgMTMxIDIzNyA4OSAyNiAtOSA4NCAtNDAgMTI5IC02OSA0NCAtMjkgMTAwIC01OSAxMjQgLTY1IDczIC0yMCAxNTIgMiAyMTMgNTkgMTAxIDkzIDg5IDI2NCAtMjUgMzY2IC04MSA3NCAtMjQwIDEzMSAtNDIzIDE1NCAtMTAxIDEyIC0xNjAgMTIgLTI1NSAweiIvPiA8cGF0aCBkPSJNMTA3OTMgMTc3NiBjLTEwNCAtMzMgLTE4MyAtMTE0IC0yMzggLTI0MyAtMTIxIC0yODggLTM3NSAtODk5IC00NDkgLTEwODAgLTk0IC0yMzIgLTEwNCAtMjc5IC02NiAtMzQwIDMyIC01MyA3MCAtNjcgMjAxIC03MSAxOTMgLTcgMjcwIDMwIDMyNiAxNTcgMTMgMzAgMzIgNjEgNDEgNjggMTMgOSA4NiAxMiAyOTkgMTMgMjc5IDAgMjgyIDAgMzA2IC0yMiAxMyAtMTMgMzIgLTQzIDQzIC02OCAyNyAtNjUgNTAgLTk0IDk3IC0xMjEgMzYgLTIxIDU4IC0yNCAxNjIgLTI3IDczIC0zIDEzOCAxIDE2NCA4IDU1IDE0IDk1IDU0IDExMiAxMDggMTEgMzkgOSA1MCAtMjMgMTQ5IC0zMiA5OCAtMTY5IDQ5NiAtMjc4IDgwOCAtMjMgNjYgLTY2IDE5MSAtOTYgMjc3IC0yOSA4NyAtNjUgMTgwIC03OSAyMDggLTcwIDEzOCAtMTczIDE5MCAtMzc1IDE4OSAtNTggMCAtMTI0IC02IC0xNDcgLTEzeiBtMTg1IC02NzMgYzE0IC0xMiAzNSAtNjUgNjEgLTE1MyA1OCAtMTk3IDYzIC0yMjAgNTcgLTI0NSAtOSAtMzYgLTQ3IC00NSAtMTg2IC00NSAtMTI3IDAgLTEyOSAwIC0xNDkgMjcgLTI1IDMwIC0yOCAxNSA0NyAyMzMgMzEgOTAgNjQgMTcyIDc0IDE4MiAyMyAyMyA3MCAyMyA5NiAxeiIvPiA8cGF0aCBkPSJNNzYyNSAxNzY0IGMtMTEgLTMgLTMwIC03IC00MiAtMTAgLTM5IC04IC04OSAtNjEgLTEwMiAtMTA2IC05IC0zMiAtMTEgLTIzNiAtOSAtNzcwIDMgLTcxNiAzIC03MjcgMjQgLTc1NCAxMSAtMTUgMzMgLTM3IDQ4IC00OCAyNyAtMjAgNDEgLTIxIDQ5OCAtMjQgNDY0IC0zIDQ3MSAtMiA1MTUgMTkgMjcgMTMgNTUgMzcgNzEgNjIgMjMgMzUgMjcgNTIgMzAgMTMxIDMgNzkgMCA5NyAtMjAgMTM2IC0xMyAyNiAtNDEgNTcgLTY2IDc1IGwtNDQgMzAgLTIzNiA1IGMtMTY0IDMgLTI0NCA5IC0yNTkgMTggLTEyIDcgLTI3IDI5IC0zMyA1MCAtNiAyMyAtMTAgMjI2IC0xMCA1NTAgMCA1NTEgMSA1NDEgLTUyIDU4OCAtMTIgMTIgLTMzIDI3IC00NiAzMyAtMjQgMTMgLTIzMCAyNCAtMjY3IDE1eiIvPiA8cGF0aCBkPSJNMTM2MjAgMTc2MSBjLTgxIC0yNSAtMTMyIC03NiAtMTQ5IC0xNTEgLTE1IC02NCAtMTUgLTEzNzEgMCAtMTQyNSAxNiAtNTggNTIgLTEwMSAxMDMgLTEyMCAzNiAtMTQgNzEgLTE2IDE4OSAtMTMgMTQ1IDMgMTQ1IDMgMTg0IDM0IDc0IDU5IDc3IDczIDgzIDM5NCBsNSAyODUgOTUgLTExNSBjNTMgLTYzIDE1MiAtMTg0IDIyMCAtMjY5IDIxOCAtMjY5IDIzMyAtMjg2IDI5MiAtMzExIDQ2IC0yMCA3NCAtMjQgMjAzIC0yOCAxODYgLTUgMjQ3IDUgMzAzIDU0IDc2IDY0IDczIDMxIDcwIDgzMCBsLTMgNzEwIC0yOCA0MiBjLTE1IDIzIC00NiA1MiAtNzAgNjQgLTM2IDE5IC02MSAyMyAtMTc4IDI2IC0xNTUgNCAtMjA0IC01IC0yNTUgLTUwIC02OSAtNjEgLTY5IC01OSAtNzIgLTQwNSAtMiAtMTg4IC03IC0zMTMgLTEzIC0zMTMgLTUgMCAtNDkgNTAgLTk3IDExMSAtMzcxIDQ3NCAtNDYzIDU4NyAtNDkyIDYwNyAtNTcgMzggLTEyNCA1MiAtMjQ5IDUxIC02NCAwIC0xMjcgLTQgLTE0MSAtOHoiLz48L2c+IDxnIHRyYW5zZm9ybT0idHJhbnNsYXRlKDAsMTg4KSBzY2FsZSgwLjEsLTAuMSkiIGZpbGw9IiNmZmZmZmYiPjxwYXRoIGQ9Ik02MTMgMTMyNCBjLTQ1IC0yMiAtNjMgLTY4IC02MyAtMTU3IDAgLTYxIDQgLTgwIDIzIC0xMDggMjkgLTQ0IDg0IC02MyAxNTQgLTU0IDk2IDEyIDE1MyA3NCAxNTMgMTY4IDAgNjkgLTMxIDEyNCAtODMgMTQ4IC01MSAyMyAtMTQwIDI0IC0xODQgM3oiLz4gPHBhdGggZD0iTTEyNDU0IDEzMTIgYy0zNiAtMjggLTQ0IC01NiAtNDQgLTE0NSAwIC05NCAxNCAtMTI0IDcwIC0xNDcgNDMgLTE4IDE0NCAtOSAxNzcgMTYgNTMgNDAgNjggNzEgNjggMTM4IDAgNzEgLTE4IDEwNiAtNjggMTM2IC00MyAyNyAtMTcyIDI4IC0yMDMgMnoiLz4gPHBhdGggZD0iTTMyMDEgMTE3OCBjLTI4IC0xNCAtNTQgLTM4IC03MyAtNjcgLTI2IC00MSAtMjkgLTUzIC0yNiAtMTEyIDMgLTU0IDkgLTczIDMxIC0xMDMgNjEgLTc5IDE3NiAtMTAyIDI2MiAtNTIgMTAxIDYwIDEyNyAxOTggNTIgMjgzIC02MyA3MiAtMTYzIDkyIC0yNDYgNTF6IG05MSAtMTEyIGMtNCAtMzMgMTMgLTQ4IDQ1IC0zOSAxOSA0IDIzIDEgMjMgLTIwIDAgLTE0IC0xMiAtMzkgLTI2IC01NiAtMjIgLTI2IC0zMyAtMzEgLTcwIC0zMSAtNzcgMCAtMTE1IDYyIC04MyAxMzQgMTQgMzAgNDUgNDYgODQgNDMgMjcgLTIgMzAgLTUgMjcgLTMxeiIvPiA8cGF0aCBkPSJNMzk4OSAxMTc3IGMtMTIzIC02NSAtMTM3IC0yMzMgLTI2IC0zMjEgMjkgLTIzIDUwIC0zMSA5NiAtMzQgMzIgLTIgNzUgMSA5NCA3IDYzIDIxIDEyNyAxMTMgMTI3IDE4MSAwIDM0IC0yMiA5MSAtNDcgMTIwIC01OSA3MSAtMTYyIDkwIC0yNDQgNDd6IG05MyAtMTEzIGMtMiAtMjIgMiAtMzMgMTQgLTM4IDkgLTMgMjIgLTIgMjkgNCAzNCAyOCAzNCAtNDggLTEgLTgzIC00MiAtNDIgLTk3IC00MiAtMTM5IDAgLTE4IDE4IC0yNSAzNiAtMjUgNjIgMSA1NyA0MCA5MyA5NSA4OCAyNyAtMiAzMCAtNSAyNyAtMzN6Ii8+IDxwYXRoIGQ9Ik0yMDYxIDExMjEgYy0yMCAtMjAgLTEzMSAtMzQxIC0xMzEgLTM3OCAwIC00NCAzNSAtNTQgMTgwIC01MSAxMjkgMyAxMzMgNCAxNTIgMjkgMTkgMjUgMTkgMjYgLTIgMTA1IC0xMiA0MyAtMzUgMTIzIC01MSAxNzggLTE2IDU0IC0yOSAxMDAgLTI5IDEwMiAwIDEgLTcgMTAgLTE2IDE4IC0yMSAyMiAtODAgMjAgLTEwMyAtM3oiLz4gPHBhdGggZD0iTTEwODgyIDExMDIgYy0xMCAtMTAgLTQzIC05MiAtNzQgLTE4MiAtNzUgLTIxOCAtNzIgLTIwMyAtNDcgLTIzMyAyMCAtMjcgMjIgLTI3IDE0OSAtMjcgMTM5IDAgMTc3IDkgMTg2IDQ1IDYgMjUgMSA0OCAtNTcgMjQ1IC0yNiA4OCAtNDcgMTQxIC02MSAxNTMgLTI2IDIyIC03MyAyMiAtOTYgLTF6Ii8+IDxwYXRoIGQ9Ik0zMTQyIDY2OCBjNCAtMzAgNjAgLTY2IDExNiAtNzQgODIgLTEyIDE4MyAyNyAxOTAgNzUgNCAyNyAtMjAgMjggLTU5IDEgLTE1IC0xMiAtNTAgLTIzIC03NiAtMjYgLTM5IC01IC01OCAtMSAtOTggMjAgLTYyIDMyIC03NyAzMyAtNzMgNHoiLz4gPHBhdGggZD0iTTM5MjcgNjc1IGMtOCAtMTkgNDQgLTYyIDkxIC03NSA2MCAtMTYgMTA1IC0xMiAxNjEgMTYgNTUgMjggNzEgNDggNTIgNjcgLTggOCAtMjIgNSAtNTMgLTEzIC01OCAtMzMgLTE0NCAtMzQgLTE4NyAtMiAtMzUgMjUgLTU3IDI4IC02NCA3eiIvPjwvZz4gPGcgdHJhbnNmb3JtPSJ0cmFuc2xhdGUoMCwxODgpIHNjYWxlKDAuMSwtMC4xKSIgZmlsbD0iIzE0MTgyMSI+PHBhdGggZD0iTTMyMjQgMTA5MCBjLTMwIC0xMiAtNTQgLTQ5IC01NCAtODMgMCAtNDIgNDkgLTg3IDk0IC04NyA0NSAwIDg2IDM0IDg5IDc1IDIgMjcgLTEgMzAgLTI0IDI3IC0zNCAtNCAtNTcgMjMgLTQxIDQ4IDkgMTQgOCAxOSAtNCAyNCAtMjAgOCAtMzQgNyAtNjAgLTR6Ii8+IDxwYXRoIGQ9Ik00MDE0IDEwOTAgYy01OCAtMjMgLTcwIC05NSAtMjUgLTE0MSA0MSAtNDAgOTEgLTQwIDEzMiAxIDM5IDM4IDM3IDc3IC0zIDcyIC0zMCAtNCAtNTMgMjUgLTM4IDQ4IDE2IDI2IC0yMyAzOCAtNjYgMjB6Ii8+PC9nPiA8L3N2Zz4=', alt: 'PauseLearn' })));
    area.appendChild(testa);
    if (!exs.length) area.appendChild(el('p', { class: 'hint', text: 'Questa lezione non ha ancora esercizi.' }));
    exs.forEach(function (ex, i) { area.appendChild(solutionRow(ex, i)); });
    // v99 → v118: @page top/bottom a 0 elimina data e URL che il browser stampa nei margini (Edoardo: "ci sono
    // tipo le date 24/09, perché?"). Left/right restano a 15mm. Il top/bottom ora e' padding di #print-area
    // (vale sulla prima e sull'ultima pagina); dalla pag 2 in poi basta il padding dei .sol-row (4mm) sommato
    // al margine hardware della stampante (~5mm) per tenere il testo lontano dal bordo fisico del foglio.
    const stile = document.createElement('style');
    stile.id = 'print-page-css';
    stile.textContent = '@page { size: A4; margin: 0 15mm; } body.printing #print-area { padding-top: 16mm; padding-bottom: 14mm; } body.printing #print-area .sol-row { padding: 4mm 0; }';
    document.head.appendChild(stile);
    const fine = function () {
      document.body.classList.remove('printing'); area.innerHTML = '';
      if (stile.parentNode) stile.parentNode.removeChild(stile);
      window.removeEventListener('afterprint', fine);
    };
    document.body.classList.add('printing');
    window.addEventListener('afterprint', fine);
    // window.print() blocca il thread finche' l'anteprima di stampa non e' chiusa: quando torna, il foglio
    // e' gia' stato catturato e si puo' smontare subito (l'afterprint resta come rete di sicurezza).
    try { window.print(); } finally { fine(); }
  }
  $('#solutions-print').addEventListener('click', function () { printSolutions(current()); });
  $('#solutions-close').addEventListener('click', function () { $('#dlg-solutions').close(); });
  $('#btn-save').addEventListener('click', function () { const ls = current(); if (!ls) return; ls.title = $('#e-title').value.trim() || ls.title; ls.updatedAt = new Date().toISOString(); saveLessons(); toast('Salvato tra le tue lezioni'); renderHome(); });
  $('#btn-export').addEventListener('click', function () { const ls = current(); download(slugify(ls.title) + '.json', JSON.stringify(studentPayload(ls), null, 1)); });
  $('#btn-delete').addEventListener('click', function () { const ls = current(); if (ls && confirm('Eliminare "' + ls.title + '"?')) deleteLesson(ls); });
  $('#btn-add-ex').addEventListener('click', function () {
    const ls = current(); const t = S.player ? S.player.time() : 0;
    showAddPopover(ls, t, null);
  });
  $('#btn-add-cut').addEventListener('click', function () {
    const ls = current(); const t = S.player ? S.player.time() : 0;
    // v94 (Edoardo: "se clicco due volte qui mi mette due tagli identici, vorrei un pop-up che mi dice che
    // esiste già un taglio su questo secondo"): un taglio che comincia dove ce n'è già uno non è mai voluto.
    const gia = (ls.cuts || []).findIndex(function (c) { return t >= c.start - 0.6 && t <= c.end + 0.6; });
    if (gia !== -1) {
      const c = ls.cuts[gia];
      centerNote('Qui c\'è già il taglio ✄' + (gia + 1) + ', da ' + fmt(c.start) + ' a ' + fmt(c.end) + '. Sposta il video, o allunga quello che c\'è.', 2400);
      focusCut(gia);
      return;
    }
    const raw = { start: Math.round(t * 10) / 10, end: Math.min(ls.duration, Math.round(t * 10) / 10 + 10), reason: 'manuale' };
    // a frasi intere: inizia con la frase che comincia qui (o subito dopo) e finisce a fine frase
    const snapped = ls.chunks && ls.chunks.length ? G.snapCutToSentences({ start: raw.start, end: raw.end + 4 }, ls.chunks, { tol: 1.5, min: 3, duration: ls.duration }) : null;
    ls.cuts.push(snapped ? { start: snapped.start, end: snapped.end, reason: 'manuale' } : raw);
    ls.cuts.sort(function (a, b) { return a.start - b.start; });
    touch(ls); renderEditorBody();
    if (snapped) toast('Taglio allineato alle frasi: da ' + fmt(snapped.start) + ' a ' + fmt(snapped.end));
  });

  /** Se il player conosce la durata vera e la lezione ne aveva una stimata più corta, allinea (e allunga i tagli finali). */
  /**
   * ANNUNCIO DI YOUTUBE IN CORSO. Durante un annuncio il player continua a rispondere, ma il tempo e la durata che
   * restituisce sono quelli DELL'ANNUNCIO, non del video: un riascolto che finisce a 0:15 si chiudeva subito perche'
   * l'annuncio era gia' arrivato a 0:15, e "play" sembrava non funzionare perche' stava caricando la pubblicita'
   * (segnalato da Edoardo il 3/9: "mi caricava ma non partiva e poi e' partita una pubblicita'").
   * L'iframe API non dice "sto mostrando un annuncio": lo si capisce dalla durata, che diventa quella dello spot.
   */
  function inAd(ls) {
    // La prova e' la DURATA: durante uno spot il player risponde con la durata dello spot (pochi secondi), non
    // quella del video. Niente controllo su `kind`: il player finto restituisce sempre la durata vera della lezione,
    // quindi non puo' far scattare un falso positivo, e senza quel controllo il caso e' verificabile nello smoke.
    if (!S.player || !ls || !(ls.duration > 0)) return false;
    const d = S.player.duration();
    return d > 0 && d < ls.duration - 5;
  }
  let adNoticeAt = 0, adSaidWhy = false;
  function adNotice() {
    if (Date.now() - adNoticeAt < 8000) return;
    adNoticeAt = Date.now();
    toast('YouTube sta mostrando un annuncio: l\'esercizio riprende appena finisce', 5000);
    // Perche' compaiono annunci anche con Premium: l'abbonamento arriva al player incorporato solo attraverso i
    // cookie di terze parti di youtube.com, che Chrome sta limitando. Lo si dice una volta sola per sessione.
    if (!adSaidWhy) {
      adSaidWhy = true;
      setTimeout(function () { toast('Hai Premium e vedi annunci lo stesso? Nel player incorporato l\'abbonamento passa dai cookie di terze parti di youtube.com: vanno permessi nelle impostazioni di Chrome', 9000); }, 5200);
    }
  }

  function syncDuration(ls) {
    if (!S.player || S.player.kind !== 'yt') return;
    const d = S.player.duration();
    if (!(d > 0) || d <= ls.duration + 1) return;
    const old = ls.duration;
    ls.cuts.forEach(function (c) { if (Math.abs(c.end - old) < 0.6) c.end = d; });
    ls.duration = d;
    touch(ls);
    if (S.view === 'editor') renderEditorBody(); else if (S.student) renderStudentTimeline();   // sempre con i clic (barra e numeri) attivi
  }
  function editorTick() {
    const ls = current(); if (!ls || !S.player) return;
    if (inAd(ls)) { adNotice(); if (S.editor.replay) { S.editor.replay.at = Date.now(); S.editor.replay.moving = false; S.editor.replay.adSeen = true; } return; }
    if (S.editor.replay && S.editor.replay.adSeen) { const rp = S.editor.replay; rp.adSeen = false; rp.tries = 0; S.player.seek(rp.start); S.player.play(); return; }
    syncDuration(ls);
    const t = S.player.time();
    drawCursor($('#e-timeline'), t, ls.duration);
    const rp = S.editor.replay;
    if (rp) {
      // se il seek iniziale non è stato accettato (primo avvio del player YouTube), riprova una volta
      if (rp.start != null && t < rp.start - 1.5 && Date.now() - rp.at < 4000) { if (!rp.retried) { rp.retried = true; S.player.seek(rp.start); S.player.play(); } return; }
      if (nudgeReplay(rp, ls)) return;
      if (t >= rp.end || rp.give || S.player.state() === 0) { S.player.pause(); S.editor.replay = null; if (rp.redock && S.editor.previewId) dock('#e-stage', true); return; }
      if (rp.cut && S.player.state() === 1) {
        // giunzione: dentro il taglio si salta subito alla fine; poco prima si programma il salto al millisecondo
        if (t >= rp.cut.start - 0.05 && t < rp.cut.end) S.player.seek(rp.cut.end + 0.05);
        else scheduleJump(S.editor, rp.cut, t, function () { return rp.cut.end + 0.05; });
      }
      return;
    }
    if ($('#e-skip').checked && S.player.state() === 1) {
      const c = G.inCut(ls.cuts, t);
      const skippable = function (cut) { return !ls.exercises.some(function (e) { return e.markerTime >= cut.start && e.markerTime <= cut.end; }); };
      if (c && skippable(c)) S.player.seek(c.end + 0.05);
      else if (!c) {
        const next = (ls.cuts || []).filter(function (x) { return x.start > t && x.start - t <= 0.5 && skippable(x); }).sort(function (a, b) { return a.start - b.start; })[0];
        if (next) scheduleJump(S.editor, next, t, function () { return next.end + 0.05; });
      }
    }
  }
  /**
   * Salto anticipato (editor e studente): il tick gira ogni 200 ms, quindi entrando in un taglio si sentiva l'attacco della
   * frase tolta. Se il taglio comincia entro mezzo secondo, il salto viene programmato al millisecondo giusto, una volta sola.
   */
  function scheduleJump(holder, cut, t, targetFn) {
    if (holder.cutJump && holder.cutJump.cut === cut) return;
    if (holder.cutJump) clearTimeout(holder.cutJump.timer);
    const wait = Math.max(0, (cut.start - t) * 1000 - 40);
    holder.cutJump = { cut: cut, timer: setTimeout(function () {
      holder.cutJump = null;
      if (!S.player || S.player.state() !== 1) return;
      const now = S.player.time();
      if (now < cut.start - 0.6 || now >= cut.end) return;   // nel frattempo la barra è stata spostata
      const target = targetFn(Math.max(now, cut.start));
      if (target > now) { S.player.seek(target); holder.lastT = null; }
    }, wait) };
  }
  /** Anteprima dell'esercizio nell'area del video, esattamente come la vedrà lo studente. */
  function openPreview(ls, ex, play) {
    S.editor.previewId = ex.id;
    dock('#e-stage', true);
    if (S.player) { if (play) playSegment(ex.segment); else if (!S.editor.replay) S.player.pause(); }
    renderExerciseInto($('#e-pop'), ex, {
      mode: 'preview', lesson: ls, index: ls.exercises.indexOf(ex), total: ls.exercises.length,
      replay: function (e) { playSegment(e.segment); }, attempts: {},
      onClose: closePreview
    });
  }
  function closePreview() {
    S.editor.previewId = null;
    dock('#e-stage', false);
    const pop = $('#e-pop'); if (pop) pop.innerHTML = '';
  }
  /** Ascolta la giunzione di un taglio: 3 s prima, salto esatto all'inizio del taglio, 3 s dopo la fine. */
  function previewCut(ls, c) {
    if (!S.player) return;
    const redock = !!S.editor.previewId && !S.withText && $('#e-stage').classList.contains('docked');
    S.editor.replay = { start: Math.max(0, c.start - 3), end: Math.min(ls.duration || c.end + 3, c.end + 3), at: Date.now(), retried: false, redock: redock, cut: c };
    if (redock) dock('#e-stage', false);
    S.player.seek(S.editor.replay.start);
    S.player.play();
  }
  /**
   * SINCRONIA AUDIO. I tempi delle frasi vengono dalla trascrizione di YouTube: le righe dei sottotitoli hanno spesso
   * un anticipo sistematico sul parlato, e dentro la riga i tempi delle singole parole sono INTERPOLATI. Risultato
   * segnalato da Edoardo (3/9): "l'audio e' sempre un po' indietro di mezzo secondo rispetto al testo, e quando premo
   * play vengono dette due o tre parole prima della vera frase". L'errore e' quasi sempre lo STESSO per tutto il video,
   * quindi si corregge con un solo numero per lezione invece che frase per frase.
   * L'offset sposta SOLO i tempi che derivano dalla trascrizione (frasi e segnaposti), mai i tagli, che sono stati
   * regolati a orecchio sui tempi veri del video.
   */
  /**
   * "Riascolta" che a volte non fa niente (segnalato da Edoardo, 3/9): il player di YouTube ignora play() se in quel
   * momento sta ancora caricando o e' in stato "cued". Il vecchio controllo riprovava solo se il SEEK non era andato
   * a segno; se il seek riusciva ma la riproduzione non partiva, il tempo restava fermo e non succedeva piu' niente.
   * Qui si riprova a far partire il video finche' non parte davvero, e se dopo 3 secondi e' ancora fermo lo si dice.
   */
  function nudgeReplay(rp, ls) {
    if (!S.player || rp.done) return false;
    const st = S.player.state();
    if (st === 1) { rp.moving = true; return false; }     // sta suonando: tutto a posto
    if (rp.moving) return false;                          // era partito e ora e' finito/in pausa: se ne occupa il tick
    const dt = Date.now() - rp.at;
    // ASPETTARE NON È ESSERE BLOCCATI (v61, 'ci ha messo 20 secondi per partire'): 3 = buffering, -1 = non ancora
    // avviato, 5 = caricato ma fermo. In questi stati il player STA lavorando (rete lenta, primo avvio, annuncio che
    // non ha ancora dichiarato la sua durata): dire 'premi tu' dopo 3 secondi è un falso allarme, e chi preme fa
    // ripartire il video da capo peggiorando l'attesa. Qui si aspetta fino a 30 s, dicendo che sta caricando.
    const ad = inAd(ls);
    const loading = st === 3 || st === -1 || st === 5 || ad;
    if (loading && dt > 1500 && !rp.waitSaid) { rp.waitSaid = true; toast('Il video sta caricando… aspetta, riparte da solo', 3000); }
    if (dt > (loading ? 30000 : 6000)) { rp.done = rp.give = true; toast('Il video non riparte: premi ▶ sul video una volta e riprova', 5000); return false; }
    // si insiste con play() SOLO se il player e' fermo (in pausa o caricato e basta): mentre sta caricando (3) o
    // durante uno spot un altro play() non serve e rischia di far ripartire il caricamento da capo
    const idle = st === 2 || st === 5 || (st === -1 && dt > 2500);
    if (idle && !ad && dt > 250 && Date.now() - (rp.lastTry || 0) > 800 && (rp.tries || 0) < 12) { rp.tries = (rp.tries || 0) + 1; rp.lastTry = Date.now(); S.player.play(); }
    return true;   // ancora in attesa: il tick non deve chiudere il riascolto
  }

  // ---------- lingua della traduzione per lo studente (16 lingue, con bandiera) ----------
  // Richiesta di Edoardo (3/9): sul pulsante Traduci si deve vedere la bandiera della lingua in cui si traduce,
  // e le lingue devono essere molte — la piattaforma e' pensata per studenti di provenienze diverse.
  const TR_LANGS = [
    ['en', '\uD83C\uDDEC\uD83C\uDDE7', 'Inglese', 'British English'],
    ['es', '\uD83C\uDDEA\uD83C\uDDF8', 'Spagnolo', 'Spanish'],
    ['fr', '\uD83C\uDDEB\uD83C\uDDF7', 'Francese', 'French'],
    ['de', '\uD83C\uDDE9\uD83C\uDDEA', 'Tedesco', 'German'],
    ['pt', '\uD83C\uDDF5\uD83C\uDDF9', 'Portoghese', 'Portuguese'],
    ['it', '\uD83C\uDDEE\uD83C\uDDF9', 'Italiano', 'Italian'],
    ['nl', '\uD83C\uDDF3\uD83C\uDDF1', 'Olandese', 'Dutch'],
    ['pl', '\uD83C\uDDF5\uD83C\uDDF1', 'Polacco', 'Polish'],
    ['ro', '\uD83C\uDDF7\uD83C\uDDF4', 'Rumeno', 'Romanian'],
    ['ru', '\uD83C\uDDF7\uD83C\uDDFA', 'Russo', 'Russian'],
    ['uk', '\uD83C\uDDFA\uD83C\uDDE6', 'Ucraino', 'Ukrainian'],
    ['tr', '\uD83C\uDDF9\uD83C\uDDF7', 'Turco', 'Turkish'],
    ['ar', '\uD83C\uDDF8\uD83C\uDDE6', 'Arabo', 'Arabic'],
    ['zh', '\uD83C\uDDE8\uD83C\uDDF3', 'Cinese', 'Simplified Chinese'],
    ['ja', '\uD83C\uDDEF\uD83C\uDDF5', 'Giapponese', 'Japanese'],
    ['ko', '\uD83C\uDDF0\uD83C\uDDF7', 'Coreano', 'Korean'],
    ['hi', '\uD83C\uDDEE\uD83C\uDDF3', 'Hindi', 'Hindi'],
    ['pt-BR', '\uD83C\uDDE7\uD83C\uDDF7', 'Portoghese (Brasile)', 'Brazilian Portuguese']
  ];
  function trLang() {
    const want = S.settings.trLang || '';
    const found = TR_LANGS.find(function (l) { return l[0] === want; });
    if (found) return found;
    // default: la lingua di supporto della lezione se la conosciamo, altrimenti inglese
    const ls = (S.student && S.student.lesson) || current();
    const sup = ls ? (vocabState(ls).support || (ls.lang === 'en' ? 'it' : 'en')) : 'en';
    return TR_LANGS.find(function (l) { return l[0] === sup; }) || TR_LANGS[0];
  }
  function setTrLang(code) { S.settings.trLang = code; saveSettings(); }
  /** Pulsante Traduci con la bandiera; il click lungo (o il ▾) apre l'elenco delle lingue. */
  function translateButton(onRun) {
    const wrap = el('span', { class: 'tr-wrap' });
    const btn = el('button', { class: 'small tr-btn' });
    const pick = el('button', { class: 'small tr-pick', text: '\u25BE', title: 'Cambia la lingua della traduzione' });
    const paint = function () {
      const l = trLang();
      btn.textContent = l[1] + ' Traduci';
      btn.title = 'Traduzione in ' + l[2] + ': seleziona alcune parole per tradurre solo quelle, altrimenti tutta la frase (le parole da trovare restano coperte)';
    };
    btn.addEventListener('click', function () { onRun(btn, trLang()); });
    pick.addEventListener('click', function (e) {
      e.stopPropagation();
      const old = document.querySelector('.tr-menu'); if (old) { old.remove(); return; }
      const menu = el('div', { class: 'tr-menu' }, TR_LANGS.map(function (l) {
        return el('button', { class: 'tr-opt' + (l[0] === trLang()[0] ? ' on' : ''), onclick: function () { setTrLang(l[0]); paint(); menu.remove(); } },
          el('span', { class: 'fl', text: l[1] }), el('span', { text: l[2] }));
      }));
      wrap.appendChild(menu);
      // Posizionamento sul VIEWPORT (v67, 'il pop up fa cacare e non permette di selezionare tutte le lingue'):
      // ancorato in alto al pulsante finiva dietro il video e le prime lingue non si vedevano ne' si raggiungevano.
      // Va sotto il pulsante se c'e' spazio, sopra altrimenti, sempre dentro lo schermo e con lo scroll interno.
      const r = pick.getBoundingClientRect();
      menu.style.position = 'fixed';
      menu.style.left = Math.max(8, Math.min(r.left, window.innerWidth - menu.offsetWidth - 8)) + 'px';
      const below = window.innerHeight - r.bottom - 12, above = r.top - 12;
      if (below >= Math.min(menu.offsetHeight, 240) || below >= above) {
        menu.style.top = (r.bottom + 6) + 'px'; menu.style.bottom = 'auto'; menu.style.maxHeight = below + 'px';
      } else {
        menu.style.bottom = (window.innerHeight - r.top + 6) + 'px'; menu.style.top = 'auto'; menu.style.maxHeight = above + 'px';
      }
      setTimeout(function () {
        document.addEventListener('pointerdown', function close(ev) {
          if (!menu.contains(ev.target)) { menu.remove(); document.removeEventListener('pointerdown', close, true); }
        }, true);
      }, 50);
    });
    paint();
    wrap.appendChild(btn); wrap.appendChild(pick);
    wrap._paint = paint;
    return wrap;
  }

  function audioOffset(ls) { const o = ls && ls.options ? +ls.options.audioOffset : 0; return isFinite(o) ? o : 0; }
  function playSeg(ls, seg) { const o = audioOffset(ls); return { start: Math.max(0, seg.start + o), end: seg.end + o }; }

  function playSegment(seg, rawTimes) {
    if (!S.player) return;
    const ls = current();
    const sg = rawTimes ? seg : playSeg(ls, seg);
    const redock = !!S.editor.previewId && !S.withText && $('#e-stage').classList.contains('docked');
    S.editor.replay = { start: sg.start, end: sg.end, at: Date.now(), retried: false, tries: 0, redock: redock };
    if (redock) dock('#e-stage', false);
    S.player.seek(sg.start);
    S.player.play();
  }

  function renderEditorBody() {
    const ls = current(); if (!ls) return;
    renderTimeline($('#e-timeline'), ls, { editable: true, reviewed: true, onSeek: function (t, e) { if (S.player) S.player.seek(t); showAddPopover(ls, t, e); }, onMarker: function (ex) {
      openPreview(ls, ex, true);   // anteprima + riproduzione della frase, che si ferma da sola alla fine
      const card = $('#ex-' + ex.id);
      if (card) { card.scrollIntoView({ behavior: 'smooth', block: 'center' }); card.classList.add('flash'); setTimeout(function () { card.classList.remove('flash'); }, 1500); }
    } });
    if (S.editor.previewId && !ls.exercises.some(function (e) { return e.id === S.editor.previewId; })) closePreview();
    const eff = G.effectiveDuration(ls.cuts, ls.duration);
    $('#e-stats').innerHTML = '';
    $('#e-stats').appendChild(el('span', { html: 'Video: <b>' + fmtMin(ls.duration) + '</b>' }));
    $('#e-stats').appendChild(el('span', { html: 'Tagliato: <b>' + fmtMin(ls.duration - eff) + '</b>' }));
    $('#e-stats').appendChild(el('span', { html: 'Durata per lo studente: <b>' + fmtMin(eff) + '</b>' + (ls.params.target ? ' (target ' + fmtMin(ls.params.target) + ')' : '') }));
    $('#e-stats').appendChild(el('span', { html: 'Esercizi: <b>' + ls.exercises.length + '</b>' }));
    // avvisi
    const w = $('#e-warnings'); w.innerHTML = '';
    const warns = (ls.warnings || []).concat(G.validateLesson(ls));
    ls.exercises.forEach(function (ex, i) { if (ex.markerTime < ex.segment.end - 0.3) warns.push('Esercizio ' + (i + 1) + ': il segnaposto è prima della fine della frase da ascoltare.'); });
    // v93 (Edoardo: "metti una x in alto a destra per poter chiudere gli avvisi"): chiuso vuol dire letto.
    // Si ricorda nella lezione (ls.hiddenWarnings, per TESTO): se il problema cambia, il testo cambia e l'avviso
    // ritorna — un avviso di controllo non deve poter sparire per sempre restando vero.
    const nascosti = ls.hiddenWarnings || [];
    warns.filter(function (t) { return nascosti.indexOf(t) === -1; }).forEach(function (t) {
      const box = el('div', { class: 'notice warn' }, el('span', { text: t }));
      box.appendChild(el('button', { class: 'notice-x', type: 'button', text: '✕', title: 'Chiudi questo avviso', onclick: function () {
        ls.hiddenWarnings = (ls.hiddenWarnings || []).concat([t]);
        touch(ls); box.remove();
      } }));
      w.appendChild(box);
    });
    const an = $('#e-ai-notes'); an.innerHTML = '';
    if (ls.ai && ls.ai.model) {
      an.appendChild(el('div', { class: 'notice info', text: 'Bozza generata con ' + ls.ai.model + (ls.ai.cost != null ? ' · costo stimato ' + (ls.ai.cost * 100).toFixed(1) + ' cent' : '') + (ls.ai.notes ? ' · note del modello: ' + ls.ai.notes : '') }));
    }
    // anteprima aperta: aggiornala con i dati correnti
    if (S.editor.previewId) { const pe = ls.exercises.find(function (e) { return e.id === S.editor.previewId; }); if (pe) openPreview(ls, pe, false); }
    // parole utili
    renderVocabEditor(ls);
    // struttura della lezione (sezioni in ordine) + card "Parliamone"
    renderFlow(ls);
    // esercizi
    const box = $('#e-exercises'); box.innerHTML = '';
    if (!ls.exercises.length) box.appendChild(el('p', { class: 'muted', text: 'Nessun esercizio. Aggiungine uno dal tempo corrente o rigenera la bozza.' }));
    ls.exercises.forEach(function (ex, i) { box.appendChild(renderExerciseCard(ls, ex, i)); });
    // tagli
    const cb = $('#e-cuts'); cb.innerHTML = '';
    if (!ls.cuts.length) cb.appendChild(el('p', { class: 'muted', text: 'Nessun taglio: il video viene mostrato per intero.' }));
    // v90: ✄1, ✄2… sulla barra e qui sotto NELLO STESSO ORDINE — quindi i tagli si tengono ordinati per tempo
    ls.cuts.sort(function (a, b) { return a.start - b.start; });
    ls.cuts.forEach(function (c, i) { cb.appendChild(renderCutRow(ls, c, i)); });
    restoreFocus();
  }

  /** Campo tempo "m:ss.s". Frecce ↑/↓ = ±0,1 s (con Maiusc ±1 s); il fuoco resta sul campo anche dopo il ridisegno. */
  // ---------- parole utili: editor ----------
  function renderVocabEditor(ls) {
    const vb = vocabState(ls);
    $('#v-matching').checked = vb.cards.matching !== false;
    $('#v-flash').checked = vb.cards.flashcards !== false;
    $('#v-write').checked = !!vb.cards.write;
    syncVocabCards();
    $('#v-support').value = vb.support || 'en';
    $('#btn-vocab-ai').style.display = S.settings.apiKey ? '' : 'none';
    $('#btn-vocab-translate').style.display = S.settings.apiKey ? '' : 'none';
    $('#btn-vocab-check').style.display = S.settings.apiKey ? '' : 'none';
    // template visivo delle schede (abbinamento e flashcards): gli stessi 18 delle attività
    const tb = $('#v-theme'); if (tb) { tb.innerHTML = ''; tb.appendChild(themeChips(vb.theme || 'classic', function (id) { vb.theme = id; touch(ls); renderVocabEditor(ls); }, { vocab: ls })); }
    const box = $('#e-vocab'); box.innerHTML = '';
    if (!vb.words.length) { box.appendChild(el('p', { class: 'muted', text: 'Nessuna parola: "Proponi" le ricava dalle frasi degli esercizi e dal video, oppure aggiungile a mano.' })); return; }
    const table = el('div', { class: 'vocab-table' });
    vb.words.forEach(function (w) {
      const row = el('div', { class: 'vocab-row' + (w.selected ? '' : ' off') });
      const cb = el('input', { type: 'checkbox', title: 'Usa nelle schede iniziali' }); cb.checked = !!w.selected;
      cb.addEventListener('change', function () { w.selected = cb.checked; row.classList.toggle('off', !w.selected); touch(ls); const h = box.querySelector('.hint.ready'); if (h) h.textContent = readyText(ls); });
      const refreshHint = function () { const h = box.querySelector('.hint.ready'); if (h) h.textContent = readyText(ls); };
      const wi = el('input', { type: 'text', value: w.word, placeholder: 'parola', class: 'v-word' });
      wi.addEventListener('change', function () { w.word = wi.value.trim(); touch(ls); refreshHint(); });
      const ti = el('input', { type: 'text', value: w.translation || '', placeholder: 'traduzione', class: 'v-tr' });
      ti.addEventListener('change', function () { w.translation = ti.value.trim(); touch(ls); refreshHint(); });

      const img = el('div', { class: 'v-img' });
      const syncWord = function () { const v = wi.value.trim(); if (v && v !== w.word) { w.word = v; touch(ls); } };   // la ricerca usa sempre la parola scritta ora
      // anteprima grande al passaggio del mouse su miniatura e pulsanti (resta aperta mentre si clicca "↻ Altra")
      let hovering = false;
      img.addEventListener('mouseenter', function () { hovering = true; if (w.image) showImgPreview(img, w.image, imgCaption(w)); });
      img.addEventListener('mouseleave', function () { hovering = false; hideImgPreview(); });
      const renderImg = function () {
        img.innerHTML = '';
        if (w.image) {
          const im = el('img', { src: w.image, alt: '', title: 'Passa col mouse per vederla grande', referrerpolicy: 'no-referrer' });
          im.addEventListener('error', function () { im.replaceWith(el('span', { class: 'notice bad', style: 'padding:2px 6px;font-size:12px', text: 'non caricabile', title: w.image })); });
          im.setAttribute('data-zoom', '1');
          im.addEventListener('click', function () { if (isPreviewShown()) hideImgPreview(); else showImgPreview(img, w.image, imgCaption(w)); });   // touch: un tocco apre, un altro chiude
          img.appendChild(im);
          if (hovering) showImgPreview(img, w.image, imgCaption(w));
          img.appendChild(el('button', { class: 'small', text: '↻ Altra', title: 'Cerca un\'altra foto per questa parola', onclick: function () { syncWord(); findImage(ls, w, renderImg, true); } }));
          img.appendChild(el('button', { class: 'small', text: '✕', title: 'Togli la foto', onclick: function () { w.image = ''; touch(ls); renderImg(); } }));
        } else {
          hideImgPreview();
          img.appendChild(el('button', { class: 'small', text: '🔍 Foto', title: 'Cerca una foto (Wikipedia e Wikimedia Commons) per la parola scritta qui a sinistra', onclick: function () { syncWord(); findImage(ls, w, renderImg, false); } }));
          img.appendChild(el('button', { class: 'small', text: 'URL', title: 'Incolla l\'indirizzo di un\'immagine', onclick: function () { const u = prompt('Indirizzo dell\'immagine (https://…)'); if (u && /^https?:\/\//.test(u.trim())) { w.image = u.trim(); touch(ls); renderImg(); } } }));
        }
      };
      renderImg();
      row.appendChild(cb); row.appendChild(wi); row.appendChild(ti); row.appendChild(img);
      row.appendChild(el('span', { class: 'badge', text: w.inExercise ? 'negli esercizi' : (w.source === 'ai' ? 'AI' : ''), style: w.inExercise || w.source === 'ai' ? '' : 'visibility:hidden' }));
      row.appendChild(el('button', { class: 'small danger', text: '✕', title: 'Togli', onclick: function () { vb.words = vb.words.filter(function (x) { return x !== w; }); touch(ls); renderVocabEditor(ls); undoBarFor('parola "' + (w.word || '') + '"'); } }));
      table.appendChild(row);
    });
    box.appendChild(table);
    box.appendChild(el('div', { class: 'hint ready', text: readyText(ls) }));
  }
  /** Anteprima grande di una foto (la miniatura da 44 px non basta per giudicarla): riquadro fisso accanto all'elemento. */
  let previewBox = null;
  function showImgPreview(anchor, src, caption) {
    if (!previewBox) { previewBox = el('div', { class: 'img-preview' }); document.body.appendChild(previewBox); }
    const host = document.fullscreenElement || document.body;   // a tutto schermo si vede solo ciò che sta dentro l'elemento a tutto schermo
    if (previewBox.parentElement !== host) host.appendChild(previewBox);
    const cur = previewBox.querySelector('img');
    if (!cur || cur.getAttribute('src') !== src) {
      previewBox.innerHTML = '';
      previewBox.appendChild(el('img', { src: src, alt: '', referrerpolicy: 'no-referrer' }));
      previewBox.appendChild(el('div', { class: 'cap', text: caption || '' }));
      // via d'uscita sempre visibile: bianca con ombra scura, cosi' si vede su qualunque foto e su qualunque tema.
      // Non serve se tutto funziona (clic fuori, Esc, riclic) — serve proprio quando qualcosa non funziona.
      previewBox.appendChild(el('button', { class: 'img-x', text: '\u2715', title: 'Chiudi (Esc)', onclick: function (e) { e.stopPropagation(); hideImgPreview(); } }));
    } else previewBox.querySelector('.cap').textContent = caption || '';
    if (!previewBox.querySelector('.img-x')) previewBox.appendChild(el('button', { class: 'img-x', text: '\u2715', title: 'Chiudi (Esc)', onclick: function (e) { e.stopPropagation(); hideImgPreview(); } }));
    previewBox.classList.add('show');
    // a destra della miniatura se c'è spazio; altrimenti sotto (o sopra) la riga, mai sopra la riga stessa
    const r = anchor.getBoundingClientRect(), vw = window.innerWidth, vh = window.innerHeight, W = 392, H = 330;
    let left, top;
    if (r.right + 12 + W <= vw - 8) { left = r.right + 12; top = r.top - 24; }
    else { left = Math.max(8, Math.min(r.right - W, vw - W - 8)); top = (r.bottom + 8 + H <= vh - 8) ? r.bottom + 8 : r.top - H - 8; }
    if (top + H > vh - 8) top = vh - H - 8;
    if (top < 8) top = 8;
    previewBox.style.left = left + 'px'; previewBox.style.top = top + 'px';
    // chiusura garantita: un clic fuori o Esc. Senza questo l'ingrandimento aperto al clic non si toglierebbe piu'.
    if (!previewBox._closer) {
      previewBox._closer = function (e) {
        if (e.type === 'keydown' && e.key !== 'Escape') return;
        if (e.type === 'pointerdown' && previewBox.contains(e.target)) return;
        // il pulsante che apre l'ingrandimento fa da sé (apre/chiude): se chiudessimo qui, il click subito dopo
        // riaprirebbe e l'ingrandimento sembrerebbe "bloccato" (v61, 'si è bloccato di nuovo!')
        if (e.type === 'pointerdown' && e.target.closest && e.target.closest('[data-zoom]')) return;
        hideImgPreview();
      };
    }
    document.removeEventListener('pointerdown', previewBox._closer, true);
    document.removeEventListener('keydown', previewBox._closer, true);
    setTimeout(function () {
      document.addEventListener('pointerdown', previewBox._closer, true);
      document.addEventListener('keydown', previewBox._closer, true);
    }, 30);
  }
  function hideImgPreview() {
    if (!previewBox) return;
    previewBox.classList.remove('show');
    previewBox._for = null;
    if (previewBox._closer) {
      document.removeEventListener('pointerdown', previewBox._closer, true);
      document.removeEventListener('keydown', previewBox._closer, true);
    }
  }
  function isPreviewShown() { return !!(previewBox && previewBox.classList.contains('show')); }
  function imgCaption(w) {
    const c = (w._imgs || [])[w._imgIdx];
    if (c && c.url === w.image) return (w._imgIdx + 1) + '/' + w._imgs.length + ' · ' + c.title + ' (' + c.source + ')';
    try { return new URL(w.image).hostname; } catch (e) { return ''; }
  }
  /** Struttura della lezione nell'editor: barra con le sezioni in ordine (◀ ▶ per spostarle attorno al video),
   *  card "Parliamone" generate (una per sezione, prima o dopo il video) e card della colonna destra riordinate. */
  function flowLabel(ls, s, idx) {
    if (s.kind === 'vocab') return '🃏 Parole utili';
    if (s.kind === 'video') return '▶ Video + esercizi';
    if (s.kind === 'act') { const a = actSection(ls, s.id); const t = a && ACT.TYPES[a.type]; return t ? t.emoji + ' ' + t.label : '🎲 Attività'; }
    const n = ls.talks.length > 1 ? ' ' + (ls.talks.findIndex(function (t) { return t.id === s.id; }) + 1) : '';
    return '💬 Parliamone' + n;
  }
  function moveFlow(ls, idx, dir) {
    const f = ls.flow, j = idx + dir;
    if (j < 0 || j >= f.length) return;
    f.splice(j, 0, f.splice(idx, 1)[0]);
    touch(ls); renderFlow(ls);
  }
  /** La card dell'editor che corrisponde a una sezione della struttura. */
  function flowCardNode(s) {
    return s.kind === 'vocab' ? $('#e-vocab-card') : s.kind === 'video' ? $('#e-video-card')
      : s.kind === 'act' ? document.querySelector('.act-card[data-aid="' + s.id + '"]')
        : document.querySelector('.talk-card[data-tid="' + s.id + '"]');
  }
  /** Altezze delle caselle di Parliamone prima di un re-render (per id domanda): le nuove nascono già alte → niente salto della pagina. */
  let TALK_H = {};
  /** Re-render che lascia la pagina ESATTAMENTE dov'è: àncora = la card su cui si sta lavorando (quella con il fuoco),
   *  altrimenti lo scrollY; si riapplica anche nei due frame successivi (le caselle si misurano solo da attaccate). */
  function keepScroll(fn) {
    const y = window.scrollY;
    const ae = document.activeElement;
    const card = ae && ae.closest ? ae.closest('.talk-card[data-tid], .act-card[data-aid], #e-vocab-card, #e-video-card') : null;
    const sel = card ? (card.id ? '#' + card.id : card.hasAttribute('data-tid') ? '.talk-card[data-tid="' + card.getAttribute('data-tid') + '"]' : '.act-card[data-aid="' + card.getAttribute('data-aid') + '"]') : null;
    const top = card ? card.getBoundingClientRect().top : null;
    fn();
    const fix = function () {
      const n = sel ? document.querySelector(sel) : null;
      if (n && top != null) window.scrollTo(0, Math.max(0, window.scrollY + n.getBoundingClientRect().top - top));
      else window.scrollTo(0, y);
    };
    fix();
    requestAnimationFrame(function () { fix(); requestAnimationFrame(fix); });
  }
  function renderFlow(ls, opts) {
    if (!opts || opts.keep !== false) return keepScroll(function () { renderFlow(ls, { keep: false }); });
    lessonFlow(ls);
    TALK_H = {};
    $$('.talk-in[data-qid]').forEach(function (t) { if (t.style.height) TALK_H[t.getAttribute('data-qid')] = t.style.height; });
    const bar = $('#e-flow'); bar.innerHTML = '';
    ls.flow.forEach(function (s, i) {
      const chip = el('span', { class: 'flow-chip' + (s.kind === 'video' ? ' video' : '') });
      if (s.kind !== 'video') chip.appendChild(el('button', { class: 'small', text: '◀', title: 'Sposta prima', disabled: i === 0 ? 'disabled' : null, onclick: function () { moveFlow(ls, i, -1); } }));
      // il nome della sezione porta alla sua card (scorrimento morbido); "↑ In alto" riporta qui
      chip.appendChild(el('button', { class: 'txt', type: 'button', text: flowLabel(ls, s, i), title: 'Vai alla sezione', onclick: function () {
        const node = flowCardNode(s); if (!node) return;
        node.scrollIntoView({ behavior: 'smooth', block: 'start' });
        node.classList.remove('flash-card'); void node.offsetWidth; node.classList.add('flash-card');
      } }));
      if (s.kind !== 'video') chip.appendChild(el('button', { class: 'small', text: '▶', title: 'Sposta dopo', disabled: i === ls.flow.length - 1 ? 'disabled' : null, onclick: function () { moveFlow(ls, i, 1); } }));
      bar.appendChild(chip);
      if (i < ls.flow.length - 1) bar.appendChild(el('span', { class: 'flow-sep', text: '→' }));
    });
    // card "Parliamone" e delle attività: una per sezione, rigenerate
    $$('.talk-card').forEach(function (n) { n.remove(); });
    $$('.act-card').forEach(function (n) { n.remove(); });
    const right = document.querySelector('.editor-right');
    ls.talks.forEach(function (sec) { right.appendChild(renderTalkCard(ls, sec)); });
    ls.acts.forEach(function (a) { right.appendChild(renderActCard(ls, a)); });
    // le card della colonna destra seguono l'ordine della struttura (la barra resta in cima)
    ls.flow.forEach(function (s) { const node = flowCardNode(s); if (node) right.appendChild(node); });
  }
  // "↑ In alto": compare quando la pagina è scorsa (editor lungo), riporta alla struttura della lezione
  (function () {
    const b = $('#btn-top'); if (!b) return;
    const upd = function () { b.classList.toggle('show', window.scrollY > 320); };
    window.addEventListener('scroll', upd, { passive: true });
    b.addEventListener('click', function () { window.scrollTo({ top: 0, behavior: 'smooth' }); });
    upd();
  })();
  /** Sposta una sezione "Parliamone" prima del video (subito prima) o dopo (in fondo alla lezione). */
  function placeTalk(ls, id, when) {
    ls.flow = ls.flow.filter(function (s) { return !(s.kind === 'talk' && s.id === id); });
    const vi = ls.flow.findIndex(function (s) { return s.kind === 'video'; });
    if (when === 'before') ls.flow.splice(vi, 0, { kind: 'talk', id: id });
    else ls.flow.push({ kind: 'talk', id: id });
  }
  /** "+ Parliamone": si sceglie PRIMA se le domande sono per entrare nel tema (prima del video) o di comprensione/opinione (dopo). */
  $('#btn-flow-talk').addEventListener('click', function () {
    const ls = current(); if (!ls) return;
    const dlg = $('#dlg-talk-new');
    $$('#tn-choices button').forEach(function (b) {
      b.onclick = function () {
        dlg.close();
        lessonFlow(ls);
        const id = 't' + (Math.max.apply(null, [0].concat(ls.talks.map(function (t) { return parseInt(String(t.id).replace(/\D/g, ''), 10) || 0; }))) + 1);
        ls.talks.push({ id: id, questions: [] });
        placeTalk(ls, id, b.getAttribute('data-when'));
        touch(ls); renderFlow(ls, { keep: false });   // qui si VUOLE scorrere: fino alla nuova sezione
        const node = document.querySelector('.talk-card[data-tid="' + id + '"]');
        if (node) node.scrollIntoView({ behavior: 'smooth', block: 'center' });
      };
    });
    dlg.showModal();
  });
  $('#tn-close').addEventListener('click', function () { $('#dlg-talk-new').close(); });
  /**
   * v95 (Edoardo: "in questa sezione voglio poter mettere anche un immagine da link o un link video youtube
   * (embedded che si può tagliare) che appare quando lo studente vede le domande"): il media di una sezione
   * "Parliamone" è UNO solo — { kind:'img'|'yt', url, id, start, end } — e si mostra sopra la domanda.
   * Il video è un embed YouTube normale, con start/end nei parametri: niente overlay, niente player nostro.
   */
  function talkMediaFrom(url) {
    const u = String(url || '').trim();
    if (!u) return null;
    const id = extractVideoId(u);
    if (id && /youtu/i.test(u)) return { kind: 'yt', url: u, id: id, start: 0, end: 0 };
    if (/^https?:\/\//i.test(u)) return { kind: 'img', url: u };
    return null;
  }
  function talkMediaNode(media, opts) {
    if (!media) return null;
    if (media.kind === 'img') {
      return el('div', { class: 'talk-media' }, el('img', { src: media.url, alt: media.alt || '', loading: 'lazy' }));
    }
    const p = [];
    if (media.start > 0) p.push('start=' + Math.floor(media.start));
    if (media.end > 0 && media.end > media.start) p.push('end=' + Math.ceil(media.end));
    p.push('rel=0', 'modestbranding=1', 'playsinline=1');
    const src = 'https://www.youtube-nocookie.com/embed/' + media.id + '?' + p.join('&');
    return el('div', { class: 'talk-media yt' + (opts && opts.small ? ' small' : '') },
      el('iframe', { src: src, allow: 'accelerometer; encrypted-media; picture-in-picture', allowfullscreen: 'allowfullscreen', loading: 'lazy', title: 'video della sezione' }));
  }
  /** v96: il pop-up dove si incolla il link dell'immagine o del video di UNA domanda. */
  let TM = null;   // { ls, q }
  function openTalkMedia(ls, q) {
    TM = { ls: ls, q: q };
    const d = $('#dlg-talk-media');
    $('#tm-q').textContent = q.text ? '« ' + q.text.slice(0, 90) + (q.text.length > 90 ? '…' : '') + ' »' : 'Domanda senza testo';
    $('#tm-url').value = (q.media && q.media.url) || '';
    $('#tm-msg').textContent = '';
    tmRefresh();
    d.showModal();
    setTimeout(function () { $('#tm-url').focus(); }, 30);
  }
  /** Ridisegna tempi e anteprima del dialogo a partire da quello che c'è scritto nel campo. */
  function tmRefresh() {
    if (!TM) return;
    const url = $('#tm-url').value.trim();
    const m = url ? talkMediaFrom(url) : null;
    const yt = m && m.kind === 'yt';
    if (yt && TM.q.media && TM.q.media.kind === 'yt' && TM.q.media.id === m.id) { m.start = TM.q.media.start || 0; m.end = TM.q.media.end || 0; }
    TM.pending = m;
    $('#tm-times').hidden = !yt;
    if (yt) {
      const f = $('#tm-from'), t = $('#tm-to');
      f.innerHTML = ''; t.innerHTML = '';
      f.appendChild(timeInput(m.start || 0, function (v) { if (TM.pending) { TM.pending.start = v; tmPreview(); } }, 'tm:from'));
      t.appendChild(timeInput(m.end || 0, function (v) { if (TM.pending) { TM.pending.end = v; tmPreview(); } }, 'tm:to'));
    }
    tmPreview();
    if (url && !m) $('#tm-msg').textContent = 'Link non riconosciuto: serve un indirizzo http… di un\'immagine o di un video YouTube';
    else $('#tm-msg').textContent = '';
  }
  function tmPreview() {
    const box = $('#tm-prev'); box.innerHTML = '';
    const n = TM && TM.pending ? talkMediaNode(TM.pending, { small: true }) : null;
    if (n) box.appendChild(n);
  }
  (function bindTalkMedia() {
    const url = $('#tm-url'); if (!url) return;
    url.addEventListener('change', tmRefresh);
    url.addEventListener('paste', function () { setTimeout(tmRefresh, 40); });
    $('#tm-save').addEventListener('click', function () {
      if (!TM) return;
      const v = $('#tm-url').value.trim();
      if (!v) { delete TM.q.media; }
      else {
        const m = TM.pending || talkMediaFrom(v);
        if (!m) { $('#tm-msg').textContent = 'Link non riconosciuto: controlla e riprova'; return; }
        TM.q.media = m;
      }
      const ls = TM.ls;
      $('#dlg-talk-media').close();
      touch(ls); renderFlow(ls);
    });
    $('#tm-remove').addEventListener('click', function () {
      if (!TM) return;
      const ls = TM.ls; delete TM.q.media;
      $('#dlg-talk-media').close();
      touch(ls); renderFlow(ls);
    });
    $('#tm-close').addEventListener('click', function () { $('#dlg-talk-media').close(); });
    $('#dlg-talk-media').addEventListener('close', function () { TM = null; $('#tm-prev').innerHTML = ''; });
  })();
  function renderTalkCard(ls, sec) {
    const before = talkBefore(ls, sec.id);
    const card = el('div', { class: 'card talk-card', 'data-tid': sec.id });
    const head = el('div', { class: 'row' });
    head.appendChild(el('h2', { style: 'margin:0', text: 'Parliamone' + (ls.talks.length > 1 ? ' ' + (ls.talks.findIndex(function (t) { return t.id === sec.id; }) + 1) : '') }));
    head.appendChild(el('span', { class: 'hint', text: before ? 'prima del video · per entrare nel tema' : 'dopo il video · domande per parlare' }));
    const aiBtn = el('button', { class: 'small right', text: '✨ Proponi con l\'AI' });
    if (!S.settings.apiKey) aiBtn.style.display = 'none';
    head.appendChild(aiBtn);
    // Le espressioni per rispondere devono essere attacchi di frase, non contenuto: in una domanda di comprensione
    // un suggerimento che contiene la risposta annulla la domanda (segnalato da Edoardo il 2/9). Le domande generate
    // prima della v54 possono averli sporchi: qui si ripuliscono senza rigenerare niente e senza toccare le opinioni.
    const leaky = function (q) {
      const k = before ? 'warmup' : (q.kind || 'talk');
      if (k !== 'warmup' && k !== 'check') return false;
      return !!q.help && AI.frameHelp(q.help, k) !== q.help;
    };
    if (sec.questions.some(leaky)) {
      const n = sec.questions.filter(leaky).length;
      const clean = el('button', { class: 'small', text: '🧹 Togli le risposte dai suggerimenti (' + n + ')', title: 'In ' + n + (n === 1 ? ' domanda un suggerimento contiene la risposta' : ' domande i suggerimenti contengono la risposta') + ': resta solo l\'attacco di frase' });
      clean.addEventListener('click', function () {
        sec.questions.forEach(function (q) { if (leaky(q)) q.help = AI.frameHelp(q.help, before ? 'warmup' : q.kind); });
        touch(ls); renderFlow(ls);
        toastUndo('Suggerimenti ripuliti in ' + n + (n === 1 ? ' domanda' : ' domande'), function () { if (!undo()) toast('Niente da annullare'); });
      });
      head.appendChild(clean);
    }
    head.appendChild(el('button', { class: 'small', text: '+ Domanda', onclick: function () { sec.questions.push({ id: uid(), text: '', help: '' }); touch(ls); renderFlow(ls, { keep: false }); const rows = $$('.talk-card[data-tid="' + sec.id + '"] .talk-row'); const last = rows[rows.length - 1]; if (last) last.querySelector('textarea, input').focus(); } }));
    if (ls.talks.length > 1) {
      const rm = el('button', { class: 'small danger', text: '✕ Sezione', title: 'Togli questa sezione con le sue domande' });
      rm.addEventListener('click', function () {
        if (sec.questions.some(function (q) { return q.text; }) && !rm._armed) { rm._armed = true; rm.textContent = 'Sicuro? ✕'; setTimeout(function () { rm._armed = false; rm.textContent = '✕ Sezione'; }, 3000); return; }
        ls.talks = ls.talks.filter(function (t) { return t.id !== sec.id; });
        ls.flow = ls.flow.filter(function (s) { return !(s.kind === 'talk' && s.id === sec.id); });
        touch(ls); renderFlow(ls);
        toastUndo('Sezione "Parliamone" tolta dalla lezione', function () { undo(); });
      });
      head.appendChild(rm);
    }
    card.appendChild(head);
    // quando: prima del video (elicitazione del tema) o dopo (comprensione + opinioni); cambiarlo sposta la sezione nella struttura
    const when = el('div', { class: 'row', style: 'margin:8px 0 2px;gap:6px' });
    when.appendChild(el('span', { class: 'hint', text: 'Quando:' }));
    [['before', '🎬 Prima del video'], ['after', '💬 Dopo il video']].forEach(function (opt) {
      const on = (opt[0] === 'before') === before;
      when.appendChild(el('button', { class: 'theme-chip when-chip' + (on ? ' sel' : ''), type: 'button', text: opt[1], onclick: function () { if (on) return; placeTalk(ls, sec.id, opt[0]); touch(ls); renderFlow(ls); } }));
    });
    card.appendChild(when);
    // v96 (Edoardo: "voglio poter mettere un link immagine o un link video in ogni domanda, metti solo il
    // pulsante... se clicco si apre il pop-up dove incollo il link"): il media sta sulla DOMANDA, non sulla
    // sezione, e si mette dal dialogo #dlg-talk-media. La riga sempre in vista è sparita: era rumore.
    const box = el('div', { class: 'talk-box' });
    card.appendChild(box);
    const status = el('span', { class: 'hint' });
    card.appendChild(el('div', { class: 'row', style: 'margin-top:6px' }, status));
    card.appendChild(el('p', { class: 'hint', text: before ? 'Prima di guardare: 3 domande bastano. Servono a far emergere il tema e quello che gli studenti già sanno, senza svelare il contenuto del video.' : 'Dopo il video: domande SPECIFICHE su quello che il video ha detto — prima di comprensione (lo studente racconta quello che ha capito), poi di opinione ancorate ai punti del video. Lo studente le vede una alla volta con le espressioni utili; nessuna correzione automatica: si parla.' }));
    if (!sec.questions.length) box.appendChild(el('p', { class: 'muted', text: 'Nessuna domanda: proponile con l\'AI o scrivile a mano (una domanda aperta + le espressioni utili per rispondere).' }));
    const KIND = { check: 'comprensione', talk: 'opinione', warmup: 'per entrare nel tema' };
    /** Rigenera UNA domanda con l'AI, del tipo indicato, evitando di ripetere le altre della sezione. */
    const regen = function (q, status) {
      if (!S.settings.apiKey) return toast('Serve la chiave API (Impostazioni AI)');
      status.textContent = '… chiedo al modello';
      const chunks = ls.chunks && ls.chunks.length ? ls.chunks : G.annotate(G.buildChunks(ls.lines || [], { duration: ls.duration, lang: ls.lang }), { lang: ls.lang, duration: ls.duration });
      const avoid = sec.questions.filter(function (x) { return x !== q && x.text; }).map(function (x) { return x.text; });
      AI.suggestDiscussion({ chunks: chunks, lang: ls.lang, level: ls.level, n: 1, mode: before ? 'warmup' : 'after', kind: before ? 'warmup' : (q.kind === 'check' ? 'check' : 'talk'), avoid: avoid, focus: ls.params && ls.params.focus, apiKey: S.settings.apiKey, model: S.settings.model })
        .then(function (r) {
          const nq = r.questions[0];
          if (!nq) { status.textContent = ''; return toast('Il modello non ha proposto nulla: riprova'); }
          q.text = nq.text; q.help = nq.help; q.kind = nq.kind;
          touch(ls); renderFlow(ls);
          toast('Domanda rigenerata' + (r.ai && r.ai.cost != null ? ' · ' + (r.ai.cost * 100).toFixed(1) + ' cent' : ''));
        })
        .catch(function (e) { status.textContent = ''; toast('AI: ' + e.message, 6000); });
    };
    sec.questions.forEach(function (q, i) {
      const row = el('div', { class: 'talk-row' });
      row.appendChild(el('span', { class: 'num', text: String(i + 1) }));
      // riga di intestazione della domanda: il TIPO (cliccabile: comprensione ↔ opinione) e "Rigenera" solo per questa domanda
      const meta = el('div', { class: 'talk-meta' });
      const kindLabel = before ? KIND.warmup : (KIND[q.kind] || 'tipo?');
      const kindBtn = el('button', { type: 'button', class: 'kind ' + (before ? 'warmup' : (q.kind || 'none')), text: kindLabel,
        title: before ? 'Prima del video: domanda per entrare nel tema' : 'Clicca per cambiare: comprensione ↔ opinione' });
      meta.appendChild(kindBtn);
      const status = el('span', { class: 'hint' });
      if (S.settings.apiKey) meta.appendChild(el('button', { class: 'small regen', text: '✨ Rigenera', title: 'Sostituisci solo questa domanda con una nuova dell\'AI, dello stesso tipo', onclick: function () { regen(q, status); } }));
      // v96: un solo pulsante; il link si incolla nel pop-up. Quando c'è, il pulsante lo dice.
      const mm = q.media;
      meta.appendChild(el('button', {
        class: 'small' + (mm ? ' ok' : ''),
        text: mm ? (mm.kind === 'yt' ? '🎬 Video ✓' : '🖼 Immagine ✓') : '🖼 Immagine o video',
        title: mm ? 'Cambia o togli l\'immagine/il video di questa domanda' : 'Aggiungi un\'immagine o un video che lo studente vede con questa domanda',
        onclick: function () { openTalkMedia(ls, q); }
      }));
      meta.appendChild(status);
      // caselle che crescono col testo: domanda ed espressioni si leggono per intero, una sopra l'altra
      const grow = function (t) { t.style.height = 'auto'; t.style.height = (t.scrollHeight + 2) + 'px'; };
      const qPlaceholder = function () { return before ? 'Domanda per entrare nel tema' : (q.kind === 'check' ? 'Domanda di comprensione sul video' : 'Domanda aperta, di opinione'); };
      const qi = el('textarea', { class: 'talk-in q', rows: '1', 'data-qid': q.id + ':q', placeholder: qPlaceholder() });
      qi.value = q.text || '';
      if (TALK_H[q.id + ':q']) qi.style.height = TALK_H[q.id + ':q'];   // parte già alta come prima: niente salto
      qi.addEventListener('input', function () { grow(qi); });
      qi.addEventListener('change', function () { q.text = qi.value.trim(); touch(ls); });
      const hi = el('textarea', { class: 'talk-in h', rows: '1', 'data-qid': q.id + ':h', placeholder: 'Espressioni utili, separate da · (facoltative)' });
      hi.value = q.help || '';
      if (TALK_H[q.id + ':h']) hi.style.height = TALK_H[q.id + ':h'];
      hi.addEventListener('input', function () { grow(hi); });
      hi.addEventListener('change', function () { q.help = hi.value.trim(); touch(ls); });
      // il tipo si cambia SUL POSTO (niente re-render: la pagina resta esattamente dov'è)
      if (!before) kindBtn.addEventListener('click', function () {
        q.kind = q.kind === 'check' ? 'talk' : 'check';
        kindBtn.className = 'kind ' + q.kind; kindBtn.textContent = KIND[q.kind];
        qi.placeholder = qPlaceholder();
        touch(ls);
      });
      row.appendChild(el('div', { class: 'talk-fields' }, meta, qi, hi));
      row.appendChild(el('div', { class: 'row talk-btns', style: 'gap:4px' },
        el('button', { class: 'small', text: '↑', title: 'Sposta su', disabled: i === 0 ? 'disabled' : null, onclick: function () { sec.questions.splice(i - 1, 0, sec.questions.splice(i, 1)[0]); touch(ls); renderFlow(ls); } }),
        el('button', { class: 'small', text: '↓', title: 'Sposta giù', disabled: i === sec.questions.length - 1 ? 'disabled' : null, onclick: function () { sec.questions.splice(i + 1, 0, sec.questions.splice(i, 1)[0]); touch(ls); renderFlow(ls); } }),
        el('button', { class: 'small danger', text: '✕', title: 'Togli', onclick: function () { sec.questions.splice(i, 1); touch(ls); renderFlow(ls); undoBarFor('domanda ' + (i + 1) + ' di Parliamone'); } })));
      box.appendChild(row);
      requestAnimationFrame(function () { grow(qi); grow(hi); });   // dopo l'inserimento nel DOM: l'altezza si misura solo da attaccati
    });
    aiBtn.addEventListener('click', function () {
      if (!S.settings.apiKey) return toast('Serve la chiave API (Impostazioni AI)');
      status.textContent = 'Chiedo al modello…';
      const chunks = ls.chunks && ls.chunks.length ? ls.chunks : G.annotate(G.buildChunks(ls.lines || [], { duration: ls.duration, lang: ls.lang }), { lang: ls.lang, duration: ls.duration });
      AI.suggestDiscussion({ chunks: chunks, lang: ls.lang, level: ls.level, n: before ? 3 : 6, mode: before ? 'warmup' : 'after', focus: ls.params && ls.params.focus, apiKey: S.settings.apiKey, model: S.settings.model })
        .then(function (r) {
          const have = new Set(sec.questions.map(function (q) { return L.normalize(q.text); }));
          let added = 0;
          r.questions.forEach(function (q) { if (have.has(L.normalize(q.text))) return; sec.questions.push({ id: uid(), text: q.text, help: q.help, kind: q.kind }); added++; });
          touch(ls); renderFlow(ls);
          toast(added + ' domande proposte' + (r.ai && r.ai.cost != null ? ' · ' + (r.ai.cost * 100).toFixed(1) + ' cent' : ''));
        })
        .catch(function (e) { status.textContent = 'AI: ' + e.message; toast('AI: ' + e.message, 6000); });
    });
    return card;
  }

  // ---------- ATTIVITÀ (Memory, Quiz, Anagramma, Ruota): standalone nel portfolio o sezione della lezione ----------
  function actOpts(extra) {
    const o = {
      celebrate: function (box) { const fb = el('div', { class: 'feedback' }); box.appendChild(fb); try { celebrate(box, fb); } catch (e) { /* ignore */ } },
      sound: playWinSound
    };
    if (extra) for (const k in extra) o[k] = extra[k];
    return o;
  }
  /** Contenuto d'esempio per l'anteprima di un tipo di attività (quando quella vera non è ancora completa). */
  const SAMPLE_DATA = {
    quiz: { questions: [{ q: 'Come si dice "thank you"?', options: ['Grazie', 'Prego', 'Scusa', 'Ciao'], correct: 0 }] },
    memory: { pairs: [{ a: 'il mare', b: 'the sea' }, { a: 'la spiaggia', b: 'the beach' }, { a: 'l\'ombrellone', b: 'the umbrella' }, { a: 'nuotare', b: 'to swim' }, { a: 'la sabbia', b: 'the sand' }, { a: 'il sole', b: 'the sun' }] },
    anagram: { words: [{ word: 'grazie', hint: 'thank you' }, { word: 'spiaggia', hint: 'beach' }] },
    wheel: { items: [{ text: 'Come ti chiami?' }, { text: 'Cosa fai nel weekend?' }, { text: 'Qual è il tuo piatto preferito?' }, { text: 'Descrivi la tua città' }, { text: 'Che tempo fa oggi?' }, { text: 'Parla della tua famiglia' }] }
  };
  /** L'attività da mostrare nell'anteprima: QUELLA VERA (stesso tipo, stesso contenuto) se è completa, altrimenti un esempio dello stesso tipo. */
  function previewAct(act, themeId) {
    const type = act && ACT.TYPES[act.type] ? act.type : 'quiz';
    const th = ACT.THEMES.find(function (t) { return t.id === themeId; }) || ACT.THEMES[0];
    const real = act && !ACT.validate(act).length;
    const data = real ? JSON.parse(JSON.stringify(act.data)) : SAMPLE_DATA[type];
    return { id: 'tp-' + themeId, type: type, theme: themeId, title: (act && act.title) || (ACT.TYPES[type].emoji + ' ' + ACT.TYPES[type].label + ' — ' + th.name), data: data };
  }
  /** Replica FEDELE delle schede Parole utili (abbinamento) con il template: stesse classi del pannello dello studente, parole vere se ce ne sono. */
  function vocabPreviewPanel(themeId, ls) {
    const panel = el('div', { class: 'ex-panel pop vocab-act act', 'data-theme': themeId, style: 'position:relative;width:900px;height:620px;padding:44px 24px 12px;overflow:hidden;display:block;isolation:isolate;--rowh:64px;border-radius:14px' });
    ACT.decorate(panel, { id: 'vp', theme: themeId }, { fx: false, props: false });   // v124: anteprima fedele: schede senza decorazioni
    const wrap = el('div', { class: 'vocab-wrap' });
    panel.appendChild(wrap);
    const real = ls ? cardVocab(ls) : [];
    const words = (real.length >= 3 ? real : [{ word: 'il mare', translation: 'the sea' }, { word: 'la spiaggia', translation: 'the beach' }, { word: 'nuotare', translation: 'to swim' }, { word: 'la sabbia', translation: 'the sand' }, { word: 'il sole', translation: 'the sun' }]).slice(0, 5);
    cardHeader(wrap, 'Parole utili: abbina', '');
    wrap.appendChild(el('div', { class: 'instr', text: 'Tocca una parola e poi la sua foto o traduzione (puoi anche partire dalla foto): le coppie giuste salgono in alto, legate.' }));
    const done = el('div', { class: 'match-done' });
    const first = words[0];
    done.appendChild(el('div', { class: 'mpair' }, [
      el('div', { class: 'mchip good' }, [el('span', { class: 'txt', text: first.word }), el('button', { class: 'star', text: '★' })]),
      el('div', { class: 'link' }),
      el('div', { class: 'mchip good target' }, [backOf(first)])]));
    wrap.appendChild(done);
    const grid = el('div', { class: 'match' }), left = el('div', { class: 'col' }), right = el('div', { class: 'col' });
    const rest = words.slice(1);
    rest.forEach(function (w, i) { left.appendChild(el('div', { class: 'mchip' + (i === 0 ? ' sel' : '') }, [el('span', { class: 'txt', text: w.word }), el('button', { class: 'star', text: '★' })])); });
    rest.slice().reverse().forEach(function (w) { right.appendChild(el('div', { class: 'mchip target' }, [backOf(w)])); });
    grid.appendChild(left); grid.appendChild(right); wrap.appendChild(grid);
    wrap.appendChild(el('div', { class: 'actions' }, el('button', { class: 'link', text: 'Salta questa scheda' }), el('button', { class: 'link', text: 'Salta le schede ▶' })));
    return panel;
  }
  /** Anteprima di un template: la scena VERA resa in scala dentro un riquadro (pointer-events: none), animazioni vive.
   *  spec: { act } → quell'attività (tipo e contenuto veri, o un esempio dello stesso tipo); { vocab: ls } → le schede delle Parole utili; niente → un Quiz d'esempio. */
  function themePreviewNode(themeId, scale, spec) {
    const wrap = el('div', { class: 'tp-wrap' });
    wrap.style.width = Math.round(900 * scale) + 'px'; wrap.style.height = Math.round(620 * scale) + 'px';
    const inner = el('div', { class: 'tp-scale' }); inner.style.transform = 'scale(' + scale + ')';
    wrap.appendChild(inner);
    if (spec && spec.vocab) inner.appendChild(vocabPreviewPanel(themeId, spec.vocab));
    else ACT.render(inner, previewAct(spec && spec.act, themeId), { fx: true });
    return wrap;
  }
  /** Chiave dell'anteprima: tema + cosa viene mostrato (tipo e contenuto), così cambiando attività l'anteprima si rifà. */
  function previewKey(themeId, spec) {
    if (spec && spec.vocab) return themeId + '|vocab|' + cardVocab(spec.vocab).slice(0, 5).map(function (w) { return w.word + '=' + (w.translation || w.image); }).join(',');
    if (spec && spec.act) return themeId + '|' + spec.act.type + '|' + JSON.stringify(spec.act.data || {});
    return themeId + '|quiz';
  }
  /** Anteprima grande al passaggio del mouse su un chip del selettore (riquadro fisso, uno solo). */
  let themePrev = null;
  function showThemePreview(anchor, themeId, spec) {
    if (!themePrev) { themePrev = el('div', { class: 'theme-preview' }); document.body.appendChild(themePrev); }
    const key = previewKey(themeId, spec);
    if (themePrev.getAttribute('data-key') !== key) { themePrev.innerHTML = ''; themePrev.appendChild(themePreviewNode(themeId, 0.44, spec)); themePrev.setAttribute('data-key', key); themePrev.setAttribute('data-tid', themeId); }
    themePrev.classList.add('show');
    // centrata sotto il chip se c'è spazio, altrimenti sopra; sempre dentro la finestra
    const r = anchor.getBoundingClientRect(), vw = window.innerWidth, vh = window.innerHeight, W = 396 + 10, H = 273 + 10;
    const left = Math.max(8, Math.min(r.left + r.width / 2 - W / 2, vw - W - 8));
    let top = (r.bottom + 10 + H <= vh - 8) ? r.bottom + 10 : r.top - H - 10;
    if (top < 8) top = 8;
    themePrev.style.left = left + 'px'; themePrev.style.top = top + 'px';
  }
  function hideThemePreview() { if (themePrev) themePrev.classList.remove('show'); }
  /** Chips dei template visivi, con l'anteprima dei colori e l'anteprima grande al passaggio del mouse.
   *  spec = cosa mostrare nell'anteprima ({act} o {vocab: ls}): l'anteprima è SEMPRE la stessa cosa che si sta modificando. */
  function themeChips(current, onPick, spec) {
    hideThemePreview();
    const box = el('div', { class: 'chips', style: 'gap:8px' });
    // v82 ('i template mostra solo la prima riga, poi un tasto tipo "mostra tutti"'): chiusi = il template scelto
    // + i primi altri, su una riga; "Mostra tutti" apre l'elenco completo, "Mostra meno" lo richiude.
    let expanded = false;
    const build = function () {
      box.innerHTML = '';
      const themes = ACT.THEMES.slice();
      let vis = themes;
      if (!expanded) {
        const sel = themes.find(function (t) { return t.id === current; });
        vis = (sel ? [sel] : []).concat(themes.filter(function (t) { return !sel || t.id !== sel.id; })).slice(0, 4);
      }
      vis.forEach(function (t) {
        const c = el('button', { type: 'button', class: 'theme-chip' + (current === t.id ? ' sel' : ''), title: t.name + ' — passa il mouse per l\'anteprima' },
          el('span', { class: 'sw', style: 'background:' + t.sw }),
          t.name);   // v124: niente emoticon nei nomi dei template
        c.addEventListener('click', function () { hideThemePreview(); onPick(t.id); });
        c.addEventListener('mouseenter', function () { showThemePreview(c, t.id, spec); });
        c.addEventListener('mouseleave', hideThemePreview);
        c.addEventListener('focus', function () { showThemePreview(c, t.id, spec); });
        c.addEventListener('blur', hideThemePreview);
        box.appendChild(c);
      });
      const more = el('button', { type: 'button', class: 'theme-chip more', text: expanded ? 'Mostra meno ▴' : 'Mostra tutti (' + themes.length + ') ▾' });
      more.addEventListener('click', function () { expanded = !expanded; hideThemePreview(); build(); });
      box.appendChild(more);
    };
    build();
    return box;
  }
  /** Pulsante 🎨 dentro una scena già resa: cambia il template AL VOLO, il gioco continua da dove è (niente reset).
   *  act = oggetto con .theme (viene aggiornato); opts: { fx, onPick(themeId) } — onPick decide se salvare (lezione propria). */
  function themeSwitcher(rootEl, act, opts) {
    if (!rootEl) return null;
    const o = opts || {};
    const btn = el('button', { type: 'button', class: 'act-theme-btn', title: 'Cambia template: il gioco continua da dove sei', 'aria-label': 'Cambia template' }, '🎨');
    const pop = el('div', { class: 'act-theme-pop' }); pop.hidden = true;
    const close = function () { pop.hidden = true; btn.classList.remove('open'); };
    const build = function () {
      pop.innerHTML = '';
      pop.appendChild(el('div', { class: 'hint', text: 'Template — cambia al volo, senza perdere quello che hai già fatto' }));
      const chips = el('div', { class: 'chips' });
      ACT.THEMES.forEach(function (t) {
        const c = el('button', { type: 'button', class: 'theme-chip' + (ACT.themeOf(act) === t.id ? ' sel' : ''), title: t.name },
          el('span', { class: 'sw', style: 'background:' + t.sw }), t.name);
        c.addEventListener('click', function () {
          if (!ACT.retheme(rootEl, act, t.id, rootEl.classList.contains('vocab-act') ? { fx: false, props: false } : { fx: o.fx !== false })) return;
          if (o.onPick) o.onPick(t.id);
          close();
        });
        chips.appendChild(c);
      });
      pop.appendChild(chips);
    };
    btn.addEventListener('click', function (e) { e.stopPropagation(); if (pop.hidden) { build(); pop.hidden = false; btn.classList.add('open'); } else close(); });
    pop.addEventListener('click', function (e) { e.stopPropagation(); });
    rootEl.addEventListener('click', function () { if (!pop.hidden) close(); });   // clic altrove nella scena → si chiude
    rootEl.appendChild(btn); rootEl.appendChild(pop);
    return btn;
  }
  /** true se la lezione aperta è del proprietario (nel suo portfolio): le scelte fatte giocando si salvano lì. */
  function ownLesson(ls) { return !!(ls && !S.standalone && S.lessons[ls.id] === ls); }
  /** "Trasforma in…": stesso contenuto, altro tipo di attività (un click). onDone(newType) dopo la conversione. */
  function convertRow(act, onDone) {
    const targets = ACT.convertTargets(act);
    if (!targets.length) return null;
    const row = el('div', { class: 'row', style: 'margin-top:8px;gap:6px' });
    row.appendChild(el('span', { class: 'hint', text: '⇄ Trasforma in:' }));
    targets.forEach(function (to) {
      const t = ACT.TYPES[to];
      row.appendChild(el('button', { class: 'small', text: t.emoji + ' ' + t.label, title: 'Stesso contenuto, gioco diverso', onclick: function () {
        const out = ACT.convert(act, to, Math.random);
        if (!out) return toast('Con questo contenuto non si può');
        act.type = out.type; act.data = out.data;
        onDone(to);
        toast('Trasformata in ' + t.label + ' (stesso contenuto)');
      } }));
    });
    return row;
  }
  /** Campi dell'editor per il tipo di attività. ctx: { lesson (o null se standalone), redraw(), changed() }. */
  function renderActFields(box, act, ctx) {
    box.innerHTML = '';
    const d = act.data;
    const changed = ctx.changed, redraw = ctx.redraw;
    // caselle che crescono col testo: domande e risposte lunghe si devono LEGGERE per intero (mai troncate in una riga)
    const grow = function (t) { t.style.height = 'auto'; t.style.height = (t.scrollHeight + 2) + 'px'; };
    const area = function (attrs, value, onSave) {
      const t = el('textarea', attrs);
      t.value = value || '';
      t.addEventListener('input', function () { grow(t); });
      t.addEventListener('change', function () { onSave(t.value.trim()); });
      requestAnimationFrame(function () { grow(t); });   // l'altezza si misura solo da attaccati al DOM
      return t;
    };
    const rowBtns = function (arr, i, what) {
      return el('div', { class: 'row', style: 'gap:4px' },
        el('button', { class: 'small danger', text: '✕', title: 'Togli', onclick: function () { arr.splice(i, 1); changed(); redraw(); undoBarFor((what || 'elemento') + ' ' + (i + 1)); } }));
    };
    if (act.type === 'memory') {
      if (!Array.isArray(d.pairs)) d.pairs = [];
      box.appendChild(el('p', { class: 'hint', style: 'margin-top:0', text: 'Da 3 a 12 coppie: parola davanti, traduzione (o foto) dietro. Se metti l\'URL di una foto, la carta mostra la foto.' }));
      d.pairs.forEach(function (p, i) {
        const row = el('div', { class: 'af-row' });
        const a = el('input', { type: 'text', placeholder: 'Parola', value: p.a || '' }); a.addEventListener('change', function () { p.a = a.value.trim(); changed(); });
        const b = el('input', { type: 'text', placeholder: 'Traduzione (o vuoto se c\'è la foto)', value: p.b || '' }); b.addEventListener('change', function () { p.b = b.value.trim(); changed(); });
        row.appendChild(a); row.appendChild(b); row.appendChild(rowBtns(d.pairs, i, 'coppia'));
        const img = el('input', { type: 'text', placeholder: 'URL foto (facoltativo)', value: p.image || '', style: 'grid-column:1 / -2;font-size:13px;color:var(--muted)' });
        img.addEventListener('change', function () { p.image = img.value.trim(); changed(); });
        row.appendChild(img);
        // stessa ricerca foto delle Parole utili (v66, 'voglio la stessa funzione che c'è su parole utili'):
        // Wikipedia/Commons sulla parola della coppia; ricliccando scorre i candidati come '↻ Altra'
        row.appendChild(el('button', { class: 'small', text: p.image ? '↻ Altra' : '🔍 Foto', title: 'Cerca una foto (Wikipedia e Wikimedia Commons) per la parola della coppia; riclicca per vederne un\'altra', onclick: function () {
          const word = (a.value || p.a || '').trim();
          if (!word) return toast('Scrivi prima la parola');
          const go = function () {
            const list = p._imgs || [];
            if (!list.length) { toast('Nessuna foto trovata per "' + word + '" (Wikipedia e Wikimedia Commons): prova a cambiare la parola o incolla un URL', 5000); return; }
            p._imgIdx = (p._imgIdx == null || p._imgIdx < 0) ? 0 : (p._imgIdx + 1) % list.length;
            p.image = list[p._imgIdx].url;
            changed(); redraw();
            toast((p._imgIdx + 1) + '/' + list.length + ' · ' + list[p._imgIdx].title + ' (' + list[p._imgIdx].source + ')', 2500);
          };
          if (p._imgs && p._imgsFor === word) return go();
          toast('Cerco foto per "' + word + '"…', 1500);
          searchImages((ctx.lesson && ctx.lesson.lang) || 'it', word, (b.value || p.b || '').trim()).then(function (list) { p._imgs = list; p._imgsFor = word; p._imgIdx = -1; go(); });
        } }));
        box.appendChild(row);
      });
      const r = el('div', { class: 'row', style: 'margin-top:10px' });
      r.appendChild(el('button', { class: 'small', text: '+ Coppia', onclick: function () { d.pairs.push({ a: '', b: '', image: '' }); changed(); redraw(); } }));
      r.appendChild(el('button', { class: 'small', text: '\ud83d\udcf7 Da immagine (AI)', title: 'Coppie generate da una foto o screenshot', onclick: function () { openImgGen({ kinds: ['match'], onAccept: function (items) { let n = 0; items.forEach(function (it) { (it.pairs || []).forEach(function (p) { if (d.pairs.length < 12) { d.pairs.push({ a: p.a, b: p.b, image: '' }); n++; } }); }); changed(); redraw(); toast(n + ' coppie aggiunte dall\u2019immagine'); } }); } }));
      if (ctx.lesson) r.appendChild(el('button', { class: 'small', text: '🃏 Usa le Parole utili', title: 'Importa le parole selezionate con traduzione o foto', onclick: function () {
        const have = new Set(d.pairs.map(function (p) { return L.normalize(p.a || ''); }));
        let n = 0;
        cardVocab(ctx.lesson).forEach(function (w) { if (d.pairs.length >= 12 || have.has(L.normalize(w.word))) return; d.pairs.push({ a: w.word, b: w.translation || '', image: w.image || '' }); n++; });
        changed(); redraw(); toast(n ? n + ' coppie importate dalle Parole utili' : 'Niente di nuovo da importare');
      } }));
      box.appendChild(r);
    }
    if (act.type === 'quiz') {
      if (!Array.isArray(d.questions)) d.questions = [];
      const hasKey = !!S.settings.apiKey;
      box.appendChild(el('p', { class: 'hint', style: 'margin-top:0', text: 'Domande a scelta multipla: segna la risposta giusta con il pallino. Le risposte compaiono mescolate.' + (hasKey ? ' ✨ rifà con l\'AI una singola domanda o una singola risposta; oppure scrivi tu.' : '') }));
      // contesto per l'AI: il testo del video (nella lezione) o il titolo come argomento (standalone)
      const aiCtx = function () {
        if (ctx.lesson) return { chunks: ctx.lesson.chunks && ctx.lesson.chunks.length ? ctx.lesson.chunks : G.annotate(G.buildChunks(ctx.lesson.lines || [], { duration: ctx.lesson.duration, lang: ctx.lesson.lang }), { lang: ctx.lesson.lang, duration: ctx.lesson.duration }), lang: ctx.lesson.lang, level: ctx.lesson.level, topic: '' };
        const topic = (act.title || '').trim();
        if (!topic) { toast('Scrivi prima il titolo: è l\'argomento su cui l\'AI inventa le domande (es. "Il cibo italiano")', 5000); return null; }
        return { chunks: null, lang: act.lang || 'it', level: 'B1', topic: topic };
      };
      d.questions.forEach(function (q, i) {
        if (!Array.isArray(q.options)) q.options = ['', '', '', ''];
        const card = el('div', { class: 'af-quiz' });
        const qrow = el('div', { class: 'qrow' });
        const qi = area({ class: 'af-in q', rows: '2', placeholder: 'Domanda ' + (i + 1) }, q.q, function (v) { q.q = v; changed(); });
        const qb = el('div', { class: 'row', style: 'gap:4px' });
        if (hasKey) {
          const rg = el('button', { class: 'small regen', text: '✨ Rigenera', title: 'Un\'altra domanda (con le sue risposte) al posto di questa, diversa dalle altre del quiz' });
          rg.addEventListener('click', function () {
            const c = aiCtx(); if (!c) return;
            rg.disabled = true; rg.textContent = '…';
            AI.generateQuizSet({ topic: c.topic, chunks: c.chunks, lang: c.lang, level: c.level, n: 1, avoid: d.questions.filter(function (x) { return x !== q && x.q; }).map(function (x) { return x.q; }), apiKey: S.settings.apiKey, model: S.settings.model })
              .then(function (r2) {
                if (!r2.questions.length) throw new Error('nessuna domanda proposta');
                const nq = r2.questions[0];
                q.q = nq.q; q.options = nq.options.concat(['', '', '', '']).slice(0, 4); q.correct = nq.correct;
                changed(); redraw(); toast('Domanda ' + (i + 1) + ' sostituita');
              })
              .catch(function (e) { rg.disabled = false; rg.textContent = '✨ Rigenera'; toast('AI: ' + e.message, 6000); });
          });
          qb.appendChild(rg);
        }
        qb.appendChild(el('button', { class: 'small danger', text: '✕', title: 'Togli la domanda', onclick: function () { d.questions.splice(i, 1); changed(); redraw(); undoBarFor('domanda ' + (i + 1) + ' del quiz'); } }));
        qrow.appendChild(qi); qrow.appendChild(qb);
        card.appendChild(qrow);
        q.options.forEach(function (op, k) {
          const orow = el('div', { class: 'orow' + (hasKey ? ' ai' : '') });
          const radio = el('input', { type: 'radio', name: 'aq-' + act.id + '-' + i, title: 'Risposta giusta' });
          radio.checked = q.correct === k;
          radio.addEventListener('change', function () { q.correct = k; changed(); });
          const oi = area({ class: 'af-in', rows: '1', placeholder: 'Risposta ' + (k + 1) + (k > 1 ? ' (facoltativa)' : '') }, op, function (v) { q.options[k] = v; changed(); });
          orow.appendChild(radio); orow.appendChild(oi);
          if (hasKey) {
            const ob = el('button', { class: 'small regen', text: '✨', title: q.correct === k ? 'Riformula la risposta giusta con l\'AI' : 'Un altro distrattore con l\'AI (risposta sbagliata ma plausibile)' });
            ob.addEventListener('click', function () {
              if (!(q.q || '').trim()) return toast('Scrivi prima la domanda');
              const c = aiCtx(); if (!c) return;
              ob.disabled = true; ob.textContent = '…';
              AI.generateQuizOption({ q: q.q, options: q.options, correct: q.correct, index: k, topic: c.topic, chunks: c.chunks, lang: c.lang, level: c.level, apiKey: S.settings.apiKey, model: S.settings.model })
                .then(function (r2) { q.options[k] = r2.text; oi.value = r2.text; grow(oi); changed(); ob.disabled = false; ob.textContent = '✨'; oi.classList.add('flash-in'); setTimeout(function () { oi.classList.remove('flash-in'); }, 1200); })
                .catch(function (e) { ob.disabled = false; ob.textContent = '✨'; toast('AI: ' + e.message, 6000); });
            });
            orow.appendChild(ob);
          }
          card.appendChild(orow);
        });
        box.appendChild(card);
      });
      const r = el('div', { class: 'row', style: 'margin-top:10px' });
      r.appendChild(el('button', { class: 'small', text: '+ Domanda', onclick: function () { d.questions.push({ q: '', options: ['', '', '', ''], correct: 0 }); changed(); redraw(); } }));
      r.appendChild(el('button', { class: 'small', text: '\ud83d\udcf7 Da immagine (AI)', title: 'Domande generate da una foto o screenshot', onclick: function () { openImgGen({ kinds: ['mc'], onAccept: function (items) { let n = 0; items.forEach(function (it) { if (it.type === 'mc') { const o4 = it.options.slice(0, 4); while (o4.length < 4) o4.push(''); d.questions.push({ q: it.q, options: o4, correct: Math.min(it.correct, o4.length - 1) }); n++; } }); changed(); redraw(); toast(n + ' domande aggiunte dall\u2019immagine'); } }); } }));
      const aiBtn = el('button', { class: 'small', text: '✨ Proponi con l\'AI' });
      // v83 ('voglio poter scegliere su cosa focalizzarmi, sul contenuto o sulla grammatica'): il focus delle domande
      const focusSel = el('select', { style: 'width:auto', title: 'Su cosa vertono le domande generate' });
      [['content', 'sul contenuto'], ['grammar', 'sulla grammatica'], ['vocab', 'sul lessico']].forEach(function (o) { focusSel.appendChild(el('option', { value: o[0], text: o[1] })); });
      if (!S.settings.apiKey) { aiBtn.style.display = 'none'; focusSel.style.display = 'none'; }
      const st = el('span', { class: 'hint' });
      aiBtn.addEventListener('click', function () {
        if (!S.settings.apiKey) return toast('Serve la chiave API (Impostazioni AI)');
        let topic = '';
        if (!ctx.lesson) {
          topic = (act.title || '').trim();
          if (!topic) return toast('Scrivi prima il titolo: è l\'argomento su cui l\'AI inventa le domande (es. "Il cibo italiano")', 5000);
        }
        st.textContent = 'Chiedo al modello…';
        const chunks = ctx.lesson ? (ctx.lesson.chunks && ctx.lesson.chunks.length ? ctx.lesson.chunks : G.annotate(G.buildChunks(ctx.lesson.lines || [], { duration: ctx.lesson.duration, lang: ctx.lesson.lang }), { lang: ctx.lesson.lang, duration: ctx.lesson.duration })) : null;
        AI.generateQuizSet({ topic: topic, chunks: chunks, focus: focusSel.value, lang: ctx.lesson ? ctx.lesson.lang : (act.lang || 'it'), level: ctx.lesson ? ctx.lesson.level : 'B1', n: 6, apiKey: S.settings.apiKey, model: S.settings.model })
          .then(function (r2) {
            r2.questions.forEach(function (q) { d.questions.push(q); });
            changed(); redraw();
            toast(r2.questions.length + ' domande proposte' + (r2.ai && r2.ai.cost != null ? ' · ' + (r2.ai.cost * 100).toFixed(1) + ' cent' : ''));
          })
          .catch(function (e) { st.textContent = ''; toast('AI: ' + e.message, 6000); });
      });
      r.appendChild(aiBtn); r.appendChild(focusSel); r.appendChild(st);
      box.appendChild(r);
    }
    if (act.type === 'anagram') {
      if (!Array.isArray(d.words)) d.words = [];
      box.appendChild(el('p', { class: 'hint', style: 'margin-top:0', text: 'Parole da ricomporre (almeno 3 lettere), con un indizio: la traduzione, una definizione o una foto (URL).' }));
      d.words.forEach(function (w, i) {
        const row = el('div', { class: 'af-row' });
        const a = el('input', { type: 'text', placeholder: 'Parola', value: w.word || '' }); a.addEventListener('change', function () { w.word = a.value.trim(); changed(); });
        const b = el('input', { type: 'text', placeholder: 'Indizio (traduzione o definizione)', value: w.hint || '' }); b.addEventListener('change', function () { w.hint = b.value.trim(); changed(); });
        row.appendChild(a); row.appendChild(b); row.appendChild(rowBtns(d.words, i, 'parola'));
        box.appendChild(row);
      });
      const r = el('div', { class: 'row', style: 'margin-top:10px' });
      r.appendChild(el('button', { class: 'small', text: '+ Parola', onclick: function () { d.words.push({ word: '', hint: '' }); changed(); redraw(); } }));
      r.appendChild(el('button', { class: 'small', text: '\ud83d\udcf7 Da immagine (AI)', title: 'Parole generate da una foto o screenshot', onclick: function () { openImgGen({ kinds: ['match'], onAccept: function (items) { let n = 0; items.forEach(function (it) { (it.pairs || []).forEach(function (p) { d.words.push({ word: p.a, hint: p.b }); n++; }); }); changed(); redraw(); toast(n + ' parole aggiunte dall\u2019immagine'); } }); } }));
      if (ctx.lesson) r.appendChild(el('button', { class: 'small', text: '🃏 Usa le Parole utili', onclick: function () {
        const have = new Set(d.words.map(function (w) { return L.normalize(w.word || ''); }));
        let n = 0;
        cardVocab(ctx.lesson).forEach(function (w) { if (have.has(L.normalize(w.word))) return; d.words.push({ word: w.word, hint: w.translation || '', image: w.image || '' }); n++; });
        changed(); redraw(); toast(n ? n + ' parole importate' : 'Niente di nuovo da importare');
      } }));
      box.appendChild(r);
    }
    if (act.type === 'wheel') {
      if (!Array.isArray(d.items)) d.items = [];
      box.appendChild(el('p', { class: 'hint', style: 'margin-top:0', text: 'Le voci sulla ruota: domande per parlare, parole, compiti ("Descrivi la tua giornata"). Almeno 2.' }));
      d.items.forEach(function (it, i) {
        const row = el('div', { class: 'af-row one' });
        const a = area({ class: 'af-in', rows: '1', placeholder: 'Voce ' + (i + 1) }, it.text, function (v) { it.text = v; changed(); });
        row.appendChild(a); row.appendChild(rowBtns(d.items, i, 'voce'));
        box.appendChild(row);
      });
      const r = el('div', { class: 'row', style: 'margin-top:10px' });
      r.appendChild(el('button', { class: 'small', text: '+ Voce', onclick: function () { d.items.push({ text: '' }); changed(); redraw(); } }));
      r.appendChild(el('button', { class: 'small', text: '\ud83d\udcf7 Da immagine (AI)', title: 'Voci generate da una foto o screenshot', onclick: function () { openImgGen({ kinds: ['wheel'], onAccept: function (items) { let n = 0; items.forEach(function (it) { (it.items || []).forEach(function (t) { d.items.push({ text: t }); n++; }); }); changed(); redraw(); toast(n + ' voci aggiunte dall\u2019immagine'); } }); } }));
      if (ctx.lesson) r.appendChild(el('button', { class: 'small', text: '💬 Usa le domande di Parliamone', onclick: function () {
        const have = new Set(d.items.map(function (x) { return L.normalize(x.text || ''); }));
        let n = 0;
        (ctx.lesson.talks || []).forEach(function (sec) { sec.questions.forEach(function (q) { if (!q.text || have.has(L.normalize(q.text))) return; d.items.push({ text: q.text }); n++; }); });
        changed(); redraw(); toast(n ? n + ' domande importate' : 'Niente di nuovo da importare');
      } }));
      box.appendChild(r);
    }
  }
  /** Prova un'attività nel dialog (editor della lezione o standalone). */
  function tryActivity(act, onTheme) {
    const dlg = $('#dlg-act-try');
    const root = ACT.render($('#at-stage'), act, actOpts({ onDone: function () { dlg.close(); }, doneLabel: 'Chiudi' }));
    themeSwitcher(root, act, { onPick: function (tid) { if (onTheme) onTheme(tid); } });
    dlg.showModal();
  }
  $('#at-close').addEventListener('click', function () { $('#dlg-act-try').close(); $('#at-stage').innerHTML = ''; });
  /** Dialog "Nuova attività" in due passi: il tipo di gioco, poi il template scelto dalla griglia delle anteprime vive.
   *  onPick(type, theme) decide cosa farne (portfolio o sezione della lezione). */
  function openActNew(onPick) {
    const dlg = $('#dlg-act-new'), types = $('#an-types'), themes = $('#an-themes');
    const step1 = function () {
      $('#an-title').textContent = 'Nuova attività';
      $('#an-hint').textContent = 'Un gioco pronto da condividere con un link o da inserire in una lezione. Scegli il tipo:';
      types.hidden = false; themes.hidden = true; $('#an-back').hidden = true; themes.innerHTML = '';
    };
    const step2 = function (type) {
      const t = ACT.TYPES[type];
      $('#an-title').textContent = t.emoji + ' ' + t.label + ' — scegli il template';
      $('#an-hint').textContent = 'Il template è l\'aspetto del gioco, indipendente dal contenuto: si cambia in ogni momento dall\'editor.';
      types.hidden = true; themes.hidden = false; $('#an-back').hidden = false;
      themes.innerHTML = '';
      ACT.THEMES.forEach(function (th) {
        const item = el('button', { type: 'button', class: 'an-theme', 'data-tid': th.id, title: th.name });
        item.appendChild(themePreviewNode(th.id, 0.27, { act: { type: type, theme: th.id, data: {} } }));   // anteprima DEL TIPO scelto
        item.appendChild(el('div', { class: 'lbl', text: th.name }));
        item.addEventListener('click', function () { dlg.close(); themes.innerHTML = ''; onPick(type, th.id); });
        themes.appendChild(item);
      });
      themes.scrollTop = 0;
    };
    types.innerHTML = '';
    Object.keys(ACT.TYPES).forEach(function (type) {
      const t = ACT.TYPES[type];
      const b = el('button', { type: 'button' },
        el('span', { class: 'em', text: t.emoji }),
        el('b', { text: t.label }),
        el('span', { class: 'hint', text: t.hint }));
      b.addEventListener('click', function () { step2(type); });
      types.appendChild(b);
    });
    $('#an-back').onclick = step1;
    step1();
    dlg.showModal();
  }
  $('#an-close').addEventListener('click', function () { $('#dlg-act-new').close(); $('#an-themes').innerHTML = ''; });
  /** Card di una sezione-attività nell'editor della lezione. */
  function renderActCard(ls, act) {
    const t = ACT.TYPES[act.type] || { emoji: '🎲', label: 'Attività', hint: '' };
    const card = el('div', { class: 'card act-card', 'data-aid': act.id });
    const head = el('div', { class: 'row' });
    head.appendChild(el('h2', { style: 'margin:0', text: t.emoji + ' ' + t.label }));
    head.appendChild(el('span', { class: 'hint', text: t.hint }));
    head.appendChild(el('button', { class: 'small right', text: '▶ Prova', onclick: function () { tryActivity(act, function () { touch(ls); renderFlow(ls); }); } }));
    const rm = el('button', { class: 'small danger', text: '✕ Sezione', title: 'Togli questa attività dalla lezione' });
    rm.addEventListener('click', function () {
      const full = ACT.validate(act).length === 0;
      if (full && !rm._armed) { rm._armed = true; rm.textContent = 'Sicuro? ✕'; setTimeout(function () { rm._armed = false; rm.textContent = '✕ Sezione'; }, 3000); return; }
      ls.acts = ls.acts.filter(function (a) { return a.id !== act.id; });
      ls.flow = ls.flow.filter(function (s) { return !(s.kind === 'act' && s.id === act.id); });
      touch(ls); renderFlow(ls);
      toastUndo('Sezione "' + t.label + '" tolta dalla lezione', function () { undo(); });
    });
    head.appendChild(rm);
    card.appendChild(head);
    card.appendChild(el('div', { class: 'row', style: 'margin:8px 0 2px' }, el('span', { class: 'hint', text: 'Template:' })));
    card.appendChild(themeChips(act.theme || 'classic', function (id) { act.theme = id; touch(ls); renderFlow(ls); }, { act: act }));
    const conv = convertRow(act, function () { touch(ls); renderFlow(ls); });
    if (conv) card.appendChild(conv);
    const fields = el('div');
    card.appendChild(fields);
    renderActFields(fields, act, { lesson: ls, changed: function () { touch(ls); }, redraw: function () { renderFlow(ls); } });
    return card;
  }
  $('#btn-flow-act').addEventListener('click', function () {
    const ls = current(); if (!ls) return;
    openActNew(function (type, theme) {
      lessonFlow(ls);
      const id = 'a' + (Math.max.apply(null, [0].concat(ls.acts.map(function (a) { return parseInt(String(a.id).replace(/\D/g, ''), 10) || 0; }))) + 1);
      ls.acts.push({ id: id, type: type, theme: theme || 'classic', data: {} });
      const vi = ls.flow.findIndex(function (s) { return s.kind === 'video'; });
      ls.flow.splice(vi + 1, 0, { kind: 'act', id: id });   // di default subito dopo il video: si sposta con ◀ ▶
      touch(ls); renderFlow(ls, { keep: false });
      const node = document.querySelector('.act-card[data-aid="' + id + '"]');
      if (node) node.scrollIntoView({ behavior: 'smooth', block: 'center' });
    });
  });

  // ---------- attività standalone (portfolio) ----------
  function newActivity(type, theme) {
    const ls = { id: uid(), title: '', activity: { id: 'a1', type: type, theme: theme || 'classic', data: {} }, updatedAt: new Date().toISOString() };
    S.lessons[ls.id] = ls; saveLessons();
    openActEditor(ls.id);
  }
  function openActEditor(id) {
    const ls = S.lessons[id]; if (!ls || !ls.activity) return renderHome();
    S.currentId = id;
    show('act');
    undoOpen(ls);
    const act = ls.activity;
    const t = ACT.TYPES[act.type] || { emoji: '🎲', label: 'Attività', hint: '' };
    $('#a-emoji').textContent = t.emoji;
    $('#a-type-hint').textContent = t.label + ' — ' + t.hint;
    const ti = $('#a-title'); ti.value = ls.title || '';
    ti.onchange = function () { ls.title = ti.value.trim(); act.title = ls.title; touch(ls); };
    const redraw = function () {
      const t2 = ACT.TYPES[act.type] || t;
      $('#a-emoji').textContent = t2.emoji;
      $('#a-type-hint').textContent = t2.label + ' — ' + t2.hint;
      const th = $('#a-themes'); th.innerHTML = '';
      th.appendChild(themeChips(act.theme || 'classic', function (tid) { act.theme = tid; touch(ls); redraw(); }, { act: act }));
      const conv = convertRow(act, function () { touch(ls); redraw(); });
      if (conv) th.appendChild(conv);
      renderActFields($('#a-fields'), act, { lesson: null, changed: function () { touch(ls); }, redraw: redraw });
    };
    redraw();
  }
  function actPayload(ls) {
    const a = ls.activity;
    return { v: 1, id: ls.id, title: ls.title, activity: { id: a.id, type: a.type, theme: a.theme, title: ls.title, data: a.data } };
  }
  $('#a-save').addEventListener('click', function () { saveLessons(); renderHome(); });
  $('#a-try').addEventListener('click', function () {
    const ls = current(); if (!ls || !ls.activity) return;
    const errs = ACT.validate(ls.activity);
    if (errs.length) return toast(errs.join(' '), 5000);
    ls.activity.title = ls.title;
    tryActivity(ls.activity, function () { touch(ls); openActEditor(ls.id); });
  });
  $('#a-share').addEventListener('click', function () {
    const ls = current(); if (!ls || !ls.activity) return;
    const errs = ACT.validate(ls.activity);
    if (errs.length) return toast(errs.join(' '), 5000);
    ls.activity.title = ls.title;
    const base = location.origin + location.pathname;
    const link = base + '#d=' + b64url(actPayload(ls));
    copyText(link);
    toast('Link copiato: aprilo per giocare (funziona su qualsiasi computer)');
  });
  $('#a-export').addEventListener('click', function () { const ls = current(); if (!ls || !ls.activity) return; download(slugify(ls.title || 'attivita') + '.json', JSON.stringify(actPayload(ls), null, 1)); });
  $('#a-delete').addEventListener('click', function () {
    const ls = current(); if (!ls) return;
    if (!confirm('Eliminare "' + (ls.title || 'attività senza titolo') + '"?')) return;
    deleteLesson(ls);
  });
  /** Gioco a tutta pagina (Apri dal portfolio o link studente). */
  function openActPlay(id, obj) {
    const ls = obj || S.lessons[id]; if (!ls || !ls.activity) return renderHome();
    S.currentId = ls.id;
    document.body.classList.toggle('standalone', !!S.standalone);
    show('actplay');
    const act = ls.activity;
    act.title = ls.title || act.title;
    $('#ap-title').textContent = ls.title || (ACT.TYPES[act.type] ? ACT.TYPES[act.type].label : 'Attività');
    $('#ap-edit').style.display = (!S.standalone && S.lessons[ls.id]) ? '' : 'none';
    $('#ap-edit').onclick = function () { openActEditor(ls.id); };
    const root = ACT.render($('#ap-stage'), act, actOpts({}));
    // template al volo: chi possiede l'attività la salva così, lo studente cambia solo per sé
    themeSwitcher(root, act, { onPick: function () { if (ownLesson(ls)) touch(ls); } });
  }

  function readyText(ls) {
    const ready = cardVocab(ls).length;
    return selectedVocab(ls).length + ' selezionate, ' + ready + ' pronte per le schede (con traduzione o foto)' + (ready < 3 ? ' — ne servono almeno 3 per la scheda di abbinamento' : '');
  }
  /** v93: due parole sono "la stessa" se hanno la stessa impronta (senza articolo, singolare/plurale). */
  function haveVocab(vb, lang) {
    const set = new Set();
    vb.words.forEach(function (w) {
      const n = L.normalize(w.word); if (n) set.add(n);
      const st = L.vocabStem(w.word, lang); if (st) set.add('§' + st);
    });
    return set;
  }
  function isNewVocab(have, word, lang) {
    const n = L.normalize(word), st = L.vocabStem(word, lang);
    return !!n && !have.has(n) && !(st && have.has('§' + st));
  }
  function proposeVocabRules(ls) {
    const vb = vocabState(ls);
    // v93 (Edoardo: "le parole aggiunte a volte sono le stesse di quelle che c'erano già"): il confronto era
    // sulla stringa esatta, quindi "il rischio" e "rischio" (o "rischi") passavano per parole diverse.
    const have = haveVocab(vb, ls.lang);
    const cands = G.vocabCandidates(ls.chunks || [], ls.exercises, { lang: ls.lang, n: 30, support: vb.support, level: ls.level }).filter(function (c) {
      if (!isNewVocab(have, c.word, ls.lang)) return false;
      have.add(L.normalize(c.word)); const st = L.vocabStem(c.word, ls.lang); if (st) have.add('§' + st);   // e nemmeno doppioni fra loro
      return true;
    });
    cands.slice(0, 14).forEach(function (c) { vb.words.push({ id: uid(), word: c.word, translation: '', image: '', selected: true, inExercise: c.inExercises, source: 'rules' }); });
    touch(ls); renderVocabEditor(ls);
    toast(cands.length ? cands.slice(0, 14).length + ' parole aggiunte (senza traduzione)' : 'Nessuna nuova parola trovata');
  }
  function proposeVocabAI(ls) {
    const vb = vocabState(ls);
    if (!S.settings.apiKey) return toast('Nessuna chiave API: apri "Impostazioni AI"');
    const st = $('#e-vocab-status'); st.textContent = 'Chiedo al modello…';
    AI.suggestVocab({ chunks: ls.chunks || [], exercises: ls.exercises, lang: ls.lang, support: vb.support, level: ls.level, n: 14, exclude: vb.words.map(function (w) { return w.word; }), apiKey: S.settings.apiKey, model: S.settings.model })
      .then(function (r) {
        const have = haveVocab(vb, ls.lang);   // v93: stesso confronto tollerante delle regole
        let added = 0;
        r.vocab.forEach(function (v) {
          if (!isNewVocab(have, v.word, ls.lang)) return;
          have.add(L.normalize(v.word)); const st2 = L.vocabStem(v.word, ls.lang); if (st2) have.add('§' + st2);
          vb.words.push({ id: uid(), word: v.word, translation: v.translation, image: '', selected: true, inExercise: v.inExercise, source: 'ai' }); added++;
        });
        touch(ls); renderVocabEditor(ls);
        st.textContent = added + ' parole aggiunte' + (r.ai && r.ai.cost != null ? ' · ' + (r.ai.cost * 100).toFixed(1) + ' cent' : '');
      })
      .catch(function (e) { st.textContent = '⚠ ' + e.message; });
  }
  function translateMissing(ls) {
    const vb = vocabState(ls);
    if (!S.settings.apiKey) return toast('Nessuna chiave API: apri "Impostazioni AI"');
    const todo = vb.words.filter(function (w) { return w.word && !w.translation; }).map(function (w) { return w.word; });
    if (!todo.length) return toast('Tutte le parole hanno già una traduzione');
    const st = $('#e-vocab-status'); st.textContent = 'Traduco ' + todo.length + ' parole…';
    const context = ls.exercises.map(function (e) { return e.sentence; }).join(' ') + ' ' + (ls.chunks || []).map(function (c) { return c.text; }).join(' ').slice(0, 4000);
    AI.translateWords({ words: todo, lang: ls.lang, support: vb.support, context: context, apiKey: S.settings.apiKey, model: S.settings.model })
      .then(function (r) {
        let n = 0;
        vb.words.forEach(function (w) { if (!w.translation && r.translations[w.word]) { w.translation = r.translations[w.word]; n++; } });
        touch(ls); renderVocabEditor(ls);
        st.textContent = n + ' traduzioni aggiunte' + (r.ai && r.ai.cost != null ? ' · ' + (r.ai.cost * 100).toFixed(1) + ' cent' : '');
      })
      .catch(function (e) { st.textContent = '⚠ ' + e.message; });
  }
  /** Foto da Wikipedia (API REST, senza chiavi): prova la pagina della parola nella lingua del video, poi la traduzione in inglese. */
  /**
   * Ricerca foto senza chiavi: Wikipedia (pagine con miniatura, ricerca a testo libero: trova "mare" anche da "mari")
   * e Wikimedia Commons (file fotografici). Ritorna una lista di candidati [{url, title, source}] da scorrere con "Altra foto".
   */
  function singularGuesses(word, lang) {
    const w = String(word || '').trim(); const out = [w];
    if (lang === 'it' && w.length > 4) {
      if (/i$/.test(w)) { out.push(w.slice(0, -1) + 'o'); out.push(w.slice(0, -1) + 'e'); }
      if (/e$/.test(w)) out.push(w.slice(0, -1) + 'a');
      if (/chi$/.test(w)) out.push(w.slice(0, -3) + 'co');
      if (/ghi$/.test(w)) out.push(w.slice(0, -3) + 'go');
    }
    if (lang === 'en' && /s$/.test(w) && w.length > 4) out.push(w.replace(/(e|ie)?s$/, ''));
    return out.filter(function (x, i, a) { return x && a.indexOf(x) === i; });
  }
  function searchImages(lang, word, translation) {
    const seen = new Set(), out = [];
    const add = function (url, title, source) { if (url && !seen.has(url)) { seen.add(url); out.push({ url: url, title: title || '', source: source }); } };
    const wikiSearch = function (lg, q) {
      const u = 'https://' + lg + '.wikipedia.org/w/api.php?action=query&format=json&origin=*&generator=search&gsrsearch=' + encodeURIComponent(q) + '&gsrlimit=6&gsrnamespace=0&prop=pageimages|pageprops&piprop=thumbnail&pithumbsize=400&ppprop=disambiguation';
      return fetch(u).then(function (r) { return r.ok ? r.json() : null; }).then(function (j) {
        const pages = j && j.query && j.query.pages ? Object.values(j.query.pages) : [];
        pages.sort(function (a, b) { return (a.index || 0) - (b.index || 0); });
        pages.forEach(function (pg) { if (pg.pageprops && pg.pageprops.disambiguation !== undefined) return; if (pg.thumbnail && pg.thumbnail.source) add(pg.thumbnail.source, pg.title, lg + '.wikipedia'); });
      }).catch(function () { /* ignore */ });
    };
    const commonsSearch = function (q) {
      const u = 'https://commons.wikimedia.org/w/api.php?action=query&format=json&origin=*&generator=search&gsrsearch=' + encodeURIComponent(q) + '&gsrnamespace=6&gsrlimit=10&prop=imageinfo&iiprop=url|mime&iiurlwidth=400';
      return fetch(u).then(function (r) { return r.ok ? r.json() : null; }).then(function (j) {
        const pages = j && j.query && j.query.pages ? Object.values(j.query.pages) : [];
        pages.sort(function (a, b) { return (a.index || 0) - (b.index || 0); });
        pages.forEach(function (pg) { const ii = pg.imageinfo && pg.imageinfo[0]; if (!ii || !/^image\/(jpeg|png|webp)/.test(ii.mime || '')) return; add(ii.thumburl || ii.url, (pg.title || '').replace(/^File:/, ''), 'commons'); });
      }).catch(function () { /* ignore */ });
    };
    const guesses = singularGuesses(word, lang);
    const steps = [];
    guesses.forEach(function (g) { steps.push(function () { return wikiSearch(lang, g); }); });
    steps.push(function () { return commonsSearch(guesses[0]); });
    if (translation) { steps.push(function () { return wikiSearch('en', translation); }); steps.push(function () { return commonsSearch(translation); }); }
    return steps.reduce(function (p, f) { return p.then(f); }, Promise.resolve()).then(function () { return out; });
  }
  /** Prima foto per la parola (o la successiva, se "Altra foto"). */
  function findImage(ls, w, done, next) {
    const word = String(w.word || '').trim();
    if (!word) return toast('Scrivi prima la parola');
    const go = function () {
      const list = w._imgs || [];
      if (!list.length) { toast('Nessuna foto trovata per "' + word + '" (Wikipedia e Wikimedia Commons): prova a cambiare la parola o incolla un URL', 5000); return; }
      w._imgIdx = next ? ((w._imgIdx || 0) + 1) % list.length : 0;
      w.image = list[w._imgIdx].url;
      touch(ls); done();
      toast((w._imgIdx + 1) + '/' + list.length + ' · ' + list[w._imgIdx].title + ' (' + list[w._imgIdx].source + ')', 2500);
    };
    if (w._imgs && w._imgsFor === word) return go();
    toast('Cerco foto per "' + word + '"…', 1500);
    searchImages(ls.lang, word, w.translation).then(function (list) { w._imgs = list; w._imgsFor = word; w._imgIdx = -1; go(); });
  }
  $('#btn-vocab-rules').addEventListener('click', function () { const ls = current(); if (ls) proposeVocabRules(ls); });
  $('#btn-vocab-ai').addEventListener('click', function () { const ls = current(); if (ls) proposeVocabAI(ls); });
  $('#btn-vocab-translate').addEventListener('click', function () { const ls = current(); if (ls) translateMissing(ls); });
  $('#btn-vocab-check').addEventListener('click', function () { const ls = current(); if (ls) checkVocabTranslations(ls); });
  /**
   * Rilegge le parole utili DENTRO le frasi da cui vengono e segnala quelle la cui traduzione, da sola su una scheda,
   * porterebbe fuori strada ("un conto" = "a bill" invece di "one thing is"). Dove serve propone di allungare
   * l'espressione. Niente si applica da solo: ogni proposta ha il suo pulsante, ed e' annullabile.
   */
  function checkVocabTranslations(ls) {
    const vb = vocabState(ls);
    if (!S.settings.apiKey) return toast('Nessuna chiave API: apri "Impostazioni AI"');
    const words = vb.words.filter(function (w) { return w.word && w.selected !== false; });
    if (!words.length) return toast('Nessuna parola da controllare');
    const st = $('#e-vocab-status'); st.textContent = 'Controllo ' + words.length + ' parole nel contesto del video…';
    // Edoardo sceglie le parole utili GUARDANDO le frasi degli esercizi: e' li' che va giudicata la traduzione,
    // il resto del video e' solo sfondo (precisazione sua, 3/9).
    const frasi = ls.exercises.map(function (e) { return e.sentence; }).filter(Boolean);
    const context = (ls.chunks || []).map(function (c) { return c.text; }).join(' ').slice(0, 6000);
    AI.checkVocab({ words: words.map(function (w) { return { word: w.word, translation: w.translation }; }), sentences: frasi, lang: ls.lang, support: vb.support, context: context, apiKey: S.settings.apiKey, model: S.settings.model })
      .then(function (r) {
        const dubbi = r.items.filter(function (i) { return i.verdict !== 'ok'; });
        st.textContent = dubbi.length
          ? dubbi.length + (dubbi.length === 1 ? ' traduzione da guardare' : ' traduzioni da guardare') + (r.ai && r.ai.cost != null ? ' · ' + (r.ai.cost * 100).toFixed(1) + ' cent' : '')
          : 'Tutte le traduzioni tengono anche fuori dalla frase' + (r.ai && r.ai.cost != null ? ' · ' + (r.ai.cost * 100).toFixed(1) + ' cent' : '');
        renderVocabWarnings(ls, dubbi);
      })
      .catch(function (e) { st.textContent = '⚠ ' + e.message; });
  }
  function renderVocabWarnings(ls, dubbi) {
    const host = $('#e-vocab-warn'); if (!host) return;
    host.innerHTML = '';
    if (!dubbi || !dubbi.length) return;
    const box = el('div', { class: 'notice warn vocab-warn' });
    box.appendChild(el('div', { class: 'row' },
      el('b', { class: 'grow', text: '🔎 ' + dubbi.length + (dubbi.length === 1 ? ' traduzione da guardare' : ' traduzioni da guardare') }),
      el('button', { class: 'small', text: '✕ Chiudi', onclick: function () { host.innerHTML = ''; } })));
    dubbi.forEach(function (d) {
      const vb = vocabState(ls);
      const row = el('div', { class: 'vw-row' },
        el('div', {}, el('b', { text: d.word }), el('span', { class: 'hint', text: ' = ' + (d.translation || '(senza traduzione)') }),
          el('span', { class: 'badge ' + (d.verdict === 'sbagliata' ? 'bad' : ''), text: d.verdict })),
        d.why ? el('div', { class: 'hint', text: d.why }) : null);
      if (d.suggest && d.suggest.word) {
        row.appendChild(el('div', { class: 'row' },
          el('span', { class: 'hint', text: 'Proposta: ' }),
          el('b', { text: d.suggest.word }),
          el('span', { class: 'hint', text: ' = ' + (d.suggest.translation || '?') }),
          el('button', { class: 'small primary', text: '✓ Usa questa', onclick: function () {
            const w = vb.words.find(function (x) { return L.normalize(x.word) === L.normalize(d.word); });
            if (!w) return toast('Parola non più nella lista');
            w.word = d.suggest.word;
            if (d.suggest.translation) w.translation = d.suggest.translation;
            touch(ls); renderVocabEditor(ls);
            row.remove();
            toast('"' + d.word + '" è diventata "' + d.suggest.word + '" · annulla con ' + undoKeyLabel(), 5000);
          } })));
      }
      box.appendChild(row);
    });
    host.appendChild(box);
  }
  $('#btn-vocab-add').addEventListener('click', function () { const ls = current(); if (!ls) return; vocabState(ls).words.push({ id: uid(), word: '', translation: '', image: '', selected: true, inExercise: false, source: 'manual' }); touch(ls); renderVocabEditor(ls); const rows = $$('#e-vocab .vocab-row'); const last = rows[rows.length - 1]; if (last) last.querySelector('.v-word').focus(); });
  $('#v-matching').addEventListener('change', function () { const ls = current(); if (ls) { vocabState(ls).cards.matching = $('#v-matching').checked; touch(ls); } });
  $('#v-flash').addEventListener('change', function () { const ls = current(); if (ls) { vocabState(ls).cards.flashcards = $('#v-flash').checked; touch(ls); syncVocabCards(); } });
  // "scrive la parola" vive DENTRO le flashcards: se le flashcards sono spente non succede niente (ed è successo).
  // Chi accende la scrittura vuole quella scheda: la si accende da soli e lo si dice.
  $('#v-write').addEventListener('change', function () {
    const ls = current(); if (!ls) return;
    const vb = vocabState(ls);
    vb.cards.write = $('#v-write').checked;
    if (vb.cards.write && vb.cards.flashcards === false) {
      vb.cards.flashcards = true; $('#v-flash').checked = true;
      toast('Ho acceso anche "Scheda 2: flashcards": è lì che lo studente scrive la parola', 4000);
    }
    touch(ls); syncVocabCards();
  });
  /** L'opzione "scrive la parola" si spegne visivamente quando le flashcards non ci sono: niente interruttori che non fanno nulla. */
  function syncVocabCards() {
    const w = $('#v-write'), lbl = $('#v-write-lbl'), on = $('#v-flash').checked;
    if (!w || !lbl) return;
    w.disabled = !on;
    lbl.classList.toggle('off', !on);
    lbl.title = on ? 'Nella Scheda 2 lo studente scrive la parola invece di girare e basta' : 'Accendi "Scheda 2: flashcards": senza quella scheda non c\'è niente da scrivere';
  }
  $('#v-support').addEventListener('change', function () { const ls = current(); if (ls) { vocabState(ls).support = $('#v-support').value; touch(ls); } });

  function timeInput(value, onChange, key) {
    const inp = el('input', { type: 'text', class: 'short', value: fmt(value), title: 'm:ss.s — frecce ↑↓ = ±0,1 s, con Maiusc ±1 s' });
    if (key) inp.setAttribute('data-key', key);
    inp.addEventListener('change', function () {
      const t = L.parseTime(inp.value);
      if (isNaN(t)) { inp.value = fmt(value); return toast('Formato tempo: m:ss.s'); }
      if (key) S.editor.focusKey = key;
      onChange(Math.max(0, t));
    });
    inp.addEventListener('keydown', function (e) {
      if (e.key !== 'ArrowUp' && e.key !== 'ArrowDown') return;
      e.preventDefault();
      const base = L.parseTime(inp.value); if (isNaN(base)) return;
      const step = (e.shiftKey ? 1 : 0.1) * (e.key === 'ArrowUp' ? 1 : -1);
      if (key) S.editor.focusKey = key;
      onChange(Math.max(0, Math.round((base + step) * 10) / 10));
    });
    return inp;
  }
  function restoreFocus() {
    const k = S.editor.focusKey; if (!k) return;
    S.editor.focusKey = null;
    const inp = document.querySelector('[data-key="' + k + '"]');
    if (inp) { inp.focus(); try { inp.setSelectionRange(inp.value.length, inp.value.length); } catch (e) { /* ignore */ } }
  }

  /** Parole della trascrizione intorno a un intervallo, con il tempo stimato di ciascuna (stessa segmentazione di L.words). */
  function wordsNear(ls, seg, pad) {
    const out = [];
    (ls.chunks || []).filter(function (c) { return !c.silence && c.end >= seg.start - pad && c.start <= seg.end + pad; })
      .sort(function (a, b) { return a.start - b.start; })
      .forEach(function (c) {
        const raw = String(c.text || '').split(/\s+/).filter(Boolean);
        let times = G.wordTimes(c);
        if (times.length !== raw.length) { const d = (c.end - c.start) / Math.max(1, raw.length); times = raw.map(function (w, i) { return { start: c.start + i * d, end: c.start + (i + 1) * d }; }); }
        raw.forEach(function (w, i) { L.words(w).forEach(function (n) { out.push({ norm: n, start: times[i].start, end: times[i].end }); }); });
      });
    return out;
  }
  /**
   * Testo e tempi "combaciano"? Non si puo' pretendere che coincidano parola per parola: i tempi salvati tengono
   * 0,2 s prima e 0,35 s dopo (per non mozzare l'audio) e quel margine puo' tirare dentro la parolina accanto.
   * Quindi combaciano se il piu' corto e' un pezzo contiguo del piu' lungo e ballano al massimo due parole:
   * cosi' i due pulsanti restano spenti dopo un aggiornamento, e si accendono quando i tempi cambiano davvero.
   */
  function wordsAligned(a, b) {
    if (a.join(' ') === b.join(' ')) return true;
    const lungo = a.length >= b.length ? a : b, corto = a.length >= b.length ? b : a;
    if (!corto.length || lungo.length - corto.length > 2) return false;
    return lungo.join(' ').indexOf(corto.join(' ')) !== -1;
  }

  /**
   * Il contrario di retimeSentence: dati due tempi, che cosa si sente davvero in mezzo.
   * Si tiene una parola se il suo centro cade dentro l'intervallo — i tempi delle parole sono interpolati
   * dentro la riga dei sottotitoli, quindi al bordo si sbaglia di poco e il centro e' il criterio piu' stabile.
   * Richiesta di Edoardo (2/9): dopo aver spostato "frase da"/"a" vuole un pulsante che riscriva la frase.
   */
  function textForRange(ls, seg) {
    const out = [];
    (ls.chunks || []).filter(function (c) { return !c.silence && c.end >= seg.start - 1 && c.start <= seg.end + 1; })
      .sort(function (a, b) { return a.start - b.start; })
      .forEach(function (c) {
        const raw = String(c.text || '').split(/\s+/).filter(Boolean);
        let times = G.wordTimes(c);
        if (times.length !== raw.length) {
          const d = (c.end - c.start) / Math.max(1, raw.length);
          times = raw.map(function (w, i) { return { start: c.start + i * d, end: c.start + (i + 1) * d }; });
        }
        raw.forEach(function (w, i) {
          const t = times[i]; if (!t) return;
          const mid = (t.start + t.end) / 2;
          if (mid >= seg.start && mid <= seg.end) out.push(w);
        });
      });
    let txt = out.join(' ').replace(/\s+([,.;:!?…])/g, '$1').trim();
    if (txt) txt = txt.charAt(0).toUpperCase() + txt.slice(1);
    return txt;
  }

  /** Dopo una modifica a mano della frase: ritrova le sue parole nella trascrizione e restituisce {start, end} (o null). */
  function retimeSentence(ls, ex) {
    const words = L.words(ex.sentence);
    if (words.length < 2) return null;
    const pool = wordsNear(ls, ex.segment, 60);
    const mid = (ex.segment.start + ex.segment.end) / 2;
    let best = null;
    for (let i = 0; i + words.length <= pool.length; i++) {
      let ok = true;
      for (let k = 0; k < words.length; k++) { if (pool[i + k].norm !== words[k]) { ok = false; break; } }
      if (!ok) continue;
      const d = Math.abs((pool[i].start + pool[i + words.length - 1].end) / 2 - mid);
      if (!best || d < best.d) best = { d: d, start: pool[i].start, end: pool[i + words.length - 1].end };
    }
    if (best) return best;
    // corrispondenza parziale: prima e ultima parola, con un numero di parole simile (qualcosa in mezzo è stato ritoccato)
    const first = words[0], last = words[words.length - 1];
    for (let i = 0; i < pool.length; i++) {
      if (pool[i].norm !== first) continue;
      for (let j = i + 1; j < pool.length && j - i <= words.length + 3; j++) {
        if (pool[j].norm !== last || Math.abs((j - i + 1) - words.length) > 3) continue;
        const d = Math.abs((pool[i].start + pool[j].end) / 2 - mid);
        if (!best || d < best.d) best = { d: d, start: pool[i].start, end: pool[j].end, partial: true };
      }
    }
    return best;
  }

  /** Quante parole sbagliate mettere nella banca del gapbank: scelta dell'insegnante (0-5, v66), default 2.
   * ex.extraWords si salva nella lezione; il vecchio flag ex.noDistractors delle lezioni gia' fatte vale 0. */
  function gapExtraCount(ex) {
    if (ex && ex.extraWords != null) return Math.max(0, ex.extraWords | 0);
    return (ex && ex.noDistractors) ? 0 : 2;
  }
  function rebuildExercise(ls, ex, type, choices, seed) {
    const built = EX.buildExercise(type, ex.sentence, { lang: ls.lang, seed: seed || (Date.now() % 100000), choices: choices || null, vocab: lessonVocab(ls), distractors: gapExtraCount(ex) });
    if (!built) return false;
    delete ex.reviewed;   // il contenuto e' cambiato: il "controllato" va rimesso guardandolo
    ex.type = built.type; ex.data = built.data;
    return true;
  }

  /** "Trova la parola sbagliata (find the wrong word)" → "Trova la parola sbagliata" */
  function tipoBreve(t) { const l = EX.LABELS[t] || t; const p = l.indexOf(' ('); return p === -1 ? l : l.slice(0, p); }
  function renderExerciseCard(ls, ex, i) {
    const card = el('div', { class: 'ex-card ' + (ex.source || 'rules') + (ex.reviewed ? ' reviewed' : ''), id: 'ex-' + ex.id });
    const typeSel = el('select', { style: 'width:auto', title: 'Tipo di esercizio' });
    G.ALL_TYPES.forEach(function (t) { typeSel.appendChild(el('option', { value: t, text: EX.LABELS[t], selected: t === ex.type ? 'selected' : null })); });
    typeSel.addEventListener('change', function () {
      // v83 ('se ho già selezionato la frase e i secondi, perché mi cambia la frase quando voglio solo cambiare
      // il tipo?'): il cambio di TIPO non tocca MAI frase e tempi. Si ricostruisce l'esercizio sulla STESSA frase;
      // se lì il tipo non è costruibile si avvisa e si resta com'era. La frase la cambiano solo "Altra frase",
      // il menu della lunghezza e l'Helper: mai il tipo. (Prima, fuori dalla lunghezza consigliata, cercava
      // una frase "adatta" vicino: era una sorpresa, non un aiuto.)
      const newType = typeSel.value;
      if (newType === 'mc') { ex.type = 'mc'; ex.data = { question: '', options: ['', '', '', ''], correct: 0, tricky: null }; touch(ls); renderEditorBody(); autoMC(ls, ex); return; }
      if (rebuildExercise(ls, ex, newType)) {
        touch(ls); renderEditorBody();
        // v93: due esercizi uguali di fila annoiano; l'avviso si vede e se ne va da solo, senza bloccare
        const vicini = sameTypeNeighbours(ls, ex);
        if (vicini.length) {
          centerNote((vicini.length > 1 ? 'Anche gli esercizi ' + vicini.join(' e ') + ' sono' : 'Anche l\'esercizio ' + vicini[0] + ' è')
            + ' «' + tipoBreve(newType) + '»: due uguali di fila', 2000);
        }
        const r = G.resolveRange('smart', newType);
        const wc = L.words(ex.sentence || '').length;
        if (r && (wc < r[0] || wc > r[1])) toast('Fatto. Occhio: per "' + EX.LABELS[newType] + '" si consigliano ' + r[0] + '-' + r[1] + ' parole, questa frase ne ha ' + wc, 4000);
        return;
      }
      toast('"' + EX.LABELS[newType] + '" non si può costruire su questa frase: resta tutto com\'è. Per cambiare frase usa "Altra frase" o l\'Helper', 4500);
      typeSel.value = ex.type;
    });
    const rangeSel = el('select', { style: 'width:auto', title: 'Lunghezza della frase (parole)' });
    [['smart', 'lunghezza consigliata'], ['auto', 'frase singola'], ['5-10', '5-10 parole'], ['10-15', '10-15 parole'], ['15-20', '15-20 parole'], ['20-30', '20-30 parole'], ['30-40', '30-40 parole'], ['40-60', '40-60 parole']].forEach(function (o) {
      rangeSel.appendChild(el('option', { value: o[0], text: o[1], selected: rangeKey(ex.range) === o[0] ? 'selected' : null }));
    });
    rangeSel.addEventListener('change', function () {
      ex.range = G.RANGES[rangeSel.value] || null;
      // cerca subito la frase migliore di questa lunghezza vicino al punto attuale
      const used = usedChunkIds(ls, ex);
      let best = null;
      if (effRange(ex)) {
        const near = G.passagesNear(ls.chunks || [], ex.markerTime, { exclude: used, type: ex.type, lang: ls.lang, window: 90, range: ex.range }).filter(function (p) { return !p.cta; });
        best = near[0] || null;
        if (!best) { const all = candidatesFor(ls, ex); if (all.length) best = all.reduce(function (a, b) { return Math.abs((b.start + b.end) / 2 - ex.markerTime) < Math.abs((a.start + a.end) / 2 - ex.markerTime) ? b : a; }); }
      } else {
        const alts = G.alternatives(ls.chunks || [], ex.markerTime, { exclude: used, type: ex.type, lang: ls.lang, window: 90 });
        if (alts.length) best = { chunk: alts[0] };
      }
      if (!best) { touch(ls); renderEditorBody(); return toast('Nessuna frase di questa lunghezza in questo video'); }
      applyCandidate(ls, ex, best);
    });
    const cands = candidatesFor(ls, ex);
    const helperSel = el('select', { style: 'width:auto;max-width:420px', title: 'Frasi adatte in tutto il video' });
    const er = effRange(ex);
    helperSel.appendChild(el('option', { value: '', text: (er ? 'Frasi di ' + er[0] + '-' + er[1] + ' parole' : 'Frasi adatte') + ' nel video: ' + cands.length + ' — scegli…' }));
    const curNorm = L.normalize(ex.sentence || '');
    cands.forEach(function (p, k) {
      const isCur = L.normalize(p.text) === curNorm;
      helperSel.appendChild(el('option', { value: String(k), selected: isCur ? 'selected' : null, text: (isCur ? '✓ (attuale) ' : '') + fmtMin(p.start) + ' · ' + p.wordCount + ' parole · ' + (p.text.length > 70 ? p.text.slice(0, 70) + '…' : p.text) }));
    });
    helperSel.addEventListener('change', function () { const k = parseInt(helperSel.value, 10); if (!isNaN(k) && cands[k]) applyCandidate(ls, ex, cands[k]); });
    const alignMarker = function () { ex.markerTime = ex.segment.end; };
    // "Aggiorna testo": riscrive la frase con quello che si sente tra i due tempi. Si accende (arancione) quando
    // il testo scritto non e' piu' quello dell'intervallo, cioe' esattamente dopo che si sono spostati i secondi.
    const rangeTxt = textForRange(ls, ex.segment);
    const stale = !!rangeTxt && !wordsAligned(L.words(rangeTxt), L.words(ex.sentence));
    const updTimesBtn = el('button', {
      class: 'small' + (stale ? ' warn' : ''),
      text: '⟳ Aggiorna tempi',
      title: stale ? 'Il testo non è quello di questi secondi: clicca per spostare i tempi sulle parole che hai scritto' : 'Cerca la frase scritta qui sotto nella trascrizione e sposta "frase da" e "a" sulle sue parole',
      onclick: function () {
        const rt = retimeSentence(ls, ex);
        if (!rt) return toast('Questa frase non si ritrova nella trascrizione: i tempi restano come sono', 5000);
        const prima = fmt(ex.segment.start) + ' → ' + fmt(ex.segment.end);
        ex.segment = { start: Math.max(0, Math.round((rt.start - 0.2) * 10) / 10), end: Math.round((rt.end + 0.35) * 10) / 10 };
        sortExercises(ls); touch(ls); renderEditorBody();
        toast('Tempi spostati sulle parole: ' + prima + ' diventa ' + fmt(ex.segment.start) + ' → ' + fmt(ex.segment.end)
          + (rt.partial ? ' (ritrovate solo la prima e l\'ultima parola)' : '') + ' · annulla con ' + undoKeyLabel(), 5500);
      }
    });
    const updBtn = el('button', {
      class: 'small' + (stale ? ' warn' : ''),
      text: '⟳ Aggiorna testo',
      title: stale ? 'Tra questi due tempi si sente un\'altra frase: clicca per riscriverla' : 'Riscrive la frase con quello che si sente tra "frase da" e "a"',
      onclick: function () {
        const txt = textForRange(ls, ex.segment);
        if (!txt) return toast('Tra questi due tempi la trascrizione non ha parole: allarga l\'intervallo', 4000);
        if (L.words(txt).join(' ') === L.words(ex.sentence).join(' ')) return toast('La frase è già questa');
        ex.sentence = txt;
        if (!rebuildExercise(ls, ex, ex.type, ex.type === 'mc' ? ex.data : null)) {
          toast('Frase troppo corta per "' + (EX.LABELS[ex.type] || ex.type) + '": allarga i tempi o cambia tipo', 5000);
        }
        touch(ls); renderEditorBody();
        toast('Testo riscritto su ' + fmt(ex.segment.start) + ' → ' + fmt(ex.segment.end) + ' (' + L.words(txt).length + ' parole) · annulla con ' + undoKeyLabel(), 5000);
      }
    });
    const lbl = EX.LABELS[ex.type] || ex.type, par = lbl.indexOf(' (');
    card.appendChild(el('div', { class: 'ex-title' },
      el('span', { class: 'num', text: String(i + 1) }),
      el('b', { text: par === -1 ? lbl : lbl.slice(0, par) }),
      par === -1 ? null : el('span', { class: 'hint', text: lbl.slice(par + 1) })));
    const timesRow = el('div', { class: 'head' },
      el('span', { class: 'hint', text: 'frase da' }),
      timeInput(ex.segment.start, function (t) { ex.segment.start = t; touch(ls); renderEditorBody(); }, ex.id + ':start'),
      el('span', { class: 'hint', text: 'a' }),
      timeInput(ex.segment.end, function (t) { ex.segment.end = t; sortExercises(ls); touch(ls); renderEditorBody(); }, ex.id + ':end'),
      el('button', { class: 'small play', text: '▶', title: 'Ascolta esattamente da inizio a fine: parte da "frase da" e si ferma da solo ad "a" — è anche il punto in cui il video si ferma per lo studente', onclick: function () { playSegment(ex.segment); } }),
      el('button', { class: 'small play', text: '▶ -3s', title: 'Ascolta solo gli ultimi 3 secondi: per controllare dove finisce il taglio', onclick: function () { playSegment({ start: Math.max(ex.segment.start, ex.segment.end - 3), end: ex.segment.end }); } }),
      updBtn,
      updTimesBtn,
      el('button', { class: 'small', text: 'Inizio = ora', title: 'Usa il tempo corrente del player come inizio della frase', onclick: function () { if (S.player) { ex.segment.start = Math.round(S.player.time() * 10) / 10; touch(ls); renderEditorBody(); } } }),
      el('button', { class: 'small', text: 'Fine = ora', title: 'Usa il tempo corrente del player come fine della frase', onclick: function () { if (S.player) { ex.segment.end = Math.round(S.player.time() * 10) / 10; sortExercises(ls); touch(ls); renderEditorBody(); } } })
    );
    card.appendChild(timesRow);
    const revBtn = el('button', {
      class: 'small right' + (ex.reviewed ? ' ok' : ''),
      text: ex.reviewed ? '✓ Controllato' : '💾 Salva e segna come controllato',
      title: ex.reviewed ? 'Controllato da te: clicca per togliere il segno verde' : 'Il salvataggio è automatico: questo pulsante segna l\'esercizio come controllato (sfondo verde)',
      onclick: function () {
        if (ex.reviewed) delete ex.reviewed; else ex.reviewed = true;
        saveLessons(); touch(ls); renderEditorBody();
      }
    });
    const head = el('div', { class: 'head', style: 'margin-top:6px' },
      typeSel,
      rangeSel,
      el('button', { class: 'small', text: '👁 Anteprima', title: 'Mostra l\'esercizio come lo vedrà lo studente e riproduce la frase', onclick: function () { openPreview(ls, ex, true); $('#e-stage').scrollIntoView({ behavior: 'smooth', block: 'nearest' }); } }),
      el('button', { class: 'small', text: '▶ Ascolta', onclick: function () { playSegment(ex.segment); } }),
      el('button', { class: 'small', text: '↻ Altra frase', onclick: function () { altSentence(ls, ex); } }),
      el('button', { class: 'small', text: '⟳ Rigenera', onclick: function () { rebuildExercise(ls, ex, ex.type); touch(ls); renderEditorBody(); } }),
      el('span', { class: 'badge ' + (ex.source === 'ai' ? 'ai' : ''), text: ex.source === 'ai' ? 'AI' : 'regole' }),
      typeCountBadge(ls, ex),
      // Le modifiche si salvano DA SOLE (0,4 s dopo ogni cambio, e comunque alla chiusura della pagina): questo
      // pulsante serve a segnare l'esercizio come passato in rassegna, cosi' si vede a colpo d'occhio quali sono
      // ancora quelli proposti dall'AI e quali hai gia' guardato tu (richiesta di Edoardo, 2/9).
      revBtn,
      el('button', { class: 'small danger', text: 'Elimina', onclick: function () { ls.exercises = ls.exercises.filter(function (x) { return x !== ex; }); touch(ls); renderEditorBody(); undoBarFor('esercizio ' + (i + 1) + ' (' + (EX.LABELS[ex.type] || ex.type) + ')'); } })
    );
    card.appendChild(head);
    card.appendChild(el('div', { class: 'row', style: 'margin-top:6px' }, el('span', { class: 'hint', text: 'Helper:' }), helperSel));
    if (ex.note) card.appendChild(el('div', { class: 'hint', text: 'Perché: ' + ex.note }));
    // I tempi NON si ricalcolano da soli quando cambia il testo: lo decide l'insegnante col pulsante "⟳ Aggiorna tempi"
    // (richiesta di Edoardo, 2/9: "devo io essere quello che chiede di ricalcolarlo"). Vale anche al contrario:
    // spostando i secondi il testo non si riscrive da solo. Quando le due cose non combaciano, i due pulsanti si accendono.
    const ta = el('textarea', { class: 'sentence-edit', style: 'min-height:56px;margin-top:8px', title: 'Cambia la frase liberamente: i tempi restano come sono finché non premi "⟳ Aggiorna tempi"' }); ta.value = ex.sentence;
    let teNode = renderTypeEditor(ls, ex);
    let pvNode = el('div', { class: 'preview', html: '<span class="hint">Lo studente vede: </span>' + previewText(ex) });
    // v88 (Edoardo, 18/9: "ho modificato questa frase e quando ho cliccato su Aggiorna tempi la parte finale
    // dell'audio era identica a prima"): il 'change' della textarea scatta al BLUR, cioe' sul mousedown del
    // pulsante. Ridisegnando li' tutto l'editor il pulsante spariva da sotto il dito e il click non arrivava
    // MAI al suo onclick (mousedown e mouseup su due elementi diversi). Ora si aggiorna solo cio' che dipende
    // dalla frase, la barra dei pulsanti resta in vita e il clic arriva. REGOLA: mai renderEditorBody() dentro
    // il change/blur di un campo che sta sopra o sotto dei pulsanti.
    const refreshSentenceParts = function () {
      const te = renderTypeEditor(ls, ex); teNode.replaceWith(te); teNode = te;
      const pv = el('div', { class: 'preview', html: '<span class="hint">Lo studente vede: </span>' + previewText(ex) }); pvNode.replaceWith(pv); pvNode = pv;
      const rt2 = textForRange(ls, ex.segment);
      const st2 = !!rt2 && !wordsAligned(L.words(rt2), L.words(ex.sentence));
      updBtn.classList.toggle('warn', st2); updTimesBtn.classList.toggle('warn', st2);
      updTimesBtn.title = st2 ? 'Il testo non è quello di questi secondi: clicca per spostare i tempi sulle parole che hai scritto' : 'Cerca la frase scritta qui sotto nella trascrizione e sposta "frase da" e "a" sulle sue parole';
      card.classList.toggle('reviewed', !!ex.reviewed);
      const mk = document.querySelector('#e-timeline .marker[data-ex="' + ex.id + '"]');   // v92: e il pallino sulla barra
      if (mk) mk.classList.toggle('rev', !!ex.reviewed);
      revBtn.classList.toggle('ok', !!ex.reviewed);
      revBtn.textContent = ex.reviewed ? '✓ Controllato' : '💾 Salva e segna come controllato';
    };
    ta.addEventListener('change', function () {
      const v = ta.value.trim();
      if (v === ex.sentence) return;
      ex.sentence = v;
      // v92: la frase è cambiata, quindi il "✓ Controllato" non vale più. Va tolto QUI e non solo dentro
      // rebuildExercise, che lo toglie solo quando riesce a ricostruire: con una frase diventata troppo corta
      // l'esercizio resta com'era ma il testo no, e il segno verde direbbe una bugia.
      delete ex.reviewed;
      if (!rebuildExercise(ls, ex, ex.type, ex.type === 'mc' ? ex.data : null)) toast('Frase troppo corta per questo tipo');
      touch(ls); refreshSentenceParts();
    });
    card.appendChild(el('label', { text: 'Frase (quello che lo studente sente)' }));
    card.appendChild(ta);
    card.appendChild(teNode);
    card.appendChild(pvNode);
    return card;
  }

  /** "tipologia presente N volte (questa è la k-esima)" */
  function typeCountBadge(ls, ex) {
    const same = ls.exercises.filter(function (e) { return e.type === ex.type; });
    const k = same.indexOf(ex) + 1, n = same.length;
    return el('span', { class: 'badge count', title: 'Quante volte questo tipo di esercizio è usato nel video', text: 'tipologia presente ' + n + (n === 1 ? ' volta' : ' volte') + (n > 1 ? ' · questa è la ' + k + 'ª' : '') });
  }
  function escapeHtml(s) { return String(s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }
  function previewText(ex) {
    const d = ex.data;
    switch (ex.type) {
      case 'gap': case 'gapbank': {
        const runs = EX.gapRuns(d); const starts = {}; runs.forEach(function (r) { starts[r.indices[0]] = r.indices.length; });
        const inRun = new Set(d.gapIndices);
        return d.tokens.map(function (t, i) { if (!inRun.has(i)) return escapeHtml(t); if (starts[i]) return '<b>' + '______'.repeat(Math.min(starts[i], 3)) + '</b>'; return null; }).filter(function (x) { return x !== null; }).join(' ') + (ex.type === 'gapbank' ? ' <span class="hint">[' + (d.wordBank || []).map(escapeHtml).join(' · ') + ']</span>' : '');
      }
      case 'scramble': return d.shuffled.map(function (w) { return '<span class="chip static">' + escapeHtml(w) + '</span>'; }).join(' ');
      // la parola tolta resta visibile in rosso, in grassetto e sbiadita: si capisce che sparirà
      case 'missing': return d.tokens.map(function (t, i) { return i === d.missingIndex ? '<span class="pv-removed" title="parola tolta">' + escapeHtml(t) + '</span>' : escapeHtml(t); }).join(' ');
      // la parola inserita in più è evidenziata; quella sostituita mostra anche l'originale
      case 'extra': return d.shown.map(function (t, i) { return i === d.extraIndex ? '<span class="pv-added" title="parola in più">' + escapeHtml(t) + '</span>' : escapeHtml(t); }).join(' ');
      case 'wrong': return d.shown.map(function (t, i) { return i === d.wrongIndex ? '<span class="pv-orig" title="parola originale">' + escapeHtml(d.original[i]) + '</span> <span class="pv-swapped" title="parola sbagliata mostrata allo studente">' + escapeHtml(t) + '</span>' : escapeHtml(t); }).join(' ');
      case 'mc': return '<b>' + escapeHtml(d.question || '(domanda da scrivere)') + '</b><br>' + (d.options || []).map(function (o, i) { return (i === d.correct ? '✓ ' : '○ ') + escapeHtml(o) + (d.tricky != null && i === d.tricky ? ' <span class="hint">(tricky)</span>' : ''); }).join('<br>');
    }
    return '';
  }

  function renderTypeEditor(ls, ex) {
    const d = ex.data;
    const wrap = el('div', { style: 'margin-top:8px' });
    const toks = L.tokenize(ex.sentence);
    if (ex.type === 'gapbank') {
      // Quante parole sbagliate nella lista: lo sceglie l'insegnante, 0-5 (v66). Il numero vero (d.distractors.length)
      // e' quello che lo studente legge in grassetto nella consegna; setBank lo tiene allineato a ex.extraWords.
      const setBank = function () { ex.extraWords = (d.distractors || []).length; delete ex.noDistractors; d.wordBank = EX.shuffle(d.answers.concat(d.distractors || []), L.rng(Date.now() % 10000)); touch(ls); renderEditorBody(); };
      const cur = (d.distractors || []).length;
      const sel = el('select');
      for (let k = 0; k <= Math.max(5, cur); k++) sel.appendChild(el('option', { value: String(k), text: k === 0 ? '0 (nessuna)' : String(k) }));
      sel.value = String(cur);
      sel.addEventListener('change', function () {
        const n = parseInt(sel.value, 10) || 0;
        d.distractors = d.distractors || [];
        if (n < d.distractors.length) d.distractors = d.distractors.slice(0, n);   // si tolgono le ultime: quelle ritoccate a mano stanno in testa
        else if (n > d.distractors.length) {
          const pool = lessonVocab(ls).filter(function (w) { return d.answers.concat(d.distractors).map(function (x) { return L.normalize(x); }).indexOf(L.normalize(w)) === -1; });
          const more = EX.similarDistractors(d.answers, pool, n, L.rng(Date.now() % 9973));
          d.distractors = d.distractors.concat(more.slice(d.distractors.length));
          if (d.distractors.length < n) toast('Nel lessico del video ho trovato solo ' + d.distractors.length + ' parole simili alle risposte');
        }
        setBank();
      });
      wrap.appendChild(el('div', { class: 'row' }, el('label', { class: 'chip', style: 'margin:0' }, 'Parole sbagliate in più nella lista: ', sel)));
      if ((d.distractors || []).length) {
        // distrattori modificabili: simili alle risposte (stessa desinenza/lunghezza), non a caso
        const row = el('div', { class: 'row', style: 'margin-top:4px' }, el('span', { class: 'hint', text: 'Parole sbagliate:' }));
        (d.distractors || []).forEach(function (w, k) {
          // v88 ("la parola completamente non si vede tutta"): la casella si allarga con la parola, non taglia
          const inp = el('input', { type: 'text', class: 'short grow', value: w, size: String(Math.max(8, w.length + 1)), title: 'Modifica la parola sbagliata' });
          inp.addEventListener('input', function () { inp.size = Math.max(8, inp.value.length + 1); });
          inp.addEventListener('change', function () { const v = inp.value.trim(); if (v) d.distractors[k] = v; else d.distractors.splice(k, 1); setBank(); });
          row.appendChild(inp);
        });
        row.appendChild(el('button', { class: 'small', text: '+', title: 'Aggiungi una parola sbagliata', onclick: function () { const pool = lessonVocab(ls).filter(function (w) { return d.answers.concat(d.distractors || []).map(function (x) { return L.normalize(x); }).indexOf(L.normalize(w)) === -1; }); const more = EX.similarDistractors(d.answers, pool, (d.distractors || []).length + 1, L.rng(Date.now() % 9973)); d.distractors = (d.distractors || []).concat(more.slice((d.distractors || []).length)); setBank(); } }));
        row.appendChild(el('button', { class: 'small', text: '⟳ Simili', title: 'Rigenera parole sbagliate simili alle risposte', onclick: function () { const pool = lessonVocab(ls).filter(function (w) { return d.answers.map(function (x) { return L.normalize(x); }).indexOf(L.normalize(w)) === -1; }); d.distractors = EX.similarDistractors(d.answers, pool, Math.max(2, (d.distractors || []).length), L.rng(Date.now() % 9973)); setBank(); } }));
        wrap.appendChild(row);
      }
      wrap.appendChild(el('div', { class: 'hint', text: 'Lista che vede lo studente: ' + (d.wordBank || []).join(' · ') }));
    }
    if (ex.type === 'gap' || ex.type === 'gapbank') {
      wrap.appendChild(el('div', { class: 'hint', text: 'Tocca le parole da nascondere (almeno tre):' }));
      const chips = el('div', { class: 'chips' });
      d.tokens.forEach(function (t, i) {
        const c = el('span', { class: 'chip' + (d.gapIndices.indexOf(i) !== -1 ? ' gap' : ''), text: t });
        c.addEventListener('click', function () {
          const k = d.gapIndices.indexOf(i);
          if (k !== -1) { if (d.gapIndices.length === 1) return toast('Serve almeno uno spazio'); d.gapIndices.splice(k, 1); }
          else d.gapIndices.push(i);
          d.gapIndices.sort(function (a, b) { return a - b; });
          d.answers = d.gapIndices.map(function (j) { return toks[j] ? toks[j].core : d.tokens[j]; });
          if (ex.type === 'gapbank') d.wordBank = EX.shuffle(d.answers.concat(d.distractors || []), L.rng(Date.now() % 10000));
          touch(ls); renderEditorBody();
        });
        chips.appendChild(c);
      });
      wrap.appendChild(chips);
    } else if (ex.type === 'scramble') {
      wrap.appendChild(el('div', { class: 'row' }, el('span', { class: 'hint', text: 'Ordine mescolato: ' + d.shuffled.join(' · ') }),
        el('button', { class: 'small', text: 'Rimescola', onclick: function () { rebuildExercise(ls, ex, 'scramble'); touch(ls); renderEditorBody(); } })));
    } else if (ex.type === 'missing') {
      const sel = el('select', { style: 'width:auto' });
      d.tokens.forEach(function (t, i) { sel.appendChild(el('option', { value: String(i), text: t, selected: i === d.missingIndex ? 'selected' : null })); });
      sel.addEventListener('change', function () { d.missingIndex = parseInt(sel.value, 10); d.answer = toks[d.missingIndex] ? toks[d.missingIndex].core : d.tokens[d.missingIndex]; touch(ls); renderEditorBody(); });
      wrap.appendChild(el('div', { class: 'row' }, el('span', { class: 'hint', text: 'Parola da togliere:' }), sel));
    } else if (ex.type === 'extra') {
      const inp = el('input', { type: 'text', class: 'short', value: d.extraWord });
      const sel = el('select', { style: 'width:auto' });
      d.original.forEach(function (t, i) { sel.appendChild(el('option', { value: String(i), text: t, selected: i === d.extraIndex - 1 ? 'selected' : null })); });
      const apply = function () {
        if (!rebuildExercise(ls, ex, 'extra', { extraWord: inp.value.trim() || d.extraWord, extraAfter: parseInt(sel.value, 10) })) return toast('Non applicabile');
        touch(ls); renderEditorBody();
      };
      inp.addEventListener('change', apply); sel.addEventListener('change', apply);
      wrap.appendChild(el('div', { class: 'row' }, el('span', { class: 'hint', text: 'Parola in più:' }), inp, el('span', { class: 'hint', text: 'inserita dopo:' }), sel));
    } else if (ex.type === 'mc') {
      // scelta multipla: domanda + 4 opzioni; "tricky" = una risposta ingannevole; "✨ Genera" le scrive il modello
      if (!d.options) d.options = ['', '', '', ''];
      while (d.options.length < 4) d.options.push('');
      const q = el('input', { type: 'text', value: d.question || '', placeholder: 'Domanda per lo studente (nella lingua del video)' });
      q.addEventListener('change', function () { d.question = q.value.trim(); touch(ls); renderEditorBody(); });
      wrap.appendChild(el('label', { text: 'Domanda' })); wrap.appendChild(q);
      const list = el('div', { class: 'mc-edit' });
      d.options.forEach(function (o, k) {
        const radio = el('input', { type: 'radio', name: 'mc-' + ex.id, title: 'Risposta giusta' }); radio.checked = k === d.correct;
        radio.addEventListener('change', function () { d.correct = k; if (d.tricky === k) d.tricky = null; touch(ls); renderEditorBody(); });
        const inp = el('input', { type: 'text', value: o, placeholder: 'Opzione ' + (k + 1) });
        inp.addEventListener('change', function () { d.options[k] = inp.value.trim(); if (d.tricky === k) d.tricky = null; touch(ls); renderEditorBody(); });
        list.appendChild(el('div', { class: 'mc-row' }, radio, inp, d.tricky === k ? el('span', { class: 'badge', title: 'Risposta ingannevole scritta dal modello', text: 'tricky' }) : el('span')));
      });
      wrap.appendChild(list);
      const genRow = el('div', { class: 'row', style: 'margin-top:6px' });
      if (S.settings.apiKey) {
        const context = (ls.chunks || []).filter(function (c) { return Math.abs((c.start + c.end) / 2 - ex.markerTime) < 60; }).map(function (c) { return c.text; }).join(' ');
        genRow.appendChild(el('button', { class: 'small', text: '✨ Genera domanda e risposte (AI)', onclick: function (e) {
          e.target.disabled = true; e.target.textContent = '… chiedo al modello';
          AI.generateMC({ sentence: ex.sentence, context: context, lang: ls.lang, level: ls.level, tricky: false, apiKey: S.settings.apiKey, model: S.settings.model })
            .then(function (r) { d.question = r.question; d.options = r.options; d.correct = r.correct; d.tricky = null; touch(ls); renderEditorBody(); toast('Domanda generata' + (r.ai && r.ai.cost != null ? ' · ' + (r.ai.cost * 100).toFixed(1) + ' cent' : '')); })
            .catch(function (err) { toast('AI: ' + err.message, 6000); renderEditorBody(); });
        } }));
        // su richiesta: il modello sostituisce una risposta sbagliata con una ingannevole
        genRow.appendChild(el('button', { class: 'small', text: '😈 Aggiungi una risposta tricky (AI)', title: 'Il modello sostituisce una delle risposte sbagliate con una fatta apposta per confondere', onclick: function (e) {
          if (!d.question || d.options.filter(Boolean).length < 2) return toast('Prima serve una domanda con le risposte');
          e.target.disabled = true; e.target.textContent = '… chiedo al modello';
          AI.makeTricky({ question: d.question, options: d.options, correct: d.correct, sentence: ex.sentence, context: context, lang: ls.lang, level: ls.level, apiKey: S.settings.apiKey, model: S.settings.model })
            .then(function (r) { d.options[r.index] = r.option; d.tricky = r.index; touch(ls); renderEditorBody(); toast('Risposta tricky inserita al posto della ' + (r.index + 1) + (r.ai && r.ai.cost != null ? ' · ' + (r.ai.cost * 100).toFixed(1) + ' cent' : '')); })
            .catch(function (err) { toast('AI: ' + err.message, 6000); renderEditorBody(); });
        } }));
      } else {
        genRow.appendChild(el('span', { class: 'hint', text: 'Con una chiave API (Impostazioni AI) il modello scrive domanda e risposte, e su richiesta una risposta "tricky".' }));
      }
      wrap.appendChild(genRow);
      if (!d.question || d.options.filter(Boolean).length < 2) wrap.appendChild(el('div', { class: 'notice warn', text: 'Scrivi la domanda e almeno due risposte: finché mancano, lo studente non vedrà questo esercizio.' }));
    } else if (ex.type === 'wrong') {
      const sel = el('select', { style: 'width:auto' });
      d.original.forEach(function (t, i) { sel.appendChild(el('option', { value: String(i), text: t, selected: i === d.wrongIndex ? 'selected' : null })); });
      const inp = el('input', { type: 'text', class: 'short', value: d.wrongWord });
      const apply = function () {
        const idx = parseInt(sel.value, 10);
        const word = toks[idx] ? toks[idx].core : d.original[idx];
        let repl = inp.value.trim();
        if (idx !== d.wrongIndex && repl === d.wrongWord) repl = L.swapFor(word, ls.lang) || '';
        if (!repl) return toast('Scrivi la parola sbagliata da mostrare');
        if (!rebuildExercise(ls, ex, 'wrong', { wrongWord: word, wrongReplacement: repl })) return toast('Non applicabile');
        touch(ls); renderEditorBody();
      };
      sel.addEventListener('change', apply); inp.addEventListener('change', apply);
      wrap.appendChild(el('div', { class: 'row' }, el('span', { class: 'hint', text: 'Parola giusta:' }), sel, el('span', { class: 'hint', text: 'mostrata come:' }), inp));
    }
    return wrap;
  }

  function rangeKey(range) {
    if (!range) return 'auto';
    if (range === 'smart') return 'smart';
    for (const k in G.RANGES) { const r = G.RANGES[k]; if (Array.isArray(r) && r[0] === range[0] && r[1] === range[1]) return k; }
    return 'auto';
  }
  function effRange(ex) { return G.resolveRange(ex.range, ex.type); }
  /** Clic sulla barra dell'editor: "+" per aggiungere un esercizio in quel punto, scegliendo tipo e lunghezza. */
  function showAddPopover(ls, t, e) {
    const tl = $('#e-timeline'); if (!tl) return;
    let pop = $('#e-add');
    if (pop) pop.remove();
    pop = el('div', { id: 'e-add', class: 'add-pop' });
    const typeSel = el('select', { style: 'width:auto', title: 'Tipo di esercizio' });
    G.ALL_TYPES.forEach(function (ty) { typeSel.appendChild(el('option', { value: ty, text: EX.LABELS[ty].replace(/\s*\(.*\)$/, '') })); });
    const first = (ls.params && ls.params.types && ls.params.types[0]) || 'gap';
    typeSel.value = first;
    const rangeSel = el('select', { style: 'width:auto', title: 'Lunghezza della frase' });
    [['smart', 'lunghezza consigliata'], ['20-30', '20-30 parole'], ['10-15', '10-15 parole'], ['5-10', '5-10 parole'], ['30-40', '30-40 parole'], ['auto', 'frase singola']].forEach(function (o) { rangeSel.appendChild(el('option', { value: o[0], text: o[1] })); });
    pop.appendChild(el('span', { class: 'lbl', text: '＋ Esercizio a ' + fmt(t) }));
    pop.appendChild(typeSel);
    pop.appendChild(rangeSel);
    pop.appendChild(el('button', { class: 'small primary', text: 'Aggiungi', onclick: function () { addExerciseAt(ls, t, typeSel.value, rangeSel.value); } }));
    pop.appendChild(el('button', { class: 'small', text: '✕', title: 'Chiudi', onclick: function () { pop.remove(); } }));
    const r = tl.getBoundingClientRect();
    const x = e && e.clientX != null ? e.clientX - r.left : r.width * t / (ls.duration || 1);
    pop.style.left = Math.max(0, Math.min(x - 40, r.width - 420)) + 'px';
    tl.appendChild(pop);
  }
  function addExerciseAt(ls, t, type, rangeKey) {
    const range = rangeKey === 'auto' ? null : (G.RANGES[rangeKey] || 'smart');
    const used = usedChunkIds(ls, null);
    let ex = null;
    if (range) {
      const cands = G.passagesNear(ls.chunks || [], t, { exclude: used, type: type, lang: ls.lang, window: 30, range: range }).filter(function (p) { return !p.cta; });
      const complete = cands.filter(function (p) { return p.startsSentence && p.endsSentence; });
      const pool = complete.length ? complete : cands;
      let best = null, bestS = -1;
      pool.forEach(function (p) { const d = Math.abs((p.start + p.end) / 2 - t); const sc = p.score / (1 + d / 20); if (sc > bestS) { bestS = sc; best = p; } });
      if (best) ex = G.makeExerciseFromPassage(best, type, { lang: ls.lang, seed: Date.now() % 1000, range: range, vocab: lessonVocab(ls), distractors: 2, source: 'rules' });
      // scelta multipla: la frase è scelta qui, domanda e risposte le scrive il modello (autoMC, più sotto) o l'insegnante
    } else {
      const c = G.nearestChunk((ls.chunks || []).filter(function (c) { return !used.has(c.id); }), t);
      if (c) ex = G.makeExercise(c, type, { lang: ls.lang, seed: Date.now() % 1000, vocab: lessonVocab(ls), distractors: 2 });
    }
    if (!ex) return toast('Nessuna frase adatta vicino a ' + fmt(t) + ': prova un\'altra lunghezza o un altro punto');
    ls.exercises.push(ex); sortExercises(ls); touch(ls); renderEditorBody();
    const card = $('#ex-' + ex.id);
    if (card) { card.scrollIntoView({ behavior: 'smooth', block: 'center' }); card.classList.add('flash'); setTimeout(function () { card.classList.remove('flash'); }, 1500); }
    toast('Esercizio ' + (ls.exercises.indexOf(ex) + 1) + ' aggiunto a ' + fmt(ex.markerTime));
    autoMC(ls, ex);
  }
  // v82 ('voglio una funzione tipo "chiedi all'AI"... se sento una frase che mi piace e voglio metterci un esercizio'):
  // l'AI cerca nella trascrizione la frase che corrisponde alla richiesta e sceglie il tipo; l'esercizio lo
  // costruisce il motore a REGOLE su quella frase (l'AI non scrive testo: niente invenzioni).
  $('#e-ask').addEventListener('keydown', function (e) { if (e.key === 'Enter') { e.preventDefault(); $('#btn-ask').click(); } });
  /** v89: parole di un pezzo di trascrizione, in ordine, ciascuna col suo tempo e il suo chunk. */
  function wordsOfUnit(ls, u) {
    const out = [];
    (u.ids || []).forEach(function (id) {
      const c = (ls.chunks || []).find(function (x) { return x.id === id; });
      if (!c) return;
      const raw = String(c.text || '').split(/\s+/).filter(Boolean);
      let times = G.wordTimes(c);
      if (times.length !== raw.length) { const d = (c.end - c.start) / Math.max(1, raw.length); times = raw.map(function (w, i) { return { start: c.start + i * d, end: c.start + (i + 1) * d }; }); }
      raw.forEach(function (w, i) {
        const n = L.words(w)[0]; if (!n) return;
        out.push({ raw: w, norm: n, id: c.id, start: times[i].start, end: times[i].end });
      });
    });
    return out;
  }
  /**
   * v89 (Edoardo, 18/9: "ho chiesto un fill the gaps dalla frase che inizia con 'i più comuni' ma non è iniziata
   * da lì e mi ha messo un paragrafo! massimo 20-25 parole"): nei sottotitoli automatici una "frase" può essere
   * un paragrafo di cento parole, e prima diventava tale e quale l'esercizio. Ora dal pezzo scelto si RITAGLIA
   * una finestra da esercizio: si parte dalle parole citate dal modello (o dall'insegnante) e si chiude alla
   * prima punteggiatura utile, comunque mai oltre MAX parole.
   */
  function carveAsk(words, quote, opts) {
    const MIN = (opts && opts.min) || 12, MAX = (opts && opts.max) || 25;
    if (words.length <= MAX) return { from: 0, to: words.length };
    const q = L.words(quote || '');
    let from = -1;
    for (let need = Math.min(q.length, 5); need >= 2 && from === -1; need--) {
      for (let i = 0; i + need <= words.length; i++) {
        let ok = true;
        for (let k = 0; k < need; k++) { if (words[i + k].norm !== q[k]) { ok = false; break; } }
        if (ok) { from = i; break; }
      }
    }
    if (from === -1) from = 0;
    if (from + MIN > words.length) from = Math.max(0, words.length - MAX);
    // fine: l'ultima punteggiatura forte dentro la finestra, altrimenti la finestra piena
    const limite = Math.min(words.length, from + MAX);
    let to = limite;
    for (let j = limite - 1; j >= from + MIN; j--) {
      if (/[.!?…]$/.test(words[j].raw)) { to = j + 1; break; }
      if (to === limite && /[,;:]$/.test(words[j].raw)) to = j + 1;   // ripiego: una virgola è meglio di un taglio secco
    }
    return { from: from, to: to };
  }
  $('#btn-ask').addEventListener('click', function () {
    const ls = current(); if (!ls) return;
    const req = $('#e-ask').value.trim();
    if (!req) { $('#e-ask').focus(); return toast('Scrivi cosa cerchi: la frase che hai sentito, o l\'argomento'); }
    if (!S.settings.apiKey) return toast('Serve la chiave API: "Impostazioni AI" in alto', 4000);
    const units = G.cutUnits(ls.chunks || []).filter(function (u) { return !u.silence; });
    if (!units.length) return toast('Questa lezione non ha la trascrizione');
    const textOf = function (u) { return u.ids.map(function (id) { const c = (ls.chunks || []).find(function (x) { return x.id === id; }); return c ? c.text : ''; }).filter(Boolean).join(' '); };
    const btn = $('#btn-ask'); const old = btn.textContent; btn.disabled = true; busyMsg(btn, 'Cerco la frase…');
    AI.askExercise({ sentences: units.map(function (u, i) { return { n: i + 1, text: textOf(u) }; }), request: req, lang: ls.lang, apiKey: S.settings.apiKey, model: S.settings.model })
      .then(function (r) {
        const u = units[r.index - 1];
        if (!u) throw new Error('l\'AI non ha trovato una frase adatta');
        // v89: dal pezzo si ritaglia una finestra da esercizio (mai un paragrafo intero)
        const ww = wordsOfUnit(ls, u);
        if (!ww.length) throw new Error('quel pezzo di trascrizione non ha parole con i tempi');
        const win = carveAsk(ww, r.quote || req, { min: 12, max: 25 });
        const pick = ww.slice(win.from, win.to);
        const text = pick.map(function (w) { return w.raw; }).join(' ').replace(/\s+([,.;:!?…])/g, '$1').trim();
        const ids = []; pick.forEach(function (w) { if (ids.indexOf(w.id) === -1) ids.push(w.id); });
        const p = { start: pick[0].start, end: pick[pick.length - 1].end, text: text, chunkIds: ids, wordCount: pick.length, startsSentence: true, endsSentence: true };
        const ex = G.makeExerciseFromPassage(p, r.type, { lang: ls.lang, seed: Date.now() % 1000, vocab: lessonVocab(ls), distractors: 2, source: 'rules' });
        if (!ex) throw new Error('su quella frase non riesco a costruire un esercizio');
        ls.exercises.push(ex); sortExercises(ls); touch(ls); renderEditorBody();
        $('#e-ask').value = '';
        const card = $('#ex-' + ex.id);
        if (card) { card.scrollIntoView({ behavior: 'smooth', block: 'center' }); card.classList.add('flash'); setTimeout(function () { card.classList.remove('flash'); }, 1500); }
        toast('Esercizio ' + (ls.exercises.indexOf(ex) + 1) + ' (' + (EX.LABELS[ex.type] || ex.type) + ') a ' + fmt(ex.markerTime) + ' su: «' + text.slice(0, 60) + (text.length > 60 ? '…' : '') + '»', 4500);
      })
      .catch(function (e) { toast('Non ci sono riuscito: ' + e.message, 4500); })
      .finally(function () { btn.disabled = false; btn.textContent = old; });
  });
  function usedChunkIds(ls, except) {
    const used = new Set();
    ls.exercises.forEach(function (e) { if (e === except) return; (e.chunkIds || [e.chunkId]).forEach(function (id) { used.add(id); }); });
    return used;
  }
  /** Candidati per un esercizio: passaggi nell'intervallo scelto, oppure chunk singoli (auto). Ordinati per tempo. */
  function candidatesFor(ls, ex) {
    const used = usedChunkIds(ls, ex);
    const r = effRange(ex);
    if (r) {
      return G.passages(ls.chunks || [], { min: r[0], max: r[1], lang: ls.lang })
        .filter(function (p) { return !p.cta && (p.startsSentence || p.endsSentence) && !p.chunkIds.some(function (id) { return used.has(id); }); })
        .sort(function (a, b) { return b.score - a.score; }).slice(0, 60)
        .sort(function (a, b) { return a.start - b.start; });
    }
    return (ls.chunks || []).filter(function (c) { return !c.silence && c.exScore > 0 && !c.cta && !used.has(c.id); })
      .sort(function (a, b) { return b.exScore - a.exScore; }).slice(0, 60)
      .sort(function (a, b) { return a.start - b.start; })
      .map(function (c) { return { start: c.start, end: c.end, text: c.text, chunkIds: [c.id], wordCount: c.wordCount, chunk: c }; });
  }
  /** Scelta multipla con frase nuova: se c'è la chiave, domanda e risposte le scrive subito il modello (l'ordine delle risposte è mescolato). */
  function autoMC(ls, ex, tricky) {
    if (ex.type !== 'mc' || (ex.data && ex.data.question)) return;
    if (!S.settings.apiKey) return toast('Scelta multipla: scrivi domanda e risposte (con la chiave AI le scrive il modello)', 4000);
    const context = (ls.chunks || []).filter(function (c) { return Math.abs((c.start + c.end) / 2 - ex.markerTime) < 60; }).map(function (c) { return c.text; }).join(' ');
    const sentence = ex.sentence;
    toast('Scelta multipla: chiedo domanda e risposte al modello…', 2500);
    AI.generateMC({ sentence: sentence, context: context, lang: ls.lang, level: ls.level, tricky: tricky == null ? !!(ls.params && ls.params.tricky) : !!tricky, apiKey: S.settings.apiKey, model: S.settings.model })
      .then(function (r) {
        if (ex.type !== 'mc' || ex.sentence !== sentence) return;   // nel frattempo l'insegnante ha cambiato ancora
        ex.data = { question: r.question, options: r.options, correct: r.correct, tricky: r.tricky }; touch(ls);
        if (S.view === 'editor') renderEditorBody();
        toast('Domanda a scelta multipla generata' + (r.ai && r.ai.cost != null ? ' · ' + (r.ai.cost * 100).toFixed(1) + ' cent' : ''));
      })
      .catch(function (err) { toast('AI: ' + err.message, 6000); });
  }
  function applyCandidate(ls, ex, p) {
    const bo = { lang: ls.lang, seed: Date.now() % 1000, source: 'rules', range: ex.range, vocab: lessonVocab(ls), distractors: gapExtraCount(ex) };
    const nx = p.chunk ? G.makeExercise(p.chunk, ex.type, bo) : G.makeExerciseFromPassage(p, ex.type, bo);
    if (!nx) return toast('Frase non adatta a questo tipo di esercizio');
    ex.chunkId = nx.chunkId; ex.chunkIds = nx.chunkIds || [nx.chunkId]; ex.sentence = nx.sentence; ex.segment = nx.segment; ex.markerTime = nx.markerTime; ex.type = nx.type; ex.data = nx.data; ex.source = 'rules'; ex.note = '';
    if (!ex.range) delete ex.range;
    sortExercises(ls); touch(ls); renderEditorBody();
    autoMC(ls, ex);
    const card = $('#ex-' + ex.id); if (card) card.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }
  function altSentence(ls, ex) {
    if (effRange(ex)) {
      const used = usedChunkIds(ls, ex);
      (ex.chunkIds || [ex.chunkId]).forEach(function (id) { used.add(id); });
      const alts = G.passagesNear(ls.chunks || [], ex.markerTime, { exclude: used, type: ex.type, lang: ls.lang, window: 90, range: ex.range }).filter(function (p) { return !p.cta; });
      if (!alts.length) return toast('Nessun\'altra frase di questa lunghezza nei dintorni: allarga l\'intervallo o scegli dall\'elenco');
      const k = (S.editor.altIdx[ex.id] || 0) % alts.length;
      S.editor.altIdx[ex.id] = k + 1;
      return applyCandidate(ls, ex, alts[k]);
    }
    const used = new Set(ls.exercises.filter(function (e) { return e !== ex; }).map(function (e) { return e.chunkId; }));
    used.add(ex.chunkId);
    const alts = G.alternatives(ls.chunks || [], ex.markerTime, { exclude: used, type: ex.type, lang: ls.lang, window: 75 });
    if (!alts.length) return toast('Nessun\'altra frase adatta nei dintorni');
    const k = (S.editor.altIdx[ex.id] || 0) % alts.length;
    S.editor.altIdx[ex.id] = k + 1;
    const c = alts[k];
    const nx = G.makeExercise(c, ex.type, { lang: ls.lang, seed: Date.now() % 1000, source: 'rules' });
    if (!nx) return toast('Frase non adatta');
    ex.chunkId = nx.chunkId; ex.sentence = nx.sentence; ex.segment = nx.segment; ex.markerTime = nx.markerTime; ex.type = nx.type; ex.data = nx.data; ex.source = 'rules'; ex.note = '';
    sortExercises(ls); touch(ls); renderEditorBody();
    autoMC(ls, ex);
  }

  /** v91 (Edoardo: "rendi le forbici cliccabili, se clicco sulla prima mi rimanda sotto al primo taglio e me lo
   *  illumina 2 volte tipo flash"): dal numero sulla barra alla riga che si modifica. */
  function focusCut(i) {
    const row = document.getElementById('cut-row-' + i);
    if (!row) return;
    row.scrollIntoView({ behavior: 'smooth', block: 'center' });
    row.classList.remove('flash');
    void row.offsetWidth;                       // riavvia l'animazione anche al secondo clic sullo stesso taglio
    row.classList.add('flash');
    setTimeout(function () { row.classList.remove('flash'); }, 1500);
  }
  /** v93: il viaggio inverso — dal numero nella lista alla banda sulla barra, che si illumina due volte. */
  function focusCutOnBar(i) {
    const tl = $('#e-timeline'); if (!tl) return;
    tl.scrollIntoView({ behavior: 'smooth', block: 'center' });
    const pezzi = [tl.querySelectorAll('.cut')[i], tl.querySelectorAll('.cut-n')[i]];
    pezzi.forEach(function (n) {
      if (!n) return;
      n.classList.remove('flash');
      void n.offsetWidth;                       // riavvia l'animazione anche al secondo clic
      n.classList.add('flash');
      setTimeout(function () { n.classList.remove('flash'); }, 1500);
    });
  }
  function renderCutRow(ls, c, i) {
    return el('div', { class: 'cut-row', id: 'cut-row-' + i, style: cutColorStyle(i) },
      el('button', { type: 'button', class: 'cut-tag', text: '✄' + (i + 1), title: 'Questo taglio è il ✄' + (i + 1) + ' sulla barra del tempo: clicca per vederlo lassù', onclick: function () { focusCutOnBar(i); } }),
      timeInput(c.start, function (t) { c.start = t; touch(ls); renderEditorBody(); }),
      timeInput(c.end, function (t) { c.end = t; touch(ls); renderEditorBody(); }),
      el('span', { class: 'hint', text: fmtMin(c.end - c.start) + ' · ' + (c.reason || '') + (c.source === 'ai' ? ' (AI)' : '') }),
      el('div', { class: 'cut-btns' },
        el('button', { class: 'small', text: '▶ Giunzione', title: 'Ascolta il punto di giunzione: 3 secondi prima del taglio, salto, 3 secondi dopo', onclick: function () { previewCut(ls, c); } }),
        // taglio "da qui alla fine": la coda del video (saluti, iscriviti al canale) si toglie senza cercare il secondo esatto
        el('button', { class: 'small', text: '⇥ Fino alla fine', title: 'Porta la fine di questo taglio alla fine del video', onclick: function () {
          if (!(ls.duration > 0)) return toast('Durata del video non ancora nota');
          if (Math.abs(c.end - ls.duration) < 0.05) return toast('Questo taglio arriva già alla fine del video');
          c.end = Math.round(ls.duration * 10) / 10;
          touch(ls); renderEditorBody();
          toast('Taglio fino alla fine: da ' + fmt(c.start) + ' a ' + fmt(c.end) + ' · annulla con ' + undoKeyLabel(), 4500);
        } }),
        el('button', { class: 'small', text: '⇤⇥ Frasi intere', title: 'Allinea inizio e fine del taglio ai confini delle frasi della trascrizione', onclick: function () {
          const sn = ls.chunks && ls.chunks.length ? G.snapCutToSentences(c, ls.chunks, { tol: 1.5, min: 2, duration: ls.duration }) : null;
          if (!sn) return toast('Nessuna frase intera dentro questo taglio');
          if (Math.abs(sn.start - c.start) < 0.05 && Math.abs(sn.end - c.end) < 0.05) return toast('Già allineato alle frasi');
          c.start = sn.start; c.end = sn.end; touch(ls); renderEditorBody(); toast('Taglio allineato: da ' + fmt(c.start) + ' a ' + fmt(c.end));
        } }),
        el('button', { class: 'small danger', text: 'Rimuovi', onclick: function () { ls.cuts.splice(i, 1); touch(ls); renderEditorBody(); undoBarFor('taglio ' + fmt(c.start) + '–' + fmt(c.end)); } }))
    );
  }

  // rigenera
  $('#btn-regenerate').addEventListener('click', function () {
    const ls = current(); const p = ls.params || {};
    $('#r-nauto').checked = p.n === 'auto' || !p.n;
    $('#r-n').disabled = $('#r-nauto').checked;
    $('#r-n').value = p.n > 0 ? p.n : 10;
    $('#r-target').value = fmtMin(p.target || ls.duration);
    $$('#r-types input[value]').forEach(function (i) { i.checked = !p.types || p.types.indexOf(i.value) !== -1; }); $('#r-tricky').checked = !!p.tricky;
    $('#r-ai').checked = !!S.settings.apiKey && (p.ai !== false);
    $('#r-words').value = rangeKey(p.range);
    $('#r-focus').value = p.focus || '';
    $('#dlg-regen').showModal();
  });
  $('#r-close').addEventListener('click', function () { $('#dlg-regen').close(); });
  $('#r-go').addEventListener('click', function () {
    const ls = current();
    const types = $$('#r-types input[value]:checked').map(function (i) { return i.value; });
    if (!types.length) return toast('Scegli almeno un tipo');
    let target = L.parseTime($('#r-target').value);
    if (isNaN(target) || target <= 0 || target > ls.duration) target = ls.duration;
    ls.params = Object.assign({}, ls.params, { tricky: $('#r-tricky').checked, n: $('#r-nauto').checked ? 'auto' : Math.max(1, parseInt($('#r-n').value, 10) || 10), target: target, types: types, range: G.RANGES[$('#r-words').value] || null, ai: $('#r-ai').checked, focus: $('#r-focus').value.trim() });
    $('#dlg-regen').close();
    overlay(true);
    generate(ls, ls.params.ai).then(function () { overlay(false); renderEditorBody(); toast('Bozza rigenerata'); })
      .catch(function (e) { overlay(false); toast('Errore: ' + e.message); });
  });

  // condivisione (v78: apribile anche dalla card del portfolio col tasto Condividi, senza passare dall'editor)
  function openShare(ls) {
    if (!ls) return;
    const base = location.origin + location.pathname;
    const payload = JSON.stringify(studentPayload(ls));
    const hashLink = base + '#d=' + b64url(payload);
    const fileLink = base + '?lesson=' + slugify(ls.title);
    $('#share-hash').textContent = hashLink;
    $('#share-file').textContent = fileLink + '   ← richiede il file lessons/' + slugify(ls.title) + '.json nel repo';
    $('#share-copy-hash').onclick = function () { copyText(hashLink); };
    $('#share-copy-file').onclick = function () { copyText(fileLink); };
    $('#share-download').onclick = function () { download(slugify(ls.title) + '.json', JSON.stringify(studentPayload(ls), null, 1)); };
    $('#dlg-share').showModal();
  }
  $('#btn-share').addEventListener('click', function () { openShare(current()); });
  $('#share-close').addEventListener('click', function () { $('#dlg-share').close(); });
  /* v115: il dialogo che spiega perché l'editor è bloccato senza account, e incentiva l'accesso invece di limitarsi
     a impedire il click. "Accedi ora" chiude questo dialogo e apre subito quello di login (#btn-account), così
     l'insegnante non deve prima chiudere e poi cercare da sola il pulsante in alto. */
  function openEditLockedDialog(ls) {
    $('#el-title').textContent = 'Accedi per modificare' + (ls && ls.title ? ' "' + ls.title + '"' : '');
    $('#dlg-edit-locked').showModal();
  }
  $('#el-login').addEventListener('click', function () { $('#dlg-edit-locked').close(); $('#btn-account').click(); });
  $('#el-close').addEventListener('click', function () { $('#dlg-edit-locked').close(); });

  // impostazioni
  $('#btn-settings').addEventListener('click', function () {
    $('#set-key').value = S.settings.apiKey || '';
    $('#set-model').value = S.settings.model || AI.DEFAULT_MODEL;
    $('#set-pexels').value = S.settings.pexelsKey || '';
    $('#set-unsplash').value = S.settings.unsplashKey || '';
    $('#set-status').textContent = '';
    $('#dlg-settings').showModal();
  });
  $('#set-close').addEventListener('click', function () { $('#dlg-settings').close(); });
  $('#set-save').addEventListener('click', function () {
    S.settings.apiKey = $('#set-key').value.trim(); S.settings.model = $('#set-model').value; S.settings.pexelsKey = $('#set-pexels').value.trim(); S.settings.unsplashKey = $('#set-unsplash').value.trim(); saveSettings();
    $('#dlg-settings').close(); toast(S.settings.apiKey ? 'Chiave salvata in questo browser' : 'Chiave rimossa');
    if (S.view === 'new') { $('#f-ai').checked = !!S.settings.apiKey; $('#f-ai-status').textContent = S.settings.apiKey ? 'chiave salvata · modello ' + S.settings.model : 'nessuna chiave'; }
  });
  $('#set-test').addEventListener('click', function () {
    const key = $('#set-key').value.trim(); const model = $('#set-model').value;
    if (!key) return ($('#set-status').textContent = 'Inserisci la chiave.');
    $('#set-status').textContent = 'Provo…';
    AI.testKey(key, model).then(function (r) { $('#set-status').textContent = '✓ Funziona (' + (r.model || model) + ')'; })
      .catch(function (e) { $('#set-status').textContent = '⚠ ' + e.message; });
  });

  // ---------- STUDENTE ----------
  function openStudent(id, fromEditor, lessonObj) {
    const ls = migrateLesson(lessonObj || S.lessons[id]);
    if (!ls) return renderHome();
    document.body.classList.toggle('standalone', !!S.standalone);
    S.currentId = ls.id;
    // lock: con la barra bloccata non si va oltre un esercizio da fare; di default la barra è libera (chi guida il video decide)
    S.student = { lesson: ls, done: new Set(), results: {}, blocked: false, replay: null, activeId: null, started: false, ended: false, attempts: {}, hints: {}, lock: !!(ls.options && ls.options.lock), phase: 'start', stars: {} };   // stelle: da zero a ogni apertura
    show('student');
    $('#s-stage').classList.remove('cards');
    panelTheme(null);
    $('#s-title').textContent = ls.title || '';
    $('#btn-edit').style.display = (!S.standalone && S.lessons[ls.id]) ? '' : 'none';
    $('#s-lock').checked = S.student.lock;
    $('#s-lock-label').style.display = S.standalone ? 'none' : '';
    $('#s-cover').checked = !!coverState(ls).on;
    $('#s-cover-label').style.display = S.standalone ? 'none' : '';
    updateStarCount();
    renderStudentTimeline();
    renderProgress();
    // v95 (Edoardo: "se clicco su comandi youtube diventa tutto nero il video e si blocca... togli il pulsante"):
    // la casella non c'è più e i comandi di YouTube restano SEMPRE spenti. Ricreare il player al volo lasciava
    // l'API di YouTube in uno stato sporco e il nuovo player non partiva: meno superficie, meno rotture.
    createPlayer($('#s-player'), ls.videoId, { lesson: ls, controls: false, onError: function (code) { toast(ytErrorText(code), 6000); }, onState: function (st) { if (st === 0) onEnded(); } })
      .then(function () { startLoop(); renderStart(); renderCover($('#s-player'), ls); })
      .catch(function (e) { $('#s-panel').innerHTML = ''; $('#s-panel').appendChild(el('div', { class: 'notice bad', text: e.message })); });
  }
  $('#btn-edit').addEventListener('click', function () { if (S.player) S.player.pause(); openEditor(S.currentId); });
  $('#s-lock').addEventListener('change', function () { if (S.student) S.student.lock = $('#s-lock').checked; });
  $('#btn-fullscreen').addEventListener('click', function () {
    const w = $('#s-wrap');
    if (document.fullscreenElement) { document.exitFullscreen(); return; }
    if (w.requestFullscreen) w.requestFullscreen().catch(function () { toast('Schermo intero non disponibile in questo browser'); });
    else if (w.webkitRequestFullscreen) w.webkitRequestFullscreen();
    else toast('Schermo intero non disponibile in questo browser');
  });
  document.addEventListener('fullscreenchange', function () {
    $('#btn-fullscreen').textContent = document.fullscreenElement ? '✕ Esci da schermo intero' : '⛶ Schermo intero';
    // avvisi (toast) e zoom foto devono stare dentro l'elemento a tutto schermo, altrimenti non si vedono
    const host = document.fullscreenElement || document.body;
    ['#toast', '#undo-bar', '.img-preview'].forEach(function (sel) { const n = document.querySelector(sel); if (n && n.parentElement !== host) host.appendChild(n); });
  });

  /** Linea del tempo dello studente: clic sulla barra = vai lì; clic su un numero = ascolta la frase e apri quell'esercizio. */
  function renderStudentTimeline() {
    const st = S.student; if (!st) return;
    renderTimeline($('#s-timeline'), st.lesson, {
      done: st.done, results: st.results, activeId: st.activeId, collapseCuts: true,   // lo studente non vede i tagli: la barra è il video che resta
      // v119: se il sommario è visibile (.cards nasconde il player), mostra il video prima di cercare
      onSeek: function (t) {
        if (!S.player) return;
        var stg = $('#s-stage');
        var wasSummary = stg && stg.classList.contains('cards');
        if (wasSummary) {
          stg.classList.remove('cards');
          dock('#s-stage', false);
          $('#s-panel').innerHTML = '';
          panelTheme(null);
        }
        S.player.seek(t);
        if (wasSummary) S.player.play();
      },
      onMarker: function (ex) { goToExercise(ex); }
    });
  }
  /** Porta il video all'inizio della frase dell'esercizio e lo fa ripartire: al segnaposto si ferma e l'esercizio compare (anche se era già fatto). */
  /** Un esercizio a scelta multipla senza domanda non si può fare: viene saltato in modalità studente. */
  function exerciseReady(e) { return e.type !== 'mc' || (e.data && e.data.question && (e.data.options || []).filter(Boolean).length >= 2); }
  function goToExercise(ex) {
    const st = S.student; if (!st || !S.player) return;
    if (!exerciseReady(ex)) return toast('Questo esercizio a scelta multipla non ha ancora domanda e risposte');
    if (st.lock && !st.done.has(ex.id) && st.lesson.exercises.some(function (e) { return !st.done.has(e.id) && e.markerTime < ex.markerTime; })) {
      return toast('Barra bloccata: prima vanno fatti gli esercizi precedenti (togli il blocco per saltare)');
    }
    // un esercizio già fatto resta verde/rosso: lo si può rifare (st.redo) senza perdere il risultato
    st.redo = ex.id;
    st.blocked = false; st.activeId = null; st.replay = null; st.started = true;
    panelTheme(null);
    $('#s-panel').innerHTML = '';
    dock('#s-stage', false);
    renderStudentTimeline(); renderProgress();
    st.lastT = null;
    S.player.seek(Math.max(0, Math.min(ex.segment.start - 0.3, ex.markerTime - 0.5)));
    S.player.play();
  }

  function renderProgress() {
    const st = S.student; const box = $('#s-progress'); box.innerHTML = '';
    st.lesson.exercises.forEach(function (ex, i) {
      const r = st.results[ex.id];
      box.appendChild(el('div', { class: 'dot' + (r ? (r.correct ? ' ok' : ' bad') : '') + (st.activeId === ex.id ? ' cur' : ''), text: String(i + 1), title: EX.LABELS[ex.type] + ' · clicca per andarci', onclick: function () { goToExercise(ex); } }));
    });
  }
  function dock(stageSel, on) {
    const st = $(stageSel); if (!st) return;
    st.classList.toggle('docked', !!on);
    const pb = st.querySelector('.player-box');
    if (!on && pb) { pb.style.height = ''; pb.classList.remove('fitting'); }
    if (on) fitStage(st);
  }
  /** Con l'esercizio sotto al video, il video si restringe (mai sotto 200 px) quanto basta perché tutto stia senza scorrere. */
  function fitStage(stage) {
    if (!stage || !stage.classList.contains('docked') || stage.classList.contains('cards') || window.innerWidth <= 720) return;
    const pb = stage.querySelector('.player-box'), pop = stage.querySelector('.pop'); if (!pb || !pop) return;
    const H = stage.clientHeight, W = stage.clientWidth; if (!H) return;
    const top = parseFloat(getComputedStyle(pb).marginTop) || 0;
    const prev = pop.style.cssText;
    pop.style.flex = '0 0 auto'; pop.style.height = 'auto'; pop.style.overflow = 'visible';
    const need = pop.offsetHeight;   // altezza naturale del contenuto
    pop.style.cssText = prev;
    const maxH = Math.min(Math.floor(H * 0.54), Math.floor(W * 9 / 16));
    const ph = Math.max(Math.min(200, maxH), Math.min(maxH, H - top - need - 6));
    if (Math.abs(ph - pb.offsetHeight) >= 2) pb.style.height = ph + 'px';
    requestAnimationFrame(function () { pb.classList.add('fitting'); });
  }
  (function () {
    // qualunque cambiamento nel pop (risposta, "Giusto!", frase completa, traduzione) rimisura lo stage
    let raf = 0;
    const schedule = function () { if (raf) return; raf = requestAnimationFrame(function () { raf = 0; $$('.stage.docked').forEach(fitStage); const ls = S.student ? S.student.lesson : current(); if (ls) refreshStarMarks(ls); }); };
    if (window.MutationObserver) {
      const mo = new MutationObserver(schedule);
      ['#s-panel', '#e-pop'].forEach(function (sel) { const n = $(sel); if (n) mo.observe(n, { childList: true, subtree: true, characterData: true, attributes: true, attributeFilter: ['class', 'style'] }); });
    }
    window.addEventListener('resize', schedule);
    document.addEventListener('fullscreenchange', function () { setTimeout(schedule, 50); });
  })();
  /** Schermata iniziale: il video resta grande; "▶ Inizia" (o il play del player) fa partire la lezione. */
  function renderStart() {
    const st = S.student; const p = $('#s-panel'); p.innerHTML = '';
    const ls = st.lesson;
    dock('#s-stage', false);
    const b = $('#btn-start');
    b.style.display = '';
    b.textContent = '▶ Inizia · ' + ls.exercises.length + ' esercizi · ' + fmtMin(G.effectiveDuration(ls.cuts, ls.duration));
    b.title = 'Il video si ferma da solo a ogni esercizio: l\'esercizio compare al posto del video, che resta nell\'angolo. Cliccando un numero vai subito a quell\'esercizio.';
  }
  function startPlayback() {
    const st = S.student; if (!st || !S.player) return;
    const ls = st.lesson;
    st.started = true; st.lastT = null; st.phase = 'video';
    $('#btn-start').style.display = 'none';
    panelTheme(null);
    $('#s-panel').innerHTML = '';
    $('#s-stage').classList.remove('cards');
    dock('#s-stage', false);
    const c = G.inCut(ls.cuts, S.player.time());
    if (c && !ls.exercises.some(function (e) { return !st.done.has(e.id) && e.markerTime >= c.start && e.markerTime <= c.end; })) S.player.seek(c.end + 0.05);
    S.player.play();
  }
  $('#btn-start').addEventListener('click', beginLesson);
  /** "Inizia": segue la struttura della lezione (ls.flow): schede, video con esercizi e "Parliamone" nell'ordine scelto dall'insegnante. */
  /**
   * SPOT CONSUMATO DURANTE LE SCHEDE (v64, 'io voglio che funzioni anche per le persone che non hanno youtube premium').
   * L'app non puo' bloccare gli annunci (termini YouTube); puo' pero' scegliere QUANDO farli passare: all'avvio del
   * percorso, se prima del video ci sono schede/Parliamone/attivita', il video parte in MUTO in un riquadro piccolo
   * ma visibile (il player non si copre e non si nasconde mentre suona: policy) — un eventuale pre-roll gira li'.
   * Quando parte il contenuto vero: pausa, torna a 0, audio riacceso, riquadro via. Cosi' il primo esercizio non
   * viene interrotto. Il tick durante il warm non disegna ne' fa scattare niente (i tempi dello spot non sono tempi).
   */
  function warmupAd(ls, st) {
    if (!S.player || S.player.kind !== 'yt') return;
    if (ls.options && ls.options.eatAd === false) return;
    if (st.phase !== 'cards' && st.phase !== 'talk' && st.phase !== 'act') return;   // il video e' la prima sezione: parte comunque adesso
    st.warmAd = { at: Date.now(), seen: false };
    // v93 (Edoardo: "quando clicco su inizia si apre per mezzo secondo il video in basso a destra... non vorrei
    // vedere questa cosa"): il riquadro NON si mostra subito. Nasce trasparente e diventa visibile solo se uno
    // spot c'è davvero (classe 'adon', messa dal tick quando inAd è vero). Senza spot il warm-up finisce prima
    // e non si vede niente. Il player NON viene mai nascosto mentre uno spot è in corso: è trasparente solo
    // nella frazione di secondo in cui ancora non si sa se lo spot ci sia.
    $('#s-stage').classList.add('warmad');
    S.player.mute();
    S.player.seek(0);
    S.player.play();
  }
  function endWarmAd(st) {
    const w = st.warmAd; if (!w) return;
    st.warmAd = null;
    const tag = $('#warmad-tag'); if (tag) tag.remove();
    const stg = $('#s-stage'); if (stg) stg.classList.remove('warmad', 'adon');
    if (!S.player) return;
    S.player.pause();
    S.player.seek(0);
    S.player.unmute();
    if (w.seen) toast('Spot passato: il video partir\u00e0 senza interruzioni', 3500);
  }
  function beginLesson() {
    const st = S.student; if (!st || !S.player) return;
    st.queue = lessonFlow(st.lesson).slice();
    advancePhase();
    warmupAd(st.lesson, st);   // dopo advancePhase: quel ramo mette il player in pausa, il warm lo riaccende in muto
  }
  /** Prossima sezione della lezione. Coda vuota → riepilogo. Play diretto sul video (senza "Inizia"): la coda parte dalle sezioni dopo il video. */
  function advancePhase() {
    const st = S.student; if (!st || !S.player) return;
    hideImgPreview();   // un ingrandimento aperto non deve seguirti nella sezione successiva (segnalato il 3/9)
    panelTheme(null);   // il template delle schede vale solo per le schede
    if (!st.queue) { const f = lessonFlow(st.lesson); st.queue = f.slice(f.findIndex(function (s) { return s.kind === 'video'; }) + 1); }
    const step = st.queue.shift();
    if (!step) { endWarmAd(st); return renderSummary(); }
    if (step.kind === 'video') { endWarmAd(st); if (st.ended) return advancePhase(); return startPlayback(); }
    if (step.kind === 'vocab') {
      const cards = cardsFor(st.lesson);
      if (!cards.length) return advancePhase();
      st.phase = 'cards'; st.cardIdx = 0; st.cards = cards;
      $('#btn-start').style.display = 'none';
      if (!st.warmAd) S.player.pause();
      dock('#s-stage', true);
      $('#s-stage').classList.add('cards');
      renderVocabCard();
      return;
    }
    if (step.kind === 'act') {
      // attività-gioco: solo se completa, altrimenti avanti
      const act = actSection(st.lesson, step.id);
      if (!act || ACT.validate(act).length) return advancePhase();
      st.phase = 'act';
      $('#btn-start').style.display = 'none';
      if (S.player && !st.warmAd) S.player.pause();
      dock('#s-stage', true);
      $('#s-stage').classList.add('cards');
      const p = $('#s-panel'); p.innerHTML = '';
      const holder = el('div', { class: 'act-holder' });
      p.appendChild(holder);
      const nxt = st.queue[0] || null;
      const root = ACT.render(holder, act, actOpts({ onDone: function () { advancePhase(); }, doneLabel: nxt ? (nxt.kind === 'video' ? 'Guarda il video ▶' : 'Continua ▶') : 'Vai al riepilogo ▶' }));
      themeSwitcher(root, act, { fx: !st.lesson.options || st.lesson.options.fx !== false, onPick: function () { if (ownLesson(st.lesson)) touch(st.lesson); } });
      p.appendChild(el('div', { class: 'actions' }, el('button', { class: 'link', text: 'Salta questa attività', onclick: advancePhase })));
      return;
    }
    // "Parliamone": solo le domande scritte; sezione vuota → avanti
    const sec = talkSection(st.lesson, step.id);
    const qs = sec ? sec.questions.filter(function (q) { return q.text; }) : [];
    if (!qs.length) return advancePhase();
    st.phase = 'talk'; st.talkIdx = 0;
    $('#btn-start').style.display = 'none';
    renderTalk(qs, talkBefore(st.lesson, step.id));
  }
  /** Dove riprendere quando si entra nel taglio c al tempo t (fino alla frase di un esercizio da fare, se cade nel taglio). */
  function cutTarget(ls, st, c, t) {
    const inside = ls.exercises.filter(function (e) { return (!st.done.has(e.id) || e.id === st.redo) && e.markerTime > t && e.markerTime <= c.end + 0.5; })
      .sort(function (a, b) { return a.markerTime - b.markerTime; })[0];
    return inside ? Math.max(t, Math.min(c.end, inside.segment.start - 0.3)) : c.end + 0.05;
  }
  /** Studente: se un taglio comincia entro mezzo secondo, programma il salto esatto (vedi scheduleJump). */
  function armCutJump(ls, st, t) {
    const next = (ls.cuts || []).filter(function (c) { return c.start > t && c.start - t <= 0.5; }).sort(function (a, b) { return a.start - b.start; })[0];
    if (next) scheduleJump(st, next, t, function (from) { return S.student === st ? cutTarget(ls, st, next, from) : from; });
  }
  /** v176: la prima sezione "Parliamone" (con domande) che viene DOPO il video, e quante sezioni saltare per arrivarci. */
  function talkAhead(st) {
    let list = st.queue;
    if (!list) { const f = lessonFlow(st.lesson); list = f.slice(f.findIndex(function (s) { return s.kind === 'video'; }) + 1); }
    for (let i = 0; i < list.length; i++) {
      if (list[i].kind !== 'talk') continue;
      const sec = talkSection(st.lesson, list[i].id);
      if (sec && sec.questions.some(function (q) { return q.text; })) return i;
    }
    return -1;
  }
  /** v176 (Edoardo: 'voglio che durante il video ci sia il pulsante tipo "skip video" che ti fa andare direttamente alla
   *  sezione "parliamone" qualora questa sezione sia disponibile'). Compare solo a video partito e solo se dopo c'è un Parliamone. */
  function skipVideoSync() {
    const b = $('#btn-skipvideo'), st = S.student; if (!b) return;
    b.style.display = st && st.started && !st.ended && st.phase === 'video' && talkAhead(st) !== -1 ? '' : 'none';
  }
  $('#btn-skipvideo').addEventListener('click', function () {
    const b = this, st = S.student; if (!st || !S.player) return;
    // due clic: il primo arma (un tocco per sbaglio non deve far perdere il video e gli esercizi rimasti)
    if (!b.dataset.arm) { b.dataset.arm = '1'; b.textContent = 'Sicuro? Clicca ancora per saltare'; setTimeout(function () { delete b.dataset.arm; b.textContent = '⏭ Salta il video → Parliamone'; }, 3000); return; }
    delete b.dataset.arm; b.textContent = '⏭ Salta il video → Parliamone';
    const k = talkAhead(st); if (k === -1) return;
    if (!st.queue) { const f = lessonFlow(st.lesson); st.queue = f.slice(f.findIndex(function (s) { return s.kind === 'video'; }) + 1); }
    st.queue.splice(0, k);   // dritti al Parliamone: le sezioni in mezzo (giochi) si saltano
    S.player.pause();
    st.replay = null; st.blocked = false; st.activeId = null; st.endPending = false;
    $('#s-panel').innerHTML = '';
    renderStudentTimeline(); renderProgress();
    st.ended = true; st.talkIdx = 0;
    b.style.display = 'none';
    advancePhase();
  });
  function studentTick() {
    const st = S.student; if (!st || !S.player) return;
    skipVideoSync();
    const ls = st.lesson;
    if (st.warmAd) {
      // spot in corso (o in arrivo) durante le schede: gira in muto, niente cursore e niente esercizi
      const w = st.warmAd;
      if (inAd(ls)) {
        if (!w.seen) {
          w.seen = true;
          $('#s-stage').classList.add('adon');   // v93: solo ORA il riquadro diventa visibile
          toast('C\u2019\u00e8 uno spot di YouTube: lo faccio passare adesso, in muto', 4000);
          if (!$('#warmad-tag')) (document.fullscreenElement || document.body).appendChild(el('div', { id: 'warmad-tag', text: '\ud83c\udf7f spot in corso (muto)\u2026' }));
        }
        return;
      }
      if (S.player.state() === 1 && S.player.time() > 0.4) { endWarmAd(st); return; }   // contenuto vero partito: basta cosi'
      if (Date.now() - w.at > 45000) { endWarmAd(st); return; }                          // niente in 45 s: lascia stare
      return;
    }
    if (inAd(ls)) {
      adNotice();
      st.lastT = null;   // i tempi dell'annuncio non devono far scattare niente
      if (st.replay) { st.replay.at = Date.now(); st.replay.moving = false; st.replay.adSeen = true; }
      return;
    }
    if (st.replay && st.replay.adSeen) { const rp = st.replay; rp.adSeen = false; rp.tries = 0; S.player.seek(rp.start); S.player.play(); return; }
    if (!st.started) syncDuration(ls);
    const t = S.player.time();
    drawCursor($('#s-timeline'), t, ls.duration);
    if (st.replay) {
      const rp = st.replay;
      if (rp.start != null && t < rp.start - 1.5 && Date.now() - rp.at < 4000) { if (!rp.retried) { rp.retried = true; S.player.seek(rp.start); S.player.play(); } return; }
      if (nudgeReplay(rp, ls)) return;
      if (t >= rp.end || rp.give || S.player.state() === 0) { S.player.pause(); st.replay = null; if (rp.redock) dock('#s-stage', true); }
      return;
    }
    if (st.blocked) { st.lastT = null; return; }
    if (!st.started) {
      st.lastT = null;
      if (S.player.state() === 1) startPlayback();   // play premuto direttamente sul video
      return;
    }
    // Un esercizio scatta solo se il suo segnaposto viene attraversato guardando (tra il tick precedente e questo),
    // non se lo si supera trascinando la barra: il tempo del video deve essere avanzato quanto il tempo reale.
    const now = Date.now();
    const prev = st.lastT, prevAt = st.lastAt;
    st.lastT = t; st.lastAt = now;
    const elapsed = prevAt ? (now - prevAt) / 1000 * (S.player.kind === 'mock' ? (S.speed || 1) : 1) : 0;
    const natural = prev != null && t >= prev && t - prev <= elapsed + 1.5;
    // il video si ferma QUANDO la frase e' finita, mai un attimo prima: meglio due decimi in piu' che l'ultima parola mozzata.
    // Il segnaposto e' un tempo della trascrizione, quindi segue la sincronia audio scelta per la lezione.
    const off = audioOffset(ls);
    const next = natural ? ls.exercises.find(function (e) { return (!st.done.has(e.id) || e.id === st.redo) && exerciseReady(e) && t >= e.markerTime + off && prev < e.markerTime + off; }) : null;
    if (!next && st.lock && S.player.state() === 1) {
      // barra bloccata: se si è andati oltre un esercizio ancora da fare, si torna all'inizio della sua frase
      const passed = ls.exercises.find(function (e) { return !st.done.has(e.id) && t > e.markerTime + 1.5; });
      if (passed) { S.player.seek(Math.max(0, Math.min(passed.segment.start - 0.3, passed.markerTime - 0.5))); st.lastT = null; return; }
    }
    if (next) {
      S.player.pause();
      st.blocked = true; st.activeId = next.id; st.redo = null;
      renderStudentTimeline();
      renderProgress();
      dock('#s-stage', true);
      renderExerciseInto($('#s-panel'), next, {
        mode: 'student', lesson: ls, index: ls.exercises.indexOf(next), total: ls.exercises.length,
        replay: replaySegment, attempts: st.attempts, hints: st.hints,
        review: st.done.has(next.id) ? (st.results[next.id] || { correct: false }) : null,   // già fatto: si riascolta, non si rifà
        onDone: function (correct) { finishExercise(next, correct, correct ? 'solved' : 'revealed'); },
        onAttempt: function (a, ok) { assignAttempt(next, a, ok); },
        onContinue: continueVideo,
        onSkip: function () { finishExercise(next, false, 'skipped'); continueVideo(); }
      });
      return;
    }
    if (S.player.state() === 1) {
      const c = G.inCut(ls.cuts, t);
      if (c) {
        // dentro un taglio: si salta alla fine; se nel taglio cade un esercizio ancora da fare (tagli e frasi si sovrappongono
        // per una modifica a mano) si salta solo fino all'inizio della sua frase, così la frase si sente e il resto no
        const target = cutTarget(ls, st, c, t);
        if (target > t + 0.25) { S.player.seek(target); st.lastT = null; }
      } else armCutJump(ls, st, t);
    }
    if (S.player.kind === 'mock' && S.player.state() === 0 && !st.ended) onEnded();
  }
  function onEnded() {
    const st = S.student; if (!st || st.ended) return;
    // v172: il video finisce mentre c'è un esercizio aperto (ultimo esercizio messo proprio alla fine): ce lo ricordiamo,
    // così dopo l'esercizio NON si preme play su un video finito (YouTube lo farebbe ripartire da capo)
    if (st.blocked) { st.endPending = true; return; }
    st.ended = true;
    st.talkIdx = 0;
    advancePhase();
  }
  /** "Parliamone": una domanda alla volta, grande, con le espressioni utili; si parla, non si scrive. Poi la sezione successiva. */
  function renderTalk(qs, before) {
    const st = S.student; const ls = st.lesson;
    hideImgPreview();
    const p = $('#s-panel'); p.innerHTML = '';
    dock('#s-stage', true);
    $('#s-stage').classList.add('cards');
    if (S.player) S.player.pause();
    const i = st.talkIdx || 0, q = qs[i];
    const check = !before && q.kind === 'check';
    cardHeader(p, before ? 'Prima di guardare: parliamone' : (check ? 'Hai capito? Parliamone' : 'Parliamone'), (i + 1) + ' di ' + qs.length, before ? 'prima del video' : (check ? 'comprensione' : 'dopo il video'));
    p.appendChild(el('div', { class: 'instr', text: before ? 'Qualche domanda per entrare nel tema, prima di guardare: rispondi a voce, con calma. Clicca una parola per salvarla con una stella ★: la ritrovi nel riepilogo finale.' : (check ? 'Domanda di comprensione: racconta a voce quello che hai capito dal video. Clicca una parola per salvarla con una stella ★: la ritrovi nel riepilogo finale.' : 'Rispondi a voce, con calma: non c\'è una risposta giusta. Clicca una parola per salvarla con una stella ★: la ritrovi nel riepilogo finale.') }));
    // v96: l'immagine (o il video) è di QUESTA domanda e sta sopra di lei
    const mNode = talkMediaNode(q.media);
    if (mNode) p.appendChild(mNode);
    const qd = el('div', { class: 'talk-q' });
    qd.appendChild(starredSentence(ls, L.tokenize(q.text).map(function (t) { return t.raw; })));
    p.appendChild(qd);
    const helps = String(q.help || '').split(/\s*[·|;]\s*/).map(function (h) { return h.trim(); }).filter(Boolean);
    if (helps.length) {
      p.appendChild(el('div', { class: 'hint', text: 'Per rispondere puoi usare:' }));
      // anche le espressioni utili sono parole cliccabili per la stella: sono proprio quelle che lo studente deve portarsi a casa.
      // Ogni chip e' un contenitore a se': parole stellate vicine DENTRO lo stesso chip fanno una voce sola ("mi preoccupa perche'").
      p.appendChild(el('div', { class: 'talk-help' }, helps.map(function (h) {
        const c = el('span', { class: 'chip', title: 'Clicca una parola per salvarla con una stella \u2605' });
        c.appendChild(starSpans(ls, h));
        return c;
      })));
    }
    const fb = el('div', { class: 'feedback' });
    const nav = el('div', { class: 'row fc-nav' });
    nav.appendChild(el('button', { class: 'small', text: '◀ Indietro', disabled: i === 0 ? 'disabled' : null, onclick: function () { st.talkIdx = i - 1; renderTalk(qs, before); } }));
    if (S.settings.apiKey) {
      nav.appendChild(translateButton(function (trBtn, lang) {
        const etichetta = trBtn.textContent;
        trBtn.disabled = true; trBtn.textContent = '… traduco';
        AI.translateSentence({ text: q.text, whole: true, sentence: q.text, lang: ls.lang, context: '', target: lang[3], apiKey: S.settings.apiKey, model: S.settings.model })
          .then(function (r) { fb.textContent = lang[1] + ' ' + r.translation; fb.style.color = 'var(--muted)'; })
          .catch(function (e) { toast('AI: ' + e.message, 6000); })
          .then(function () { trBtn.disabled = false; trBtn.textContent = etichetta; });
      }));
    }
    // etichetta dell'ultimo passo: dipende da cosa viene dopo nella struttura (video, altre sezioni o riepilogo)
    const nextStep = (st.queue && st.queue[0]) || null;
    const lastLabel = nextStep ? (nextStep.kind === 'video' ? 'Guarda il video ▶' : 'Continua ▶') : 'Vai al riepilogo ▶';
    nav.appendChild(el('button', { class: 'primary big', text: i + 1 < qs.length ? 'Prossima ▶' : lastLabel, onclick: function () { if (i + 1 < qs.length) { st.talkIdx = i + 1; renderTalk(qs, before); } else { st.talkIdx = 0; advancePhase(); } } }));
    p.appendChild(nav);
    p.appendChild(fb);
    p.appendChild(el('div', { class: 'actions' }, el('button', { class: 'link', text: nextStep ? 'Salta le domande' : 'Salta le domande e vai al riepilogo', onclick: function () { st.talkIdx = 0; advancePhase(); } })));
  }
  function replaySegment(ex) {
    const st = S.student;
    const sg = playSeg(st.lesson, ex.segment);
    st.replay = { start: sg.start, end: sg.end, at: Date.now(), retried: false, tries: 0, redock: false };
    // di default durante il riascolto la frase sparisce e il video torna grande: ci si concentra sull'ascolto
    if (!S.withText && $('#s-stage').classList.contains('docked')) { st.replay.redock = true; dock('#s-stage', false); }
    S.player.seek(sg.start);
    S.player.play();
  }
  function finishExercise(ex, correct, how) {
    const st = S.student;
    if (st.results[ex.id]) return;   // il risultato è definitivo: si può riascoltare, non rifare
    st.results[ex.id] = { correct: correct, attempts: st.attempts[ex.id] || 1, hints: st.hints[ex.id] || 0 };
    st.done.add(ex.id);
    assignFinish(ex, correct, how, st.hints[ex.id] || 0);
  }
  function continueVideo() {
    const st = S.student;
    st.blocked = false; st.activeId = null;
    renderStudentTimeline();
    renderProgress();
    const p = $('#s-panel'); p.innerHTML = '';
    dock('#s-stage', false);
    const remaining = st.lesson.exercises.filter(function (e) { return !st.done.has(e.id); }).length;
    if (!remaining) {
      // ultimo esercizio fatto: il riepilogo compare alla fine del video (o subito, se lo studente vuole)
      const bar = $('#s-progress');
      const btn = el('button', { class: 'small', text: 'Vai al riepilogo', style: 'margin-left:8px', onclick: function () { S.player.pause(); st.ended = true; renderSummary(); } });
      bar.appendChild(btn);
    }
    // v172 (Edoardo: "quando finisce il video, ricomincia da capo ma non capisco perché"): se il video è già finito (o
    // mancano meno di 0,7 s) play() su YouTube lo riavvia dall'inizio. Qui invece si passa alla sezione successiva.
    const dur = st.lesson.duration || 0;
    if (st.endPending || S.player.state() === 0 || (dur > 0 && S.player.time() >= dur - 0.7)) {
      st.endPending = false; S.player.pause();
      st.ended = true; st.talkIdx = 0;
      return advancePhase();
    }
    S.player.play();
  }

  /**
   * Disegna un esercizio dentro un contenitore. opts: { mode: 'student'|'preview', lesson, index, total, replay(ex), attempts,
   * onDone(correct), onContinue(), onSkip(), onClose() }
   */
  function renderExerciseInto(p, ex, opts) {
    const ls = opts.lesson;
    const preview = opts.mode === 'preview';
    p.innerHTML = '';
    // titolo = tipo di esercizio ("Trova la parola mancante"), traduzione in piccolo; "N di M" piccolo a destra
    const label = EX.LABELS[ex.type] || ex.type;
    const paren = label.indexOf(' (');
    // v98 (Edoardo: 'durante gli esercizi lo studente non vede il numero dell'esercizio ma nelle soluzioni c'e'
    // chiaramente il numero. Metti il numero anche durante gli esercizi prima del tipo'): stesso numero della
    // lista Soluzioni, perche' ls.exercises e' tenuto ordinato per markerTime (sortExercises) e il recap ordina
    // allo stesso modo: se lo studente dice 'sono bloccato al 9', l'insegnante guarda il 9 e trova quello.
    const h = el('h3', { class: 'ex-title' }, [
      preview ? el('span', { class: 'muted', text: 'Anteprima · ' }) : null,
      el('span', { class: 'ex-n', text: (opts.index + 1) + ': ' }),
      document.createTextNode(paren === -1 ? label : label.slice(0, paren)),
      paren === -1 ? null : el('span', { class: 'sub', text: ' ' + label.slice(paren + 1) })
    ]);
    // in alto solo "N di M" (e in anteprima il pulsante di chiusura); il titolo del tipo sta sopra la consegna, con un'animazione che attira l'occhio
    p.appendChild(el('div', { class: 'row ex-head' },
      el('span', { class: 'badge right', text: (opts.index + 1) + ' di ' + opts.total }),
      preview ? el('button', { class: 'small', text: '✕ Chiudi anteprima', onclick: function () { if (opts.onClose) opts.onClose(); } }) : null));
    h.classList.add('ex-type-title');
    p.appendChild(h);
    const instr = el('div', { class: 'instr', text: EX.INSTRUCTIONS[ex.type] });
    // Gapbank (v66, richiesta di Edoardo): la consegna dice IN GRASSETTO quante parole della lista sono in piu'.
    // Il numero e' quello VERO della banca (d.distractors), non l'impostazione: se l'insegnante ha ritoccato la
    // lista a mano, allo studente si dice quello che ha davanti. Con 0 parole in piu' la frase sparisce del tutto.
    if (ex.type === 'gapbank') {
      const dd = ex.data || {};
      const nd = Array.isArray(dd.distractors) ? dd.distractors.length : Math.max(0, (dd.wordBank || []).length - (dd.answers || []).length);
      if (nd > 0) {
        instr.appendChild(document.createTextNode(' '));
        instr.appendChild(el('b', { text: nd === 1 ? 'Nella lista c\'è 1 parola in più.' : 'Nella lista ci sono ' + nd + ' parole in più.' }));
      }
    }
    p.appendChild(instr);
    const body = el('div');
    p.appendChild(body);
    const fb = el('div', { class: 'feedback' });
    const actions = el('div', { class: 'actions' });
    const replayBtn = el('button', { text: '🔁 Riascolta', onclick: function () { if (opts.replay) opts.replay(ex); } });
    // "con la frase": se spuntato, durante il riascolto lo schermo resta così (frase visibile); di default il video torna grande.
    // Vale SOLO per questo esercizio: a ogni esercizio riparte SEMPRE spenta (richiesta esplicita di Edoardo)
    S.withText = false;
    const withText = el('input', { type: 'checkbox', title: 'Riascolta senza ingrandire il video: la frase resta visibile (solo per questo esercizio)' });
    withText.checked = S.withText;
    withText.addEventListener('change', function () { S.withText = withText.checked; });
    const withTextLbl = el('label', { class: 'chip withtext', style: 'margin:0', title: 'Riascolta senza ingrandire il video: la frase resta visibile' }, withText, ' con la frase');
    const checkBtn = el('button', { class: 'primary', text: 'Controlla' });
    const hintBtn = el('button', { class: 'small hint-btn', text: '💡 Aiuto', title: ex.type === 'gapbank' ? 'Un aiuto alla volta: restringe la lista a 3 parole possibili per la casella su cui sei (clicca un altro spazio per spostarlo)' : 'Un aiuto alla volta: una lettera in più della risposta (o un pezzo della soluzione)' });
    const solBtn = el('button', { class: 'link', text: 'Mostra soluzione', style: 'display:none' });
    const skipBtn = el('button', { class: 'link', text: 'Salta', style: preview ? 'display:none' : '' });
    actions.appendChild(replayBtn); actions.appendChild(withTextLbl); actions.appendChild(checkBtn); actions.appendChild(hintBtn); actions.appendChild(solBtn); actions.appendChild(skipBtn);
    let refreshTranslation = function () {};   // v94: assegnata sotto quando c'è la chiave AI
    if (S.settings.apiKey) {
      // traduzione con l'AI (inglese britannico): tutta la frase, oppure solo le parole selezionate col mouse
      // La traduzione aiuta a CAPIRE la frase, non a risolverla: finché l'esercizio non è chiuso le parole da trovare
      // escono come "___" (1/9, Edoardo: "se clicco su traduci prima che lo studente scrive le parole appare la frase
      // intera e non va bene perché sarebbe un suggerimento"). Nel riordino non c'è niente da mascherare — la risposta è
      // l'ordine di TUTTE le parole — quindi lì prima di risolvere si traduce solo quello che lo studente seleziona.
      const trBox = el('div', { class: 'translation', style: 'display:none' });
      let trUltima = null, trUltimoBtn = null;   // v94: per rifare la traduzione da soli a esercizio risolto
      const traduci = function (trBtn, lang) {
        trUltima = lang; trUltimoBtn = trBtn;
        const done = solved || !!opts.review || preview;
        const sel = String(window.getSelection ? window.getSelection().toString() : '').trim();
        const partial = sel && sel.length < ex.sentence.length && ex.sentence.toLowerCase().indexOf(sel.toLowerCase().slice(0, 30)) !== -1;
        if (!done && !partial && ex.type === 'scramble') {
          trBox.style.display = '';
          trBox.innerHTML = '';
          trBox.appendChild(el('span', { class: 'hint', text: 'Qui la risposta è proprio l\'ordine delle parole: seleziona con il mouse le parole che non capisci e ripremi 🌐 Traduci.' }));
          return;
        }
        const hide = done || partial ? [] : EX.hiddenWords(ex);
        // "Trova la parola mancante" (9/9, 'sotto c'e' un gap e non va bene perche' diventa un suggerimento'):
        // niente "___" — svelerebbe DOVE manca la parola, che e' meta' della risposta. Si traduce la frase COME
        // MOSTRATA (senza la parola), letteralmente, e il modello ha l'ordine di non segnalare il buco.
        const missingShown = ex.type === 'missing' && !done && !partial;
        const shownText = missingShown ? (ex.data.tokens || []).filter(function (t, j) { return j !== ex.data.missingIndex; }).join(' ') : null;
        const etichetta = trBtn.textContent;
        trBtn.disabled = true; trBtn.textContent = '… traduco';
        AI.translateSentence({ text: partial ? sel : (shownText || ex.sentence), whole: !partial, sentence: shownText || ex.sentence, lang: ls.lang, context: '', hide: hide, target: lang[3], literal: !done && (ex.type === 'extra' || ex.type === 'wrong' || ex.type === 'missing'), omission: missingShown, apiKey: S.settings.apiKey, model: S.settings.model })
          .then(function (r) {
            trBox.style.display = ''; trBox.innerHTML = '';
            trBox.appendChild(el('span', { class: 'hint', text: (partial ? '"' + sel + '" → ' : lang[1] + ' ') }));
            trBox.appendChild(el('b', { text: r.translation }));
            // la traduzione "coperta" si ricorda di esserlo: a esercizio risolto si rifà da sola, intera
            trBox._coperta = !partial && (hide.length > 0 || missingShown);
            if (hide.length) trBox.appendChild(el('div', { class: 'hint', text: '___ = quello che devi trovare tu. Dopo la risposta la traduzione si vede per intero.' }));
            else if (missingShown) trBox.appendChild(el('div', { class: 'hint', text: 'La traduzione segue la frase così com\'è, senza la parola che manca: trovarla resta compito tuo.' }));
          })
          .catch(function (e) { toast('AI: ' + e.message, 6000); })
          .then(function () { trBtn.disabled = false; trBtn.textContent = etichetta; });
      };
      const trWrap = translateButton(traduci);
      // v94 (Edoardo: "una volta che lo studente ha inserito la parola mancante, devi aggiornare automaticamente
      // anche la traduzione e rimuovere la scritta sotto che dice che è compito suo"): a esercizio risolto la
      // traduzione coperta non ha più senso. Si rifà da sola, per intero, e la nota sparisce con lei.
      refreshTranslation = function () {
        if (trBox.style.display === 'none' || !trBox._coperta || !trUltima || !trUltimoBtn) return;
        trBox._coperta = false;
        traduci(trUltimoBtn, trUltima);
      };
      actions.appendChild(trWrap);
      actions.appendChild(fb);   // "Giusto!" a destra dei pulsanti, sulla stessa riga: niente righe in più da scorrere
      p.appendChild(actions); p.appendChild(trBox);
    } else { actions.appendChild(fb); p.appendChild(actions); }
    const attempts = opts.attempts || {};

    // insegnante (lezione del portfolio, non link studente): ⌘/Alt + clic su una parola per correggerla al volo
    if (!S.standalone && S.lessons[ls.id]) {
      if (p._quickEdit) p.removeEventListener('click', p._quickEdit, true);
      p._quickEdit = function (e) {
        if (!(e.metaKey || e.altKey)) return;
        const node = e.target.closest && e.target.closest('.w, .chip');
        if (!node || !p.contains(node) || node.closest('.actions')) return;
        e.preventDefault(); e.stopPropagation();
        if (quickEditWord(ls, ex, node, p)) renderExerciseInto(p, ex, opts);
      };
      p.addEventListener('click', p._quickEdit, true);
    }

    if (opts.review) {
      // esercizio già fatto: frase completa (verde se era giusto), soluzione se era da rivedere; niente Controlla
      const rv = opts.review;
      const ins = p.querySelector('.instr'); if (ins) ins.textContent = 'Esercizio già fatto' + (rv.correct ? ': giusto. ' : ': da rivedere. ') + 'Puoi riascoltare la frase, ma la risposta non si cambia. Clicca una parola per salvarla con una stella ★: la ritrovi nel riepilogo finale.';
      const full = starredSentence(ls, L.tokenize(ex.sentence).map(function (t) { return t.raw; }));
      if (rv.correct) full.style.color = 'var(--ok)';
      body.appendChild(full);
      if (!rv.correct) body.appendChild(el('div', { class: 'feedback', style: 'color:var(--muted)', text: 'Soluzione: ' + EX.solution(ex) }));
      checkBtn.remove(); hintBtn.remove(); solBtn.remove(); skipBtn.remove();
      actions.appendChild(el('button', { class: 'primary', text: preview ? 'Chiudi anteprima' : 'Continua ▶', onclick: function () { if (preview) { if (opts.onClose) opts.onClose(); } else if (opts.onContinue) opts.onContinue(); } }));
      return;
    }

    const strict = !!(ls.options && ls.options.strict);
    let getAnswer = function () { return null; };
    let markResult = function () { };
    let giveHint = null;   // per tipo: un aiuto alla volta (lettera in più, parola giusta al suo posto, opzione eliminata…)
    const d = ex.data;
    const sameWord = function (a, b) { return L.normalize(a, { accents: strict }) === L.normalize(b, { accents: strict }); };
    /** Svela una lettera in più: si riparte dall'inizio giusto già scritto dallo studente (accenti e maiuscole tollerati). */
    const revealLetter = function (inp, answer) {
      const cur = String(inp.value || ''), ans = String(answer || '');
      let n = 0;
      while (n < cur.length && n < ans.length && L.normalize(cur[n]) === L.normalize(ans[n])) n++;
      n = Math.min(ans.length, n + 1);
      inp.value = ans.slice(0, n);
      inp.classList.remove('bad'); inp.classList.add('hinted');
      if (n >= ans.length) inp.classList.add('ok');
      inp.dispatchEvent(new Event('input'));   // v76: contatore parole e ✕ della casella seguono anche l'Aiuto
      inp.focus();
      try { inp.setSelectionRange(inp.value.length, inp.value.length); } catch (e) { /* ignore */ }
      return true;
    };

    if (ex.type === 'gap' || ex.type === 'gapbank') {
      const sent = el('div', { class: 'sentence nostar' });
      const inputs = [];
      let active = null;   // la casella su cui sta lavorando lo studente: la parola cliccata va LI'
      let onGapPick = null;   // v98: acceso dall'Aiuto del semplificato, ricalcola le parole possibili per la casella cliccata
      // parole nascoste adiacenti = un unico spazio (lo studente scrive tutta l'espressione)
      const runs = EX.gapRuns(d);
      const runStart = {}; runs.forEach(function (r, k) { runStart[r.indices[0]] = k; });
      const inRun = new Set(d.gapIndices);
      d.tokens.forEach(function (t, i) {
        if (!inRun.has(i)) { sent.appendChild(starSpan(ls, t)); sent.appendChild(document.createTextNode(' ')); return; }
        const k = runStart[i];
        if (k == null) return;   // parola interna a uno spazio unito: già coperta
        const run = runs[k];
        const firstTok = L.tokenize(d.tokens[run.indices[0]])[0] || { pre: '', post: '' };
        const lastTok = L.tokenize(d.tokens[run.indices[run.indices.length - 1]])[0] || { pre: '', post: '' };
        if (firstTok.pre) sent.appendChild(document.createTextNode(firstTok.pre));
        // larghezza uguale per tutti gli spazi di una parola (la lunghezza non si deve indovinare); più largo se le parole sono più di una
        // v117: la casella parte con una min-width fissa (non svela la risposta) e si ALLARGA quando la parola
        // inserita e' più lunga — prima le parole lunghe venivano tagliate ('i gap si devono adattare').
        const width = Math.min(11 * run.indices.length, 34);
        const inp = el('input', { type: 'text', class: 'gap', autocomplete: 'off', autocapitalize: 'off', autocorrect: 'off', spellcheck: 'false', style: 'width:' + width + 'ch;min-width:' + width + 'ch', 'data-words': String(run.indices.length) });
        const fitGap = function () { inp.style.width = inp.value.length > width ? (inp.value.length + 2) + 'ch' : width + 'ch'; };
        inp.addEventListener('input', fitGap);
        // v77 ('che senso ha lasciare la funzione per rimuovere i caratteri se c'e' la x?'): nel gapbank la casella
        // e' in sola lettura — le parole entrano col click sul chip, escono con la ✕; niente tastiera (nemmeno sul telefono).
        if (ex.type === 'gapbank') inp.readOnly = true;
        inp.addEventListener('keydown', function (e) { if (e.key === 'Enter') checkBtn.click(); });
        inp.addEventListener('focus', function () { active = inp; });
        inp.addEventListener('click', function () { active = inp; if (onGapPick) onGapPick(inp); });
        inputs.push(inp);
        const gwrap = el('span', { class: 'gwrap' });
        gwrap.appendChild(inp);
        if (ex.type === 'gap') {
          // v76 ('sopra il gap scriverai in piccolo "scrivi 3 parole"... quando è scritta l'ultima, la scritta scompare'):
          // il contatore dice quante parole MANCANO in quello spazio e si aggiorna mentre lo studente scrive.
          const tot = run.indices.length;
          const lbl = el('span', { class: 'gcount', 'aria-hidden': 'true' });
          const updCount = function () {
            const scritte = inp.value.trim().split(/\s+/).filter(Boolean).length;
            const manca = tot - scritte;
            lbl.hidden = manca <= 0;
            if (manca > 0) lbl.textContent = 'scrivi ' + manca + (manca === 1 ? ' parola' : ' parole');
          };
          inp.addEventListener('input', updCount);
          gwrap.appendChild(lbl); updCount();
          sent.classList.add('counts');
        } else {
          // v76 ('metti una piccola x... così può eliminare la parola con un click'): la ✕ svuota la casella
          // e il chip torna nella banca (l'evento input fa scattare refreshBank).
          const xb = el('button', { class: 'gclear', type: 'button', title: 'Svuota la casella', text: '✕' });
          const updX = function () { xb.hidden = !inp.value.trim(); };
          inp.addEventListener('input', updX);
          xb.addEventListener('click', function () { inp.value = ''; inp.dispatchEvent(new Event('input')); active = inp; inp.focus(); });
          gwrap.appendChild(xb); updX();
          inp.addEventListener('input', function () { setTimeout(maybeAutoCheck, 60); });   // v78: ultima casella giusta = autofeedback
        }
        sent.appendChild(gwrap);
        sent.appendChild(document.createTextNode((lastTok.post || '') + ' '));
      });
      body.appendChild(sent);
      let gapbankHint = null;   // v98: assegnata sotto, solo quando c'e' davvero una lista di parole
      if (ex.type === 'gapbank' && d.wordBank && d.wordBank.length) {
        // La parola cliccata va nella casella SU CUI SEI (se ne hai scelta una), non sempre nella prima libera;
        // e sparisce dalla lista, perche' una parola gia' usata non si usa due volte. Cancellandola dalla casella
        // torna disponibile. Richieste di Edoardo, 3/9.
        const manca = function (inp) { return inp.value.trim().split(/\s+/).filter(Boolean).length < parseInt(inp.getAttribute('data-words'), 10); };
        const bank = [];
        const refreshBank = function () {
          const usate = {};
          inputs.forEach(function (i) { L.words(i.value).forEach(function (x) { usate[x] = (usate[x] || 0) + 1; }); });
          const viste = {};
          bank.forEach(function (b) {
            const k = L.normalize(b.w);
            viste[k] = (viste[k] || 0) + 1;
            b.el.hidden = viste[k] <= (usate[k] || 0);
          });
        };
        inputs.forEach(function (i) { i.addEventListener('input', refreshBank); });
        const row = el('div', { class: 'chips' });
        // Una casella con le lettere dell'Aiuto (o una parola a meta') NON e' piena: il chip che la completa va LI',
        // sostituendo il prefisso (v67, 'se clicco su cellula mi mette la parola nel next gap e non va bene').
        // Si confronta col CHIP cliccato, mai con la risposta: il posto dove va un chip non deve fare da spoiler.
        const prefDi = function (inp, w) {
          const parts = inp.value.trim().split(/\s+/).filter(Boolean);
          if (!parts.length || parts.length > parseInt(inp.getAttribute('data-words'), 10)) return false;
          const last = L.normalize(parts[parts.length - 1]), nw = L.normalize(w);
          return last.length > 0 && last.length < nw.length && nw.indexOf(last) === 0;
        };
        d.wordBank.forEach(function (w) {
          const c = el('span', { class: 'chip', text: w, onclick: function () {
            const fits = function (inp) { return manca(inp) || prefDi(inp, w); };
            const target = (active && fits(active)) ? active : inputs.find(fits);
            if (!target) return;
            if (prefDi(target, w)) {
              const parts = target.value.trim().split(/\s+/).filter(Boolean);
              parts[parts.length - 1] = w;   // via le lettere del suggerimento: il chip le completa
              target.value = parts.join(' ');
            } else target.value = (target.value.trim() + ' ' + w).trim();
            target.dispatchEvent(new Event('input'));   // v76: fa scattare refreshBank E la ✕ della casella
            const prossimo = manca(target) ? target : inputs.find(manca);
            active = prossimo || target;
            active.focus();
          } });
          bank.push({ w: w, el: c });
          row.appendChild(c);
        });
        body.appendChild(row);
        refreshBank();
        // v98 (Edoardo: 'per il fill the gaps semplificato, quando si clicca aiuto voglio che venga dato un aiuto
        // specifico: se clicco su un gap mi vengono selezionate 3 parole in giallo (tra cui una corretta) e le
        // altre parole rosse (per escluderle)'). Nel semplificato la casella e' in SOLA LETTURA (v77): svelare
        // lettere non serviva a niente, perche' lo studente non scrive. L'aiuto giusto e' RESTRINGERE LA LISTA:
        // giallo = puo' andare in questa casella, rosso = non e' di questa casella (le parole rosse restano
        // cliccabili: l'aiuto indirizza, non impedisce di sbagliare).
        // Un Aiuto dopo l'altro sulla stessa casella stringe: 3 gialle, poi 2, poi solo quella giusta.
        // Cliccando un'altra casella si riparte dalle 3 di quella.
        const hintOrd = {}, hintExtra = {};   // ordine stabile delle sbagliate e quante ne restano gialle, per casella
        let hintGap = -1;
        const clearBankMarks = function () { bank.forEach(function (b) { b.el.classList.remove('hinted', 'excluded'); }); };
        const narrowBank = function (k, riparti) {
          if (k < 0 || k >= inputs.length) return false;
          const giuste = L.words(runs[k].answer);
          const liberi = bank.filter(function (b) { return !b.el.hidden; });
          const scelti = [];
          giuste.forEach(function (g) {
            const b = liberi.find(function (x) { return scelti.indexOf(x) === -1 && L.normalize(x.w) === g; });
            if (b) scelti.push(b);
          });
          if (!scelti.length) return false;   // la parola giusta e' gia' dentro una casella: niente da indicare
          const resto = liberi.filter(function (b) { return scelti.indexOf(b) === -1; });
          if (!resto.length) return false;   // nella lista e' rimasta solo lei: non c'e' aiuto da dare
          if (!hintOrd[k]) {
            // le due parole gialle sbagliate si pescano PRIMA fra le parole in piu' (i distrattori) e solo dopo
            // fra le risposte degli altri spazi: 'una di queste tre e' quella giusta' dev'essere vero senza
            // trappole, e una parola che serve altrove e' piu' utile segnata in rosso che proposta qui.
            const veriSbagliati = (d.distractors || []).map(function (w) { return L.normalize(w); });
            const mischiato = EX.shuffle(resto.slice(), Math.random);
            hintOrd[k] = mischiato.filter(function (b) { return veriSbagliati.indexOf(L.normalize(b.w)) !== -1; })
              .concat(mischiato.filter(function (b) { return veriSbagliati.indexOf(L.normalize(b.w)) === -1; }));
          }
          const ordine = hintOrd[k].filter(function (b) { return resto.indexOf(b) !== -1; });
          // 3 gialle in tutto: le giuste di QUESTA casella (uno spazio unito ne vuole piu' di una) piu' le altre
          const base = Math.max(0, Math.min(3 - scelti.length, ordine.length - 1));
          const extra = (riparti || hintExtra[k] == null) ? base : Math.min(hintExtra[k] - 1, base);
          if (extra < 0) return false;
          hintExtra[k] = extra;
          clearBankMarks();
          inputs.forEach(function (i) { i.classList.remove('hinted'); });
          const gialli = scelti.concat(ordine.slice(0, extra));
          liberi.forEach(function (b) { b.el.classList.add(gialli.indexOf(b) === -1 ? 'excluded' : 'hinted'); });
          inputs[k].classList.add('hinted');   // si deve vedere A QUALE casella si riferiscono le parole gialle
          hintGap = k;
          return true;
        };
        onGapPick = function (inp) { if (hintGap !== -1) narrowBank(inputs.indexOf(inp), true); };
        // appena la casella aiutata e' piena, i colori non dicono piu' niente di utile: si spengono
        inputs.forEach(function (i) {
          i.addEventListener('input', function () {
            if (hintGap !== -1 && inputs[hintGap] === i && !manca(i)) { clearBankMarks(); i.classList.remove('hinted'); hintGap = -1; }
          });
        });
        gapbankHint = function () {
          const daFare = function (i) { return !sameWord(inputs[i].value, runs[i].answer); };
          const cur = active ? inputs.indexOf(active) : -1;
          let k = (cur !== -1 && daFare(cur)) ? cur : -1;
          if (k === -1) for (let i = 0; i < inputs.length && k === -1; i++) if (daFare(i)) k = i;
          if (k === -1) return false;
          return narrowBank(k, k !== hintGap);
        };
      }
      getAnswer = function () { return inputs.map(function (i) { return i.value; }); };
      giveHint = function () {
        // semplificato: l'aiuto restringe la lista delle parole (v98); spazi da scrivere: una lettera alla volta
        if (gapbankHint) return gapbankHint();
        // uno spazio unito = una risposta di piu' parole (runs), non la k-esima parola singola
        // v141 (Edoardo: "se clicco su aiuto la lettera venga inserita in base al gap selezionato, e non che parta per forza
        // dal primo gap"): prima la casella su cui sta lavorando lo studente (active, segue focus e clic), se non è già giusta
        const daFare = function (i) { return !sameWord(inputs[i].value, runs[i].answer); };
        const cur = active ? inputs.indexOf(active) : -1;
        const k = (cur !== -1 && daFare(cur)) ? cur : inputs.findIndex(function (inp, i) { return daFare(i); });
        if (k === -1) return false;
        active = inputs[k];
        return revealLetter(inputs[k], runs[k].answer);
      };
      markResult = function (res) {
        inputs.forEach(function (inp, k) { inp.classList.toggle('ok', !!res.detail[k]); inp.classList.toggle('bad', !res.detail[k]); });
        if (res.correct) {
          sent.style.color = 'var(--ok)';
          sent.classList.remove('counts', 'nostar');
          // le caselle lasciano il posto alle parole scritte, evidenziate e cliccabili per la stella: la frase sopra basta
          // (si sostituisce il wrapper intero: via anche il contatore e la ✕ della v76)
          inputs.forEach(function (inp) { const wrap = el('span', { class: 'filled' }); wrap.appendChild(starSpans(ls, inp.value.trim())); (inp.closest('.gwrap') || inp).replaceWith(wrap); });
          const bank = body.querySelector('.chips'); if (bank) bank.remove();
        }
      };
      if (!preview) setTimeout(function () { if (inputs[0]) inputs[0].focus(); }, 50);   // in anteprima il fuoco resta all'editor
    } else if (ex.type === 'scramble') {
      const pool = el('div', { class: 'chips' });
      const ans = el('div', { class: 'answer-row chips' });
      const chosen = [];
      // ordine delle parole nuovo a ogni apertura (non quello salvato), mai uguale alla frase giusta
      let shown = EX.shuffle(d.words.slice(), Math.random);
      for (let t = 0; t < 10 && shown.every(function (w, i) { return sameWord(w, d.words[i]); }); t++) shown = EX.shuffle(d.words.slice(), Math.random);
      if (shown.every(function (w, i) { return sameWord(w, d.words[i]); })) shown = d.words.slice().reverse();
      const render = function () {
        pool.innerHTML = ''; ans.innerHTML = '';
        // v76 ('uno studente ha provato a trascinarla'): le parole del pool si METTONO anche trascinandole
        // sulla riga della risposta, nel punto voluto; un tocco senza spostamento le mette in coda come prima.
        shown.forEach(function (w, i) {
          if (chosen.indexOf(i) !== -1) return;
          const c = el('span', { class: 'chip', text: w, title: 'Tocca per aggiungere, o trascina dove vuoi' });
          let sx = 0, sy = 0, dx = 0, dy = 0, dragging = false, activeP = false, ph = null;
          c.addEventListener('pointerdown', function (e) { if (e.button && e.button !== 0) return; const r = c.getBoundingClientRect(); sx = e.clientX; sy = e.clientY; dx = e.clientX - r.left; dy = e.clientY - r.top; dragging = false; activeP = true; try { c.setPointerCapture(e.pointerId); } catch (err) { /* ignore */ } });
          c.addEventListener('pointermove', function (e) {
            if (!activeP) return;
            if (!dragging) {
              if (Math.hypot(e.clientX - sx, e.clientY - sy) < 6) return;
              dragging = true;
              const r = c.getBoundingClientRect();
              ph = el('span', { class: 'chip placeholder', style: 'width:' + r.width + 'px;height:' + r.height + 'px' });
              ans.appendChild(ph);
              c.classList.add('dragging'); c.style.position = 'fixed'; c.style.zIndex = '60'; c.style.pointerEvents = 'none'; c.style.width = r.width + 'px';
            }
            c.style.left = (e.clientX - dx) + 'px'; c.style.top = (e.clientY - dy) + 'px';
            const ar = ans.getBoundingClientRect();
            const dentro = e.clientY >= ar.top - 26 && e.clientY <= ar.bottom + 26 && e.clientX >= ar.left - 26 && e.clientX <= ar.right + 26;
            ph.style.display = dentro ? '' : 'none';
            if (!dentro) return;
            const others = $$('.chip', ans).filter(function (x) { return x !== ph; });
            let idx = others.length;
            for (let j = 0; j < others.length; j++) { const r = others[j].getBoundingClientRect(); if (e.clientY < r.top - 4 || (e.clientY <= r.bottom + 4 && e.clientX < r.left + r.width / 2)) { idx = j; break; } }
            const ref = others[idx] || null;
            if (ref) { if (ph.nextSibling !== ref) ans.insertBefore(ph, ref); } else if (ans.lastElementChild !== ph) ans.appendChild(ph);
          });
          const fin = function (e) {
            if (!activeP) return;
            activeP = false;
            try { c.releasePointerCapture(e.pointerId); } catch (err) { /* ignore */ }
            if (!dragging) { chosen.push(i); render(); return; }   // tocco senza spostamento: in coda
            dragging = false;
            if (ph && ph.style.display !== 'none') {   // mollata sulla risposta: entra nel punto del segnaposto
              const order = $$('.chip', ans).map(function (x) { return x === ph ? i : parseInt(x.getAttribute('data-i'), 10); });
              chosen.length = 0; order.forEach(function (x) { chosen.push(x); });
            }
            render();   // mollata altrove: resta nel pool
          };
          c.addEventListener('pointerup', fin);
          c.addEventListener('pointercancel', function () { activeP = false; dragging = false; render(); });
          pool.appendChild(c);
        });
        chosen.forEach(function (i, k) {
          const c = el('span', { class: 'chip sel', text: shown[i], 'data-i': String(i), title: 'Trascina per spostare, tocca per togliere' });
          // trascinamento per riordinare (mouse e touch); un tocco senza spostamento toglie la parola
          // NB: il chip trascinato non si sposta nel DOM (spostarlo farebbe perdere la cattura del puntatore): segue il dito
          // con position:fixed, mentre un segnaposto (ph) mostra dove finirà
          let sx = 0, sy = 0, dx = 0, dy = 0, dragging = false, active = false, ph = null;
          c.addEventListener('pointerdown', function (e) { if (e.button && e.button !== 0) return; const r = c.getBoundingClientRect(); sx = e.clientX; sy = e.clientY; dx = e.clientX - r.left; dy = e.clientY - r.top; dragging = false; active = true; try { c.setPointerCapture(e.pointerId); } catch (err) { /* ignore */ } });
          c.addEventListener('pointermove', function (e) {
            if (!active) return;
            if (!dragging) {
              if (Math.hypot(e.clientX - sx, e.clientY - sy) < 6) return;
              dragging = true;
              const r = c.getBoundingClientRect();
              ph = el('span', { class: 'chip placeholder', style: 'width:' + r.width + 'px;height:' + r.height + 'px' });
              ans.insertBefore(ph, c);
              c.classList.add('dragging'); c.style.position = 'fixed'; c.style.zIndex = '60'; c.style.pointerEvents = 'none'; c.style.width = r.width + 'px';
            }
            c.style.left = (e.clientX - dx) + 'px'; c.style.top = (e.clientY - dy) + 'px';
            // v76: trascinata FUORI dalla riga della risposta (verso il pool) = si toglie; il segnaposto sparisce per dirlo
            const ar = ans.getBoundingClientRect();
            const dentro = e.clientY >= ar.top - 26 && e.clientY <= ar.bottom + 26 && e.clientX >= ar.left - 26 && e.clientX <= ar.right + 26;
            ph.style.display = dentro ? '' : 'none';
            if (!dentro) return;
            const others = $$('.chip', ans).filter(function (x) { return x !== c && x !== ph; });
            let idx = others.length;
            for (let j = 0; j < others.length; j++) { const r = others[j].getBoundingClientRect(); if (e.clientY < r.top - 4 || (e.clientY <= r.bottom + 4 && e.clientX < r.left + r.width / 2)) { idx = j; break; } }
            const ref = others[idx] || null;
            if (ref) { if (ph.nextSibling !== ref) ans.insertBefore(ph, ref); } else if (ans.lastElementChild !== ph) ans.appendChild(ph);
          });
          const finish = function (e) {
            if (!active) return;
            active = false;
            try { c.releasePointerCapture(e.pointerId); } catch (err) { /* ignore */ }
            if (!dragging) { chosen.splice(chosen.indexOf(i), 1); render(); return; }   // tocco senza spostamento: toglie
            dragging = false;
            if (ph && ph.style.display === 'none') { chosen.splice(chosen.indexOf(i), 1); render(); return; }   // v76: mollata fuori = tolta
            const order = $$('.chip', ans).filter(function (x) { return x !== c; }).map(function (x) { return x === ph ? i : parseInt(x.getAttribute('data-i'), 10); });
            chosen.length = 0; order.forEach(function (x) { chosen.push(x); });
            render();
          };
          c.addEventListener('pointerup', finish);
          c.addEventListener('pointercancel', function () { active = false; dragging = false; render(); });
          ans.appendChild(c);
        });
        if (!chosen.length) ans.appendChild(el('span', { class: 'hint', text: 'Tocca o trascina qui le parole nell\'ordine giusto (per togliere: tocca, o trascina fuori)' }));
        setTimeout(maybeAutoCheck, 120);   // v78: ultima parola al posto giusto = autofeedback
      };
      render();
      body.appendChild(ans); body.appendChild(pool);
      getAnswer = function () { return chosen.map(function (i) { return shown[i]; }); };
      giveHint = function () {
        // si tiene l'inizio giusto e si mette al suo posto la parola successiva
        let ok = 0;
        while (ok < chosen.length && ok < d.words.length && sameWord(shown[chosen[ok]], d.words[ok])) ok++;
        if (ok >= d.words.length) return false;
        chosen.length = ok;
        // la tessera giusta e' quella IDENTICA: sameWord ignora gli accenti (serve per correggere lo studente con indulgenza)
        // e faceva scegliere "e" al posto di "e'" quando in frase ci sono tutte e due (segnalato da Edoardo l'1/9).
        let idx = shown.findIndex(function (w, i) { return chosen.indexOf(i) === -1 && w === d.words[ok]; });
        if (idx === -1) idx = shown.findIndex(function (w, i) { return chosen.indexOf(i) === -1 && sameWord(w, d.words[ok]); });
        if (idx === -1) return false;
        chosen.push(idx); render();
        const last = ans.lastElementChild; if (last) last.classList.add('hinted');
        return true;
      };
      markResult = function (res) {
        $$('.chip', ans).forEach(function (c, k) { c.classList.toggle('good', !!res.detail[k]); c.classList.toggle('wrongpick', !res.detail[k]); });
        // a frase giusta, i chip ritrovano maiuscole e punteggiatura originali (virgole, punto interrogativo)
        if (res.correct) { const raws = L.tokenize(ex.sentence).map(function (t) { return t.raw; }); $$('.chip', ans).forEach(function (c, k) { if (raws[k]) c.textContent = raws[k]; }); starrableChips(ls, ans); pool.remove(); }
      };
    } else if (ex.type === 'missing') {
      // lo studente sceglie DOVE manca la parola (tra due parole: passando col mouse si apre uno spazio, clic per sceglierlo)
      // e poi la scrive nello spazio. Giusto solo se posto E parola sono giusti.
      const visible = d.tokens.filter(function (t, i) { return i !== d.missingIndex; });
      const sdiv = el('div', { class: 'sentence full gapfinder nostar' });
      const slots = [];
      let selected = -1;
      const inp = el('input', { type: 'text', class: 'gap gapfind', placeholder: '…', autocomplete: 'off', autocapitalize: 'off', autocorrect: 'off', spellcheck: 'false', 'aria-label': 'Parola mancante' });
      inp.addEventListener('keydown', function (e) { if (e.key === 'Enter') { e.preventDefault(); checkBtn.click(); } });
      inp.addEventListener('input', function () { inp.style.width = Math.max(5, inp.value.length + 2) + 'ch'; });
      const choose = function (k) {
        selected = k;
        slots.forEach(function (s, j) { s.classList.toggle('sel', j === k); s.classList.remove('near'); });
        slots[k].appendChild(inp);
        inp.focus();
      };
      const makeSlot = function (k) {
        const sl = el('span', { class: 'slot', 'data-k': String(k), title: 'Manca una parola qui? Clicca e scrivila' });
        sl.addEventListener('click', function (e) { if (e.target === inp) return; e.stopPropagation(); choose(k); });
        return sl;
      };
      // Uno spazio VERO tra una parola e l'altra: prima lo faceva lo slot, largo 0,4em, e portandolo a zero (v55, per
      // allineare le righe) le parole si sono attaccate tutte — la frase era illeggibile. Lo spazio non deve dipendere
      // da un elemento che serve ad altro.
      visible.forEach(function (t, k) {
        const sl = makeSlot(k); slots.push(sl);
        if (k) sdiv.appendChild(document.createTextNode(' '));
        sdiv.appendChild(sl); sdiv.appendChild(starSpan(ls, t));
      });
      const lastSlot = makeSlot(visible.length); slots.push(lastSlot); sdiv.appendChild(lastSlot);
      // lo spazio si apre dove sta il mouse: lo slot più vicino al puntatore, sulla stessa riga
      const nearest = function (x, y) {
        let best = -1, bd = Infinity;
        slots.forEach(function (sl, j) {
          const r = sl.getBoundingClientRect(); if (!r.height) return;
          const dy = Math.abs((r.top + r.bottom) / 2 - y); if (dy > r.height * 0.9 + 4) return;
          const dx = Math.abs((r.left + r.right) / 2 - x); const dd = dx + dy * 3;
          if (dd < bd) { bd = dd; best = j; }
        });
        return best;
      };
      sdiv.addEventListener('mousemove', function (e) { const j = nearest(e.clientX, e.clientY); slots.forEach(function (sl, i) { sl.classList.toggle('near', i === j && i !== selected); }); });
      sdiv.addEventListener('mouseleave', function () { slots.forEach(function (sl) { sl.classList.remove('near'); }); });
      // clic in un punto qualsiasi della frase (non su una parola: quella è per la stella): lo spazio più vicino
      sdiv.addEventListener('click', function (e) { if (e.target.closest('.slot') || e.target.closest('.w') || e.target === inp) return; const j = nearest(e.clientX, e.clientY); if (j >= 0) choose(j); });
      body.appendChild(sdiv);
      const gfHint = el('div', { class: 'hint gapfind-hint', text: 'Dove manca la parola? Passa il mouse sulla frase: lo spazio si apre. Clicca e scrivila.' });
      body.appendChild(gfHint);
      getAnswer = function () { return selected === -1 ? null : { index: selected, word: inp.value }; };
      // Aiuto in TRE stadi (v67, richiesta di Edoardo): (1) una zona gialla di 5 parole che CONTIENE il posto,
      // come nella "parola in più"; (2) il posto esatto (lo spazio si apre); (3) una lettera alla volta.
      let mzone = null;
      giveHint = function () {
        if (!mzone && selected !== d.missingIndex) {
          const ws = $$('.w', sdiv), n = ws.length;
          const size = Math.min(5, n);
          // lo spazio k sta FRA le parole k-1 e k: la zona [a, a+size-1] deve coprirlo, con scarto casuale
          let a = d.missingIndex - 1 - Math.floor(Math.random() * Math.max(1, size - 1));
          a = Math.max(0, Math.min(n - size, Math.min(a, d.missingIndex)));
          mzone = { from: a, to: a + size - 1 };
          ws.forEach(function (w, i) {
            const dentro = i >= mzone.from && i <= mzone.to;
            w.classList.toggle('zone', dentro);
            if (dentro) { w.classList.remove('zone-flash'); void w.offsetWidth; w.classList.add('zone-flash'); }
          });
          toast('La parola manca in mezzo alle parole segnate', 2500);
          return true;
        }
        if (selected !== d.missingIndex) {
          $$('.w.zone', sdiv).forEach(function (w) { w.classList.remove('zone', 'zone-flash'); });   // il posto esatto rende inutile la zona
          choose(d.missingIndex); slots[d.missingIndex].classList.add('hinted');
          return true;
        }
        return sameWord(inp.value, d.answer) ? false : revealLetter(inp, d.answer);
      };
      markResult = function (res) {
        inp.classList.toggle('ok', res.correct); inp.classList.toggle('bad', !res.correct);
        // v78 ('dopo che clicca su controlla le 5 parole rimangono gialle e non ha senso'): la zona dell'Aiuto
        // ha finito il suo lavoro quando il posto e' trovato — a risposta giusta, o quando la correzione stessa
        // dice 'il posto e' giusto'. Resta solo finche' il posto e' ancora da cercare.
        if (res.correct || !(res.detail && res.detail.index === false)) {
          $$('.w.zone', sdiv).forEach(function (w) { w.classList.remove('zone', 'zone-flash'); });
          mzone = null;
        }
        if (res.correct) {
          // la parola prende il posto dello spazio scelto, con l'animazione di ingresso; gli altri spazi diventano spazi normali
          const sl = slots[selected];
          inp.remove();
          const ins = starSpan(ls, d.tokens[d.missingIndex]); ins.classList.add('insert-in');
          sl.replaceWith(ins);
          slots.forEach(function (x) { if (x !== sl) x.replaceWith(document.createTextNode(' ')); });
          ins.parentNode.insertBefore(document.createTextNode(' '), ins); ins.parentNode.insertBefore(document.createTextNode(' '), ins.nextSibling);
          sdiv.classList.remove('gapfinder', 'nostar'); sdiv.style.color = 'var(--ok)';
          gfHint.remove();
        } else {
          const dt = res.detail || {};
          if (dt.index === false && selected >= 0) { const sl = slots[selected]; sl.classList.add('wrongpick'); setTimeout(function () { sl.classList.remove('wrongpick'); }, 900); }
          gfHint.textContent = dt.index === false ? 'Non è lì che manca la parola: guarda meglio dove la frase "salta".' : 'Il posto è giusto: la parola no. Riascolta.';
        }
      };
    } else if (ex.type === 'mc') {
      let selected = -1;   // indice ORIGINALE (quello salvato), non la posizione mostrata
      body.appendChild(el('div', { class: 'sentence question', text: d.question || '' }));
      const list = el('div', { class: 'mc-options' });
      const eliminated = new Set();
      // ordine delle risposte nuovo a ogni apertura: le lettere A-D seguono l'ordine mostrato, la correzione usa l'indice originale
      const order = EX.shuffle((d.options || []).map(function (o, k) { return k; }).filter(function (k) { return d.options[k]; }), Math.random);
      const render = function () {
        list.innerHTML = '';
        order.forEach(function (k, pos) {
          const b = el('button', { class: 'mc-opt' + (k === selected ? ' sel' : ''), 'data-k': String(k), text: String.fromCharCode(65 + pos) + '. ' + d.options[k], onclick: function () { selected = k; render(); } });
          if (eliminated.has(k)) { b.classList.add('elim'); b.disabled = true; }
          list.appendChild(b);
        });
      };
      render();
      body.appendChild(list);
      getAnswer = function () { return selected; };
      giveHint = function () {
        const cands = order.filter(function (k) { return k !== d.correct && !eliminated.has(k); });
        if (cands.length <= 1) return false;   // resta sempre almeno una sbagliata
        const notTricky = cands.filter(function (k) { return k !== d.tricky; });
        const pick = notTricky.length ? notTricky[0] : cands[0];
        eliminated.add(pick); if (selected === pick) selected = -1; render();
        return true;
      };
      markResult = function (res) {
        $$('.mc-opt', list).forEach(function (b) { const k = parseInt(b.getAttribute('data-k'), 10); if (res.correct && k === d.correct) b.classList.add('good'); else if (k === selected && !res.correct) { b.classList.add('wrongpick'); setTimeout(function () { b.classList.remove('wrongpick'); }, 900); } });
      };
    } else if (ex.type === 'extra' || ex.type === 'wrong') {
      let selected = -1;
      const chips = el('div', { class: 'chips' });
      const corr = el('input', { type: 'text', placeholder: 'Scrivi la parola giusta', autocomplete: 'off', autocapitalize: 'off', autocorrect: 'off', style: 'margin-top:10px;max-width:16em;display:none' });
      corr.addEventListener('keydown', function (e) { if (e.key === 'Enter') checkBtn.click(); });
      // L'aiuto indica una ZONA, non la parola: due o tre parole attorno a quella da trovare, che lampeggiano.
      // Indirizza lo sguardo senza rispondere al posto dello studente (richiesta di Edoardo, 3/9: "deve essere un
      // suggerimento che indirizza ma non suggerisce direttamente la parola"). Prima il vecchio aiuto sbiadiva
      // qualche parola ma ridisegnava i chip SENZA applicare lo sbiadimento: a schermo non succedeva niente.
      let zone = null;
      const render = function () {
        chips.innerHTML = '';
        d.shown.forEach(function (w, i) {
          const inZone = zone && i >= zone.from && i <= zone.to;
          chips.appendChild(el('span', { class: 'chip' + (i === selected ? ' sel' : '') + (inZone ? ' zone' : ''), text: w, onclick: function () { selected = (selected === i ? -1 : i); render(); if (ex.type === 'wrong' && selected !== -1) { corr.style.display = ''; corr.focus(); } } }));
        });
      };
      const flashZone = function () {
        $$('.chip.zone', chips).forEach(function (c) {
          c.classList.remove('zone-flash');
          void c.offsetWidth;   // riavvia l'animazione anche al secondo aiuto
          c.classList.add('zone-flash');
        });
      };
      render();
      body.appendChild(chips);
      if (ex.type === 'wrong') body.appendChild(corr);
      getAnswer = function () { return ex.type === 'extra' ? selected : { index: selected, correction: corr.value }; };
      giveHint = function () {
        const target = ex.type === 'extra' ? d.extraIndex : d.wrongIndex;
        if (ex.type === 'wrong' && selected === target) return sameWord(corr.value, d.answer) ? false : revealLetter(corr, d.answer);
        const n = d.shown.length;
        // la parola cercata NON sta sempre in mezzo alla zona, altrimenti la si indovina dalla posizione
        const makeZone = function (size, lo, hi) {
          size = Math.min(size, n);
          const off = Math.floor(Math.random() * size);
          let from = target - off;
          from = Math.max(lo, Math.min(hi - size + 1, from));
          from = Math.max(0, Math.min(n - size, from));
          return { from: from, to: from + size - 1 };
        };
        if (!zone) zone = makeZone(5, 0, n - 1);
        else if (zone.to - zone.from + 1 > 3) zone = makeZone(3, zone.from, zone.to);
        else if (ex.type === 'wrong') { selected = target; render(); corr.style.display = ''; corr.focus(); return true; }
        else return false;
        render();
        flashZone();
        toast('La parola in più è fra quelle segnate', 2500);
        return true;
      };
      markResult = function (res) {
        const all = $$('.chip', chips);
        const c = all[selected];
        if (res.correct) {
          // tutte verdi tranne la parola in più / sbagliata: rossa e barrata (per "sbagliata" accanto compare quella giusta)
          // v78: e la zona gialla dell'Aiuto si spegne — a esercizio risolto non indica piu' niente
          all.forEach(function (x, i) {
            x.classList.remove('sel', 'zone', 'zone-flash');
            if (i === selected) {
              x.classList.add('struck');
              if (!x.querySelector('.bad-w')) { const bw = el('span', { class: 'bad-w', text: x.textContent }); x.textContent = ''; x.appendChild(bw); }   // barrata SOLO la parola sbagliata
              if (ex.type === 'wrong' && !x.querySelector('.fix')) x.appendChild(el('span', { class: 'fix', text: ' → ' + d.answer }));
            }
            else x.classList.add('good');
          });
          starrableChips(ls, chips);
          if (ex.type === 'wrong') corr.remove();   // la parola giusta è già accanto a quella barrata
        }
        else if (c) { c.classList.add('wrongpick'); setTimeout(function () { c.classList.remove('wrongpick'); }, 900); }
        if (ex.type === 'wrong') { corr.classList.toggle('ok', !!(res.detail && res.detail.word)); corr.classList.toggle('bad', !(res.detail && res.detail.word)); }
      };
    }

    let solved = false;
    if (!giveHint) hintBtn.style.display = 'none';
    hintBtn.addEventListener('click', function () {
      if (solved || !giveHint) return;
      if (!giveHint()) { toast('Nessun altro aiuto possibile: controlla la risposta'); return; }
      if (opts.hints) opts.hints[ex.id] = (opts.hints[ex.id] || 0) + 1;
      fb.textContent = '';
    });
    const continueLabel = preview ? 'Chiudi anteprima' : 'Continua ▶';
    const onContinue = function () { if (preview) { if (opts.onClose) opts.onClose(); } else if (opts.onContinue) opts.onContinue(); };
    // a esercizio finito: la frase completa, con le parole cliccabili per la stella
    const showFull = function () {
      if (body.querySelector('.fullwrap')) return;
      const toks = L.tokenize(ex.sentence).map(function (t) { return t.raw; });
      const wrap = el('div', { class: 'fullwrap' }, [el('span', { class: 'hint', text: 'Frase completa (clicca una parola per salvarla con una stella ★): ' }), starredSentence(ls, toks)]);
      body.appendChild(wrap);
    };
    // v78, REGOLA di Edoardo ('questa cosa vale sempre, non solo per questo esercizio'): a esercizio risolto
    // ogni evidenziazione dell'Aiuto (zona gialla, parole/caselle segnate) si spegne — non indica piu' niente.
    // Vale per TUTTI i tipi, anche futuri: la pulizia sta qui nel percorso comune, non nei singoli markResult.
    const clearHintMarks = function () {
      $$('.zone, .zone-flash, .hinted, .excluded', body).forEach(function (x) { x.classList.remove('zone', 'zone-flash', 'hinted', 'excluded'); });
    };
    // v78 ('quando si clicca l'ultima parola ci sia l'autofeedback come se si fosse gia' cliccato su controlla'):
    // negli esercizi costruiti a CLICK (riordino, semplificato con le parole) la risposta completa e GIUSTA si
    // controlla da sola. Solo quando e' giusta: a frase completa ma sbagliata niente spam di 'Non ancora' mentre
    // lo studente sta ancora sistemando — il Controlla resta per farsi giudicare. NON vale per gli esercizi dove
    // si scrive (il controllo mentre digiti diventerebbe un correttore gratuito; li' 'ho finito' = Invio) ne' per
    // la scelta multipla (un tap partito male verrebbe giudicato subito).
    function maybeAutoCheck() {
      if (solved) return;
      const a = getAnswer();
      if (a == null || (Array.isArray(a) && !a.length)) return;
      if (EX.check(ex, a, { strict: strict }).correct) checkBtn.click();
    }
    checkBtn.addEventListener('click', function () {
      if (solved) return;
      const a = getAnswer();
      if (a == null || a === '' || a === -1 || (Array.isArray(a) && !a.length) || (typeof a === 'object' && !Array.isArray(a) && a.index === -1)) { fb.textContent = 'Prima rispondi.'; fb.style.color = 'var(--muted)'; return; }
      attempts[ex.id] = (attempts[ex.id] || 0) + 1;
      const res = EX.check(ex, a, { strict: strict });
      if (opts.onAttempt) opts.onAttempt(a, res.correct);   // v125: compiti con report (ogni risposta data finisce nel registro)
      markResult(res);
      if (res.correct) {
        solved = true;
        clearHintMarks();
        refreshTranslation();
        fb.textContent = '✓ Giusto!'; fb.style.color = 'var(--ok)';
        if (!ls.options || ls.options.fx !== false) celebrate(p, fb);
        if (opts.onDone) opts.onDone(true);
        checkBtn.style.display = 'none'; hintBtn.style.display = 'none'; solBtn.style.display = 'none'; skipBtn.style.display = 'none';
        actions.appendChild(el('button', { class: 'primary', text: continueLabel, onclick: onContinue }));
        // la frase completa in più solo se sopra non c'è (scelta multipla); negli altri tipi le parole sopra sono già cliccabili per la stella
        if (ex.type === 'mc') showFull();
        else { const ins = p.querySelector('.instr'); if (ins && ins.textContent.indexOf('★') === -1) ins.appendChild(document.createTextNode(' · Clicca una parola per salvarla con una stella ★: la ritrovi nel riepilogo finale.')); }   // appendChild, non textContent +=: la consegna del gapbank contiene un <b> (v66)
      } else {
        fb.textContent = '✗ Non ancora. Riascolta e riprova.'; fb.style.color = 'var(--bad)';
        if (attempts[ex.id] >= 2 || preview) solBtn.style.display = '';
      }
    });
    solBtn.addEventListener('click', function () {
      solved = true;
      clearHintMarks();
      refreshTranslation();
      fb.textContent = 'Soluzione: ' + EX.solution(ex); fb.style.color = 'var(--muted)';
      if (opts.onDone) opts.onDone(false);
      checkBtn.style.display = 'none'; hintBtn.style.display = 'none'; solBtn.style.display = 'none'; skipBtn.style.display = 'none';
      actions.appendChild(el('button', { class: 'primary', text: continueLabel, onclick: onContinue }));
      showFull();
    });
    skipBtn.addEventListener('click', function () { if (opts.onSkip) opts.onSkip(); });
  }

  /** Suono positivo (Web Audio, nessun file): arpeggio maggiore breve e morbido. */
  function playWinSound() {
    try {
      const AC = window.AudioContext || window.webkitAudioContext; if (!AC) return;
      S.audio = S.audio || new AC();
      const ctx = S.audio; if (ctx.state === 'suspended') ctx.resume();
      const now = ctx.currentTime;
      const master = ctx.createGain(); master.gain.value = 0.9; master.connect(ctx.destination);
      [[523.25, 0], [659.25, 0.09], [783.99, 0.18], [1046.5, 0.27]].forEach(function (n, i) {
        const o = ctx.createOscillator(), g = ctx.createGain();
        o.type = i === 3 ? 'triangle' : 'sine'; o.frequency.value = n[0];
        g.gain.setValueAtTime(0.0001, now + n[1]);
        g.gain.exponentialRampToValueAtTime(0.22, now + n[1] + 0.02);
        g.gain.exponentialRampToValueAtTime(0.0001, now + n[1] + (i === 3 ? 0.6 : 0.32));
        o.connect(g); g.connect(master); o.start(now + n[1]); o.stop(now + n[1] + 0.7);
      });
    } catch (e) { /* niente audio: pazienza */ }
  }
  /** Piccola festa: suono, coriandoli nel pannello, "Giusto!" grande che salta, pallino verde che pulsa. */
  function celebrate(panel, fb) {
    playWinSound();
    fb.classList.add('win');
    panel.classList.remove('win-flash'); void panel.offsetWidth; panel.classList.add('win-flash');
    const burst = el('div', { class: 'fx-burst' });
    const colors = ['#ff8a00', '#1f6feb', '#1a7f37', '#e5484d', '#f5c400', '#8e7cf3'];
    const rect = panel.getBoundingClientRect();
    const ox = Math.min(rect.width * 0.5, 320), oy = Math.min(rect.height * 0.55, 240);
    for (let i = 0; i < 28; i++) {
      const a = Math.random() * Math.PI * 2, dist = 90 + Math.random() * 170;
      const piece = el('div', { class: 'fx-piece', style: 'left:' + ox + 'px;top:' + oy + 'px;background:' + colors[i % colors.length] +
        ';--dx:' + Math.round(Math.cos(a) * dist) + 'px;--dy:' + Math.round(Math.sin(a) * dist + 60) + 'px;--rot:' + Math.round(Math.random() * 720 - 360) + 'deg;animation-delay:' + Math.round(Math.random() * 120) + 'ms' + (i % 3 === 0 ? ';border-radius:50%' : '') });
      burst.appendChild(piece);
    }
    panel.appendChild(burst);
    setTimeout(function () { burst.remove(); }, 1400);
    const dot = $('#s-progress .dot.cur'); if (dot) { dot.classList.add('ok', 'just'); }
  }

  // ---------- stelle (parole preferite) ----------
  function cleanWord(w) { return String(w || '').replace(/^[^\p{L}\p{N}]+|[^\p{L}\p{N}]+$/gu, '').toLowerCase(); }
  // Le stelle valgono per la sessione del video: si riparte da zero a ogni apertura, non si salvano nella lezione
  function saveStars() { /* solo in memoria (S.student.stars / S.editorStars) */ }
  function starStore(ls) { return (S.student && S.student.lesson === ls) ? S.student.stars : (S.editorStars = S.editorStars || {}); }
  function isStarred(ls, word) { return !!starStore(ls)[L.normalize(cleanWord(word))]; }
  function translationFor(ls, word) {
    const k = L.normalize(cleanWord(word));
    const v = vocabState(ls).words.find(function (w) { return L.normalize(w.word) === k; });
    return v ? (v.translation || '') : '';
  }
  function toggleStar(ls, word) {
    const w = cleanWord(word); if (!w) return false;
    const k = L.normalize(w), stars = starStore(ls);
    if (stars[k]) delete stars[k]; else stars[k] = { word: w, translation: translationFor(ls, w) };
    saveStars(ls, stars);
    refreshStarMarks(ls);
    updateStarCount();
    if (stars[k]) toast('★ "' + w + '" segnata: la ritrovi nel pulsante ★ in basso e nel riepilogo finale', 2500);
    return !!stars[k];
  }
  /**
   * Stella su una parola dentro una frase: parole stellate ADIACENTI diventano un'unica voce ("si stanno realmente
   * riscaldando"), non quattro voci separate. Togliendo la stella a una parola in mezzo, i pezzi ai lati restano.
   */
  function starClick(ls, span) {
    const scope = (span.closest && span.closest('.sentence')) || span.parentElement;
    if (!scope) return toggleStar(ls, span.textContent);
    const spans = starScopeSpans(scope);
    const idx = spans.indexOf(span); if (idx === -1) return toggleStar(ls, span.textContent);
    const norms = spans.map(function (x) { return x.getAttribute('data-w') || ''; });
    const on = spans.map(function (x) { return x.classList.contains('starred'); });
    const stars = starStore(ls);
    let a = idx, b = idx;
    while (a > 0 && on[a - 1] && norms[a - 1]) a--;
    while (b < spans.length - 1 && on[b + 1] && norms[b + 1]) b++;
    const keyOf = function (from, to) { return norms.slice(from, to + 1).join(' '); };
    const textOf = function (from, to) { return spans.slice(from, to + 1).map(function (x) { return cleanWord(x.textContent); }).join(' '); };
    // via tutte le voci che sono un pezzo contiguo della sequenza [a..b] (vecchie parole singole o frasi parziali)
    const seq = norms.slice(a, b + 1);
    Object.keys(stars).forEach(function (key) {
      const kw = key.split(' ');
      for (let i = 0; i + kw.length <= seq.length; i++) { if (kw.every(function (w, j) { return w === seq[i + j]; })) { delete stars[key]; break; } }
    });
    let added = null;
    if (on[idx]) {
      if (a < idx) stars[keyOf(a, idx - 1)] = { word: textOf(a, idx - 1), translation: translationFor(ls, textOf(a, idx - 1)) };
      if (b > idx) stars[keyOf(idx + 1, b)] = { word: textOf(idx + 1, b), translation: translationFor(ls, textOf(idx + 1, b)) };
    } else {
      added = textOf(a, b);
      stars[keyOf(a, b)] = { word: added, translation: translationFor(ls, added) };
    }
    saveStars(ls, stars);
    refreshStarMarks(ls);
    updateStarCount();
    if (added) toast('★ "' + added + '" segnata: la ritrovi nel pulsante ★ in basso e nel riepilogo finale', 2500);
    return !!added;
  }
  /** Le parole cliccabili di un contenitore, nell'ordine in cui si leggono. Dentro una .sentence si prendono TUTTE,
   * anche quelle avvolte in altri span (v66, 'ho cliccato "un essere vivente che di cellule ne ha miliardi" ma mi sono
   * ritrovato tre voci separate': a risposta giusta i gap diventano <span class="filled"> con dentro le loro .w, che
   * col vecchio filtro figli-diretti erano isole — i vicini si univano saltandole). Fuori da una .sentence (chip di
   * Parliamone, chip della banca) ogni elemento resta un contenitore a sé: quelle parole NON devono unirsi tra chip. */
  function starScopeSpans(scope) {
    if (scope.classList && scope.classList.contains('sentence')) return $$('.w', scope);
    return $$('.w', scope).filter(function (x) { return x.parentElement === scope; });
  }
  /** Segna come stellate le parole (o sequenze di parole) presenti nella lista, in tutte le frasi visibili. Idempotente. */
  function refreshStarMarks(ls) {
    if (!ls) return;
    const stars = starStore(ls);
    const keys = Object.keys(stars).map(function (k) { return k.split(' '); });
    const parents = new Set();
    $$('.w').forEach(function (x) { const sc = (x.closest && x.closest('.sentence')) || x.parentElement; if (sc) parents.add(sc); });
    parents.forEach(function (parent) {
      const spans = starScopeSpans(parent);
      const norms = spans.map(function (x) { return x.getAttribute('data-w') || ''; });
      const want = spans.map(function () { return false; });
      keys.forEach(function (kw) {
        for (let i = 0; i + kw.length <= norms.length; i++) { if (kw.every(function (w, j) { return w === norms[i + j]; })) { for (let j = 0; j < kw.length; j++) want[i + j] = true; } }
      });
      spans.forEach(function (x, i) { if (x.classList.contains('starred') !== want[i]) x.classList.toggle('starred', want[i]); });
    });
  }
  function updateStarCount() {
    const b = $('#btn-stars'); if (!b || !S.student) return;
    b.textContent = '★ ' + Object.keys(S.student.stars || {}).length;
  }
  $('#btn-stars').addEventListener('click', function () {
    const st = S.student; if (!st) return;
    const box = $('#stars-body'); box.innerHTML = '';
    renderWordList(box, st.lesson, st.stars);
    $('#dlg-stars').showModal();
  });
  $('#stars-close').addEventListener('click', function () { $('#dlg-stars').close(); updateStarCount(); });
  /** Parola cliccabile: un clic mette/toglie la stella. */
  /**
   * Correzione al volo di una parola durante la lezione (⌘/Alt + clic sulla parola): cambia la frase dell'esercizio
   * tenendo la struttura (stessi spazi, stessa parola in più/sbagliata/mancante) e salva la lezione.
   */
  function quickEditWord(ls, ex, node, panel) {
    const clicked = L.tokenize(node.textContent || '')[0];
    if (!clicked || !clicked.core) return;
    const core = clicked.core;
    const d = ex.data || {};
    const sameCore = function (a, b) { return L.normalize(a) === L.normalize(b); };
    // parola "artificiale" (in più / sostituita): si corregge quella, non la frase
    const isExtra = ex.type === 'extra' && sameCore(core, d.extraWord) && !L.tokenize(ex.sentence).some(function (t) { return sameCore(t.core, core); });
    const isSwap = ex.type === 'wrong' && sameCore(core, d.wrongWord) && !L.tokenize(ex.sentence).some(function (t) { return sameCore(t.core, core); });
    const nw = prompt('Correggi la parola "' + core + '"' + (isExtra ? ' (parola in più)' : isSwap ? ' (parola sostituita)' : '') + ':', core);
    if (nw == null) return;
    const clean = nw.trim();
    if (!clean || clean === core) return;
    const choices = {};
    let sentence = ex.sentence;
    if (!isExtra && !isSwap) {
      // quale occorrenza? la k-esima tra gli elementi con la stessa parola nel pannello = la k-esima nella frase
      const els = $$('.w, .chip', panel).filter(function (e) { const t = L.tokenize(e.textContent || '')[0]; return t && sameCore(t.core, core); });
      const k = Math.max(0, els.indexOf(node));
      const toks = L.tokenize(sentence);
      const cand = toks.map(function (t, i) { return { t: t, i: i }; }).filter(function (x) { return sameCore(x.t.core, core); });
      const target = cand[Math.min(k, cand.length - 1)];
      if (!target) return toast('Parola non trovata nella frase');
      toks[target.i].core = clean;
      sentence = toks.map(function (t) { return t.pre + t.core + t.post; }).join(' ');
    }
    const fix = function (w) { return sameCore(w, core) && !isExtra && !isSwap ? clean : w; };
    if (ex.type === 'gap' || ex.type === 'gapbank') {
      choices.gapWords = (d.answers || []).map(fix);
      if (ex.type === 'gapbank' && Array.isArray(d.wordBank)) choices.distractors = d.wordBank.filter(function (w) { return !(d.answers || []).some(function (a) { return sameCore(a, w); }); });
    } else if (ex.type === 'missing') choices.missingWord = fix(d.answer || '');
    else if (ex.type === 'extra') { choices.extraWord = isExtra ? clean : d.extraWord; choices.extraAfter = Math.max(0, (d.extraIndex | 0) - 1); }
    else if (ex.type === 'wrong') { choices.wrongWord = fix(d.answer || ''); choices.wrongReplacement = isSwap ? clean : d.wrongWord; }
    else if (ex.type === 'mc') { choices.question = d.question; choices.options = d.options; choices.correct = d.correct; choices.tricky = d.tricky; }
    const built = EX.buildExercise(ex.type, sentence, { lang: ls.lang, seed: Date.now() % 100000, choices: choices, vocab: lessonVocab(ls), distractors: gapExtraCount(ex) });
    if (!built) return toast('Con questa correzione l\'esercizio non si può ricostruire: usa "Modifica"');
    ex.sentence = sentence; ex.type = built.type; ex.data = built.data;
    if (S.lessons[ls.id]) touch(ls);
    toast('Parola corretta: "' + core + '" → "' + clean + '"' + (S.lessons[ls.id] ? ' (lezione salvata)' : ''));
    return true;
  }
  /** Più parole (es. uno spazio unito) → uno starSpan per parola. */
  function starSpans(ls, text) {
    const frag = document.createDocumentFragment();
    const parts = String(text || '').split(/\s+/).filter(Boolean);
    parts.forEach(function (w, i) { frag.appendChild(starSpan(ls, w)); if (i < parts.length - 1) frag.appendChild(document.createTextNode(' ')); });
    return frag;
  }
  /** A esercizio risolto i chip della frase diventano parole cliccabili per la stella (copia senza i vecchi gestori). */
  function starrableChips(ls, container) {
    $$('.chip', container).forEach(function (c) {
      if (c.classList.contains('struck')) { const fix = c.querySelector('.fix'); if (fix) { const word = fix.textContent.replace(/^\s*→\s*/, ''); const nf = el('span', { class: 'fix' }, [document.createTextNode(' → '), starSpan(ls, word)]); fix.replaceWith(nf); } return; }
      const word = c.textContent.trim();
      const w = cleanWord(word);
      const n = c.cloneNode(false);
      n.textContent = word;
      if (w) { n.classList.add('w'); n.setAttribute('data-w', L.normalize(w)); if (isStarred(ls, w)) n.classList.add('starred'); n.title = 'Clicca per mettere una stella (parola da ripassare); parole vicine stellate insieme = una frase'; n.addEventListener('click', function (e) { e.stopPropagation(); starClick(ls, n); }); }
      c.replaceWith(n);
    });
  }
  function starSpan(ls, word) {
    const w = cleanWord(word);
    if (!w) return document.createTextNode(word);
    const k = L.normalize(w);
    const sp = el('span', { class: 'w' + (isStarred(ls, w) ? ' starred' : ''), 'data-w': k, text: word, title: 'Clicca per mettere una stella (parola da ripassare); parole vicine stellate insieme = una frase' });
    // v175 (Edoardo: "la funzione di cliccare con la stella deve essere disponibile solo dopo che si è cliccato su
    // controlla e la risposta è corretta"): dentro una frase ancora da risolvere (.nostar) il clic sulla parola non fa
    // niente e NON viene fermato, così nella "parola mancante" un clic impreciso non mette stelle per sbaglio.
    sp.addEventListener('click', function (e) { if (sp.closest('.nostar')) return; e.stopPropagation(); starClick(ls, sp); });
    sp.addEventListener('mouseenter', function () { if (sp.closest('.nostar')) { if (sp.title) { sp._t = sp.title; sp.title = ''; } } else if (sp._t) { sp.title = sp._t; sp._t = ''; } });
    return sp;
  }
  function starredSentence(ls, tokens) {
    const d = el('div', { class: 'sentence full' });
    tokens.forEach(function (t, i) { d.appendChild(starSpan(ls, t)); if (i < tokens.length - 1) d.appendChild(document.createTextNode(' ')); });
    return d;
  }
  function starButton(ls, word) {
    const b = el('button', { class: 'star' + (isStarred(ls, word) ? ' on' : ''), text: '★', title: 'Parola da ripassare (stella)', onclick: function (e) { e.stopPropagation(); b.classList.toggle('on', toggleStar(ls, word)); } });
    return b;
  }

  // ---------- CONVERSAZIONE: unità da parlare, senza video (portfolio → foglio A4) ----------
  // Il pezzo che l'insegnante paga di più non sono le domande (venti secondi di AI) ma l'impaginato:
  // lessico, sondaggi, foto, testi e telefonata su due pagine A4 pronte da fotocopiare.
  const CONV_LANGS = [['it', 'Italiano'], ['en', 'Inglese'], ['es', 'Spagnolo'], ['fr', 'Francese'], ['de', 'Tedesco'], ['pt', 'Portoghese']];
  function langOpts(sel, val) {
    if (!sel) return;
    sel.innerHTML = '';
    CONV_LANGS.forEach(function (l) { sel.appendChild(el('option', { value: l[0], text: l[1] })); });
    sel.value = val || 'it';
  }
  function blankConv(over) {
    return Object.assign({
      id: 'c1', title: '', topic: '', level: 'B1', lang: 'it', uiLang: 'en', focus: '', n: 10,
      vocab: [], questions: [], charts: [], texts: [], roleplay: null, photos: []
    }, over || {});
  }
  function newConversation(unit) {
    const u = blankConv(unit);
    const ls = { id: uid(), title: u.title || u.topic || '', conv: u, updatedAt: new Date().toISOString() };
    S.lessons[ls.id] = ls; saveLessons();
    openConvEditor(ls.id);
    return ls;
  }
  /** Dialog "Nuova conversazione": chiede argomento, livello, quante domande, le due lingue e il focus. */
  function openConvNew() {
    const d = $('#dlg-conv-new');
    langOpts($('#cn-lang'), 'it'); langOpts($('#cn-uilang'), 'en');
    $('#cn-msg').textContent = '';
    $('#cn-go').disabled = false;
    d.showModal();
    $('#cn-topic').focus();
  }
  $('#btn-new-conv').addEventListener('click', openConvNew);
  $('#cn-close').addEventListener('click', function () { $('#dlg-conv-new').close(); });
  // ✕ in alto a destra su OGNI dialog (v66, 'non c'è un pulsante x o chiudi'): su una finestra bassa i pulsanti
  // in fondo possono stare fuori dallo schermo; la ✕ sta nell'angolo, sempre in vista all'apertura.
  $$('dialog').forEach(function (d) {
    d.appendChild(el('button', { class: 'dlg-x', type: 'button', title: 'Chiudi', text: '✕', onclick: function () { d.close(); } }));
  });
  $('#cn-blank').addEventListener('click', function () {
    $('#dlg-conv-new').close();
    newConversation({ topic: $('#cn-topic').value.trim(), level: $('#cn-level').value, lang: $('#cn-lang').value, uiLang: $('#cn-uilang').value, focus: $('#cn-focus').value.trim(), n: +$('#cn-n').value || 10 });
  });
  /** Messaggio di stato con la rotellina davanti: si vede che il lavoro sta andando avanti (v66). */
  function busyMsg(node, text) { node.textContent = ''; node.appendChild(el('span', { class: 'spinner inline' })); node.appendChild(document.createTextNode(text)); }
  $('#cn-go').addEventListener('click', function () {
    const topic = $('#cn-topic').value.trim();
    if (!topic) { $('#cn-msg').textContent = 'Scrivi prima di che cosa si parla.'; $('#cn-topic').focus(); return; }
    if (!S.settings.apiKey) { $('#cn-msg').textContent = 'Serve la chiave API (Impostazioni AI) oppure parti da un foglio vuoto.'; return; }
    const params = {
      topic: topic, level: $('#cn-level').value, n: +$('#cn-n').value || 10,
      lang: $('#cn-lang').value, uiLang: $('#cn-uilang').value, focus: $('#cn-focus').value.trim(),
      parts: { charts: $('#cn-charts').checked, texts: $('#cn-texts').checked, roleplay: $('#cn-role').checked },
      apiKey: S.settings.apiKey, model: S.settings.model
    };
    const wantPhotos = $('#cn-photos').checked;
    $('#cn-go').disabled = true;
    busyMsg($('#cn-msg'), 'Scrivo l\'unità… (lessico, domande, sondaggi, testi: una ventina di secondi)');
    AI.generateConvUnit(params).then(function (r) {
      $('#dlg-conv-new').close();
      const ls = newConversation(Object.assign(r.unit, { n: params.n }));
      ls.title = r.unit.title;
      ls.conv._autoFit = true;   // contenuto dell'AI: se il foglio sfora, l'app si regola da sola (v66)
      $('#c-title').value = ls.title;
      toast('Unità pronta' + (r.ai && r.ai.cost ? ' · ' + (r.ai.cost * 100).toFixed(1) + ' cent' : ''), 3500);
      if (wantPhotos && r.unit.photos.length) fillConvPhotos(ls);
    }).catch(function (e) {
      $('#cn-go').disabled = false;
      $('#cn-msg').textContent = 'AI: ' + e.message;
    });
  });
  /** Foto delle scene: cerca su Wikipedia/Commons con la query inglese scritta dall'AI. Scene di vita quotidiana
   *  su Commons si trovano a fatica: quello che non esce si mette a mano con "Altra foto" o incollando un URL. */
  function fillConvPhotos(ls) {
    const u = ls.conv; if (!u || !u.photos.length) return;
    toast('Cerco le foto…', 2000);
    let found = 0;
    const steps = u.photos.map(function (ph) {
      return function () {
        return searchImages('en', ph.query, '').then(function (list) {
          ph._imgs = list; ph._imgIdx = 0;
          if (list.length) { ph.url = list[0].url; found++; }
        }).catch(function () { /* la foto si mette a mano */ });
      };
    });
    steps.reduce(function (pr, f) { return pr.then(f); }, Promise.resolve()).then(function () {
      touch(ls);
      if (S.view === 'conv') renderConvFields(ls);
      toast(found + ' foto su ' + u.photos.length + (found < u.photos.length ? ' · le altre mettile a mano (Altra foto o URL)' : ''), 4000);
    });
  }
  function openConvEditor(id) {
    const ls = S.lessons[id]; if (!ls || !ls.conv) return renderHome();
    S.currentId = id;
    show('conv');
    undoOpen(ls);
    const u = ls.conv;
    const ti = $('#c-title'); ti.value = ls.title || '';
    ti.onchange = function () { ls.title = ti.value.trim(); u.title = ls.title; touch(ls); };
    langOpts($('#c-lang'), u.lang); langOpts($('#c-uilang'), u.uiLang);
    $('#c-topic').value = u.topic || ''; $('#c-level').value = u.level || 'B1';
    $('#c-focus').value = u.focus || ''; $('#c-n').value = u.n || (u.questions || []).length || 10;
    [['#c-topic', 'topic'], ['#c-level', 'level'], ['#c-lang', 'lang'], ['#c-uilang', 'uiLang'], ['#c-focus', 'focus']].forEach(function (pair) {
      $(pair[0]).onchange = function () { u[pair[1]] = $(pair[0]).value.trim ? $(pair[0]).value.trim() : $(pair[0]).value; touch(ls); };
    });
    $('#c-n').onchange = function () { u.n = Math.max(3, Math.min(14, +$('#c-n').value || 10)); touch(ls); };
    renderConvFields(ls);
  }
  function convKey() { return S.settings.apiKey; }
  /** Un pezzo solo, rigenerato con l'AI: il resto dell'unità non si tocca. */
  function convRegen(ls, what, opts, apply) {
    if (!convKey()) return toast('Serve la chiave API (Impostazioni AI)', 4000);
    const btn = opts.btn;
    if (btn) { btn.disabled = true; btn.textContent = '…'; }
    AI.regenerateConvPart(Object.assign({ what: what, unit: ls.conv, apiKey: convKey(), model: S.settings.model }, opts))
      .then(function (r) { apply(r.value); touch(ls); renderConvFields(ls); toast('Fatto' + (r.ai && r.ai.cost ? ' · ' + (r.ai.cost * 100).toFixed(2) + ' cent' : '')); })
      .catch(function (e) { toast('AI: ' + e.message, 6000); })
      .then(function () { if (btn) { btn.disabled = false; btn.textContent = '✨'; } });
  }
  function sparkle(title, onclick) { return el('button', { class: 'small ai', text: '✨', title: title, onclick: onclick }); }
  function convCard(title, hint, body, extra) {
    return el('div', { class: 'card conv-card' },
      el('div', { class: 'row' }, el('h3', { class: 'grow', style: 'margin:0', text: title }), extra || null),
      hint ? el('p', { class: 'hint', text: hint }) : null, body);
  }
  function renderConvFields(ls) {
    const u = ls.conv, host = $('#c-fields'); if (!host) return;
    keepScroll(function () {
      host.innerHTML = '';
      const changed = function () { touch(ls); };

      // --- lessico utile
      const vb = el('div', { class: 'conv-vocab' });
      u.vocab.forEach(function (w, i) {
        vb.appendChild(el('div', { class: 'row conv-row' },
          el('input', { class: 'grow', value: w.it, placeholder: 'parola o espressione (usa ≠ per i contrari, / per i sinonimi)', onchange: function (e) { w.it = e.target.value.trim(); changed(); } }),
          el('input', { class: 'grow', value: w.en, placeholder: 'glossa', onchange: function (e) { w.en = e.target.value.trim(); changed(); } }),
          el('button', { class: 'small danger', text: '✕', title: 'Togli la parola', onclick: function () { u.vocab.splice(i, 1); changed(); renderConvFields(ls); undoBarFor('parola'); } })));
      });
      host.appendChild(convCard('Lessico utile', u.vocab.length + ' voci · vanno nella colonna di sinistra del foglio', vb,
        el('span', { class: 'row' },
          el('button', { class: 'small', text: '+ parola', onclick: function () { u.vocab.push({ it: '', en: '' }); changed(); renderConvFields(ls); } }),
          sparkle('Chiedi all\'AI altre parole per questo argomento', function (e) {
            convRegen(ls, 'vocab', { btn: e.target, count: 6, avoid: u.vocab.map(function (w) { return w.it; }) }, function (v) {
              (Array.isArray(v.vocab) ? v.vocab : []).forEach(function (w) { if (w && w.it) u.vocab.push({ it: String(w.it).trim(), en: String(w.en || '').trim() }); });
            });
          }))));

      // --- domande
      const REFS = [['', 'niente'], ['photo', 'guarda la foto'], ['chart1', 'guarda il sondaggio 1'], ['chart2', 'guarda il sondaggio 2'], ['text1', 'leggi il testo 1'], ['text2', 'leggi il testo 2']];
      const qb = el('div');
      u.questions.forEach(function (q, i) {
        const grow = function (t) { t.style.height = 'auto'; t.style.height = (t.scrollHeight + 2) + 'px'; };
        const qi = el('textarea', { class: 'af-in q', rows: '2', placeholder: 'Domanda ' + (i + 1) });
        qi.value = q.text || '';
        qi.addEventListener('input', function () { grow(qi); });
        qi.addEventListener('change', function () { q.text = qi.value.trim(); changed(); });
        requestAnimationFrame(function () { grow(qi); });
        const sel = el('select', { class: 'small', title: 'Che cosa deve guardare o leggere lo studente', onchange: function (e) { q.ref = e.target.value; changed(); } });
        REFS.forEach(function (r) { sel.appendChild(el('option', { value: r[0], text: r[1] })); });
        sel.value = q.ref || '';
        qb.appendChild(el('div', { class: 'conv-q' },
          el('div', { class: 'row' }, el('span', { class: 'qn', text: (i + 1) + '.' }), qi,
            sparkle('Rigenera questa domanda con l\'AI', function (e) {
              convRegen(ls, 'question', { btn: e.target, avoid: u.questions.map(function (x) { return x.text; }) }, function (v) {
                if (v && v.text) { q.text = String(v.text).trim(); q.help = String(v.help || '').trim(); }
              });
            }),
            el('button', { class: 'small danger', text: '✕', title: 'Togli la domanda', onclick: function () { u.questions.splice(i, 1); changed(); renderConvFields(ls); undoBarFor('domanda'); } })),
          el('div', { class: 'row' }, el('span', { class: 'qn' }),
            el('input', { class: 'grow', value: q.help || '', placeholder: 'Per rispondere puoi usare: … · … · …', onchange: function (e) { q.help = e.target.value.trim(); changed(); } }), sel)));
      });
      host.appendChild(convCard('Domande', 'Nell\'ordine in cui le farai in classe: si stampano numerate nella colonna larga.', qb,
        el('span', { class: 'row' },
          el('button', { class: 'small', text: '+ domanda', onclick: function () { u.questions.push({ text: '', help: '', ref: '' }); changed(); renderConvFields(ls); } }),
          sparkle('Aggiungi una domanda scritta dall\'AI', function (e) {
            convRegen(ls, 'question', { btn: e.target, avoid: u.questions.map(function (x) { return x.text; }) }, function (v) {
              if (v && v.text) u.questions.push({ text: String(v.text).trim(), help: String(v.help || '').trim(), ref: '' });
            });
          }))));

      // --- sondaggi: i numeri sono inventati, e il foglio lo dichiara
      const cb = el('div');
      u.charts.forEach(function (c, ci) {
        const rows = el('div', { class: 'conv-chart-rows' });
        c.rows.forEach(function (r, ri) {
          rows.appendChild(el('div', { class: 'row conv-row' },
            el('input', { class: 'grow', value: r.label, placeholder: 'voce', onchange: function (e) { r.label = e.target.value.trim(); changed(); } }),
            el('input', { type: 'number', min: '0', max: '100', value: r.pct, style: 'width:80px', onchange: function (e) { r.pct = Math.max(0, Math.min(100, +e.target.value || 0)); changed(); } }),
            el('span', { class: 'hint', text: '%' }),
            el('button', { class: 'small danger', text: '✕', onclick: function () { c.rows.splice(ri, 1); changed(); renderConvFields(ls); undoBarFor('voce'); } })));
        });
        const srcSel = el('select', { class: 'small', onchange: function (e) { c.source = e.target.value; changed(); renderConvFields(ls); } });
        srcSel.appendChild(el('option', { value: 'invented', text: 'dati inventati (stampati, con l\'etichetta)' }));
        srcSel.appendChild(el('option', { value: 'class', text: 'da riempire in classe (barre vuote)' }));
        srcSel.value = c.source || 'invented';
        cb.appendChild(el('div', { class: 'conv-chart' },
          el('div', { class: 'row' },
            el('input', { class: 'grow', value: c.title, placeholder: 'Domanda del sondaggio', onchange: function (e) { c.title = e.target.value.trim(); changed(); } }),
            srcSel,
            sparkle('Rigenera questo sondaggio con l\'AI', function (e) {
              convRegen(ls, 'chart', { btn: e.target, avoid: u.charts.map(function (x) { return x.title; }) }, function (v) {
                if (v && v.title) { c.title = String(v.title).trim(); c.rows = (Array.isArray(v.rows) ? v.rows : []).map(function (r) { return { label: String(r.label || '').trim(), pct: Math.max(0, Math.min(100, Math.round(+r.pct) || 0)) }; }).filter(function (r) { return r.label; }); }
              });
            }),
            el('button', { class: 'small danger', text: '✕', title: 'Togli il sondaggio', onclick: function () { u.charts.splice(ci, 1); changed(); renderConvFields(ls); undoBarFor('sondaggio'); } })),
          rows,
          el('button', { class: 'small', text: '+ voce', onclick: function () { c.rows.push({ label: '', pct: 0 }); changed(); renderConvFields(ls); } })));
      });
      host.appendChild(convCard('Sondaggi', 'Le percentuali le inventa l\'AI: nel foglio compaiono con la scritta "dati di esempio per la discussione". Se vuoi numeri veri, metti il sondaggio su "da riempire in classe" e contate i voti alla lavagna.', cb,
        el('button', { class: 'small', text: '+ sondaggio', onclick: function () { u.charts.push({ title: '', source: 'invented', rows: [] }); changed(); renderConvFields(ls); } })));

      // --- testi
      const tb = el('div');
      u.texts.forEach(function (t, ti2) {
        const body = el('textarea', { class: 'af-in', rows: '6', placeholder: 'Testo' });
        body.value = t.body || '';
        body.addEventListener('change', function () { t.body = body.value.trim(); changed(); });
        tb.appendChild(el('div', { class: 'conv-text' },
          el('div', { class: 'row' },
            el('span', { class: 'badge', text: (ti2 + 1) + ' · ' + (t.kind === 'article' ? 'articolo' : 'intervista') }),
            el('input', { class: 'grow', value: t.title || '', placeholder: t.kind === 'article' ? 'Titolo di sezione' : 'La frase tra virgolette', onchange: function (e) { t.title = e.target.value.trim(); changed(); } }),
            sparkle('Riscrivi questo testo con l\'AI', function (e) {
              convRegen(ls, 'text', { btn: e.target, kind: t.kind, avoid: [t.body] }, function (v) {
                if (v && v.body) { t.title = String(v.title || t.title).trim(); t.who = String(v.who || t.who || '').trim(); t.body = String(v.body).trim(); t.quote = String(v.quote || t.quote || '').trim(); }
              });
            }),
            el('button', { class: 'small danger', text: '✕', title: 'Togli il testo', onclick: function () { u.texts.splice(ti2, 1); changed(); renderConvFields(ls); undoBarFor('testo'); } })),
          t.kind === 'interview' ? el('input', { class: 'grow', value: t.who || '', placeholder: 'Nome Cognome, NN anni, mestiere', onchange: function (e) { t.who = e.target.value.trim(); changed(); } }) : null,
          body,
          t.kind === 'article' ? el('input', { class: 'grow', value: t.quote || '', placeholder: 'La frase da stampare grande in prima pagina', onchange: function (e) { t.quote = e.target.value.trim(); changed(); } }) : null));
      });
      host.appendChild(convCard('Testi da leggere', 'Le persone di questi testi sono personaggi inventati per la classe: il foglio lo scrive in fondo, così nessuno li cerca come fonti vere.', tb,
        el('span', { class: 'row' },
          el('button', { class: 'small', text: '+ intervista', onclick: function () { u.texts.push({ kind: 'interview', title: '', who: '', body: '', quote: '', fiction: true }); changed(); renderConvFields(ls); } }),
          el('button', { class: 'small', text: '+ articolo', onclick: function () { u.texts.push({ kind: 'article', title: '', who: '', body: '', quote: '', fiction: true }); changed(); renderConvFields(ls); } }))));

      // --- telefonata di ruolo
      const rp = u.roleplay;
      const rb = el('div');
      if (rp) {
        const intro = el('textarea', { class: 'af-in', rows: '2' });
        intro.value = rp.intro || '';
        intro.addEventListener('change', function () { rp.intro = intro.value.trim(); changed(); });
        rb.appendChild(intro);
        [0, 1, 2].forEach(function (k) {
          rb.appendChild(el('div', { class: 'row conv-row' }, el('span', { class: 'qn', text: '◆' }),
            el('input', { class: 'grow', value: rp.steps[k] || '', placeholder: 'passo ' + (k + 1), onchange: function (e) { rp.steps[k] = e.target.value.trim(); changed(); } })));
        });
      } else {
        rb.appendChild(el('p', { class: 'hint', text: 'Nessuna telefonata: è l\'ultimo esercizio della pagina 2.' }));
      }
      host.appendChild(convCard('Telefonata di ruolo', 'Un amico nei guai per colpa dell\'argomento: lo studente telefona e fa tre cose.', rb,
        el('span', { class: 'row' },
          rp ? el('button', { class: 'small danger', text: '✕ Togli', onclick: function () { u.roleplay = null; changed(); renderConvFields(ls); undoBarFor('telefonata'); } }) : null,
          sparkle('Scrivi o riscrivi la telefonata con l\'AI', function (e) {
            convRegen(ls, 'roleplay', { btn: e.target, avoid: rp ? [rp.intro] : [] }, function (v) {
              if (v && v.intro) u.roleplay = { intro: String(v.intro).trim(), steps: (Array.isArray(v.steps) ? v.steps : []).map(function (x) { return String(x).trim(); }).filter(Boolean).slice(0, 3) };
            });
          }))));

      // --- foto
      const SLOTS = [['top', 'in alto (pagina 1)'], ['mid', 'in mezzo (pagina 1)'], ['role', 'accanto alla telefonata (pagina 2)']];
      const pb = el('div');
      u.photos.forEach(function (ph, pi) {
        const slot = el('select', { class: 'small', onchange: function (e) { ph.slot = e.target.value; changed(); } });
        SLOTS.forEach(function (sl) { slot.appendChild(el('option', { value: sl[0], text: sl[1] })); });
        slot.value = ph.slot || 'top';
        pb.appendChild(el('div', { class: 'conv-photo' },
          el('div', { class: 'thumbimg' }, ph.url ? el('img', { src: ph.url, alt: '', referrerpolicy: 'no-referrer' }) : el('span', { class: 'hint', text: 'nessuna foto' })),
          el('div', { class: 'grow' },
            el('div', { class: 'row' }, slot,
              el('input', { class: 'grow', value: ph.query || '', placeholder: 'ricerca in inglese, es. "open fridge full of food"', onchange: function (e) { ph.query = e.target.value.trim(); ph._imgs = null; changed(); } }),
              el('button', { class: 'small', text: '🔍 Cerca', onclick: function () { convFindPhoto(ls, ph, false); } }),
              el('button', { class: 'small', text: 'Altra foto', onclick: function () { convFindPhoto(ls, ph, true); } }),
              el('button', { class: 'small danger', text: '✕', onclick: function () { u.photos.splice(pi, 1); changed(); renderConvFields(ls); undoBarFor('foto'); } })),
            el('div', { class: 'row' },
              el('input', { class: 'grow', value: ph.url || '', placeholder: 'oppure incolla l\'URL di un\'immagine', onchange: function (e) { ph.url = e.target.value.trim(); changed(); renderConvFields(ls); } }),
              el('input', { class: 'grow', value: ph.alt || '', placeholder: 'che cosa mostra la foto', onchange: function (e) { ph.alt = e.target.value.trim(); changed(); } })))));
      });
      host.appendChild(convCard('Foto', 'Le cerca su Wikipedia e Wikimedia Commons, che di scene di vita quotidiana ne hanno poche: se non esce niente di buono, incolla l\'URL di una foto tua.', pb,
        el('button', { class: 'small', text: '+ foto', onclick: function () { u.photos.push({ slot: 'top', query: '', alt: '', url: '' }); changed(); renderConvFields(ls); } })));
    });
  }
  function convFindPhoto(ls, ph, next) {
    const q = String(ph.query || '').trim();
    if (!q) return toast('Scrivi prima che cosa cercare (in inglese)');
    const go = function () {
      const list = ph._imgs || [];
      if (!list.length) return toast('Niente per "' + q + '" su Wikipedia e Commons: cambia le parole o incolla l\'URL di una foto tua', 5000);
      ph._imgIdx = next ? ((ph._imgIdx || 0) + 1) % list.length : 0;
      ph.url = list[ph._imgIdx].url;
      touch(ls); renderConvFields(ls);
      toast((ph._imgIdx + 1) + '/' + list.length + ' · ' + list[ph._imgIdx].title, 2500);
    };
    if (ph._imgs && ph._imgsFor === q) return go();
    toast('Cerco "' + q + '"…', 1500);
    searchImages('en', q, '').then(function (list) { ph._imgs = list; ph._imgsFor = q; ph._imgIdx = -1; go(); });
  }
  $('#c-save').addEventListener('click', function () { saveLessons(); renderHome(); });
  $('#c-print').addEventListener('click', function () { const ls = current(); if (ls && ls.conv) openConvPrint(ls.id); });
  $('#c-delete').addEventListener('click', function () {
    const ls = current(); if (!ls) return;
    if (!confirm('Eliminare "' + (ls.title || 'conversazione senza titolo') + '"?')) return;
    deleteLesson(ls);
  });
  $('#c-regen').addEventListener('click', function () {
    const ls = current(); if (!ls || !ls.conv) return;
    if (!convKey()) return toast('Serve la chiave API (Impostazioni AI)', 4000);
    const u = ls.conv;
    if (!u.topic) return toast('Scrivi prima l\'argomento');
    if ((u.questions.length || u.vocab.length) && !confirm('Rigenerare tutta l\'unità? Quello che c\'è adesso viene sostituito (si annulla con Ctrl+Z).')) return;
    const btn = $('#c-regen'); btn.disabled = true; btn.textContent = '… scrivo l\'unità';
    AI.generateConvUnit({ topic: u.topic, level: u.level, n: u.n || 10, lang: u.lang, uiLang: u.uiLang, focus: u.focus, apiKey: convKey(), model: S.settings.model })
      .then(function (r) {
        Object.assign(u, r.unit, { n: u.n });
        ls.title = u.title; $('#c-title').value = ls.title;
        touch(ls); renderConvFields(ls);
        toast('Unità rigenerata' + (r.ai && r.ai.cost ? ' · ' + (r.ai.cost * 100).toFixed(1) + ' cent' : '') + ' · annulla con ' + undoKeyLabel(), 5000);
        if (u.photos.length) fillConvPhotos(ls);
      })
      .catch(function (e) { toast('AI: ' + e.message, 6000); })
      .then(function () { btn.disabled = false; btn.textContent = '✨ Rigenera tutta l\'unità'; });
  });

  // ---------- CONVERSAZIONE: il foglio A4 ----------
  function openConvPrint(id) {
    const ls = S.lessons[id]; if (!ls || !ls.conv) return renderHome();
    S.currentId = id;
    show('convprint');
    renderConvSheet(ls);
  }
  $('#cp-back').addEventListener('click', function () { const ls = current(); if (ls) openConvEditor(ls.id); });
  $('#cp-print').addEventListener('click', function () { window.print(); });
  $('#cp-photos').addEventListener('change', function () { const ls = current(); if (ls && ls.conv) renderConvSheet(ls); });
  function photoBySlot(u, slot) { return (u.photos || []).find(function (p) { return p.slot === slot && p.url; }) || null; }
  function chartBox(c, n) {
    const blank = c.source === 'class';
    const box = el('div', { class: 'cp-chart' },
      el('div', { class: 'cp-chart-h' }, el('b', { text: c.title }), el('span', { class: 'cp-ref', text: '→ dom. ' + (n || '') })),
      el('div', { class: 'cp-rows' }, c.rows.map(function (r) {
        return el('div', { class: 'cp-row' },
          el('span', { class: 'lb', text: r.label }),
          el('span', { class: 'bar' }, el('i', { style: 'width:' + (blank ? 0 : r.pct) + '%' })),
          el('span', { class: 'pc', text: blank ? '' : r.pct + '%' }));
      })));
    box.appendChild(el('div', { class: 'cp-note', text: blank ? 'contate i voti della classe e riempite le barre' : 'dati di esempio per la discussione, non un sondaggio reale' }));
    return box;
  }
  function paras(text) { return String(text || '').split(/\n{2,}|\n/).map(function (x) { return x.trim(); }).filter(Boolean); }
  function renderConvSheet(ls) {
    const u = ls.conv, sheet = $('#cp-sheet'); if (!sheet) return;
    const withPhotos = $('#cp-photos') ? $('#cp-photos').checked : true;
    const num = function (kind, which) {
      const i = u.questions.findIndex(function (q) { return q.ref === which; });
      return i === -1 ? '' : (i + 1);
    };
    sheet.innerHTML = '';
    const title = ls.title || u.title || u.topic || 'Conversazione';
    const lvl = u.level || 'B1';
    const foot = function (n) { return el('div', { class: 'cp-foot' }, el('span', { class: 'grow', text: title + ' · livello ' + lvl }), el('span', { text: String(n) })); };

    // ---- pagina 1
    const p1 = el('div', { class: 'cp-page' });
    p1.appendChild(el('div', { class: 'cp-head' },
      el('span', { class: 'cp-num', text: '1' }),
      el('h1', { class: 'grow', text: title }),
      el('span', { class: 'cp-lvl' }, 'livello ', el('b', { text: lvl }))));

    const left = el('div', { class: 'cp-left' });
    if (u.vocab.length) {
      left.appendChild(el('div', { class: 'cp-box' },
        el('div', { class: 'cp-box-h', text: 'Lessico utile' }),
        el('ul', { class: 'cp-vocab' }, u.vocab.map(function (w) { return el('li', { text: w.it, title: w.en }); }))));
    }
    u.charts.forEach(function (c, i) { left.appendChild(chartBox(c, num('chart', 'chart' + (i + 1)))); });
    const quoteText = (u.texts.find(function (t) { return t.quote; }) || {}).quote;
    if (quoteText) {
      left.appendChild(el('div', { class: 'cp-quote' },
        el('p', { text: '«' + quoteText.replace(/^[«"']+|[»"']+$/g, '') + '»' }),
        el('span', { class: 'cp-src', text: '— dal testo n. 2, pag. 2' })));
    }

    const right = el('div', { class: 'cp-right' });
    const ph1 = withPhotos ? photoBySlot(u, 'top') : null;
    if (ph1) right.appendChild(el('figure', { class: 'cp-photo' }, el('img', { src: ph1.url, alt: ph1.alt || '', referrerpolicy: 'no-referrer' })));
    // le domande si spezzano attorno alla seconda foto: quelle che rimandano a una foto la vogliono vicina
    const midAt = u.questions.findIndex(function (q, i) { return i > 1 && q.ref === 'photo'; });
    const cut = midAt === -1 ? Math.ceil(u.questions.length / 2) : midAt;
    const qlist = function (from, to) {
      return el('ol', { class: 'cp-q', start: String(from + 1) }, u.questions.slice(from, to).map(function (q) {
        const li = el('li', {}, el('span', { text: q.text }));
        // la domanda che parla del sondaggio dice DOVE sta (v66, 'questo non ha minimo senso': sotto la domanda
        // del grafico c'era una foto, e il grafico stava a sinistra senza che la domanda lo dicesse)
        const m = /^chart([12])$/.exec(q.ref || '');
        if (m) li.appendChild(el('span', { class: 'cp-qref', text: ' ← sondaggio ' + m[1] + ', a sinistra' }));
        return li;
      }));
    };
    right.appendChild(qlist(0, cut));
    // la foto di meta' pagina sta in mezzo alle domande SOLO se li' c'e' una domanda che la guarda (ref "photo"):
    // piazzata a meta' "perche' si'" si incollava alla domanda sbagliata (v66, la foto sotto la domanda del grafico)
    const ph2 = withPhotos ? photoBySlot(u, 'mid') : null;
    if (ph2 && midAt !== -1) right.appendChild(el('figure', { class: 'cp-photo' }, el('img', { src: ph2.url, alt: ph2.alt || '', referrerpolicy: 'no-referrer' })));
    right.appendChild(qlist(cut, u.questions.length));
    if (ph2 && midAt === -1) right.appendChild(el('figure', { class: 'cp-photo' }, el('img', { src: ph2.url, alt: ph2.alt || '', referrerpolicy: 'no-referrer' })));

    p1.appendChild(el('div', { class: 'cp-cols' }, left, right));
    p1.appendChild(foot(1));
    sheet.appendChild(p1);

    // ---- pagina 2
    const p2 = el('div', { class: 'cp-page' });
    p2.appendChild(el('div', { class: 'cp-band' }, el('span', { class: 'cp-num sm', text: '2' }), el('b', { text: title })));
    if (u.roleplay) {
      const rp = el('div', { class: 'cp-role' },
        el('div', { class: 'cp-role-txt' },
          el('div', { class: 'cp-role-n', text: (u.questions.length + 1) + '.' }),
          el('div', {}, el('p', { text: u.roleplay.intro }),
            el('ul', { class: 'cp-steps' }, u.roleplay.steps.map(function (st2) { return el('li', { text: st2 }); })))));
      const ph3 = withPhotos ? photoBySlot(u, 'role') : null;
      if (ph3) rp.appendChild(el('figure', { class: 'cp-photo side' }, el('img', { src: ph3.url, alt: ph3.alt || '', referrerpolicy: 'no-referrer' })));
      p2.appendChild(rp);
    }
    u.texts.forEach(function (t, i) {
      const bodyCols = el('div', { class: 'cp-body' }, paras(t.body).map(function (x) { return el('p', { text: x }); }));
      if (t.kind === 'article') {
        p2.appendChild(el('div', { class: 'cp-text article' },
          el('div', { class: 'cp-tab' }, el('span', { class: 'cp-tn', text: String(i + 1) }), el('span', { class: 'cp-vert', text: t.title || '' })),
          bodyCols));
      } else {
        p2.appendChild(el('div', { class: 'cp-text' },
          el('div', { class: 'cp-th' }, el('span', { class: 'cp-tn', text: String(i + 1) }),
            el('b', { text: t.title || '' })),
          t.who ? el('div', { class: 'cp-who', text: 'tratto dall\'intervista a ' + t.who }) : null,
          bodyCols));
      }
    });
    if (u.texts.some(function (t) { return t.fiction !== false; }) || u.charts.length) {
      p2.appendChild(el('div', { class: 'cp-disc', text: 'Materiale didattico: le persone e i numeri di questa unità sono inventati per la discussione in classe, non sono interviste né sondaggi reali.' }));
    }
    p2.appendChild(foot(2));
    sheet.appendChild(p2);
    fitConvPages();
    // le foto arrivano dopo: quando sono caricate la pagina si rimisura, altrimenti "ci sta" e' una bugia
    $$('#cp-sheet img').forEach(function (im) { if (!im.complete) im.addEventListener('load', fitConvPages, { once: true }); });
  }
  /**
   * Due pagine A4 vogliono dire DUE pagine: se il contenuto sfora, il foglio si rimpicciolisce finche' ci sta
   * (stessa regola delle schede parole: quello che c'e' si deve vedere tutto, senza scoprirlo alla fotocopiatrice).
   * Sotto una certa soglia rimpicciolire non e' piu' leggibile: li si dice all'insegnante che deve togliere qualcosa.
   */
  function fitConvPages() {
    const sheet = $('#cp-sheet'); if (!sheet) return;
    const probe = el('div', { style: 'position:absolute;visibility:hidden;height:297mm;width:1mm' });
    document.body.appendChild(probe);
    const A4 = probe.getBoundingClientRect().height;
    probe.remove();
    if (!A4) return;
    let tight = 0;
    $$('.cp-page', sheet).forEach(function (pg) {
      pg.style.fontSize = '';
      pg.classList.remove('cp-tight');
      let k = 1;
      while (pg.getBoundingClientRect().height > A4 + 1 && k > 0.74) {
        k -= 0.02;
        pg.style.fontSize = (9.4 * k).toFixed(2) + 'pt';
      }
      if (pg.getBoundingClientRect().height > A4 + 1) { pg.classList.add('cp-tight'); tight++; }
    });
    // Se il contenuto l'ha messo l'AI, il foglio si regola da solo (v66, 'non voglio questo errore rosso, sei tu
    // che devi mettere un numero congruo di parole'): via una voce di lessico alla volta finche' ci sta (mai sotto
    // le 10), con la barra Annulla che le rimette tutte. Le voci tolte stanno in _cutVocab (campo _, non salvato).
    const ls = current(), u = ls && ls.conv;
    if (tight && u && u._autoFit && (u.vocab || []).length > 10) {
      u._cutVocab = (u._cutVocab || []).concat([u.vocab.pop()]);
      touch(ls);
      renderConvSheet(ls);   // ridisegna e rimisura: se sfora ancora si ripassa di qui (al massimo vocab.length volte)
      return;
    }
    if (u && u._autoFit && !tight && (u._cutVocab || []).length) {
      const cut = u._cutVocab; u._cutVocab = []; delete u._autoFit;   // sistemato: da qui in poi decide l'insegnante
      toastUndo('Per far stare il foglio ho tolto ' + cut.length + (cut.length === 1 ? ' voce' : ' voci') + ' dal lessico', function () {
        ls.conv.vocab = ls.conv.vocab.concat(cut);
        touch(ls);
        if (S.view === 'convprint') renderConvSheet(ls);
      });
    }
    const warn = $('#cp-warn');
    if (warn) {
      warn.textContent = tight ? '⚠ ' + tight + (tight === 1 ? ' pagina non ci sta' : ' pagine non ci stanno') + ' nemmeno rimpicciolita: togli qualcosa, oppure ' : '';
      if (tight) {
        // il lavoro sporco lo fa l'app, ma su un foglio gia' ritoccato a mano solo se l'insegnante lo chiede
        warn.appendChild(el('button', { class: 'small', text: '✂ togli tu dal lessico finché ci sta', onclick: function () {
          const l2 = current(); if (!l2 || !l2.conv) return;
          l2.conv._autoFit = true;
          renderConvSheet(l2);
        } }));
      }
      warn.style.display = tight ? '' : 'none';
    }
  }

  // ---------- schede delle parole utili (prima del video) ----------
  function cardsFor(ls) {
    const vb = vocabState(ls), ready = cardVocab(ls);
    const out = [];
    if (vb.cards.matching !== false && ready.length >= 3) out.push('matching');
    if (vb.cards.flashcards !== false && ready.length >= 1) out.push('flashcards');
    return out;
  }
  function backOf(w, big) {
    // "retro" della parola: SOLO la foto se c'è (niente traduzione), altrimenti la traduzione;
    // se la foto non si carica, si ripiega sulla traduzione
    const d = el('div', { class: 'back' + (big ? ' big' : '') });
    const textBack = function () {
      d.innerHTML = '';
      d.appendChild(el('div', { class: 'tr', text: w.translation || '?' }));
    };
    if (w.image) {
      const img = el('img', { src: w.image, alt: '', referrerpolicy: 'no-referrer' });
      img.addEventListener('error', textBack);
      d.appendChild(img);
      if (!big) {
        // Scheda abbinamento: la foto si ingrandisce SOLO dal pulsantino "⤢ ingrandisci", mai cliccando la foto.
        // Il clic sulla foto DEVE restare l'abbinamento (v61, 'non mi fa fare il matching, se clicco con la parola
        // giusta da abbinare mi si apre ogni volta il pop-up'): in v60 il listener stava sul .back con
        // stopPropagation() e si mangiava il clic del .mchip.
        d.classList.add('zoomable');
        const zb = el('button', { class: 'zoom-hint', 'data-zoom': '1', type: 'button', title: 'Ingrandisci la foto' },
          [document.createTextNode('⤢'), el('span', { class: 'lbl', text: ' ingrandisci' })]);
        zb.addEventListener('click', function (e) {
          e.stopPropagation();   // il pulsante ingrandisce e basta: non conta come scelta della coppia
          e.preventDefault();
          if (isPreviewShown() && previewBox._for === w.image) return hideImgPreview();
          showImgPreview(d, w.image, '');
          if (previewBox) previewBox._for = w.image;
        });
        d.appendChild(zb);
      }
    } else textBack();
    return d;
  }
  function cardHeader(p, title, sub, badge) {
    p.appendChild(el('div', { class: 'row ex-head' },
      el('h3', { class: 'ex-title' }, [document.createTextNode(title), sub ? el('span', { class: 'sub', text: ' ' + sub }) : null]),
      el('span', { class: 'badge right', text: badge || 'prima del video' })));
  }
  function cardFooter(p, st, onDone) {
    const row = el('div', { class: 'actions' });
    row.appendChild(el('button', { class: 'link', text: 'Salta questa scheda', onclick: nextCard }));
    const nextStep = (S.student && S.student.queue && S.student.queue[0]) || null;
    row.appendChild(el('button', { class: 'link', text: !nextStep ? 'Salta le schede ▶' : nextStep.kind === 'video' ? 'Salta tutto e vai al video ▶' : 'Salta le schede ▶', onclick: advancePhase }));
    p.appendChild(row);
    return row;
  }
  function nextCard() {
    const st = S.student; if (!st) return;
    st.cardIdx++;
    if (st.cardIdx >= st.cards.length) return advancePhase();
    renderVocabCard();
  }
  /** Il pannello dello studente veste un template (schede delle Parole utili) o torna neutro (null). */
  function panelTheme(th, ls) {
    const p = $('#s-panel'); if (!p) return;
    $$(':scope > .act-deco, :scope > .act-props, :scope > .act-theme-btn, :scope > .act-theme-pop', p).forEach(function (n) { n.remove(); });
    if (!th) { p.classList.remove('act', 'vocab-act'); p.removeAttribute('data-theme'); return; }
    p.classList.add('act', 'vocab-act'); p.setAttribute('data-theme', th);
    ACT.decorate(p, { id: 'v' + (ls ? ls.id : ''), theme: th }, { fx: false, props: false });   // v124: sulle schede niente oggetti né decorazioni
  }
  function renderVocabCard() {
    const st = S.student; const ls = st.lesson;
    hideImgPreview();
    const p = $('#s-panel'); p.innerHTML = '';
    const kind = st.cards[st.cardIdx];
    // le schede prendono il template scelto per le Parole utili; il contenuto sta in un wrapper così le decorazioni restano tra un round e l'altro
    const vb = vocabState(ls);
    panelTheme(vb.theme || 'classic', ls);
    const wrap = el('div', { class: 'vocab-wrap' });
    p.appendChild(wrap);
    if (kind === 'matching') renderMatching(wrap, ls, st); else renderFlashcards(wrap, ls, st);
    // 🎨 template al volo: le coppie già abbinate e le carte girate restano dove sono
    themeSwitcher(p, vb, { fx: !ls.options || ls.options.fx !== false, onPick: function () { if (ownLesson(ls)) touch(ls); } });
  }
  /** FLIP: anima lo spostamento degli elementi con data-flip dentro root tra prima e dopo `mutate`. */
  function flipMove(root, mutate, animate) {
    const before = {};
    if (animate) $$('[data-flip]', root).forEach(function (e) { before[e.getAttribute('data-flip')] = e.getBoundingClientRect(); });
    mutate();
    if (!animate) return;
    $$('[data-flip]', root).forEach(function (e) {
      const b = before[e.getAttribute('data-flip')]; if (!b) return;
      const a = e.getBoundingClientRect();
      const dx = b.left - a.left, dy = b.top - a.top;
      if (Math.abs(dx) < 1 && Math.abs(dy) < 1) return;
      e.style.transition = 'none'; e.style.transform = 'translate(' + dx + 'px,' + dy + 'px)';
      requestAnimationFrame(function () {
        e.style.transition = 'transform .45s cubic-bezier(.2,.8,.2,1)'; e.style.transform = '';
        setTimeout(function () { e.style.transition = ''; }, 500);
      });
    });
  }
  function renderMatching(p, ls, st) {
    const all = EX.shuffle(cardVocab(ls), L.rng(Date.now() % 9973));
    // Quante coppie per schermata. Si PARTE mettendole tutte insieme e si divide in più round SOLO se, misurando lo
    // spazio vero, le righe scenderebbero sotto l'altezza leggibile. In v51 c'era una stima aritmetica
    // (altezza - 260) / 52: troppo prudente, divideva in due schermate lasciando mezzo schermo vuoto.
    const MIN_PER = 3, COMFORT = 44;   // riga leggibile: 44 px
    let per = all.length, rounds = 1, round = 0, fitted = false;
    const fx = !ls.options || ls.options.fx !== false;
    const playRound = function () {
      p.innerHTML = '';
      const words = all.slice(round * per, (round + 1) * per);
      cardHeader(p, 'Parole utili: abbina', rounds > 1 ? '(' + (round + 1) + ' di ' + rounds + ')' : '');
      p.appendChild(el('div', { class: 'instr', text: 'Tocca una parola e poi la sua foto o traduzione (puoi anche partire dalla foto): le coppie giuste salgono in alto, legate. La stella segna le parole da ripassare.' }));
      // le coppie abbinate si accumulano qui sopra, una riga per coppia, e non si toccano più
      const done = el('div', { class: 'match-done' });
      const grid = el('div', { class: 'match' });
      const left = el('div', { class: 'col' }), right = el('div', { class: 'col' });
      const chipL = {}, chipR = {};
      let sel = null, doneN = 0, errors = 0;   // sel = { side: 'l' | 'r', w }
      const fb = el('div', { class: 'feedback' });
      const clearSel = function () { $$('.mchip.sel', grid).forEach(function (x) { x.classList.remove('sel'); }); sel = null; };
      const matched = function (w) {
        clearSel(); doneN++; fb.textContent = '';
        flipMove(p, function () {
          const row = el('div', { class: 'mpair' }, [
            el('div', { class: 'mchip good', 'data-id': w.id, 'data-flip': 'l-' + w.id }, [el('span', { class: 'txt', text: w.word }), starButton(ls, w.word)]),
            el('div', { class: 'link' }),
            el('div', { class: 'mchip good target', 'data-flip': 'r-' + w.id }, [backOf(w)])
          ]);
          done.appendChild(row);
          chipL[w.id].remove(); chipR[w.id].remove();
        }, fx);
        if (doneN === words.length) {
          fb.textContent = '✓ Tutte abbinate!' + (errors ? ' (' + errors + ' errori)' : ''); fb.style.color = 'var(--ok)';
          if (fx) celebrate(p, fb);
          const nextBtn = el('button', { class: 'primary', text: round + 1 < rounds ? 'Avanti ▶' : 'Continua ▶', onclick: function () { if (round + 1 < rounds) { round++; playRound(); } else nextCard(); } });
          foot.insertBefore(nextBtn, foot.firstChild);
          requestAnimationFrame(function () { sizeRows(); requestAnimationFrame(sizeRows); });   // rete di sicurezza: il pulsante deve restare dentro lo schermo
        }
      };
      const pick = function (side, w, c) {
        if (sel && sel.side !== side) {
          if (sel.w.id === w.id) return matched(w);
          errors++; c.classList.add('wrongpick'); setTimeout(function () { c.classList.remove('wrongpick'); }, 700);
          fb.textContent = '✗ Non è questa. Riprova.'; fb.style.color = 'var(--bad)';
          return;
        }
        clearSel(); c.classList.add('sel'); sel = { side: side, w: w };
        fb.textContent = side === 'l' ? 'Ora tocca la sua foto o traduzione.' : 'Ora tocca la parola giusta.'; fb.style.color = 'var(--muted)';
      };
      words.forEach(function (w) {
        const c = el('div', { class: 'mchip', 'data-id': w.id, 'data-flip': 'l-' + w.id }, [el('span', { class: 'txt', text: w.word }), starButton(ls, w.word)]);
        c.addEventListener('click', function (e) { if (e.target.closest && e.target.closest('button.star')) return; pick('l', w, c); });
        chipL[w.id] = c; left.appendChild(c);
      });
      EX.shuffle(words.slice(), L.rng(words.length * 31 + round)).forEach(function (w) {
        const c = el('div', { class: 'mchip target', 'data-flip': 'r-' + w.id }, [backOf(w)]);
        c.addEventListener('click', function () { pick('r', w, c); });
        chipR[w.id] = c; right.appendChild(c);
      });
      grid.appendChild(left); grid.appendChild(right);
      p.appendChild(done); p.appendChild(grid); p.appendChild(fb);
      const foot = cardFooter(p, st);
      // le righe usano tutta l'altezza disponibile (foto più grandi), mai sotto 44 px né sopra 150 px
      // alla fine compaiono "✓ Tutte abbinate!" e il pulsante Continua: lo spazio si tiene da parte DA SUBITO,
      // altrimenti a schermo intero le righe si prendono tutto e i pulsanti finiscono sotto il bordo (si dovrebbe scorrere)
      const RESERVE = 96;
      const host = p.closest('#s-panel') || p;   // p è il wrapper: lo spazio vero (e il padding) è quello del pannello
      const availNow = function () {
        return host.clientHeight - (grid.getBoundingClientRect().top - host.getBoundingClientRect().top) - fb.offsetHeight - foot.offsetHeight - 20 - Math.max(0, RESERVE - fb.offsetHeight);
      };
      // una volta sola, alla prima schermata: quante coppie ci stanno davvero qui dentro
      if (!fitted) {
        fitted = true;
        const cap = Math.max(MIN_PER, Math.floor(availNow() / (COMFORT + 6)));
        if (cap < all.length) {
          rounds = Math.ceil(all.length / cap);
          per = Math.ceil(all.length / rounds);   // round bilanciati: 5 coppie in 2 giri fanno 3+2, non 4+1
          return playRound();
        }
      }
      const sizeRows = function () {
        if (!p.isConnected) return;
        const avail = availNow();
        const rowh = Math.max(40, Math.min(150, Math.floor(avail / words.length) - 6));
        host.style.setProperty('--rowh', rowh + 'px');
        host.classList.toggle('rowh-tiny', rowh < 76);   // righe basse: "⤢ ingrandisci" coprirebbe la foto, resta la sola icona
        requestAnimationFrame(function () {
          if (!host.isConnected) return;
          const over = host.scrollHeight - host.clientHeight;
          if (over > 1) host.style.setProperty('--rowh', Math.max(34, rowh - Math.ceil(over / words.length) - 1) + 'px');
        });
      };
      sizeRows();
      setTimeout(sizeRows, 50);
      window.addEventListener('resize', sizeRows);
    };
    playRound();
  }
  function renderFlashcards(p, ls, st) {
    const deck = cardVocab(ls);
    const write = !!vocabState(ls).cards.write;
    let i = 0;
    const show = function () {
      p.innerHTML = '';
      const w = deck[i];
      cardHeader(p, 'Parole utili: flashcards', (i + 1) + ' di ' + deck.length);
      p.appendChild(el('div', { class: 'instr', text: write ? 'Guarda la foto o la traduzione, scrivi la parola in ' + (ls.lang === 'en' ? 'inglese' : 'italiano') + ' e controlla; poi gira la carta.' : 'Guarda la foto o la traduzione e pensa alla parola; tocca la carta per girarla.' }));
      let flipped = false;
      const card = el('div', { class: 'flashcard' });
      const front = el('div', { class: 'face front' }, [backOf(w, true), el('div', { class: 'hint', text: 'tocca per girare' })]);
      const back = el('div', { class: 'face back' }, [el('div', { class: 'word' }, [document.createTextNode(w.word), starButton(ls, w.word)]), w.translation ? el('div', { class: 'tr', text: w.translation }) : null]);
      card.appendChild(front); card.appendChild(back);
      card.addEventListener('click', function () { flipped = !flipped; card.classList.toggle('flipped', flipped); });
      p.appendChild(card);
      const fb = el('div', { class: 'feedback' });
      let wrow = null;
      if (write) {
        const inp = el('input', { type: 'text', placeholder: 'Scrivi la parola', autocomplete: 'off', autocapitalize: 'off', autocorrect: 'off', style: 'max-width:18em;margin-top:8px' });
        const chk = el('button', { class: 'primary', text: 'Controlla', onclick: function () {
          const ok = L.normalize(inp.value, { accents: !!(ls.options && ls.options.strict) }) === L.normalize(w.word, { accents: !!(ls.options && ls.options.strict) });
          inp.classList.toggle('ok', ok); inp.classList.toggle('bad', !ok);
          fb.textContent = ok ? '✓ Giusto!' : '✗ Non ancora: era "' + w.word + '".'; fb.style.color = ok ? 'var(--ok)' : 'var(--bad)';
          if (ok && (!ls.options || ls.options.fx !== false)) celebrate(p, fb);
          card.classList.add('flipped'); flipped = true;
        } });
        inp.addEventListener('keydown', function (e) { if (e.key === 'Enter') chk.click(); });
        // v93 (Edoardo: "la parte scrivi la parola e controlla mettile al centro"): sotto la carta, centrate
        wrow = el('div', { class: 'row fc-write', style: 'margin-top:6px' }, [inp, chk]);
        p.appendChild(wrow);
        setTimeout(function () { inp.focus(); }, 50);
      }
      p.appendChild(fb);
      // Indietro / Avanti centrati SOTTO la carta (non a sinistra, in fondo)
      const nav = el('div', { class: 'row fc-nav' });
      nav.appendChild(el('button', { class: 'small', text: '◀ Indietro', disabled: i === 0 ? 'disabled' : null, onclick: function () { if (i > 0) { i--; show(); } } }));
      nav.appendChild(el('button', { class: 'primary big', text: i + 1 < deck.length ? 'Avanti ▶' : 'Continua ▶', onclick: function () { if (i + 1 < deck.length) { i++; show(); } else nextCard(); } }));
      p.appendChild(nav);
      const foot = cardFooter(p, st);
      // la carta usa l'altezza disponibile (mai sotto 250 px, mai sopra 560 px)
      const host = p.closest('#s-panel') || p;
      const sizeCard = function () {
        if (!p.isConnected) return;
        // spazio VERO occupato da tutto il resto (compresa la riga per scrivere la parola): la carta prende quello che avanza,
        // così su uno schermo basso i pulsanti restano dentro invece di finire sotto il bordo
        const used = (card.getBoundingClientRect().top - host.getBoundingClientRect().top) + nav.offsetHeight + fb.offsetHeight + foot.offsetHeight + (wrow ? wrow.offsetHeight + 6 : 0) + 24;
        const h = Math.max(90, Math.min(560, host.clientHeight - used));
        host.style.setProperty('--cardh', h + 'px');
        // correzione finale: se per i margini avanza comunque qualcosa fuori, si toglie dalla carta (i pulsanti vincono sempre)
        requestAnimationFrame(function () {
          if (!host.isConnected) return;
          const over = host.scrollHeight - host.clientHeight;
          if (over > 1) host.style.setProperty('--cardh', Math.max(80, h - over - 2) + 'px');
        });
      };
      sizeCard();
      setTimeout(sizeCard, 50);
      window.addEventListener('resize', sizeCard);
    };
    show();
  }

  // ---------- riepilogo: parole della lezione ----------
  function renderWordList(p, ls, stars) {
    const box = el('div', { class: 'wordlist' });
    const head = el('div', { class: 'row' }, el('h3', { style: 'margin:0', text: '★ Parole della lezione' }), el('span', { class: 'hint', text: 'in ' + (ls.lang === 'en' ? 'inglese' : 'italiano') + ' con traduzione (modificabile): pronte per Quizlet' }));
    box.appendChild(head);
    const list = el('div', { class: 'wl-rows' });
    const draw = function () {
      list.innerHTML = '';
      const keys = Object.keys(stars).sort();
      if (!keys.length) list.appendChild(el('p', { class: 'muted', text: 'Nessuna parola con la stella. Aggiungi le parole utili o metti la stella alle parole durante la lezione.' }));
      keys.forEach(function (k) {
        const it = stars[k];
        const row = el('div', { class: 'wl-row' });
        row.appendChild(el('b', { text: it.word }));
        const ti = el('input', { type: 'text', value: it.translation || '', placeholder: 'traduzione' });
        ti.addEventListener('change', function () { it.translation = ti.value.trim(); saveStars(ls, stars); });
        row.appendChild(ti);
        row.appendChild(el('button', { class: 'small danger', text: '✕', onclick: function () { delete stars[k]; saveStars(ls, stars); draw(); } }));
        list.appendChild(row);
      });
    };
    draw();
    box.appendChild(list);
    const actions = el('div', { class: 'actions' });
    actions.appendChild(el('button', { class: 'small', text: '+ Tutte le parole utili', title: 'Aggiunge le parole utili della lezione', onclick: function () {
      selectedVocab(ls).forEach(function (w) { const k = L.normalize(w.word); if (!stars[k]) stars[k] = { word: w.word, translation: w.translation || '' }; });
      saveStars(ls, stars); draw();
    } }));
    if (S.settings.apiKey) {
      actions.appendChild(el('button', { class: 'small', text: '🌐 Traduci con l\'AI', onclick: function () {
        const todo = Object.keys(stars).filter(function (k) { return !stars[k].translation; }).map(function (k) { return stars[k].word; });
        if (!todo.length) return toast('Tutte le parole hanno già una traduzione');
        toast('Traduco ' + todo.length + ' parole…');
        const context = ls.exercises.map(function (e) { return e.sentence; }).join(' ');
        AI.translateWords({ words: todo, lang: ls.lang, support: vocabState(ls).support, context: context, apiKey: S.settings.apiKey, model: S.settings.model })
          .then(function (r) { Object.keys(stars).forEach(function (k) { const it = stars[k]; if (!it.translation && r.translations[it.word]) it.translation = r.translations[it.word]; }); saveStars(ls, stars); draw(); toast('Traduzioni aggiunte'); })
          .catch(function (e) { toast('AI: ' + e.message, 6000); });
      } }));
    }
    const quizlet = function () { return Object.keys(stars).sort().map(function (k) { return stars[k].word + '\t' + (stars[k].translation || ''); }).join('\n'); };
    actions.appendChild(el('button', { class: 'small primary', text: '📋 Copia per Quizlet', title: 'Una riga per parola: parola TAB traduzione (in Quizlet: Importa → tra termine e definizione "Tab")', onclick: function () {
      const txt = quizlet(); if (!txt) return toast('Nessuna parola');
      (navigator.clipboard ? navigator.clipboard.writeText(txt) : Promise.reject()).then(function () { toast('Copiato: in Quizlet usa "Importa", separatore Tab'); }).catch(function () { prompt('Copia questo testo:', txt); });
    } }));
    actions.appendChild(el('button', { class: 'small', text: '⬇ Scarica .txt', onclick: function () { const txt = quizlet(); if (!txt) return toast('Nessuna parola'); download(slugify(ls.title || 'parole') + '-parole.txt', txt); } }));
    box.appendChild(actions);
    p.appendChild(box);
  }

  function renderSummary() {
    const st = S.student; const ls = st.lesson;
    const p = $('#s-panel'); p.innerHTML = '';
    dock('#s-stage', true);
    $('#s-stage').classList.add('cards');
    const tot = ls.exercises.length;
    const ok = ls.exercises.filter(function (e) { return st.results[e.id] && st.results[e.id].correct; }).length;
    p.appendChild(el('h2', { text: 'Fine! ' + ok + ' su ' + tot + ' esercizi corretti' }));
    const list = el('div');
    ls.exercises.forEach(function (e, i) {
      const r = st.results[e.id];
      list.appendChild(el('div', { class: 'notice ' + (r && r.correct ? 'ok' : 'bad'), text: (i + 1) + '. ' + EX.LABELS[e.type] + ' — ' + (r && r.correct ? 'giusto' : 'da rivedere') + (r && r.attempts > 1 ? ' (' + r.attempts + ' tentativi)' : '') + (r && r.hints ? ' (' + r.hints + (r.hints === 1 ? ' aiuto' : ' aiuti') + ')' : '') + ' · soluzione: ' + EX.solution(e) }));
    });
    p.appendChild(list);
    if (S.assign) p.appendChild(assignSummaryBox());   // v125: il compito si consegna da solo; qui si vede se è arrivato
    renderWordList(p, ls, st.stars);
    p.appendChild(el('div', { class: 'actions' },
      el('button', { class: 'primary', text: 'Ricomincia', onclick: function () { if (S.assign) assignNewAttempt(); openStudent(ls.id, false, ls); } })));
  }

  // ---------- ESERCIZI DA UNA FOTO O SCREENSHOT (v70, 'ho una chiave API, voglio inserire screenshot
  // o immagini dai quali generare esercizi... anche con la creazione giochi e attivita'') ----------
  // Un dialog condiviso (#dlg-imggen): scegli fino a 3 immagini (ridotte a 1400px in JPEG sul client, mai
  // caricate da nessuna parte: vanno solo all'API col resto della richiesta), l'AI propone il materiale
  // (AI.itemsFromImage), l'insegnante spunta cosa tenere. Ogni chiamante passa i tipi che gli servono e
  // riceve gli item accettati. La costruzione vera resta al motore: il modello scrive frasi/domande/coppie.
  const IMGGEN = { imgs: [], items: [], accept: null, kinds: null, topics: [], seq: 0, lastFocus: false, lastTopics: [] };
  function imgToJpeg(file, cb, max) {
    const fr = new FileReader();
    fr.onload = function () {
      const im = new Image();
      im.onload = function () {
        const MAX = max || 1400;
        const sc = Math.min(1, MAX / Math.max(im.width, im.height));
        const c = document.createElement('canvas');
        c.width = Math.max(1, Math.round(im.width * sc)); c.height = Math.max(1, Math.round(im.height * sc));
        c.getContext('2d').drawImage(im, 0, 0, c.width, c.height);
        const url = c.toDataURL('image/jpeg', max ? 0.78 : 0.85);
        cb({ media_type: 'image/jpeg', data: url.split(',')[1], preview: url });
      };
      im.onerror = function () { cb(null); };
      im.src = fr.result;
    };
    fr.onerror = function () { cb(null); };
    fr.readAsDataURL(file);
  }
  function igLabel(it) {
    if (it.type === 'mc') return ['Scelta multipla', it.q + '  (giusta: ' + (it.options[it.correct] || '?') + ')'];
    if (it.type === 'match') return ['Abbina', it.pairs.map(function (p) { return p.a + '↔' + p.b; }).join(' · ')];
    if (it.type === 'wheel') return ['Ruota', it.items.join(' · ')];
    let extra = '';
    if (it.gaps) extra = '  → spazio: ' + it.gaps.join(', ');
    else if (it.type === 'wrong' && it.wrongWord) extra = '  → sbagliata: ' + (it.wrongReplacement || '?') + ' (giusta: ' + it.wrongWord + ')';
    else if (it.type === 'missing' && it.missingWord) extra = '  → manca: ' + it.missingWord;
    else if (it.type === 'extra' && it.extraWord) extra = '  → in più: ' + it.extraWord;
    return [VLChal.itemLabel(it.type), it.sentence + extra];
  }
  function openImgGen(opts) {
    IMGGEN.imgs = []; IMGGEN.items = []; IMGGEN.accept = opts.onAccept; IMGGEN.kinds = opts.kinds;
    IMGGEN.topics = []; IMGGEN.seq++; IMGGEN.lastFocus = false;
    $('#ig-topic').value = opts.topic || '';
    if (S.settings.igLevel) $('#ig-level').value = S.settings.igLevel;   // v143: il livello scelto resta (A1 per le prime lezioni)
    $('#ig-topics').style.display = 'none'; $('#ig-topics').innerHTML = '';
    $('#ig-format').value = 'auto';
    igRenderKinds();
    $('#ig-previews').innerHTML = ''; $('#ig-out').innerHTML = ''; $('#ig-msg').textContent = '';
    $('#ig-go').disabled = true; $('#ig-accept-row').style.display = 'none';
    $('#ig-file').value = '';
    $('#dlg-imggen').showModal();
  }
  $('#ig-file').addEventListener('change', function () {
    IMGGEN.imgs = [];
    $('#ig-previews').innerHTML = '';
    igAddFiles(Array.prototype.slice.call(this.files || []));
  });
  /** v127 (Edoardo: "uno screenshot stile copia incolla, senza salvarlo sul MacBook o sul PC"): le immagini arrivano
   *  anche INCOLLATE (⌘V / Ctrl+V dopo ⌘⇧⌃4 su Mac o Win+Shift+S su Windows) o TRASCINATE nel dialog. Si aggiungono
   *  a quelle già scelte, massimo 3 in tutto. */
  function igAddFiles(list) {
    const files = list.filter(function (f) { return f && /^image\//.test(f.type); }).slice(0, Math.max(0, 3 - IMGGEN.imgs.length));
    let left = files.length;
    if (!left) { if (list.length && IMGGEN.imgs.length >= 3) toast('Massimo 3 immagini'); $('#ig-go').disabled = !IMGGEN.imgs.length; return; }
    busyMsg($('#ig-msg'), 'Preparo ' + (files.length === 1 ? 'l\'immagine' : 'le immagini') + '…');
    files.forEach(function (f) {
      imgToJpeg(f, function (img) {
        left--;
        if (img) {
          IMGGEN.imgs.push(img);
          $('#ig-previews').appendChild(el('img', { src: img.preview, alt: '' }));
        }
        if (!left) {
          $('#ig-msg').textContent = IMGGEN.imgs.length ? '' : 'Non sono riuscito a leggere le immagini.';
          $('#ig-go').disabled = !IMGGEN.imgs.length;
          if (IMGGEN.imgs.length) igAnalyze();
        }
      });
    });
  }
  /** v136 (Edoardo: "faccio degli screenshot a degli esercizi e si capisca qual è l'argomento e le cose da ripassare,
   *  magari se ci sono più argomenti mi viene chiesto su che cosa focalizzarsi"): appena arrivano le immagini l'AI dice
   *  quali argomenti ci sono (AI.topicsFromImage, pochi centesimi). Un solo argomento: già spuntato. Più argomenti: la
   *  domanda "Su cosa vuoi concentrarti?" e niente spuntato, si sceglie uno, alcuni o Tutti. Il campo libero sotto
   *  resta per precisare. IMGGEN.seq scarta le risposte vecchie se nel frattempo si aggiunge un'altra immagine. */
  function igAnalyze() {
    const box = $('#ig-topics');
    if (!S.settings.apiKey) return;
    const seq = ++IMGGEN.seq;
    box.style.display = ''; box.innerHTML = '';
    const msg = el('div', { class: 'hint' }); box.appendChild(msg);
    busyMsg(msg, 'Leggo l\'immagine per capire l\'argomento…');
    AI.topicsFromImage({
      images: IMGGEN.imgs.map(function (i) { return { media_type: i.media_type, data: i.data }; }),
      lang: $('#ig-lang').value, apiKey: S.settings.apiKey, model: S.settings.model
    }).then(function (r) {
      if (seq !== IMGGEN.seq) return;
      IMGGEN.topics = r.topics;
      // v144: se l'esercizio dell'immagine è di parole singole, il formato passa a "solo parole" (si può cambiare)
      if (r.format === 'words' && $('#ig-format').value === 'auto') $('#ig-format').value = 'words';
      igRenderTopics(r.summary + (r.format === 'words' ? ' · formato: parole singole' : ''));
    }).catch(function (e) {
      if (seq !== IMGGEN.seq) return;
      box.innerHTML = '';
      box.appendChild(el('div', { class: 'hint', text: 'Non sono riuscito a capire l\'argomento (' + e.message + '). Scrivilo tu qui sotto, oppure genera lo stesso.' }));
    });
  }
  function igRenderTopics(summary) {
    const box = $('#ig-topics'); box.innerHTML = ''; box.style.display = '';
    const t = IMGGEN.topics;
    if (summary) box.appendChild(el('div', { class: 'ig-sum', text: '🔎 ' + summary }));
    if (!t.length) { box.appendChild(el('div', { class: 'hint', text: 'Non ho trovato un argomento preciso: scrivilo tu qui sotto, oppure genera lo stesso.' })); return; }
    box.appendChild(el('div', { class: 'ig-ask', text: t.length === 1 ? 'Argomento trovato:' : 'Ho trovato ' + t.length + ' argomenti. Su cosa vuoi concentrarti? Scegline uno o più.' }));
    const chips = el('div', { class: 'ig-chips' });
    const ICON = { grammar: '📐', vocabulary: '📚', function: '💬' };
    t.forEach(function (tp, i) {
      const cb = el('input', { type: 'checkbox', 'data-topic': String(i) });
      if (t.length === 1) cb.checked = true;
      const lab = el('label', { class: 'ig-chip' + (cb.checked ? ' on' : ''), title: tp.example ? 'Nell\'immagine: ' + tp.example : '' },
        cb, el('span', { text: (ICON[tp.kind] || '') + ' ' + tp.name }), tp.example ? el('span', { class: 'ex', text: '«' + tp.example + '»' }) : null);
      cb.addEventListener('change', function () { lab.classList.toggle('on', cb.checked); });
      chips.appendChild(lab);
    });
    box.appendChild(chips);
    if (t.length > 1) box.appendChild(el('div', { class: 'row' },
      el('button', { class: 'small', id: 'ig-all', text: '☑ Tutti', onclick: function () { $$('#ig-topics input[data-topic]').forEach(function (c) { c.checked = true; c.parentNode.classList.add('on'); }); } }),
      el('button', { class: 'small', text: '☐ Nessuno', onclick: function () { $$('#ig-topics input[data-topic]').forEach(function (c) { c.checked = false; c.parentNode.classList.remove('on'); }); } })));
  }
  /** v136: con piu' tipi possibili (set della Sfida) l'insegnante sceglie quali usare; di default tutti. */
  function igRenderKinds() {
    const box = $('#ig-kinds'); box.innerHTML = '';
    const ks = IMGGEN.kinds || [];
    if (ks.length < 2) { box.style.display = 'none'; return; }
    box.style.display = '';
    box.appendChild(el('div', { class: 'ig-klab', text: 'Tipi di esercizi da mescolare' }));
    const chips = el('div', { class: 'ig-chips' });
    ks.forEach(function (k) {
      const cb = el('input', { type: 'checkbox', 'data-kind': k }); cb.checked = true;
      const lab = el('label', { class: 'ig-chip on' }, cb, el('span', { text: VLChal.itemLabel(k) }));
      cb.addEventListener('change', function () { lab.classList.toggle('on', cb.checked); });
      chips.appendChild(lab);
    });
    box.appendChild(chips);
  }
  function igChosenTopics() {
    const out = $$('#ig-topics input[data-topic]').filter(function (c) { return c.checked; }).map(function (c) { return (IMGGEN.topics[+c.getAttribute('data-topic')] || {}).name; }).filter(Boolean);
    const extra = ($('#ig-topic').value || '').trim();
    if (extra) out.push(extra);
    return out;
  }
  document.addEventListener('paste', function (e) {
    const ca = $('#dlg-chal-add');
    if (ca && ca.open && CA_PAINT_IMG) {
      const it = Array.prototype.slice.call((e.clipboardData && e.clipboardData.items) || []).find(function (x) { return x.kind === 'file' && /^image\//.test(x.type); });
      if (!it) return;
      e.preventDefault();
      imgToJpeg(it.getAsFile(), function (im) { if (im) { CA_IMG = im.preview; CA_PAINT_IMG(); } }, 560);
      return;
    }
    const dlg = $('#dlg-imggen'); if (!dlg || !dlg.open) return;
    const items = Array.prototype.slice.call((e.clipboardData && e.clipboardData.items) || []);
    const files = items.filter(function (it) { return it.kind === 'file' && /^image\//.test(it.type); }).map(function (it) { return it.getAsFile(); }).filter(Boolean);
    if (!files.length) return;   // testo incollato nel campo Argomento: lascia fare al browser
    e.preventDefault();
    igAddFiles(files);
  });
  (function () {
    const dlg = $('#dlg-imggen'); if (!dlg) return;
    dlg.addEventListener('dragover', function (e) { e.preventDefault(); dlg.classList.add('ig-drop'); });
    dlg.addEventListener('dragleave', function (e) { if (e.target === dlg) dlg.classList.remove('ig-drop'); });
    dlg.addEventListener('drop', function (e) { e.preventDefault(); dlg.classList.remove('ig-drop'); igAddFiles(Array.prototype.slice.call((e.dataTransfer && e.dataTransfer.files) || [])); });
  })();
  $('#ig-close').addEventListener('click', function () { $('#dlg-imggen').close(); });
  $('#ig-level').addEventListener('change', function () { S.settings.igLevel = this.value; saveSettings(); });
  $('#ig-go').addEventListener('click', function () {
    if (!S.settings.apiKey) { $('#ig-msg').textContent = 'Serve la chiave API (Impostazioni AI).'; return; }
    if (!IMGGEN.imgs.length) return;
    const topics = igChosenTopics();
    if (IMGGEN.topics.length > 1 && !topics.length) { $('#ig-msg').textContent = 'Scegli prima su quale argomento concentrarti (uno, alcuni o Tutti).'; return; }
    const kchk = $$('#ig-kinds input[data-kind]');
    const kinds = kchk.length ? kchk.filter(function (c) { return c.checked; }).map(function (c) { return c.getAttribute('data-kind'); }) : IMGGEN.kinds;
    if (kchk.length && !kinds.length) { $('#ig-msg').textContent = 'Scegli almeno un tipo di esercizio.'; return; }
    IMGGEN.lastFocus = topics.length > 0; IMGGEN.lastTopics = topics;
    const go = $('#ig-go'); go.disabled = true;
    busyMsg($('#ig-msg'), 'Scrivo gli esercizi' + (topics.length ? ' su: ' + topics.join(', ') : '') + '… (10-30 secondi)');
    AI.itemsFromImage({
      images: IMGGEN.imgs.map(function (i) { return { media_type: i.media_type, data: i.data }; }),
      n: +$('#ig-n').value || 5, kinds: kinds, topics: topics, format: $('#ig-format').value,
      lang: $('#ig-lang').value, level: $('#ig-level').value,
      apiKey: S.settings.apiKey, model: S.settings.model
    }).then(function (r) {
      go.disabled = false;
      IMGGEN.items = r.items;
      $('#ig-msg').textContent = r.items.length ? (r.items.length + ' proposte' + (r.ai && r.ai.cost ? ' · ' + (r.ai.cost * 100).toFixed(1) + ' cent' : '') + ' · togli la spunta a quelle che non vuoi') : 'Nessuna proposta utilizzabile: prova con un\'immagine più leggibile.';
      const out = $('#ig-out'); out.innerHTML = '';
      r.items.forEach(function (it, i) {
        const lb = igLabel(it);
        out.appendChild(el('label', { class: 'ig-row' },
          el('input', { type: 'checkbox', checked: 'checked', 'data-i': String(i) }),
          el('span', { class: 'kind', text: lb[0] }),
          el('span', { class: 'txt', text: lb[1] }),
          it.topic && topics.length > 1 ? el('span', { class: 'topic', text: it.topic }) : null));
      });
      $('#ig-accept-row').style.display = r.items.length ? '' : 'none';
    }).catch(function (e) { go.disabled = false; $('#ig-msg').textContent = 'AI: ' + e.message; });
  });
  $('#ig-accept').addEventListener('click', function () {
    const keep = $$('#ig-out input[type=checkbox]').filter(function (c) { return c.checked; }).map(function (c) { return IMGGEN.items[+c.getAttribute('data-i')]; }).filter(Boolean);
    $('#dlg-imggen').close();
    if (IMGGEN.accept) IMGGEN.accept(keep);
  });

  // ---------- SFIDA IN CLASSE (v68, riprogettata in v69): due modalita', set multi-tipo ----------
  // Modalita' "Insieme sullo schermo" (teacher-paced): la domanda e' proiettata, i telefoni mandano solo la
  // risposta, l'HOST valuta con VLChal.checkItem: le soluzioni non viaggiano MAI sul canale (wire() toglie
  // anche il mapping del match). Modalita' "Ognuno al suo ritmo" (student-paced): il set viaggia intero e il
  // telefono corregge da solo (ok per giocare, NON per verifiche). Trasporto: Supabase Realtime broadcast con
  // la sola chiave pubblicabile; in ?mock=1 il canale e' VLChal.localBus (localStorage fra tab) per lo smoke.
  let CHAL = null;   // host: { pin, play:'tp'|'sp', items, mode, secs, showQ, conn, state, pub, timer, ... }
  function loadSupaLib(cb) {
    if (window.supabase) return cb(true);
    const s = document.createElement('script');
    s.src = VLSync.CONFIG.lib;
    s.onload = function () { cb(!!window.supabase); };
    s.onerror = function () { cb(false); };
    document.head.appendChild(s);
  }
  function chalJoin(pin, ready, fail) {
    if (S.mock) { setTimeout(function () { ready(VLChal.localBus().join(pin)); }, 0); return; }
    loadSupaLib(function (ok) {
      if (!ok) return fail('Non riesco a caricare la libreria del canale: controlla la connessione');
      const client = window.supabase.createClient(VLSync.CONFIG.url, VLSync.CONFIG.anonKey, { auth: { persistSession: false, autoRefreshToken: false } });
      const cbs = {};
      const ch = client.channel('chal:' + pin, { config: { broadcast: { self: false } } });
      ['hello', 'score', 'set', 'q', 'ans', 'reveal', 'board', 'end', 'count'].forEach(function (ev) {
        ch.on('broadcast', { event: ev }, function (msg) { if (cbs[ev]) cbs[ev](msg.payload); });
      });
      let opened = false;
      ch.subscribe(function (status) {
        if (status === 'SUBSCRIBED' && !opened) {
          opened = true;
          ready({
            send: function (event, payload) { ch.send({ type: 'broadcast', event: event, payload: payload }); },
            on: function (event, cb) { cbs[event] = cb; },
            close: function () { try { client.removeChannel(ch); } catch (e) { /* ignora */ } }
          });
        } else if ((status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') && !opened) fail('Canale non raggiungibile (' + status + '): riprova');
      });
    });
  }
  function chalUrl(pin) { return location.origin + location.pathname + '#c=' + pin; }

  // ---- il SET di esercizi della sfida (ls.chal = { items }) ----
  function chalSets() {
    return Object.keys(S.lessons).map(function (k) { return S.lessons[k]; })
      .filter(function (ls) { return ls.chal && Array.isArray(ls.chal.items); });
  }
  function chalSetReady(ls) { return ls.chal && (ls.chal.items || []).length >= 1; }
  function newChalSet() {
    const id = 'chal-' + Date.now().toString(36);
    S.lessons[id] = { id: id, title: '', chal: { items: [] }, updatedAt: new Date().toISOString() };
    if (S.homeFilter === 'chal' && S.homeFolder && S.homeFolder !== '\u0000') S.lessons[id].folder = S.homeFolder;   // v145: nasce nella cartella aperta
    saveDebounced();
    openChalSet(id);
  }
  function openChalSet(id) {
    const ls = S.lessons[id]; if (!ls || !ls.chal) return renderHome();
    S.currentId = id;
    show('chalset');
    renderChalSet(ls);
  }
  /** Cosa si puo' importare, UNA VOCE PER LEZIONE (v71, 'non voglio che lo stesso set per video
   *  lezione sia ripetuto piu' volte'): esercizi del video, parole utili da abbinare, domande dei quiz,
   *  raggruppati sotto il titolo. Ogni pezzo porta un 'src' (lezione:id) e l'import salta cio' che il set
   *  ha gia': reimportare non duplica mai. */
  function chalImportGroups() {
    const okKinds = { gap: 1, gapbank: 1, mc: 1, extra: 1, missing: 1, wrong: 1 };
    const out = [];
    Object.keys(S.lessons).forEach(function (k) {
      const ls = S.lessons[k];
      if (!Array.isArray(ls.exercises)) return;
      const g = { id: ls.id, title: ls.title || 'Lezione senza titolo', updatedAt: ls.updatedAt || '', exs: [], words: [], quizzes: [] };
      ls.exercises.forEach(function (e) {
        if (okKinds[e.type] && (e.type !== 'mc' || (e.data && e.data.question))) g.exs.push({ src: ls.id + ':' + e.id, kind: e.type, sentence: e.sentence || '', data: e.data });
      });
      (ls.vocab && ls.vocab.words || []).forEach(function (w) {
        if (w.selected !== false && w.word && w.translation && g.words.length < 8) g.words.push({ a: w.word, b: w.translation });
      });
      let qn = 0;
      const quizzes = [];
      if (ls.activity && ls.activity.type === 'quiz') quizzes.push(ls.activity);
      (ls.acts || []).forEach(function (a) { if (a.type === 'quiz') quizzes.push(a); });
      quizzes.forEach(function (qz) {
        (qz.data.questions || []).forEach(function (q) {
          if (q.q && (q.options || []).filter(Boolean).length >= 2 && q.correct != null) g.quizzes.push({ src: ls.id + ':q' + (qn++), q: q.q, options: q.options.filter(Boolean), correct: q.correct });
        });
      });
      if (g.exs.length || g.words.length >= 2 || g.quizzes.length) out.push(g);
    });
    out.sort(function (a, b) { return b.updatedAt.localeCompare(a.updatedAt); });
    return out;
  }
  function chalHave(ls) {
    const have = new Set();
    (ls.chal.items || []).forEach(function (it) { if (it.src) have.add(it.src); });
    return have;
  }
  /** Esercizi NUOVI dalla TRASCRIZIONE di una lezione (v72, 'le domande generate dovranno andare a vedere
   *  la trascrizione del video e creare le domande di conseguenza'): frasi buone scelte dai chunk con
   *  G.selectPassages (a regole, gratis) per spazi/semplificato/riordino; scelta multipla dal modello
   *  (AI.generateQuizSet sui chunk, serve la chiave); abbina dalle parole utili tradotte della lezione.
   *  Ritorna una Promise con gli item (senza src: sono nuovi, si modificano e si cancellano nel set). */
  function chalGenFromLesson(lsSrc, kinds, n, focus) {
    const chunks = lsSrc.chunks && lsSrc.chunks.length ? lsSrc.chunks : G.annotate(G.buildChunks(lsSrc.lines || [], { duration: lsSrc.duration, lang: lsSrc.lang }), { lang: lsSrc.lang, duration: lsSrc.duration });
    const items = [], notes = [];
    const sentKinds = kinds.filter(function (k) { return ['gap', 'gapbank', 'scramble'].indexOf(k) !== -1; });
    let quota = Math.max(1, n | 0);
    if (kinds.indexOf('match') !== -1) {
      const words = (lsSrc.vocab && lsSrc.vocab.words || []).filter(function (w) { return w.selected !== false && w.word && w.translation; }).slice(0, 8);
      if (words.length >= 2) { const it = VLChal.buildItem('match', words.map(function (w) { return { a: w.word, b: w.translation }; })); if (it) { items.push(it); quota--; } }
      else notes.push('niente abbinamento: la lezione non ha parole utili con la traduzione');
    }
    const wantMc = kinds.indexOf('mc') !== -1;
    const nMc = wantMc ? Math.max(1, Math.round(quota / (sentKinds.length + 1))) : 0;
    const nSent = Math.max(0, quota - nMc);
    if (sentKinds.length && nSent > 0 && chunks.length) {
      const po = { n: nSent, types: sentKinds, lang: lsSrc.lang || 'it', range: 'smart', duration: lsSrc.duration, completeOnly: true, minGap: 0, seed: Date.now() % 9973 };
      let picks = G.selectPassages(chunks, po) || [];
      if (picks.length < nSent) {   // sottotitoli automatici senza punteggiatura: niente frasi "complete", si allenta
        po.completeOnly = false;
        picks = G.selectPassages(chunks, po) || [];
      }
      picks.forEach(function (p) {
        if (!p || (!p.passage && !p.chunk)) return;
        const bo = { lang: lsSrc.lang || 'it', seed: Date.now() % 100000 + items.length, vocab: lessonVocab(lsSrc), distractors: 2, range: 'smart', source: 'rules' };
        const ex = p.passage ? G.makeExerciseFromPassage(p.passage, p.type, bo) : G.makeExercise(p.chunk, p.type, bo);
        if (ex && ex.type !== 'mc') items.push({ id: 'i' + Math.random().toString(36).slice(2, 9), kind: ex.type, sentence: ex.sentence, data: ex.data });
      });
    }
    if (!wantMc || !nMc) return Promise.resolve({ items: items, notes: notes });
    if (!S.settings.apiKey) { notes.push('scelta multipla saltata: serve la chiave API (Impostazioni AI)'); return Promise.resolve({ items: items, notes: notes }); }
    return AI.generateQuizSet({ chunks: chunks, focus: focus, lang: lsSrc.lang || 'it', level: lsSrc.level || 'B1', n: nMc, apiKey: S.settings.apiKey, model: S.settings.model })
      .then(function (r) {
        (r.questions || []).forEach(function (q) { const it = VLChal.buildItem('mc', { q: q.q, options: q.options, correct: q.correct }); if (it) items.push(it); });
        return { items: items, notes: notes };
      })
      .catch(function (e) { notes.push('scelta multipla non riuscita: ' + e.message); return { items: items, notes: notes }; });
  }
  function openChalImport() {
    const ls = current(); if (!ls || !ls.chal) return;
    $('#ci-search').value = '';
    renderChalImport();
    $('#dlg-chal-import').showModal();
    $('#ci-search').focus();
  }
  function renderChalImport() {
    const ls = current(); if (!ls || !ls.chal) return;
    const have = chalHave(ls);
    const q = L.normalize($('#ci-search').value || '');
    const box = $('#ci-list'); box.innerHTML = '';
    const groups = chalImportGroups().filter(function (g) { return !q || L.normalize(g.title).indexOf(q) !== -1; });
    if (!groups.length) { box.appendChild(el('p', { class: 'hint', text: q ? 'Nessuna lezione con questo titolo.' : 'Niente da importare ancora: crea prima una lezione, un quiz o delle parole utili.' })); return; }
    groups.forEach(function (g) {
      const card = el('div', { class: 'ci-card', 'data-id': g.id });
      card.appendChild(el('div', { class: 'ci-title', text: g.title }));
      const rows = el('div', { class: 'ci-rows' });
      const addRow = function (key, label, items, doneAll) {
        const cb = el('input', { type: 'checkbox', 'data-key': key });
        if (doneAll) { cb.disabled = true; }
        const lab = el('label', { class: 'ci-row' + (doneAll ? ' done' : '') }, cb, el('span', { text: label + (doneAll ? ' · già nel set ✓' : '') }));
        rows.appendChild(lab);
      };
      if (g.exs.length) addRow('exs', '🎬 esercizi del video (' + g.exs.length + ')', g.exs, g.exs.every(function (x) { return have.has(x.src); }));
      if (g.words.length >= 2) addRow('words', '🃏 abbina le parole utili (' + g.words.length + ' coppie)', g.words, have.has(g.id + ':vocab'));
      if (g.quizzes.length) addRow('quiz', '🎲 domande dei quiz (' + g.quizzes.length + ')', g.quizzes, g.quizzes.every(function (x) { return have.has(x.src); }));
      card.appendChild(rows);
      // anteprima: cosa c'e' dentro, esercizio per esercizio (v71, 'non ho l'anteprima di quali sono gli esercizi')
      const det = el('details', { class: 'ci-preview' }, el('summary', { text: 'vedi il contenuto' }));
      const ul = el('div');
      g.exs.forEach(function (x) { ul.appendChild(el('div', { class: 'ci-line' + (have.has(x.src) ? ' done' : ''), text: VLChal.itemLabel(x.kind) + ' · ' + chalItemSummary({ kind: x.kind, sentence: x.sentence, data: x.data, pairs: [] }) })); });
      if (g.words.length >= 2) ul.appendChild(el('div', { class: 'ci-line' + (have.has(g.id + ':vocab') ? ' done' : ''), text: 'Abbina · ' + g.words.map(function (p) { return p.a; }).join(' · ') }));
      g.quizzes.forEach(function (x) { ul.appendChild(el('div', { class: 'ci-line' + (have.has(x.src) ? ' done' : ''), text: 'Scelta multipla · ' + x.q })); });
      det.appendChild(ul);
      card.appendChild(det);
      // esercizi NUOVI dalla trascrizione: scegli i tipi e quanti, il resto lo fa l'app (v72)
      const srcLs = S.lessons[g.id];
      if (srcLs && ((srcLs.chunks && srcLs.chunks.length) || (srcLs.lines && srcLs.lines.length))) {
        const gen = el('div', { class: 'ci-gen' });
        gen.appendChild(el('div', { class: 'lbl', text: '✨ Nuovi esercizi dalla trascrizione' }));
        const kindDefs = [['gap', 'spazi'], ['gapbank', 'semplificato'], ['scramble', 'riordino'], ['mc', 'scelta multipla'], ['match', 'abbina']];
        const kboxes = {};
        const krow = el('div', { class: 'ci-krow' });
        kindDefs.forEach(function (kd) {
          const cb = el('input', { type: 'checkbox', checked: kd[0] === 'match' ? null : 'checked' });
          kboxes[kd[0]] = cb;
          krow.appendChild(el('label', {}, cb, el('span', { text: kd[1] })));
        });
        gen.appendChild(krow);
        const nSel = el('select', {});
        [3, 5, 8].forEach(function (x) { nSel.appendChild(el('option', { value: String(x), text: String(x), selected: x === 5 ? 'selected' : null })); });
        // v83: focus delle domande a scelta multipla generate (contenuto / grammatica / lessico)
        const fSel = el('select', { title: 'Su cosa vertono le domande a scelta multipla' });
        [['content', 'sul contenuto'], ['grammar', 'sulla grammatica'], ['vocab', 'sul lessico']].forEach(function (o) { fSel.appendChild(el('option', { value: o[0], text: o[1] })); });
        const goBtn = el('button', { class: 'small primary', text: '✨ Genera' });
        gen.appendChild(el('div', { class: 'row' }, nSel, fSel, goBtn));
        const gmsg = el('div', { class: 'ci-gmsg hint' });
        goBtn.addEventListener('click', function () {
          const kinds = Object.keys(kboxes).filter(function (k) { return kboxes[k].checked; });
          if (!kinds.length) { gmsg.textContent = 'Scegli almeno un tipo.'; return; }
          const target = current(); if (!target || !target.chal) return;
          goBtn.disabled = true;
          busyMsg(gmsg, 'Leggo la trascrizione…');
          chalGenFromLesson(srcLs, kinds, +nSel.value || 5, fSel.value).then(function (r) {
            goBtn.disabled = false;
            r.items.forEach(function (it) { target.chal.items.push(it); });
            gmsg.textContent = (r.items.length ? r.items.length + ' esercizi aggiunti al set (li modifichi con ✎ nella pagina del set)' : 'Non sono uscite frasi adatte: prova altri tipi') + (r.notes.length ? ' · ' + r.notes.join(' · ') : '');
            if (r.items.length) chalSetTouched(target); else { target.updatedAt = new Date().toISOString(); saveDebounced(); }
          });
        });
        gen.appendChild(gmsg);
        card.appendChild(gen);
      }
      box.appendChild(card);
    });
  }
  let CS_DRAG = -1;
  /** v167 (Edoardo: "non mi piace che siano tutte uguali, non si può prendere una delle foto e metterla qui?"):
   *  copertina della card = la foto scelta con "🖼 Copertina" (ls.chal.cover = id dell'esercizio), altrimenti la prima
   *  foto del set; senza foto, un colore diverso per ogni set (dal titolo) con le iniziali. */
  function chalCoverItem(ls) {
    const items = (ls.chal && ls.chal.items) || [];
    return items.find(function (it) { return it && it.image && it.id === ls.chal.cover; }) || items.find(function (it) { return it && it.image; }) || null;
  }
  const COVER_BROKEN = {};   // v183: immagini di copertina che non si caricano (solo in memoria)
  function chalCoverThumb(ls, open) {
    const it = chalCoverItem(ls);
    if (it) {
      const d = el('div', { class: 'thumb chal-thumb has-cover', onclick: open, title: 'Apri l\'esercitazione' });
      d.style.backgroundImage = 'url("' + String(it.image).replace(/["\\\n]/g, '') + '")';
      return d;
    }
    // v183 (Edoardo, set importato da LearningApps: "perché non c'è la foto?"): senza foto negli esercizi, la copertina
    // può essere un'immagine del set (ls.chal.coverUrl: lo sfondo che l'app aveva su LearningApps)
    if (ls.chal && /^https?:\/\//.test(ls.chal.coverUrl || '')) {
      const d = el('div', { class: 'thumb chal-thumb has-cover', onclick: open, title: 'Apri l\'esercitazione' });
      const im = el('img', { class: 'cover-img', src: ls.chal.coverUrl, alt: '', referrerpolicy: 'no-referrer', loading: 'lazy' });
      im.addEventListener('error', function () { COVER_BROKEN[ls.chal.coverUrl] = 1; d.replaceWith(chalCoverThumb(ls, open)); });
      if (!COVER_BROKEN[ls.chal.coverUrl]) { d.appendChild(im); return d; }
    }
    const t = String(ls.title || 'Esercitazione');
    let h = 0; for (let i = 0; i < t.length; i++) h = (h * 31 + t.charCodeAt(i)) % 360;
    const ini = t.split(/[^A-Za-zÀ-ÿ0-9]+/).filter(Boolean).slice(0, 2).map(function (w) { return w.charAt(0).toUpperCase(); }).join('');
    const d = el('div', { class: 'thumb act-thumb chal-thumb no-cover', onclick: open, title: 'Apri l\'esercitazione' }, el('span', { class: 'ini', text: ini || '📝' }));
    d.style.background = 'linear-gradient(135deg, hsl(' + h + ' 70% 86%), hsl(' + ((h + 40) % 360) + ' 70% 74%))';
    d.style.color = 'hsl(' + h + ' 45% 30%)';
    return d;
  }
  function renderChalSet(ls) {
    trSetLabel(ls);
    $('#cs-title').value = ls.title || '';
    $('#cs-import').disabled = !chalImportGroups().length;
    const box = $('#cs-items'); box.innerHTML = '';
    const items = ls.chal.items || [];
    if (!items.length) box.appendChild(el('p', { class: 'hint', text: 'Il set è vuoto: importa dagli esercizi che hai già o aggiungine uno nuovo.' }));
    items.forEach(function (it, i) {
      const row = el('div', { class: 'cs-item' },
        el('span', { class: 'badge', text: String(i + 1) }),
        el('span', { class: 'kind', text: VLChal.itemLabel(it.kind) }),
        it.image ? el('img', { class: 'cs-thumb', src: it.image, alt: '' }) : null,
        el('span', { class: 'txt grow' }, el('span', { text: chalItemSummary(it) }), el('span', { class: 'cs-sol', text: '  → ' + VLChal.solutionText(it) }),
          it.explain ? el('span', { class: 'cs-exp', title: it.explain, text: ' 💬' }) : null),
        it.image ? el('button', { class: 'small' + (chalCoverItem(ls) === it ? ' primary' : ''), text: chalCoverItem(ls) === it ? '🖼 Copertina ✓' : '🖼 Copertina', title: 'Usa questa foto come copertina dell\'esercitazione nella pagina delle lezioni', onclick: function () { ls.chal.cover = it.id; chalSetTouched(ls); toast('Copertina scelta'); } }) : null,
        it.kind !== 'wheel' ? el('button', { class: 'small cs-ai', text: '✨ Simile', title: 'Crea un esercizio simile (stesso argomento, un\'altra forma: per esempio un altro articolo) e mettilo subito sotto', onclick: function (e) { chalAiItem(ls, i, 'similar', e.currentTarget); } }) : null,
        it.kind !== 'wheel' ? el('button', { class: 'small cs-ai', text: '↻', title: 'Rigenera: stessa cosa da allenare, frase nuova (sostituisce questa)', onclick: function (e) { chalAiItem(ls, i, 'regen', e.currentTarget); } }) : null,
        CS_UNDO[it.id] ? el('button', { class: 'small', text: '↶', title: 'Torna alla versione di prima', onclick: function () { items[i] = CS_UNDO[it.id]; delete CS_UNDO[it.id]; chalSetTouched(ls); toast('Versione di prima ripristinata'); } }) : null,
        it.kind !== 'match' ? el('button', { class: 'small', text: '🖼', title: 'Cerca una foto adatta alla frase', onclick: function () { openChalAdd(i); setTimeout(function () { const b = $('#ca-photo-go'); if (b) b.click(); }, 50); } }) : null,
        el('button', { class: 'small', text: '✎', title: 'Modifica', onclick: function () { openChalAdd(i); } }),
        el('button', { class: 'small', text: '↑', title: 'Sposta su', disabled: i === 0 ? 'disabled' : null, onclick: function () { const t = items[i - 1]; items[i - 1] = it; items[i] = t; chalSetTouched(ls); } }),
        el('button', { class: 'small', text: '↓', title: 'Sposta giù', disabled: i === items.length - 1 ? 'disabled' : null, onclick: function () { const t = items[i + 1]; items[i + 1] = it; items[i] = t; chalSetTouched(ls); } }),
        el('button', { class: 'small danger', text: '✕', onclick: function () { items.splice(i, 1); chalSetTouched(ls); toast('Esercizio tolto dal set'); } }));
      // v151 (Edoardo: "voglio poter trascinare le domande senza dover premere la freccia su o giù più volte"): la riga si
      // trascina (drag & drop nativo); una linea blu mostra dove cade. Le frecce restano (telefono, tastiera).
      row.setAttribute('draggable', 'true');
      row.title = 'Trascina per spostare';
      $$('img', row).forEach(function (im) { im.draggable = false; });   // la miniatura non deve partire per conto suo
      row.addEventListener('dragstart', function (e) {
        if (e.target !== row) return;
        CS_DRAG = i; row.classList.add('dragging');
        try { e.dataTransfer.effectAllowed = 'move'; e.dataTransfer.setData('text/plain', String(i)); } catch (err) { /* ignora */ }
      });
      row.addEventListener('dragend', function () { CS_DRAG = -1; $$('.cs-item', box).forEach(function (r) { r.classList.remove('dragging', 'drop-before', 'drop-after'); }); });
      row.addEventListener('dragover', function (e) {
        if (CS_DRAG === -1 || CS_DRAG === i) return;
        e.preventDefault();
        const r = row.getBoundingClientRect(), after = e.clientY > r.top + r.height / 2;
        row.classList.toggle('drop-before', !after); row.classList.toggle('drop-after', after);
      });
      row.addEventListener('dragleave', function () { row.classList.remove('drop-before', 'drop-after'); });
      row.addEventListener('drop', function (e) {
        if (CS_DRAG === -1 || CS_DRAG === i) return;
        e.preventDefault();
        const r = row.getBoundingClientRect(), after = e.clientY > r.top + r.height / 2;
        const from = CS_DRAG; CS_DRAG = -1;
        const moved = items.splice(from, 1)[0];
        let to = i + (after ? 1 : 0); if (from < to) to--;
        items.splice(to, 0, moved);
        chalSetTouched(ls);
      });
      box.appendChild(row);
    });
  }
  /** v138 (Edoardo: "per ogni tipo di esercizio voglio un pulsante create similar ... e poter rigenerare la stessa se non
   *  mi piace"): ✨ Simile aggiunge sotto un esercizio dello stesso tipo e argomento con un'altra forma; ↻ Rigenera lo
   *  sostituisce con una frase nuova (la versione di prima resta un clic su ↶ finché non si ricarica la pagina);
   *  ✎ resta per ritoccarlo a mano. Gli accenti contano (strict) come negli esercizi di grammatica dalla foto. */
  const CS_UNDO = {};
  function chalAiItem(ls, i, mode, btn) {
    if (!S.settings.apiKey) return toast('Serve la chiave AI: Impostazioni AI in alto', 6000);
    const items = ls.chal.items, it = items[i]; if (!it) return;
    const label = btn.textContent; btn.disabled = true; btn.textContent = '…';
    const avoid = items.map(function (x) { return chalItemSummary(x); });
    AI.similarItem({
      kind: it.kind, mode: mode, topic: it.topic || '',
      sentence: it.kind === 'mc' ? it.data.question + '  Options: ' + (it.data.options || []).filter(Boolean).join(' / ') : it.kind === 'match' ? it.pairs.map(function (p) { return p.a + ' = ' + p.b; }).join('; ') : (it.sentence || chalItemSummary(it)),
      solution: VLChal.solutionText(it), avoid: avoid,
      lang: String(ls.lang || 'it').slice(0, 2) === 'en' ? 'English' : 'Italian', level: ($('#ig-level') && $('#ig-level').value) || 'A2',
      apiKey: S.settings.apiKey, model: S.settings.model
    }).then(function (r) {
      btn.disabled = false; btn.textContent = label;
      const cur = items.indexOf(it); if (cur === -1) return;
      const built = chalBuildRaw(r.item, ls, it.strict || !!it.topic || it.kind === 'gap' || it.kind === 'gapbank', it.topic || '');
      if (!built) return toast('L\'AI ha scritto un esercizio che non riesco a costruire: riprova', 5000);
      if (it.explain && mode === 'regen') built.explain = '';
      if (mode === 'regen') { built.id = it.id; CS_UNDO[built.id] = it; items[cur] = built; }
      else items.splice(cur + 1, 0, built);
      chalSetTouched(ls);
      toast(mode === 'regen' ? 'Rigenerato (↶ per tornare a prima)' : 'Esercizio simile aggiunto sotto');
    }, function (e) { btn.disabled = false; btn.textContent = label; toast('AI: ' + e.message, 6000); });
  }
  function chalItemSummary(it) {
    if (it.kind === 'mc') return it.data.question + '  (' + (it.data.options || []).filter(Boolean).length + ' risposte)';
    if (it.kind === 'match') return it.pairs.map(function (p) { return p.a; }).join(' · ');
    if (it.kind === 'gap' || it.kind === 'gapbank') return VLChal.gapText(it);
    return it.sentence || (it.data.shown || it.data.tokens || []).join(' ');
  }
  function chalSetTouched(ls) { ls.updatedAt = new Date().toISOString(); saveDebounced(); renderChalSet(ls); }
  $('#cs-title').addEventListener('change', function () { const ls = current(); if (ls && ls.chal) { ls.title = this.value.trim(); ls.updatedAt = new Date().toISOString(); saveDebounced(); } });
  $('#cs-import').addEventListener('click', openChalImport);
  $('#ci-search').addEventListener('input', renderChalImport);
  $('#ci-close').addEventListener('click', function () { $('#dlg-chal-import').close(); });
  $('#ci-ok').addEventListener('click', function () {
    const ls = current(); if (!ls || !ls.chal) return;
    const have = chalHave(ls);
    const groups = chalImportGroups();
    let added = 0, skipped = 0;
    $$('#ci-list .ci-card').forEach(function (card) {
      const g = groups.find(function (x) { return x.id === card.getAttribute('data-id'); });
      if (!g) return;
      $$('input[type=checkbox]', card).forEach(function (cb) {
        if (!cb.checked || cb.disabled) return;
        const key = cb.getAttribute('data-key');
        if (key === 'exs') g.exs.forEach(function (x) {
          if (have.has(x.src)) { skipped++; return; }
          ls.chal.items.push({ id: 'i' + Math.random().toString(36).slice(2, 9), src: x.src, kind: x.kind, sentence: x.sentence, data: JSON.parse(JSON.stringify(x.data)) });
          have.add(x.src); added++;
        });
        if (key === 'words') {
          if (have.has(g.id + ':vocab')) { skipped++; return; }
          const it = VLChal.buildItem('match', g.words);
          if (it) { it.src = g.id + ':vocab'; ls.chal.items.push(it); have.add(it.src); added++; }
        }
        if (key === 'quiz') g.quizzes.forEach(function (x) {
          if (have.has(x.src)) { skipped++; return; }
          const it = VLChal.buildItem('mc', { q: x.q, options: x.options, correct: x.correct });
          if (it) { it.src = x.src; ls.chal.items.push(it); have.add(x.src); added++; }
        });
      });
    });
    $('#dlg-chal-import').close();
    chalSetTouched(ls);
    toast(added ? added + (added === 1 ? ' esercizio importato' : ' esercizi importati') + (skipped ? ' · ' + skipped + ' già nel set, saltati' : '') : (skipped ? 'Tutto già nel set: niente doppioni' : 'Seleziona prima cosa importare'));
  });
  $('#cs-delete').addEventListener('click', function () {
    const ls = current(); if (!ls) return;
    if (confirm('Eliminare il set "' + (ls.title || 'senza titolo') + '"?')) { deleteLesson(ls); renderHome(); }
  });
  /** v181 (Edoardo: "gli esercizi vorrei poterli aprire anche per una one to one e farli sul pc senza QR ... ovviamente
   *  la sfida in classe voglio che rimanga"): "▶ Fai qui" apre l'esercitazione su QUESTO schermo, con lo stesso giro dei
   *  compiti (aiuto con la regola, risposta da ricopiare, traduzione, riepilogo degli errori). Niente classe, niente
   *  codice, niente rete: S.assign.local = true, assignSend non manda niente e nessun risultato viene salvato. */
  function playSetHere(ls) {
    if (!ls || !ls.chal || !chalSetReady(ls)) return toast('Il set è vuoto: aggiungi almeno un esercizio');
    const lesson = asgPayload(ls);
    show('assign');
    document.body.classList.add('as-local');
    const box = $('#as-box'); box.innerHTML = '';
    const oldBack = $('#as-back'); if (oldBack) oldBack.remove();
    box.parentNode.insertBefore(el('div', { id: 'as-back', style: 'margin-bottom:10px' }, el('button', { class: 'small', text: '◀ Torna all\'esercitazione', onclick: function () { document.body.classList.remove('as-local'); const b = $('#as-back'); if (b) b.remove(); clearTimeout(S.assign && S.assign.timer); S.assign = null; openChalSet(ls.id); } })), box);
    S.assign = { local: true, backId: ls.id, be: null, code: '', id: VLClass.uuid(), name: '', detail: {}, lesson: lesson, status: 'local', timer: null, err: '' };
    playAssignSet({ title: ls.title || 'Esercitazione', code: '', lesson: lesson });
  }
  $('#cs-here').addEventListener('click', function () { const ls = current(); if (ls) { ls.title = $('#cs-title').value.trim() || ls.title; playSetHere(ls); } });
  $('#cs-play').addEventListener('click', function () {
    const ls = current(); if (!ls) return;
    if (!chalSetReady(ls)) return toast('Il set è vuoto: importa o aggiungi almeno un esercizio prima di lanciare la sfida');
    openChalNew(ls.id);
  });
  // "+ Esercizio" e "✎ Modifica": lo stesso dialog, con i campi che cambiano secondo il tipo.
  // editIx = indice dell'item nel set da modificare (null = nuovo); in modifica il tipo resta bloccato
  // e id/src vengono conservati, cosi' il dedup dell'import continua a funzionare.
  let CA_EDIT = null, CA_IMG = null, CA_PAINT_IMG = null, CA_IMG_CREDIT = '', CA_PHOTO = null;
  function openChalAdd(editIx) {
    const ls = current(); if (!ls || !ls.chal) return;
    CA_EDIT = (editIx == null ? null : editIx);
    const editing = CA_EDIT != null ? ls.chal.items[CA_EDIT] : null;
    CA_IMG = editing && editing.image || null; CA_IMG_CREDIT = editing && editing.imageCredit || ''; CA_PHOTO = null;
    $('#ca-title').textContent = editing ? 'Modifica esercizio' : 'Nuovo esercizio del set';
    $('#ca-ok').textContent = editing ? 'Salva' : 'Aggiungi';
    $('#ca-img').style.display = editing ? 'none' : '';
    const body = $('#ca-body'); body.innerHTML = '';
    const kindSel = el('select', { id: 'ca-kind' });
    VLChal.ITEM_KINDS.forEach(function (k) { kindSel.appendChild(el('option', { value: k[0], text: k[1] })); });
    if (editing) { kindSel.value = editing.kind; kindSel.disabled = true; }
    const fields = el('div', { style: 'margin-top:10px' });
    const paint = function () {
      const k = kindSel.value; fields.innerHTML = '';
      if (k === 'mc') {
        fields.appendChild(el('label', { text: 'Domanda' }));
        fields.appendChild(el('textarea', { id: 'ca-q', rows: '2', style: 'width:100%' }));
        for (let i = 0; i < 4; i++) {
          fields.appendChild(el('div', { class: 'row', style: 'margin-top:4px' },
            el('input', { type: 'radio', name: 'ca-right', value: String(i), checked: i === 0 ? 'checked' : null, title: 'La risposta giusta' }),
            el('input', { type: 'text', class: 'grow ca-opt', placeholder: 'Risposta ' + 'ABCD'[i] })));
        }
        if (editing) {
          $('#ca-q').value = editing.data.question || '';
          $$('.ca-opt', fields).forEach(function (inp, i) { inp.value = (editing.data.options || [])[i] || ''; });
          const r = fields.querySelector('input[name=ca-right][value="' + (editing.data.correct || 0) + '"]'); if (r) r.checked = true;
        }
      } else if (k === 'match') {
        fields.appendChild(el('p', { class: 'hint', text: 'Da 2 a 8 coppie (parola · traduzione o definizione).' }));
        for (let i = 0; i < 8; i++) {
          fields.appendChild(el('div', { class: 'row', style: 'margin-top:4px' },
            el('input', { type: 'text', class: 'grow ca-a', placeholder: 'parola ' + (i + 1) }),
            el('input', { type: 'text', class: 'grow ca-b', placeholder: 'abbinamento ' + (i + 1) })));
        }
        if (editing) {
          const as = $$('.ca-a', fields), bs = $$('.ca-b', fields);
          (editing.pairs || []).forEach(function (p, i) { if (as[i]) { as[i].value = p.a; bs[i].value = p.b; } });
        }
      } else {
        fields.appendChild(el('label', { text: 'La frase completa (con la risposta giusta dentro)' }));
        fields.appendChild(el('textarea', { id: 'ca-sent', rows: '3', style: 'width:100%', placeholder: 'Es. Francesca (lavorare) lavora al supermercato.' }));
        if (k === 'gap' || k === 'gapbank') {
          // v127: gli spazi li decide l'insegnante (prima li sceglieva sempre l'app: modificando un esercizio di Wayground lo spazio si spostava)
          fields.appendChild(el('label', { text: 'Parole da far scrivere (separate da virgola)' }));
          fields.appendChild(el('input', { id: 'ca-gaps', type: 'text', style: 'width:100%', placeholder: 'Es. lavora — vuoto = le sceglie l\'app' }));
          fields.appendChild(el('p', { class: 'hint', text: 'Scrivi la parola esattamente com\'è nella frase. Un indizio tra parentesi prima dello spazio aiuta: "(lavorare) lavora".' }));
        } else fields.appendChild(el('p', { class: 'hint', text: 'La parola in più/mancante/sbagliata la sceglie l\'app dalla frase.' }));
        if (editing) {
          $('#ca-sent').value = editing.sentence || '';
          if ($('#ca-gaps')) $('#ca-gaps').value = (editing.data && editing.data.tokens ? EX.gapRuns(editing.data).map(function (r) { return r.answer; }) : []).join(', ');   // v146: parole vicine = una risposta sola ("ragazzo simpatico")
        }
      }
      // v127: per tutti i tipi, spiegazione, accenti e immagine
      fields.appendChild(el('label', { text: 'Aiuto al primo errore (facoltativo: la regola, SENZA la risposta)' }));
      fields.appendChild(el('textarea', { id: 'ca-hint', rows: '2', style: 'width:100%', placeholder: 'Es. Nouns ending in -a: the plural ends in -e (casa → case).' }));
      fields.appendChild(el('label', { text: 'Spiegazione (facoltativa, lo studente la vede dopo aver risposto)' }));
      fields.appendChild(el('textarea', { id: 'ca-explain', rows: '2', style: 'width:100%', placeholder: 'Es. Finire prende -isc-: io finisco, lui finisce…' }));
      if (k !== 'match' && k !== 'mc') fields.appendChild(el('label', { class: 'chip', style: 'margin-top:8px;display:inline-flex' }, el('input', { id: 'ca-strict', type: 'checkbox' }), ' Gli accenti contano (è ≠ e)'));
      const imgWrap = el('div', { class: 'ca-imgbox' });
      fields.appendChild(el('label', { text: 'Immagine (facoltativa)' }));
      fields.appendChild(imgWrap);
      const paintImg = function () {
        imgWrap.innerHTML = '';
        // v147 (Edoardo: "ho incollato per sbaglio un'immagine ma non c'è la x per eliminarla"): la ✕ sta SULL'immagine,
        // dove la si cerca; il bottone "Togli l'immagine" in fondo resta.
        if (CA_IMG) imgWrap.appendChild(el('div', { class: 'ca-imgprev' }, el('img', { src: CA_IMG, alt: '' }),
          el('button', { class: 'ca-imgx', type: 'button', title: 'Togli l\'immagine', 'aria-label': 'Togli l\'immagine', text: '✕', onclick: function () { CA_IMG = null; CA_IMG_CREDIT = ''; paintImg(); } })));
        const f = el('input', { type: 'file', accept: 'image/*', class: 'sr', id: 'ca-imgfile' });
        f.addEventListener('change', function () { if (f.files[0]) imgToJpeg(f.files[0], function (im) { if (im) { CA_IMG = im.preview; paintImg(); } }, 560); });
        // v134 (Edoardo: "ma l'immagine non posso metterla con link? o incollare uno screenshot non salvato sul mac?"):
        // tre strade ben visibili: file, LINK a un'immagine, riquadro dove INCOLLARE (⌘V) lo screenshot fatto negli appunti.
        const urlIn = el('input', { type: 'url', placeholder: 'https://… link di un\'immagine', style: 'flex:1;min-width:200px' });
        const useUrl = function () {
          const u = urlIn.value.trim();
          if (!/^https?:\/\/\S+$/i.test(u)) { toast('Incolla un link che comincia con https://'); return; }
          const test = new Image();
          test.onload = function () { CA_IMG = u; paintImg(); };
          test.onerror = function () { toast('Da quel link non arriva un\'immagine: apri l\'immagine, tasto destro → "Copia indirizzo immagine"', 7000); };
          test.src = u;
        };
        urlIn.addEventListener('keydown', function (e) { if (e.key === 'Enter') { e.preventDefault(); useUrl(); } });
        const pasteZone = el('div', { class: 'ca-paste', tabindex: '0', text: '📋 Clicca qui e premi ⌘V per incollare uno screenshot (Mac: ⌘⇧⌃4 lo fa direttamente negli appunti, senza salvarlo)' });
        imgWrap.appendChild(pasteZone);
        imgWrap.appendChild(el('div', { class: 'row', style: 'gap:6px;flex-wrap:wrap;margin-top:6px' },
          urlIn, el('button', { class: 'small', text: '🔗 Usa il link', onclick: useUrl })));
        imgWrap.appendChild(el('div', { class: 'row', style: 'gap:6px;flex-wrap:wrap;margin-top:6px' },
          el('label', { for: 'ca-imgfile', class: 'chip', style: 'margin:0', text: CA_IMG ? '🖼 Cambia con un file' : '🖼 Scegli un file' }), f,
          CA_IMG ? el('button', { class: 'small', text: '✕ Togli l\'immagine', onclick: function () { CA_IMG = null; CA_IMG_CREDIT = ''; paintImg(); } }) : null,
          el('button', { class: 'small primary', id: 'ca-photo-go', text: '🔎 Cerca una foto adatta', title: 'L\'AI legge la frase e cerca foto vere della situazione', onclick: function () { caPhotoSearch(imgWrap); } })));
        if (CA_IMG && CA_IMG_CREDIT) imgWrap.appendChild(el('div', { class: 'hint', style: 'font-size:12px', text: '📷 ' + CA_IMG_CREDIT }));
        if (CA_PHOTO) caPhotoPaint(imgWrap);
      };
      CA_PAINT_IMG = paintImg;
      paintImg();
      if (editing) {
        $('#ca-explain').value = editing.explain || '';
        if ($('#ca-hint')) $('#ca-hint').value = editing.hint || '';
        if ($('#ca-strict')) $('#ca-strict').checked = !!editing.strict;
      } else if ($('#ca-strict')) $('#ca-strict').checked = true;
    };
    kindSel.addEventListener('change', paint);
    body.appendChild(el('label', { text: 'Tipo di esercizio' }));
    body.appendChild(kindSel);
    body.appendChild(fields);
    paint();
    $('#dlg-chal-add').showModal();
  }
  /** v139 (Edoardo: "la ricerca di foto vere per parola, però deve essere interpretata la frase: marcella lavora in un
   *  negozio di scarpe → shoeshop shopping assistant woman"): AI.photoQueries trasforma la frase in 3-5 ricerche inglesi
   *  corte (dalla piu' precisa alla piu' generica), poi si cerca su Pexels (se c'e' la chiave nelle Impostazioni: foto da
   *  archivio, belle) e su Openverse (senza chiave, foto Creative Commons, soprattutto Flickr). Le ricerche restano
   *  modificabili. Clic su una miniatura = immagine dell'esercizio, con l'autore in item.imageCredit. */
  function caPhotoText() {
    const t = ($('#ca-sent') && $('#ca-sent').value) || ($('#ca-q') && $('#ca-q').value) || '';
    if (t.trim()) return t.trim();
    const ed = CA_EDIT != null && current() && current().chal && current().chal.items[CA_EDIT];
    return ed ? chalItemSummary(ed) : '';
  }
  function caPhotoSearch(wrap, queriesText) {
    const text = caPhotoText();
    CA_PHOTO = CA_PHOTO || { queries: [], results: [], busy: false, msg: '', scene: '' };
    const P = CA_PHOTO;
    const run = function (queries) {
      P.queries = queries; P.busy = true; P.msg = 'Cerco: ' + queries.join(' · ') + '…'; P.results = [];
      caPhotoPaint(wrap);
      searchScenePhotos(queries).then(function (list) {
        if (CA_PHOTO !== P) return;
        P.busy = false; P.results = list;
        P.msg = list.length ? list.length + ' foto · clicca quella giusta' + (S.settings.unsplashKey || S.settings.pexelsKey ? '' : ' (con una chiave Unsplash nelle Impostazioni AI le foto sono più belle)') : 'Nessuna foto: cambia le parole qui sopra (in inglese, 1-3 parole) e cerca di nuovo.';
        caPhotoPaint(wrap);
      });
    };
    if (queriesText != null) return run(queriesText.split(/[,;\n]+/).map(function (q) { return q.trim(); }).filter(Boolean).slice(0, 5));
    if (!text) { P.msg = 'Scrivi prima la frase dell\'esercizio (o le parole da cercare qui sotto, in inglese).'; caPhotoPaint(wrap); return; }
    if (!S.settings.apiKey) { P.msg = 'Senza chiave AI non posso interpretare la frase: scrivi qui sotto le parole da cercare in inglese (es. shoe store, saleswoman).'; caPhotoPaint(wrap); return; }
    P.busy = true; P.msg = 'Leggo la frase e scelgo cosa cercare…'; caPhotoPaint(wrap);
    AI.photoQueries({ text: text, lang: 'Italian', apiKey: S.settings.apiKey, model: S.settings.model }).then(function (r) {
      if (CA_PHOTO !== P) return;
      P.scene = r.scene; run(r.queries);
    }, function (e) { P.busy = false; P.msg = 'AI: ' + e.message + '. Scrivi tu le parole da cercare.'; caPhotoPaint(wrap); });
  }
  function caPhotoPaint(wrap) {
    const P = CA_PHOTO; if (!P) return;
    let box = wrap.querySelector('.ca-photo');
    if (!box) { box = el('div', { class: 'ca-photo' }); wrap.appendChild(box); }
    box.innerHTML = '';
    const qIn = el('input', { type: 'text', value: P.queries.join(', '), placeholder: 'parole da cercare in inglese, separate da virgole', style: 'flex:1;min-width:200px' });
    qIn.addEventListener('keydown', function (e) { if (e.key === 'Enter') { e.preventDefault(); caPhotoSearch(wrap, qIn.value); } });
    if (P.scene) box.appendChild(el('div', { class: 'hint', text: '🎬 ' + P.scene }));
    box.appendChild(el('div', { class: 'row', style: 'gap:6px;flex-wrap:wrap' }, qIn,
      el('button', { class: 'small', text: '🔎 Cerca', onclick: function () { caPhotoSearch(wrap, qIn.value); } }),
      el('button', { class: 'small', text: '✕', title: 'Chiudi la ricerca', onclick: function () { CA_PHOTO = null; box.remove(); } })));
    const msg = el('div', { class: 'hint', style: 'margin:4px 0' });
    if (P.busy) busyMsg(msg, P.msg); else msg.textContent = P.msg;
    box.appendChild(msg);
    const grid = el('div', { class: 'ca-photo-grid' });
    P.results.forEach(function (ph) {
      const b = el('button', { class: 'ca-photo-it' + (CA_IMG === ph.url ? ' on' : ''), title: ph.credit },
        el('img', { src: ph.thumb, alt: ph.title || '', loading: 'lazy', referrerpolicy: 'no-referrer' }));
      b.querySelector('img').addEventListener('error', function () { b.remove(); });
      b.addEventListener('click', function () { CA_IMG = ph.url; CA_IMG_CREDIT = ph.credit; if (ph.ping && S.settings.unsplashKey) fetch(ph.ping, { headers: { Authorization: 'Client-ID ' + S.settings.unsplashKey } }).catch(function () {}); if (CA_PAINT_IMG) CA_PAINT_IMG(); });
      grid.appendChild(b);
    });
    box.appendChild(grid);
  }
  /** Pexels (con chiave) + Openverse (senza): per ogni ricerca, finché ci sono almeno 18 foto. */
  function searchScenePhotos(queries, want) {
    want = want || 18;
    const seen = new Set(), out = [];
    const add = function (o) { if (o.url && !seen.has(o.url)) { seen.add(o.url); out.push(o); } };
    const pexels = function (q) {
      return fetch('https://api.pexels.com/v1/search?per_page=12&query=' + encodeURIComponent(q), { headers: { Authorization: S.settings.pexelsKey } })
        .then(function (r) { return r.ok ? r.json() : null; }).then(function (j) {
          ((j && j.photos) || []).forEach(function (p) { add({ thumb: p.src.medium, url: p.src.large, title: p.alt || q, credit: 'Foto di ' + p.photographer + ' su Pexels' }); });
        }).catch(function () { /* ignora */ });
    };
    // v140: Pexels ha sospeso le chiavi nuove (1/10/2026): Unsplash (Client-ID, hotlink obbligatorio = l'URL salvato va
    // bene, attribuzione "Foto di X su Unsplash", e la segnalazione di download quando la foto viene scelta).
    const unsplash = function (q) {
      return fetch('https://api.unsplash.com/search/photos?per_page=12&content_filter=high&query=' + encodeURIComponent(q), { headers: { Authorization: 'Client-ID ' + S.settings.unsplashKey } })
        .then(function (r) { return r.ok ? r.json() : null; }).then(function (j) {
          ((j && j.results) || []).forEach(function (p) { add({ thumb: p.urls.small, url: p.urls.regular, title: p.alt_description || q, credit: 'Foto di ' + ((p.user && p.user.name) || 'autore') + ' su Unsplash', ping: p.links && p.links.download_location }); });
        }).catch(function () { /* ignora */ });
    };
    const openverse = function (q) {
      return fetch('https://api.openverse.org/v1/images/?page_size=12&mature=false&q=' + encodeURIComponent(q))
        .then(function (r) { return r.ok ? r.json() : null; }).then(function (j) {
          ((j && j.results) || []).forEach(function (p) {
            const lic = (p.license || '').toUpperCase() === 'CC0' ? 'CC0' : 'CC ' + String(p.license || '').toUpperCase() + (p.license_version ? ' ' + p.license_version : '');
            add({ thumb: p.thumbnail || p.url, url: p.url, title: p.title || q, credit: (p.title ? '«' + p.title + '» ' : '') + (p.creator ? 'di ' + p.creator + ' ' : '') + '(' + lic + ', ' + (p.source || 'Openverse') + ')' });
          });
        }).catch(function () { /* ignora */ });
    };
    const steps = [];
    queries.forEach(function (q) {
      if (S.settings.unsplashKey) steps.push(function () { return out.length >= want ? null : unsplash(q); });
      if (S.settings.pexelsKey) steps.push(function () { return out.length >= want ? null : pexels(q); });
      steps.push(function () { return out.length >= want ? null : openverse(q); });
    });
    return steps.reduce(function (p, f) { return p.then(f); }, Promise.resolve()).then(function () { return out.slice(0, 24); });
  }
  /** v148 (Edoardo: "voglio che con IA posso dire di rendere tutte le domande dello stile della prima e non doverle fare
   *  una ad una ... una chat con IA?"). Non una chat libera: un campo dove si scrive UN'istruzione per tutto il set
   *  ("rendi tutte le domande come la prima"), l'AI propone le modifiche (AI.editSet), si vede prima → dopo esercizio per
   *  esercizio con la spunta, e solo "Applica" tocca il set. Immagine, spiegazione, argomento e id restano quelli di prima.
   *  Dopo: toast con Annulla (rimette il set com'era). Si può ripetere con un'altra istruzione: è la "conversazione". */
  function setAiText(it) {
    if (it.kind === 'mc') return it.data.question + '  Options: ' + (it.data.options || []).filter(Boolean).join(' / ');
    if (it.kind === 'match') return it.pairs.map(function (p) { return p.a + ' = ' + p.b; }).join('; ');
    return it.sentence || chalItemSummary(it);
  }
  function openSetAi() {
    const ls = current(); if (!ls || !ls.chal) return;
    if (!S.settings.apiKey) return toast('Serve la chiave AI: Impostazioni AI in alto', 6000);
    if (!(ls.chal.items || []).length) return toast('Il set è vuoto');
    let dlg = $('#dlg-set-ai');
    if (!dlg) {
      dlg = el('dialog', { id: 'dlg-set-ai' });
      document.body.appendChild(dlg);
    }
    dlg.innerHTML = '';
    const ta = el('textarea', { rows: '3', style: 'width:100%', placeholder: 'Es. Rendi tutte le domande come la prima · Metti le foto alle domande dalla 7 alla 12 · Trasforma tutto in scelta multipla · Lascia solo parola → parola' });
    const out = el('div', { class: 'setai-out' });
    const msg = el('div', { class: 'hint', style: 'margin:8px 0' });
    const go = el('button', { class: 'primary', text: '✨ Proponi le modifiche' });
    const apply = el('button', { class: 'primary', text: 'Applica', style: 'display:none' });
    const chips = el('div', { class: 'chips', style: 'margin:6px 0' });
    ['Rendi tutte le domande come la prima', 'Aggiungi a ogni esercizio un aiuto con la regola (in inglese, senza la risposta)', 'Metti una foto a tutti gli esercizi che non ce l\'hanno', 'Lascia solo parola → parola, senza domanda', 'Trasforma tutti in scelta multipla', 'Trasforma tutti in completa con le parole (banca)'].forEach(function (t) {
      chips.appendChild(el('button', { class: 'small', type: 'button', text: t, onclick: function () { ta.value = t; ta.focus(); } }));
    });
    let proposals = [];
    const run = function () {
      const instr = ta.value.trim(); if (!instr) { ta.focus(); return; }
      go.disabled = true; apply.style.display = 'none'; out.innerHTML = '';
      busyMsg(msg, 'L\'AI legge i ' + ls.chal.items.length + ' esercizi e prepara le modifiche… (10-40 secondi)');
      const items = ls.chal.items;
      AI.editSet({
        items: items.map(function (it, i) { return { n: i + 1, type: it.kind, text: setAiText(it), solution: VLChal.solutionText(it), photo: !!it.image, explain: it.explain || '', hint: it.hint || '' }; }),
        instruction: instr, lang: String(ls.lang || 'it').slice(0, 2) === 'en' ? 'English' : 'Italian', level: S.settings.igLevel || 'A2',
        apiKey: S.settings.apiKey, model: S.settings.model
      }).then(function (r) {
        go.disabled = false;
        proposals = r.changes.map(function (c) {
          const old = items[c.n - 1]; if (!old) return null;
          let built = null, textChanged = false;
          if (c.item) {
            built = chalBuildRaw(c.item, ls, old.strict || (c.item.type !== 'mc' && c.item.type !== 'match'), old.topic || '');
            if (built) textChanged = !(chalItemSummary(built) === chalItemSummary(old) && built.kind === old.kind && VLChal.solutionText(built) === VLChal.solutionText(old));
          }
          if (!built || !textChanged) { built = JSON.parse(JSON.stringify(old)); textChanged = false; }
          built.id = old.id; if (old.src) built.src = old.src;
          if (old.image) { built.image = old.image; if (old.imageCredit) built.imageCredit = old.imageCredit; }
          if (old.explain) built.explain = old.explain;
          const newExplain = typeof c.explain === 'string' && c.explain !== (old.explain || '') ? c.explain : null;
          if (old.hint && !built.hint) built.hint = old.hint;
          const newHint = typeof c.hint === 'string' && c.hint !== (old.hint || '') ? c.hint : null;
          if (newHint != null) { if (newHint) built.hint = newHint; else delete built.hint; }
          if (newExplain != null) { if (newExplain) built.explain = newExplain; else delete built.explain; }
          const removePhoto = c.photo === false && !!old.image;
          const queries = Array.isArray(c.photo) ? c.photo : null;
          if (!textChanged && !removePhoto && !queries && newExplain == null && newHint == null) return null;
          return { i: c.n - 1, old: old, built: built, textChanged: textChanged, removePhoto: removePhoto, queries: queries, photos: [], pick: 0, newExplain: newExplain, newHint: newHint };
        }).filter(Boolean);
        // v149 (Edoardo: "metti le foto alle domande dalla 7 alla 12" → l'AI diceva di averlo fatto senza poterlo fare):
        // le foto le cerca l'APP con le parole date dall'AI (3 candidate per esercizio, la prima è scelta, clic per cambiarla)
        const paint = function () {
          const keep = {}; $$('.setai-photos', out).forEach(function (st) { keep[st.getAttribute('data-k')] = st.scrollLeft; });
          const top = out.scrollTop;
          out.innerHTML = '';
          proposals.forEach(function (p, k) {
            const diff = el('span', { class: 'setai-diff' });
            if (p.textChanged) {
              diff.appendChild(el('span', { class: 'setai-old', text: (p.old.kind !== p.built.kind ? VLChal.itemLabel(p.old.kind) + ': ' : '') + chalItemSummary(p.old) + '  → ' + VLChal.solutionText(p.old) }));
              diff.appendChild(el('span', { class: 'setai-new', text: (p.old.kind !== p.built.kind ? VLChal.itemLabel(p.built.kind) + ': ' : '') + chalItemSummary(p.built) + '  → ' + VLChal.solutionText(p.built) }));
            } else diff.appendChild(el('span', { text: chalItemSummary(p.old) + '  → ' + VLChal.solutionText(p.old) }));
            if (p.removePhoto) diff.appendChild(el('span', { class: 'setai-new', text: '🖼 la foto viene tolta' }));
            if (p.newHint != null) diff.appendChild(el('span', { class: 'setai-new', text: p.newHint ? '💡 Aiuto (al primo errore): ' + p.newHint : '💡 l\'aiuto viene tolto' }));
            if (p.newExplain != null) diff.appendChild(el('span', { class: 'setai-new', text: p.newExplain ? '💬 Spiegazione (dopo la risposta): ' + p.newExplain : '💬 la spiegazione viene tolta' }));
            if (p.queries) {
              if (p.searching) { const w = el('span', { class: 'hint' }); busyMsg(w, 'Cerco la foto: ' + p.queries.join(' · ') + '…'); diff.appendChild(w); }
              else if (!p.photos.length) diff.appendChild(el('span', { class: 'hint', text: '🖼 Nessuna foto trovata per: ' + p.queries.join(' · ') + ' (usa 🖼 sulla riga per cercarla a mano)' }));
              else {
                const strip = el('span', { class: 'setai-photos', 'data-k': String(k) });
                setTimeout(function () { if (keep[k]) strip.scrollLeft = keep[k]; out.scrollTop = top; }, 0);
                p.photos.forEach(function (ph, j) {
                  const bt = el('button', { type: 'button', class: 'ca-photo-it' + (p.pick === j ? ' on' : ''), title: ph.credit }, el('img', { src: ph.thumb, alt: '', referrerpolicy: 'no-referrer' }));
                  bt.addEventListener('click', function (e) { e.preventDefault(); p.pick = j; paint(); });
                  strip.appendChild(bt);
                });
                diff.appendChild(strip);
                diff.appendChild(el('span', { class: 'hint', style: 'font-size:12px', text: p.photos.length + ' foto: scorri di lato → · ' + (p.photos[p.pick] ? p.photos[p.pick].credit : '') }));
              }
              // v150 (Edoardo: "mi propone solo 3 foto, voglio poter scorrere e trovare quella più adatta"): fino a 24 foto
              // in una striscia che scorre, e le parole della ricerca si possono cambiare lì (Invio o 🔎)
              if (!p.searching) {
                const qi = el('input', { type: 'text', value: p.queries.join(', '), class: 'setai-q', title: 'Parole cercate (in inglese, separate da virgole): cambiale e premi Invio' });
                const again = function (e) {
                  if (e) e.preventDefault();
                  const qs = qi.value.split(/[,;]+/).map(function (x) { return x.trim(); }).filter(Boolean).slice(0, 4);
                  if (!qs.length) return;
                  p.queries = qs; p.searching = true; p.pick = 0; paint();
                  searchScenePhotos(qs, 12).then(function (list) { p.photos = list.slice(0, 24); p.searching = false; if (dlg.open) paint(); });
                };
                qi.addEventListener('keydown', function (e) { if (e.key === 'Enter') again(e); });
                qi.addEventListener('click', function (e) { e.preventDefault(); e.stopPropagation(); qi.focus(); });
                diff.appendChild(el('span', { class: 'setai-qrow' }, qi, el('button', { type: 'button', class: 'small', text: '🔎 Cerca altre', onclick: again })));
              }
            }
            const cb = el('input', { type: 'checkbox', 'data-k': String(k) }); cb.checked = p.on !== false;
            cb.addEventListener('change', function () { p.on = cb.checked; });
            out.appendChild(el('label', { class: 'setai-row' }, cb, el('span', { class: 'badge', text: String(p.i + 1) }), diff));
          });
        };
        const nPhoto = proposals.filter(function (p) { return p.queries; }).length;
        msg.textContent = proposals.length
          ? (r.note ? r.note + ' · ' : '') + proposals.length + (proposals.length === 1 ? ' esercizio cambia' : ' esercizi cambiano') + ': togli la spunta a quelli che vuoi lasciare come sono.' + (nPhoto ? ' Per le foto clicca quella che preferisci.' : '') + (r.ai && r.ai.cost ? ' (' + (r.ai.cost * 100).toFixed(1) + ' cent)' : '')
          : 'Nessuna modifica proposta: l\'AI non ha cambiato niente. Prova a scrivere l\'istruzione in un altro modo.' + (r.ai && r.ai.cost ? ' (' + (r.ai.cost * 100).toFixed(1) + ' cent)' : '');
        proposals.forEach(function (p) { if (p.queries) p.searching = true; });
        paint();
        // una ricerca alla volta (Unsplash in demo: 50 richieste all'ora)
        proposals.filter(function (p) { return p.queries; }).reduce(function (chain, p) {
          return chain.then(function () { return searchScenePhotos(p.queries, 12); }).then(function (list) { p.photos = list.slice(0, 24); p.searching = false; if (dlg.open) paint(); });
        }, Promise.resolve());
        apply.style.display = proposals.length ? '' : 'none';
      }, function (e) { go.disabled = false; msg.textContent = 'AI: ' + e.message; });
    };
    go.addEventListener('click', run);
    ta.addEventListener('keydown', function (e) { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) run(); });
    apply.addEventListener('click', function () {
      const before = ls.chal.items.slice();
      let n = 0;
      proposals.forEach(function (p) {
        if (p.on === false || ls.chal.items[p.i] !== p.old) return;
        const ph = p.queries && p.photos[p.pick];
        if (p.queries && !ph && !p.textChanged && !p.removePhoto && p.newExplain == null && p.newHint == null) return;   // foto non trovata e nient'altro da cambiare
        if (p.removePhoto) { delete p.built.image; delete p.built.imageCredit; }
        if (ph) {
          p.built.image = ph.url; p.built.imageCredit = ph.credit;
          if (ph.ping && S.settings.unsplashKey) fetch(ph.ping, { headers: { Authorization: 'Client-ID ' + S.settings.unsplashKey } }).catch(function () {});
        }
        ls.chal.items[p.i] = p.built; n++;
      });
      dlg.close();
      if (!n) return;
      chalSetTouched(ls);
      toastUndo(n + (n === 1 ? ' esercizio modificato' : ' esercizi modificati') + ' dall\'AI', function () { ls.chal.items = before; chalSetTouched(ls); }, 12000);
    });
    dlg.appendChild(el('h2', { style: 'margin-top:0', text: '✨ Modifica con IA' }));
    dlg.appendChild(el('p', { class: 'hint', text: 'Scrivi cosa cambiare in tutti gli esercizi (o "solo dal 7 al 12"). L\'AI propone, tu controlli e confermi: finché non premi Applica non cambia niente. Immagini e spiegazioni restano.' }));
    dlg.appendChild(ta); dlg.appendChild(chips);
    dlg.appendChild(el('div', { class: 'row', style: 'gap:8px' }, go, apply, el('button', { text: 'Chiudi', onclick: function () { dlg.close(); } })));
    dlg.appendChild(msg); dlg.appendChild(out);
    dlg.showModal(); ta.focus();
  }
  $('#cs-ai').addEventListener('click', openSetAi);
  // ---------- v166: traduzioni per gli studenti ----------
  // Edoardo: "voglio anche che lo studente possa tradurre l'esercizio, se non capisce sceglie quale lingua usare".
  // L'insegnante le prepara una volta (🌐 Traduzioni nel set): restano in item.tr = { src, hsrc, t:{en:…}, h:{en:…} } e
  // viaggiano con il compito e con la sfida. Lo studente sceglie la lingua (ricordata sul suo dispositivo).
  const STU_LANGS = [['en', 'English', 'English'], ['es', 'Español', 'Spanish'], ['fr', 'Français', 'French'], ['de', 'Deutsch', 'German'], ['zh', '中文', 'Chinese (Simplified)'], ['ja', '日本語', 'Japanese'], ['ar', 'العربية', 'Arabic'], ['fa', 'فارسی', 'Persian'], ['tr', 'Türkçe', 'Turkish']];
  function trSrc(it) {
    if (!it || it.kind === 'match' || it.kind === 'wheel') return '';   // abbinamenti: la traduzione sarebbe la soluzione
    if (it.kind === 'mc') return String(it.data && it.data.question || '');
    // v170: per gli spazi si traduce il testo che lo studente VEDE ("Qual è il maschile di nonna? → _____"), senza la risposta
    if (it.kind === 'gap' || it.kind === 'gapbank') { try { return String(VLChal.pubItem(it, { showQ: true }).sentence || ''); } catch (e) { return ''; } }
    return String(it.sentence || '');
  }
  /** Le traduzioni dell'esercizio se sono ancora quelle del testo attuale (dopo una modifica non valgono più). */
  function trValid(it) { return it && it.tr && it.tr.t && it.tr.src === trSrc(it) && STU_LANGS.every(function (l) { return it.tr.t[l[0]]; }) ? it.tr : null; }
  function trHintOk(it) { const tr = trValid(it); return !it.hint || !!(tr && tr.hsrc === it.hint && tr.h && tr.h.en); }
  function stuTrLang() { try { return localStorage.getItem('pl-trlang') || ''; } catch (e) { return ''; } }
  /** Sul telefono: menu "🌐 Translate" + riquadro con la traduzione nella lingua scelta. t = { en: '…', … } o null. */
  // v169 (Edoardo: "volevo che ci potesse essere la traduzione della consegna dell'esercizio, perché non c'è?"): la CONSEGNA
  // (cosa bisogna fare) è un testo fisso per tipo di esercizio: tradotta qui una volta, senza IA, quindi c'è SEMPRE, anche
  // nei set dove l'insegnante non ha premuto "🌐 Traduzioni" (quelle servono solo per la frase).
  const STU_INSTR = {
    gap: { en: 'Write the answer in the blank.', es: 'Escribe la respuesta en el hueco.', fr: 'Écris la réponse dans l’espace vide.', de: 'Schreib die Antwort in die Lücke.', zh: '在空格里写出答案。', ja: '空欄に答えを書いてください。', ar: 'اكتب الإجابة في الفراغ.', fa: 'پاسخ را در جای خالی بنویس.', tr: 'Cevabı boşluğa yaz.' },
    gapbank: { en: 'Choose the right word for each gap.', es: 'Elige la palabra correcta para cada hueco.', fr: 'Choisis le bon mot pour chaque espace.', de: 'Wähle für jede Lücke das richtige Wort.', zh: '为每个空格选择正确的词。', ja: '空欄に合う言葉を選んでください。', ar: 'اختر الكلمة الصحيحة لكل فراغ.', fa: 'برای هر جای خالی کلمهٔ درست را انتخاب کن.', tr: 'Her boşluk için doğru kelimeyi seç.' },
    mc: { en: 'Choose the right answer.', es: 'Elige la respuesta correcta.', fr: 'Choisis la bonne réponse.', de: 'Wähle die richtige Antwort.', zh: '选择正确的答案。', ja: '正しい答えを選んでください。', ar: 'اختر الإجابة الصحيحة.', fa: 'پاسخ درست را انتخاب کن.', tr: 'Doğru cevabı seç.' },
    scramble: { en: 'Put the words in the right order.', es: 'Pon las palabras en el orden correcto.', fr: 'Mets les mots dans le bon ordre.', de: 'Bring die Wörter in die richtige Reihenfolge.', zh: '把词语按正确的顺序排列。', ja: '言葉を正しい順番に並べてください。', ar: 'رتّب الكلمات بالترتيب الصحيح.', fa: 'کلمه‌ها را به ترتیب درست بچین.', tr: 'Kelimeleri doğru sıraya koy.' },
    extra: { en: 'There is one extra word: tap it.', es: 'Sobra una palabra: tócala.', fr: 'Il y a un mot en trop : touche-le.', de: 'Ein Wort ist zu viel: Tippe es an.', zh: '句子里多了一个词：点击它。', ja: '余分な言葉が一つあります。それをタップしてください。', ar: 'توجد كلمة زائدة: اضغط عليها.', fa: 'یک کلمه اضافه است: روی آن بزن.', tr: 'Fazla bir kelime var: ona dokun.' },
    missing: { en: 'A word is missing: tap where it goes and write it.', es: 'Falta una palabra: toca dónde va y escríbela.', fr: 'Il manque un mot : touche l’endroit où il va et écris-le.', de: 'Ein Wort fehlt: Tippe auf die Stelle und schreib es.', zh: '句子里少了一个词：点击它的位置并写出来。', ja: '言葉が一つ足りません。入る場所をタップして書いてください。', ar: 'هناك كلمة ناقصة: اضغط على مكانها واكتبها.', fa: 'یک کلمه جا افتاده است: روی جای آن بزن و آن را بنویس.', tr: 'Bir kelime eksik: yerine dokun ve yaz.' },
    wrong: { en: 'One word is wrong: tap it and write the correct one.', es: 'Una palabra está mal: tócala y escribe la correcta.', fr: 'Un mot est faux : touche-le et écris le bon.', de: 'Ein Wort ist falsch: Tippe es an und schreib das richtige.', zh: '有一个词是错的：点击它并写出正确的词。', ja: '間違っている言葉が一つあります。タップして正しい言葉を書いてください。', ar: 'هناك كلمة خاطئة: اضغط عليها واكتب الكلمة الصحيحة.', fa: 'یک کلمه اشتباه است: روی آن بزن و درستش را بنویس.', tr: 'Bir kelime yanlış: ona dokun ve doğrusunu yaz.' },
    match: { en: 'Match the pairs.', es: 'Une las parejas.', fr: 'Associe les paires.', de: 'Ordne die Paare zu.', zh: '把相配的两项连起来。', ja: '合うものを組み合わせてください。', ar: 'صِل كل عنصر بما يناسبه.', fa: 'جفت‌ها را به هم وصل کن.', tr: 'Çiftleri eşleştir.' }
  };
  function trBar(t, onChange, kind) {
    const box = el('div', { class: 'tr-box', dir: 'auto', style: 'display:none' });
    const sel = el('select', { class: 'tr-sel', 'aria-label': 'Translate' });
    sel.appendChild(el('option', { value: '', text: '🌐 Translate' }));
    STU_LANGS.forEach(function (l) { sel.appendChild(el('option', { value: l[0], text: '🌐 ' + l[1] })); });
    const paint = function () {
      const lg = sel.value, x = lg && t && t[lg], ins = lg && STU_INSTR[kind] && STU_INSTR[kind][lg];
      box.innerHTML = '';
      // v170 (Edoardo: 'che significa "write the missing word" se la consegna è "qual è il maschile di nonna?"'): la
      // consegna vera è il testo dell'esercizio; quella generica per tipo resta solo se la traduzione manca
      if (x) box.appendChild(el('div', { class: 'tr-txt', text: x }));
      else if (ins) box.appendChild(el('div', { class: 'tr-ins', text: ins }));
      box.style.display = ins || x ? '' : 'none';
    };
    sel.value = stuTrLang(); paint();
    sel.addEventListener('change', function () { try { localStorage.setItem('pl-trlang', sel.value); } catch (e) {} paint(); if (onChange) onChange(sel.value); });
    return el('div', { class: 'tr-bar' }, sel, box);
  }
  function trSetLabel(ls) {
    const b = $('#cs-tr'); if (!b || !ls || !ls.chal) return;
    const can = (ls.chal.items || []).filter(function (it) { return trSrc(it); });
    const done = can.filter(function (it) { return trValid(it) && trHintOk(it); }).length;
    b.textContent = '🌐 Traduzioni' + (can.length ? ' ' + done + '/' + can.length : '');
    b.classList.toggle('ok', !!can.length && done === can.length);
  }
  /** Traduce gli esercizi del set che non hanno ancora una traduzione valida. Non rifiuta mai: { todo, n, err }.
   *  v170: parte anche DA SOLA quando si assegna un compito o si lancia una sfida (Edoardo si aspettava di trovarla). */
  function trEnsure(ls, onProgress) {
    const todo = [];
    ((ls && ls.chal && ls.chal.items) || []).forEach(function (it, i) { if (trSrc(it) && !(trValid(it) && trHintOk(it))) todo.push({ n: i + 1, it: it }); });
    if (!todo.length) return Promise.resolve({ todo: 0, n: 0 });
    if (!S.settings.apiKey) return Promise.resolve({ todo: todo.length, n: 0, err: 'nokey' });
    return AI.translateSet({
      items: todo.map(function (x) { return { n: x.n, text: trSrc(x.it), hint: x.it.hint || '' }; }),
      langs: STU_LANGS.map(function (l) { return { code: l[0], name: l[2] }; }),
      lang: String(ls.lang || 'it').slice(0, 2) === 'en' ? 'English' : 'Italian',
      apiKey: S.settings.apiKey, model: S.settings.model,
      onProgress: function (d) { if (onProgress) onProgress(d, todo.length); }
    }).then(function (r) {
      let n = 0;
      todo.forEach(function (x) {
        const got = r.byN[x.n]; if (!got || ls.chal.items[x.n - 1] !== x.it) return;
        const tr = { src: trSrc(x.it), t: got.t };
        if (x.it.hint) { tr.hsrc = x.it.hint; tr.h = Object.assign({}, got.h, { en: got.h.en || x.it.hint }); }
        x.it.tr = tr; if (trValid(x.it)) n++;
      });
      if (n) { ls.updatedAt = new Date().toISOString(); saveDebounced(); }
      return { todo: todo.length, n: n };
    }, function (e) { return { todo: todo.length, n: 0, err: (e && e.message) || String(e) }; });
  }
  /** Prima di assegnare o lanciare: traduce quello che manca, al massimo 60 secondi, poi si va avanti comunque. */
  function trBefore(ls, then) {
    const need = ((ls && ls.chal && ls.chal.items) || []).some(function (it) { return trSrc(it) && !(trValid(it) && trHintOk(it)); });
    if (!need || !S.settings.apiKey) return then();
    let gone = false; const go = function () { if (gone) return; gone = true; then(); };
    toast('🌐 Preparo le traduzioni per gli studenti (solo la prima volta, 10-30 secondi)…', 30000);
    setTimeout(go, 60000);
    trEnsure(ls).then(function (r) { toast(r.n ? '🌐 Traduzioni pronte' : 'Traduzioni non riuscite: si parte senza', 3000); go(); });
  }
  function chalTranslateSet() {
    const ls = current(); if (!ls || !ls.chal) return;
    const b = $('#cs-tr');
    if (!(ls.chal.items || []).some(trSrc)) return toast('Qui non c\'è niente da tradurre');
    b.disabled = true; busyMsg(b, ' Traduco…');
    trEnsure(ls, function (d, n) { busyMsg(b, ' Traduco ' + d + '/' + n + '…'); }).then(function (r) {
      b.disabled = false; renderChalSet(ls);
      if (!r.todo) return toast('Tutti gli esercizi sono già tradotti nelle ' + STU_LANGS.length + ' lingue: gli studenti vedono "🌐 Translate"');
      if (r.err === 'nokey') return toast('Serve la chiave AI: Impostazioni AI in alto', 6000);
      if (r.err) return toast('Traduzione non riuscita: ' + r.err, 7000);
      toast(r.n === r.todo ? '🌐 ' + r.n + (r.n === 1 ? ' esercizio tradotto' : ' esercizi tradotti') + ' in ' + STU_LANGS.length + ' lingue' : '🌐 Tradotti ' + r.n + ' su ' + r.todo + ': premi di nuovo per completare', 6000);
    });
  }
  $('#cs-tr').addEventListener('click', chalTranslateSet);

  $('#cs-add').addEventListener('click', function () { openChalAdd(null); });
  $('#ca-close').addEventListener('click', function () { CA_EDIT = null; $('#dlg-chal-add').close(); });
  // v70: esercizi del set generati da una foto o screenshot
  function chalFromPhoto() {
    openImgGen({ kinds: ['gap', 'gapbank', 'mc', 'wrong', 'missing', 'extra', 'scramble', 'match'], onAccept: function (items) {
      const ls = current(); if (!ls || !ls.chal) return;
      const withTopic = IMGGEN.lastFocus;
      let n = 0;
      items.forEach(function (it) {
        const built = chalBuildRaw(it, ls, withTopic, IMGGEN.lastTopics.length === 1 ? IMGGEN.lastTopics[0] : '');
        if (built) { ls.chal.items.push(built); n++; }
      });
      if ($('#dlg-chal-add').open) $('#dlg-chal-add').close();
      chalSetTouched(ls);
      toast(n ? n + (n === 1 ? ' esercizio aggiunto dall\'immagine' : ' esercizi aggiunti dall\'immagine') : 'Nessun esercizio costruibile dalle proposte');
    } });
  }
  /** v138: item grezzo dell'AI → esercizio del set (foto, Simile, Rigenera). topic resta sull'item: serve a Simile. */
  function chalBuildRaw(it, ls, strict, topic) {
    let built = null;
    if (it.type === 'mc') built = VLChal.buildItem('mc', it);
    else if (it.type === 'match') built = VLChal.buildItem('match', it.pairs);
    else built = VLChal.buildItem(it.type, it.sentence, { lang: ls.lang || 'it', seed: Date.now() % 100000, distractors: 2, choices: igChoices(it) });
    if (!built) return null;
    // v126: esercizi di grammatica = gli accenti contano (è/e, perché/perche)
    if (strict && built.kind !== 'match' && built.kind !== 'mc') built.strict = true;
    if (it.topic || topic) built.topic = it.topic || topic;
    if (it.hint) built.hint = it.hint;   // v165: la regola che aiuta, senza la risposta
    return built;
  }
  /** v136: le parole scelte dal modello per l'argomento (spazio, parola sbagliata, mancante, in più) */
  function igChoices(it) {
    const c = {};
    if (it.gaps) { c.gapWords = it.gaps; c.distractors = it.distractors; }
    if (it.wrongWord) { c.wrongWord = it.wrongWord; c.wrongReplacement = it.wrongReplacement; }
    if (it.missingWord) c.missingWord = it.missingWord;
    if (it.extraWord) { c.extraWord = it.extraWord; if (it.extraAfter) c.extraAfter = it.extraAfter; }
    return Object.keys(c).length ? c : null;
  }
  $('#ca-img').addEventListener('click', chalFromPhoto);
  $('#cs-photo').addEventListener('click', function () {
    if (!S.settings.apiKey) return toast('Per creare esercizi da una foto serve la chiave AI: Impostazioni AI in alto', 6000);
    chalFromPhoto();
  });
  $('#cs-assign').addEventListener('click', function () {
    const ls = current(); if (!ls || !ls.chal) return;
    if (!(ls.chal.items || []).length) return toast('Prima aggiungi almeno un esercizio');
    openAssignDialog(ls);
  });
  $('#ca-ok').addEventListener('click', function () {
    const ls = current(); if (!ls || !ls.chal) return;
    const k = $('#ca-kind').value;
    let it = null;
    if (k === 'mc') {
      const q = ($('#ca-q').value || '').trim();
      const opts = $$('.ca-opt', $('#ca-body')).map(function (i) { return i.value.trim(); });
      const right = +(document.querySelector('#ca-body input[name=ca-right]:checked') || {}).value || 0;
      if (!q || opts.filter(Boolean).length < 2) return toast('Servono la domanda e almeno due risposte');
      it = VLChal.buildItem('mc', { q: q, options: opts.filter(Boolean), correct: right });
    } else if (k === 'match') {
      const as = $$('.ca-a', $('#ca-body')).map(function (i) { return i.value.trim(); });
      const bs = $$('.ca-b', $('#ca-body')).map(function (i) { return i.value.trim(); });
      const pairs = as.map(function (a, i) { return { a: a, b: bs[i] }; }).filter(function (p) { return p.a && p.b; });
      if (pairs.length < 2) return toast('Servono almeno due coppie complete');
      it = VLChal.buildItem('match', pairs);
    } else {
      const sent = ($('#ca-sent').value || '').trim();
      if (!sent) return toast('Scrivi prima la frase');
      const gw = $('#ca-gaps') ? $('#ca-gaps').value.split(',').map(function (x) { return x.trim(); }).filter(Boolean) : [];
      it = VLChal.buildItem(k, sent, { lang: ls.lang || 'it', seed: Date.now() % 100000, distractors: 2, choices: gw.length ? { gapWords: gw } : null });
      if (!it) return toast('Frase non adatta a questo tipo (troppo corta?): prova con una frase più lunga');
      if (gw.length && (k === 'gap' || k === 'gapbank')) {
        // v146 (screenshot di Edoardo: "Non trovo nella frase: ragazzo simpatico" con la frase che lo contiene): dalla v138 una
        // risposta di più parole diventa uno spazio per parola, quindi il confronto va fatto parola per parola.
        const found = (it.data.answers || []).map(function (a) { return L.normalize(a); });
        const miss = gw.filter(function (w) { return !w.split(/\s+/).filter(Boolean).every(function (x) { return found.indexOf(L.normalize(x)) !== -1; }); });
        if (miss.length) return toast('Non trovo nella frase: ' + miss.join(', ') + '. Scrivila esattamente come nella frase.', 6000);
      }
    }
    if (!it) return toast('Non sono riuscito a costruire l\'esercizio');
    // v127: spiegazione, accenti, immagine
    const exp = ($('#ca-explain') && $('#ca-explain').value || '').trim();
    if (exp) it.explain = exp.slice(0, 600);
    const hnt = ($('#ca-hint') && $('#ca-hint').value || '').trim();
    if (hnt) it.hint = hnt.slice(0, 400);
    if ($('#ca-strict') && $('#ca-strict').checked) it.strict = true;
    if (CA_IMG) { it.image = CA_IMG; if (CA_IMG_CREDIT) it.imageCredit = CA_IMG_CREDIT; }
    if (CA_EDIT != null && ls.chal.items[CA_EDIT]) {
      const old = ls.chal.items[CA_EDIT];
      it.id = old.id; if (old.src) it.src = old.src; if (old.tr) it.tr = old.tr;   // stessa identita': niente doppioni all'import
      ls.chal.items[CA_EDIT] = it;
      CA_EDIT = null;
      toast('Esercizio aggiornato');
    } else {
      ls.chal.items.push(it);
    }
    $('#dlg-chal-add').close();
    chalSetTouched(ls);
  });

  // ---- lancio ----
  function openChalNew(preferId) {
    const sets = chalSets().filter(chalSetReady);   // un set vuoto non si puo' giocare: non compare (v72)
    const sel = $('#ch-set'); sel.innerHTML = '';
    if (!sets.length) {
      $('#ch-empty').style.display = '';
      $('#ch-form').style.display = 'none';
    } else {
      $('#ch-empty').style.display = 'none';
      $('#ch-form').style.display = '';
      sets.forEach(function (ls) { sel.appendChild(el('option', { value: ls.id, text: (ls.title || 'Set senza titolo') + ' · ' + ls.chal.items.length + ' esercizi' })); });
      if (preferId && S.lessons[preferId]) sel.value = preferId;
    }
    $('#ch-go').disabled = !sets.length;
    chTpOpts();
    chFillClasses();
    $('#dlg-chal-new').showModal();
  }
  /** v137 (Edoardo: "voglio anche poter mettere un label tipo Polimi lun/mer"): l'etichetta del report e' una CLASSE,
   *  la stessa dei compiti (cosi' sfide e compiti di PoliMi Lun-Mer stanno insieme). Si ricorda l'ultima scelta.
   *  Senza accesso il report resta solo su questo computer, come in v135. */
  function chFillClasses(selectId) {
    const sel = $('#ch-class'), hint = $('#ch-class-hint');
    const be = classBackend();
    $('#ch-class-new').style.display = 'none';
    sel.innerHTML = '';
    if (!be) {
      $('#ch-class-row').style.display = 'none';
      hint.textContent = '🔒 Accedi (in alto a destra) per salvare i report nel cloud con la classe. Senza accesso il report resta solo su questo computer.';
      return;
    }
    $('#ch-class-row').style.display = '';
    hint.textContent = '';
    sel.appendChild(el('option', { value: '', text: 'Carico le classi…' }));
    be.listClasses().then(function (cl) {
      CLS.classes = cl || [];
      sel.innerHTML = '';
      sel.appendChild(el('option', { value: '', text: '— nessuna classe —' }));
      CLS.classes.forEach(function (c) { sel.appendChild(el('option', { value: c.id, text: c.name })); });
      sel.appendChild(el('option', { value: '__new', text: '+ Nuova classe…' }));
      let last = selectId || ''; if (!last) { try { last = localStorage.getItem('pl-chal-class') || ''; } catch (e) { /* ignora */ } }
      if (last && CLS.classes.some(function (c) { return c.id === last; })) sel.value = last;
      hint.textContent = '☁️ Il report si salva nel tuo account: lo ritrovi da qualsiasi computer.';
    }, function (e) { sel.innerHTML = ''; sel.appendChild(el('option', { value: '', text: '— nessuna classe —' })); hint.textContent = 'Classi non disponibili: ' + e.message; });
  }
  $('#ch-class').addEventListener('change', function () {
    const v = this.value;
    $('#ch-class-new').style.display = v === '__new' ? '' : 'none';
    if (v === '__new') { $('#ch-class-name').value = ''; $('#ch-class-name').focus(); return; }
    try { localStorage.setItem('pl-chal-class', v); } catch (e) { /* ignora */ }
  });
  function chAddClass() {
    const be = classBackend(); const n = ($('#ch-class-name').value || '').trim();
    if (!be) return; if (!n) { $('#ch-class-name').focus(); return toast('Scrivi il nome della classe'); }
    $('#ch-class-add').disabled = true;
    be.createClass(n).then(function (c) {
      $('#ch-class-add').disabled = false;
      try { localStorage.setItem('pl-chal-class', c.id); } catch (e) { /* ignora */ }
      toast('Classe creata: ' + c.name); chFillClasses(c.id);
    }, function (e) { $('#ch-class-add').disabled = false; toast('Non creata: ' + e.message, 6000); });
  }
  $('#ch-class-add').addEventListener('click', chAddClass);
  $('#ch-class-name').addEventListener('keydown', function (e) { if (e.key === 'Enter') { e.preventDefault(); chAddClass(); } });
  function chTpOpts() { const tp = (document.querySelector('#dlg-chal-new input[name=chplay]:checked') || {}).value !== 'sp'; $('#ch-tp-opts').style.display = tp ? '' : 'none'; const h = $('#ch-shuffle-hint'); if (h) h.textContent = tp ? '(uguale per tutti)' : '(diverso per ogni studente)'; }
  $$('#dlg-chal-new input[name=chplay]').forEach(function (r) { r.addEventListener('change', chTpOpts); });
  function chalMode() { const r = document.querySelector('#dlg-chal-new input[name=chmode]:checked'); return r ? r.value : 'streak'; }
  $('#ch-new-set').addEventListener('click', function () { $('#dlg-chal-new').close(); newChalSet(); });
  $('#ch-new-set2').addEventListener('click', function () { $('#dlg-chal-new').close(); newChalSet(); });
  $('#ch-edit-set').addEventListener('click', function () { const id = $('#ch-set').value; $('#dlg-chal-new').close(); if (S.lessons[id]) openChalSet(id); });
  $('#ch-go').addEventListener('click', function () {
    const ls = S.lessons[$('#ch-set').value];
    if (!ls || !chalSetReady(ls)) return toast('Il set è vuoto: aggiungi almeno un esercizio');
    $('#dlg-chal-new').close();
    const chCfg = {
      play: (document.querySelector('#dlg-chal-new input[name=chplay]:checked') || {}).value === 'sp' ? 'sp' : 'tp',
      mode: chalMode(),
      secs: +$('#ch-secs').value || 0,
      showQ: $('#ch-showq').checked,
      shuffle: $('#ch-shuffle').checked,
      classId: classBackend() && $('#ch-class').value && $('#ch-class').value !== '__new' ? $('#ch-class').value : null
    };
    trBefore(ls, function () { startChal(ls, chCfg); });   // v170: le traduzioni mancanti si preparano da sole
  });
  $('#ch-close').addEventListener('click', function () { $('#dlg-chal-new').close(); });
  $('#svc-qr').addEventListener('click', function () { newChalSet(); });   // v126: la card è "Esercitazione" (compiti + sfida)

  function startChal(setLs, cfg) {
    const pin = VLChal.makePin();
    const items = JSON.parse(JSON.stringify(setLs.chal.items, function (k, v) { return typeof k === 'string' && k.charAt(0) === '_' ? undefined : v; }));
    // v162 (Edoardo: "voglio poter selezionare se le frasi vengono proposte nell'ordine che sono messe o randomizzate per
    // ogni studente"): insieme sullo schermo = un ordine casuale uguale per tutti (deciso qui); al proprio ritmo = ogni
    // telefono mescola per conto suo (flag shuffle nel 'set'), e il report resta nell'ordine del set (indice originale).
    if (cfg.shuffle && cfg.play === 'tp') { const sh = VLChal.shuffleArr(items, Math.random); items.length = 0; sh.forEach(function (x) { items.push(x); }); }
    overlay(true);
    chalJoin(pin, function (conn) {
      overlay(false);
      CHAL = { pin: pin, setId: setLs.id, title: setLs.title || 'Sfida', play: cfg.play, items: items, mode: cfg.mode, secs: cfg.secs, showQ: cfg.showQ,
        conn: conn, state: cfg.play === 'tp' ? VLChal.tpNew() : VLChal.newState(), pub: null, ended: false, boardAt: 0, boardTimer: null, clock: null, log: {},
        repId: VLClass.uuid(), classId: cfg.classId || null, shuffle: !!cfg.shuffle, spStarted: false, cloud: { timer: null, ok: false, err: '', warned: false } };
      chalSaveReport();
      conn.on('hello', function (p) {
        if (!p || !p.id) return;
        if (CHAL.play === 'tp') {
          VLChal.tpJoin(CHAL.state, p);
          if (CHAL.state.phase === 'question') conn.send('q', chalQPayload());   // chi arriva a domanda aperta la riceve
        } else {
          VLChal.reduce(CHAL.state, 'hello', p);
          // v162 (Edoardo: "per ogni tipo di sfida sono io che do il via... adesso appena lo studente mette il nickname parte
          // subito la prima frase"): anche al proprio ritmo c'è la sala d'attesa. Il set parte solo dopo "▶ Via!"; chi
          // arriva a sfida già partita lo riceve subito.
          if (CHAL.spStarted) chalSendSet();
        }
        renderChalBoard(); chalBoardOut();
      });
      conn.on('score', function (p) {   // solo student-paced
        if (CHAL.play !== 'sp') return;
        VLChal.reduce(CHAL.state, 'score', p);
        if (p && p.last && CHAL.state.players[p.id]) chalLog(p.last.i, p.id, p.nick, p.last.a, p.last.ok, p.last.frac);   // v135
        renderChalBoard(); chalBoardOut();
      });
      conn.on('ans', function (p) {     // solo teacher-paced
        if (CHAL.play !== 'tp' || !p) return;
        const item = CHAL.items[CHAL.state.i];
        if (!item) return;
        // v157 (Edoardo: "voglio una funzione annulla per lo studente, se invia e cambia idea deve poter annullare e
        // riscrivere"): 'ans' con undo:true toglie la risposta finché la domanda è aperta (punti e serie tornano com'erano)
        if (p.undo) {
          if (p.i === CHAL.state.i && VLChal.tpUndo(CHAL.state, p.id)) {
            clearTimeout(CHAL.allTimer);
            if (CHAL.log[CHAL.state.i]) delete CHAL.log[CHAL.state.i][p.id];
            chalSaveReport(); chalAnswered();
          }
          return;
        }
        const r = VLChal.tpAnswer(CHAL.state, p, item, CHAL.mode, CHAL.pub);
        if (r) {
          chalLog(CHAL.state.i, p.id, p.nick, chalAnswerText(item, p.value, CHAL.pub), r.ok, r.frac);   // v135
          chalAnswered();
          // tutti hanno risposto: si chiude da sola, ma dopo 3 secondi (l'ultimo deve avere il tempo di annullare)
          if (VLChal.tpAllAnswered(CHAL.state)) {
            const qi = CHAL.state.i;
            clearTimeout(CHAL.allTimer);
            CHAL.allTimer = setTimeout(function () { if (CHAL && CHAL.state.phase === 'question' && CHAL.state.i === qi && VLChal.tpAllAnswered(CHAL.state)) chalCloseQuestion(); }, S.mock ? 1200 : 3000);
          }
        }
      });
      show('chal');
      renderChal();
    }, function (err) { overlay(false); toast(err, 6000); });
  }
  /** v135 (Edoardo: "manca funzione report che vedo solo io e si apre in una nuova tab, così vedo chi ha detto cosa"):
   *  l'host registra ogni risposta (CHAL.log[i][id] = {nick, a, ok, frac}) e salva un'istantanea in localStorage
   *  ('pl-chalrep'): la scheda #chalrep la legge e si aggiorna da sola (evento storage). Resta su QUESTO computer: gli
   *  studenti non la vedono. Nella modalità al proprio ritmo il telefono manda la sua risposta dentro 'score' (last). */
  function chalAnswerText(item, v, pub) {
    if (item.kind === 'match') return ((pub && pub.left) || item.pairs.map(function (p) { return p.a; })).map(function (l, k) { const j = Array.isArray(v) ? v[k] : -1; return l + ' → ' + (j == null || j === -1 ? '?' : ((pub && pub.right) || [])[j] || '?'); }).join(' · ');
    return VLClass.answerText({ type: item.kind, data: item.data }, v);
  }
  function chalLog(i, id, nick, a, ok, frac) {
    if (!CHAL || i == null) return;
    (CHAL.log[i] = CHAL.log[i] || {})[id] = { nick: nick, a: String(a || '').slice(0, 300), ok: !!ok, frac: frac || 0, t: Date.now() };   // t (v168): ordine di arrivo, per i puntini
    chalSaveReport();
  }
  /** light = per il canale e per il report salvato: le immagini incollate (data:, pesanti) restano fuori, i link sì. */
  function chalReviewList(items, light) {
    return items.map(function (it) {
      const e = { type: it.kind, data: it.data || {}, pairs: it.pairs, sentence: it.sentence };
      const o = { k: VLChal.itemLabel(it.kind), p: VLClass.promptOf(e), s: VLChal.solutionText(it), x: it.explain || '' };
      if (it.image && (!light || !/^data:/.test(it.image))) { o.img = it.image; if (it.imageCredit) o.c = it.imageCredit; }
      if ((it.kind === 'gap' || it.kind === 'gapbank') && it.data && it.data.tokens) o.g = EX.gapRuns(it.data).map(function (r) { return r.answer; });   // v160: le risposte spazio per spazio
      return o;
    });
  }
  function chalSaveReport() {
    if (!CHAL) return;
    const snap = { pin: CHAL.pin, title: CHAL.title, at: Date.now(), ended: CHAL.ended, items: chalReviewList(CHAL.items, true),
      players: VLChal.leaderboard(CHAL.state).map(function (r) { return { id: r.id, nick: r.nick, score: r.score, right: r.right }; }), log: CHAL.log };
    try { localStorage.setItem('pl-chalrep', JSON.stringify(snap)); } catch (e) { /* pieno: pazienza */ }
    chalCloudSave(snap);
  }
  /** v137: istantanea anche nel cloud (tabella chal_reports, solo il docente la legge). Durante la partita al massimo
   *  una scrittura ogni 5 secondi; a fine sfida subito. Niente righe per sfide senza giocatori. Se fallisce (per esempio
   *  la tabella non c'e' ancora) lo dice UNA volta e il report resta comunque su questo computer. */
  function chalCloudSave(snap) {
    const C = CHAL; if (!C) return;
    const be = classBackend(); if (!be || !be.saveChalReport) return;
    if (!snap.players.length) return;
    const go = function () {
      C.cloud.timer = null;
      be.saveChalReport({ id: C.repId, class_id: C.classId, title: C.title, pin: C.pin, play: C.play, players: snap.players.length, ended: snap.ended, report: snap })
        .then(function () { C.cloud.ok = true; C.cloud.err = ''; chalCloudMsg(); },
          function (e) {
            C.cloud.err = e.message; chalCloudMsg();
            if (!C.cloud.warned) { C.cloud.warned = true; toast('Report non salvato nel cloud (' + e.message + '): resta su questo computer', 7000); }
          });
    };
    clearTimeout(C.cloud.timer);
    if (snap.ended) go(); else C.cloud.timer = setTimeout(go, 5000);
  }
  /** v154 (Edoardo, dalla schermata del QR: "come faccio a scegliere la classe a cui appartiene questa attività? aggiungi
   *  un pulsante qui"): la classe si sceglie (o si cambia) anche a sfida aperta, dal menu 🏷 accanto a Report. Vale subito
   *  per il report salvato; resta la scelta predefinita per la prossima sfida. Senza accesso: avviso al posto del menu. */
  function chalClassPicker() {
    const box = $('#chal-class-box'); if (!box || !CHAL) return;
    box.innerHTML = '';
    const be = classBackend();
    if (!be) { box.appendChild(el('span', { class: 'hint', title: 'Accedi (in alto a destra) per salvare il report nel tuo account con la classe', text: '🔒 report solo su questo computer' })); return; }
    const sel = el('select', { id: 'chal-class', class: 'small', title: 'La classe di questa sfida: il report finisce lì, in 📋 Classi' });
    const fill = function (classes) {
      sel.innerHTML = '';
      sel.appendChild(el('option', { value: '', text: '🏷 Classe: nessuna' }));
      classes.forEach(function (c) { sel.appendChild(el('option', { value: c.id, text: '🏷 ' + c.name })); });
      sel.appendChild(el('option', { value: '__new', text: '+ Nuova classe…' }));
      sel.value = CHAL.classId && classes.some(function (c) { return c.id === CHAL.classId; }) ? CHAL.classId : '';
    };
    fill(CLS.classes || []);
    be.listClasses().then(function (cl) { CLS.classes = cl || []; fill(CLS.classes); }, function () { /* resta l'elenco che c'è */ });
    const setClass = function (id) {
      if (!CHAL) return;
      CHAL.classId = id || null;
      try { localStorage.setItem('pl-chal-class', id || ''); } catch (e) { /* ignora */ }
      const c = (CLS.classes || []).find(function (x) { return x.id === id; });
      chalSaveReport();
      toast(c ? 'Questa sfida è della classe «' + c.name + '»' : 'Sfida senza classe');
    };
    sel.addEventListener('change', function () {
      if (sel.value !== '__new') return setClass(sel.value);
      const inp = el('input', { type: 'text', class: 'folder-new', placeholder: 'Nome della classe (es. PoliMi Lun-Mer)', maxlength: '80' });
      const ok = el('button', { class: 'small primary', text: 'Crea' });
      const go = function () {
        const n = inp.value.trim(); if (!n) { inp.focus(); return; }
        ok.disabled = true;
        be.createClass(n).then(function (c) { CLS.classes = (CLS.classes || []).concat([c]); CHAL.classId = c.id; chalClassPicker(); setClass(c.id); }, function (e) { ok.disabled = false; toast('Non creata: ' + e.message, 6000); });
      };
      ok.addEventListener('click', go);
      inp.addEventListener('keydown', function (e) { if (e.key === 'Enter') go(); if (e.key === 'Escape') chalClassPicker(); });
      box.innerHTML = ''; box.appendChild(inp); box.appendChild(ok); inp.focus();
    });
    box.appendChild(sel);
  }
  function chalCloudMsg() {
    const p = $('#chal-cloud'); if (!p || !CHAL) return;
    const cls = CHAL.classId && (CLS.classes || []).find(function (c) { return c.id === CHAL.classId; });
    p.textContent = CHAL.cloud.err ? '⚠️ Report non salvato nel cloud: ' + CHAL.cloud.err
      : CHAL.cloud.ok ? '☁️ Report salvato' + (cls ? ' in «' + cls.name + '»' : '') + ': lo ritrovi in 📋 Classi e compiti.' : '';
  }
  function chalOpenReport() { window.open(location.pathname + location.search + '#chalrep', '_blank'); }   // v161: sempre una scheda nuova
  /** Scheda del report (#chalrep): studenti × domande, clic su una casella = cosa ha risposto. */
  function renderChalReport(saved) {
    show('report');
    $('#view-report').classList.add('rep-big');
    const root = $('#rep-root');
    const paint = function () {
      let R = null;
      if (saved) R = saved.report;
      else { try { R = JSON.parse(localStorage.getItem('pl-chalrep') || 'null'); } catch (e) { /* ignora */ } }
      root.innerHTML = '';
      if (!R) { root.appendChild(el('p', { class: 'muted', text: 'Nessuna sfida in corso su questo computer.' })); return; }
      if (saved) {
        const cls = saved.class_id && (CLS.classes || []).find(function (c) { return c.id === saved.class_id; });
        root.appendChild(el('div', { class: 'row', style: 'gap:8px;align-items:center;margin-bottom:6px' },
          el('button', { class: 'small', text: '◀ Classi e compiti', onclick: function () { renderClasses(); } }),
          el('span', { class: 'muted', text: (cls ? cls.name + ' · ' : '') + fmtDate(saved.created_at) })));
      }
      root.appendChild(el('h2', { style: 'margin-top:0', text: '📊 ' + R.title + ' · PIN ' + R.pin + (R.ended ? ' · chiusa' : ' · in corso') }));
      root.appendChild(el('div', { class: 'row', style: 'margin:0 0 8px' }, (function () {
        const store = function () { try { localStorage.setItem('pl-chalrev', JSON.stringify({ title: R.title, at: Date.now(), list: R.items, stats: chalStats(R.log, R.items.length, (R.players || []).length) })); } catch (e) { toast('Non riesco ad aprire la revisione'); } };
        return el('a', { class: 'btnlink small', href: location.pathname + location.search + '#chalrev', target: '_blank', text: '📖 Revisione (nuova scheda)', onpointerdown: store, onkeydown: store, oncontextmenu: store });
      })()));
      root.appendChild(el('p', { class: 'hint', text: saved ? 'Report salvato nel tuo account. Clicca una casella per vedere la risposta.' : 'Solo per te: si aggiorna da sola. Clicca una casella per vedere la risposta.' }));
      const det = el('div', { class: 'rep-detail' });
      const tb = el('table', { class: 'rep-table' });
      const hr = el('tr', {}, el('th', { class: 'rep-name', text: 'Studente' }), el('th', { text: 'Punti' }));
      R.items.forEach(function (it, i) { hr.appendChild(el('th', { class: 'rep-ex', title: it.p }, el('button', { class: 'rep-exbtn', text: String(i + 1), onclick: function () { showQ(i); } }))); });
      tb.appendChild(el('thead', {}, hr));
      const body = el('tbody');
      R.players.forEach(function (pl) {
        const tr = el('tr', {}, el('td', { class: 'rep-name', text: pl.nick }), el('td', { class: 'rep-score', text: pl.score + ' pt · ' + pl.right + '/' + R.items.length }));
        R.items.forEach(function (it, i) {
          const c = (R.log[i] || {})[pl.id];
          const st = !c ? 'none' : c.ok ? 'ok' : c.frac > 0 ? 'ok-late' : 'ko';
          tr.appendChild(el('td', { class: 'rep-cell ' + st }, el('button', { class: 'rep-cellbtn', text: { ok: '✓', 'ok-late': '½', ko: '✗', none: '·' }[st], onclick: function () { showQ(i, pl.id); } })));
        });
        body.appendChild(tr);
      });
      tb.appendChild(body);
      root.appendChild(el('div', { class: 'rep-wrap' }, tb));
      root.appendChild(det);
      function showQ(i, only) {
        const it = R.items[i]; det.innerHTML = '';
        det.appendChild(el('h3', { text: (i + 1) + '. ' + it.k }));
        det.appendChild(el('p', { class: 'meta', style: 'white-space:pre-line', text: it.p }));
        det.appendChild(el('p', { class: 'as-sol', text: '✓ ' + it.s }));
        R.players.filter(function (pl) { return !only || pl.id === only; }).forEach(function (pl) {
          const c = (R.log[i] || {})[pl.id];
          det.appendChild(el('div', { class: 'rep-ans ' + (!c ? 'none' : c.ok ? 'ok' : 'ko') }, el('b', { text: pl.nick + ': ' }), document.createTextNode(c ? (c.ok ? '✓ ' : '✗ ') + c.a : 'non ha risposto')));
        });
      }
    };
    paint();
    if (!saved) window.addEventListener('storage', function (e) { if (e.key === 'pl-chalrep' && S.view === 'report') paint(); });
  }
  /** v137: un report salvato (#chalrep=ID): serve l'accesso, si aspetta il cloud come per #rep=. */
  function openSavedChalReport(id) {
    const be = classBackend();
    if (!be) { show('report'); const root = $('#rep-root'); root.innerHTML = ''; needLogin(root, function () { openSavedChalReport(id); }); return; }
    Promise.all([be.getChalReport(id), CLS.classes ? CLS.classes : be.listClasses()]).then(function (r) {
      CLS.classes = r[1] || [];
      if (!r[0]) return toast('Report non trovato');
      renderChalReport(r[0]);
    }, function (e) { toast('Report non disponibile: ' + e.message, 6000); });
  }
  /** v135 REVISIONE a fine sfida; v153 (Edoardo: "se clicco su mostra tutte poi è irreversibile... voglio anche vedere frase
   *  per frase, scegliere se una alla volta o tutte insieme, e vedere la foto"): due viste (📋 Tutte insieme / 1️⃣ Una alla
   *  volta con ◀ ▶ e frecce della tastiera), "Mostra tutte" ↔ "Nascondi tutte", ogni soluzione si apre e si richiude,
   *  e la foto dell'esercizio accanto alla frase. Lo stato (aperte/chiuse) resta passando da una vista all'altra. */
  /** v178: per ogni domanda, quanti l'hanno azzeccata: [{ ok, n }] (n = studenti entrati; chi non ha risposto conta come no). */
  function chalStats(log, nItems, nPlayers) {
    const out = [];
    for (let i = 0; i < nItems; i++) {
      const cells = Object.keys((log && log[i]) || {}).map(function (k) { return log[i][k]; });
      out.push({ ok: cells.filter(function (c) { return c && c.ok; }).length, n: Math.max(nPlayers || 0, cells.length) });
    }
    return out;
  }
  function chalReview(list, host, stats) {
    const box = el('div', { class: 'chal-review' });
    const st = { mode: 'all', i: 0, open: list.map(function () { return false; }), pie: list.map(function () { return false; }) };
    const hasStats = Array.isArray(stats) && stats.some(function (x) { return x && x.n > 0; });
    const item = function (it, i, big) {
      // v160 (Edoardo: "quando clicco su soluzione la parola in verde appaia sul gap e non al posto della parola soluzione"):
      // negli esercizi con gli spazi la risposta si scrive DENTRO la frase, al posto della riga; il bottone resta un
      // interruttore (👁 Soluzione / 🙈 Nascondi). Gli altri tipi (scelta multipla, abbina…) mostrano la soluzione sotto.
      const parts = String(it.p || '').split(/_{3,}/);
      const inline = Array.isArray(it.g) && it.g.length && parts.length === it.g.length + 1;
      const q = el('div', { class: 'rv-q' });
      const drawQ = function () {
        q.innerHTML = '';
        if (!inline) { q.textContent = (i + 1) + '. ' + it.p; return; }
        q.appendChild(document.createTextNode((i + 1) + '. '));
        parts.forEach(function (t, k) {
          q.appendChild(document.createTextNode(t));
          if (k < it.g.length) q.appendChild(st.open[i] ? el('span', { class: 'rv-fill', text: it.g[k] }) : el('span', { class: 'rv-gap', text: '_____' }));
        });
      };
      const sol = el('button', { class: 'rv-sol' + (inline ? ' inl' : '') + (st.open[i] ? ' open' : ''), title: 'Clicca per vedere o nascondere la soluzione' });
      const drawSol = function () {
        sol.innerHTML = '';
        sol.classList.toggle('open', st.open[i]);
        if (inline) { sol.appendChild(el('span', { text: st.open[i] ? '🙈 Nascondi' : '👁 Soluzione' })); return; }
        sol.appendChild(el('span', { class: 'rv-hid', text: '👁 Soluzione' })); sol.appendChild(el('span', { class: 'rv-txt', text: it.s }));
      };
      const exp = el('div', { class: 'rv-exp', text: it.x ? '💬 ' + it.x : '' });
      const drawExp = function () { exp.style.display = it.x && st.open[i] ? '' : 'none'; };
      sol.addEventListener('click', function () { st.open[i] = !st.open[i]; drawQ(); drawSol(); drawExp(); head(); });
      drawQ(); drawSol(); drawExp();
      // v178 (Edoardo: 'un pulsante che mi permetta di mostrare agli studenti in percentuale quanti di loro nella classe
      // hanno azzeccato, magari un grafico a torta'): NON sempre visibile, si apre con il suo pulsante, domanda per domanda
      let pie = null;
      const sx = hasStats && stats[i] && stats[i].n > 0 ? stats[i] : null;
      if (sx) {
        const pct = Math.round(100 * sx.ok / sx.n);
        pie = el('div', { class: 'rv-stat' });
        const drawPie = function () {
          pie.innerHTML = '';
          pie.appendChild(el('button', { class: 'rv-statbtn' + (st.pie[i] ? ' open' : ''), text: st.pie[i] ? '📊 Nascondi' : '📊 Quanti l\'hanno azzeccata?', onclick: function () { st.pie[i] = !st.pie[i]; drawPie(); head(); } }));
          if (!st.pie[i]) return;
          const disc = el('div', { class: 'rv-pie', title: sx.ok + ' su ' + sx.n }, el('span', { text: pct + '%' }));
          disc.style.background = 'conic-gradient(#2f9e44 0 ' + pct + '%, #f1b0b0 0)';
          pie.appendChild(el('div', { class: 'rv-piebox' }, disc, el('div', { class: 'rv-pietxt' }, el('b', { text: sx.ok + ' su ' + sx.n }), el('span', { text: ' ' + (sx.ok === 1 ? 'ha risposto giusto' : 'hanno risposto giusto') }))));
        };
        drawPie();
      }
      const txt = el('div', { class: 'rv-body' }, q, sol, exp, pie);
      const row = el('div', { class: 'rv-item' + (big ? ' big' : '') });
      if (it.img) {
        const im = el('img', { class: 'rv-img', src: it.img, alt: '', title: it.c || '', referrerpolicy: 'no-referrer' });
        im.addEventListener('error', function () { im.remove(); });
        row.appendChild(im);
      }
      row.appendChild(txt);
      return row;
    };
    const headBox = el('div', { class: 'row rv-head' }), body = el('div', { class: 'rv-list' });
    const head = function () {
      headBox.innerHTML = '';
      const allOpen = st.open.length && st.open.every(Boolean);
      headBox.appendChild(el('h2', { style: 'margin:0', text: '📖 Revisione' }));
      headBox.appendChild(el('span', { style: 'flex:1' }));
      headBox.appendChild(el('button', { class: 'small' + (st.mode === 'all' ? ' primary' : ''), text: '📋 Tutte insieme', onclick: function () { st.mode = 'all'; paint(); } }));
      headBox.appendChild(el('button', { class: 'small' + (st.mode === 'one' ? ' primary' : ''), text: '1️⃣ Una alla volta', onclick: function () { st.mode = 'one'; paint(); } }));
      // v159 (Edoardo: "qui voglio un pulsante per andare a schermo intero"): la revisione occupa tutto lo schermo (Esc per uscire)
      const isFs = (document.fullscreenElement || document.webkitFullscreenElement) === box;
      if (box.requestFullscreen || box.webkitRequestFullscreen) headBox.appendChild(el('button', { class: 'small rv-fs', text: isFs ? '🗗 Esci da schermo intero' : '⛶ Schermo intero', onclick: function () {
        if (isFs) { (document.exitFullscreen || document.webkitExitFullscreen).call(document); return; }
        const r = (box.requestFullscreen || box.webkitRequestFullscreen).call(box);
        if (r && r.catch) r.catch(function () { toast('Il browser non permette lo schermo intero qui'); });
      } }));
      headBox.appendChild(el('button', { class: 'small rv-all', text: allOpen ? '🙈 Nascondi tutte' : '👁 Mostra tutte', onclick: function () { const v = !allOpen; st.open = st.open.map(function () { return v; }); paint(); } }));
      if (hasStats) { const allPie = st.pie.every(Boolean); headBox.appendChild(el('button', { class: 'small rv-allpie', text: allPie ? '📊 Nascondi le %' : '📊 Mostra le %', title: 'Per ogni domanda: quanti studenti hanno risposto giusto', onclick: function () { const v = !allPie; st.pie = st.pie.map(function () { return v; }); paint(); } })); }
    };
    const go = function (d) { st.i = Math.max(0, Math.min(list.length - 1, st.i + d)); paint(); };
    const paint = function () {
      head(); body.innerHTML = '';
      if (st.mode === 'all') { list.forEach(function (it, i) { body.appendChild(item(it, i, false)); }); return; }
      if (!list.length) return;
      body.appendChild(item(list[st.i], st.i, true));
      body.appendChild(el('div', { class: 'row rv-nav' },
        el('button', { class: 'rv-prev', text: '◀ Indietro', disabled: st.i === 0 ? 'disabled' : null, onclick: function () { go(-1); } }),
        el('span', { class: 'rv-count', text: (st.i + 1) + ' di ' + list.length }),
        el('button', { class: 'primary rv-next', text: 'Avanti ▶', disabled: st.i === list.length - 1 ? 'disabled' : null, onclick: function () { go(1); } })));
    };
    box.tabIndex = 0;
    box.addEventListener('keydown', function (e) {
      if (st.mode !== 'one') return;
      if (e.key === 'ArrowRight') { e.preventDefault(); go(1); box.focus(); }
      else if (e.key === 'ArrowLeft') { e.preventDefault(); go(-1); box.focus(); }
      else if (e.key === ' ' || e.key === 'Enter') { if (e.target === box) { e.preventDefault(); st.open[st.i] = !st.open[st.i]; paint(); box.focus(); } }
    });
    const onFs = function () { if (!document.body.contains(box)) { document.removeEventListener('fullscreenchange', onFs); document.removeEventListener('webkitfullscreenchange', onFs); return; } head(); box.focus(); };
    document.addEventListener('fullscreenchange', onFs); document.addEventListener('webkitfullscreenchange', onFs);
    box.appendChild(headBox); box.appendChild(body);
    paint();
    host.innerHTML = ''; host.appendChild(box);
    return box;
  }
  /** v152: il canale Realtime ha un tetto per messaggio. Le foto con LINK (Unsplash, Openverse) pesano niente; quelle
   *  INCOLLATE sono dentro l'esercizio (data:…) e dodici insieme possono superarlo: allora ai telefoni il set arriverebbe
   *  mai. Se il set supera ~180 KB le immagini incollate restano solo sullo schermo del prof (e lo si dice una volta). */
  function chalWireItems(items) {
    let json = JSON.stringify(items);
    if (json.length < 180000) return items;
    const slim = items.map(function (it) { if (it.image && /^data:/.test(it.image)) { const c = Object.assign({}, it); delete c.image; return c; } return it; });
    if (!CHAL._slimWarned) { CHAL._slimWarned = true; toast('Le immagini incollate sono troppo pesanti per i telefoni: lì non si vedono (quelle scelte con 🔎 sì)', 7000); }
    return slim;
  }
  function chalSendSet() { CHAL.conn.send('set', { items: chalWireItems(CHAL.items), mode: CHAL.mode, shuffle: !!CHAL.shuffle }); }
  function chalQPayload() {
    const it = CHAL.items[CHAL.state.i] || {};
    const pay = { i: CHAL.state.i, total: CHAL.items.length, pub: VLChal.wire(CHAL.pub), showQ: !!CHAL.showQ, secs: CHAL.secs || 0 };
    // v152: con "mostra la domanda anche sui telefoni" viaggia anche l'immagine (se è incollata e pesante, no: resta sullo schermo)
    if (CHAL.showQ && it.image && it.image.length < 120000) { pay.image = it.image; if (it.imageCredit) pay.credit = it.imageCredit; }
    if (CHAL.secs) pay.left = Math.max(0, CHAL.secs - Math.round((Date.now() - (CHAL.qAt || Date.now())) / 1000));   // v170: secondi rimasti (chi entra a domanda aperta vede quelli veri)
    if (CHAL.items.some(trValid)) pay.tr = (trValid(it) || {}).t || {};   // v166: traduzioni per il telefono
    return pay;
  }
  /** La classifica ai telefoni (student-paced): al massimo una ogni 700 ms. */
  function chalBoardOut() {
    if (!CHAL || CHAL.ended || CHAL.play !== 'sp') return;
    const now = Date.now();
    const sendNow = function () { if (!CHAL || CHAL.ended) return; CHAL.boardAt = Date.now(); CHAL.conn.send('board', { rows: VLChal.leaderboard(CHAL.state) }); };
    if (now - CHAL.boardAt > 700) return sendNow();
    clearTimeout(CHAL.boardTimer);
    CHAL.boardTimer = setTimeout(sendNow, 750 - (now - CHAL.boardAt));
  }
  function renderChal() {
    if (!CHAL) return;
    $('#chal-pin').textContent = CHAL.pin;
    $('#chal-url').textContent = chalUrl(CHAL.pin).replace(/^https?:\/\//, '');
    const modeLbl = (VLChal.MODES.find(function (m) { return m[0] === CHAL.mode; }) || VLChal.MODES[1])[1];
    $('#chal-title').textContent = CHAL.title + ' · ' + (CHAL.play === 'tp' ? 'insieme sullo schermo' : 'ognuno al suo ritmo') + ' · ' + modeLbl;
    const q = qrcode(0, 'M');
    q.addData(chalUrl(CHAL.pin));
    q.make();
    $('#chal-qr').innerHTML = q.createSvgTag({ cellSize: 8, margin: 2, scalable: true });
    chalClassPicker();
    $('#chal-start').style.display = CHAL.play === 'tp' || !CHAL.spStarted ? '' : 'none';
    $('#chal-start').textContent = CHAL.play === 'tp' ? '▶ Prima domanda' : '▶ Via! Fai partire la sfida';
    $('#chal-stagebox').style.display = 'none';
    $('#chal-live').style.display = '';
    $('#chal-after').style.display = 'none';
    renderChalBoard();
  }
  function chalAnswered() {
    if (!CHAL || CHAL.play !== 'tp') return;
    const n = Object.keys(CHAL.state.answers).length, tot = Object.keys(CHAL.state.players).length;
    // v155: chi manca, per nome (se uno si è scollegato si vede subito chi è, e il prof va avanti lo stesso)
    const miss = Object.keys(CHAL.state.players).filter(function (id) { return !CHAL.state.answers[id]; }).map(function (id) { return CHAL.state.players[id].nick; });
    $('#chal-answered').textContent = n + ' su ' + tot + ' hanno risposto' + (CHAL.state.phase === 'question' && miss.length && miss.length <= 8 ? ' · mancano: ' + miss.join(', ') : '');
    renderChalBoard();
  }
  /** Modalita' guidata (teacher-paced): apre la domanda i sullo schermo grande e la manda ai telefoni. */
  function chalOpenQuestion(i) {
    const item = CHAL.items[i]; if (!item) return chalFinish();
    CHAL.pub = VLChal.pubItem(item, { showQ: CHAL.showQ });
    VLChal.tpOpen(CHAL.state, i, Date.now());
    CHAL.qAt = Date.now();   // v170: per il timer sui telefoni
    CHAL.conn.send('q', chalQPayload());
    $('#chal-start').style.display = 'none';
    $('#chal-live').style.display = 'none';
    $('#chal-stagebox').style.display = '';
    $('#chal-progress').textContent = 'Domanda ' + (i + 1) + ' di ' + CHAL.items.length;
    chalAnswered();
    const box = $('#chal-qbox'); box.innerHTML = '';
    box.appendChild(chalScreenItem(item, CHAL.pub));
    const act = $('#chal-stage-actions'); act.innerHTML = '';
    // v155 (Edoardo: "se non rispondono tutti non posso andare avanti... voglio un modo per controllare sempre io, e se
    // qualcuno si disconnette si blocca tutto"): il bottone per chiudere c'era ma piccolo e grigio. Ora due bottoni grandi,
    // sempre attivi: mostra la risposta (chiude la domanda anche se manca qualcuno) e salta direttamente alla prossima.
    const lastQ = i + 1 >= CHAL.items.length;
    act.appendChild(el('button', { class: 'primary big', id: 'chal-reveal', text: '👁 Mostra la risposta', title: 'Chiude la domanda adesso, anche se non hanno risposto tutti', onclick: chalCloseQuestion }));
    act.appendChild(el('button', { class: 'big', id: 'chal-skip', text: lastQ ? '🏁 Chiudi e vai alla classifica' : '⏭ Prossima domanda', title: 'Chiude questa domanda e passa subito alla successiva, senza aspettare nessuno', onclick: function () { chalCloseQuestion(); if (lastQ) chalFinish(); else chalOpenQuestion(i + 1); } }));
    clearInterval(CHAL.clock);
    const clock = $('#chal-clock');
    if (CHAL.secs) {
      let left = CHAL.secs;
      clock.textContent = left + 's';
      clock.classList.remove('low');
      CHAL.clock = setInterval(function () {
        left--;
        clock.textContent = left + 's';
        if (left <= 5) clock.classList.add('low');
        if (left <= 0) chalCloseQuestion();
      }, 1000);
    } else clock.textContent = '';
  }
  function chalCloseQuestion() {
    if (!CHAL || CHAL.state.phase !== 'question') return;
    clearInterval(CHAL.clock);
    const item = CHAL.items[CHAL.state.i];
    const rev = VLChal.tpReveal(CHAL.state);
    CHAL.conn.send('reveal', { i: CHAL.state.i, per: rev.perPlayer, top: rev.top, sol: VLChal.solutionText(item) });
    const box = $('#chal-qbox'); box.innerHTML = '';
    box.appendChild(el('div', { class: 'chal-sol' }, el('div', { class: 'lbl', text: 'Risposta' }), el('div', { class: 'val', text: VLChal.solutionText(item) })));
    const wrap = el('div', { class: 'chal-top5' });
    rev.top.forEach(function (r) { wrap.appendChild(el('div', { class: 'chal-row' }, el('span', { class: 'rk', text: r.rank + '°' }), el('span', { class: 'nick', text: r.nick }), el('span', { class: 'pts', text: r.score + ' pt' }))); });
    box.appendChild(wrap);
    const act = $('#chal-stage-actions'); act.innerHTML = '';
    const last = CHAL.state.i + 1 >= CHAL.items.length;
    act.appendChild(el('button', { class: 'primary big', text: last ? '🏁 Classifica finale' : 'Avanti ▶', onclick: function () { if (last) chalFinish(); else chalOpenQuestion(CHAL.state.i + 1); } }));
    $('#chal-clock').textContent = '';
    renderChalBoard();
  }
  function chalFinish() {
    if (!CHAL || CHAL.ended) return;
    CHAL.ended = true;
    clearInterval(CHAL.clock); clearTimeout(CHAL.boardTimer);
    CHAL.conn.send('end', { rows: VLChal.leaderboard(CHAL.state), review: chalReviewList(CHAL.items, true) });   // v135: la revisione va anche ai telefoni
    chalSaveReport();
    $('#chal-stagebox').style.display = 'none';
    $('#chal-live').style.display = 'none';
    $('#chal-after').style.display = '';
    $('#chal-cloud').textContent = classBackend() ? '☁️ Salvo il report…' : '🔒 Senza accesso il report resta solo su questo computer.';
    renderChalBoard();
  }
  /** Il rendering GRANDE della domanda per lo schermo proiettato. */
  function chalScreenItem(item, pub) {
    const box = el('div', { class: 'chal-screen' });
    if (item.image) box.appendChild(el('img', { class: 'chal-img', src: item.image, alt: '' }));   // v127
    if (item.image && item.imageCredit) noteCredit(item.imageCredit);   // v139, v177: il nome dell'autore non sta più sotto la foto
    box.appendChild(el('div', { class: 'instr', text: ({
      // v170 (Edoardo, schermo della sfida: 'che vuol dire "ascolta"? e non ha senso dire "la parola mancante" qui'): le
      // consegne di EX.INSTRUCTIONS sono quelle delle video-lezioni (si ascolta il video). Nella sfida non c'è audio e la
      // domanda è già scritta grande sotto: qui solo cosa fare con il telefono, bilingue.
      gap: 'Scrivi la risposta sul telefono · Write the answer on your phone',
      gapbank: 'Scegli la parola giusta sul telefono · Choose the right word on your phone',
      mc: 'Scegli la risposta sul telefono · Choose the answer on your phone',
      scramble: 'Metti le parole in ordine · Put the words in order',
      extra: 'C\'è una parola in più: toccala · There is one extra word: tap it',
      missing: 'Manca una parola: tocca dove va e scrivila · A word is missing: tap where it goes and write it',
      wrong: 'C\'è una parola sbagliata: toccala e correggila · One word is wrong: tap it and fix it',
      match: 'Abbina le coppie sul telefono · Match the pairs on your phone'
    })[item.kind] || 'Rispondi dal telefono · Answer on your phone' }));
    if (item.kind === 'mc') {
      box.appendChild(el('div', { class: 'chal-q', text: item.data.question }));
      const grid = el('div', { class: 'chal-mcgrid' });
      (item.data.options || []).filter(Boolean).forEach(function (op, i) {
        grid.appendChild(el('div', { class: 'chal-mcopt o' + i }, el('span', { class: 'lt', text: 'ABCD'[i] }), el('span', { text: op })));
      });
      box.appendChild(grid);
    } else if (item.kind === 'gap' || item.kind === 'gapbank') {
      box.appendChild(el('div', { class: 'chal-q', text: VLChal.gapText(item) }));
      if (item.kind === 'gapbank') {
        const bank = el('div', { class: 'chips chal-bank' });
        (item.data.wordBank || []).forEach(function (w) { bank.appendChild(el('span', { class: 'chip', text: w })); });
        box.appendChild(bank);
      }
    } else if (item.kind === 'extra' || item.kind === 'wrong') {
      box.appendChild(el('div', { class: 'chal-q', text: (item.data.shown || []).join(' ') }));
    } else if (item.kind === 'missing') {
      box.appendChild(el('div', { class: 'chal-q', text: (item.data.tokens || []).join(' ') }));
    } else if (item.kind === 'scramble') {
      // sullo schermo le tessere nell'ordine mescolato PUBBLICO (mai la soluzione)
      const tiles = el('div', { class: 'chal-tiles' });
      ((pub && pub.tiles) || []).forEach(function (w) { tiles.appendChild(el('span', { class: 'chal-tile', text: w })); });
      box.appendChild(tiles);
    } else if (item.kind === 'match') {
      const cols = el('div', { class: 'chal-matchcols' });
      const left = el('div');
      item.pairs.forEach(function (p, i) { left.appendChild(el('div', { class: 'chal-mrow', text: (i + 1) + '. ' + p.a })); });
      const right = el('div');
      (pub.right || []).forEach(function (b, i) { right.appendChild(el('div', { class: 'chal-mrow', text: 'ABCDEFGH'[i] + '. ' + b })); });
      cols.appendChild(left); cols.appendChild(right);
      box.appendChild(cols);
    }
    return box;
  }
  /** v142 (Edoardo: "la barra di avanzamento è solo blu ma vorrei anche l'arancione o rosso per quelle sbagliate"):
   *  un pezzo per domanda, colorato con CHAL.log (riempito in tutte e due le modalità dalla v135): blu = giusta,
   *  arancione = mezza giusta (frac > 0, es. abbina con qualche coppia), rosso = sbagliata, grigio = non ancora. */
  function chalBar(r, tot, pct) {
    if (!tot || tot > 60) return el('span', { class: 'bar' }, el('i', { style: 'width:' + pct + '%' }));
    const bar = el('span', { class: 'bar segs', title: r.right + ' giuste su ' + tot });
    // v168 (Edoardo: "voglio che i puntini siano comunque in ordine, anche se le risposte sono random"): con l'ordine
    // casuale i puntini si riempiono da sinistra nell'ordine in cui lo studente ha risposto, non nella posizione del set
    let cells = [];
    for (let k = 0; k < tot; k++) cells.push(CHAL.log[k] && CHAL.log[k][r.id] || null);
    if (CHAL.shuffle) {
      const done = cells.filter(Boolean).sort(function (a, b) { return (a.t || 0) - (b.t || 0); });
      cells = done.concat(cells.filter(function (c) { return !c; }));
    }
    cells.forEach(function (c) {
      const st = !c ? 'none' : c.ok ? 'ok' : c.frac > 0 ? 'half' : 'ko';
      bar.appendChild(el('i', { class: 'seg ' + st }));
    });
    return bar;
  }
  function renderChalBoard() {
    if (!CHAL) return;
    const rows = VLChal.leaderboard(CHAL.state);
    $('#chal-count').textContent = rows.length ? rows.length + (rows.length === 1 ? ' studente collegato' : ' studenti collegati') : 'Nessuno ancora: fai scannerizzare il QR';
    const box = $('#chal-board'); box.innerHTML = '';
    if (CHAL.ended) {
      const medals = ['🥇', '🥈', '🥉'];
      rows.forEach(function (r) {
        box.appendChild(el('div', { class: 'chal-row final' + (r.rank <= 3 ? ' top' : '') },
          el('span', { class: 'rk', text: r.rank <= 3 ? medals[r.rank - 1] : r.rank + '°' }),
          el('span', { class: 'nick', text: r.nick }),
          el('span', { class: 'pts', text: r.score + ' pt' }),
          el('span', { class: 'sub', text: r.right + '/' + (CHAL.items.length || r.total || '?') + ' giuste' })));
      });
      if (!rows.length) box.appendChild(el('div', { class: 'hint', text: 'Nessuno ha partecipato.' }));
      const crH = creditsNote(CHAL.items.map(function (it) { return it.image && it.imageCredit; }).filter(Boolean)); if (crH) box.appendChild(crH);
      return;
    }
    rows.forEach(function (r) {
      const tot = CHAL.play === 'tp' ? CHAL.items.length : r.total;
      const pct = tot ? Math.round(r.at / tot * 100) : 0;
      // v83 ('se uno studente scrive un nickname stupido voglio poter cliccare su una x e poi su conferma'):
      // ✕ a due passi (niente confirm(): bloccherebbe il bridge, stessa regola del Termina v68)
      const kb = el('button', { class: 'chal-kick', type: 'button', title: 'Togli "' + r.nick + '" dalla sfida', text: '✕' });
      kb.addEventListener('click', function (e) {
        e.stopPropagation();
        if (kb.dataset.arm) {
          VLChal.kick(CHAL.state, r.id);
          if (CHAL.conn) { try { CHAL.conn.send('kick', { id: r.id }); } catch (err) { /* ignora */ } }
          renderChalBoard(); chalBoardOut();
          toast('"' + r.nick + '" tolto dalla sfida');
        } else {
          kb.dataset.arm = '1'; kb.textContent = 'conferma?'; kb.classList.add('arm');
          setTimeout(function () { delete kb.dataset.arm; kb.textContent = '✕'; kb.classList.remove('arm'); }, 2500);
        }
      });
      box.appendChild(el('div', { class: 'chal-row' + (r.done ? ' done' : '') },
        el('span', { class: 'rk', text: r.rank + '°' }),
        el('span', { class: 'nick', text: r.nick }),
        chalBar(r, tot, pct),
        el('span', { class: 'pts', text: r.score + ' pt' + (r.done ? ' ✓' : '') }),
        kb));
    });
  }
  /** v171 (Edoardo: 'voglio che sullo schermo appaia un 3 2 1 via! grande, con trasparenza'): conto alla rovescia a tutto
   *  schermo sopra la pagina (fondo trasparente, si vede quello che c'è sotto), poi parte davvero. Anche sui telefoni. */
  function bigCountdown(then) {
    const old = document.querySelector('.big-count'); if (old) old.remove();
    const ov = el('div', { class: 'big-count' }), n = el('div', { class: 'big-count-n' });
    ov.appendChild(n); document.body.appendChild(ov);
    const steps = ['3', '2', '1', 'Via!'];
    let k = 0;
    const tick = function () {
      if (k >= steps.length) { ov.remove(); return; }
      n.textContent = steps[k]; n.className = 'big-count-n' + (k === 3 ? ' go' : '');
      void n.offsetWidth; n.classList.add('pop');
      if (k === 3 && then) then();
      k++; setTimeout(tick, k > 3 ? 900 : 1000);
    };
    tick();
  }
  $('#chal-start').addEventListener('click', function () {
    if (!CHAL || CHAL.counting) return;
    if (CHAL.play === 'tp' && CHAL.state.phase !== 'lobby') return;
    if (CHAL.play !== 'tp' && CHAL.spStarted) return;
    CHAL.counting = true;
    try { CHAL.conn.send('count', {}); } catch (e) {}
    bigCountdown(function () { if (CHAL) { CHAL.counting = false; chalGo(); } });
  });
  function chalGo() {
    if (!CHAL || CHAL.ended) return;
    if (CHAL.play === 'tp') { if (CHAL.state.phase === 'lobby') chalOpenQuestion(0); return; }
    if (CHAL.spStarted) return;
    CHAL.spStarted = true;
    chalSendSet();
    setTimeout(function () { if (CHAL && !CHAL.ended) chalSendSet(); }, 1500);   // secondo invio: un telefono che ha perso il primo parte lo stesso (chi è già partito lo ignora)
    $('#chal-start').style.display = 'none';
    toast('Via! Ognuno risponde al suo ritmo');
  }
  $('#chal-end').addEventListener('click', function () {
    if (this.dataset.arm) { delete this.dataset.arm; this.textContent = '🏁 Termina la sfida'; chalFinish(); }
    else { this.dataset.arm = '1'; this.textContent = 'Sicuro? Clicca ancora per chiudere'; const b = this; setTimeout(function () { delete b.dataset.arm; b.textContent = '🏁 Termina la sfida'; }, 2500); }
  });
  function closeChal() {
    if (CHAL) { try { CHAL.conn.close(); } catch (e) { /* ignora */ } clearTimeout(CHAL.boardTimer); clearInterval(CHAL.clock); }
    CHAL = null;
    renderHome();
  }
  $('#chal-exit').addEventListener('click', closeChal);
  // v178 (Edoardo: "voglio poter cliccare anche con la rotella del mouse in modo che la scheda si apra ma non venga messa in
  // primo piano"): una scheda in secondo piano la apre solo il browser, da un LINK vero; window.open la porta sempre
  // davanti. Quindi Report e Revisione sono <a target="_blank"> con href: sinistro = nuova scheda davanti, rotella o
  // Ctrl+clic = nuova scheda dietro, destro = menu del browser. I dati che la scheda legge si salvano a pointerdown.
  const tabBase = function () { return location.pathname + location.search; };
  ['#chal-report', '#chal-report2'].forEach(function (q) { $(q).href = tabBase() + '#chalrep'; });
  $('#chal-review').href = tabBase() + '#chalrev';
  const chalReviewStore = function () {
    if (!CHAL) return;
    // la lista passa da localStorage (stesso browser); se le immagini incollate non ci stanno si salva la versione leggera
    const pack = function (light) { return JSON.stringify({ title: CHAL.title, at: Date.now(), list: chalReviewList(CHAL.items, light), stats: chalStats(CHAL.log, CHAL.items.length, VLChal.leaderboard(CHAL.state).length) }); };
    try { localStorage.setItem('pl-chalrev', pack(false)); } catch (e) { try { localStorage.setItem('pl-chalrev', pack(true)); } catch (e2) { toast('Non riesco a preparare la revisione: troppe immagini incollate'); } }
  };
  ['pointerdown', 'keydown', 'contextmenu'].forEach(function (ev) { $('#chal-review').addEventListener(ev, chalReviewStore); });
  /** Scheda della revisione (#chalrev): tutta la pagina, pronta da proiettare. */
  function renderChalRevTab() {
    show('report');
    $('#view-report').classList.add('rep-big');
    const root = $('#rep-root'); root.innerHTML = '';
    let R = null; try { R = JSON.parse(localStorage.getItem('pl-chalrev') || 'null'); } catch (e) { /* ignora */ }
    if (!R || !R.list || !R.list.length) { root.appendChild(el('p', { class: 'muted', text: 'Nessuna revisione da mostrare: aprila dalla sfida con 📖 Revisione.' })); return; }
    document.title = '📖 ' + (R.title || 'Revisione');
    root.appendChild(el('p', { class: 'hint', style: 'margin:0 0 8px', text: R.title || '' }));
    const host = el('div'); root.appendChild(host);
    chalReview(R.list, host, R.stats).focus();
  }
  $('#chal-assign').addEventListener('click', function () {   // v135: gli stessi esercizi come compito con link
    const ls = CHAL && S.lessons[CHAL.setId];
    if (!ls) return toast('Esercitazione non trovata tra le tue lezioni');
    openAssignDialog(ls);
  });

  // ---- lato studente (telefono, rotta #c=PIN) ----
  function openChalPlay(pin) {
    show('chalplay');
    const wrap = $('#chp-wrap'); wrap.innerHTML = '';
    let nick = '';
    try { nick = sessionStorage.getItem('vle.chalnick') || ''; } catch (e) { /* ignora */ }
    const inp = el('input', { type: 'text', id: 'chp-nick', maxlength: '20', placeholder: 'Il tuo nome · Your name', value: nick, autocomplete: 'off' });
    const go = el('button', { class: 'primary big', text: 'Entra · Join ▶' });
    const msg = el('div', { class: 'hint', style: 'margin-top:10px' });
    wrap.appendChild(el('div', { class: 'chp-join' },
      el('div', { class: 'chp-logo', text: 'PauseLearn' }),
      el('h2', { text: 'Sfida in classe · Class challenge' }),
      el('div', { class: 'hint', text: 'PIN ' + pin }),
      inp, go, msg));
    inp.addEventListener('keydown', function (e) { if (e.key === 'Enter') go.click(); });
    inp.focus();
    go.addEventListener('click', function () {
      const nk = inp.value.trim().slice(0, 20);
      if (!nk) { msg.textContent = 'Scrivi prima il tuo nome · Write your name first'; inp.focus(); return; }
      try { sessionStorage.setItem('vle.chalnick', nk); } catch (e) { /* ignora */ }
      go.disabled = true;
      busyMsg(msg, 'Mi collego… · Connecting…');
      let id = '';
      try { id = sessionStorage.getItem('vle.chalid.' + pin) || ''; } catch (e) { /* ignora */ }
      if (!id) { id = 'p' + Math.random().toString(36).slice(2, 10); try { sessionStorage.setItem('vle.chalid.' + pin, id); } catch (e) { /* ignora */ } }
      chalJoin(pin, function (conn) {
        const me = { conn: conn, id: id, nick: nk, started: false };
        conn.on('count', function () { bigCountdown(); });   // v171: 3 2 1 Via! anche sul telefono
        conn.on('set', function (p) {   // ognuno al suo ritmo: il set arriva intero
          if (me.started || !p || !Array.isArray(p.items)) return;
          me.started = true;
          chpPlaySelf(me, p.items, p.mode, !!p.shuffle);
        });
        conn.on('q', function (p) {     // insieme sullo schermo: arriva la domanda corrente
          if (!p || p.pub == null) return;
          me.started = true;
          chpQuestion(me, p);
        });
        conn.on('reveal', function (p) { if (me.onReveal) me.onReveal(p); });
        // v83: il docente ti ha tolto dalla sfida — schermata chiara e stop (il suo id resta bandito lato host)
        conn.on('kick', function (p) {
          if (!p || p.id !== id) return;
          me.started = true;   // niente più hello automatici
          const w = $('#chp-wrap');
          w.innerHTML = '';
          w.appendChild(el('div', { class: 'card chp-card' },
            el('h2', { text: 'Il docente ti ha tolto dalla sfida · The teacher removed you from the challenge' }),
            el('p', { class: 'hint', text: 'Chiedi al docente se puoi rientrare · Ask the teacher if you can join again' })));
          try { conn.close(); } catch (e) { /* ignora */ }
        });
        conn.on('end', function (p) {
          chpFinal($('#chp-wrap'), p && p.rows, id);
          if (p && p.review && p.review.length) { const h = el('div', { style: 'margin-top:14px' }); $('#chp-wrap').appendChild(h); chalReview(p.review, h); }   // v135
          try { conn.close(); } catch (e) { /* ignora */ }
        });
        let tries = 0;
        const hello = function () {
          if (me.started) return;
          conn.send('hello', { id: id, nick: nk });
          if (++tries === 2) busyMsg(msg, '✓ Sei dentro! Aspetta che il prof dia il via… · You\'re in! Wait for the teacher to start…');
          if (tries < 150) setTimeout(hello, 2500);
        };
        hello();
      }, function (err) { go.disabled = false; msg.textContent = err; });
    });
  }
  /** Il pannello di risposta sul telefono, per tipo. pub e' la versione pubblica; con opts.local (item completo,
   *  student-paced) la domanda e' sempre visibile e la correzione avviene sul telefono. */
  /** v184 (Edoardo, scelta multipla: "non mi piace questa visualizzazione, voglio che la frase in questione sia più
   *  outstanding"): la domanda sta in un riquadro suo, grande e centrata; lo spazio "_____" è una casella evidenziata.
   *  Con una freccia ("frase di partenza -> frase da completare") la partenza va sopra, più piccola, e quella da
   *  completare sotto, grande: è lì che si guarda. */
  function chpQNode(text) {
    const box = el('div', { class: 'chp-q chp-qbig' });
    const fill = function (node, t) {
      String(t).split(/(_{3,})/).forEach(function (part) {
        if (/^_{3,}$/.test(part)) node.appendChild(el('span', { class: 'chp-blank', text: '?' }));
        else if (part) node.appendChild(document.createTextNode(part));
      });
      return node;
    };
    const m = String(text).match(/^(.*?\S)\s*(?:->|→|⇒)\s*(\S.*)$/);
    if (m && /_{3,}/.test(m[2]) && !/_{3,}/.test(m[1])) {
      box.appendChild(fill(el('div', { class: 'chp-qfrom' }), m[1]));
      box.appendChild(el('div', { class: 'chp-qarrow', text: '↓' }));
      box.appendChild(fill(el('div', { class: 'chp-qto' }), m[2]));
    } else box.appendChild(fill(el('div', { class: 'chp-qto' }), text));
    return box;
  }
  function chpItemInput(pub, opts) {
    const box = el('div', { class: 'chp-item' });
    let getVal = function () { return null; };
    const kind = pub.kind;
    // v126 (compiti senza video): con opts.inline gli spazi si scrivono DENTRO la frase, come sul libro,
    // invece che in caselle "spazio 1, spazio 2" sotto la frase (quelle restano per la sfida dal vivo).
    const inlineGaps = !!(opts.inline && pub.sentence && (kind === 'gap' || kind === 'gapbank') && pub.sentence.indexOf('_____') !== -1);
    if (pub.sentence && !inlineGaps) box.appendChild(chpQNode(pub.sentence));
    if (kind === 'mc') {
      if (pub.q) box.appendChild(chpQNode(pub.q));
      let sel = -1;
      const grid = el('div', { class: 'chp-mcgrid' });
      for (let i = 0; i < (pub.n || 4); i++) {
        const b = el('button', { class: 'chp-mc o' + i + (opts.mcOff && opts.mcOff.indexOf(i) !== -1 ? ' off' : '') }, el('span', { class: 'lt', text: 'ABCD'[i] }), pub.options ? el('span', { class: 'tx', text: pub.options[i] || '' }) : null);
        b.addEventListener('click', function () { sel = i; $$('.chp-mc', grid).forEach(function (x, j) { x.classList.toggle('sel', j === i); }); });
        grid.appendChild(b);
      }
      box.appendChild(grid);
      getVal = function () { return sel === -1 ? null : sel; };
    } else if (kind === 'gap' || kind === 'gapbank') {
      const inputs = [];
      if (inlineGaps) {
        const q = el('div', { class: 'chp-q chp-inline' });
        pub.sentence.split('_____').forEach(function (part, i, arr) {
          // la punteggiatura staccata (" ?") si riattacca: "arrivi ?" → "arrivi?"
          q.appendChild(document.createTextNode(i > 0 ? part.replace(/^\s+(?=[.,;:!?…)»])/, '') : part));
          if (i < arr.length - 1) {
            const r = (pub.runs || [])[i] || { words: 1 };
            const inp = el('input', { type: 'text', class: 'chp-gap inline', autocomplete: 'off', autocapitalize: 'off', autocorrect: 'off', spellcheck: 'false', 'aria-label': 'spazio ' + (i + 1), style: 'width:' + Math.min(9 * r.words + 2, 30) + 'ch' });
            inputs.push(inp);
            q.appendChild(inp);
          }
        });
        box.appendChild(q);
      } else (pub.runs || []).forEach(function (r, i) {
        const inp = el('input', { type: 'text', class: 'chp-gap', autocomplete: 'off', autocapitalize: 'off', autocorrect: 'off', placeholder: ((pub.runs || []).length > 1 ? (i + 1) + '. ' : '') + 'scrivi qui · write here' + (r.words > 1 ? ' (' + r.words + ' parole · words)' : '') });
        inputs.push(inp);
        box.appendChild(inp);
      });
      if (kind === 'gapbank' && pub.bank) {
        const bank = el('div', { class: 'chips chp-bank' });
        pub.bank.forEach(function (w) {
          bank.appendChild(el('span', { class: 'chip', text: w, onclick: function () {
            const t = inputs.find(function (x) { return !x.value.trim() || x === document.activeElement; }) || inputs[inputs.length - 1];
            t.value = (t.value.trim() + ' ' + w).trim();
          } }));
        });
        box.appendChild(bank);
      }
      getVal = function () { return inputs.some(function (i) { return i.value.trim(); }) ? inputs.map(function (i) { return i.value.replace(/\s+/g, ' ').trim(); }) : null; };
    } else if (kind === 'extra' || kind === 'wrong') {
      let sel = -1;
      const chips = el('div', { class: 'chips chp-words' });
      (pub.shown || []).forEach(function (w, i) {
        chips.appendChild(el('span', { class: 'chip', text: w, onclick: function () { sel = i; $$('.chip', chips).forEach(function (x, j) { x.classList.toggle('sel', j === i); }); if (corr) corr.style.display = ''; } }));
      });
      box.appendChild(chips);
      let corr = null;
      if (kind === 'wrong') {
        corr = el('input', { type: 'text', class: 'chp-gap', placeholder: opts.wrongPh || 'La parola giusta · The right word', autocomplete: 'off', autocapitalize: 'off', autocorrect: 'off', style: 'display:none' });
        box.appendChild(corr);
      }
      getVal = function () {
        if (sel === -1) return null;
        return kind === 'extra' ? sel : { index: sel, correction: corr.value };
      };
    } else if (kind === 'missing') {
      let sel = -1;
      const line = el('div', { class: 'chp-missline' });
      const mkSlot = function (k) {
        const b = el('button', { class: 'chp-slot', text: '＋', title: 'Manca qui? · Missing here?' });
        b.addEventListener('click', function () { sel = k; $$('.chp-slot', line).forEach(function (x, j) { x.classList.toggle('sel', j === k); }); });
        return b;
      };
      (pub.tokens || []).forEach(function (t, k) {
        line.appendChild(mkSlot(k));
        line.appendChild(el('span', { class: 'chp-w', text: t }));
      });
      line.appendChild(mkSlot((pub.tokens || []).length));
      box.appendChild(line);
      const word = el('input', { type: 'text', class: 'chp-gap', placeholder: opts.missPh || 'La parola che manca · The missing word', autocomplete: 'off', autocapitalize: 'off', autocorrect: 'off' });
      box.appendChild(word);
      getVal = function () { return sel === -1 || !word.value.trim() ? null : { index: sel, word: word.value }; };
    } else if (kind === 'scramble') {
      const words = (pub.tiles || []).slice();
      const picked = [];                       // indici delle tessere gia' scelte, in ordine
      const ans = el('div', { class: 'chp-scrans' });
      const bank = el('div', { class: 'chp-scrbank' });
      const paint = function () {
        ans.innerHTML = '';
        if (!picked.length) ans.appendChild(el('span', { class: 'chp-scrhint', text: opts.scrHint || 'Tocca le parole nell’ordine giusto · Tap the words in the right order' }));
        picked.forEach(function (ix, k) {
          ans.appendChild(el('button', { class: 'chp-tile inans', text: words[ix], title: 'Togli', onclick: function () { picked.splice(k, 1); paint(); } }));
        });
        $$('.chp-tile', bank).forEach(function (b, i) { b.disabled = picked.indexOf(i) !== -1; });
      };
      words.forEach(function (w, i) {
        bank.appendChild(el('button', { class: 'chp-tile', text: w, onclick: function () { if (picked.indexOf(i) === -1) { picked.push(i); paint(); } } }));
      });
      box.appendChild(ans); box.appendChild(bank);
      paint();
      getVal = function () { return words.length && picked.length === words.length ? picked.map(function (ix) { return words[ix]; }) : null; };
    } else if (kind === 'match') {
      const chosen = (pub.left || []).map(function () { return -1; });
      let cur = -1;
      const cols = el('div', { class: 'chp-matchcols' });
      const lcol = el('div'), rcol = el('div');
      const paint = function () {
        $$('.chp-mleft', lcol).forEach(function (x, k) { x.classList.toggle('sel', k === cur); x.querySelector('.tag').textContent = chosen[k] === -1 ? '' : 'ABCDEFGH'[chosen[k]]; });
        $$('.chp-mright', rcol).forEach(function (x, j) { x.classList.toggle('used', chosen.indexOf(j) !== -1); });
      };
      (pub.left || []).forEach(function (a, k) {
        const b = el('button', { class: 'chp-mleft' }, el('span', { text: a }), el('span', { class: 'tag' }));
        b.addEventListener('click', function () { cur = k; paint(); });
        lcol.appendChild(b);
      });
      (pub.right || []).forEach(function (bTxt, j) {
        const b = el('button', { class: 'chp-mright', text: 'ABCDEFGH'[j] + '. ' + bTxt });
        b.addEventListener('click', function () {
          if (cur === -1) return;
          const prev = chosen.indexOf(j); if (prev !== -1) chosen[prev] = -1;   // una lettera per riga
          chosen[cur] = j;
          cur = chosen.indexOf(-1);
          paint();
        });
        rcol.appendChild(b);
      });
      cols.appendChild(lcol); cols.appendChild(rcol);
      box.appendChild(cols);
      cur = 0; paint();
      getVal = function () { return chosen.some(function (v) { return v !== -1; }) ? chosen.slice() : null; };
    }
    const send = el('button', { class: 'primary big chp-send', text: opts.sendLabel || 'Invia · Send ▶' });
    // v164 (Edoardo, iPhone: 'se scrivo "maestra " con uno spazio dopo, non mi fa cliccare su check'): con la parola ancora
    // sottolineata dal correttore, iOS usa il primo tocco per confermarla e il clic sul bottone non arriva. Due rimedi:
    // autocorrect="off" sulle caselle (il correttore inglese cambiava anche le parole italiane) e il bottone che parte
    // già al tocco (touchend), senza aspettare il clic.
    send.addEventListener('touchend', function (e) { if (send.disabled) return; e.preventDefault(); send.click(); });
    send.addEventListener('click', function () {
      const v = getVal();
      if (v == null) return toast(opts.answerFirst || 'Prima rispondi · Answer first');
      send.disabled = true;
      const locked = $$('button, input', box).filter(function (x) { return x !== send && !x.disabled; });
      locked.forEach(function (x) { x.disabled = true; });
      // v180: onSubmit può rispondere 'retry' (errore di battitura: "controlla come hai scritto") → si riscrive qui
      if (opts.onSubmit(v) === 'retry') { send.disabled = false; locked.forEach(function (x) { x.disabled = false; }); const f = box.querySelector('input[type=text]'); if (f) f.focus(); }
    });
    box.appendChild(send);
    if (opts.inline) {
      // v126: Invio nella casella = Controlla; il cursore parte nel primo spazio
      $$('input[type=text]', box).forEach(function (x) { x.addEventListener('keydown', function (e) { if (e.key === 'Enter') { e.preventDefault(); send.click(); } }); });
      setTimeout(function () { const f = box.querySelector('input[type=text]:not([style*="display:none"])'); if (f && window.innerWidth > 720) f.focus(); }, 30);
    }
    return box;
  }
  /** Insieme sullo schermo: arriva una domanda alla volta, si risponde e si aspetta la rivelazione. */
  /** v156 (Edoardo: 'voglio che ci sia scritto "Risposta corretta:" ma la parola deve essere sotto, in verde, più grande,
   *  deve risaltare'): etichetta piccola sopra, soluzione grande e verde sotto. */
  /** v168 (Edoardo, "ragazze bella" tutta barrata: '"ragazze" era giusta ma solo l'aggettivo era sbagliato'): la risposta
   *  dello studente parola per parola: quelle giuste in verde, solo quelle sbagliate rosse e barrate. */
  function chpMineWords(mine, sol) {
    const norm = function (w) { return String(w).toLowerCase().replace(/[.,;:!?"«»()]/g, ''); };
    const mw = String(mine).split(/\s+/).filter(Boolean), sw = String(sol).split(/\s+/).filter(Boolean);
    const box = el('span', { class: 'chp-mine-val' });
    const left = sw.map(norm);
    mw.forEach(function (w, k) {
      let ok;
      if (mw.length === sw.length) ok = norm(w) === norm(sw[k]);
      else { const j = left.indexOf(norm(w)); ok = j >= 0; if (ok) left.splice(j, 1); }
      if (k) box.appendChild(document.createTextNode(' '));
      box.appendChild(el('span', { class: ok ? 'w-ok' : 'w-ko', text: w }));
    });
    return box;
  }
  function chpSol(text, mine) {
    return el('div', { class: 'sol chp-sol' },
      // v163 (Edoardo: 'voglio che appaia anche la risposta sbagliata tipo "you typed: nonni" e poi la risposta corretta in verde')
      mine ? el('div', { class: 'chp-mine' }, el('span', { class: 'chp-sol-lbl', text: 'Hai scritto · You typed: ' }), chpMineWords(mine, text)) : null,
      el('div', { class: 'chp-sol-lbl', text: 'Risposta corretta · Correct answer:' }), el('div', { class: 'chp-sol-val', text: text }));
  }
  /** Quello che lo studente ha risposto, in parole (sul telefono c'è solo la versione pubblica dell'esercizio). */
  function chpMine(pub, v) {
    if (!pub || v == null) return '';
    if (pub.kind === 'gap' || pub.kind === 'gapbank') return (Array.isArray(v) ? v : [v]).map(function (x) { return String(x || '').trim() || '—'; }).join(' / ');
    if (pub.kind === 'mc') return pub.options && pub.options[v] != null ? String(pub.options[v]) : (typeof v === 'number' && v >= 0 ? 'ABCD'[v] || '' : '');
    if (pub.kind === 'wrong') return v && v.correction ? String(v.correction) : '';
    if (pub.kind === 'missing') return v && v.word ? String(v.word) : '';
    if (pub.kind === 'scramble') return Array.isArray(v) ? v.join(' ') : '';
    return '';
  }
  // v177 (Edoardo, telefono: 'perché c'è scritto "fountain pen" etc etc? rimuovi quei testi'): sotto la foto usciva
  // titolo e autore ("«Fountain pen, cheap» di realblades (CC BY-SA 2.0, flickr)"): distrae e spesso SUGGERISCE la
  // risposta (il titolo dice cos'è l'oggetto). Durante l'esercizio non si vede più niente. L'attribuzione però la
  // licenza la chiede: resta in una riga chiusa "📷 Foto · Photo credits" a fine attività (classifica, fine compito)
  // e nell'editor dell'insegnante.
  const PHOTO_CREDITS = {};
  function noteCredit(c) { if (c) PHOTO_CREDITS[String(c)] = 1; }
  function creditsNote(extra) {
    (extra || []).forEach(noteCredit);
    const list = Object.keys(PHOTO_CREDITS); if (!list.length) return null;
    return el('details', { class: 'photo-credits' }, el('summary', { text: '📷 Foto · Photo credits (' + list.length + ')' }), el('ul', {}, list.map(function (c) { return el('li', { text: c }); })));
  }
  function chpImage(src, credit) {
    const box = el('div', { class: 'chp-imgbox' });
    const im = el('img', { class: 'chp-img', src: src, alt: '', referrerpolicy: 'no-referrer' });
    im.addEventListener('error', function () { box.remove(); });
    box.appendChild(im);
    if (credit) noteCredit(credit);
    return box;
  }
  function chpQuestion(me, p, tStart) {
    const wrap = $('#chp-wrap'); wrap.innerHTML = '';
    const t0 = tStart || Date.now();
    wrap.appendChild(el('div', { class: 'chp-status', text: (p.i + 1) + ' / ' + p.total + (p.showQ || p.pub.sentence || p.pub.q ? '' : ' · guarda lo schermo · look at the screen!') }));
    // v170 (Edoardo: "lo studente non può vedere sul suo telefono il timer... devono vederlo sia sullo schermo del pc che
    // sul loro telefono"): conto alla rovescia anche qui, calcolato dai secondi rimasti mandati dal prof
    clearInterval(me.clock);
    if (p.secs) {
      if (!p._end) p._end = Date.now() + (p.left != null ? p.left : p.secs) * 1000;
      const ck = el('div', { class: 'chp-clock' });
      const tick = function () {
        if (!ck.isConnected && ck._on) return clearInterval(me.clock);
        const left = Math.max(0, Math.ceil((p._end - Date.now()) / 1000));
        ck.textContent = '⏱ ' + left + 's'; ck.classList.toggle('low', left <= 5); ck._on = true;
        if (!left) clearInterval(me.clock);
      };
      wrap.appendChild(ck); tick(); me.clock = setInterval(tick, 250);
    }
    if (p.image) wrap.appendChild(chpImage(p.image, p.credit));
    wrap.appendChild(trBar(p.tr, null, p.pub && p.pub.kind));   // v166, v169: sempre (la consegna è tradotta comunque)
    const done = el('div', { class: 'chp-status', style: 'display:none' });
    const inputBox = chpItemInput(p.pub, { onSubmit: function (v) {
      me.conn.send('ans', { id: me.id, nick: me.nick, i: p.i, value: v, ms: Date.now() - t0 });
      me.lastMine = { i: p.i, text: chpMine(p.pub, v) };
      done.innerHTML = '';
      done.appendChild(el('div', { text: 'Risposta inviata: aspetta… · Answer sent: wait…' }));
      // v157: finché il prof non mostra la risposta si può annullare e riscrivere (il tempo continua a contare dall'inizio)
      done.appendChild(el('button', { class: 'chp-undo', type: 'button', text: '↶ Annulla · Undo', onclick: function () {
        me.conn.send('ans', { id: me.id, nick: me.nick, i: p.i, undo: true });
        chpQuestion(me, p, t0);
      } }));
      done.style.display = '';
      inputBox.classList.add('sent');
    } });
    wrap.appendChild(inputBox);
    wrap.appendChild(done);
    me.onReveal = function (rev) {
      if (!rev || rev.i !== p.i) return;
      const mine = rev.per && rev.per[me.id];
      const boxr = el('div', { class: 'chp-reveal ' + (mine && mine.ok ? 'ok' : 'no') },
        el('div', { class: 'big', text: mine ? (mine.ok ? '✓ Giusto · Correct! +' + mine.pts : (mine.pts ? 'Quasi · Almost: +' + mine.pts : '✗ Sbagliata · Wrong')) : 'Tempo scaduto · Time is up' }),
        rev.sol ? chpSol(rev.sol, mine && !mine.ok && me.lastMine && me.lastMine.i === p.i ? me.lastMine.text : '') : null);
      const meRow = (rev.top || []).find(function (r) { return r.id === me.id; });
      if (meRow) boxr.appendChild(el('div', { class: 'pos', text: '🏅 ' + meRow.rank + '° · ' + meRow.score + ' pt' }));
      wrap.innerHTML = '';
      wrap.appendChild(boxr);
      wrap.appendChild(el('div', { class: 'chp-status', text: 'Aspetta la prossima domanda… · Wait for the next question…' }));
    };
  }
  /** Ognuno al suo ritmo: il set intero sul telefono, correzione locale, punteggio come nel v68. */
  function chpPlaySelf(me, items, mode, shuffle) {
    // v162: ordine casuale per questo telefono; orig[i] = posizione nel set del prof (serve al report)
    items = items.slice();
    let orig = items.map(function (x, k) { return k; });
    if (shuffle) { orig = VLChal.shuffleArr(orig, Math.random); items = orig.map(function (k) { return items[k]; }); }
    const wrap = $('#chp-wrap'); wrap.innerHTML = '';
    const stage = el('div', { class: 'chp-stage2' });
    const status = el('div', { class: 'chp-status', text: 'Rispondi al tuo ritmo · Answer at your own pace' });
    wrap.appendChild(stage); wrap.appendChild(status);
    me.conn.on('board', function (p) {
      const mr = (p && p.rows || []).find(function (r) { return r.id === me.id; });
      if (mr) status.textContent = '🏅 ' + mr.rank + '° · ' + mr.score + ' pt';
    });
    let i = 0, score = 0, right = 0, streak = 0;
    const pts = VLChal.pointsFor(mode);
    let last = null;
    const typoAsked = {};   // v180
    const skipped = {};   // v177: domande saltate (per posizione nel set): tornano in fondo, una volta sola
    const sendScore = function (done) {
      me.conn.send('score', { id: me.id, nick: me.nick, score: score, right: right, at: i, total: items.length, done: !!done, last: last });
    };
    const step = function () {
      stage.innerHTML = '';
      if (i >= items.length) {
        stage.appendChild(el('div', { class: 'chp-reveal ok' },
          el('div', { class: 'big', text: '🏁 Finito · Finished: ' + right + ' / ' + items.length }),
          el('div', { class: 'pos', text: score + ' pt · aspetta la classifica · wait for the ranking' })));
        sendScore(true);
        return;
      }
      const item = items[i];
      const pub = VLChal.pubItem(item, { showQ: true });
      const t0 = Date.now();
      stage.appendChild(el('div', { class: 'chp-status', text: (i + 1) + ' / ' + items.length }));
      if (item.kind === 'mc' && !pub.q) pub.q = item.data.question;
      // v152 (Edoardo, screenshot dal telefono: "perché lo studente non vede l'immagine?"): l'immagine dell'esercizio c'era
      // solo sullo schermo del prof e nei compiti; ora anche sul telefono, sopra la domanda
      if (item.image) { stage.appendChild(chpImage(item.image, item.imageCredit)); }
      stage.appendChild(trBar((trValid(item) || {}).t, null, item.kind));   // v166, v169
      stage.appendChild(chpItemInput(pub, { onSubmit: function (v) {
        const res = VLChal.checkItem(item, v, pub);
        // v180: una battitura sbagliata (non la desinenza) = un invito a ricontrollare, una volta sola per domanda
        if (!res.correct && !typoAsked[orig[i]] && VLChal.typoOf(item, v)) {
          typoAsked[orig[i]] = 1;
          let n = stage.querySelector('.chp-typo'); if (!n) { n = el('div', { class: 'chp-typo' }); stage.appendChild(n); }
          n.textContent = '✏️ Quasi! Controlla come hai scritto: c\'è un errore di battitura · Almost! Check your spelling: there is a typo';
          return 'retry';
        }
        last = { i: orig[i], a: chalAnswerText(item, v, pub).slice(0, 300), ok: !!res.correct, frac: res.frac };   // v135: per il report del prof
        if (res.frac === 1) { right++; score += pts(streak, Date.now() - t0); streak++; if (typeof playWinSound === 'function') playWinSound(); }
        else if (res.frac > 0) { score += Math.round(100 * res.frac); streak = 0; }
        else streak = 0;
        i++;
        sendScore(false);
        const fb = el('div', { class: 'chp-reveal ' + (res.correct ? 'ok' : 'no') },
          el('div', { class: 'big', text: res.correct ? '✓ Giusto · Correct!' : (res.frac > 0 ? 'Quasi · Almost: ' + Math.round(res.frac * 100) + '%' : '✗ Sbagliata · Wrong') }),
          res.correct ? null : chpSol(VLChal.solutionText(item), chpMine(pub, v)),
          item.explain ? el('div', { class: 'chp-explain', text: '💬 ' + item.explain }) : null);
        stage.innerHTML = '';
        stage.appendChild(fb);
        if (item.explain) { fb.appendChild(el('button', { class: 'primary chp-next', text: 'Avanti · Next ▶', onclick: step })); return; }   // con la spiegazione si va avanti a mano: serve il tempo di leggerla
        setTimeout(step, res.correct ? 900 : 2200);
      } }));
      // v177 (Edoardo: "se non sa la risposta 4 e vuole andare alla 5 può farlo e poi la 4 (e quelle skippate) gli verranno
      // riproposte alla fine ... solo nella modalità che ognuno fa per conto proprio"): la domanda va in fondo alla fila.
      // Si può saltare una volta sola per domanda (quando torna bisogna rispondere) e non l'ultima rimasta.
      if (!skipped[orig[i]] && i < items.length - 1) {
        stage.appendChild(el('button', { class: 'chp-skip', type: 'button', text: 'Salta, la faccio dopo · Skip for now ⏭', onclick: function () {
          skipped[orig[i]] = 1; streak = 0;
          items.push(items.splice(i, 1)[0]); orig.push(orig.splice(i, 1)[0]);
          step();
        } }));
      } else if (skipped[orig[i]]) stage.insertBefore(el('div', { class: 'chp-skipnote', text: '↩ L\'avevi saltata · You skipped this one' }), stage.children[1] || null);
    };
    step();
  }
  function chpFinal(wrap, rows, myId) {
    wrap.innerHTML = '';
    rows = rows || [];
    const medals = ['🥇', '🥈', '🥉'];
    const box = el('div', { class: 'chp-final' }, el('h2', { text: 'Classifica finale · Final ranking' }));
    rows.forEach(function (r) {
      box.appendChild(el('div', { class: 'chal-row final' + (r.id === myId ? ' me' : '') },
        el('span', { class: 'rk', text: r.rank <= 3 ? medals[r.rank - 1] : r.rank + '°' }),
        el('span', { class: 'nick', text: r.nick + (r.id === myId ? ' (tu · you)' : '') }),
        el('span', { class: 'pts', text: r.score + ' pt' })));
    });
    const me = rows.find(function (r) { return r.id === myId; });
    if (me) box.appendChild(el('p', { class: 'chp-me', text: me.rank === 1 ? 'Hai vinto · You won! 🏆' : me.rank + '°: bravo · well done!' }));
    wrap.appendChild(box);
    const cr = creditsNote(); if (cr) wrap.appendChild(cr);
  }

  // ---------- avvio ----------
  // ---------- CLASSI E COMPITI (v125) ----------
  // Edoardo (30/9, per i corsi PoliMi): "compiti a casa con report, che io posso vedere chi ha fatto i compiti ... voglio
  // vedere l'errore di ogni studente ... il nome e cognome lo scrive lo studente, sono io che creo le classi e assegno
  // un'esercitazione o un compito a una classe che poi posso riutilizzare per un'altra classe".
  // Dati e regole in classroom.js (VLClass); tabelle e funzioni in sql/2026-09-30-classi-compiti.sql.
  // Docente: vista #view-classes (classi → compiti) e #view-report (studenti × esercizi). Studente: #a=CODICE →
  // #view-assign (nome e cognome) → la solita vista studente; ogni esercizio chiuso viene inviato (S.assign).
  const CLS = { classes: null, assignments: null, counts: {}, qrOpen: null, report: null, repTimer: null };
  function classBackend() {
    if (S.mock) return VLClass.memoryBackend(localStorage);
    if (!CLOUD.client || !CLOUD.user) return null;
    return VLClass.supabaseBackend(CLOUD.client);
  }
  /** v132 PROFILO STUDENTE. Un client Supabase SUO (storageKey 'pl-student', sessione salvata), separato da quello del
   *  docente: sullo stesso browser non si pestano i piedi. Senza accesso è anonimo come prima; con l'accesso i risultati
   *  prendono user_id (submit_result usa auth.uid()). In ?mock=1 l'accesso è finto (codice 123456). */
  const STU = { client: null, user: null, ready: false };
  function stuClient(cb) {
    if (S.mock) {
      let u = null; try { u = JSON.parse(localStorage.getItem('vle.mockStudent') || 'null'); } catch (e) { /* ignora */ }
      STU.user = u; STU.ready = true; return cb(null);
    }
    if (STU.client) return cb(STU.client);
    loadSupaLib(function (ok) {
      if (!ok) return cb(null);
      STU.client = window.supabase.createClient(VLSync.CONFIG.url, VLSync.CONFIG.anonKey, { auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: false, storageKey: 'pl-student' } });
      STU.client.auth.getSession().then(function (r) { STU.user = r && r.data && r.data.session ? r.data.session.user : null; STU.ready = true; cb(STU.client); }, function () { STU.ready = true; cb(STU.client); });
    });
  }
  function studentBackend(cb) {
    stuClient(function (client) {
      if (S.mock) return cb(VLClass.memoryBackend(localStorage, null, STU.user && STU.user.id));
      if (!client) return cb(null);
      cb(VLClass.supabaseBackend(client));
    });
  }
  function stuName(u) { return (u && u.user_metadata && (u.user_metadata.name || u.user_metadata.full_name)) || ''; }
  function myAttempts() { try { return JSON.parse(localStorage.getItem('vle.myAttempts') || '[]'); } catch (e) { return []; } }
  function rememberAttempt(id, code) {
    try { const l = myAttempts().filter(function (x) { return x.id !== id; }); l.push({ id: id, code: code, at: Date.now() }); localStorage.setItem('vle.myAttempts', JSON.stringify(l.slice(-200))); } catch (e) { /* ignora */ }
  }
  /** Riquadro di accesso dello studente: email → codice → dentro. Al primo accesso chiede anche nome e cognome. */
  function stuLoginBox(T, onDone) {
    const box = el('div', { class: 'stu-login' });
    const nameIn = el('input', { type: 'text', placeholder: T.yourName, autocomplete: 'name', maxlength: '80' });
    let saved = ''; try { saved = localStorage.getItem('vle.studentName') || ''; } catch (e) { /* ignora */ }
    nameIn.value = saved;
    const mailIn = el('input', { type: 'email', placeholder: T.email, autocomplete: 'email', inputmode: 'email' });
    const codeIn = el('input', { type: 'text', placeholder: T.code, inputmode: 'numeric', autocomplete: 'one-time-code', style: 'display:none;letter-spacing:.2em;font-size:20px' });
    const msg = el('div', { class: 'hint' });
    const go = el('button', { class: 'primary', text: T.sendCode });
    let step = 'email';
    const done = function (user) {
      STU.user = user;
      const ids = myAttempts().map(function (x) { return x.id; });
      studentBackend(function (be) {
        const fin = function (n) { if (n) toast(T.linked.split('{n}').join(n), 5000); onDone(); };
        if (be && be.claimResults && ids.length) be.claimResults(ids).then(fin, function () { fin(0); }); else fin(0);
      });
    };
    go.addEventListener('click', function () {
      const email = mailIn.value.trim();
      if (step === 'email') {
        if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) { mailIn.focus(); return; }
        go.disabled = true;
        const after = function () { step = 'code'; go.disabled = false; go.textContent = T.enter; codeIn.style.display = ''; codeIn.focus(); msg.textContent = T.codeSent.split('{e}').join(email); };
        if (S.mock) return after();
        stuClient(function (c) {
          if (!c) { go.disabled = false; msg.textContent = 'Offline'; return; }
          c.auth.signInWithOtp({ email: email, options: { shouldCreateUser: true, data: { name: VLClass.cleanName(nameIn.value), role: 'student' } } })
            .then(function (r) { if (r.error) { go.disabled = false; msg.textContent = r.error.message; return; } after(); });
        });
        return;
      }
      const token = codeIn.value.replace(/\D/g, '');
      if (token.length < 6) { codeIn.focus(); return; }
      go.disabled = true;
      if (S.mock) {
        if (token !== '123456') { go.disabled = false; msg.textContent = T.badCode; return; }
        const u = { id: 'mock-' + email, email: email, user_metadata: { name: VLClass.cleanName(nameIn.value), role: 'student' } };
        localStorage.setItem('vle.mockStudent', JSON.stringify(u));
        return done(u);
      }
      STU.client.auth.verifyOtp({ email: email, token: token, type: 'email' }).then(function (r) {
        if (r.error || !r.data || !r.data.user) { go.disabled = false; msg.textContent = T.badCode; return; }
        let u = r.data.user;
        const nm = VLClass.cleanName(nameIn.value);
        if (nm && !stuName(u)) STU.client.auth.updateUser({ data: { name: nm } }).then(function () { /* ok */ });
        if (nm && !stuName(u)) u = Object.assign({}, u, { user_metadata: Object.assign({}, u.user_metadata, { name: nm }) });
        done(u);
      });
    });
    [mailIn, codeIn].forEach(function (i) { i.addEventListener('keydown', function (e) { if (e.key === 'Enter') go.click(); }); });
    box.appendChild(nameIn); box.appendChild(mailIn); box.appendChild(codeIn);
    box.appendChild(el('div', { class: 'row', style: 'margin-top:8px' }, go)); box.appendChild(msg);
    return box;
  }
  function stuLogout(then) {
    if (S.mock) { localStorage.removeItem('vle.mockStudent'); STU.user = null; return then(); }
    stuClient(function (c) { if (!c) return then(); c.auth.signOut().then(function () { STU.user = null; then(); }, function () { STU.user = null; then(); }); });
  }
  /** "I miei compiti" (#me): elenco dei compiti collegati al profilo, con "Rivedi" (errori e soluzioni) e "Rifai". */
  document.addEventListener('click', function (e) {
    const t = e.target.closest && e.target.closest('#acc-student, #nav-student');
    if (!t) return;
    e.preventDefault();
    const d = $('#dlg-account'); if (d && d.open) d.close();
    history.replaceState(null, '', location.pathname + location.search + '#me');
    openMine();
  });
  function openMine() {
    document.body.classList.add('standalone');
    S.standalone = true;
    show('assign');
    $('#view-assign').classList.add('as-set');
    const T = ASG_T[stuBrowserLang()] || ASG_T.en;
    const box = $('#as-box'); box.innerHTML = '';
    box.appendChild(el('p', { class: 'hint', text: '…' }));
    studentBackend(function (be) {
      box.innerHTML = '';
      box.appendChild(el('h2', { style: 'margin-top:0', text: T.me }));
      if (!be) return box.appendChild(el('div', { class: 'notice bad', text: 'Offline' }));
      if (!STU.user) {
        box.appendChild(el('p', { class: 'hint', text: T.meSub }));
        box.appendChild(stuLoginBox(T, openMine));
        return;
      }
      box.appendChild(el('div', { class: 'row', style: 'justify-content:space-between;gap:8px;flex-wrap:wrap' },
        el('span', { class: 'meta', text: T.signedAs.split('{e}').join(stuName(STU.user) || STU.user.email) }),
        el('button', { class: 'small', text: T.logout, onclick: function () { stuLogout(openMine); } })));
      const list = el('div', { class: 'me-list' }, el('p', { class: 'hint', text: '…' }));
      box.appendChild(list);
      be.myResults().then(function (rows) {
        list.innerHTML = '';
        // un compito può essere stato fatto più volte: si mostra il tentativo che vale (VLClass.pickAttempt)
        const byCode = {};
        (rows || []).forEach(function (r) { (byCode[r.code] = byCode[r.code] || []).push(r); });
        const codes = Object.keys(byCode);
        if (!codes.length) { list.appendChild(el('p', { class: 'muted', text: T.none })); return; }
        codes.map(function (c) { return VLClass.pickAttempt(byCode[c]); }).sort(function (a, b) { return String(b.updated_at).localeCompare(String(a.updated_at)); }).forEach(function (r) {
          const m = VLClass.reportMatrix(r.lesson, [r]);
          const st = m.students[0];
          const dots = el('div', { class: 'live-dots' });
          m.exercises.forEach(function (e) { dots.appendChild(el('span', { class: 'ld ' + st.cells[e.id].state })); });
          const card = el('div', { class: 'me-card' },
            el('div', { class: 'row', style: 'justify-content:space-between;gap:8px' },
              el('b', { text: r.title || '—' }), el('span', { class: 'badge', text: r.score + '/' + r.total })),
            el('div', { class: 'meta', text: (r.className ? r.className + ' · ' : '') + fmtDate(r.updated_at) + ' · ' + (r.finished ? T.done2 : T.inProgress) }),
            dots);
          const rev = el('div', { class: 'me-rev', style: 'display:none' });
          const acts = el('div', { class: 'row', style: 'gap:6px;margin-top:6px' },
            el('button', { class: 'small primary', text: T.review2, onclick: function () {
              if (rev.style.display === 'none') {
                rev.innerHTML = '';
                m.exercises.forEach(function (e) {
                  const c = st.cells[e.id];
                  if (c.state === 'ok') return;
                  const wrong = c.tries.filter(function (t) { return !t.ok; }).map(function (t) { return t.a; });
                  rev.appendChild(el('div', { class: 'me-item ' + c.state },
                    el('div', { text: e.n + '. ' + (e.prompt || e.sentence).split('\n')[0] }),
                    wrong.length ? el('div', { class: 'meta', text: T.youWrote + wrong.join(' · ') }) : null,
                    el('div', { class: 'as-sol', text: T.correct + e.solution })));
                });
                if (!rev.childNodes.length) rev.appendChild(el('div', { class: 'as-sol', text: T.ok }));
                rev.style.display = '';
              } else rev.style.display = 'none';
            } }),
            r.open && r.kind !== 'live' ? el('a', { class: 'small btn-link', href: '#a=' + r.code, text: T.redo, onclick: function (ev) { ev.preventDefault(); openAssignmentStudent(r.code); } }) : null);
          card.appendChild(acts); card.appendChild(rev);
          list.appendChild(card);
        });
      }, function (e) { list.innerHTML = ''; list.appendChild(el('div', { class: 'notice bad', text: e.message })); });
    });
  }
  function assignUrl(code) { return location.origin + location.pathname + '#a=' + code; }
  /** Eliminazione in due passi SENZA confirm() nativo (bloccherebbe l'automazione e sul telefono è brutto). */
  function twoStep(label, fn, cls) {
    const b = el('button', { class: 'small danger' + (cls ? ' ' + cls : ''), text: label });
    let armed = null;
    b.addEventListener('click', function () {
      if (armed) { clearTimeout(armed); armed = null; b.disabled = true; fn(); return; }
      b.textContent = 'Sicuro? Clicca ancora';
      armed = setTimeout(function () { armed = null; b.textContent = label; }, 4000);
    });
    return b;
  }
  function qrSvg(text) { const q = qrcode(0, 'M'); q.addData(text); q.make(); return q.createSvgTag({ cellSize: 6, margin: 2, scalable: true }); }
  function fmtDate(iso) { if (!iso) return ''; const d = new Date(iso); return d.toLocaleDateString('it-IT', { day: 'numeric', month: 'short' }) + ' ' + d.toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit' }); }
  function needLogin(root, retry) {
    root.appendChild(el('div', { class: 'notice' },
      el('p', { style: 'margin:0 0 8px', text: 'Per usare classi e compiti accedi al tuo account (pulsante in alto a destra): le classi e i risultati degli studenti stanno nel tuo cloud, non in questo browser.' }),
      el('button', { class: 'small', text: '↻ Riprova', onclick: retry })));
  }

  // --- vista docente: classi e compiti ---
  function renderClasses() {
    show('classes');
    const root = $('#cls-root'); root.innerHTML = '';
    const be = classBackend();
    if (!be) { needLogin(root, renderClasses); return; }
    const nameIn = el('input', { type: 'text', placeholder: 'Nome della classe (es. PoliMi Lun-Mer)', maxlength: '80', style: 'flex:1;min-width:220px' });
    const add = el('button', { class: 'primary', text: '+ Crea classe' });
    const doAdd = function () {
      const n = nameIn.value.trim(); if (!n) { nameIn.focus(); return toast('Scrivi il nome della classe'); }
      add.disabled = true;
      be.createClass(n).then(function () { toast('Classe creata'); renderClasses(); }, function (e) { add.disabled = false; toast('Non creata: ' + e.message, 6000); });
    };
    add.addEventListener('click', doAdd);
    nameIn.addEventListener('keydown', function (e) { if (e.key === 'Enter') doAdd(); });
    root.appendChild(el('div', { class: 'row', style: 'gap:8px;flex-wrap:wrap;margin-bottom:6px' }, nameIn, add));
    root.appendChild(el('p', { class: 'hint', text: 'Per dare un compito: nelle tue lezioni clicca "📋 Assegna" e scegli la classe. Gli studenti aprono il link, scrivono nome e cognome e fanno la lezione; qui vedi chi l\'ha fatta e cosa ha sbagliato.' }));
    const list = el('div', { class: 'cls-list' }, el('p', { class: 'hint', text: 'Carico…' }));
    root.appendChild(list);
    Promise.all([be.listClasses(), be.listAssignments(), be.listChalReports ? be.listChalReports().catch(function () { return []; }) : []]).then(function (r) {
      CLS.classes = r[0] || []; CLS.assignments = r[1] || []; CLS.chals = r[2] || [];
      const ids = CLS.assignments.map(function (a) { return a.id; });
      return ids.length ? be.countResults(ids) : [];
    }).then(function (rows) {
      CLS.counts = {};
      (rows || []).forEach(function (r) {
        const c = CLS.counts[r.assignment_id] = CLS.counts[r.assignment_id] || { students: {}, finished: {} };
        const k = VLClass.normName(r.student_name); c.students[k] = 1; if (r.finished) c.finished[k] = 1;
      });
      paintClassList(be, list);
    }).catch(function (e) { list.innerHTML = ''; list.appendChild(el('div', { class: 'notice bad', text: 'Non riesco a caricare le classi: ' + e.message })); });
  }
  function paintClassList(be, list) {
    list.innerHTML = '';
    if (!CLS.classes.length) { list.appendChild(el('p', { class: 'muted', text: 'Nessuna classe ancora: creane una qui sopra.' })); return; }
    CLS.classes.forEach(function (c) {
      const title = el('h3', { style: 'margin:0', text: c.name });
      const renameBtn = el('button', { class: 'small', text: '✎ Rinomina' });
      renameBtn.addEventListener('click', function () {
        const inp = el('input', { type: 'text', value: c.name, maxlength: '80' });
        const ok = el('button', { class: 'small primary', text: 'Salva', onclick: function () {
          const n = inp.value.trim(); if (!n) return;
          be.renameClass(c.id, n).then(function () { renderClasses(); }, function (e) { toast('Non salvato: ' + e.message, 6000); });
        } });
        title.replaceWith(el('div', { class: 'row', style: 'gap:6px' }, inp, ok)); renameBtn.remove(); inp.focus();
      });
      const as = CLS.assignments.filter(function (a) { return a.class_id === c.id; });
      const chs = (CLS.chals || []).filter(function (r) { return r.class_id === c.id; });
      const card = el('div', { class: 'card cls-card' },
        el('div', { class: 'row', style: 'gap:8px;align-items:center;flex-wrap:wrap' }, title, el('span', { class: 'muted', text: as.length + (as.length === 1 ? ' compito a casa' : ' compiti a casa') + ' · ' + chs.length + (chs.length === 1 ? ' sfida in classe' : ' sfide in classe') }),
          el('span', { style: 'flex:1' }), renameBtn,
          twoStep('Elimina classe', function () { be.deleteClass(c.id).then(function () { toast('Classe eliminata'); renderClasses(); }, function (e) { toast('Non eliminata: ' + e.message, 6000); }); })));
      // v165 (Edoardo: "non capisco la differenza tra quelli fatti in classe e quelli assegnati come compito a casa"): due sezioni con titolo ed etichetta su ogni riga
      card.appendChild(el('div', { class: 'cls-sec-h home', text: '🏠 Compiti a casa (' + as.length + ')' }));
      if (!as.length) card.appendChild(el('p', { class: 'hint', text: 'Nessun compito: dalle tue lezioni, "📋 Assegna".' }));
      as.forEach(function (a) { card.appendChild(assignmentRow(be, a)); });
      card.appendChild(el('div', { class: 'cls-sec-h chal', text: '📱 Sfide in classe (' + chs.length + ')' }));
      if (!chs.length) card.appendChild(el('p', { class: 'hint', text: 'Nessuna sfida salvata per questa classe: quando lanci una sfida scegli la classe in alto.' }));
      chalReportsBlock(be, card, chs, true);
      list.appendChild(card);
    });
    const loose = (CLS.chals || []).filter(function (r) { return !r.class_id || !CLS.classes.some(function (c) { return c.id === r.class_id; }); });
    if (loose.length) {
      const card = el('div', { class: 'card cls-card' }, el('h3', { style: 'margin:0', text: 'Sfide senza classe' }));
      chalReportsBlock(be, card, loose);
      list.appendChild(card);
    }
  }
  /** v137: le Sfide in classe salvate, sotto la loro classe. Report in una nuova scheda, classe cambiabile, elimina. */
  function chalReportsBlock(be, card, rows, noHead) {
    if (!rows.length) return;
    if (!noHead) card.appendChild(el('div', { class: 'cls-sec-h chal', text: '📱 Sfide in classe (' + rows.length + ')' }));
    rows.forEach(function (r) {
      const mv = el('select', { class: 'small', title: 'Cambia la classe di questa sfida' });
      mv.appendChild(el('option', { value: '', text: '— nessuna classe —' }));
      (CLS.classes || []).forEach(function (c) { mv.appendChild(el('option', { value: c.id, text: c.name })); });
      mv.value = r.class_id && CLS.classes.some(function (c) { return c.id === r.class_id; }) ? r.class_id : '';
      mv.addEventListener('change', function () {
        mv.disabled = true;
        be.updateChalReport(r.id, { class_id: mv.value || null }).then(function () { toast('Sfida spostata'); renderClasses(); }, function (e) { mv.disabled = false; toast(e.message, 6000); });
      });
      card.appendChild(el('div', { class: 'cls-asg cls-chal' },
        el('div', { class: 'row', style: 'gap:8px;align-items:center;flex-wrap:wrap' },
          el('span', { class: 'cls-tag chal', text: '📱 In classe' }), el('b', { text: r.title || 'Sfida' }),
          el('span', { class: 'muted', text: fmtDate(r.created_at) + ' · ' + r.players + (r.players === 1 ? ' studente' : ' studenti') + (r.ended ? '' : ' · non chiusa') }),
          el('span', { style: 'flex:1' }),
          el('a', { class: 'btnlink small primary', href: location.pathname + location.search + '#chalrep=' + r.id, target: '_blank', text: '📊 Report' }),
          mv,
          twoStep('Elimina', function () { be.deleteChalReport(r.id).then(function () { toast('Report eliminato'); renderClasses(); }, function (e) { toast(e.message, 6000); }); }))));
    });
  }
  function assignmentRow(be, a) {
    const cnt = CLS.counts[a.id] || { students: {}, finished: {} };
    const nS = Object.keys(cnt.students).length, nF = Object.keys(cnt.finished).length;
    const url = assignUrl(a.code);
    const qrBox = el('div', { class: 'cls-qr', hidden: CLS.qrOpen === a.id ? null : '' });
    if (CLS.qrOpen === a.id) qrBox.innerHTML = qrSvg(url);
    const toggle = el('button', { class: 'small', text: a.open ? '🔓 Aperto' : '🔒 Chiuso', title: a.open ? 'Gli studenti possono farlo: clicca per chiuderlo' : 'Nessuno può più inviare risultati: clicca per riaprirlo' });
    toggle.addEventListener('click', function () {
      toggle.disabled = true;
      be.updateAssignment(a.id, { open: !a.open }).then(function () { a.open = !a.open; toast(a.open ? 'Compito riaperto' : 'Compito chiuso: nessuno può più inviare risultati'); renderClasses(); }, function (e) { toggle.disabled = false; toast(e.message, 6000); });
    });
    const others = (CLS.classes || []).filter(function (c) { return c.id !== a.class_id; });
    const reuse = el('select', { class: 'small', title: 'Assegna la stessa lezione a un\'altra classe (compito nuovo, report separato)' });
    reuse.appendChild(el('option', { value: '', text: 'Assegna anche a…' }));
    others.forEach(function (c) { reuse.appendChild(el('option', { value: c.id, text: c.name })); });
    reuse.addEventListener('change', function () {
      const cid = reuse.value; if (!cid) return;
      reuse.disabled = true;
      const local = S.lessons[a.lesson_id];
      (local ? Promise.resolve(asgPayload(local)) : be.getAssignmentFull(a.id).then(function (full) { return full.lesson; }))
        .then(function (lesson) { return be.createAssignment({ class_id: cid, lesson_id: a.lesson_id, title: a.title, kind: a.kind, lesson: lesson }); })
        .then(function (na) { toast('Assegnato anche a ' + ((others.find(function (c) { return c.id === cid; }) || {}).name || 'un\'altra classe') + ' · codice ' + na.code, 5000); renderClasses(); },
          function (e) { reuse.disabled = false; toast('Non assegnato: ' + e.message, 6000); });
    });
    return el('div', { class: 'cls-asg' + (a.open ? '' : ' closed') },
      el('div', { class: 'cls-asg-main' },
        el('span', { class: 'cls-tag home', text: a.kind === 'live' ? '🔴 Dal vivo' : '🏠 A casa' }), ' ',
        el('a', { class: 'cls-asg-title', href: location.pathname + location.search + '#rep=' + a.id + '&m=table', target: '_blank', text: a.title || '(senza titolo)' }),
        el('div', { class: 'meta', text: fmtDate(a.created_at) + ' · codice ' + a.code + ' · ' + (nS ? nS + (nS === 1 ? ' studente' : ' studenti') + ', ' + nF + ' ' + (nF === 1 ? 'ha consegnato' : 'hanno consegnato') : 'nessuno ancora') })),
      el('div', { class: 'actions' },
        a.kind === 'live' ? el('button', { class: 'small primary', text: '🔴 Sessione dal vivo', onclick: function () { renderReport(a.id, 'live'); } }) : null,   // v131
        el('a', { class: 'btnlink small' + (a.kind === 'live' ? '' : ' primary'), href: location.pathname + location.search + '#rep=' + a.id + '&m=table', target: '_blank', text: '📊 Report', title: 'Si apre in una nuova scheda (con la rotella: in secondo piano)' }),   // v161 (Edoardo: "anche se clicco su report voglio che si apra sempre una nuova tab e mai sostituire quella attuale")
        el('button', { class: 'small', text: '🔗 Copia link', onclick: function () { copyText(url); } }),
        el('button', { class: 'small', text: 'QR', onclick: function () { CLS.qrOpen = CLS.qrOpen === a.id ? null : a.id; if (CLS.qrOpen) { qrBox.innerHTML = qrSvg(url); qrBox.hidden = false; } else qrBox.hidden = true; } }),
        toggle,
        others.length ? reuse : null,
        twoStep('Elimina', function () { be.deleteAssignment(a.id).then(function () { toast('Compito eliminato (con i suoi risultati)'); renderClasses(); }, function (e) { toast(e.message, 6000); }); })),
      qrBox);
  }

  /** v129 (Edoardo: "questa parte dovrebbe essere in inglese per gli studenti, o almeno farmi scegliere in che lingua"):
   *  lingua dell'interfaccia DELLO STUDENTE nei compiti (nome, istruzioni, correzione, riepilogo, invio). La sceglie il
   *  docente nel dialogo Assegna; si salva sulla lezione (ls.studentLang) e viaggia nel compito (lesson.uiLang). */
  const ASG_T = {
    it: { name: 'Il tuo nome e cognome', namePh: 'Nome e cognome', privacy: 'Il tuo nome e le tue risposte li vede solo il docente. Non serve un account.', start: 'Inizia ▶', exercises: 'esercizi', needName: 'Scrivi nome e cognome',
      check: 'Controlla', retry: '✗ Non è giusto: riprova.', almost: '✗ Quasi ({p}% giusto): riprova.', ok: '✓ Giusto!', okLate: '✓ Giusto al secondo tentativo', wrong: '✗ Sbagliato', solution: 'Soluzione: ', next: 'Avanti ▶', result: 'Vedi il risultato ▶',
      review: 'Da ripassare', youWrote: 'Hai scritto: ', correct: 'Giusto: ', again: '↻ Rifai da capo', accents: ' Attenzione agli accenti (è ≠ e).', answerFirst: 'Prima rispondi', wrongPh: 'Scrivi la parola giusta', missPh: 'La parola che manca', scrHint: 'Tocca le parole qui sotto nell’ordine giusto',
      typo: '✏️ Quasi! Controlla come hai scritto: c\'è un errore di battitura.', hint: '💡 Aiuto', typeIt: 'Non ancora. La risposta giusta è:', typeIt2: 'Scrivila qui sotto per andare avanti.', notYet: 'Non ancora. Ecco un aiuto, riprova:', hStart: 'Comincia con «{w}…» ({n} lettere)', hWrong: 'La parola sbagliata è «{w}»', hMiss: 'Manca una parola dopo «{w}»', hMiss0: 'Manca la prima parola',
      hExtraA: 'La parola in più è nella prima metà della frase', hExtraB: 'La parola in più è nella seconda metà della frase', hScr: 'La frase comincia con «{w}»', hMatch: 'Una coppia giusta: {w}', hMc: 'Ho tolto {n} risposte sbagliate', okHelp: '✓ Giusto, con l\'aiuto', koHelp: '✗ Sbagliato anche con l\'aiuto',
      me: '📚 I miei compiti', meSub: 'Entra con la tua email: ritrovi i compiti fatti e gli errori da ripassare, dal telefono o dal PC.', meOpt: '👤 Entra per ritrovare i tuoi compiti (facoltativo)', signedAs: 'Collegato come {e}', logout: 'Esci', email: 'La tua email', sendCode: 'Inviami il codice', codeSent: 'Ti ho mandato un codice a {e}: scrivilo qui (guarda anche nello spam).', code: 'Codice', enter: 'Entra', badCode: 'Codice sbagliato o scaduto', none: 'Non hai ancora compiti collegati al tuo profilo.', review2: 'Rivedi', redo: 'Rifai', done2: 'consegnato', inProgress: 'in corso', yourName: 'Nome e cognome', backList: '← I miei compiti', linked: '{n} compiti fatti su questo dispositivo collegati al tuo profilo',
      waitTitle: 'Sei dentro! ✓', waitMsg: 'Aspetta: il quiz parte quando lo dice il docente…', ended: 'La sessione è finita: il docente ha chiuso il quiz.', timeUp: '⏰ Tempo scaduto!', stopped: '⏹ Il docente ha fermato il quiz.',
      done: '✓ Consegnato: il docente vede i tuoi risultati ({n}).', closed: 'Il docente ha chiuso questo compito: i risultati non sono stati inviati.', notSent: 'Non inviato ({e}). ', resend: 'Riprova', sending: 'Invio dei risultati al docente…',
      k: { gap: 'Completa gli spazi', gapbank: 'Completa con le parole', mc: 'Scelta multipla', scramble: 'Riordina la frase', extra: 'Trova la parola in più', missing: 'Trova la parola mancante', wrong: 'Trova la parola sbagliata', match: 'Abbina le coppie' },
      i: { gap: 'Scrivi la risposta.', gapbank: 'Completa con le parole della lista.', mc: 'Scegli la risposta giusta.', scramble: 'Metti le parole nell\'ordine giusto.', extra: 'Tocca la parola in più.', missing: 'Tocca dove manca una parola e scrivila.', wrong: 'Tocca la parola sbagliata e scrivi quella giusta.', match: 'Abbina ogni parola a sinistra con una a destra.' } },
    en: { name: 'Your first and last name', namePh: 'First and last name', privacy: 'Only your teacher sees your name and your answers. You don\'t need an account.', start: 'Start ▶', exercises: 'exercises', needName: 'Write your first and last name',
      check: 'Check', retry: '✗ Not quite: try again.', almost: '✗ Almost ({p}% right): try again.', ok: '✓ Correct!', okLate: '✓ Correct on the second try', wrong: '✗ Wrong', solution: 'Answer: ', next: 'Next ▶', result: 'See your result ▶',
      review: 'To review', youWrote: 'You wrote: ', correct: 'Correct: ', again: '↻ Start again', accents: ' Mind the accents (è ≠ e).', answerFirst: 'Answer first', wrongPh: 'Write the right word', missPh: 'The missing word', scrHint: 'Tap the words below in the right order',
      typo: '✏️ Almost! Check your spelling: there is a typo.', hint: '💡 Hint', typeIt: 'Not yet. The right answer is:', typeIt2: 'Write it below to continue.', notYet: 'Not yet. Here is a hint, try again:', hStart: 'It starts with «{w}…» ({n} letters)', hWrong: 'The wrong word is «{w}»', hMiss: 'A word is missing after «{w}»', hMiss0: 'The first word is missing',
      hExtraA: 'The extra word is in the first half of the sentence', hExtraB: 'The extra word is in the second half of the sentence', hScr: 'The sentence starts with «{w}»', hMatch: 'One right pair: {w}', hMc: 'I removed {n} wrong answers', okHelp: '✓ Correct, with the hint', koHelp: '✗ Wrong, even with the hint',
      me: '📚 My assignments', meSub: 'Sign in with your email: find the assignments you did and the mistakes to review, on your phone or computer.', meOpt: '👤 Sign in to keep your assignments (optional)', signedAs: 'Signed in as {e}', logout: 'Sign out', email: 'Your email', sendCode: 'Send me the code', codeSent: 'We sent a code to {e}: type it here (check your spam folder too).', code: 'Code', enter: 'Sign in', badCode: 'Wrong or expired code', none: 'No assignments linked to your profile yet.', review2: 'Review', redo: 'Do it again', done2: 'submitted', inProgress: 'in progress', yourName: 'First and last name', backList: '← My assignments', linked: '{n} assignments done on this device linked to your profile',
      waitTitle: 'You\'re in! ✓', waitMsg: 'Wait: the quiz starts when your teacher says so…', ended: 'The session is over: your teacher closed the quiz.', timeUp: '⏰ Time\'s up!', stopped: '⏹ Your teacher stopped the quiz.',
      done: '✓ Submitted: your teacher can see your results ({n}).', closed: 'Your teacher has closed this assignment: your results were not sent.', notSent: 'Not sent ({e}). ', resend: 'Try again', sending: 'Sending your results to your teacher…',
      k: { gap: 'Fill in the gaps', gapbank: 'Fill in with the words', mc: 'Multiple choice', scramble: 'Put the sentence in order', extra: 'Find the extra word', missing: 'Find the missing word', wrong: 'Find the wrong word', match: 'Match the pairs' },
      i: { gap: 'Write the answer.', gapbank: 'Complete with the words in the list.', mc: 'Choose the right answer.', scramble: 'Put the words in the right order.', extra: 'Tap the extra word.', missing: 'Tap where a word is missing and write it.', wrong: 'Tap the wrong word and write the right one.', match: 'Match each word on the left with one on the right.' } }
  };
  // 'both' = italiano e inglese insieme (Edoardo: "la consegna la voglio poter mettere in inglese o in entrambe le lingue"):
  // pulsanti e messaggi "Controlla / Check", consegne su due righe (italiano sopra, inglese sotto).
  ASG_T.both = (function () {
    const out = {}, it = ASG_T.it, en = ASG_T.en;
    Object.keys(it).forEach(function (k) {
      if (typeof it[k] === 'object') { out[k] = {}; Object.keys(it[k]).forEach(function (j) { out[k][j] = it[k][j] + '\n' + en[k][j]; }); }
      else out[k] = it[k] === en[k] ? it[k] : it[k] + ' / ' + en[k].replace(/^[✓✗↻] ?/, '');
    });
    out.accents = ' Attenzione agli accenti (è ≠ e) / Mind the accents.';
    out.solution = 'Soluzione / Answer: '; out.correct = 'Giusto / Correct: '; out.youWrote = 'Hai scritto / You wrote: ';
    out.privacy = it.privacy + '\n' + en.privacy;
    out.both = true;
    return out;
  })();
  // v133 (Edoardo: "ricordati che gli studenti non parlano italiano"): se il docente non ha scelto, l'interfaccia
  // dello studente è in INGLESE; prima di sapere il compito (errori, #me) si segue la lingua del browser dello studente.
  /** v181 (Edoardo, compito: '"Wrong, even with the hint": questa scritta è denigratoria, cambiala! qualcosa di più
   *  positivo tipo "we learn with our mistakes" ... creane 10 di frasi friendly e ne metti una random ogni volta').
   *  Dopo un errore non si dice "sbagliato": una frase incoraggiante a caso (mai la stessa due volte di fila), poi la risposta. */
  const KIND_WORDS = {
    en: ['We learn from our mistakes 💪', 'Mistakes are part of learning 🌱', 'Good try! Here is the answer 👇', 'Every mistake is a step forward 👣', 'No problem: next time you\'ll get it 😉', 'That\'s how we learn! ✨', 'Keep going, you\'re learning 🚀', 'Nice effort! Remember this one 📌', 'Not yet, and that\'s okay 🙂', 'Now you know it! 💡'],
    it: ['Sbagliando si impara 💪', 'Gli errori fanno parte del gioco 🌱', 'Bel tentativo! Ecco la risposta 👇', 'Ogni errore è un passo avanti 👣', 'Nessun problema: la prossima volta la sai 😉', 'È così che si impara! ✨', 'Continua così, stai imparando 🚀', 'Bravo per averci provato! Ricordati questa 📌', 'Non ancora, e va bene così 🙂', 'Adesso la sai! 💡']
  };
  let KIND_LAST = -1;
  function kindWord(lang) {
    const list = KIND_WORDS[lang === 'it' ? 'it' : 'en'];
    let k = Math.floor(Math.random() * list.length);
    if (k === KIND_LAST) k = (k + 1) % list.length;
    KIND_LAST = k;
    return list[k];
  }
  function asgT(lesson) { return ASG_T[(lesson && lesson.uiLang) || 'en'] || ASG_T.en; }
  function stuBrowserLang() { let l = ''; try { l = localStorage.getItem('vle.stuLang') || ''; } catch (e) { /* ignora */ } return l || (/^it\b/i.test(navigator.language || '') ? 'it' : 'en'); }
  /** v126: cosa viaggia nel compito. Video-lezione: studentPayload. Set di esercizi (esercitazione): solo gli item. */
  function asgPayload(ls) {
    if (ls.chal && !Array.isArray(ls.exercises)) return { v: 1, id: ls.id, title: ls.title || '', lang: ls.lang || 'it', uiLang: ls.studentLang || 'en', shuffle: !!ls.studentShuffle, chal: { items: JSON.parse(JSON.stringify(ls.chal.items || [], function (k, v) { return typeof k === 'string' && k.charAt(0) === '_' ? undefined : v; })) } };
    return Object.assign(studentPayload(ls), { uiLang: ls.studentLang || 'en' });
  }
  // --- dialogo "Assegna" dalla card della lezione ---
  function openAssignDialog(ls) {
    const dlg = $('#dlg-assign'), body = $('#asg-body');
    body.innerHTML = '';
    $('#asg-title').textContent = 'Assegna: ' + (ls.title || 'lezione');
    dlg.showModal();
    const be = classBackend();
    if (!be) { needLogin(body, function () { dlg.close(); openAssignDialog(ls); }); return; }
    if (!VLClass.asgItems(ls).length) { body.appendChild(el('div', { class: 'notice bad', text: 'Qui non ci sono esercizi: non c\'è niente da correggere.' })); return; }
    body.appendChild(el('p', { class: 'hint', text: 'Carico le classi…' }));
    be.listClasses().then(function (classes) {
      body.innerHTML = '';
      const sel = el('select', { style: 'min-width:240px' });
      classes.forEach(function (c) { sel.appendChild(el('option', { value: c.id, text: c.name })); });
      sel.appendChild(el('option', { value: '__new', text: '+ Nuova classe…' }));
      const newIn = el('input', { type: 'text', placeholder: 'Nome della nuova classe (es. PoliMi Mar-Gio)', maxlength: '80', style: 'min-width:240px' });
      const newRow = el('div', { class: 'row', style: 'margin-top:6px' + (classes.length ? ';display:none' : '') }, newIn);
      if (!classes.length) sel.value = '__new';
      sel.addEventListener('change', function () { newRow.style.display = sel.value === '__new' ? '' : 'none'; if (sel.value === '__new') newIn.focus(); });
      const go = el('button', { class: 'primary', text: 'Assegna' });
      go.addEventListener('click', function () {
        const creating = sel.value === '__new';
        if (S.lessons[ls.id] && ((ls.studentLang || 'en') !== langSel.value || !!ls.studentShuffle !== shufBox.checked)) {
          S.lessons[ls.id].studentLang = langSel.value; ls.studentLang = langSel.value;
          S.lessons[ls.id].studentShuffle = shufBox.checked; ls.studentShuffle = shufBox.checked;
          S.lessons[ls.id].updatedAt = new Date().toISOString(); saveLessons();
        }
        if (creating && !newIn.value.trim()) { newIn.focus(); return toast('Scrivi il nome della classe'); }
        go.disabled = true;
        (creating ? be.createClass(newIn.value.trim()) : Promise.resolve({ id: sel.value, name: sel.options[sel.selectedIndex].textContent }))
          .then(function (cls) { return new Promise(function (res) { trBefore(ls, function () { res(cls); }); }); })   // v170
          .then(function (cls) {
            const live = VLClass.isSet(ls) && modeSel.value === 'live';
            return be.createAssignment({ class_id: cls.id, lesson_id: ls.id, title: ls.title || '', kind: live ? 'live' : 'homework', lesson: asgPayload(ls), live: live ? { state: 'lobby' } : null })
              .then(function (a) {
                if (live) { $('#dlg-assign').close(); CLS.classes = null; return renderReport(a.id, 'live'); }   // dritti alla sala d'attesa
                showAssigned(body, a, cls);
              });
          }, function (e) { throw e; })
          .catch(function (e) { go.disabled = false; toast('Non assegnato: ' + e.message, 6000); });
      });
      body.appendChild(el('label', { text: 'Classe' }));
      body.appendChild(el('div', { class: 'row' }, sel));
      body.appendChild(newRow);
      const langSel = el('select', { id: 'asg-lang' }, el('option', { value: 'it', text: '🇮🇹 Italiano' }), el('option', { value: 'en', text: '🇬🇧 English' }), el('option', { value: 'both', text: '🇮🇹+🇬🇧 Italiano e inglese' }));
      langSel.value = ls.studentLang || 'en';
      body.appendChild(el('label', { text: 'Lingua delle istruzioni per lo studente' }));
      body.appendChild(el('div', { class: 'row' }, langSel, el('span', { class: 'hint', text: 'pulsanti, consegne e correzione; gli esercizi restano in italiano' })));
      // v131: compito a casa oppure sessione DAL VIVO in classe (sala d'attesa, parte il docente, timer)
      const modeSel = el('select', { id: 'asg-mode' }, el('option', { value: 'homework', text: '📝 Compito: ognuno quando vuole' }), el('option', { value: 'live', text: '🔴 In classe, dal vivo: sala d\'attesa, parti tu' }));
      if (VLClass.isSet(ls)) { body.appendChild(el('label', { text: 'Come' })); body.appendChild(el('div', { class: 'row' }, modeSel)); }
      const shufBox = el('input', { type: 'checkbox', id: 'asg-shuffle' });
      shufBox.checked = !!ls.studentShuffle;
      if (VLClass.isSet(ls)) body.appendChild(el('label', { class: 'chip', style: 'margin-top:10px;display:inline-flex' }, shufBox, ' 🔀 Domande in ordine casuale (diverso per ogni studente)'));
      body.appendChild(el('p', { class: 'hint', text: 'Gli studenti ricevono un link: scrivono nome e cognome, fanno la lezione e i risultati arrivano a te (chi l\'ha fatta, punteggio, ogni risposta sbagliata). La lezione viene "fotografata" adesso: se poi la modifichi, questo compito resta com\'è.' }));
      body.appendChild(el('div', { class: 'row', style: 'margin-top:10px' }, go));
    }, function (e) { body.innerHTML = ''; body.appendChild(el('div', { class: 'notice bad', text: 'Non riesco a caricare le classi: ' + e.message })); });
  }
  function showAssigned(body, a, cls) {
    const url = assignUrl(a.code);
    body.innerHTML = '';
    body.appendChild(el('div', { class: 'notice ok', text: '✓ Assegnato a ' + cls.name + ' · codice ' + a.code }));
    body.appendChild(el('p', { class: 'hint', text: 'Manda questo link agli studenti (o mostra il QR):' }));
    body.appendChild(el('div', { class: 'linkbox', text: url }));
    const qr = el('div', { class: 'cls-qr' }); qr.innerHTML = qrSvg(url);
    body.appendChild(qr);
    body.appendChild(el('div', { class: 'row', style: 'gap:8px;margin-top:8px' },
      el('button', { class: 'primary', text: '🔗 Copia link', onclick: function () { copyText(url); } }),
      el('button', { text: '📋 Vai a classi e compiti', onclick: function () { $('#dlg-assign').close(); renderClasses(); } })));
  }
  $('#asg-close').addEventListener('click', function () { $('#dlg-assign').close(); });

  // --- report: studenti × esercizi ---
  function renderReport(id, mode) {
    show('report');
    clearInterval(CLS.repTimer); CLS.repTimer = null;
    const root = $('#rep-root'); root.innerHTML = '';
    const be = classBackend();
    if (!be) { needLogin(root, function () { renderReport(id); }); return; }
    root.appendChild(el('p', { class: 'hint', text: 'Carico i risultati…' }));
    const same = CLS.report && CLS.report.a && CLS.report.a.id === id;
    if (!same) CLS.repMode = 'table';
    if (mode) CLS.repMode = mode;
    const load = function (quiet) {
      const have = CLS.report && CLS.report.a && CLS.report.a.id === id ? CLS.report.a : null;   // v129: la lezione non cambia, si riscaricano solo i risultati
      return Promise.all([have ? Promise.resolve(have) : be.getAssignmentFull(id), be.listResults([id])]).then(function (r) {
        const a = r[0]; if (!a) throw new Error('compito non trovato');
        const prev = CLS.report && CLS.report.a && CLS.report.a.id === id ? CLS.report : null;
        CLS.report = { a: a, rows: r[1] || [], sel: prev ? prev.sel : null, fix: prev ? prev.fix : null };
        paintReport(be);
      }).catch(function (e) { if (!quiet) { root.innerHTML = ''; root.appendChild(el('div', { class: 'notice bad', text: 'Non riesco a caricare il report: ' + e.message })); } });
    };
    load(false);
    // aggiornamento da solo ogni 30 s finché il report è aperto (durante una lezione si vedono arrivare gli studenti)
    // v129: in modalità LIVE ogni 5 secondi (si vede chi sta rispondendo), altrimenti ogni 30
    let tick = 0;
    CLS.repTimer = setInterval(function () { if (S.view !== 'report') { clearInterval(CLS.repTimer); CLS.repTimer = null; return; } tick++; if (CLS.repMode === 'live' || CLS.repMode === 'teacher' || tick % 6 === 0) load(true); }, 3000);
    CLS.reload = load;
  }
  function paintReport(be) {
    const R = CLS.report, a = R.a, root = $('#rep-root');
    const m = VLClass.reportMatrix(a.lesson, R.rows);
    $('#view-report').classList.toggle('rep-big', CLS.repMode === 'live' || CLS.repMode === 'fix' || CLS.repMode === 'teacher');
    if (CLS.repMode === 'live') return paintLive(be, m);
    if (CLS.repMode === 'fix') return paintFix(be, m);
    if (CLS.repMode === 'teacher') return paintTeacherScreen(be, m);
    const cls = (CLS.classes || []).find(function (c) { return c.id === a.class_id; });
    root.innerHTML = '';
    const url = assignUrl(a.code);
    root.appendChild(el('div', { class: 'row', style: 'gap:8px;flex-wrap:wrap;align-items:center' },
      el('button', { class: 'small', text: '← Classi e compiti', onclick: renderClasses }),
      el('h2', { style: 'margin:0;flex:1;min-width:200px', text: a.title || '(senza titolo)' }),
      el('button', { class: 'small primary', text: '🔴 LIVE', title: 'Schermata da proiettare: chi sta facendo gli esercizi, aggiornata ogni 5 secondi', onclick: function () { CLS.repMode = 'live'; paintReport(be); } }),
      el('button', { class: 'small', text: '👥 Correzione di gruppo', title: 'Una domanda alla volta: chi ha sbagliato e cosa ha scritto, poi la soluzione', onclick: function () { CLS.repMode = 'fix'; R.fix = null; paintReport(be); } }),
      el('button', { class: 'small', text: '↻ Aggiorna', onclick: function () { CLS.reload(false); } }),
      el('button', { class: 'small', text: '⬇ CSV (Excel)', onclick: function () {
        const b = el('a', { href: URL.createObjectURL(new Blob([VLClass.toCSV(m)], { type: 'text/csv;charset=utf-8' })), download: slugify(a.title || 'compito') + '-risultati.csv' });
        document.body.appendChild(b); b.click(); setTimeout(function () { URL.revokeObjectURL(b.href); b.remove(); }, 500);
      } })));
    const fin = m.students.filter(function (s) { return s.finished; });
    const avg = fin.length ? (fin.reduce(function (t, s) { return t + s.score; }, 0) / fin.length) : null;
    root.appendChild(el('p', { class: 'meta', text: (cls ? cls.name + ' · ' : '') + 'codice ' + a.code + ' · ' + (a.open ? 'aperto' : 'chiuso') + ' · '
      + m.students.length + (m.students.length === 1 ? ' studente' : ' studenti') + ', ' + fin.length + ' ' + (fin.length === 1 ? 'ha consegnato' : 'hanno consegnato')
      + (avg != null ? ' · media ' + avg.toFixed(1).replace('.', ',') + ' su ' + m.exercises.length : '') }));
    root.appendChild(el('div', { class: 'row', style: 'gap:8px;margin-bottom:8px' },
      el('div', { class: 'linkbox', style: 'flex:1', text: url }), el('button', { class: 'small', text: '🔗 Copia link', onclick: function () { copyText(url); } })));
    if (!m.students.length) { root.appendChild(el('p', { class: 'muted', text: 'Nessuno ha ancora aperto il compito. Il report si aggiorna da solo ogni 30 secondi.' })); return; }
    const detail = el('div', { class: 'rep-detail' });
    const table = el('table', { class: 'rep-table' });
    const hr = el('tr', {}, el('th', { class: 'rep-name', text: 'Studente' }), el('th', { text: 'Punti' }));
    m.exercises.forEach(function (e) {
      hr.appendChild(el('th', { class: 'rep-ex', title: e.n + '. ' + e.label + ' · clicca per vedere le risposte di tutti' },
        el('button', { class: 'rep-exbtn', text: String(e.n), onclick: function () { R.sel = { ex: e.id }; paintDetail(m, detail); } })));
    });
    hr.appendChild(el('th', {}));
    table.appendChild(el('thead', {}, hr));
    const tb = el('tbody');
    m.students.forEach(function (s) {
      const tr = el('tr', { class: s.finished ? '' : 'rep-unfinished' },
        el('td', { class: 'rep-name' }, el('div', { text: s.name }), el('div', { class: 'meta', text: (s.finished ? 'consegnato ' : 'in corso · ') + fmtDate(s.updated_at) + (s.attempts > 1 ? ' · ' + s.attempts + ' tentativi' : '') })),
        el('td', { class: 'rep-score', text: s.score + '/' + s.total }));
      m.exercises.forEach(function (e) {
        const c = s.cells[e.id];
        const sym = { ok: '✓', 'ok-late': '✓', 'ok-help': '✓', ko: '✗', 'ko-help': '✗', none: '·' }[c.state];
        const tip = c.state === 'none' ? 'non ancora fatto' : c.state === 'ok' ? 'giusto al primo tentativo' : c.state === 'ok-late' ? 'giusto al ' + c.tries.length + '° tentativo' : c.state === 'ok-help' ? 'giusto con l\'aiuto' : c.state === 'ko-help' ? 'sbagliato anche con l\'aiuto' : (c.how === 'skipped' ? 'saltato' : 'ha guardato la soluzione');
        tr.appendChild(el('td', { class: 'rep-cell ' + c.state },
          el('button', { class: 'rep-cellbtn', title: tip, text: sym + (c.state === 'ok-late' ? c.tries.length : ''), onclick: function () { R.sel = { ex: e.id, st: s.key }; paintDetail(m, detail); } })));
      });
      tr.appendChild(el('td', {}, twoStep('✕', function () {
        const ids = R.rows.filter(function (r) { return VLClass.normName(r.student_name) === s.key; }).map(function (r) { return r.id; });
        be.deleteResults(ids).then(function () { toast('Risultati di ' + s.name + ' eliminati'); CLS.reload(false); }, function (e) { toast(e.message, 6000); });
      }, 'rep-del')));
      tb.appendChild(tr);
    });
    table.appendChild(tb);
    const fr = el('tr', {}, el('td', { class: 'rep-name meta', text: '% giusti' }), el('td', {}));
    m.perExercise.forEach(function (p) { fr.appendChild(el('td', { class: 'meta rep-pct' + (p.pct != null && p.pct < 60 ? ' low' : ''), text: p.pct == null ? '' : p.pct + '%' })); });
    fr.appendChild(el('td', {}));
    table.appendChild(el('tfoot', {}, fr));
    root.appendChild(el('div', { class: 'rep-wrap' }, table));
    root.appendChild(el('p', { class: 'hint', text: '✓ giusto al primo colpo · arancione = giusto con l\'aiuto · marrone = sbagliato anche con l\'aiuto · ✓2 giusto al 2° tentativo · ✗ soluzione guardata o saltato · · non ancora fatto. Clicca una casella per vedere le risposte, o il numero dell\'esercizio per vedere quelle di tutti. Se uno studente l\'ha fatto più volte, vale l\'ultimo tentativo consegnato.' }));
    root.appendChild(detail);
    if (R.sel) paintDetail(m, detail);
  }
  /** v129 LIVE (Edoardo: "voglio una schermata LIVE dove vedo chi sta facendo gli esercizi"): una riga per studente con
   *  un pallino per esercizio (verde/giallo/rosso/grigio), punteggio, "sta rispondendo" se ha inviato nell'ultimo minuto.
   *  Si aggiorna ogni 5 s (renderReport). Pensata per il proiettore: niente risposte degli studenti a schermo. */
  function liveSet(be, patch) {
    const a = CLS.report.a;
    const nl = Object.assign({}, a.live || {}, patch);
    return be.updateAssignment(a.id, { live: nl }).then(function () { a.live = nl; paintReport(be); }, function (e) { toast('Non riuscito: ' + e.message, 6000); });
  }
  function fmtClock(ms) { ms = Math.max(0, ms); const t = Math.ceil(ms / 1000); return Math.floor(t / 60) + ':' + String(t % 60).padStart(2, '0'); }
  function liveClockTick() {
    clearInterval(CLS.liveClock);
    CLS.liveClock = setInterval(function () {
      const n = $('#live-clock'); const a = CLS.report && CLS.report.a;
      if (!n || !a || !a.live || !a.live.ends_at || S.view !== 'report') { clearInterval(CLS.liveClock); return; }
      const left = Date.parse(a.live.ends_at) - Date.now();
      n.textContent = '⏱ ' + fmtClock(left);
      n.classList.toggle('low', left < 60000);
    }, 500);
  }
  /** v131: la sessione dal vivo (Edoardo: "mostro il QR, mentre gli studenti entrano si vedono i nomi LIVE, poi faccio
   *  partire il quiz (stesse domande in ordine o random) e si vede la barra dei singoli studenti e una barra generale
   *  (media errori e giuste) con un timer opzionale e alla fine si rivedono tutte le risposte"). a.live.state:
   *  lobby (QR + nomi) → run (barre + timer) → end (→ correzione). Senza a.live è il monitor di un compito a casa. */
  function paintLive(be, m) {
    const R = CLS.report, a = R.a, root = $('#rep-root');
    if (a.live && a.live.state === 'lobby') return paintLobby(be, m);
    root.innerHTML = '';
    if (a.live && a.live.state) {
      const run = a.live.state === 'run';
      root.appendChild(el('div', { class: 'row', style: 'gap:8px;flex-wrap:wrap;align-items:center' },
        el('h2', { style: 'margin:0;flex:1;min-width:200px', text: (run ? '🔴 ' : '🏁 ') + (a.title || '') }),
        run && a.live.ends_at ? el('div', { id: 'live-clock', class: 'live-clock', text: '⏱ ' + fmtClock(Date.parse(a.live.ends_at) - Date.now()) }) : null,
        run ? twoStep('⏹ Termina il quiz', function () { liveSet(be, { state: 'end', ended_at: new Date().toISOString() }); }, 'live-stop') : null,
        !run ? el('button', { class: 'primary', text: '👥 Correzione di gruppo', onclick: function () { CLS.repMode = 'fix'; R.fix = null; paintReport(be); } }) : null,
        el('button', { class: 'small', text: '📊 Tabella', onclick: function () { CLS.repMode = 'table'; paintReport(be); } })));
      if (run && a.live.ends_at) liveClockTick();
      // barra generale: tutte le risposte date finora, per esito
      const tot = { ok: 0, 'ok-help': 0, 'ok-late': 0, 'ko-help': 0, ko: 0 };
      let answered = 0;
      m.students.forEach(function (st) { m.exercises.forEach(function (e) { const c = st.cells[e.id].state; if (c !== 'none') { tot[c] = (tot[c] || 0) + 1; answered++; } }); });
      const all = m.students.length * m.exercises.length;
      const gb = el('div', { class: 'live-gbar' });
      [['ok', 'giuste'], ['ok-help', 'con aiuto'], ['ok-late', 'al 2° tentativo'], ['ko-help', 'sbagliate con aiuto'], ['ko', 'sbagliate']].forEach(function (k) {
        if (tot[k[0]]) gb.appendChild(el('span', { class: 'seg ' + k[0], style: 'flex:' + tot[k[0]], title: tot[k[0]] + ' ' + k[1] }));
      });
      if (all > answered) gb.appendChild(el('span', { class: 'seg none', style: 'flex:' + (all - answered) }));
      const pct = function (k) { return answered ? Math.round(tot[k] * 100 / answered) : 0; };
      root.appendChild(el('div', { class: 'live-general' },
        el('div', { class: 'row', style: 'justify-content:space-between;flex-wrap:wrap;gap:8px' },
          el('b', { text: 'Tutta la classe · ' + answered + ' risposte su ' + all }),
          el('span', { class: 'live-legend', text: '🟢 ' + pct('ok') + '%  🟠 ' + pct('ok-help') + '%  🟤 ' + pct('ko-help') + '%  🔴 ' + pct('ko') + '%' })),
        gb));
      const list = el('div', { class: 'live-list' });
      m.students.slice().sort(function (x, y) { return x.name.localeCompare(y.name, 'it'); }).forEach(function (st) {
        const bar = el('div', { class: 'live-bar' });
        m.exercises.forEach(function (e) { bar.appendChild(el('span', { class: 'seg ' + st.cells[e.id].state })); });
        list.appendChild(el('div', { class: 'live-row' + (st.finished ? ' fin' : '') },
          el('div', { class: 'live-name', text: st.name }), bar,
          el('div', { class: 'live-score', text: (st.finished ? '✓ ' : '') + st.done + '/' + st.total })));
      });
      root.appendChild(list);
      root.appendChild(el('p', { class: 'hint', text: 'Ogni barra è uno studente: un pezzo per esercizio, nell\'ordine del set (se le domande sono in ordine casuale, i pezzi si riempiono a salti). Verde giusto · arancione con aiuto · marrone sbagliato con aiuto · rosso sbagliato · grigio da fare.' }));
      return;
    }
    root.innerHTML = '';
    const now = Date.now();
    const fin = m.students.filter(function (s) { return s.finished; }).length;
    const active = m.students.filter(function (s) { return !s.finished && now - new Date(s.updated_at).getTime() < 90000; }).length;
    root.appendChild(el('div', { class: 'row', style: 'gap:8px;flex-wrap:wrap;align-items:center' },
      el('button', { class: 'small', text: '← Tabella', onclick: function () { CLS.repMode = 'table'; paintReport(be); } }),
      el('h2', { style: 'margin:0;flex:1;min-width:200px', text: '🔴 ' + (a.title || '') }),
      el('button', { class: 'small', text: '👥 Correzione di gruppo', onclick: function () { CLS.repMode = 'fix'; R.fix = null; paintReport(be); } })));
    const url = assignUrl(a.code);
    const top = el('div', { class: 'live-top' });
    const qr = el('div', { class: 'live-qr' }); qr.innerHTML = qrSvg(url);
    top.appendChild(qr);
    top.appendChild(el('div', {}, el('div', { class: 'live-code', text: url.replace(/^https?:\/\//, '') }),
      el('div', { class: 'live-stats' },
        el('span', { text: m.students.length + ' collegati' }), el('span', { class: 'on', text: active + ' stanno rispondendo' }), el('span', { class: 'ok', text: fin + ' hanno finito' }))));
    root.appendChild(top);
    if (!m.students.length) { root.appendChild(el('p', { class: 'muted', text: 'Aspetto gli studenti: fate scansionare il QR o aprire il link.' })); return; }
    const list = el('div', { class: 'live-list' });
    m.students.slice().sort(function (x, y) { return (y.done - x.done) || x.name.localeCompare(y.name, 'it'); }).forEach(function (s) {
      const recent = now - new Date(s.updated_at).getTime() < 90000;
      const dots = el('div', { class: 'live-dots' });
      m.exercises.forEach(function (e) { dots.appendChild(el('span', { class: 'ld ' + s.cells[e.id].state, title: e.n + '. ' + e.label })); });
      list.appendChild(el('div', { class: 'live-row' + (s.finished ? ' fin' : recent ? ' on' : '') },
        el('div', { class: 'live-name', text: s.name }),
        dots,
        el('div', { class: 'live-score', text: s.finished ? '✓ ' + s.score + '/' + s.total : s.done + '/' + s.total })));
    });
    root.appendChild(list);
    root.appendChild(el('p', { class: 'hint', text: 'Verde = giusto · arancione = giusto con l\'aiuto · marrone = sbagliato anche con l\'aiuto · rosso = sbagliato · giallo = giusto al 2° tentativo · grigio = non ancora fatto. Si aggiorna ogni 5 secondi.' }));
  }
  function paintLobby(be, m) {
    const R = CLS.report, a = R.a, root = $('#rep-root');
    const url = assignUrl(a.code);
    const keepShuf = $('#lb-shuf') ? $('#lb-shuf').value : (a.lesson && a.lesson.shuffle ? 'random' : 'same');
    const keepSecs = $('#lb-secs') ? $('#lb-secs').value : '0';
    root.innerHTML = '';
    root.appendChild(el('div', { class: 'row', style: 'gap:8px;flex-wrap:wrap;align-items:center' },
      el('button', { class: 'small', text: '← Classi', onclick: renderClasses }),
      el('h2', { style: 'margin:0;flex:1;min-width:200px', text: '🔴 ' + (a.title || '') + ' · sala d\'attesa' })));
    const qr = el('div', { class: 'lobby-qr' }); qr.innerHTML = qrSvg(url);
    const names = el('div', { class: 'lobby-names' });
    CLS.lobbySeen = CLS.lobbySeen || {};
    m.students.forEach(function (st) { const isNew = !CLS.lobbySeen[st.key]; CLS.lobbySeen[st.key] = 1; names.appendChild(el('span', { class: 'lobby-name' + (isNew ? ' new' : ''), text: st.name })); });   // l'animazione solo per chi è appena entrato
    if (!m.students.length) names.appendChild(el('span', { class: 'muted', text: 'Nessuno ancora…' }));
    root.appendChild(el('div', { class: 'lobby' },
      el('div', { class: 'lobby-left' }, qr, el('div', { class: 'lobby-url', text: url.replace(/^https?:\/\//, '') }), el('div', { class: 'lobby-code', text: 'codice ' + a.code })),
      el('div', { class: 'lobby-right' }, el('div', { class: 'lobby-count', text: m.students.length + (m.students.length === 1 ? ' studente dentro' : ' studenti dentro') }), names)));
    const shuf = el('select', { id: 'lb-shuf' }, el('option', { value: 'same', text: 'Stesse domande, stesso ordine per tutti' }), el('option', { value: 'random', text: '🔀 Ordine casuale per ognuno' }));
    shuf.value = keepShuf;
    const secs = el('select', { id: 'lb-secs' });
    [['0', 'Senza timer'], ['180', '3 minuti'], ['300', '5 minuti'], ['600', '10 minuti'], ['900', '15 minuti'], ['1200', '20 minuti'], ['1800', '30 minuti']].forEach(function (o) { secs.appendChild(el('option', { value: o[0], text: '⏱ ' + o[1] })); });
    secs.value = keepSecs;
    const go = el('button', { class: 'primary big', text: '▶ Via!' });
    go.addEventListener('click', function () {
      const n = +secs.value || 0;
      go.disabled = true;
      liveSet(be, { state: 'run', shuffle: shuf.value === 'random', secs: n, started_at: new Date().toISOString(), ends_at: n ? new Date(Date.now() + n * 1000).toISOString() : null });
    });
    root.appendChild(el('div', { class: 'row lobby-ctrl', style: 'gap:10px;flex-wrap:wrap;align-items:center;margin-top:14px' }, shuf, secs, go));
    root.appendChild(el('p', { class: 'hint', text: 'I nomi compaiono da soli (ogni 3 secondi). Gli studenti aspettano sul telefono finché non premi "Via!".' }));
  }
  /** v131 SCHERMO DOCENTE (secondo schermo): segue la domanda proiettata nella correzione di gruppo (BroadcastChannel,
   *  stesso browser: altra finestra o altro monitor) e mostra chi chiamare e cosa ha scritto. I nomi sul proiettore
   *  restano nascosti. */
  let FIXCH = null;
  function fixChannel() { if (!FIXCH && window.BroadcastChannel) FIXCH = new BroadcastChannel('pl-fix'); return FIXCH; }
  function paintTeacherScreen(be, m) {
    const R = CLS.report, a = R.a, root = $('#rep-root');
    const ch = fixChannel();
    if (ch && !ch._hooked) { ch._hooked = true; ch.onmessage = function (ev) { const d = ev.data || {}; if (CLS.report && CLS.report.a && d.id === CLS.report.a.id) { CLS.teacherSel = d; if (CLS.repMode === 'teacher') paintReport(be); } }; }
    root.innerHTML = '';
    root.appendChild(el('div', { class: 'row', style: 'gap:8px;flex-wrap:wrap;align-items:center' },
      el('h2', { style: 'margin:0;flex:1', text: '🖥 Schermo docente · ' + (a.title || '') }),
      el('button', { class: 'small', text: '📊 Tabella', onclick: function () { CLS.repMode = 'table'; paintReport(be); } })));
    const sel = CLS.teacherSel;
    const e = sel && m.exercises.find(function (x) { return x.id === sel.ex; });
    if (!e) { root.appendChild(el('p', { class: 'muted', text: 'Apri la correzione di gruppo sullo schermo proiettato: qui compare da solo chi ha sbagliato la domanda che stai mostrando.' })); return; }
    root.appendChild(el('div', { class: 'fix-n', style: 'margin-top:10px', text: 'Esercizio ' + e.n + ' · ' + e.label }));
    root.appendChild(el('div', { class: 'tq-q', text: e.prompt || e.sentence }));
    root.appendChild(el('div', { class: 'tq-sol', text: '✓ ' + e.solution }));
    const rows = m.students.map(function (st) { return { st: st, c: st.cells[e.id] }; });
    const order = { 'ko': 0, 'ko-help': 1, 'ok-late': 2, 'ok-help': 3, none: 4, ok: 5 };
    rows.sort(function (x, y) { return order[x.c.state] - order[y.c.state] || x.st.name.localeCompare(y.st.name, 'it'); });
    const label = { ko: '🔴 sbagliato', 'ko-help': '🟤 sbagliato con aiuto', 'ok-late': '🟡 giusto al 2°', 'ok-help': '🟠 giusto con aiuto', none: '⚪ non fatto', ok: '🟢 giusto' };
    const tb = el('div', { class: 'tq-list' });
    rows.forEach(function (r) {
      const wrong = r.c.tries.filter(function (t) { return !t.ok; }).map(function (t) { return t.a; });
      tb.appendChild(el('div', { class: 'tq-row ' + r.c.state }, el('b', { text: r.st.name }), el('span', { text: label[r.c.state] }), el('span', { class: 'tq-ans', text: wrong.join('  ·  ') })));
    });
    root.appendChild(tb);
  }
  /** v129 CORREZIONE DI GRUPPO ("alla fine voglio poter fare una correzione di gruppo in modo che posso chiamare gli
   *  studenti che hanno sbagliato e farli riprovare"): una domanda alla volta, proiettata SENZA soluzione; sotto, chi
   *  l'ha sbagliata (nomi da chiamare) e, cliccando un nome, cosa ha scritto. "Mostra la soluzione" quando si vuole.
   *  Di default solo le domande con almeno un errore, dalla più sbagliata. */
  function paintFix(be, m) {
    const R = CLS.report, a = R.a, root = $('#rep-root');
    R.fix = R.fix || { onlyErr: true, i: 0, show: false, who: null, names: false };
    const F = R.fix;
    root.innerHTML = '';
    const stat = m.exercises.map(function (e, k) {
      const wrong = m.students.filter(function (s) { const c = s.cells[e.id]; return c.state !== 'ok' && c.state !== 'none'; });
      return { e: e, p: m.perExercise[k], wrong: wrong };
    });
    let list = F.onlyErr ? stat.filter(function (x) { return x.wrong.length; }).sort(function (x, y) { return (x.p.pct == null ? 101 : x.p.pct) - (y.p.pct == null ? 101 : y.p.pct); }) : stat;
    const only = el('input', { type: 'checkbox' }); only.checked = F.onlyErr;
    only.addEventListener('change', function () { F.onlyErr = only.checked; F.i = 0; F.show = false; F.who = null; paintReport(be); });
    root.appendChild(el('div', { class: 'row', style: 'gap:8px;flex-wrap:wrap;align-items:center' },
      el('button', { class: 'small', text: '← Tabella', onclick: function () { CLS.repMode = 'table'; paintReport(be); } }),
      el('h2', { style: 'margin:0;flex:1;min-width:200px', text: '👥 Correzione · ' + (a.title || '') }),
      el('label', { class: 'chip', style: 'margin:0' }, only, ' solo le domande con errori (dalla più sbagliata)'),
      el('button', { class: 'small', text: '🖥 Schermo docente', title: 'Apri in un\'altra finestra (sul portatile o sul secondo monitor): segue la domanda proiettata e ti dice chi ha sbagliato e cosa ha scritto', onclick: function () { window.open(location.pathname + location.search + '#rep=' + a.id + '&m=teacher', 'pl-teacher'); } }),
      el('button', { class: 'small', text: '🔴 LIVE', onclick: function () { CLS.repMode = 'live'; paintReport(be); } })));
    if (!list.length) { root.appendChild(el('p', { class: 'notice ok', text: m.students.length ? 'Nessun errore da correggere: tutti giusti al primo colpo! 🎉' : 'Nessuno ha ancora fatto il compito.' })); return; }
    F.i = Math.max(0, Math.min(F.i, list.length - 1));
    const x = list[F.i], e = x.e;
    const ch = fixChannel(); if (ch) ch.postMessage({ id: a.id, ex: e.id, show: F.show });   // v131: lo schermo docente segue
    const card = el('div', { class: 'fix-card' });
    card.appendChild(el('div', { class: 'row', style: 'justify-content:space-between;align-items:center;gap:8px' },
      el('div', { class: 'fix-n', text: 'Esercizio ' + e.n + ' · ' + e.label }),
      el('div', { class: 'fix-pct' + (x.p.pct != null && x.p.pct < 60 ? ' low' : ''), text: x.p.pct == null ? '' : x.p.pct + '% giusto · ' + x.p.done + ' risposte' })));
    // v182 (Edoardo, correzione di gruppo: "perché non c'è la foto? la voglio"): la foto dell'esercizio accanto alla domanda
    const fq = el('div', { class: 'fix-q', text: e.prompt || e.sentence });
    if (e.image) {
      const im = el('img', { class: 'fix-img', src: e.image, alt: '', referrerpolicy: 'no-referrer' });
      im.addEventListener('error', function () { im.remove(); });
      card.appendChild(el('div', { class: 'fix-qrow' }, im, fq));
    } else card.appendChild(fq);
    const solBox = el('div', { class: 'fix-sol' });
    if (F.show) { solBox.appendChild(el('div', { text: '✓ ' + e.solution })); if (e.explain) solBox.appendChild(el('div', { class: 'fix-exp', text: e.explain })); }
    card.appendChild(solBox);
    const who = el('div', { class: 'fix-who' });
    const namesBox = el('input', { type: 'checkbox' }); namesBox.checked = !!F.names;
    namesBox.addEventListener('change', function () { F.names = namesBox.checked; paintReport(be); });
    who.appendChild(el('div', { class: 'row', style: 'gap:10px;align-items:center;flex-wrap:wrap' },
      el('span', { class: 'meta', text: x.wrong.length ? x.wrong.length + (x.wrong.length === 1 ? ' studente ha' : ' studenti hanno') + ' sbagliato o avuto bisogno dell\'aiuto' : 'Tutti giusti al primo colpo' }),
      x.wrong.length ? el('label', { class: 'chip', style: 'margin:0' }, namesBox, ' mostra i nomi qui') : null));
    if (!F.names) x.wrong = [];   // v131: di default i nomi NON vanno sul proiettore (li hai sullo schermo docente)
    const chips = el('div', { class: 'chips' });
    x.wrong.forEach(function (s) {
      const c = s.cells[e.id];
      chips.appendChild(el('button', { class: 'fix-name ' + c.state + (F.who === s.key ? ' sel' : ''), text: s.name + (c.state === 'ok-late' ? ' (2°)' : c.state === 'ok-help' ? ' (con aiuto)' : c.state === 'ko-help' ? ' (anche con aiuto)' : ''), onclick: function () { F.who = F.who === s.key ? null : s.key; paintReport(be); } }));
    });
    who.appendChild(chips);
    if (F.who) {
      const s = x.wrong.find(function (y) { return y.key === F.who; });
      if (s) who.appendChild(el('div', { class: 'fix-ans' }, el('b', { text: s.name + ' ha scritto: ' }), document.createTextNode(s.cells[e.id].tries.filter(function (t) { return !t.ok; }).map(function (t) { return t.a; }).join('  ·  ') || '(niente)')));
    }
    card.appendChild(who);
    root.appendChild(card);
    root.appendChild(el('div', { class: 'row fix-nav', style: 'gap:8px;justify-content:center;margin-top:12px' },
      el('button', { text: '◀', disabled: F.i === 0 ? 'disabled' : null, onclick: function () { F.i--; F.show = false; F.who = null; paintReport(be); } }),
      el('button', { class: 'primary', text: F.show ? 'Nascondi la soluzione' : '👁 Mostra la soluzione', onclick: function () { F.show = !F.show; paintReport(be); } }),
      el('span', { class: 'meta', text: (F.i + 1) + ' di ' + list.length }),
      el('button', { text: '▶', disabled: F.i >= list.length - 1 ? 'disabled' : null, onclick: function () { F.i++; F.show = false; F.who = null; paintReport(be); } })));
  }
  function paintDetail(m, box) {
    const R = CLS.report, sel = R.sel; box.innerHTML = '';
    const e = m.exercises.find(function (x) { return x.id === sel.ex; }); if (!e) return;
    box.appendChild(el('h3', { text: e.n + '. ' + e.label }));
    if (e.sentence) box.appendChild(el('p', { class: 'meta', text: 'Frase: ' + e.sentence }));
    box.appendChild(el('p', { class: 'meta', text: 'Soluzione: ' + e.solution }));
    const who = sel.st ? m.students.filter(function (s) { return s.key === sel.st; }) : m.students;
    who.forEach(function (s) {
      const c = s.cells[e.id];
      const line = el('div', { class: 'rep-ans ' + c.state }, el('b', { text: s.name + ': ' }));
      if (c.state === 'none') line.appendChild(document.createTextNode('non ancora fatto'));
      else {
        const wrong = c.tries.filter(function (t) { return !t.ok; });
        const outcome = c.state === 'ok-help' ? '🟠 giusto con l\'aiuto' : c.state === 'ko-help' ? '🟤 sbagliato anche con l\'aiuto' : c.state === 'ko' ? (c.how === 'skipped' ? 'saltato' : 'ha guardato la soluzione') : (c.tries.length > 1 ? 'giusto al ' + c.tries.length + '° tentativo' : 'giusto al primo tentativo');
        line.appendChild(document.createTextNode(outcome + (c.hints ? ' · ' + c.hints + (c.hints === 1 ? ' aiuto' : ' aiuti') : '')));
        if (wrong.length) line.appendChild(el('ul', {}, wrong.map(function (t) { return el('li', { text: '✗ ' + t.a }); })));
      }
      box.appendChild(line);
    });
    box.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  }

  // --- studente: link #a=CODICE ---
  function assignMsg(text, bad) {
    const box = $('#as-box'); box.innerHTML = '';
    box.appendChild(el('div', { class: 'notice' + (bad ? ' bad' : ''), text: text }));
  }
  function openAssignmentStudent(code) {
    document.body.classList.add('standalone');   // lo studente non vede la barra del docente
    show('assign');
    const E = stuBrowserLang() === 'it'
      ? { load: 'Carico il compito…', bad: 'Codice del compito non valido: controlla il link che ti ha dato il docente.', net: 'Non riesco a collegarmi: controlla la connessione e ricarica la pagina.', gone: 'Questo compito non esiste o è stato eliminato: controlla il link.', closed: 'Il compito "{t}" è chiuso: chiedi al docente di riaprirlo.', fail: 'Non riesco a caricare il compito: ' }
      : { load: 'Loading the assignment…', bad: 'Invalid assignment code: check the link your teacher gave you.', net: 'Can\'t connect: check your connection and reload the page.', gone: 'This assignment doesn\'t exist or was deleted: check the link.', closed: 'The assignment "{t}" is closed: ask your teacher to reopen it.', fail: 'Can\'t load the assignment: ' };
    assignMsg(E.load);
    code = String(code || '').trim().toUpperCase();
    if (!VLClass.validCode(code)) return assignMsg(E.bad, true);
    studentBackend(function (be) {
      if (!be) return assignMsg(E.net, true);
      be.getAssignment(code).then(function (a) {
        if (!a) return assignMsg(E.gone, true);
        if (!a.open || !a.lesson) return assignMsg(E.closed.split('{t}').join(a.title || ''), true);
        renderAssignStart(be, a);
      }, function (e) { assignMsg(E.fail + e.message, true); });
    });
  }
  function renderAssignStart(be, a) {
    const box = $('#as-box'); box.innerHTML = '';
    const T = asgT(a.lesson);
    document.documentElement.lang = a.lesson.uiLang === 'en' || !a.lesson.uiLang ? 'en' : 'it';
    let saved = ''; try { saved = localStorage.getItem('vle.studentName') || ''; } catch (e) { /* ignora */ }
    const inp = el('input', { type: 'text', value: saved, placeholder: T.namePh, autocomplete: 'name', maxlength: '80', style: 'width:100%;font-size:18px' });
    const go = el('button', { class: 'primary', text: T.start, style: 'font-size:17px' });
    const start = function () {
      const name = VLClass.cleanName(inp.value);
      if (!VLClass.validName(name)) { inp.focus(); return toast(T.needName); }
      try { localStorage.setItem('vle.studentName', name); } catch (e) { /* ignora */ }
      S.assign = { be: be, code: a.code, id: VLClass.uuid(), name: name, detail: {}, lesson: a.lesson, status: null, timer: null, err: '' };
      assignSend(false);
      if (a.live && a.live.state) return liveStudent(be, a);   // v131: sessione dal vivo (sala d'attesa)
      if (VLClass.isSet(a.lesson)) return playAssignSet(a);   // v126: esercitazione senza video
      openStudent(null, false, a.lesson);
    };
    go.addEventListener('click', start);
    inp.addEventListener('keydown', function (e) { if (e.key === 'Enter') start(); });
    box.appendChild(el('h2', { style: 'margin-top:0', text: a.title || 'Compito' }));
    box.appendChild(el('p', { class: 'meta', text: (a.className ? a.className + ' · ' : '') + VLClass.asgItems(a.lesson).length + ' ' + T.exercises }));
    box.appendChild(el('label', { text: T.name }));
    box.appendChild(inp);
    box.appendChild(el('p', { class: 'hint', text: T.privacy }));
    box.appendChild(el('div', { class: 'row', style: 'margin-top:10px' }, go));
    // v132: profilo facoltativo
    if (STU.user) {
      if (stuName(STU.user) && !inp.value) inp.value = stuName(STU.user);
      box.appendChild(el('p', { class: 'meta', text: T.signedAs.split('{e}').join(stuName(STU.user) || STU.user.email) + ' · ' }, el('a', { href: '#me', text: T.me, onclick: function (ev) { ev.preventDefault(); openMine(); } })));
    } else {
      const lg = el('div', { style: 'display:none' });
      box.appendChild(el('p', { class: 'meta' }, el('a', { href: '#', text: T.meOpt, onclick: function (ev) { ev.preventDefault(); lg.style.display = lg.style.display === 'none' ? '' : 'none'; } })));
      lg.appendChild(stuLoginBox(T, function () { studentBackend(function (be2) { renderAssignStart(be2, a); }); }));
      box.appendChild(lg);
    }
    setTimeout(function () { inp.focus(); }, 50);
  }
  /** v126: esercitazione senza video (set di esercizi) fatta come compito. Un esercizio alla volta; se la risposta
   *  è sbagliata si riprova UNA volta, poi si vede la soluzione (con la spiegazione dell'autore, se c'è). Ogni risposta
   *  data finisce nel report (stesso registro delle video-lezioni: S.assign.detail[item.id].tries). */
  function playAssignSet(a, LV) {
    // v129: ordine casuale per studente (e per tentativo); il report resta nell'ordine del docente (si lavora per id)
    let items = ((a.lesson.chal && a.lesson.chal.items) || []).slice();
    const live = LV && LV.live;
    const shuffleOn = !!(a.lesson.shuffle || (live && live.shuffle));
    if (shuffleOn) items = VLChal.shuffleArr(items, Math.random);
    let over = false;   // v131: tempo scaduto o fermato dal docente
    const anyTr = items.some(trValid);   // v166
    const box = $('#as-box');
    const T = asgT(a.lesson);
    $('#view-assign').classList.add('as-set');
    let i = 0;
    const MAX_TRIES = 2;
    /** v130 (Edoardo: "se lo studente non riesce a rispondere si attivi un aiuto e io devo vedere un puntino arancione…
     *  se continua a sbagliare anche con l'aiuto un puntino marrone"): dopo il primo errore arriva UN aiuto per tipo;
     *  cell.hints = 1 fa diventare la casella del report arancione (giusto) o marrone (sbagliato). */
    const fill = function (t, o) { Object.keys(o).forEach(function (k) { t = t.split('{' + k + '}').join(o[k]); }); return t; };
    const hintFor = function (item, pub) {
      const d = item.data || {}, out = { text: [], mcOff: null };
      if (item.kind === 'gap' || item.kind === 'gapbank') {
        EX.gapRuns(d).forEach(function (r) {
          const w = String(r.answer || ''); const k = Math.max(1, Math.ceil(w.length / 3));
          out.text.push(fill(T.hStart, { w: w.slice(0, k), n: w.replace(/\s/g, '').length }));
        });
      } else if (item.kind === 'mc') {
        const n = (d.options || []).filter(Boolean).length, wrong = [];
        for (let j = 0; j < n; j++) if (j !== d.correct) wrong.push(j);
        const off = VLChal.shuffleArr(wrong, Math.random).slice(0, wrong.length >= 3 ? 2 : wrong.length === 2 ? 1 : 0);   // resta sempre almeno una sbagliata
        if (off.length) { out.mcOff = off; out.text.push(fill(T.hMc, { n: off.length })); }
      } else if (item.kind === 'wrong') out.text.push(fill(T.hWrong, { w: (d.shown || [])[d.wrongIndex] || '' }));
      else if (item.kind === 'missing') out.text.push(d.missingIndex > 0 ? fill(T.hMiss, { w: (d.tokens || [])[d.missingIndex - 1] || '' }) : T.hMiss0);
      else if (item.kind === 'extra') out.text.push(d.extraIndex < (d.shown || []).length / 2 ? T.hExtraA : T.hExtraB);
      else if (item.kind === 'scramble') out.text.push(fill(T.hScr, { w: (d.words || [])[0] || '' }));
      else if (item.kind === 'match') { const p0 = (item.pairs || [])[0]; if (p0) out.text.push(fill(T.hMatch, { w: p0.a + ' ↔ ' + p0.b })); }
      // v165 (Edoardo: 'non ha senso questo hint che dice "inizia con ragazz" e dopo dai la soluzione'): la spiegazione
      // (item.explain) contiene la risposta e si vede solo DOPO; qui va l'aiuto vero, item.hint = la regola senza la
      // risposta ("i nomi in -a al plurale finiscono in -e"). Se c'è, sostituisce l'aiuto generico "comincia con…".
      if (item.hint) out.text = [item.hint];
      return out;
    };
    const answerOf = function (item, v, pub) {
      if (item.kind === 'match') return (pub.left || []).map(function (l, k) { return l + ' → ' + (v[k] === -1 || v[k] == null ? '?' : pub.right[v[k]]); }).join(' · ');
      return VLClass.answerText({ type: item.kind, data: item.data }, v);
    };
    // v131: timer della sessione dal vivo e controllo "fermato dal docente" ogni 4 s
    clearInterval(S.liveTick); clearInterval(S.livePoll);
    const endNow = function (why) {
      if (over) return; over = true;
      clearInterval(S.liveTick); clearInterval(S.livePoll);
      box.innerHTML = '';
      box.appendChild(el('div', { class: 'notice', style: 'font-weight:700;font-size:18px', text: why }));
      finish();
    };
    if (live && live.ends_at) {
      S.liveTick = setInterval(function () {
        const left = Date.parse(live.ends_at) - (Date.now() + (LV.off || 0));
        const n = $('#as-clock'); if (n) { n.textContent = '⏱ ' + fmtClock(left); n.classList.toggle('low', left < 60000); }
        if (left <= 0) endNow(T.timeUp);
      }, 500);
    }
    if (live && LV.be && LV.be.getLive) {
      S.livePoll = setInterval(function () {
        LV.be.getLive(a.code).then(function (r) { if (r && r.live && r.live.state === 'end') endNow(T.stopped); }, function () { /* riprova */ });
      }, 4000);
    }
    const head = function () {
      const bar = el('div', { class: 'as-dots' });
      items.forEach(function (it, k) {
        const c = S.assign.detail[it.id];
        bar.appendChild(el('span', { class: 'as-dot' + (k === i ? ' cur' : '') + (c && c.ok === true ? (c.hints ? ' okh' : ' ok') : c && c.ok === false ? (c.hints ? ' badh' : ' bad') : '') }));
      });
      return el('div', {}, el('div', { class: 'row', style: 'justify-content:space-between;align-items:baseline;gap:8px' },
        el('h2', { style: 'margin:0;font-size:18px', text: a.title || 'Esercitazione' }),
        live && live.ends_at ? el('span', { id: 'as-clock', class: 'as-clock', text: '⏱ ' + fmtClock(Date.parse(live.ends_at) - (Date.now() + (LV.off || 0))) }) : null,
        el('span', { class: 'badge', text: Math.min(i + 1, items.length) + (a.lesson.uiLang === 'en' ? ' of ' : ' di ') + items.length })), bar);
    };
    const INSTR = T.i;
    const step = function () {
      if (over) return;
      box.innerHTML = '';
      if (i >= items.length) { clearInterval(S.liveTick); clearInterval(S.livePoll); over = true; return finish(); }
      const item = items[i];
      const cell = assignCell({ id: item.id, type: item.kind });
      box.appendChild(head());
      const pub = VLChal.pubItem(item, { showQ: true });
      if (item.kind === 'mc' && !pub.q) pub.q = item.data.question;
      if (item.image) box.appendChild(el('img', { class: 'as-img', src: item.image, alt: '' }));
      if (item.image && item.imageCredit) noteCredit(item.imageCredit);
      box.appendChild(el('div', { class: 'as-kind', text: T.both ? ((T.k[item.kind] || '').split('\n')[0] + ' · ' + (INSTR[item.kind] || '').split('\n')[0] + '\n' + (T.k[item.kind] || '').split('\n')[1] + ' · ' + (INSTR[item.kind] || '').split('\n')[1]) + (item.strict && (item.kind === 'gap' || item.kind === 'gapbank' || item.kind === 'wrong' || item.kind === 'missing') ? '\n' + T.accents.trim() : '') : (T.k[item.kind] || VLChal.itemLabel(item.kind)) + ' · ' + (INSTR[item.kind] || '') + (item.strict && (item.kind === 'gap' || item.kind === 'gapbank' || item.kind === 'wrong' || item.kind === 'missing') ? T.accents : '') }));
      const trv = trValid(item);
      let hintShown = null;
      const hintPaint = function () {
        if (!hintShown) return;
        const lg = stuTrLang(), th = lg && item.hint && trv && trv.hsrc === item.hint && trv.h && trv.h[lg];
        hintBox.textContent = T.hint + (th ? ': ' + th : hintShown.length ? ': ' + hintShown.join('\n') : '');
        hintBox.dir = th ? 'auto' : 'ltr';
      };
      box.appendChild(trBar(trv && trv.t, hintPaint, item.kind));
      const msg = el('div', { class: 'as-msg' });
      const hintBox = el('div', { class: 'as-hint', style: 'display:none' });
      let mcOff = null;
      const ask = function () {
        const inputBox = chpItemInput(pub, { inline: true, mcOff: mcOff, sendLabel: T.check, answerFirst: T.answerFirst, wrongPh: T.wrongPh, missPh: T.missPh, scrHint: T.scrHint, onSubmit: function (v) {
          const res = VLChal.checkItem(item, v, pub);
          // v180: errore di battitura = "controlla come hai scritto", non consuma il tentativo (una volta sola)
          if (!res.correct && !cell.typo && VLChal.typoOf(item, v)) { cell.typo = 1; msg.className = 'as-msg no'; msg.textContent = T.typo; return 'retry'; }
          if (cell.tries.length < 30) cell.tries.push({ a: answerOf(item, v, pub).slice(0, 300), ok: !!res.correct });
          if (res.correct) {
            cell.ok = true; cell.how = 'solved';
            if (typeof playWinSound === 'function') playWinSound();
            return done(true);
          }
          if (cell.tries.length < MAX_TRIES) {
            msg.className = 'as-msg no';
            msg.textContent = res.frac > 0 ? T.almost.split('{p}').join(Math.round(res.frac * 100)) : T.notYet;
            const h = hintFor(item, pub);
            cell.hints = 1; mcOff = h.mcOff;
            hintShown = h.text; hintPaint();
            hintBox.style.display = '';
            inputBox.replaceWith(ask());
            return;
          }
          cell.ok = false; cell.how = 'revealed';
          // v165: secondo errore = si mostra la risposta e, dove si scrive, lo studente la ricopia per andare avanti
          // (resta "sbagliato" nel report: ricopiare non dà punti, serve a fissare la forma giusta)
          if (['gap', 'gapbank', 'wrong', 'missing'].indexOf(item.kind) === -1) return done(false);
          clearTimeout(S.assign.timer); S.assign.timer = setTimeout(function () { assignSend(false); }, 400);
          msg.className = 'as-msg no'; msg.textContent = T.typeIt;
          hintShown = null; hintBox.className = 'as-hint as-copy'; hintBox.innerHTML = '';
          hintBox.appendChild(el('div', { class: 'as-copy-sol', text: VLChal.solutionText(item) }));
          hintBox.appendChild(el('div', { class: 'as-copy-do', text: T.typeIt2 }));
          hintBox.style.display = '';
          const copy = function () {
            const cb = chpItemInput(pub, { inline: true, sendLabel: T.check, answerFirst: T.answerFirst, wrongPh: T.wrongPh, missPh: T.missPh, onSubmit: function (v2) {
              if (VLChal.checkItem(item, v2, pub).correct) return done(false);
              cb.replaceWith(copy());
            } });
            return cb;
          };
          inputBox.replaceWith(copy());
        } });
        return inputBox;
      };
      const done = function (ok) {
        clearTimeout(S.assign.timer);
        S.assign.timer = setTimeout(function () { assignSend(false); }, 400);
        box.innerHTML = '';
        box.appendChild(head());
        const fb = el('div', { class: 'chp-reveal ' + (ok ? 'ok' : 'no soft') },
          el('div', { class: 'big', text: ok ? (cell.hints ? T.okHelp : cell.tries.length > 1 ? T.okLate : T.ok) : kindWord(a.lesson.uiLang) }),
          ok ? null : el('div', { class: 'sol', text: T.solution + VLChal.solutionText(item) }),
          item.explain ? el('div', { class: 'sol as-explain', text: item.explain }) : null);
        box.appendChild(fb);
        const next = el('button', { class: 'primary big chp-send', text: i + 1 < items.length ? T.next : T.result, onclick: function () { i++; step(); } });
        box.appendChild(next);
        setTimeout(function () { next.focus(); }, 30);
      };
      box.appendChild(msg);
      box.appendChild(hintBox);
      box.appendChild(ask());
    };
    const finish = function () {
      const sc = VLClass.scoreOf(a.lesson, S.assign.detail);
      box.appendChild(el('h2', { style: 'margin-top:0', text: a.title || 'Esercitazione' }));
      box.appendChild(el('div', { class: 'chp-reveal ' + (sc.score === sc.total ? 'ok' : '') }, el('div', { class: 'big', text: '🏁 ' + sc.score + (a.lesson.uiLang === 'en' ? ' / ' : ' su ') + sc.total })));
      box.appendChild(assignSummaryBox());
      const crN = creditsNote(items.map(function (it) { return it.image && it.imageCredit; }).filter(Boolean));
      const wrong = items.filter(function (it) { const c = S.assign.detail[it.id]; return !c || c.ok !== true; });
      if (wrong.length) {
        box.appendChild(el('h3', { text: T.review }));
        box.appendChild(el('ol', { class: 'as-review' }, wrong.map(function (it) {
          const c = S.assign.detail[it.id] || { tries: [] };
          const last = c.tries.length ? c.tries[c.tries.length - 1].a : '';
          return el('li', { value: String(items.indexOf(it) + 1) },
            el('div', { text: it.kind === 'mc' ? it.data.question : (it.kind === 'gap' || it.kind === 'gapbank' ? VLChal.gapText(it) : (T.k[it.kind] || VLChal.itemLabel(it.kind)).split('\n')[0]) }),
            last ? el('div', { class: 'meta', text: T.youWrote + last }) : null,
            el('div', { class: 'as-sol', text: T.correct + VLChal.solutionText(it) }));
        })));
      }
      if (!S.assign.local) box.appendChild(el('p', { style: 'margin-top:12px' }, el('a', { href: '#me', text: T.me + (STU.user ? '' : ' · ' + T.meOpt.replace(/^👤 /, '')), onclick: function (ev) { ev.preventDefault(); openMine(); } })));
      if (crN) box.appendChild(crN);
      if (!live) box.appendChild(el('div', { class: 'row', style: 'margin-top:12px' }, el('button', { text: T.again, onclick: function () { assignNewAttempt(); if (shuffleOn) items = VLChal.shuffleArr(items, Math.random); i = 0; over = false; step(); } })));
    };
    step();
  }
  /** v131: studente in una sessione dal vivo. Sala d'attesa finché il docente non preme "Via" (get_live ogni 2 s, leggero),
   *  poi il quiz con l'ordine e il timer scelti dal docente. L'ora del server (now) corregge l'orologio del telefono. */
  function liveStudent(be, a) {
    const T = asgT(a.lesson);
    const box = $('#as-box');
    const off = a.now ? Date.parse(a.now) - Date.now() : 0;
    const begin = function (live) {
      clearInterval(S.liveWait);
      if (live.state === 'end') { box.innerHTML = ''; box.appendChild(el('div', { class: 'notice', text: T.ended })); return; }
      playAssignSet(a, { live: live, off: off, be: be });
    };
    if (a.live.state !== 'lobby') return begin(a.live);
    box.innerHTML = '';
    box.appendChild(el('div', { class: 'as-wait' },
      el('div', { class: 'big', text: T.waitTitle }),
      el('div', { class: 'as-wait-name', text: S.assign.name }),
      el('div', { class: 'hint', text: T.waitMsg }),
      el('div', { class: 'as-wait-dots' }, el('span'), el('span'), el('span'))));
    clearInterval(S.liveWait);
    S.liveWait = setInterval(function () {
      (be.getLive ? be.getLive(a.code) : be.getAssignment(a.code)).then(function (r) {
        if (r && r.live && r.live.state && r.live.state !== 'lobby') begin(r.live);
      }, function () { /* rete ballerina: si riprova al giro dopo */ });
    }, 2000);
  }
  function assignCell(ex) {
    const d = S.assign.detail;
    return d[ex.id] || (d[ex.id] = { t: ex.type, ok: null, tries: [], hints: 0 });
  }
  function assignAttempt(ex, a, ok) {
    if (!S.assign) return;
    const c = assignCell(ex);
    if (c.tries.length < 30) c.tries.push({ a: VLClass.answerText(ex, a).slice(0, 300), ok: !!ok });
  }
  function assignFinish(ex, correct, how, hints) {
    if (!S.assign) return;
    const c = assignCell(ex);
    c.ok = !!correct; c.how = how || (correct ? 'solved' : 'revealed'); c.hints = hints || 0;
    clearTimeout(S.assign.timer);
    S.assign.timer = setTimeout(function () { assignSend(false); }, 700);
  }
  function assignSend(finished) {
    const A = S.assign; if (!A) return Promise.resolve(false);
    if (A.local) { paintAssignStatus(); return Promise.resolve(true); }   // v181: fatto qui sul computer, non si manda niente
    rememberAttempt(A.id, A.code);   // v132: per collegarlo al profilo se lo studente entra dopo
    try { localStorage.setItem('vle.stuLang', (A.lesson && A.lesson.uiLang) || 'en'); } catch (e) { /* ignora */ }
    const sc = VLClass.scoreOf(A.lesson, A.detail);
    if (finished) A.status = 'sending';
    paintAssignStatus();
    return A.be.submitResult({ code: A.code, id: A.id, name: A.name, detail: A.detail, score: sc.score, total: sc.total, finished: !!finished })
      .then(function (ok) {
        if (!ok) A.status = 'closed';
        else if (finished) A.status = 'done';
        paintAssignStatus(); return ok;
      }, function (e) { if (finished) { A.status = 'error'; A.err = e.message; } paintAssignStatus(); return false; });
  }
  function assignSummaryBox() {
    clearTimeout(S.assign.timer);
    const box = el('div', { id: 'as-status', class: 'notice' });
    setTimeout(function () { assignSend(true); }, 0);
    return box;
  }
  function paintAssignStatus() {
    const box = $('#as-status'); const A = S.assign; if (!box || !A) return;
    const T = asgT(A.lesson);
    box.innerHTML = ''; box.className = 'notice';
    if (A.local) {
      box.textContent = A.lesson.uiLang === 'en' || !A.lesson.uiLang ? 'Done on this computer: nothing is saved or sent.' : 'Fatto su questo computer: niente viene salvato né inviato.';
      box.appendChild(el('button', { class: 'small', style: 'margin-left:10px', text: '✎ Torna all\'esercitazione', onclick: function () { document.body.classList.remove('as-local'); const id = A.backId; S.assign = null; openChalSet(id); } }));
      return;
    }
    if (A.status === 'done') { box.classList.add('ok'); box.textContent = T.done.split('{n}').join(A.name); }
    else if (A.status === 'closed') { box.classList.add('bad'); box.textContent = T.closed; }
    else if (A.status === 'error') {
      box.classList.add('bad');
      box.appendChild(document.createTextNode(T.notSent.split('{e}').join(A.err)));
      box.appendChild(el('button', { class: 'small', text: T.resend, onclick: function () { assignSend(true); } }));
    } else box.textContent = T.sending;
  }
  function assignNewAttempt() {
    if (!S.assign) return;
    clearTimeout(S.assign.timer);
    S.assign.id = VLClass.uuid(); S.assign.detail = {}; S.assign.status = null;
    assignSend(false);
  }

  function init() {
    loadState();
    bindOverlayCancel();   // v87: la via d'uscita dall'attesa
    bindNestedScroll();    // v90: la rotella non resta incastrata nella colonna sinistra
    bindMiniPlayer();      // v95: il player si stacca quando esce dallo schermo
    const q = new URLSearchParams(location.search);
    S.mock = q.get('mock') === '1';
    S.speed = Math.max(0.25, parseFloat(q.get('speed') || '1') || 1);
    const h = location.hash;
    if (h.indexOf('#import=') === 0) {
      try {
        const data = JSON.parse(unb64url(h.slice(8)));
        history.replaceState(null, '', location.pathname + location.search);
        return openNew(data);
      } catch (e) { toast('Importazione da YouTube non riuscita: ' + e.message); }
    }
    if (h.indexOf('#platform=') === 0) {
      // v120: il pulsante dei preferiti su una lezione fatta altrove (oggi ISLCollective) → lezione PauseLearn
      let payload = null;
      try { payload = JSON.parse(unb64url(h.slice(10))); } catch (e) { toast('Importazione non riuscita: ' + e.message, 6000); }
      history.replaceState(null, '', location.pathname + location.search);
      if (payload) return importFromPlatform(payload);
    }
    if (h.indexOf('#c=') === 0) {
      const pin = h.slice(3).trim().toUpperCase();
      if (VLChal.validPin(pin)) { S.standalone = true; return openChalPlay(pin); }
      toast('PIN della sfida non valido');
    }
    if (h === '#chalrev') { history.replaceState(null, '', location.pathname + location.search); return renderChalRevTab(); }   // v158
    if (h === '#chalrep') { history.replaceState(null, '', location.pathname + location.search); return renderChalReport(); }   // v135
    if (h.indexOf('#chalrep=') === 0) {   // v137: report di una sfida salvata nel cloud
      const rid = h.slice(9);
      history.replaceState(null, '', location.pathname + location.search);
      let tries = 0;
      const wait = function () { if (classBackend() || tries++ > 20) return openSavedChalReport(rid); setTimeout(wait, 400); };
      renderHome();
      return setTimeout(wait, 300);
    }
    if (h.indexOf('#rep=') === 0) {   // v131: schermo docente in un'altra finestra (serve l'accesso: si aspetta il cloud)
      const pr = new URLSearchParams(h.slice(1));
      const rid = pr.get('rep'), rm = pr.get('m') || 'table';
      history.replaceState(null, '', location.pathname + location.search);
      let tries = 0;
      const wait = function () { if (classBackend() || tries++ > 20) return renderReport(rid, rm); setTimeout(wait, 400); };
      renderHome();
      return setTimeout(wait, 300);
    }
    if (h === '#me' || h.indexOf('#me') === 0 && h.length === 3) { return openMine(); }   // v132: "I miei compiti" dello studente
    if (h.indexOf('#a=') === 0) {   // v125: compito assegnato a una classe (lo studente scrive il nome, i risultati vanno al docente)
      S.standalone = true;
      return openAssignmentStudent(decodeURIComponent(h.slice(3)));
    }
    if (h.indexOf('#d=') === 0) {
      try {
        const ls = JSON.parse(unb64url(h.slice(3)));
        S.standalone = true;
        if (ls.activity && !Array.isArray(ls.exercises)) return openActPlay(null, ls);   // link di un'attività-gioco
        ls.options = ls.options || {}; ls.cuts = ls.cuts || [];
        return openStudent(null, false, ls);
      } catch (e) { toast('Link non valido: ' + e.message); }
    }
    const slug = q.get('lesson');
    if (slug) {
      S.standalone = true;
      fetch('lessons/' + encodeURIComponent(slug) + '.json').then(function (r) { if (!r.ok) throw new Error('HTTP ' + r.status); return r.json(); })
        .then(function (ls) { ls.options = ls.options || {}; ls.cuts = ls.cuts || []; openStudent(null, false, ls); })
        .catch(function (e) { show('home'); $('#lesson-list').innerHTML = ''; $('#lesson-list').appendChild(el('div', { class: 'notice bad', text: 'Lezione "' + slug + '" non trovata (' + e.message + ').' })); });
      return;
    }
    const id = q.get('id');
    if (id && S.lessons[id]) {
      const it = S.lessons[id];
      if (it.activity && !Array.isArray(it.exercises)) return q.get('mode') === 'student' ? openActPlay(id) : openActEditor(id);
      if (it.conv && !Array.isArray(it.exercises)) return openConvPrint(id);   // v115: il foglio A4 non ha una "modalità studente" separata da aprirlo e basta
      return q.get('mode') === 'student' ? openStudent(id) : openEditor(id);
    }
    renderHome();
    maybeTour();
  }
  window.VLApp = { carveAsk: carveAsk, overlay: overlay, overlayStep: overlayStep, overlayCancel: overlayCancel, S: S, generate: generate, openEditor: openEditor, openStudent: openStudent, renderHome: renderHome, newLesson: newLesson, cloud: CLOUD, runSync: runSync, openConvEditor: openConvEditor, openConvPrint: openConvPrint, renderTalk: renderTalk, renderVocabWarnings: renderVocabWarnings, inAd: inAd, printSolutions: printSolutions };
  init();
})();
