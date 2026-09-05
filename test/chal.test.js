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

console.log('\n' + n + ' test superati');
