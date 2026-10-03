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
  assert.throws(function () { P.convert({ site: 'kahoot' }); }, /non supportata/);
});
test('islSlim: dalla risorsa ISL al payload piccolo, domande nascoste escluse', function () {
  const s = P.islSlim({ resourceId: 9, videoTitle: 'T', videoUrl: 'u', duration: 10, levels: [{ text: 'A2' }], skips: [], questions: [{ questionType: 'Q_SORTABLE', time: 3, hint: 1, questionData: { sentence: 'a b c d' } }, { hidden: true, questionType: 'Q_SORTABLE', time: 4, questionData: {} }] });
  assert.strictEqual(s.questions.length, 1);
  assert.strictEqual(s.id, '9');
  assert.strictEqual(s.level, 'A2');
});

console.log('Rilevamento lingua (v122)');
test('lezione italiana → it, sicuro (il campo language ISL dice "en" e va ignorato)', function () {
  const d = P.detectLanguage(ISL);
  assert.strictEqual(d.lang, 'it');
  assert.ok(d.sure, JSON.stringify(d.score));
});
test('lezione inglese → en, sicuro', function () {
  const en = { site: 'islcollective', title: 'Despicable Me 2 - Simple Present', questions: [
    { type: 'Q_GAP_FILL', time: 10, hint: 5, data: { parts: [{ gap: false, part: 'The girls are in the kitchen and' }, { gap: true, part: 'they are making' }, { gap: false, part: 'breakfast for the whole family.' }] } },
    { type: 'Q_SORTABLE', time: 20, hint: 15, data: { sentence: 'He does not want to go to the party with them' } },
    { type: 'Q_CORRECT_THE_WRONG_WORD', time: 30, hint: 25, data: { sentence: 'She #***# a very good friend of mine.', answer: 'is', fakeWord: 'are' } }
  ] };
  const d = P.detectLanguage(en);
  assert.strictEqual(d.lang, 'en');
  assert.ok(d.sure, JSON.stringify(d.score));
});
test('poche parole → non sicuro', function () {
  const d = P.detectLanguage({ site: 'islcollective', title: 'x', questions: [{ type: 'Q_SORTABLE', time: 1, hint: 0, data: { sentence: 'Zoo tigre leone' } }] });
  assert.strictEqual(d.sure, false);
});
test('la lingua scelta finisce nella lezione', function () {
  assert.strictEqual(P.convert(ISL, { lang: 'en' }).lesson.lang, 'en');
});

console.log('Scelta multipla ISL (v123)');
test('Q_MULTI_SELECT con una sola "right" → mc con correct giusto (dati reali, Neuralink 1242627)', function () {
  const r = P.fromISL({ site: 'islcollective', questions: [{ type: 'Q_MULTI_SELECT', time: 194, hint: 181, question: 'Che cosa evita il robot?', data: { options: [{ text: 'I fili', right: false }, { text: 'I vasi sanguigni', right: true }, { text: 'Gli elettrodi', right: false }, { text: 'I chirurghi', right: false }] } }] });
  const e = r.lesson.exercises[0];
  assert.strictEqual(e.type, 'mc');
  assert.strictEqual(e.data.correct, 1);
  assert.strictEqual(e.data.options[1], 'I vasi sanguigni');
  assert.strictEqual(e.data.question, 'Che cosa evita il robot?');
});
test('Q_MULTI_SELECT con più risposte giuste → skipped (PauseLearn ha una sola risposta)', function () {
  const r = P.fromISL({ site: 'islcollective', questions: [{ type: 'Q_MULTI_SELECT', time: 10, hint: 5, question: 'Quali?', data: { options: [{ text: 'a', right: true }, { text: 'b', right: true }, { text: 'c', right: false }] } }] });
  assert.strictEqual(r.lesson.exercises.length, 0);
  assert.strictEqual(r.skipped.length, 1);
});

// ---------- Wayground (v126): struttura reale di /api/main/quiz/616ed46792065b001d1dac51 ("Verbi Regolari Presente") ----------
const CH = require('../challenge.js');
const WG_API = { data: { quiz: { _id: '616ed46792065b001d1dac51', info: { name: 'Verbi Regolari Presente', lang: 'Italian', questions: [
  { _id: 'q1', type: 'BLANK', structure: { settings: { ignoreAccentMarksForEvaluation: false }, query: { text: '<p>Francesca (lavorare) <blank id="ab001d45b8ed"></blank> al supermercato.</p>' }, options: [{ id: '616ed7c8ead6ab001d45b8e0', text: 'lavora' }], answer: [{ targetId: 'ab001d45b8ed', optionId: ['616ed7c8ead6ab001d45b8e0'] }], explain: { text: '' } } },
  { _id: 'q2', type: 'BLANK', structure: { settings: { ignoreAccentMarksForEvaluation: false }, query: { text: '<p>Andrea (finire) <blank id="ca001dc8da65"></blank> di lavorare alle 17:00.</p>' }, options: [{ id: 'o2', text: 'finisce' }], answer: [{ targetId: 'ca001dc8da65', optionId: ['o2'] }], explain: { text: '<p>Finire, like capire, takes -isc-</p>' } } },
  { _id: 'q3', type: 'BLANK', structure: { settings: {}, query: { text: '<p>A che ora (tu/arrivare) <blank id="b3"></blank>?</p>' }, options: [{ id: 'o3', text: 'arrivi' }], answer: [{ targetId: 'b3', optionId: ['o3'] }] } },
  { _id: 'q4', type: 'MCQ', structure: { settings: {}, query: { text: '<p>Lei &egrave; ___.</p>' }, options: [{ id: 'a', text: '<p>italiana</p>' }, { id: 'b', text: 'italiano' }], answer: 0 } },
  { _id: 'q5', type: 'MATCH', structure: { query: { text: 'x' }, options: [], answer: [] } }
] } } } };
test('Wayground: wgSlim + fromWayground → set di esercizi con lo spazio dove l\'ha messo l\'autore', function () {
  const slim = P.wgSlim(WG_API.data);
  assert.strictEqual(slim.site, 'wayground'); assert.strictEqual(slim.questions.length, 5);
  const r = P.convert(slim, { lang: 'it' });
  assert.ok(r.set && !r.lesson);
  assert.strictEqual(r.set.title, 'Verbi Regolari Presente');
  assert.strictEqual(r.set.items.length, 4);
  assert.deepStrictEqual(r.skipped, [{ n: 5, type: 'MATCH' }]);
  const g = r.set.items[0];
  assert.strictEqual(g.kind, 'gap');
  assert.deepStrictEqual(g.data.tokens, ['Francesca', '(lavorare)', 'lavora', 'al', 'supermercato.']);
  assert.deepStrictEqual(g.data.gapIndices, [2]);
  assert.strictEqual(CH.gapText(g), 'Francesca (lavorare) _____ al supermercato.');
  assert.strictEqual(g.strict, true);
  assert.strictEqual(r.set.items[1].explain, 'Finire, like capire, takes -isc-');
  assert.deepStrictEqual(r.set.items[2].data.tokens.slice(-2), ['arrivi', '?']);
  const mc = r.set.items[3];
  assert.strictEqual(mc.kind, 'mc'); assert.strictEqual(mc.data.question, 'Lei è ___.'); assert.deepStrictEqual(mc.data.options, ['italiana', 'italiano']); assert.strictEqual(mc.data.correct, 0);
  assert.strictEqual(r.set.importedFrom.id, '616ed46792065b001d1dac51');
  assert.strictEqual(P.detectLanguage(slim, ['it', 'en']).lang, 'it');
});
test('Wayground: correzione (maiuscole libere, accenti che contano se il quiz lo chiede)', function () {
  const r = P.fromWayground(P.wgSlim(WG_API.data));
  assert.strictEqual(CH.checkItem(r.set.items[0], ['Lavora']).correct, true);
  assert.strictEqual(CH.checkItem(r.set.items[0], ['lavori']).correct, false);
  const acc = { kind: 'gap', strict: true, data: { tokens: ['Lui', 'è', 'qui'], gapIndices: [1], answers: ['è'] } };
  assert.strictEqual(CH.checkItem(acc, ['e']).correct, false);
  assert.strictEqual(CH.checkItem(acc, ['è']).correct, true);
  delete acc.strict;
  assert.strictEqual(CH.checkItem(acc, ['e']).correct, true);
});
test('Wayground: MSQ con più giuste, risposte solo-immagine → skipped', function () {
  const r = P.fromWayground({ questions: [
    { id: 'a', type: 'MSQ', html: 'Quali?', options: [{ id: '1', text: 'x' }, { id: '2', text: 'y' }], answer: [0, 1] },
    { id: 'b', type: 'MCQ', html: 'Quale?', options: [{ id: '1', text: '' }, { id: '2', text: 'y' }], answer: 1 },
    { id: 'c', type: 'MSQ', html: 'Quale?', options: [{ id: '1', text: 'x' }, { id: '2', text: 'y' }], answer: [1] }] });
  assert.strictEqual(r.set.items.length, 1); assert.strictEqual(r.set.items[0].data.correct, 1);
  assert.strictEqual(r.skipped.length, 2);
});

test('Wordwall: coppie con ___ → completa gli spazi (con foto), coppie semplici → abbina', function () {
  const model = { templateId: 3, content: { pairs: [
    { primary: { text: '<n>rimango</n>', image: null }, secondary: { text: '<n>Io (rimanere) ___ a scuola nel pomeriggio.</n>', image: 'user/1/abc' } },
    { primary: { text: '<n>dici</n>' }, secondary: { text: '<n>Tu non (dire) ___ la verità!</n>' } },
    { primary: { text: '<n>casa</n>' }, secondary: { text: '<n>house</n>' } }, { primary: { text: '<n>cane</n>' }, secondary: { text: '<n>dog</n>' } } ] } };
  const slim = P.wwSlim({ activityId: 7, activityTitle: 'Presente' }, model);
  assert.strictEqual(slim.site, 'wordwall'); assert.strictEqual(slim.pairs.length, 4); assert.strictEqual(slim.pairs[0].a, 'rimango');
  const r = P.convert(slim, { lang: 'it' });
  assert.strictEqual(r.set.items.length, 3);
  assert.strictEqual(r.set.items[0].kind, 'gap'); assert.strictEqual(r.set.items[0].sentence, 'Io (rimanere) rimango a scuola nel pomeriggio.');
  assert.deepStrictEqual(r.set.items[0].data.answers, ['rimango']);
  assert.strictEqual(r.set.items[0].image, 'https://user.cdn.wordwall.net/content-images/user/1/abc');
  assert.strictEqual(r.set.items[1].sentence, 'Tu non (dire) dici la verità!');
  assert.strictEqual(r.set.items[2].kind, 'match'); assert.strictEqual(r.set.items[2].pairs.length, 2);
  assert.strictEqual(r.set.importedFrom.site, 'wordwall');
  assert.strictEqual(P.wwSlim({ activityId: 7 }, { templateId: 5, content: { questions: [] } }), null);
});

console.log('\n' + passed + ' test passati' + (process.exitCode ? ', con errori' : ''));
