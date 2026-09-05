// Test del motore della Sfida in classe (challenge.js): PIN, punteggi, classifica, protocollo sul bus finto.
'use strict';
const assert = require('assert');
const C = require('../challenge.js');

let n = 0;
function ok(name, fn) { fn(); n++; console.log('  ok  ' + name); }

ok('il PIN è di 6 caratteri leggibili, senza 0/O/1/I/L', function () {
  for (let i = 0; i < 200; i++) {
    const p = C.makePin();
    assert.ok(/^[A-HJ-KM-NP-Z2-9]{6}$/.test(p), p);
    assert.ok(!/[0O1IL]/.test(p), p);
    assert.ok(C.validPin(p), p);
  }
  assert.ok(!C.validPin('ABC10O'));
  assert.ok(!C.validPin('abcdef'));
});

ok('punteggio "solo giuste": sempre 100', function () {
  const f = C.pointsFor('right');
  assert.strictEqual(f(0, 0), 100);
  assert.strictEqual(f(9, 15000), 100);
});

ok('punteggio "giuste + serie": 100 + 20 a serie, tetto 200', function () {
  const f = C.pointsFor('streak');
  assert.strictEqual(f(0), 100);
  assert.strictEqual(f(2), 140);
  assert.strictEqual(f(5), 200);
  assert.strictEqual(f(11), 200);
});

ok('punteggio "giuste + velocità": subito 200, a 10 secondi (o senza tempo) 100', function () {
  const f = C.pointsFor('speed');
  assert.strictEqual(f(0, 0), 200);
  assert.strictEqual(f(0, 5000), 150);
  assert.strictEqual(f(0, 10000), 100);
  assert.strictEqual(f(0, 60000), 100);
  assert.strictEqual(f(0), 100);
});

ok('hello + score: la classifica ordina per punti, poi giuste, poi nome', function () {
  const st = C.newState();
  C.reduce(st, 'hello', { id: 'a', nick: 'Anna' });
  C.reduce(st, 'hello', { id: 'b', nick: 'Bruno' });
  C.reduce(st, 'hello', { id: 'c', nick: 'Carla' });
  C.reduce(st, 'score', { id: 'a', score: 300, right: 3, at: 3, total: 5 });
  C.reduce(st, 'score', { id: 'b', score: 300, right: 2, at: 4, total: 5 });
  C.reduce(st, 'score', { id: 'c', score: 500, right: 4, at: 4, total: 5, done: false });
  const rows = C.leaderboard(st);
  assert.deepStrictEqual(rows.map(function (r) { return r.nick; }), ['Carla', 'Anna', 'Bruno']);
  assert.deepStrictEqual(rows.map(function (r) { return r.rank; }), [1, 2, 3]);
});

ok('pari punti e pari giuste = pari rank', function () {
  const st = C.newState();
  C.reduce(st, 'score', { id: 'a', nick: 'Anna', score: 200, right: 2, at: 2, total: 4 });
  C.reduce(st, 'score', { id: 'b', nick: 'Bruno', score: 200, right: 2, at: 2, total: 4 });
  C.reduce(st, 'score', { id: 'c', nick: 'Carla', score: 100, right: 1, at: 2, total: 4 });
  const rows = C.leaderboard(st);
  assert.deepStrictEqual(rows.map(function (r) { return r.rank; }), [1, 1, 3]);
});

ok('chi ricarica il telefono non precipita: il punteggio registrato non scende mai', function () {
  const st = C.newState();
  C.reduce(st, 'score', { id: 'a', nick: 'Anna', score: 400, right: 4, at: 4, total: 5 });
  C.reduce(st, 'hello', { id: 'a', nick: 'Anna' });                       // rientro
  C.reduce(st, 'score', { id: 'a', score: 100, right: 1, at: 1, total: 5 });   // ricomincia da capo
  const a = st.players.a;
  assert.strictEqual(a.score, 400);
  assert.strictEqual(a.right, 4);
  assert.strictEqual(a.at, 4);
});

ok('uno score senza hello crea comunque il giocatore (host ricaricato a metà sfida)', function () {
  const st = C.newState();
  C.reduce(st, 'score', { id: 'x', nick: 'Ping', score: 220, right: 2, at: 2, total: 6, done: false });
  assert.strictEqual(C.leaderboard(st)[0].nick, 'Ping');
});

ok('il nickname viene tagliato a 20 caratteri', function () {
  const st = C.newState();
  C.reduce(st, 'hello', { id: 'a', nick: 'x'.repeat(50) });
  assert.strictEqual(st.players.a.nick.length, 20);
});

ok('protocollo sul bus finto: host + 2 studenti, quiz, punteggi, fine', function () {
  const bus = C.memBus();
  const PIN = C.makePin();
  const host = bus.join(PIN), s1 = bus.join(PIN), s2 = bus.join(PIN);
  const st = C.newState();
  const act = { type: 'quiz', title: 'Prova', data: { questions: [{ q: '2+2?', options: ['3', '4', '5', '6'], correct: 1 }] } };
  const sent = { quiz: 0, board: 0, end: 0 };
  host.on('hello', function (p) { C.reduce(st, 'hello', p); sent.quiz++; host.send('quiz', { act: act, mode: 'streak' }); });
  host.on('score', function (p) { C.reduce(st, 'score', p); sent.board++; host.send('board', { rows: C.leaderboard(st) }); });
  const got1 = {}, got2 = {};
  s1.on('quiz', function (p) { got1.quiz = p; });
  s2.on('quiz', function (p) { got2.quiz = p; });
  s1.on('board', function (p) { got1.board = p.rows; });
  s2.on('board', function (p) { got2.board = p.rows; });
  s1.on('end', function (p) { got1.end = p.rows; });
  s2.on('end', function (p) { got2.end = p.rows; });
  s1.send('hello', { id: 's1', nick: 'Anna' });
  s2.send('hello', { id: 's2', nick: 'Bruno' });
  assert.strictEqual(sent.quiz, 2);
  assert.strictEqual(got1.quiz.act.data.questions[0].q, '2+2?');
  assert.strictEqual(got2.quiz.mode, 'streak');
  s1.send('score', { id: 's1', nick: 'Anna', score: 120, right: 1, at: 1, total: 1, done: true });
  s2.send('score', { id: 's2', nick: 'Bruno', score: 0, right: 0, at: 1, total: 1, done: true });
  assert.strictEqual(got2.board[0].nick, 'Anna');
  assert.strictEqual(got2.board[0].rank, 1);
  host.send('end', { rows: C.leaderboard(st) });
  assert.strictEqual(got1.end.length, 2);
  assert.strictEqual(got1.end[1].nick, 'Bruno');
  host.close(); s1.close(); s2.close();
  // dopo close non arriva più niente
  s2.send('score', { id: 's2', score: 999 });
  assert.strictEqual(st.players.s2.score, 0);
});

// ---------- set multi-tipo e teacher-paced (v69) ----------

const FRASE = 'Il mare si sta riscaldando molto in fretta e questo preoccupa gli scienziati del clima.';

ok('buildItem costruisce i tipi delle lezioni e il match', function () {
  const gap = C.buildItem('gap', FRASE, { lang: 'it', seed: 3 });
  assert.strictEqual(gap.kind, 'gap');
  assert.ok(gap.data.answers.length >= 2);
  const mc = C.buildItem('mc', { q: 'Capitale?', options: ['Roma', 'Milano', 'Bari', 'Pisa'], correct: 0 });
  assert.strictEqual(mc.kind, 'mc');
  assert.strictEqual(mc.data.correct, 0);
  const ma = C.buildItem('match', [{ a: 'mare', b: 'sea' }, { a: 'cane', b: 'dog' }, { a: 'pane', b: 'bread' }]);
  assert.strictEqual(ma.pairs.length, 3);
  assert.strictEqual(C.buildItem('match', [{ a: 'solo', b: '' }]), null);
});

ok('pubItem via canale (wire) non fa MAI viaggiare le risposte', function () {
  const gap = C.buildItem('gap', FRASE, { lang: 'it', seed: 3 });
  const answers = gap.data.answers.map(function (a) { return a.toLowerCase(); });
  const pubGap = JSON.stringify(C.wire(C.pubItem(gap, { showQ: true }))).toLowerCase();
  answers.forEach(function (a) { assert.ok(pubGap.indexOf('"' + a + '"') === -1, 'risposta "' + a + '" trapelata: ' + pubGap); });
  assert.ok(pubGap.indexOf('_____') !== -1, 'con showQ c\'e\' la frase bucata');
  const senza = C.wire(C.pubItem(gap, { showQ: false }));
  assert.ok(!senza.sentence, 'senza showQ niente frase');
  assert.strictEqual(senza.runs.length, gap.data.answers.length ? C.pubItem(gap, {}).runs.length : 0);
  const mc = C.buildItem('mc', { q: 'Capitale?', options: ['Roma', 'Milano', 'Bari', 'Pisa'], correct: 0 });
  const pubMc = C.wire(C.pubItem(mc, { showQ: false }));
  assert.strictEqual(pubMc.options, undefined);
  assert.strictEqual(pubMc.q, undefined);
  assert.strictEqual(pubMc.n, 4);
  assert.strictEqual(JSON.stringify(pubMc).indexOf('correct'), -1);
  const ma = C.buildItem('match', [{ a: 'mare', b: 'sea' }, { a: 'cane', b: 'dog' }, { a: 'pane', b: 'bread' }]);
  const pubMa = C.pubItem(ma, { rand: function () { return 0.4; } });
  assert.ok(pubMa._map, 'il mapping resta all\'host');
  const wired = C.wire(pubMa);
  assert.strictEqual(wired._map, undefined, 'wire toglie il mapping: la soluzione non parte');
  assert.deepStrictEqual(wired.left, ['mare', 'cane', 'pane']);
});

ok('checkItem valuta lato host: gap, mc, extra, missing, wrong', function () {
  const gap = C.buildItem('gap', FRASE, { lang: 'it', seed: 3 });
  const runs = require('../exercises.js').gapRuns(gap.data);
  assert.ok(C.checkItem(gap, runs.map(function (r) { return r.answer; })).correct);
  assert.ok(!C.checkItem(gap, runs.map(function () { return 'zzz'; })).correct);
  const mc = C.buildItem('mc', { q: 'Capitale?', options: ['Roma', 'Milano', 'Bari', 'Pisa'], correct: 2 });
  assert.ok(C.checkItem(mc, 2).correct);
  assert.ok(!C.checkItem(mc, 0).correct);
  const ex2 = C.buildItem('extra', FRASE, { lang: 'it', seed: 5 });
  assert.ok(C.checkItem(ex2, ex2.data.extraIndex).correct);
  const mi = C.buildItem('missing', FRASE, { lang: 'it', seed: 5 });
  assert.ok(C.checkItem(mi, { index: mi.data.missingIndex, word: mi.data.answer }).correct);
  assert.ok(!C.checkItem(mi, { index: 0, word: mi.data.answer }).correct);
  const wr = C.buildItem('wrong', FRASE, { lang: 'it', seed: 5 });
  assert.ok(C.checkItem(wr, { index: wr.data.wrongIndex, correction: wr.data.answer }).correct);
});

ok('match: coppie parziali = frazione, tutte giuste = correct', function () {
  const ma = C.buildItem('match', [{ a: 'mare', b: 'sea' }, { a: 'cane', b: 'dog' }, { a: 'pane', b: 'bread' }]);
  const pub = C.pubItem(ma, { rand: function () { return 0; } });
  // risposta perfetta: per ogni riga k trovo dove sta la sua b nella colonna destra pubblica
  const perfetta = ma.pairs.map(function (p, k) { return pub._map.indexOf(k); });
  const full = C.checkItem(ma, perfetta, pub);
  assert.ok(full.correct && full.frac === 1);
  const unaGiusta = perfetta.map(function (v, k) { return k === 0 ? v : (v + 1) % 3 === v ? v + 1 : (v + 1) % 3; });
  const parz = C.checkItem(ma, [perfetta[0], -1, -1], pub);
  assert.ok(!parz.correct && Math.abs(parz.frac - 1 / 3) < 0.001, 'frazione: ' + parz.frac + ' (una su tre)');
  void unaGiusta;
});

ok('teacher-paced: apertura, una risposta a testa, punti con la serie, reveal', function () {
  const mc = C.buildItem('mc', { q: '2+2?', options: ['3', '4', '5', '6'], correct: 1 });
  const pub = C.pubItem(mc, {});
  const st = C.tpNew();
  C.tpJoin(st, { id: 'a', nick: 'Anna' });
  C.tpJoin(st, { id: 'b', nick: 'Bruno' });
  C.tpOpen(st, 0, 1000);
  const r1 = C.tpAnswer(st, { id: 'a', nick: 'Anna', i: 0, value: 1, ms: 2000 }, mc, 'streak', pub);
  assert.ok(r1.ok && r1.pts === 100, 'prima giusta di Anna: 100 (serie 0): ' + JSON.stringify(r1));
  assert.strictEqual(C.tpAnswer(st, { id: 'a', nick: 'Anna', i: 0, value: 0, ms: 100 }, mc, 'streak', pub), null, 'seconda risposta della stessa persona ignorata');
  assert.strictEqual(C.tpAnswer(st, { id: 'b', nick: 'Bruno', i: 9, value: 1, ms: 100 }, mc, 'streak', pub), null, 'risposta a una domanda diversa ignorata');
  assert.ok(!C.tpAllAnswered(st), 'manca Bruno');
  const r2 = C.tpAnswer(st, { id: 'b', nick: 'Bruno', i: 0, value: 0, ms: 500 }, mc, 'streak', pub);
  assert.ok(!r2.ok && r2.pts === 0);
  assert.ok(C.tpAllAnswered(st), 'tutti hanno risposto');
  const rev = C.tpReveal(st);
  assert.strictEqual(st.phase, 'reveal');
  assert.strictEqual(rev.perPlayer.a.pts, 100);
  assert.strictEqual(rev.top[0].nick, 'Anna');
  // seconda domanda: la serie di Anna vale il bonus
  C.tpOpen(st, 1, 2000);
  const r3 = C.tpAnswer(st, { id: 'a', nick: 'Anna', i: 1, value: 1, ms: 800 }, mc, 'streak', pub);
  assert.strictEqual(r3.pts, 120, 'serie 1 = 120: ' + JSON.stringify(r3));
  assert.strictEqual(st.players.a.score, 220);
  // risposta fuori fase (dopo il reveal) ignorata
  C.tpReveal(st);
  assert.strictEqual(C.tpAnswer(st, { id: 'b', nick: 'Bruno', i: 1, value: 1, ms: 100 }, mc, 'streak', pub), null);
});

ok('match parziale in teacher-paced: punti proporzionali, la serie si spezza', function () {
  const ma = C.buildItem('match', [{ a: 'mare', b: 'sea' }, { a: 'cane', b: 'dog' }, { a: 'pane', b: 'bread' }, { a: 'vino', b: 'wine' }]);
  const pub = C.pubItem(ma, { rand: function () { return 0; } });
  const st = C.tpNew();
  C.tpJoin(st, { id: 'a', nick: 'Anna' });
  st.players.a.streak = 3;
  C.tpOpen(st, 0, 0);
  const perfetta = ma.pairs.map(function (p, k) { return pub._map.indexOf(k); });
  const meta = perfetta.map(function (v, k) { return k < 2 ? v : -1; });
  const r = C.tpAnswer(st, { id: 'a', nick: 'Anna', i: 0, value: meta, ms: 100 }, ma, 'streak', pub);
  assert.strictEqual(r.pts, 50, 'due coppie su quattro = 50: ' + JSON.stringify(r));
  assert.strictEqual(st.players.a.streak, 0, 'serie azzerata senza il pieno');
});

console.log('\n' + n + ' test superati');
