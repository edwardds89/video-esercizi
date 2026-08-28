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
    editor: { replay: null, altIdx: {} },
    student: null
  };
  function loadState() {
    try { S.lessons = JSON.parse(localStorage.getItem('vle.lessons') || '{}') || {}; } catch (e) { S.lessons = {}; }
    try { Object.assign(S.settings, JSON.parse(localStorage.getItem('vle.settings') || '{}') || {}); } catch (e) { /* ignore */ }
  }
  function saveLessons() {
    try { localStorage.setItem('vle.lessons', JSON.stringify(S.lessons)); } catch (e) { toast('Impossibile salvare nel browser: ' + e.message); }
  }
  function saveSettings() { try { localStorage.setItem('vle.settings', JSON.stringify(S.settings)); } catch (e) { /* ignore */ } }
  const saveDebounced = (function () { let t; return function () { clearTimeout(t); t = setTimeout(function () { saveLessons(); const s = $('#e-saved'); if (s) { s.textContent = 'Salvato'; setTimeout(function () { s.textContent = ''; }, 1500); } }, 400); }; })();
  function current() { return S.lessons[S.currentId]; }
  function touch(lesson) { lesson.updatedAt = new Date().toISOString(); saveDebounced(); }

  function studentPayload(lesson) {
    return { v: 1, id: lesson.id, title: lesson.title, videoId: lesson.videoId, lang: lesson.lang, duration: lesson.duration,
      exercises: lesson.exercises, cuts: lesson.cuts, options: lesson.options, lines: lesson.videoId === 'demo' ? lesson.lines : undefined };
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
        const vars = { rel: 0, playsinline: 1, modestbranding: 1, controls: 1 };
        if (/^https?:/.test(location.protocol)) vars.origin = location.origin;
        const p = new YT.Player(div, {
          width: '100%', height: '100%', videoId: videoId, playerVars: vars,
          events: {
            onReady: function (e) { hideCaptions(e.target); const w = wrapYT(e.target); S.player = w; resolve(w); },
            onError: function (e) { if (opts.onError) opts.onError(e.data); },
            onStateChange: function (e) { if (e.data === 1) hideCaptions(e.target); if (opts.onState) opts.onState(e.data); }
          }
        });
        setTimeout(function () { if (!S.player) { const w = wrapYT(p); S.player = w; resolve(w); } }, 8000);
      });
    });
  }
  /** Sottotitoli di YouTube spenti: sono esercizi di ascolto (il modulo può ricaricarsi all'avvio, quindi si ripete al PLAYING). */
  function hideCaptions(p) {
    try { p.unloadModule('captions'); } catch (e) { /* ignore */ }
    try { p.unloadModule('cc'); } catch (e) { /* ignore */ }
  }
  function ytErrorText(code) {
    if (code === 2) return 'ID del video non valido.';
    if (code === 5) return 'Errore del player HTML5.';
    if (code === 100) return 'Video non trovato o privato.';
    if (code === 101 || code === 150) return 'Il proprietario non permette di incorporare questo video: scegline un altro.';
    return 'Errore YouTube ' + code;
  }

  // ---------- loop ----------
  function startLoop() { stopLoop(); S.loop = setInterval(tick, 200); }
  function stopLoop() { if (S.loop) { clearInterval(S.loop); S.loop = null; } }
  function tick() {
    if (!S.player) return;
    if (S.view === 'editor') editorTick();
    else if (S.view === 'student') studentTick();
  }

  // ---------- navigazione ----------
  function show(view) {
    S.view = view;
    $$('.view').forEach(function (v) { v.classList.toggle('active', v.id === 'view-' + view); });
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
        ls.options = ls.options || { wordBank: true, strict: false };
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
    ls.params = { n: 8, target: 600, types: G.ALL_TYPES.slice(), contextBefore: 25, ai: false, focus: '' };
    overlay(true, 'Generazione della demo…');
    setTimeout(function () {
      generate(ls, false).then(function () { overlay(false); openEditor(ls.id); });
    }, 50);
  });

  function newLesson(base) {
    const ls = Object.assign({ v: 1, id: uid(), title: '', videoId: '', videoUrl: '', lang: 'it', level: 'B1', duration: 0, lines: [], chunks: [], exercises: [], cuts: [],
      options: { wordBank: true, strict: false }, params: {}, ai: null, warnings: [], createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() }, base);
    S.lessons[ls.id] = ls;
    return ls;
  }

  /** Genera (o rigenera) esercizi e tagli per la lezione. */
  function generate(ls, useAI) {
    const p = ls.params;
    const duration = ls.duration;
    if (ls.transcriptRaw) { const rp = G.parseTranscript(ls.transcriptRaw); if (rp.lines.length) ls.lines = rp.lines; }
    const chunks = G.annotate(G.buildChunks(ls.lines, { duration: duration, lang: ls.lang }), { lang: ls.lang, duration: duration });
    ls.chunks = chunks;
    const warnings = [];
    let promise;
    if (useAI && S.settings.apiKey) {
      overlay(true, 'Chiedo al modello AI (20-60 secondi)…');
      promise = AI.generateWithAI({ chunks: chunks, duration: duration, target: p.target, n: p.n, types: p.types, range: p.range, lang: ls.lang, level: ls.level, focus: p.focus, apiKey: S.settings.apiKey, model: S.settings.model })
        .then(function (r) {
          ls.ai = { model: r.ai.model, cost: r.ai.cost, usage: r.ai.usage, notes: r.notes, title: r.title, when: new Date().toISOString() };
          if (r.title && !ls.title) ls.title = r.title;
          return { exercises: r.exercises, cuts: r.cuts, stats: r.stats, warnings: r.warnings };
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
        ls.ai = null;
      }
      ls.exercises = r.exercises;
      ls.cuts = r.cuts;
      ls.warnings = warnings.concat(r.warnings || []);
      ls.stats = r.stats;
      touch(ls);
      saveLessons();
      return ls;
    });
  }

  // ---------- NUOVA LEZIONE ----------
  const N = { videoId: null, duration: 0, ok: false };
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
  }
  $('#f-range').addEventListener('change', function () { $('#f-target').style.display = $('#f-range').value === 'custom' ? '' : 'none'; });
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
    if (!p.lines.length) { st.textContent = $('#f-transcript').value.trim() ? '⚠ Non trovo i tempi (0:00, 0:03…): copia il testo dal pannello "Mostra trascrizione".' : ''; return; }
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
      return showFormError($('#f-transcript').value.trim()
        ? 'La trascrizione incollata non ha i tempi (0:00, 0:07…): senza tempi il video non è utilizzabile. Copia il testo dal pannello "Mostra trascrizione" di YouTube.'
        : 'Manca la trascrizione: questo video non è utilizzabile finché non la incolli a mano (YouTube → Mostra trascrizione) o non usi il pulsante per Chrome. Se YouTube non la offre, scegli un altro video.');
    }
    const types = $$('#f-types input:checked').map(function (i) { return i.value; });
    if (!types.length) return showFormError('Scegli almeno un tipo di esercizio.');
    const last = parsed.lines[parsed.lines.length - 1];
    const duration = N.duration > last.start ? N.duration : last.end + 2;
    let target = selectedTarget(duration);
    if (isNaN(target) || target <= 0) return showFormError('Durata personalizzata non valida: usa il formato mm:ss (es. 9:30).');
    const ls = newLesson({
      title: $('#f-title').value.trim() || ('Lezione ' + new Date().toLocaleDateString('it-IT')),
      videoId: id, videoUrl: url, lang: $('#f-lang').value, level: $('#f-level').value, lines: parsed.lines, duration: duration, transcriptRaw: $('#f-transcript').value
    });
    ls.params = { n: Math.max(1, parseInt($('#f-n').value, 10) || 10), target: target, tolerance: $('#f-range').value === 'custom' ? 0 : Math.round(target * 0.1), types: types, range: G.RANGES[$('#f-words').value] || null, contextBefore: parseInt($('#f-ctx').value, 10) || 25, ai: $('#f-ai').checked, focus: $('#f-focus').value.trim() };
    overlay(true, 'Genero la bozza…');
    generate(ls, ls.params.ai).then(function () { overlay(false); openEditor(ls.id); })
      .catch(function (e) { overlay(false); toast('Errore: ' + e.message); console.error(e); });
  });

  // ---------- TIMELINE ----------
  function renderTimeline(container, lesson, o) {
    o = o || {};
    container.innerHTML = '';
    const D = lesson.duration || 1;
    const track = el('div', { class: 'track' });
    (lesson.cuts || []).forEach(function (c) {
      track.appendChild(el('div', { class: 'cut', style: 'left:' + (100 * c.start / D) + '%;width:' + (100 * (c.end - c.start) / D) + '%', title: 'Taglio ' + fmt(c.start) + '–' + fmt(c.end) + (c.reason ? ' (' + c.reason + ')' : '') }));
    });
    track.addEventListener('click', function (e) {
      if (!o.onSeek) return;
      const r = track.getBoundingClientRect();
      o.onSeek(D * (e.clientX - r.left) / r.width);
    });
    container.appendChild(track);
    (lesson.exercises || []).forEach(function (ex, i) {
      const m = el('div', { class: 'marker' + (o.done && o.done.has(ex.id) ? ' done' : '') + (o.activeId === ex.id ? ' active' : ''), text: String(i + 1), style: 'left:' + (100 * ex.markerTime / D) + '%', title: fmt(ex.markerTime) + ' · ' + EX.LABELS[ex.type] });
      // I segnaposto non si trascinano (troppo facile spostarli per sbaglio): l'orario si cambia nel campo "ferma il video a" della scheda.
      if (o.onMarker) m.addEventListener('click', function (e) { e.stopPropagation(); o.onMarker(ex); });
      container.appendChild(m);
    });
    container.appendChild(el('div', { class: 'cursor', style: 'left:0%' }));
    container.appendChild(el('div', { class: 'labels' }, el('span', { text: '0:00' }), el('span', { text: fmtMin(D) })));
  }
  function drawCursor(container, t, D) {
    const c = container && container.querySelector('.cursor');
    if (c) c.style.left = (100 * Math.min(t, D) / (D || 1)) + '%';
  }
  function sortExercises(lesson) { lesson.exercises.sort(function (a, b) { return a.markerTime - b.markerTime; }); }

  // ---------- EDITOR ----------
  function openEditor(id) {
    S.currentId = id;
    const ls = current();
    if (!ls) return renderHome();
    show('editor');
    $('#e-title').value = ls.title || '';
    $('#e-wordbank').checked = ls.options.wordBank !== false;
    $('#e-strict').checked = !!ls.options.strict;
    createPlayer($('#e-player'), ls.videoId, { lesson: ls, onError: function (code) { toast(ytErrorText(code), 5000); } })
      .then(function () { startLoop(); })
      .catch(function (e) { toast('Player non disponibile: ' + e.message, 6000); });
    renderEditorBody();
  }
  $('#e-title').addEventListener('change', function () { const ls = current(); if (ls) { ls.title = $('#e-title').value.trim(); touch(ls); } });
  $('#e-wordbank').addEventListener('change', function () { const ls = current(); if (ls) { ls.options.wordBank = $('#e-wordbank').checked; touch(ls); } });
  $('#e-strict').addEventListener('change', function () { const ls = current(); if (ls) { ls.options.strict = $('#e-strict').checked; touch(ls); } });
  $('#btn-student').addEventListener('click', function () { openStudent(S.currentId, true); });
  $('#btn-save').addEventListener('click', function () { const ls = current(); if (!ls) return; ls.title = $('#e-title').value.trim() || ls.title; ls.updatedAt = new Date().toISOString(); saveLessons(); toast('Salvato nel portfolio'); renderHome(); });
  $('#btn-export').addEventListener('click', function () { const ls = current(); download(slugify(ls.title) + '.json', JSON.stringify(studentPayload(ls), null, 1)); });
  $('#btn-delete').addEventListener('click', function () { const ls = current(); if (confirm('Eliminare "' + ls.title + '"?')) { delete S.lessons[ls.id]; saveLessons(); renderHome(); } });
  $('#btn-add-ex').addEventListener('click', function () {
    const ls = current(); const t = S.player ? S.player.time() : 0;
    const c = G.nearestChunk(ls.chunks || [], t);
    if (!c) return toast('Nessuna frase vicino a questo punto');
    const ex = G.makeExercise(c, (ls.params.types || G.ALL_TYPES)[0] || 'gap', { lang: ls.lang, seed: Date.now() % 1000 });
    if (!ex) return toast('Frase non adatta');
    ls.exercises.push(ex); sortExercises(ls); touch(ls); renderEditorBody();
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
    if (S.view === 'editor') renderEditorBody(); else renderTimeline($('#s-timeline'), ls, { done: S.student.done, activeId: S.student.activeId });
  }
  function editorTick() {
    const ls = current(); if (!ls || !S.player) return;
    syncDuration(ls);
    const t = S.player.time();
    drawCursor($('#e-timeline'), t, ls.duration);
    const rp = S.editor.replay;
    if (rp) { if (t >= rp.end || S.player.state() === 0) { S.player.pause(); S.editor.replay = null; } return; }
    if ($('#e-skip').checked && S.player.state() === 1) {
      const c = G.inCut(ls.cuts, t);
      if (c) S.player.seek(c.end + 0.05);
    }
  }
  function playSegment(seg) {
    if (!S.player) return;
    S.editor.replay = { end: seg.end };
    S.player.seek(seg.start);
    S.player.play();
  }

  function renderEditorBody() {
    const ls = current(); if (!ls) return;
    renderTimeline($('#e-timeline'), ls, { editable: true, onSeek: function (t) { if (S.player) S.player.seek(t); }, onMarker: function (ex) {
      const card = $('#ex-' + ex.id);
      if (card) { card.scrollIntoView({ behavior: 'smooth', block: 'center' }); card.classList.add('flash'); setTimeout(function () { card.classList.remove('flash'); }, 1500); }
    } });
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
    // esercizi
    const box = $('#e-exercises'); box.innerHTML = '';
    if (!ls.exercises.length) box.appendChild(el('p', { class: 'muted', text: 'Nessun esercizio. Aggiungine uno dal tempo corrente o rigenera la bozza.' }));
    ls.exercises.forEach(function (ex, i) { box.appendChild(renderExerciseCard(ls, ex, i)); });
    // tagli
    const cb = $('#e-cuts'); cb.innerHTML = '';
    if (!ls.cuts.length) cb.appendChild(el('p', { class: 'muted', text: 'Nessun taglio: il video viene mostrato per intero.' }));
    ls.cuts.forEach(function (c, i) { cb.appendChild(renderCutRow(ls, c, i)); });
  }

  function timeInput(value, onChange) {
    const inp = el('input', { type: 'text', class: 'short', value: fmt(value) });
    inp.addEventListener('change', function () {
      const t = L.parseTime(inp.value);
      if (isNaN(t)) { inp.value = fmt(value); return toast('Formato tempo: m:ss.s'); }
      onChange(Math.max(0, t));
    });
    return inp;
  }

  function rebuildExercise(ls, ex, type, choices, seed) {
    const built = EX.buildExercise(type, ex.sentence, { lang: ls.lang, seed: seed || (Date.now() % 100000), choices: choices || null });
    if (!built) return false;
    ex.type = built.type; ex.data = built.data;
    return true;
  }

  function renderExerciseCard(ls, ex, i) {
    const card = el('div', { class: 'ex-card ' + (ex.source || 'rules'), id: 'ex-' + ex.id });
    const typeSel = el('select', { style: 'width:auto' });
    G.ALL_TYPES.forEach(function (t) { typeSel.appendChild(el('option', { value: t, text: EX.LABELS[t], selected: t === ex.type ? 'selected' : null })); });
    typeSel.addEventListener('change', function () {
      if (!rebuildExercise(ls, ex, typeSel.value)) { toast('Questo tipo non è applicabile a questa frase'); typeSel.value = ex.type; return; }
      touch(ls); renderEditorBody();
    });
    const rangeSel = el('select', { style: 'width:auto', title: 'Lunghezza della frase (parole)' });
    [['auto', 'lunghezza: auto'], ['5-10', '5-10 parole'], ['10-15', '10-15 parole'], ['15-20', '15-20 parole'], ['20-30', '20-30 parole'], ['30-40', '30-40 parole'], ['40-60', '40-60 parole']].forEach(function (o) {
      rangeSel.appendChild(el('option', { value: o[0], text: o[1], selected: rangeKey(ex.range) === o[0] ? 'selected' : null }));
    });
    rangeSel.addEventListener('change', function () {
      ex.range = G.RANGES[rangeSel.value] || null;
      // cerca subito la frase migliore di questa lunghezza vicino al punto attuale
      const used = usedChunkIds(ls, ex);
      let best = null;
      if (ex.range) {
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
    helperSel.appendChild(el('option', { value: '', text: (ex.range ? 'Frasi di ' + ex.range[0] + '-' + ex.range[1] + ' parole' : 'Frasi adatte') + ' nel video: ' + cands.length + ' — scegli…' }));
    cands.forEach(function (p, k) {
      helperSel.appendChild(el('option', { value: String(k), text: fmtMin(p.start) + ' · ' + p.wordCount + ' parole · ' + (p.text.length > 70 ? p.text.slice(0, 70) + '…' : p.text) }));
    });
    helperSel.addEventListener('change', function () { const k = parseInt(helperSel.value, 10); if (!isNaN(k) && cands[k]) applyCandidate(ls, ex, cands[k]); });
    const head = el('div', { class: 'head' },
      el('span', { class: 'num', text: String(i + 1) }),
      el('span', { class: 'hint', text: 'ferma il video a' }),
      timeInput(ex.markerTime, function (t) { ex.markerTime = t; sortExercises(ls); touch(ls); renderEditorBody(); }),
      typeSel,
      rangeSel,
      el('button', { class: 'small', text: '▶ Ascolta', onclick: function () { playSegment(ex.segment); } }),
      el('button', { class: 'small', text: '↻ Altra frase', onclick: function () { altSentence(ls, ex); } }),
      el('button', { class: 'small', text: '⟳ Rigenera', onclick: function () { rebuildExercise(ls, ex, ex.type); touch(ls); renderEditorBody(); } }),
      el('span', { class: 'badge ' + (ex.source === 'ai' ? 'ai' : ''), text: ex.source === 'ai' ? 'AI' : 'regole' }),
      el('button', { class: 'small danger right', text: 'Elimina', onclick: function () { ls.exercises = ls.exercises.filter(function (x) { return x !== ex; }); touch(ls); renderEditorBody(); } })
    );
    card.appendChild(head);
    card.appendChild(el('div', { class: 'row', style: 'margin-top:6px' }, el('span', { class: 'hint', text: 'Helper:' }), helperSel));
    if (ex.note) card.appendChild(el('div', { class: 'hint', text: 'Perché: ' + ex.note }));
    const ta = el('textarea', { style: 'min-height:56px;margin-top:8px' }); ta.value = ex.sentence;
    ta.addEventListener('change', function () {
      ex.sentence = ta.value.trim();
      if (!rebuildExercise(ls, ex, ex.type)) toast('Frase troppo corta per questo tipo');
      touch(ls); renderEditorBody();
    });
    card.appendChild(el('label', { text: 'Frase (quello che lo studente sente)' }));
    card.appendChild(ta);
    const segRow = el('div', { class: 'row', style: 'margin-top:8px' },
      el('span', { class: 'hint', text: 'Ascolto da' }),
      timeInput(ex.segment.start, function (t) { ex.segment.start = t; touch(ls); renderEditorBody(); }),
      el('span', { class: 'hint', text: 'a' }),
      timeInput(ex.segment.end, function (t) { ex.segment.end = t; touch(ls); renderEditorBody(); }),
      el('button', { class: 'small', text: 'Inizio = ora', title: 'Usa il tempo corrente del player', onclick: function () { if (S.player) { ex.segment.start = Math.round(S.player.time() * 10) / 10; touch(ls); renderEditorBody(); } } }),
      el('button', { class: 'small', text: 'Fine = ora', onclick: function () { if (S.player) { ex.segment.end = Math.round(S.player.time() * 10) / 10; if (ex.markerTime < ex.segment.end) ex.markerTime = ex.segment.end + 0.1; touch(ls); renderEditorBody(); } } })
    );
    card.appendChild(segRow);
    card.appendChild(renderTypeEditor(ls, ex));
    card.appendChild(el('div', { class: 'preview', html: '<span class="hint">Lo studente vede: </span>' + previewText(ex) }));
    return card;
  }

  function escapeHtml(s) { return String(s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }
  function previewText(ex) {
    const d = ex.data;
    switch (ex.type) {
      case 'gap': return d.tokens.map(function (t, i) { return d.gapIndices.indexOf(i) !== -1 ? '<b>______</b>' : escapeHtml(t); }).join(' ');
      case 'scramble': return d.shuffled.map(function (w) { return '<span class="chip static">' + escapeHtml(w) + '</span>'; }).join(' ');
      case 'missing': return d.tokens.filter(function (t, i) { return i !== d.missingIndex; }).map(escapeHtml).join(' ');
      case 'extra': return d.shown.map(function (t, i) { return i === d.extraIndex ? '<b><u>' + escapeHtml(t) + '</u></b>' : escapeHtml(t); }).join(' ');
      case 'wrong': return d.shown.map(function (t, i) { return i === d.wrongIndex ? '<b><u>' + escapeHtml(t) + '</u></b>' : escapeHtml(t); }).join(' ');
    }
    return '';
  }

  function renderTypeEditor(ls, ex) {
    const d = ex.data;
    const wrap = el('div', { style: 'margin-top:8px' });
    const toks = L.tokenize(ex.sentence);
    if (ex.type === 'gap') {
      wrap.appendChild(el('div', { class: 'hint', text: 'Tocca le parole da nascondere:' }));
      const chips = el('div', { class: 'chips' });
      d.tokens.forEach(function (t, i) {
        const c = el('span', { class: 'chip' + (d.gapIndices.indexOf(i) !== -1 ? ' gap' : ''), text: t });
        c.addEventListener('click', function () {
          const k = d.gapIndices.indexOf(i);
          if (k !== -1) { if (d.gapIndices.length === 1) return toast('Serve almeno uno spazio'); d.gapIndices.splice(k, 1); }
          else d.gapIndices.push(i);
          d.gapIndices.sort(function (a, b) { return a - b; });
          d.answers = d.gapIndices.map(function (j) { return toks[j] ? toks[j].core : d.tokens[j]; });
          d.wordBank = EX.shuffle(d.answers, L.rng(Date.now() % 10000));
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
    for (const k in G.RANGES) { const r = G.RANGES[k]; if (r && r[0] === range[0] && r[1] === range[1]) return k; }
    return 'auto';
  }
  function usedChunkIds(ls, except) {
    const used = new Set();
    ls.exercises.forEach(function (e) { if (e === except) return; (e.chunkIds || [e.chunkId]).forEach(function (id) { used.add(id); }); });
    return used;
  }
  /** Candidati per un esercizio: passaggi nell'intervallo scelto, oppure chunk singoli (auto). Ordinati per tempo. */
  function candidatesFor(ls, ex) {
    const used = usedChunkIds(ls, ex);
    if (ex.range) {
      return G.passages(ls.chunks || [], { min: ex.range[0], max: ex.range[1], lang: ls.lang })
        .filter(function (p) { return !p.cta && (p.startsSentence || p.endsSentence) && !p.chunkIds.some(function (id) { return used.has(id); }); })
        .sort(function (a, b) { return b.score - a.score; }).slice(0, 60)
        .sort(function (a, b) { return a.start - b.start; });
    }
    return (ls.chunks || []).filter(function (c) { return !c.silence && c.exScore > 0 && !c.cta && !used.has(c.id); })
      .sort(function (a, b) { return b.exScore - a.exScore; }).slice(0, 60)
      .sort(function (a, b) { return a.start - b.start; })
      .map(function (c) { return { start: c.start, end: c.end, text: c.text, chunkIds: [c.id], wordCount: c.wordCount, chunk: c }; });
  }
  function applyCandidate(ls, ex, p) {
    const nx = p.chunk ? G.makeExercise(p.chunk, ex.type, { lang: ls.lang, seed: Date.now() % 1000, source: 'rules' })
      : G.makeExerciseFromPassage(p, ex.type, { lang: ls.lang, seed: Date.now() % 1000, source: 'rules', range: ex.range });
    if (!nx) return toast('Frase non adatta a questo tipo di esercizio');
    ex.chunkId = nx.chunkId; ex.chunkIds = nx.chunkIds || [nx.chunkId]; ex.sentence = nx.sentence; ex.segment = nx.segment; ex.markerTime = nx.markerTime; ex.type = nx.type; ex.data = nx.data; ex.source = 'rules'; ex.note = '';
    sortExercises(ls); touch(ls); renderEditorBody();
    const card = $('#ex-' + ex.id); if (card) card.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }
  function altSentence(ls, ex) {
    if (ex.range) {
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
    $('#r-n').value = p.n || 10;
    $('#r-target').value = fmtMin(p.target || ls.duration);
    $$('#r-types input').forEach(function (i) { i.checked = !p.types || p.types.indexOf(i.value) !== -1; });
    $('#r-ai').checked = !!S.settings.apiKey && (p.ai !== false);
    $('#r-words').value = rangeKey(p.range);
    $('#r-focus').value = p.focus || '';
    $('#dlg-regen').showModal();
  });
  $('#r-close').addEventListener('click', function () { $('#dlg-regen').close(); });
  $('#r-go').addEventListener('click', function () {
    const ls = current();
    const types = $$('#r-types input:checked').map(function (i) { return i.value; });
    if (!types.length) return toast('Scegli almeno un tipo');
    let target = L.parseTime($('#r-target').value);
    if (isNaN(target) || target <= 0 || target > ls.duration) target = ls.duration;
    ls.params = Object.assign({}, ls.params, { n: Math.max(1, parseInt($('#r-n').value, 10) || 10), target: target, types: types, range: G.RANGES[$('#r-words').value] || null, ai: $('#r-ai').checked, focus: $('#r-focus').value.trim() });
    $('#dlg-regen').close();
    overlay(true, 'Rigenero la bozza…');
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
    const ls = lessonObj || S.lessons[id];
    if (!ls) return renderHome();
    document.body.classList.toggle('standalone', !!S.standalone);
    S.currentId = ls.id;
    S.student = { lesson: ls, done: new Set(), results: {}, blocked: false, replay: null, activeId: null, started: false, ended: false, attempts: {} };
    show('student');
    $('#s-title').textContent = ls.title || '';
    $('#btn-edit').style.display = (!S.standalone && S.lessons[ls.id]) ? '' : 'none';
    renderTimeline($('#s-timeline'), ls, { done: S.student.done });
    renderProgress();
    createPlayer($('#s-player'), ls.videoId, { lesson: ls, onError: function (code) { toast(ytErrorText(code), 6000); }, onState: function (st) { if (st === 0) onEnded(); } })
      .then(function () { startLoop(); renderStart(); })
      .catch(function (e) { $('#s-panel').innerHTML = ''; $('#s-panel').appendChild(el('div', { class: 'notice bad', text: e.message })); });
  }
  $('#btn-edit').addEventListener('click', function () { if (S.player) S.player.pause(); openEditor(S.currentId); });

  function renderProgress() {
    const st = S.student; const box = $('#s-progress'); box.innerHTML = '';
    st.lesson.exercises.forEach(function (ex, i) {
      const r = st.results[ex.id];
      box.appendChild(el('div', { class: 'dot' + (r ? (r.correct ? ' ok' : ' bad') : '') + (st.activeId === ex.id ? ' cur' : ''), text: String(i + 1), title: EX.LABELS[ex.type] }));
    });
  }
  function renderStart() {
    const st = S.student; const p = $('#s-panel'); p.innerHTML = '';
    const ls = st.lesson;
    p.appendChild(el('h2', { text: ls.exercises.length + ' esercizi · ' + fmtMin(G.effectiveDuration(ls.cuts, ls.duration)) + ' di video' }));
    p.appendChild(el('p', { class: 'muted', text: 'Il video si ferma da solo a ogni esercizio. Puoi riascoltare la frase quante volte vuoi.' }));
    p.appendChild(el('button', { class: 'primary big', text: '▶ Inizia', onclick: function () {
      st.started = true;
      const c = G.inCut(ls.cuts, 0);
      if (c) S.player.seek(c.end + 0.05);
      S.player.play();
      p.innerHTML = ''; p.appendChild(el('p', { class: 'muted', text: 'Guarda e ascolta… il video si fermerà al primo esercizio.' }));
    } }));
  }
  function studentTick() {
    const st = S.student; if (!st || !S.player) return;
    const ls = st.lesson;
    if (!st.started) syncDuration(ls);
    const t = S.player.time();
    drawCursor($('#s-timeline'), t, ls.duration);
    if (st.replay) {
      if (t >= st.replay.end || S.player.state() === 0) { S.player.pause(); st.replay = null; }
      return;
    }
    if (st.blocked) return;
    if (!st.started) return;
    const next = ls.exercises.find(function (e) { return !st.done.has(e.id) && t >= e.markerTime - 0.1; });
    if (next) {
      if (t > next.markerTime + 1.5) { S.player.seek(Math.max(0, next.segment.start - 0.3)); return; }
      S.player.pause();
      st.blocked = true; st.activeId = next.id;
      renderTimeline($('#s-timeline'), ls, { done: st.done, activeId: next.id });
      renderProgress();
      renderExercise(next);
      return;
    }
    if (S.player.state() === 1) {
      const c = G.inCut(ls.cuts, t);
      if (c) S.player.seek(c.end + 0.05);
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
    st.replay = { end: ex.segment.end };
    S.player.seek(ex.segment.start);
    S.player.play();
  }
  function finishExercise(ex, correct) {
    const st = S.student;
    st.results[ex.id] = { correct: correct, attempts: st.attempts[ex.id] || 1 };
    st.done.add(ex.id);
  }
  function continueVideo() {
    const st = S.student;
    st.blocked = false; st.activeId = null;
    renderTimeline($('#s-timeline'), st.lesson, { done: st.done });
    renderProgress();
    const p = $('#s-panel'); p.innerHTML = '';
    const remaining = st.lesson.exercises.filter(function (e) { return !st.done.has(e.id); }).length;
    p.appendChild(el('p', { class: 'muted', text: remaining ? 'Continua a guardare… prossimo esercizio in arrivo.' : 'Ultimo esercizio fatto: guarda la fine del video.' }));
    if (!remaining) p.appendChild(el('button', { class: 'small', text: 'Vai al riepilogo', onclick: function () { S.player.pause(); st.ended = true; renderSummary(); } }));
    S.player.play();
  }

  function renderExercise(ex) {
    const st = S.student; const ls = st.lesson;
    const p = $('#s-panel'); p.innerHTML = '';
    const idx = ls.exercises.indexOf(ex);
    p.appendChild(el('div', { class: 'row' }, el('h3', { text: 'Esercizio ' + (idx + 1) + ' di ' + ls.exercises.length }), el('span', { class: 'badge right', text: EX.LABELS[ex.type] })));
    p.appendChild(el('div', { class: 'instr', text: EX.INSTRUCTIONS[ex.type] }));
    const body = el('div');
    p.appendChild(body);
    const fb = el('div', { class: 'feedback' });
    const actions = el('div', { class: 'actions' });
    const replayBtn = el('button', { text: '🔁 Riascolta', onclick: function () { replaySegment(ex); } });
    const checkBtn = el('button', { class: 'primary', text: 'Controlla' });
    const solBtn = el('button', { class: 'link', text: 'Mostra soluzione', style: 'display:none' });
    const skipBtn = el('button', { class: 'link', text: 'Salta' });
    actions.appendChild(replayBtn); actions.appendChild(checkBtn); actions.appendChild(solBtn); actions.appendChild(skipBtn);
    p.appendChild(actions); p.appendChild(fb);

    const strict = !!ls.options.strict;
    let getAnswer = function () { return null; };
    let markResult = function () { };
    const d = ex.data;

    if (ex.type === 'gap') {
      const sent = el('div', { class: 'sentence' });
      const inputs = [];
      d.tokens.forEach(function (t, i) {
        const k = d.gapIndices.indexOf(i);
        if (k === -1) { sent.appendChild(document.createTextNode(t + ' ')); return; }
        const tok = L.tokenize(t)[0] || { pre: '', post: '' };
        if (tok.pre) sent.appendChild(document.createTextNode(tok.pre));
        const inp = el('input', { type: 'text', class: 'gap', autocomplete: 'off', autocapitalize: 'off', spellcheck: 'false', style: 'width:' + Math.max(5, d.answers[k].length + 2) + 'ch' });
        inp.addEventListener('keydown', function (e) { if (e.key === 'Enter') checkBtn.click(); });
        inputs.push(inp); sent.appendChild(inp);
        sent.appendChild(document.createTextNode((tok.post || '') + ' '));
      });
      body.appendChild(sent);
      if (ls.options.wordBank !== false && d.wordBank && d.wordBank.length) {
        body.appendChild(el('div', { class: 'chips' }, d.wordBank.map(function (w) { return el('span', { class: 'chip', text: w, onclick: function () { const empty = inputs.find(function (i) { return !i.value; }); if (empty) { empty.value = w; empty.focus(); } } }); })));
      }
      getAnswer = function () { return inputs.map(function (i) { return i.value; }); };
      markResult = function (res) { inputs.forEach(function (inp, k) { inp.classList.toggle('ok', !!res.detail[k]); inp.classList.toggle('bad', !res.detail[k]); }); };
      setTimeout(function () { if (inputs[0]) inputs[0].focus(); }, 50);
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
          ans.appendChild(el('span', { class: 'chip sel', text: d.shuffled[i], onclick: function () { chosen.splice(k, 1); render(); } }));
        });
        if (!chosen.length) ans.appendChild(el('span', { class: 'hint', text: 'Tocca le parole qui sotto nell\'ordine giusto' }));
      };
      render();
      body.appendChild(ans); body.appendChild(pool);
      getAnswer = function () { return chosen.map(function (i) { return d.shuffled[i]; }); };
      markResult = function (res) { $$('.chip', ans).forEach(function (c, k) { c.style.borderColor = res.detail[k] ? 'var(--ok)' : 'var(--bad)'; }); };
    } else if (ex.type === 'missing') {
      body.appendChild(el('div', { class: 'sentence', text: d.tokens.filter(function (t, i) { return i !== d.missingIndex; }).join(' ') }));
      const inp = el('input', { type: 'text', placeholder: 'Parola mancante', autocomplete: 'off', autocapitalize: 'off', style: 'margin-top:10px;max-width:16em' });
      inp.addEventListener('keydown', function (e) { if (e.key === 'Enter') checkBtn.click(); });
      body.appendChild(inp);
      getAnswer = function () { return inp.value; };
      markResult = function (res) { inp.classList.toggle('ok', res.correct); inp.classList.toggle('bad', !res.correct); };
      setTimeout(function () { inp.focus(); }, 50);
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
      markResult = function (res) {
        const c = $$('.chip', chips)[selected];
        if (c) c.style.borderColor = res.correct ? 'var(--ok)' : 'var(--bad)';
        if (ex.type === 'wrong') { corr.classList.toggle('ok', !!(res.detail && res.detail.word)); corr.classList.toggle('bad', !(res.detail && res.detail.word)); }
      };
    }

    let solved = false;
    checkBtn.addEventListener('click', function () {
      if (solved) return;
      const a = getAnswer();
      if (a == null || a === '' || a === -1 || (Array.isArray(a) && !a.length) || (typeof a === 'object' && !Array.isArray(a) && a.index === -1)) { fb.textContent = 'Prima rispondi.'; fb.style.color = 'var(--muted)'; return; }
      st.attempts[ex.id] = (st.attempts[ex.id] || 0) + 1;
      const res = EX.check(ex, a, { strict: strict });
      markResult(res);
      if (res.correct) {
        solved = true;
        fb.textContent = '✓ Giusto!'; fb.style.color = 'var(--ok)';
        finishExercise(ex, true);
        checkBtn.style.display = 'none'; solBtn.style.display = 'none'; skipBtn.style.display = 'none';
        actions.appendChild(el('button', { class: 'primary', text: 'Continua ▶', onclick: continueVideo }));
      } else {
        fb.textContent = '✗ Non ancora. Riascolta e riprova.'; fb.style.color = 'var(--bad)';
        if (st.attempts[ex.id] >= 2) solBtn.style.display = '';
      }
    });
    solBtn.addEventListener('click', function () {
      solved = true;
      fb.textContent = 'Soluzione: ' + EX.solution(ex); fb.style.color = 'var(--muted)';
      finishExercise(ex, false);
      checkBtn.style.display = 'none'; solBtn.style.display = 'none'; skipBtn.style.display = 'none';
      actions.appendChild(el('button', { class: 'primary', text: 'Continua ▶', onclick: continueVideo }));
    });
    skipBtn.addEventListener('click', function () { finishExercise(ex, false); continueVideo(); });
  }

  function renderSummary() {
    const st = S.student; const ls = st.lesson;
    const p = $('#s-panel'); p.innerHTML = '';
    const tot = ls.exercises.length;
    const ok = ls.exercises.filter(function (e) { return st.results[e.id] && st.results[e.id].correct; }).length;
    p.appendChild(el('h2', { text: 'Fine! ' + ok + ' su ' + tot + ' esercizi corretti' }));
    const list = el('div');
    ls.exercises.forEach(function (e, i) {
      const r = st.results[e.id];
      list.appendChild(el('div', { class: 'notice ' + (r && r.correct ? 'ok' : 'bad'), text: (i + 1) + '. ' + EX.LABELS[e.type] + ' — ' + (r && r.correct ? 'giusto' : 'da rivedere') + (r && r.attempts > 1 ? ' (' + r.attempts + ' tentativi)' : '') + ' · soluzione: ' + EX.solution(e) }));
    });
    p.appendChild(list);
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
