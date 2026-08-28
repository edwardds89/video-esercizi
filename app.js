/* app.js — interfaccia: lezioni, generazione bozza, editor, modalità studente */
(function () {
  'use strict';
  const L = window.VLLang, EX = window.VLEx, G = window.VLGen, AI = window.VLAI;
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
  function overlay(show, text) { $('#overlay').classList.toggle('show', !!show); if (text) $('#overlay-text').textContent = text; }
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
    return ls;
  }
  function loadState() {
    try { S.lessons = JSON.parse(localStorage.getItem('vle.lessons') || '{}') || {}; } catch (e) { S.lessons = {}; }
    Object.keys(S.lessons).forEach(function (id) { migrateLesson(S.lessons[id]); });
    try { Object.assign(S.settings, JSON.parse(localStorage.getItem('vle.settings') || '{}') || {}); } catch (e) { /* ignore */ }
  }
  function saveLessons() {
    // i campi che iniziano con "_" sono cache di sessione (candidati foto, lessico): non si salvano
    try { localStorage.setItem('vle.lessons', JSON.stringify(S.lessons, function (k, v) { return k.charAt(0) === '_' ? undefined : v; })); } catch (e) { toast('Impossibile salvare nel browser: ' + e.message); }
  }
  function saveSettings() { try { localStorage.setItem('vle.settings', JSON.stringify(S.settings)); } catch (e) { /* ignore */ } }
  const saveDebounced = (function () { let t; return function () { clearTimeout(t); t = setTimeout(function () { saveLessons(); const s = $('#e-saved'); if (s) { s.textContent = 'Salvato'; setTimeout(function () { s.textContent = ''; }, 1500); } }, 400); }; })();
  function current() { return S.lessons[S.currentId]; }
  function touch(lesson) { lesson.updatedAt = new Date().toISOString(); saveDebounced(); }
  // chiusura/ricarica della pagina: salva subito quello che il debounce non ha ancora scritto
  window.addEventListener('pagehide', function () { try { saveLessons(); } catch (e) { /* ignore */ } });

  function studentPayload(lesson) {
    const vb = lesson.vocab ? { support: lesson.vocab.support, cards: lesson.vocab.cards, words: (lesson.vocab.words || []).filter(function (w) { return w.selected && w.word; }).map(function (w) { return { id: w.id, word: w.word, translation: w.translation, image: w.image, selected: true, inExercise: w.inExercise }; }) } : undefined;
    return { v: 1, id: lesson.id, title: lesson.title, videoId: lesson.videoId, lang: lesson.lang, duration: lesson.duration,
      exercises: lesson.exercises, cuts: lesson.cuts, options: lesson.options, vocab: vb, lines: lesson.videoId === 'demo' ? lesson.lines : undefined };
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
  }
  document.addEventListener('click', function (e) {
    const b = e.target.closest('[data-view]');
    if (!b) return;
    const v = b.dataset.view;
    if (v === 'home') renderHome();
    else if (v === 'new') openNew();
  });

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
  }
  function renderHome() {
    show('home');
    renderBookmarklet();
    const list = $('#lesson-list');
    list.innerHTML = '';
    const items = Object.values(S.lessons).sort(function (a, b) { return (b.updatedAt || '').localeCompare(a.updatedAt || ''); });
    if (!items.length) { list.appendChild(el('p', { class: 'muted', text: 'Nessuna lezione ancora. Crea la prima con "Nuova lezione" (o con il pulsante per Chrome) oppure prova la demo.' })); return; }
    items.forEach(function (ls) {
      const eff = G.effectiveDuration(ls.cuts || [], ls.duration);
      const thumbStyle = ls.videoId && ls.videoId !== 'demo' ? 'background-image:url(https://i.ytimg.com/vi/' + ls.videoId + '/mqdefault.jpg)' : '';
      const open = function () { openStudent(ls.id); };
      const card = el('div', { class: 'lesson-card' },
        el('div', { class: 'thumb', style: thumbStyle, onclick: open, title: 'Apri la lezione' }, el('div', { class: 'play', text: '▶' })),
        el('div', { class: 'body' },
          el('div', { class: 'title', text: ls.title || '(senza titolo)', onclick: open }),
          el('div', { class: 'meta', text: (ls.exercises || []).length + ' esercizi · ' + fmtMin(eff) + (eff < ls.duration - 1 ? ' (video ' + fmtMin(ls.duration) + ')' : '') + (ls.ai && ls.ai.model ? ' · AI' : '') + (ls.updatedAt ? ' · ' + new Date(ls.updatedAt).toLocaleDateString('it-IT') : '') }),
          el('div', { class: 'actions' },
            el('button', { class: 'small primary', text: '▶ Apri', onclick: open }),
            el('button', { class: 'small', text: '✎ Modifica', onclick: function () { openEditor(ls.id); } }),
            el('button', { class: 'small', text: 'Esporta', onclick: function () { download(slugify(ls.title) + '.json', JSON.stringify(studentPayload(ls), null, 1)); } }),
            el('button', { class: 'small danger', text: 'Elimina', onclick: function () { if (confirm('Eliminare "' + ls.title + '"?')) { delete S.lessons[ls.id]; saveLessons(); renderHome(); } } }))));
      list.appendChild(card);
    });
  }
  $('#import-file').addEventListener('change', function (e) {
    const f = e.target.files[0]; if (!f) return;
    const r = new FileReader();
    r.onload = function () {
      try {
        const ls = JSON.parse(r.result);
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
  $('#btn-demo').addEventListener('click', function () {
    if (!window.VL_DEMO) return toast('Dati demo non trovati');
    const parsed = G.parseTranscript(window.VL_DEMO.transcript);
    const ls = newLesson({ title: window.VL_DEMO.title, videoId: 'demo', videoUrl: '', lang: 'it', level: 'B1', lines: parsed.lines, duration: window.VL_DEMO.duration, transcriptRaw: window.VL_DEMO.transcript });
    ls.params = { n: 8, target: 600, types: G.ALL_TYPES.slice(), range: 'smart', contextBefore: 25, ai: false, focus: '' };
    overlay(true, 'loading');
    setTimeout(function () {
      generate(ls, false).then(function () { overlay(false); openEditor(ls.id); });
    }, 50);
  });

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
      overlay(true, 'loading');
      const auto = p.n === 'auto' || !(p.n > 0);
      const nEff = auto ? G.autoCount(p.target && p.target > 0 ? Math.min(p.target, duration) : duration) : p.n;
      promise = AI.generateWithAI({ chunks: chunks, duration: duration, target: p.target, n: nEff, auto: auto, types: p.types, range: p.range, lang: ls.lang, level: ls.level, focus: p.focus, support: vocabState(ls).support, tricky: !!p.tricky, apiKey: S.settings.apiKey, model: S.settings.model })
        .then(function (r) {
          ls.ai = { model: r.ai.model, cost: r.ai.cost, usage: r.ai.usage, notes: r.notes, title: r.title, when: new Date().toISOString() };
          if (r.title && !ls.title) ls.title = r.title;
          return { exercises: r.exercises, cuts: r.cuts, stats: r.stats, warnings: r.warnings, vocab: r.vocab };
        })
        .catch(function (e) {
          warnings.push('AI non usata: ' + e.message + ' — bozza generata con le regole.');
          return null;
        });
    } else {
      if (useAI && !S.settings.apiKey) warnings.push('Nessuna chiave API salvata: bozza generata con le regole (Impostazioni AI per aggiungerla).');
      promise = Promise.resolve(null);
    }
    return promise.then(function (r) {
      if (!r) {
        const d = G.generateDraft({ chunks: chunks, lines: ls.lines, duration: duration, n: p.n, target: p.target, tolerance: p.tolerance, types: p.types, range: p.range, lang: ls.lang, contextBefore: p.contextBefore, seed: (Date.now() % 100000) + 1 });
        r = { exercises: d.exercises, cuts: d.cuts, stats: d.stats, warnings: d.stats.shortfall > Math.max(5, p.tolerance || 0) ? ['Durata target non raggiungibile senza tagliare gli esercizi: mancano ' + Math.round(d.stats.shortfall) + 's.'] : [] };
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
    h.textContent = t > 0 ? '≈ ' + G.autoCount(t) + ' esercizi per ' + fmtMin(t) + ' di video, dove c\'è una frase di senso compiuto' : '';
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
  $('#f-url').addEventListener('change', checkVideo);
  $('#f-url').addEventListener('paste', function () { setTimeout(checkVideo, 50); });
  function checkVideo() {
    const id = extractVideoId($('#f-url').value);
    const st = $('#f-video-status');
    if (!id) { st.textContent = 'Link non riconosciuto.'; N.videoId = null; return; }
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
    const st = $('#f-transcript-status');
    if (!p.lines.length) {
      const raw = $('#f-transcript').value.trim();
      // testo con tempi ma senza righe valide = quasi sempre l'elenco dei capitoli, non la trascrizione
      st.textContent = !raw ? '' : (/\d{1,2}:\d{2}/.test(raw) ? '⚠ Questo sembra l\'elenco dei CAPITOLI, non la trascrizione: su YouTube apri la descrizione → "Mostra trascrizione" e riprova (pulsante per Chrome o copia-incolla).' : '⚠ Non trovo i tempi (0:00, 0:03…): copia il testo dal pannello "Mostra trascrizione".');
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
        ? (/\d{1,2}:\d{2}/.test(raw) ? 'Il testo ricevuto sembra l\'elenco dei capitoli, non la trascrizione (i capitoli hanno tempi e titoli, ma non le frasi). Su YouTube apri la descrizione → "Mostra trascrizione", poi clicca di nuovo il pulsante per Chrome o copia il pannello a mano.' : 'La trascrizione incollata non ha i tempi (0:00, 0:07…): senza tempi il video non è utilizzabile. Copia il testo dal pannello "Mostra trascrizione" di YouTube.')
        : 'Manca la trascrizione: questo video non è utilizzabile finché non la incolli a mano (YouTube → Mostra trascrizione) o non usi il pulsante per Chrome. Se YouTube non la offre, scegli un altro video.');
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
    overlay(true, 'loading');
    generate(ls, ls.params.ai).then(function () { overlay(false); openEditor(ls.id); })
      .catch(function (e) { overlay(false); toast('Errore: ' + e.message); console.error(e); });
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
  function renderTimeline(container, lesson, o) {
    o = o || {};
    container.innerHTML = '';
    const D = lesson.duration || 1;
    const tm = o.collapseCuts ? timeMap(lesson) : null;
    const span = tm ? tm.V : D;
    const pos = function (t) { return 100 * Math.min(span, tm ? tm.toV(t) : t) / span; };
    const track = el('div', { class: 'track' });
    if (!tm) (lesson.cuts || []).forEach(function (c) {
      track.appendChild(el('div', { class: 'cut', style: 'left:' + (100 * c.start / D) + '%;width:' + (100 * (c.end - c.start) / D) + '%', title: 'Taglio ' + fmt(c.start) + '–' + fmt(c.end) + (c.reason ? ' (' + c.reason + ')' : '') }));
    });
    track.addEventListener('click', function (e) {
      if (!o.onSeek) return;
      const r = track.getBoundingClientRect();
      const v = span * (e.clientX - r.left) / r.width;
      o.onSeek(tm ? tm.toR(v) : v, e);
    });
    container.appendChild(track);
    (lesson.exercises || []).forEach(function (ex, i) {
      const r = o.results && o.results[ex.id];
      const m = el('div', { class: 'marker' + (o.done && o.done.has(ex.id) ? ' done' + (r ? (r.correct ? ' ok' : ' bad') : '') : '') + (o.activeId === ex.id ? ' active' : ''), text: String(i + 1), style: 'left:' + pos(ex.markerTime) + '%', title: fmt(tm ? tm.toV(ex.markerTime) : ex.markerTime) + ' · ' + EX.LABELS[ex.type] });
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
  function sortExercises(lesson) { lesson.exercises.sort(function (a, b) { return a.markerTime - b.markerTime; }); }

  // ---------- EDITOR ----------
  function openEditor(id) {
    S.currentId = id;
    const ls = current();
    if (!ls) return renderHome();
    show('editor');
    closePreview();
    $('#e-title').value = ls.title || '';
    $('#e-strict').checked = !!ls.options.strict;
    $('#e-fx').checked = ls.options.fx !== false;
    $('#e-lock').checked = !!ls.options.lock;
    $('#e-cover').checked = !!coverState(ls).on;
    createPlayer($('#e-player'), ls.videoId, { lesson: ls, onError: function (code) { toast(ytErrorText(code), 5000); } })
      .then(function () { startLoop(); renderCover($('#e-player'), ls); })
      .catch(function (e) { toast('Player non disponibile: ' + e.message, 6000); });
    renderEditorBody();
  }
  $('#e-title').addEventListener('change', function () { const ls = current(); if (ls) { ls.title = $('#e-title').value.trim(); touch(ls); } });
  $('#e-fx').addEventListener('change', function () { const ls = current(); if (ls) { ls.options.fx = $('#e-fx').checked; touch(ls); } });
  function lessonVocab(ls) {
    if (!ls._vocab) ls._vocab = G.vocabulary(ls.chunks || [], ls.lang);
    return ls._vocab;
  }
  $('#e-strict').addEventListener('change', function () { const ls = current(); if (ls) { ls.options.strict = $('#e-strict').checked; touch(ls); } });
  $('#e-lock').addEventListener('change', function () { const ls = current(); if (ls) { ls.options.lock = $('#e-lock').checked; touch(ls); } });
  $('#btn-student').addEventListener('click', function () { openStudent(S.currentId, true); });
  $('#btn-save').addEventListener('click', function () { const ls = current(); if (!ls) return; ls.title = $('#e-title').value.trim() || ls.title; ls.updatedAt = new Date().toISOString(); saveLessons(); toast('Salvato nel portfolio'); renderHome(); });
  $('#btn-export').addEventListener('click', function () { const ls = current(); download(slugify(ls.title) + '.json', JSON.stringify(studentPayload(ls), null, 1)); });
  $('#btn-delete').addEventListener('click', function () { const ls = current(); if (confirm('Eliminare "' + ls.title + '"?')) { delete S.lessons[ls.id]; saveLessons(); renderHome(); } });
  $('#btn-add-ex').addEventListener('click', function () {
    const ls = current(); const t = S.player ? S.player.time() : 0;
    showAddPopover(ls, t, null);
  });
  $('#btn-add-cut').addEventListener('click', function () {
    const ls = current(); const t = S.player ? S.player.time() : 0;
    ls.cuts.push({ start: Math.round(t * 10) / 10, end: Math.min(ls.duration, Math.round(t * 10) / 10 + 10), reason: 'manuale' });
    ls.cuts.sort(function (a, b) { return a.start - b.start; });
    touch(ls); renderEditorBody();
  });

  /** Se il player conosce la durata vera e la lezione ne aveva una stimata più corta, allinea (e allunga i tagli finali). */
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
    syncDuration(ls);
    const t = S.player.time();
    drawCursor($('#e-timeline'), t, ls.duration);
    const rp = S.editor.replay;
    if (rp) {
      // se il seek iniziale non è stato accettato (primo avvio del player YouTube), riprova una volta
      if (rp.start != null && t < rp.start - 1.5 && Date.now() - rp.at < 4000) { if (!rp.retried) { rp.retried = true; S.player.seek(rp.start); S.player.play(); } return; }
      if (t >= rp.end || S.player.state() === 0) { S.player.pause(); S.editor.replay = null; if (rp.redock && S.editor.previewId) dock('#e-stage', true); }
      return;
    }
    if ($('#e-skip').checked && S.player.state() === 1) {
      const c = G.inCut(ls.cuts, t);
      if (c && !ls.exercises.some(function (e) { return e.markerTime >= c.start && e.markerTime <= c.end; })) S.player.seek(c.end + 0.05);
    }
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
  function playSegment(seg) {
    if (!S.player) return;
    const ls = current();
    const redock = !!S.editor.previewId && !S.withText && $('#e-stage').classList.contains('docked');
    S.editor.replay = { start: seg.start, end: seg.end, at: Date.now(), retried: false, redock: redock };
    if (redock) dock('#e-stage', false);
    S.player.seek(seg.start);
    S.player.play();
  }

  function renderEditorBody() {
    const ls = current(); if (!ls) return;
    renderTimeline($('#e-timeline'), ls, { editable: true, onSeek: function (t, e) { if (S.player) S.player.seek(t); showAddPopover(ls, t, e); }, onMarker: function (ex) {
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
    warns.forEach(function (t) { w.appendChild(el('div', { class: 'notice warn', text: t })); });
    const an = $('#e-ai-notes'); an.innerHTML = '';
    if (ls.ai && ls.ai.model) {
      an.appendChild(el('div', { class: 'notice info', text: 'Bozza generata con ' + ls.ai.model + (ls.ai.cost != null ? ' · costo stimato ' + (ls.ai.cost * 100).toFixed(1) + ' cent' : '') + (ls.ai.notes ? ' · note del modello: ' + ls.ai.notes : '') }));
    }
    // anteprima aperta: aggiornala con i dati correnti
    if (S.editor.previewId) { const pe = ls.exercises.find(function (e) { return e.id === S.editor.previewId; }); if (pe) openPreview(ls, pe, false); }
    // parole utili
    renderVocabEditor(ls);
    // esercizi
    const box = $('#e-exercises'); box.innerHTML = '';
    if (!ls.exercises.length) box.appendChild(el('p', { class: 'muted', text: 'Nessun esercizio. Aggiungine uno dal tempo corrente o rigenera la bozza.' }));
    ls.exercises.forEach(function (ex, i) { box.appendChild(renderExerciseCard(ls, ex, i)); });
    // tagli
    const cb = $('#e-cuts'); cb.innerHTML = '';
    if (!ls.cuts.length) cb.appendChild(el('p', { class: 'muted', text: 'Nessun taglio: il video viene mostrato per intero.' }));
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
    $('#v-support').value = vb.support || 'en';
    $('#btn-vocab-ai').style.display = S.settings.apiKey ? '' : 'none';
    $('#btn-vocab-translate').style.display = S.settings.apiKey ? '' : 'none';
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
      row.appendChild(el('button', { class: 'small danger', text: '✕', title: 'Togli', onclick: function () { vb.words = vb.words.filter(function (x) { return x !== w; }); touch(ls); renderVocabEditor(ls); } }));
      table.appendChild(row);
    });
    box.appendChild(table);
    box.appendChild(el('div', { class: 'hint ready', text: readyText(ls) }));
  }
  /** Anteprima grande di una foto (la miniatura da 44 px non basta per giudicarla): riquadro fisso accanto all'elemento. */
  let previewBox = null;
  function showImgPreview(anchor, src, caption) {
    if (!previewBox) { previewBox = el('div', { class: 'img-preview' }); document.body.appendChild(previewBox); }
    const cur = previewBox.querySelector('img');
    if (!cur || cur.getAttribute('src') !== src) {
      previewBox.innerHTML = '';
      previewBox.appendChild(el('img', { src: src, alt: '', referrerpolicy: 'no-referrer' }));
      previewBox.appendChild(el('div', { class: 'cap', text: caption || '' }));
    } else previewBox.querySelector('.cap').textContent = caption || '';
    previewBox.classList.add('show');
    // a destra della miniatura se c'è spazio; altrimenti sotto (o sopra) la riga, mai sopra la riga stessa
    const r = anchor.getBoundingClientRect(), vw = window.innerWidth, vh = window.innerHeight, W = 392, H = 330;
    let left, top;
    if (r.right + 12 + W <= vw - 8) { left = r.right + 12; top = r.top - 24; }
    else { left = Math.max(8, Math.min(r.right - W, vw - W - 8)); top = (r.bottom + 8 + H <= vh - 8) ? r.bottom + 8 : r.top - H - 8; }
    if (top + H > vh - 8) top = vh - H - 8;
    if (top < 8) top = 8;
    previewBox.style.left = left + 'px'; previewBox.style.top = top + 'px';
  }
  function hideImgPreview() { if (previewBox) previewBox.classList.remove('show'); }
  function isPreviewShown() { return !!(previewBox && previewBox.classList.contains('show')); }
  function imgCaption(w) {
    const c = (w._imgs || [])[w._imgIdx];
    if (c && c.url === w.image) return (w._imgIdx + 1) + '/' + w._imgs.length + ' · ' + c.title + ' (' + c.source + ')';
    try { return new URL(w.image).hostname; } catch (e) { return ''; }
  }
  function readyText(ls) {
    const ready = cardVocab(ls).length;
    return selectedVocab(ls).length + ' selezionate, ' + ready + ' pronte per le schede (con traduzione o foto)' + (ready < 3 ? ' — ne servono almeno 3 per la scheda di abbinamento' : '');
  }
  function proposeVocabRules(ls) {
    const vb = vocabState(ls);
    const have = new Set(vb.words.map(function (w) { return L.normalize(w.word); }));
    const cands = G.vocabCandidates(ls.chunks || [], ls.exercises, { lang: ls.lang, n: 20, support: vb.support, level: ls.level }).filter(function (c) { return !have.has(L.normalize(c.word)); });
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
        const have = new Set(vb.words.map(function (w) { return L.normalize(w.word); }));
        let added = 0;
        r.vocab.forEach(function (v) { if (have.has(L.normalize(v.word))) return; vb.words.push({ id: uid(), word: v.word, translation: v.translation, image: '', selected: true, inExercise: v.inExercise, source: 'ai' }); added++; });
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
  $('#btn-vocab-add').addEventListener('click', function () { const ls = current(); if (!ls) return; vocabState(ls).words.push({ id: uid(), word: '', translation: '', image: '', selected: true, inExercise: false, source: 'manual' }); touch(ls); renderVocabEditor(ls); const rows = $$('#e-vocab .vocab-row'); const last = rows[rows.length - 1]; if (last) last.querySelector('.v-word').focus(); });
  $('#v-matching').addEventListener('change', function () { const ls = current(); if (ls) { vocabState(ls).cards.matching = $('#v-matching').checked; touch(ls); } });
  $('#v-flash').addEventListener('change', function () { const ls = current(); if (ls) { vocabState(ls).cards.flashcards = $('#v-flash').checked; touch(ls); } });
  $('#v-write').addEventListener('change', function () { const ls = current(); if (ls) { vocabState(ls).cards.write = $('#v-write').checked; touch(ls); } });
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

  function rebuildExercise(ls, ex, type, choices, seed) {
    const built = EX.buildExercise(type, ex.sentence, { lang: ls.lang, seed: seed || (Date.now() % 100000), choices: choices || null, vocab: lessonVocab(ls), distractors: ex.noDistractors ? 0 : 2 });
    if (!built) return false;
    ex.type = built.type; ex.data = built.data;
    return true;
  }

  function renderExerciseCard(ls, ex, i) {
    const card = el('div', { class: 'ex-card ' + (ex.source || 'rules'), id: 'ex-' + ex.id });
    const typeSel = el('select', { style: 'width:auto', title: 'Tipo di esercizio' });
    G.ALL_TYPES.forEach(function (t) { typeSel.appendChild(el('option', { value: t, text: EX.LABELS[t], selected: t === ex.type ? 'selected' : null })); });
    typeSel.addEventListener('change', function () {
      const newType = typeSel.value;
      const r = G.resolveRange('smart', newType);
      const wc = L.words(ex.sentence || '').length;
      // se la frase attuale non è della lunghezza giusta per il nuovo tipo (o il tipo non è applicabile), si cerca una frase adatta vicino allo stesso punto
      const fits = wc >= r[0] - 4 && wc <= r[1] + 4;
      if (fits && rebuildExercise(ls, ex, newType)) { touch(ls); renderEditorBody(); return; }
      if (newType === 'mc') { ex.type = 'mc'; ex.data = { question: '', options: ['', '', '', ''], correct: 0, tricky: null }; touch(ls); renderEditorBody(); autoMC(ls, ex); return; }
      const used = usedChunkIds(ls, ex);
      const near = G.passagesNear(ls.chunks || [], ex.markerTime, { exclude: used, type: newType, lang: ls.lang, window: 90, range: 'smart' }).filter(function (p) { return !p.cta; });
      const complete = near.filter(function (p) { return p.startsSentence && p.endsSentence; });
      const best = (complete.length ? complete : near)[0];
      if (!best) { toast('Nessuna frase adatta a "' + EX.LABELS[newType] + '" vicino a questo punto'); typeSel.value = ex.type; return; }
      ex.type = newType; ex.range = 'smart';
      applyCandidate(ls, ex, best);
      toast('Frase adattata al tipo scelto (' + best.wordCount + ' parole)');
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
    const alignMarker = function () { ex.markerTime = Math.round((ex.segment.end + 0.1) * 10) / 10; };
    const timesRow = el('div', { class: 'head' },
      el('span', { class: 'num', text: String(i + 1) }),
      el('span', { class: 'hint', text: 'frase da' }),
      timeInput(ex.segment.start, function (t) { ex.segment.start = t; touch(ls); renderEditorBody(); }, ex.id + ':start'),
      el('span', { class: 'hint', text: 'a' }),
      timeInput(ex.segment.end, function (t) { const wasAligned = Math.abs(ex.markerTime - ex.segment.end) < 0.6; ex.segment.end = t; if (wasAligned || ex.markerTime < t) alignMarker(); sortExercises(ls); touch(ls); renderEditorBody(); }, ex.id + ':end'),
      el('button', { class: 'small play', text: '▶', title: 'Ascolta esattamente da inizio a fine: parte da "frase da" e si ferma da solo ad "a"', onclick: function () { playSegment(ex.segment); } }),
      el('button', { class: 'small play', text: '▶ -3s', title: 'Ascolta solo gli ultimi 3 secondi: per controllare dove finisce il taglio', onclick: function () { playSegment({ start: Math.max(ex.segment.start, ex.segment.end - 3), end: ex.segment.end }); } }),
      el('span', { class: 'hint', text: '· il video si ferma a' }),
      timeInput(ex.markerTime, function (t) { ex.markerTime = t; sortExercises(ls); touch(ls); renderEditorBody(); }, ex.id + ':marker'),
      el('button', { class: 'small', text: '= fine frase', title: 'Ferma il video subito dopo la fine della frase', onclick: function () { alignMarker(); sortExercises(ls); touch(ls); renderEditorBody(); } }),
      el('button', { class: 'small', text: 'Inizio = ora', title: 'Usa il tempo corrente del player come inizio della frase', onclick: function () { if (S.player) { ex.segment.start = Math.round(S.player.time() * 10) / 10; touch(ls); renderEditorBody(); } } }),
      el('button', { class: 'small', text: 'Fine = ora', title: 'Usa il tempo corrente del player come fine della frase', onclick: function () { if (S.player) { ex.segment.end = Math.round(S.player.time() * 10) / 10; alignMarker(); sortExercises(ls); touch(ls); renderEditorBody(); } } })
    );
    card.appendChild(timesRow);
    const head = el('div', { class: 'head', style: 'margin-top:6px' },
      typeSel,
      rangeSel,
      el('button', { class: 'small', text: '👁 Anteprima', title: 'Mostra l\'esercizio come lo vedrà lo studente e riproduce la frase', onclick: function () { openPreview(ls, ex, true); $('#e-stage').scrollIntoView({ behavior: 'smooth', block: 'nearest' }); } }),
      el('button', { class: 'small', text: '▶ Ascolta', onclick: function () { playSegment(ex.segment); } }),
      el('button', { class: 'small', text: '↻ Altra frase', onclick: function () { altSentence(ls, ex); } }),
      el('button', { class: 'small', text: '⟳ Rigenera', onclick: function () { rebuildExercise(ls, ex, ex.type); touch(ls); renderEditorBody(); } }),
      el('span', { class: 'badge ' + (ex.source === 'ai' ? 'ai' : ''), text: ex.source === 'ai' ? 'AI' : 'regole' }),
      typeCountBadge(ls, ex),
      el('button', { class: 'small right', text: '💾 Salva', title: 'Salva subito le modifiche di questo esercizio', onclick: function (e) { saveLessons(); e.target.textContent = '✓ Salvato'; setTimeout(function () { e.target.textContent = '💾 Salva'; }, 1500); } }),
      el('button', { class: 'small danger', text: 'Elimina', onclick: function () { ls.exercises = ls.exercises.filter(function (x) { return x !== ex; }); touch(ls); renderEditorBody(); } })
    );
    card.appendChild(head);
    card.appendChild(el('div', { class: 'row', style: 'margin-top:6px' }, el('span', { class: 'hint', text: 'Helper:' }), helperSel));
    if (ex.note) card.appendChild(el('div', { class: 'hint', text: 'Perché: ' + ex.note }));
    const ta = el('textarea', { class: 'sentence-edit', style: 'min-height:56px;margin-top:8px', title: 'Se togli o aggiungi parole all\'inizio o alla fine, inizio e fine vengono ricalcolati sulle parole' }); ta.value = ex.sentence;
    ta.addEventListener('change', function () {
      const oldWords = L.words(ex.sentence).join(' ');
      ex.sentence = ta.value.trim();
      if (L.words(ex.sentence).join(' ') !== oldWords) {
        // parole cambiate: inizio e fine si ricalcolano sulle parole ritrovate nella trascrizione (se solo la punteggiatura cambia, i tempi restano)
        const rt = retimeSentence(ls, ex);
        if (rt) {
          const wasAligned = Math.abs(ex.markerTime - ex.segment.end) < 0.6;
          ex.segment = { start: Math.max(0, Math.round((rt.start - 0.2) * 10) / 10), end: Math.round((rt.end + 0.35) * 10) / 10 };
          if (wasAligned || ex.markerTime < ex.segment.end) ex.markerTime = Math.round((ex.segment.end + 0.1) * 10) / 10;
          sortExercises(ls);
          toast('Tempi ricalcolati sulle parole: ' + fmt(ex.segment.start) + ' → ' + fmt(ex.segment.end) + (rt.partial ? ' (solo prima e ultima parola ritrovate)' : ''), 3500);
        } else toast('Frase non ritrovata nella trascrizione: tempi lasciati com\'erano', 3500);
      }
      if (!rebuildExercise(ls, ex, ex.type, ex.type === 'mc' ? ex.data : null)) toast('Frase troppo corta per questo tipo');
      touch(ls); renderEditorBody();
    });
    card.appendChild(el('label', { text: 'Frase (quello che lo studente sente)' }));
    card.appendChild(ta);
    card.appendChild(renderTypeEditor(ls, ex));
    card.appendChild(el('div', { class: 'preview', html: '<span class="hint">Lo studente vede: </span>' + previewText(ex) }));
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
      const cb = el('input', { type: 'checkbox' }); cb.checked = !ex.noDistractors;
      cb.addEventListener('change', function () { ex.noDistractors = !cb.checked; rebuildExercise(ls, ex, 'gapbank', { gapWords: d.answers }); touch(ls); renderEditorBody(); });
      wrap.appendChild(el('div', { class: 'row' }, el('label', { class: 'chip', style: 'margin:0' }, cb, ' Aggiungi parole sbagliate nella lista (distrattori)')));
      if (!ex.noDistractors) {
        // distrattori modificabili: simili alle risposte (stessa desinenza/lunghezza), non a caso
        const row = el('div', { class: 'row', style: 'margin-top:4px' }, el('span', { class: 'hint', text: 'Parole sbagliate:' }));
        const setBank = function () { d.wordBank = EX.shuffle(d.answers.concat(d.distractors || []), L.rng(Date.now() % 10000)); touch(ls); renderEditorBody(); };
        (d.distractors || []).forEach(function (w, k) {
          const inp = el('input', { type: 'text', class: 'short', value: w, title: 'Modifica la parola sbagliata' });
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
    const bo = { lang: ls.lang, seed: Date.now() % 1000, source: 'rules', range: ex.range, vocab: lessonVocab(ls), distractors: ex.noDistractors ? 0 : 2 };
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

  function renderCutRow(ls, c, i) {
    return el('div', { class: 'cut-row' },
      timeInput(c.start, function (t) { c.start = t; touch(ls); renderEditorBody(); }),
      timeInput(c.end, function (t) { c.end = t; touch(ls); renderEditorBody(); }),
      el('span', { class: 'hint', text: fmtMin(c.end - c.start) + ' · ' + (c.reason || '') + (c.source === 'ai' ? ' (AI)' : '') }),
      el('button', { class: 'small', text: '▶ Anteprima', title: 'Riproduce da 3 secondi prima del taglio', onclick: function () { if (S.player) { S.editor.replay = null; S.player.seek(Math.max(0, c.start - 3)); S.player.play(); } } }),
      el('button', { class: 'small danger', text: 'Rimuovi', onclick: function () { ls.cuts.splice(i, 1); touch(ls); renderEditorBody(); } })
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
    overlay(true, 'loading');
    generate(ls, ls.params.ai).then(function () { overlay(false); renderEditorBody(); toast('Bozza rigenerata'); })
      .catch(function (e) { overlay(false); toast('Errore: ' + e.message); });
  });

  // condivisione
  $('#btn-share').addEventListener('click', function () {
    const ls = current();
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
  });
  $('#share-close').addEventListener('click', function () { $('#dlg-share').close(); });

  // impostazioni
  $('#btn-settings').addEventListener('click', function () {
    $('#set-key').value = S.settings.apiKey || '';
    $('#set-model').value = S.settings.model || AI.DEFAULT_MODEL;
    $('#set-status').textContent = '';
    $('#dlg-settings').showModal();
  });
  $('#set-close').addEventListener('click', function () { $('#dlg-settings').close(); });
  $('#set-save').addEventListener('click', function () {
    S.settings.apiKey = $('#set-key').value.trim(); S.settings.model = $('#set-model').value; saveSettings();
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
    S.student = { lesson: ls, done: new Set(), results: {}, blocked: false, replay: null, activeId: null, started: false, ended: false, attempts: {}, hints: {}, lock: !!(ls.options && ls.options.lock), phase: 'start', stars: loadStars(ls) };
    show('student');
    $('#s-stage').classList.remove('cards');
    $('#s-title').textContent = ls.title || '';
    $('#btn-edit').style.display = (!S.standalone && S.lessons[ls.id]) ? '' : 'none';
    $('#s-lock').checked = S.student.lock;
    $('#s-lock-label').style.display = S.standalone ? 'none' : '';
    $('#s-cover').checked = !!coverState(ls).on;
    $('#s-cover-label').style.display = S.standalone ? 'none' : '';
    updateStarCount();
    renderStudentTimeline();
    renderProgress();
    $('#s-yt').checked = !!S.settings.ytControls;
    createPlayer($('#s-player'), ls.videoId, { lesson: ls, controls: !!S.settings.ytControls, onError: function (code) { toast(ytErrorText(code), 6000); }, onState: function (st) { if (st === 0) onEnded(); } })
      .then(function () { startLoop(); renderStart(); renderCover($('#s-player'), ls); })
      .catch(function (e) { $('#s-panel').innerHTML = ''; $('#s-panel').appendChild(el('div', { class: 'notice bad', text: e.message })); });
  }
  // comandi di YouTube nel video: spenti di default (la barra rossa non ricompare a ogni ripartenza); il cambio ricrea il player allo stesso secondo
  $('#s-yt').addEventListener('change', function () {
    S.settings.ytControls = $('#s-yt').checked; saveSettings();
    const st = S.student; if (!st || !S.player) return;
    const ls = st.lesson, t = S.player.time(), playing = S.player.state() === 1;
    st.lastT = null;
    createPlayer($('#s-player'), ls.videoId, { lesson: ls, controls: !!S.settings.ytControls, start: t, onError: function (code) { toast(ytErrorText(code), 6000); }, onState: function (x) { if (x === 0) onEnded(); } })
      .then(function (w) { renderCover($('#s-player'), ls); if (t > 0) w.seek(t); if (playing) w.play(); else w.pause(); st.lastT = null; });
  });
  $('#btn-edit').addEventListener('click', function () { if (S.player) S.player.pause(); openEditor(S.currentId); });
  $('#s-lock').addEventListener('change', function () { if (S.student) S.student.lock = $('#s-lock').checked; });
  $('#btn-fullscreen').addEventListener('click', function () {
    const w = $('#s-wrap');
    if (document.fullscreenElement) { document.exitFullscreen(); return; }
    if (w.requestFullscreen) w.requestFullscreen().catch(function () { toast('Schermo intero non disponibile in questo browser'); });
    else if (w.webkitRequestFullscreen) w.webkitRequestFullscreen();
    else toast('Schermo intero non disponibile in questo browser');
  });
  document.addEventListener('fullscreenchange', function () { $('#btn-fullscreen').textContent = document.fullscreenElement ? '✕ Esci da schermo intero' : '⛶ Schermo intero'; });

  /** Linea del tempo dello studente: clic sulla barra = vai lì; clic su un numero = ascolta la frase e apri quell'esercizio. */
  function renderStudentTimeline() {
    const st = S.student; if (!st) return;
    renderTimeline($('#s-timeline'), st.lesson, {
      done: st.done, results: st.results, activeId: st.activeId, collapseCuts: true,   // lo studente non vede i tagli: la barra è il video che resta
      onSeek: function (t) { if (S.player) S.player.seek(t); },
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
    $('#s-panel').innerHTML = '';
    $('#s-stage').classList.remove('cards');
    dock('#s-stage', false);
    const c = G.inCut(ls.cuts, S.player.time());
    if (c && !ls.exercises.some(function (e) { return !st.done.has(e.id) && e.markerTime >= c.start && e.markerTime <= c.end; })) S.player.seek(c.end + 0.05);
    S.player.play();
  }
  $('#btn-start').addEventListener('click', beginLesson);
  /** "Inizia": prima le schede delle parole utili (se ci sono), poi il video. */
  function beginLesson() {
    const st = S.student; if (!st || !S.player) return;
    const cards = cardsFor(st.lesson);
    if (!cards.length) return startPlayback();
    st.phase = 'cards'; st.cardIdx = 0; st.cards = cards;
    $('#btn-start').style.display = 'none';
    S.player.pause();
    dock('#s-stage', true);
    $('#s-stage').classList.add('cards');
    renderVocabCard();
  }
  function studentTick() {
    const st = S.student; if (!st || !S.player) return;
    const ls = st.lesson;
    if (!st.started) syncDuration(ls);
    const t = S.player.time();
    drawCursor($('#s-timeline'), t, ls.duration);
    if (st.replay) {
      const rp = st.replay;
      if (rp.start != null && t < rp.start - 1.5 && Date.now() - rp.at < 4000) { if (!rp.retried) { rp.retried = true; S.player.seek(rp.start); S.player.play(); } return; }
      if (t >= rp.end || S.player.state() === 0) { S.player.pause(); st.replay = null; if (rp.redock) dock('#s-stage', true); }
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
    const next = natural ? ls.exercises.find(function (e) { return (!st.done.has(e.id) || e.id === st.redo) && exerciseReady(e) && t >= e.markerTime - 0.1 && prev < e.markerTime - 0.1; }) : null;
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
        onDone: function (correct) { finishExercise(next, correct); },
        onContinue: continueVideo,
        onSkip: function () { finishExercise(next, false); continueVideo(); }
      });
      return;
    }
    if (S.player.state() === 1) {
      const c = G.inCut(ls.cuts, t);
      if (c) {
        // dentro un taglio: si salta alla fine; se nel taglio cade un esercizio ancora da fare (tagli e frasi si sovrappongono
        // per una modifica a mano) si salta solo fino all'inizio della sua frase, così la frase si sente e il resto no
        const inside = ls.exercises.filter(function (e) { return (!st.done.has(e.id) || e.id === st.redo) && e.markerTime > t && e.markerTime <= c.end + 0.5; })
          .sort(function (a, b) { return a.markerTime - b.markerTime; })[0];
        const target = inside ? Math.max(t, Math.min(c.end, inside.segment.start - 0.3)) : c.end + 0.05;
        if (target > t + 0.25) { S.player.seek(target); st.lastT = null; }
      }
    }
    if (S.player.kind === 'mock' && S.player.state() === 0 && !st.ended) onEnded();
  }
  function onEnded() {
    const st = S.student; if (!st || st.ended || st.blocked) return;
    st.ended = true;
    renderSummary();
  }
  function replaySegment(ex) {
    const st = S.student;
    st.replay = { start: ex.segment.start, end: ex.segment.end, at: Date.now(), retried: false, redock: false };
    // di default durante il riascolto la frase sparisce e il video torna grande: ci si concentra sull'ascolto
    if (!S.withText && $('#s-stage').classList.contains('docked')) { st.replay.redock = true; dock('#s-stage', false); }
    S.player.seek(ex.segment.start);
    S.player.play();
  }
  function finishExercise(ex, correct) {
    const st = S.student;
    if (st.results[ex.id]) return;   // il risultato è definitivo: si può riascoltare, non rifare
    st.results[ex.id] = { correct: correct, attempts: st.attempts[ex.id] || 1, hints: st.hints[ex.id] || 0 };
    st.done.add(ex.id);
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
    const h = el('h3', { class: 'ex-title' }, [
      preview ? el('span', { class: 'muted', text: 'Anteprima · ' }) : null,
      document.createTextNode(paren === -1 ? label : label.slice(0, paren)),
      paren === -1 ? null : el('span', { class: 'sub', text: ' ' + label.slice(paren + 1) })
    ]);
    // in alto solo "N di M" (e in anteprima il pulsante di chiusura); il titolo del tipo sta sopra la consegna, con un'animazione che attira l'occhio
    p.appendChild(el('div', { class: 'row ex-head' },
      el('span', { class: 'badge right', text: (opts.index + 1) + ' di ' + opts.total }),
      preview ? el('button', { class: 'small', text: '✕ Chiudi anteprima', onclick: function () { if (opts.onClose) opts.onClose(); } }) : null));
    h.classList.add('ex-type-title');
    p.appendChild(h);
    p.appendChild(el('div', { class: 'instr', text: EX.INSTRUCTIONS[ex.type] }));
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
    const hintBtn = el('button', { class: 'small hint-btn', text: '💡 Aiuto', title: 'Un aiuto alla volta: una lettera in più della risposta (o un pezzo della soluzione)' });
    const solBtn = el('button', { class: 'link', text: 'Mostra soluzione', style: 'display:none' });
    const skipBtn = el('button', { class: 'link', text: 'Salta', style: preview ? 'display:none' : '' });
    actions.appendChild(replayBtn); actions.appendChild(withTextLbl); actions.appendChild(checkBtn); actions.appendChild(hintBtn); actions.appendChild(solBtn); actions.appendChild(skipBtn);
    if (S.settings.apiKey) {
      // traduzione con l'AI (inglese britannico): tutta la frase, oppure solo le parole selezionate col mouse
      const trBtn = el('button', { class: 'small', text: '🌐 Traduci', title: 'Traduzione in inglese britannico: seleziona alcune parole per tradurre solo quelle, altrimenti tutta la frase' });
      const trBox = el('div', { class: 'translation', style: 'display:none' });
      trBtn.addEventListener('click', function () {
        const sel = String(window.getSelection ? window.getSelection().toString() : '').trim();
        const partial = sel && sel.length < ex.sentence.length && ex.sentence.toLowerCase().indexOf(sel.toLowerCase().slice(0, 30)) !== -1;
        trBtn.disabled = true; trBtn.textContent = '… traduco';
        AI.translateSentence({ text: partial ? sel : ex.sentence, whole: !partial, sentence: ex.sentence, lang: ls.lang, context: '', apiKey: S.settings.apiKey, model: S.settings.model })
          .then(function (r) { trBox.style.display = ''; trBox.innerHTML = ''; trBox.appendChild(el('span', { class: 'hint', text: (partial ? '"' + sel + '" → ' : 'Traduzione: ') })); trBox.appendChild(el('b', { text: r.translation })); })
          .catch(function (e) { toast('AI: ' + e.message, 6000); })
          .then(function () { trBtn.disabled = false; trBtn.textContent = '🌐 Traduci'; });
      });
      actions.appendChild(trBtn);
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
      const ins = p.querySelector('.instr'); if (ins) ins.textContent = 'Esercizio già fatto' + (rv.correct ? ': giusto. ' : ': da rivedere. ') + 'Puoi riascoltare la frase, ma la risposta non si cambia. Clicca una parola per la stella ★.';
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
      inp.focus();
      try { inp.setSelectionRange(inp.value.length, inp.value.length); } catch (e) { /* ignore */ }
      return true;
    };

    if (ex.type === 'gap' || ex.type === 'gapbank') {
      const sent = el('div', { class: 'sentence' });
      const inputs = [];
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
        const width = Math.min(11 * run.indices.length, 34);
        const inp = el('input', { type: 'text', class: 'gap', autocomplete: 'off', autocapitalize: 'off', spellcheck: 'false', style: 'width:' + width + 'ch', 'data-words': String(run.indices.length) });
        inp.addEventListener('keydown', function (e) { if (e.key === 'Enter') checkBtn.click(); });
        inputs.push(inp); sent.appendChild(inp);
        sent.appendChild(document.createTextNode((lastTok.post || '') + ' '));
      });
      body.appendChild(sent);
      if (ex.type === 'gapbank' && d.wordBank && d.wordBank.length) {
        body.appendChild(el('div', { class: 'chips' }, d.wordBank.map(function (w) { return el('span', { class: 'chip', text: w, onclick: function () {
          // riempie il primo spazio non completo (uno spazio unito accoglie più parole)
          const target = inputs.find(function (inp) { return inp.value.trim().split(/\s+/).filter(Boolean).length < parseInt(inp.getAttribute('data-words'), 10); });
          if (target) { target.value = (target.value.trim() + ' ' + w).trim(); target.focus(); }
        } }); })));
      }
      getAnswer = function () { return inputs.map(function (i) { return i.value; }); };
      giveHint = function () {
        // uno spazio unito = una risposta di più parole (runs), non la k-esima parola singola
        const k = inputs.findIndex(function (inp, i) { return !sameWord(inp.value, runs[i].answer); });
        if (k === -1) return false;
        return revealLetter(inputs[k], runs[k].answer);
      };
      markResult = function (res) {
        inputs.forEach(function (inp, k) { inp.classList.toggle('ok', !!res.detail[k]); inp.classList.toggle('bad', !res.detail[k]); });
        if (res.correct) {
          sent.style.color = 'var(--ok)';
          // le caselle lasciano il posto alle parole scritte, evidenziate e cliccabili per la stella: la frase sopra basta
          inputs.forEach(function (inp) { const wrap = el('span', { class: 'filled' }); wrap.appendChild(starSpans(ls, inp.value.trim())); inp.replaceWith(wrap); });
          const bank = body.querySelector('.chips'); if (bank) bank.remove();
        }
      };
      if (!preview) setTimeout(function () { if (inputs[0]) inputs[0].focus(); }, 50);   // in anteprima il fuoco resta all'editor
    } else if (ex.type === 'scramble') {
      const pool = el('div', { class: 'chips' });
      const ans = el('div', { class: 'answer-row chips' });
      const chosen = [];
      const render = function () {
        pool.innerHTML = ''; ans.innerHTML = '';
        d.shuffled.forEach(function (w, i) {
          if (chosen.indexOf(i) !== -1) return;
          pool.appendChild(el('span', { class: 'chip', text: w, onclick: function () { chosen.push(i); render(); } }));
        });
        chosen.forEach(function (i, k) {
          const c = el('span', { class: 'chip sel', text: d.shuffled[i], 'data-i': String(i), title: 'Trascina per spostare, tocca per togliere' });
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
            const order = $$('.chip', ans).filter(function (x) { return x !== c; }).map(function (x) { return x === ph ? i : parseInt(x.getAttribute('data-i'), 10); });
            chosen.length = 0; order.forEach(function (x) { chosen.push(x); });
            render();
          };
          c.addEventListener('pointerup', finish);
          c.addEventListener('pointercancel', function () { active = false; dragging = false; render(); });
          ans.appendChild(c);
        });
        if (!chosen.length) ans.appendChild(el('span', { class: 'hint', text: 'Tocca le parole qui sotto nell\'ordine giusto (poi puoi trascinarle per spostarle)' }));
      };
      render();
      body.appendChild(ans); body.appendChild(pool);
      getAnswer = function () { return chosen.map(function (i) { return d.shuffled[i]; }); };
      giveHint = function () {
        // si tiene l'inizio giusto e si mette al suo posto la parola successiva
        let ok = 0;
        while (ok < chosen.length && ok < d.words.length && sameWord(d.shuffled[chosen[ok]], d.words[ok])) ok++;
        if (ok >= d.words.length) return false;
        chosen.length = ok;
        const idx = d.shuffled.findIndex(function (w, i) { return chosen.indexOf(i) === -1 && sameWord(w, d.words[ok]); });
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
      body.appendChild(starredSentence(ls, d.tokens.filter(function (t, i) { return i !== d.missingIndex; })));
      const inp = el('input', { type: 'text', placeholder: 'Parola mancante', autocomplete: 'off', autocapitalize: 'off', style: 'margin-top:10px;max-width:16em' });
      inp.addEventListener('keydown', function (e) { if (e.key === 'Enter') checkBtn.click(); });
      body.appendChild(inp);
      getAnswer = function () { return inp.value; };
      giveHint = function () { return sameWord(inp.value, d.answer) ? false : revealLetter(inp, d.answer); };
      markResult = function (res) {
        inp.classList.toggle('ok', res.correct); inp.classList.toggle('bad', !res.correct);
        if (res.correct) {
          inp.remove();   // la parola è già nella frase sopra, evidenziata: il campo non serve più
          const sdiv = body.querySelector('.sentence');
          if (sdiv) {
            sdiv.style.color = 'var(--ok)';
            // la parola mancante entra nella frase con un'animazione che sposta il resto per farle spazio
            if (!sdiv.querySelector('.insert-in')) {
              const spans = $$('.w', sdiv);
              const ins = starSpan(ls, d.tokens[d.missingIndex]);
              ins.classList.add('insert-in');
              const at = spans[d.missingIndex];
              if (at) { sdiv.insertBefore(ins, at); sdiv.insertBefore(document.createTextNode(' '), at); }
              else { sdiv.appendChild(document.createTextNode(' ')); sdiv.appendChild(ins); }
            }
          }
        }
      };
      if (!preview) setTimeout(function () { inp.focus(); }, 50);
    } else if (ex.type === 'mc') {
      let selected = -1;
      body.appendChild(el('div', { class: 'sentence question', text: d.question || '' }));
      const list = el('div', { class: 'mc-options' });
      const render = function () {
        list.innerHTML = '';
        (d.options || []).forEach(function (o, k) {
          if (!o) return;
          list.appendChild(el('button', { class: 'mc-opt' + (k === selected ? ' sel' : ''), text: String.fromCharCode(65 + k) + '. ' + o, onclick: function () { selected = k; render(); } }));
        });
      };
      render();
      body.appendChild(list);
      getAnswer = function () { return selected; };
      const eliminated = new Set();
      giveHint = function () {
        const cands = (d.options || []).map(function (o, k) { return k; }).filter(function (k) { return d.options[k] && k !== d.correct && !eliminated.has(k); });
        if (cands.length <= 1) return false;   // resta sempre almeno una sbagliata
        const pick = cands.filter(function (k) { return k !== d.tricky; })[0] != null ? cands.filter(function (k) { return k !== d.tricky; })[0] : cands[0];
        eliminated.add(pick); if (selected === pick) selected = -1; render();
        return true;
      };
      const renderBase = render;
      const renderElim = function () { renderBase(); $$('.mc-opt', list).forEach(function (b, k) { if (eliminated.has(k)) { b.classList.add('elim'); b.disabled = true; } }); };
      list.innerHTML = ''; renderElim();
      markResult = function (res) {
        $$('.mc-opt', list).forEach(function (b, k) { if (res.correct && k === d.correct) b.classList.add('good'); else if (k === selected && !res.correct) { b.classList.add('wrongpick'); setTimeout(function () { b.classList.remove('wrongpick'); }, 900); } });
      };
    } else if (ex.type === 'extra' || ex.type === 'wrong') {
      let selected = -1;
      const chips = el('div', { class: 'chips' });
      const corr = el('input', { type: 'text', placeholder: 'Scrivi la parola giusta', autocomplete: 'off', autocapitalize: 'off', style: 'margin-top:10px;max-width:16em;display:none' });
      corr.addEventListener('keydown', function (e) { if (e.key === 'Enter') checkBtn.click(); });
      const render = function () {
        chips.innerHTML = '';
        d.shown.forEach(function (w, i) {
          chips.appendChild(el('span', { class: 'chip' + (i === selected ? ' sel' : ''), text: w, onclick: function () { selected = i; render(); if (ex.type === 'wrong') { corr.style.display = ''; corr.focus(); } } }));
        });
      };
      render();
      body.appendChild(chips);
      if (ex.type === 'wrong') body.appendChild(corr);
      getAnswer = function () { return ex.type === 'extra' ? selected : { index: selected, correction: corr.value }; };
      const dimmed = new Set();
      giveHint = function () {
        const target = ex.type === 'extra' ? d.extraIndex : d.wrongIndex;
        if (ex.type === 'wrong' && selected === target) return sameWord(corr.value, d.answer) ? false : revealLetter(corr, d.answer);
        // si sbiadiscono alcune parole sicuramente giuste (un terzo alla volta); l'ultimo aiuto lascia solo quella da trovare
        const rest = d.shown.map(function (w, i) { return i; }).filter(function (i) { return i !== target && !dimmed.has(i); });
        if (!rest.length) { if (ex.type === 'wrong') { selected = target; render(); corr.style.display = ''; corr.focus(); return true; } return false; }
        const n = Math.max(1, Math.ceil(d.shown.length / 3));
        EX.shuffle(rest, L.rng(Date.now() % 7919)).slice(0, n).forEach(function (i) { dimmed.add(i); });
        render();
        return true;
      };
      const renderBase2 = render;
      const renderDim = function () { renderBase2(); $$('.chip', chips).forEach(function (c, i) { if (dimmed.has(i)) c.classList.add('dim'); }); };
      chips.innerHTML = ''; renderDim();
      markResult = function (res) {
        const all = $$('.chip', chips);
        const c = all[selected];
        if (res.correct) {
          // tutte verdi tranne la parola in più / sbagliata: rossa e barrata (per "sbagliata" accanto compare quella giusta)
          all.forEach(function (x, i) {
            x.classList.remove('sel');
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
      const wrap = el('div', { class: 'fullwrap' }, [el('span', { class: 'hint', text: 'Frase completa (clicca una parola per la stella ★): ' }), starredSentence(ls, toks)]);
      body.appendChild(wrap);
    };
    checkBtn.addEventListener('click', function () {
      if (solved) return;
      const a = getAnswer();
      if (a == null || a === '' || a === -1 || (Array.isArray(a) && !a.length) || (typeof a === 'object' && !Array.isArray(a) && a.index === -1)) { fb.textContent = 'Prima rispondi.'; fb.style.color = 'var(--muted)'; return; }
      attempts[ex.id] = (attempts[ex.id] || 0) + 1;
      const res = EX.check(ex, a, { strict: strict });
      markResult(res);
      if (res.correct) {
        solved = true;
        fb.textContent = '✓ Giusto!'; fb.style.color = 'var(--ok)';
        if (!ls.options || ls.options.fx !== false) celebrate(p, fb);
        if (opts.onDone) opts.onDone(true);
        checkBtn.style.display = 'none'; hintBtn.style.display = 'none'; solBtn.style.display = 'none'; skipBtn.style.display = 'none';
        actions.appendChild(el('button', { class: 'primary', text: continueLabel, onclick: onContinue }));
        // la frase completa in più solo se sopra non c'è (scelta multipla); negli altri tipi le parole sopra sono già cliccabili per la stella
        if (ex.type === 'mc') showFull();
        else { const ins = p.querySelector('.instr'); if (ins && ins.textContent.indexOf('★') === -1) ins.textContent += ' · Clicca una parola per la stella ★.'; }
      } else {
        fb.textContent = '✗ Non ancora. Riascolta e riprova.'; fb.style.color = 'var(--bad)';
        if (attempts[ex.id] >= 2 || preview) solBtn.style.display = '';
      }
    });
    solBtn.addEventListener('click', function () {
      solved = true;
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
  function loadStars(ls) {
    const m = {};
    ((ls.vocab && ls.vocab.starred) || []).forEach(function (x) { if (x && x.word) m[L.normalize(x.word)] = { word: x.word, translation: x.translation || '' }; });
    return m;
  }
  function saveStars(ls, stars) {
    vocabState(ls).starred = Object.keys(stars).map(function (k) { return stars[k]; });
    if (S.lessons[ls.id]) touch(ls);
  }
  function starStore(ls) { return (S.student && S.student.lesson === ls) ? S.student.stars : (S.editorStars = S.editorStars || loadStars(ls)); }
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
    const parent = span.parentElement; if (!parent) return toggleStar(ls, span.textContent);
    const spans = $$('.w', parent).filter(function (x) { return x.parentElement === parent; });
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
  /** Segna come stellate le parole (o sequenze di parole) presenti nella lista, in tutte le frasi visibili. Idempotente. */
  function refreshStarMarks(ls) {
    if (!ls) return;
    const stars = starStore(ls);
    const keys = Object.keys(stars).map(function (k) { return k.split(' '); });
    const parents = new Set();
    $$('.w').forEach(function (x) { if (x.parentElement) parents.add(x.parentElement); });
    parents.forEach(function (parent) {
      const spans = $$('.w', parent).filter(function (x) { return x.parentElement === parent; });
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
    const built = EX.buildExercise(ex.type, sentence, { lang: ls.lang, seed: Date.now() % 100000, choices: choices, vocab: lessonVocab(ls), distractors: ex.noDistractors ? 0 : 2 });
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
    sp.addEventListener('click', function (e) { e.stopPropagation(); starClick(ls, sp); });
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
        // scheda abbinamento: al passaggio del mouse la foto si vede grande (senza didascalia: la parola è da indovinare)
        d.addEventListener('mouseenter', function () { showImgPreview(d, w.image, ''); });
        d.addEventListener('mouseleave', hideImgPreview);
      }
    } else textBack();
    return d;
  }
  function cardHeader(p, title, sub) {
    p.appendChild(el('div', { class: 'row ex-head' },
      el('h3', { class: 'ex-title' }, [document.createTextNode(title), sub ? el('span', { class: 'sub', text: ' ' + sub }) : null]),
      el('span', { class: 'badge right', text: 'prima del video' })));
  }
  function cardFooter(p, st, onDone) {
    const row = el('div', { class: 'actions' });
    row.appendChild(el('button', { class: 'link', text: 'Salta questa scheda', onclick: nextCard }));
    row.appendChild(el('button', { class: 'link', text: 'Salta tutto e vai al video ▶', onclick: startPlayback }));
    p.appendChild(row);
    return row;
  }
  function nextCard() {
    const st = S.student; if (!st) return;
    st.cardIdx++;
    if (st.cardIdx >= st.cards.length) return startPlayback();
    renderVocabCard();
  }
  function renderVocabCard() {
    const st = S.student; const ls = st.lesson;
    const p = $('#s-panel'); p.innerHTML = '';
    const kind = st.cards[st.cardIdx];
    if (kind === 'matching') renderMatching(p, ls, st); else renderFlashcards(p, ls, st);
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
    const per = 8, rounds = Math.ceil(all.length / per);
    const fx = !ls.options || ls.options.fx !== false;
    let round = 0;
    const playRound = function () {
      p.innerHTML = '';
      const words = all.slice(round * per, (round + 1) * per);
      cardHeader(p, 'Parole utili: abbina', rounds > 1 ? '(' + (round + 1) + ' di ' + rounds + ')' : '');
      p.appendChild(el('div', { class: 'instr', text: 'Tocca una parola e poi la sua foto o traduzione (o il contrario): le coppie giuste salgono in alto, legate. La stella segna le parole da ripassare.' }));
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
      const sizeRows = function () {
        if (!p.isConnected) return;
        const avail = p.clientHeight - (grid.getBoundingClientRect().top - p.getBoundingClientRect().top) - fb.offsetHeight - foot.offsetHeight - 28;
        const rowh = Math.max(44, Math.min(150, Math.floor(avail / words.length) - 6));
        p.style.setProperty('--rowh', rowh + 'px');
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
      if (write) {
        const inp = el('input', { type: 'text', placeholder: 'Scrivi la parola', autocomplete: 'off', autocapitalize: 'off', style: 'max-width:18em;margin-top:8px' });
        const chk = el('button', { class: 'primary', text: 'Controlla', onclick: function () {
          const ok = L.normalize(inp.value, { accents: !!(ls.options && ls.options.strict) }) === L.normalize(w.word, { accents: !!(ls.options && ls.options.strict) });
          inp.classList.toggle('ok', ok); inp.classList.toggle('bad', !ok);
          fb.textContent = ok ? '✓ Giusto!' : '✗ Non ancora: era "' + w.word + '".'; fb.style.color = ok ? 'var(--ok)' : 'var(--bad)';
          if (ok && (!ls.options || ls.options.fx !== false)) celebrate(p, fb);
          card.classList.add('flipped'); flipped = true;
        } });
        inp.addEventListener('keydown', function (e) { if (e.key === 'Enter') chk.click(); });
        p.appendChild(el('div', { class: 'row', style: 'margin-top:6px' }, [inp, chk]));
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
      const sizeCard = function () {
        if (!p.isConnected) return;
        const used = (card.getBoundingClientRect().top - p.getBoundingClientRect().top) + nav.offsetHeight + fb.offsetHeight + foot.offsetHeight + (write ? 60 : 0) + 40;
        const h = Math.max(250, Math.min(560, p.clientHeight - used));
        p.style.setProperty('--cardh', h + 'px');
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
    renderWordList(p, ls, st.stars);
    p.appendChild(el('div', { class: 'actions' },
      el('button', { class: 'primary', text: 'Ricomincia', onclick: function () { openStudent(ls.id, false, ls); } })));
  }

  // ---------- avvio ----------
  function init() {
    loadState();
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
    if (h.indexOf('#d=') === 0) {
      try {
        const ls = JSON.parse(unb64url(h.slice(3)));
        ls.options = ls.options || {}; ls.cuts = ls.cuts || [];
        S.standalone = true;
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
    if (id && S.lessons[id]) return q.get('mode') === 'student' ? openStudent(id) : openEditor(id);
    renderHome();
  }
  window.VLApp = { S: S, generate: generate, openEditor: openEditor, openStudent: openStudent, renderHome: renderHome, newLesson: newLesson };
  init();
})();
