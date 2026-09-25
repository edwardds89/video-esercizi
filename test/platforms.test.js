/* Test di "Importa da altre piattaforme" (v120): `node test/platforms.test.js` */
'use strict';
const assert = require('assert');
const P = require('../platforms.js');
const EX = require('../exercises.js');

let passed = 0;
function test(name, fn) {
  try { fn(); passed++; console.log('  ok  ' + name); }
  catch (e) { console.log('  FAIL ' + name + '\n       ' + (e && e.stack ? e.stack.split('\n').slice(0, 3).join('\n       ') : e)); process.exitCode = 1; }
}

// payload come lo produce il bookmarklet su una video-lezione ISLCollective (dati reali, lezione 1213463)
const ISL = {
  site: 'islcollective', id: '1213463', url: '/visual-comprehension/prediction-game/accidents/x/1213463',
  title: 'Come social e AI stanno rallentando il cervello', videoUrl: 'https://www.youtube.com/watch?v=0-Psvh3Hr-I',
  language: 'en', duration: 398, level: 'Intermediate (B1)', skips: [{ start: 363, end: 398 }],
  questions: [
    { type: 'Q_CORRECT_THE_WRONG_WORD', time: 20, hint: 12, data: { fakeWord: 'nelle', sentence: 'Ecco, tutto questo sembra essere collegato a un peggioramento #***# capacità cognitive, soprattutto nei più giovani…', answer: 'delle' } },
    { type: 'Q_SORTABLE', time: 66, hint: 58, data: { sentence: 'L’AI tendenzialmente trasforma un processo attivo in uno relativamente più passivo' } },
    { type: 'Q_GAP_FILL', time: 112, hint: 100, data: { parts: [{ gap: false, part: 'Nuovi studi,' }, { gap: true, part: "come quello dell'" }, { gap: false, part: 'UCSF mostrano che i ragazzi che passano una-tre ore al giorno sui social' }, { gap: true, part: 'performano peggio' }, { gap: false, part: 'in lettura...' }] } },
    { type: 'Q_FIND_THE_EXTRA_WORD', time: 163, hint: 153, data: { extraWord: { id: 6, text: 'e' }, sentence: 'Più social compulsivi, sempre più compulsivi #***# meno tempo per attività che fanno crescere la mente, come per esempio la lettura..' } },
    { type: 'Q_CORRECT_THE_WRONG_WORD', time: 360, hint: 351, data: { answer: 'alla', fakeWord: 'nella', sentence: 'Perché la nostra mente, secondo me, #***# fine soprattutto in un contesto creativo, è 10 spanne avanti. Questa è la mia considerazione...' } },
    { type: 'Q_SOMETHING_NEW', time: 300, hint: 290, data: { foo: 1 } }
  ]
};

console.log('ISLCollective → PauseLearn');
const out = P.convert(ISL, { lang: 'it' });
const ls = out.lesson;

test('lezione: titolo, video, livello, durata, tagli, origine', function () {
  assert.strictEqual(ls.title, 'Come social e AI stanno rallentando il cervello');
  assert.strictEqual(ls.videoId, '0-Psvh3Hr-I');
  assert.strictEqual(ls.level, 'B1');
  assert.strictEqual(ls.duration, 398);
  assert.deepStrictEqual(ls.cuts, [{ start: 363, end: 398 }]);
  assert.strictEqual(ls.importedFrom.site, 'islcollective');
  assert.strictEqual(ls.importedFrom.id, '1213463');
  assert.ok(Array.isArray(ls.lines) && !ls.lines.length, 'niente trascrizione inventata');
});
test('tipi sconosciuti finiscono in skipped, gli altri in ordine di tempo', function () {
  assert.strictEqual(out.skipped.length, 1);
  assert.strictEqual(out.skipped[0].type, 'Q_SOMETHING_NEW');
  assert.strictEqual(ls.exercises.length, 5);
  assert.deepStrictEqual(ls.exercises.map(function (e) { return e.type; }), ['wrong', 'scramble', 'gap', 'extra', 'wrong']);
  for (let i = 1; i < ls.exercises.length; i++) assert.ok(ls.exercises[i].markerTime > ls.exercises[i - 1].markerTime);
});
test('tempi: hint = inizio frase, time = pausa = segnaposto', function () {
  const e = ls.exercises[0];
  assert.deepStrictEqual(e.segment, { start: 12, end: 20 });
  assert.strictEqual(e.markerTime, 20);
  assert.strictEqual(e.reviewed, true);
});
test('parola sbagliata: la frase ha la parola giusta, lo studente vede quella finta', function () {
  const e = ls.exercises[0], d = e.data;
  assert.ok(e.sentence.indexOf('peggioramento delle capacità') !== -1);
  assert.strictEqual(d.shown[d.wrongIndex], 'nelle');
  assert.strictEqual(d.answer, 'delle');
  assert.strictEqual(d.wrongWord, 'nelle');
  assert.strictEqual(d.original[d.wrongIndex], 'delle');
  assert.ok(EX.check({ type: 'wrong', data: d }, { index: d.wrongIndex, correction: 'delle' }).correct);
});
test('parola in più: inserita dove ISL la metteva, frase originale senza', function () {
  const e = ls.exercises[3], d = e.data;
  assert.strictEqual(d.shown[d.extraIndex], 'e');
  assert.strictEqual(d.shown.length, d.original.length + 1);
  assert.strictEqual(e.sentence.indexOf(' e meno'), -1);
  assert.ok(EX.check({ type: 'extra', data: d }, d.extraIndex).correct);
});
test('completa gli spazi: buchi a più parole = indici adiacenti (una casella sola)', function () {
  const d = ls.exercises[2].data;
  assert.deepStrictEqual(d.gapIndices, [2, 3, 4, 18, 19]);
  assert.deepStrictEqual(d.answers, ['come', 'quello', 'dell', 'performano', 'peggio']);
  const runs = EX.gapRuns(d);
  assert.strictEqual(runs.length, 2);
  assert.strictEqual(runs[0].answer, 'come quello dell');
});
test('riordina: parole mescolate, mai nell\'ordine giusto', function () {
  const d = ls.exercises[1].data;
  assert.strictEqual(d.words.length, 11);
  assert.notDeepStrictEqual(d.words, d.shuffled);
  assert.deepStrictEqual(d.words.slice().sort(), d.shuffled.slice().sort());
});
test('maiuscola: la parola finta prende la maiuscola se la giusta era a inizio frase', function () {
  const r = P.fromISL({ site: 'islcollective', questions: [{ type: 'Q_CORRECT_THE_WRONG_WORD', time: 5, hint: 1, data: { sentence: '#***# ragazzi leggono poco.', answer: 'I', fakeWord: 'gli' } }] });
  assert.strictEqual(r.lesson.exercises[0].data.shown[0], 'Gli');
});
test('dati incoerenti (risposta non al posto del segnaposto) → skipped, non un esercizio rotto', function () {
  const r = P.fromISL({ site: 'islcollective', questions: [{ type: 'Q_CORRECT_THE_WRONG_WORD', time: 5, hint: 1, data: { sentence: 'Frase senza segnaposto.', answer: 'x', fakeWord: 'y' } }] });
  assert.strictEqual(r.lesson.exercises.length, 0);
  assert.strictEqual(r.skipped.length, 1);
});
test('piattaforma sconosciuta → errore chiaro', function () {
  assert.throws(function () { P.convert({ site: 'wordwall' }); }, /non supportata/);
});
test('islSlim: dalla risorsa ISL al payload piccolo, domande nascoste escluse', function () {
  const s = P.islSlim({ resourceId: 9, videoTitle: 'T', videoUrl: 'u', duration: 10, levels: [{ text: 'A2' }], skips: [], questions: [{ questionType: 'Q_SORTABLE', time: 3, hint: 1, questionData: { sentence: 'a b c d' } }, { hidden: true, questionType: 'Q_SORTABLE', time: 4, questionData: {} }] });
  assert.strictEqual(s.questions.length, 1);
  assert.strictEqual(s.id, '9');
  assert.strictEqual(s.level, 'A2');
});

console.log('\n' + passed + ' test passati' + (process.exitCode ? ', con errori' : ''));
