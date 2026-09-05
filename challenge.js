/*
 * Sfida in classe (VLChal) — la logica della modalità stile Quizizz: PIN, punteggi, classifica, protocollo
 * dei messaggi. QUI non c'è rete: il canale vero (Supabase Realtime) lo costruisce app.js e lo inietta;
 * per i test e per ?mock=1 ci sono memBus (in-process) e localBus (localStorage fra tab dello stesso browser).
 *
 * Protocollo (eventi broadcast sul canale "chal:<PIN>"):
 *   studente → host   'hello'  { id, nick }                  al join (e ripetuto finché non arriva 'quiz')
 *   studente → host   'score'  { id, nick, score, right, at, total, done }   a ogni risposta
 *   host → studenti   'quiz'   { act, mode }                 il quiz intero + la modalità punteggio
 *   host → studenti   'board'  { rows }                      classifica corrente (throttled)
 *   host → studenti   'end'    { rows }                      sfida chiusa: classifica finale
 * L'host risponde a OGNI 'hello' ribroadcastando 'quiz': chi arriva tardi o ricarica riceve tutto senza
 * stato sul server. Nessun dato viene salvato da nessuna parte: chiusa la sfida non resta niente.
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory(require('./exercises.js'), require('./lang.js'));
  else root.VLChal = factory(root.VLEx, root.VLLang);
})(typeof self !== 'undefined' ? self : this, function (EX, L) {
  'use strict';

  // PIN leggibile ad alta voce e battibile su un telefono: niente 0/O, 1/I/L.
  var PIN_CHARS = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
  function makePin(rand) {
    rand = rand || Math.random;
    var s = '';
    for (var i = 0; i < 6; i++) s += PIN_CHARS.charAt(Math.floor(rand() * PIN_CHARS.length));
    return s;
  }
  function validPin(p) { return typeof p === 'string' && /^[A-Z0-9]{6}$/.test(p) && p.split('').every(function (c) { return PIN_CHARS.indexOf(c) !== -1; }); }

  /** Come si calcolano i punti di una risposta giusta: lo sceglie l'insegnante per sessione. */
  var MODES = [
    ['right', 'Solo risposte giuste', '100 punti a risposta giusta, senza fretta'],
    ['streak', 'Giuste + serie', '100 punti + bonus per le risposte giuste di fila (fino a 200)'],
    ['speed', 'Giuste + velocità', '100 punti + bonus se rispondi in fretta (fino a 200)']
  ];
  function pointsFor(mode) {
    if (mode === 'right') return function () { return 100; };
    if (mode === 'speed') return function (streak, ms) { ms = ms == null ? 10000 : ms; return 100 + Math.max(0, 100 - Math.round(ms / 100)); };
    return function (streak) { return 100 + Math.min(streak || 0, 5) * 20; };   // 'streak' (default)
  }

  /** Stato dell'host: un record per studente, aggiornato dai messaggi. Puro e testabile. */
  function newState() { return { players: {}, ended: false }; }
  function reduce(state, event, p) {
    if (!p || !p.id) return state;
    var cur = state.players[p.id];
    if (event === 'hello') {
      if (!cur) state.players[p.id] = { id: p.id, nick: String(p.nick || 'Studente').slice(0, 20), score: 0, right: 0, at: 0, total: 0, done: false };
      else cur.nick = String(p.nick || cur.nick).slice(0, 20);   // rientro con lo stesso id: si tiene il punteggio
    }
    if (event === 'score') {
      if (!cur) cur = state.players[p.id] = { id: p.id, nick: String(p.nick || 'Studente').slice(0, 20), score: 0, right: 0, at: 0, total: 0, done: false };
      // il punteggio non scende mai: chi ricarica il telefono e ricomincia non precipita in classifica
      cur.score = Math.max(cur.score, p.score | 0);
      cur.right = Math.max(cur.right, p.right | 0);
      cur.at = Math.max(cur.at, p.at | 0);
      cur.total = p.total | 0 || cur.total;
      cur.done = cur.done || !!p.done;
      if (p.nick) cur.nick = String(p.nick).slice(0, 20);
    }
    return state;
  }
  /** Classifica: punti, poi risposte giuste, poi ordine alfabetico. rank 1-based, pari punti = pari rank. */
  function leaderboard(state) {
    var rows = Object.keys(state.players).map(function (k) { return state.players[k]; });
    rows.sort(function (a, b) { return (b.score - a.score) || (b.right - a.right) || a.nick.localeCompare(b.nick); });
    var rank = 0, last = null;
    rows.forEach(function (r, i) {
      if (last === null || r.score !== last.score || r.right !== last.right) rank = i + 1;
      r.rank = rank; last = r;
    });
    return rows;
  }

  // ---------- bus finti per test e ?mock=1 ----------
  /** Bus in-process: più "canali" nella stessa pagina o negli unit test. */
  function memBus() {
    var subs = [];
    return {
      join: function (pin) {
        var mine = { pin: pin, cbs: {} };
        subs.push(mine);
        return {
          send: function (event, payload) {
            subs.forEach(function (s) { if (s !== mine && s.pin === pin && s.cbs[event]) s.cbs[event](payload); });
          },
          on: function (event, cb) { mine.cbs[event] = cb; },
          close: function () { var i = subs.indexOf(mine); if (i !== -1) subs.splice(i, 1); }
        };
      }
    };
  }
  /** Bus fra TAB dello stesso browser via localStorage (per lo smoke e per provare senza rete): l'evento
   *  'storage' arriva solo alle ALTRE tab, che è esattamente la semantica del broadcast. */
  function localBus(storageKey) {
    storageKey = storageKey || 'vle.chalbus';
    return {
      join: function (pin) {
        var cbs = {};
        var onStorage = function (e) {
          if (e.key !== storageKey || !e.newValue) return;
          try {
            var m = JSON.parse(e.newValue);
            if (m.pin === pin && cbs[m.event]) cbs[m.event](m.payload);
          } catch (err) { /* ignora */ }
        };
        window.addEventListener('storage', onStorage);
        return {
          send: function (event, payload) {
            try { localStorage.setItem(storageKey, JSON.stringify({ pin: pin, event: event, payload: payload, n: Math.random() })); } catch (e) { /* pieno */ }
          },
          on: function (event, cb) { cbs[event] = cb; },
          close: function () { window.removeEventListener('storage', onStorage); }
        };
      }
    };
  }

  // ---------- SET DELLA SFIDA: esercizi multi-tipo (v69) ----------
  // Un item ha la STESSA forma degli esercizi delle lezioni ({kind, sentence, data} via EX.buildExercise),
  // piu' 'match' (coppie parola-traduzione). In modalita' Kahoot le risposte NON viaggiano mai ai telefoni:
  // pubItem() produce la versione pubblica (solo l'input necessario) e checkItem() valuta LATO HOST.
  var ITEM_KINDS = [
    ['mc', 'Scelta multipla'],
    ['gap', 'Completa gli spazi'],
    ['gapbank', 'Completa con le parole (banca)'],
    ['extra', 'Trova la parola in più'],
    ['missing', 'Trova la parola mancante'],
    ['wrong', 'Trova la parola sbagliata'],
    ['match', 'Abbina le coppie']
  ];
  function itemLabel(kind) { var k = ITEM_KINDS.find(function (x) { return x[0] === kind; }); return k ? k[1] : kind; }
  function buildItem(kind, arg, opts) {
    opts = opts || {};
    if (kind === 'mc') {
      // la frase non serve alla scelta multipla (conta solo choices), ma buildExercise vuole 3+ token
      var built = EX.buildExercise('mc', 'a b c', { lang: opts.lang || 'it', choices: { question: arg.q, options: arg.options, correct: arg.correct, tricky: arg.tricky } });
      return built ? { id: newId(), kind: 'mc', sentence: '', data: built.data } : null;
    }
    if (kind === 'match') {
      var pairs = (arg || []).map(function (p) { return { a: String(p.a || '').trim(), b: String(p.b || '').trim() }; }).filter(function (p) { return p.a && p.b; });
      return pairs.length >= 2 ? { id: newId(), kind: 'match', pairs: pairs.slice(0, 8) } : null;
    }
    var b = EX.buildExercise(kind, String(arg || ''), { lang: opts.lang || 'it', seed: opts.seed, choices: opts.choices || null, vocab: opts.vocab || null, distractors: opts.distractors });
    return b ? { id: newId(), kind: b.type, sentence: String(arg || ''), data: b.data } : null;
  }
  function newId() { return 'i' + Math.random().toString(36).slice(2, 9); }
  /** La frase con gli spazi ___ (per lo schermo, e per il telefono solo con "mostra la domanda"). */
  function gapText(item) {
    var d = item.data, runs = EX.gapRuns(d), out = [], skip = {};
    runs.forEach(function (r) { r.indices.forEach(function (j, n) { skip[j] = n > 0; }); });
    d.tokens.forEach(function (t, j) {
      if (skip[j] === undefined) out.push(t);
      else if (!skip[j]) out.push('_____');
    });
    return out.join(' ');
  }
  /** Versione PUBBLICA di un item: solo quello che serve al telefono per rispondere, MAI le risposte.
   *  Per extra/missing/wrong/gapbank i pezzi della frase SONO l'input e viaggiano comunque (come i puzzle
   *  di Kahoot); per gap/mc la domanda viaggia solo con showQ. Per match il mescolamento e' deciso QUI
   *  (una volta per domanda, uguale per tutti) e serve anche al check. */
  function pubItem(item, opts) {
    opts = opts || {};
    var showQ = !!opts.showQ, rand = opts.rand || Math.random;
    var d = item.data || {};
    if (item.kind === 'mc') return { kind: 'mc', n: (d.options || []).filter(Boolean).length, q: showQ ? d.question : undefined, options: showQ ? d.options : undefined };
    if (item.kind === 'gap' || item.kind === 'gapbank') {
      var runs = EX.gapRuns(d).map(function (r) { return { words: r.indices.length }; });
      return { kind: item.kind, runs: runs, bank: item.kind === 'gapbank' ? (d.wordBank || []).slice() : undefined, sentence: showQ ? gapText(item) : undefined };
    }
    if (item.kind === 'extra' || item.kind === 'wrong') return { kind: item.kind, shown: (d.shown || []).slice() };
    if (item.kind === 'missing') return { kind: 'missing', tokens: (d.tokens || []).slice() };
    if (item.kind === 'match') {
      var left = item.pairs.map(function (p) { return p.a; });
      var right = shuffleArr(item.pairs.map(function (p, i) { return { i: i, b: p.b }; }), rand);
      return { kind: 'match', left: left, right: right.map(function (x) { return x.b; }), _map: right.map(function (x) { return x.i; }) };
    }
    return { kind: item.kind };
  }
  function shuffleArr(a, rand) {
    a = a.slice();
    for (var i = a.length - 1; i > 0; i--) { var j = Math.floor(rand() * (i + 1)); var t = a[i]; a[i] = a[j]; a[j] = t; }
    return a;
  }
  /** Da usare SEMPRE prima di spedire un pub sul canale: toglie i campi privati (_map del match e' la soluzione).
   *  L'host tiene il pub completo per il check e manda wire(pub) ai telefoni. */
  function wire(obj) { return JSON.parse(JSON.stringify(obj, function (k, v) { return typeof k === 'string' && k.charAt(0) === '_' ? undefined : v; })); }
  /** Valuta una risposta LATO HOST. value: gap/gapbank array di stringhe, mc/extra indice, missing {index,word},
   *  wrong {index,correction}, match array (per ogni riga di sinistra, l'indice scelto nella colonna destra pubblica).
   *  Ritorna { correct, frac (0..1, per il match parziale), detail }. */
  function checkItem(item, value, pub) {
    if (item.kind === 'match') {
      var map = (pub && pub._map) || [];
      var got = Array.isArray(value) ? value : [];
      var okN = 0;
      item.pairs.forEach(function (p, k) { if (map[got[k]] === k) okN++; });
      var frac = item.pairs.length ? okN / item.pairs.length : 0;
      return { correct: frac === 1, frac: frac, detail: { ok: okN, total: item.pairs.length } };
    }
    var res = EX.check({ type: item.kind, data: item.data }, value, {});
    return { correct: !!res.correct, frac: res.correct ? 1 : 0, detail: res.detail };
  }
  /** Testo della soluzione per la rivelazione sullo schermo. */
  function solutionText(item) {
    if (item.kind === 'match') return item.pairs.map(function (p) { return p.a + ' ↔ ' + p.b; }).join(' · ');
    return EX.solution({ type: item.kind, data: item.data });
  }

  // ---------- riduttore TEACHER-PACED (modalita' Kahoot) ----------
  function tpNew() { return { players: {}, i: -1, phase: 'lobby', answers: {}, opened: 0, ended: false }; }
  function tpJoin(st, p) { reduce(st, 'hello', p); }
  function tpOpen(st, i, now) { st.i = i; st.phase = 'question'; st.answers = {}; st.opened = now || Date.now(); }
  /** Una risposta: valuta, assegna i punti (serie per giocatore, tempo dal telefono), UNA sola per domanda. */
  function tpAnswer(st, msg, item, mode, pub) {
    if (st.phase !== 'question' || !msg || msg.i !== st.i || !msg.id || st.answers[msg.id]) return null;
    reduce(st, 'hello', { id: msg.id, nick: msg.nick });   // upsert del giocatore (rientri compresi)
    var pl = st.players[msg.id];
    var res = checkItem(item, msg.value, pub);
    var pts = 0;
    if (res.frac === 1) { pts = pointsFor(mode)(pl.streak || 0, msg.ms); pl.streak = (pl.streak || 0) + 1; pl.right++; }
    else if (res.frac > 0) { pts = Math.round(100 * res.frac); pl.streak = 0; }
    else pl.streak = 0;
    pl.score += pts; pl.at = st.i + 1;
    st.answers[msg.id] = { ok: res.correct, frac: res.frac, pts: pts };
    return { ok: res.correct, frac: res.frac, pts: pts };
  }
  function tpAllAnswered(st) {
    var ids = Object.keys(st.players);
    return ids.length > 0 && ids.every(function (id) { return !!st.answers[id]; });
  }
  /** Chiude la domanda: fase reveal + il pacchetto per i telefoni (esito per giocatore + top 5). */
  function tpReveal(st) {
    st.phase = 'reveal';
    var per = {};
    Object.keys(st.answers).forEach(function (id) { per[id] = { ok: st.answers[id].ok, pts: st.answers[id].pts }; });
    return { perPlayer: per, top: leaderboard(st).slice(0, 5) };
  }

  return { makePin: makePin, validPin: validPin, MODES: MODES, pointsFor: pointsFor, newState: newState, reduce: reduce, leaderboard: leaderboard, memBus: memBus, localBus: localBus,
    ITEM_KINDS: ITEM_KINDS, itemLabel: itemLabel, buildItem: buildItem, pubItem: pubItem, checkItem: checkItem, gapText: gapText, solutionText: solutionText, shuffleArr: shuffleArr, wire: wire,
    tpNew: tpNew, tpJoin: tpJoin, tpOpen: tpOpen, tpAnswer: tpAnswer, tpAllAnswered: tpAllAnswered, tpReveal: tpReveal };
});
