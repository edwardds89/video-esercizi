/* Test di classi, compiti e risultati (v125): `node test/classroom.test.js` */
'use strict';
const assert = require('assert');
const C = require('../classroom.js');

let passed = 0, pending = [];
function test(name, fn) {
  pending.push(Promise.resolve().then(fn).then(function () { passed++; console.log('  ok  ' + name); },
    function (e) { console.log('  FAIL ' + name + '\n       ' + (e && e.stack ? e.stack.split('\n').slice(0, 3).join('\n       ') : e)); process.exitCode = 1; }));
}
function mem() { const m = {}; return { getItem: function (k) { return k in m ? m[k] : null; }, setItem: function (k, v) { m[k] = String(v); } }; }

const LESSON = { id: 'L1', title: 'Pomodori', exercises: [
  { id: 'e1', type: 'gap', sentence: 'la polpa di pomodoro', data: { tokens: ['la', 'polpa', 'di', 'pomodoro'], gapIndices: [1, 3], answers: ['polpa', 'pomodoro'] } },
  { id: 'e2', type: 'mc', sentence: 'Di che colore?', data: { question: 'Di che colore?', options: ['rosso', 'blu', 'verde'], correct: 0 } },
  { id: 'e3', type: 'wrong', sentence: 'la polpa è rossa', data: { shown: ['la', 'polpa', 'è', 'verde'], wrongIndex: 3, wrongWord: 'verde', answer: 'rossa', original: ['la', 'polpa', 'è', 'rossa'] } },
  { id: 'e4', type: 'extra', sentence: 'molto buona', data: { shown: ['molto', 'la', 'buona'], extraIndex: 1, extraWord: 'la', original: ['molto', 'buona'] } }
] };

console.log('Codici, nomi, risposte');
test('codice: 6 caratteri senza 0/O/1/I, valido per la regola del database', function () {
  for (let i = 0; i < 200; i++) { const c = C.newCode(); assert.ok(/^[A-Z0-9]{6}$/.test(c)); assert.ok(!/[01OI]/.test(c), c); assert.ok(C.validCode(c)); }
  assert.ok(C.validCode(' abc234 '));
  assert.ok(!C.validCode('ABC'));
});
test('nomi: stessa persona anche con maiuscole, spazi e accenti diversi', function () {
  assert.strictEqual(C.normName('  Nicolò   ROSSI '), C.normName('nicolo rossi'));
  assert.ok(C.validName('Li Na')); assert.ok(!C.validName('  ')); assert.ok(!C.validName('12'));
});
test('risposte leggibili per ogni tipo', function () {
  assert.strictEqual(C.answerText(LESSON.exercises[0], ['polpo', '']), 'polpo | (vuoto)');
  assert.strictEqual(C.answerText(LESSON.exercises[1], 2), 'verde');
  assert.strictEqual(C.answerText(LESSON.exercises[2], { index: 3, correction: 'rosa' }), '"verde" → "rosa"');
  assert.strictEqual(C.answerText(LESSON.exercises[3], 0), '"molto"');
  assert.strictEqual(C.answerText({ type: 'scramble', data: {} }, ['la', 'polpa']), 'la polpa');
  assert.strictEqual(C.answerText({ type: 'missing', data: { tokens: ['la', 'polpa', 'rossa'] } }, { index: 2, word: 'è' }), '"è" dopo "polpa"');
});

console.log('Report');
function row(id, name, detail, finished, t) { return { id: id, student_name: name, detail: detail, finished: finished, started_at: t, updated_at: t }; }
test('tabella: stati per esercizio, punteggio, tentativo che vale, % per esercizio', function () {
  const rows = [
    row('r1', 'Anna Bianchi', { e1: { ok: true, tries: [{ a: 'polpa | pomodoro', ok: true }] }, e2: { ok: true, tries: [{ a: 'blu', ok: false }, { a: 'rosso', ok: true }] }, e3: { ok: false, how: 'revealed', tries: [{ a: '"verde" → "rosa"', ok: false }, { a: '"la" → "le"', ok: false }] }, e4: { ok: false, how: 'skipped', tries: [] } }, true, '2026-10-05T18:00:00Z'),
    row('r2', 'anna  bianchi', { e1: { ok: true, tries: [{ a: 'x', ok: true }] } }, false, '2026-10-05T19:00:00Z'),   // tentativo dopo, non finito: non vale
    row('r3', 'Bruno Verdi', { e1: { ok: false, how: 'revealed', tries: [{ a: 'pulpa | pomodoro', ok: false }] } }, false, '2026-10-05T18:30:00Z')
  ];
  const m = C.reportMatrix(LESSON, rows);
  assert.strictEqual(m.students.length, 2);
  const anna = m.students[0], bruno = m.students[1];
  assert.strictEqual(anna.name, 'Anna Bianchi'); assert.strictEqual(anna.attempts, 2); assert.strictEqual(anna.resultId, 'r1');
  assert.strictEqual(anna.score, 2); assert.strictEqual(anna.total, 4); assert.ok(anna.finished);
  assert.strictEqual(anna.cells.e1.state, 'ok'); assert.strictEqual(anna.cells.e2.state, 'ok-late'); assert.strictEqual(anna.cells.e3.state, 'ko'); assert.strictEqual(anna.cells.e4.how, 'skipped');
  assert.strictEqual(bruno.cells.e2.state, 'none'); assert.strictEqual(bruno.done, 1);
  assert.deepStrictEqual(m.perExercise.map(function (p) { return p.pct; }), [50, 100, 0, 0]);
  assert.strictEqual(m.exercises[1].solution, 'rosso');
});
test('nessun tentativo finito: vale quello più avanti', function () {
  const r = C.pickAttempt([row('a', 'x', { e1: { ok: true } }, false, '2026-01-02'), row('b', 'x', {}, false, '2026-01-03')]);
  assert.strictEqual(r.id, 'a');
});
test('CSV: una riga per studente, risposte sbagliate tra parentesi, separatore ;', function () {
  const m = C.reportMatrix(LESSON, [row('r1', 'Anna', { e3: { ok: false, how: 'revealed', tries: [{ a: 'x;y', ok: false }] } }, true, '2026-10-05T18:00:00Z')]);
  const csv = C.toCSV(m);
  assert.ok(csv.charCodeAt(0) === 0xfeff);
  const lines = csv.slice(1).split('\n');
  assert.strictEqual(lines.length, 2);
  assert.ok(lines[0].indexOf('Studente;Punteggio') === 0);
  assert.ok(lines[1].indexOf('"sbagliato (x;y)"') > 0, lines[1]);
});

console.log('Backend finto (stesse regole del vero)');
test('classe → compito → invio studente → report; compito chiuso rifiuta; id non cambia compito', async function () {
  const be = C.memoryBackend(mem());
  const cl = await be.createClass(' PoliMi   Lun-Mer ');
  assert.strictEqual(cl.name, 'PoliMi Lun-Mer');
  const a = await be.createAssignment({ class_id: cl.id, lesson_id: 'L1', title: 'Pomodori', lesson: LESSON });
  assert.ok(C.validCode(a.code)); assert.strictEqual(a.open, true);
  const got = await be.getAssignment(a.code.toLowerCase());
  assert.strictEqual(got.className, 'PoliMi Lun-Mer'); assert.strictEqual(got.lesson.exercises.length, 4);
  assert.strictEqual(await be.submitResult({ code: a.code, id: 'x1', name: 'Anna Bianchi', detail: { e1: { ok: true, tries: [] } }, score: 1, total: 4, finished: false }), true);
  assert.strictEqual(await be.submitResult({ code: a.code, id: 'x1', name: 'Anna Bianchi', detail: { e1: { ok: true, tries: [] } }, score: 1, total: 4, finished: true }), true);
  assert.strictEqual(await be.submitResult({ code: a.code, id: 'x1', name: 'Anna Bianchi', detail: {}, score: 0, total: 4, finished: false }), true);
  let rows = await be.listResults([a.id]);
  assert.strictEqual(rows.length, 1); assert.strictEqual(rows[0].finished, true, 'consegnato resta consegnato');
  const b2 = await be.createAssignment({ class_id: cl.id, lesson_id: 'L1', title: 'Altro', lesson: LESSON });
  await be.submitResult({ code: b2.code, id: 'x1', name: 'Hacker', detail: {}, score: 0, total: 4, finished: true });
  rows = await be.listResults([a.id]); assert.strictEqual(rows[0].student_name, 'Anna Bianchi', 'un id non passa a un altro compito');
  await be.updateAssignment(a.id, { open: false });
  assert.strictEqual(await be.submitResult({ code: a.code, id: 'x2', name: 'Bruno', detail: {}, score: 0, total: 4 }), false);
  const closed = await be.getAssignment(a.code);
  assert.strictEqual(closed.open, false); assert.strictEqual(closed.lesson, null, 'chiuso: la lezione non si scarica più');
  const counts = await be.countResults([a.id, b2.id]); assert.strictEqual(counts.length, 1);
  await be.deleteClass(cl.id);
  assert.strictEqual((await be.listAssignments()).length, 0); assert.strictEqual((await be.listResults([a.id])).length, 0);
});

Promise.all(pending).then(function () { console.log('\n' + passed + ' test passati' + (process.exitCode ? ', con errori' : '')); });
