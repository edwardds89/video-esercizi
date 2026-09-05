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
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.VLChal = factory();
})(typeof self !== 'undefined' ? self : this, function () {
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

  return { makePin: makePin, validPin: validPin, MODES: MODES, pointsFor: pointsFor, newState: newState, reduce: reduce, leaderboard: leaderboard, memBus: memBus, localBus: localBus };
});
