/* Test del livello AI con una risposta finta del modello: `node test/ai.test.js` */
'use strict';
const assert = require('assert');
const L = require('../lang.js');
const G = require('../generator.js');
const EX = require('../exercises.js');
const AI = require('../ai.js');
const F = require('./fixture.js');

let passed = 0;
function test(name, fn) {
  return Promise.resolve().then(fn).then(function () { passed++; console.log('  ok  ' + name); })
    .catch(function (e) { console.log('  FAIL ' + name + '\n       ' + (e && e.stack ? e.stack.split('\n').slice(0, 3).join('\n       ') : e)); process.exitCode = 1; });
}

const yt = F.youtubeTranscript();
const D = yt.duration;
const lines = G.parseTranscript(yt.text).lines;
const chunks = G.annotate(G.buildChunks(lines, { duration: D, lang: 'it' }), { lang: 'it', duration: D });
const find = function (re) { return chunks.find(function (c) { return !c.silence && re.test(c.text); }); };

(async function () {
  console.log('Prompt');
  await test('il prompt contiene parametri e chunk', function () {
    const m = AI.buildMessages({ chunks: chunks, n: 10, types: G.ALL_TYPES, lang: 'it', level: 'B1', duration: D, target: 600, focus: 'lessico del corpo' });
    assert.ok(m.system.length > 50);
    assert.ok(m.user.indexOf('NUMBER OF EXERCISES: 10') !== -1);
    assert.ok(m.user.indexOf('lessico del corpo') !== -1);
    assert.ok(m.user.indexOf('c1|') !== -1);
    assert.ok(m.user.indexOf('OUTPUT SCHEMA') !== -1);
  });
  await test('estrazione JSON robusta (fence, testo attorno, virgole finali)', function () {
    assert.deepStrictEqual(AI.extractJSON('```json\n{"a":1,}\n```'), { a: 1 });
    assert.deepStrictEqual(AI.extractJSON('Ecco il piano: {"a":[1,2]} fine'), { a: [1, 2] });
    assert.throws(function () { AI.extractJSON('niente'); });
  });

  console.log('Piano applicato');
  const cSin = find(/le sinapsi sono i punti/);
  const cPlast = find(/plasticit/);
  const cMus = find(/la musica attiva/);
  const cIpp = find(/ippocampo/);
  const cSponsor = find(/codice sconto/);
  const cCaff = find(/caffeina/);
  const cMed = find(/meditazione/);
  const cScuola = find(/la scuola dovrebbe/);
  assert.ok(cSin && cPlast && cMus && cIpp && cSponsor && cCaff && cMed && cScuola, 'chunk di test trovati');
  const nextOfMus = chunks[chunks.indexOf(cMus) + 1];
  // frase a cavallo: ultime parole di cMus + prime del successivo
  const musWords = cMus.text.split(' ');
  const nextWords = nextOfMus.text.split(' ');
  const straddle = musWords.slice(-4).concat(nextWords.slice(0, 4)).join(' ');

  const plan = {
    title: 'Il cervello e la memoria',
    exercises: [
      { chunk: cSin.id, type: 'gap', sentence: 'Le sinapsi sono i punti di contatto tra un neurone e l\'altro.', gaps: ['sinapsi', 'contatto'], why: 'lessico chiave' },
      { chunk: cPlast.id, type: 'scramble', sentence: 'questo fenomeno si chiama plasticità' },
      { chunk: cMus.id, type: 'missing', sentence: straddle, missing: nextWords[1] },
      { chunk: cIpp.id, type: 'extra', sentence: cIpp.text, extra: { word: 'anche', after: 'termine' } },
      { chunk: cCaff.id, type: 'wrong', sentence: cCaff.text, wrong: { word: 'dopo', replacement: 'prima' } },
      { chunk: 'c9999', type: 'gap', sentence: 'inesistente' },
      { chunk: cMed.id, type: 'gap', sentence: 'parole che non esistono nel chunk', gaps: ['parole'] }
    ],
    cuts: [
      { from: 'c1', to: 'c2', reason: 'intro' },
      { from: cSponsor.id, to: chunks[chunks.indexOf(cSponsor) + 1].id, reason: 'sponsor' },
      { from: cScuola.id, to: chunks[chunks.indexOf(cScuola) + 3].id, reason: 'digressione' },
      { from: cSin.id, to: cSin.id, reason: 'errore: taglio su un esercizio' }
    ],
    vocab: [
      { word: 'sinapsi', translation: 'synapse', inExercise: true },
      { word: 'Sinapsi', translation: 'dup' },
      { word: 'ippocampo', translation: 'hippocampus', emoji: '🧠', inExercise: false }, // campo estraneo: deve essere ignorato
      { word: '', translation: 'x' }, 'stringa', { word: 'caffeina', translation: 'caffeine' }
    ],
    notes: 'ok'
  };
  let applied;
  await test('esercizi validi costruiti dal piano, con frase punteggiata e a cavallo di due chunk', function () {
    applied = AI.applyPlan(plan, { chunks: chunks, lang: 'it', duration: D, target: 600, n: 8, types: G.ALL_TYPES });
    const e1 = applied.exercises.find(function (e) { return e.chunkId === cSin.id; });
    assert.ok(e1, 'esercizio sinapsi');
    assert.strictEqual(e1.type, 'gap');
    assert.deepStrictEqual(e1.data.answers.map(function (a) { return L.normalize(a); }), ['sinapsi', 'contatto']);
    assert.ok(/^Le sinapsi/.test(e1.sentence), 'frase con maiuscola e punteggiatura del modello');
    assert.ok(e1.segment.start >= cSin.start - 0.6 && e1.segment.end <= cSin.end + 0.7, 'tempi del segmento dentro il chunk');
    const e2 = applied.exercises.find(function (e) { return e.chunkId === cPlast.id; });
    assert.ok(e2 && e2.type === 'scramble' && e2.data.words.length === 5, 'frase parziale del chunk');
    assert.ok(e2.segment.end < cPlast.end + 0.7 && e2.segment.start > cPlast.start - 0.6);
    const e3 = applied.exercises.find(function (e) { return e.chunkId === cMus.id; });
    assert.ok(e3 && e3.type === 'missing', 'frase a cavallo');
    assert.ok(e3.segment.start > cMus.start + 1 && e3.segment.end > nextOfMus.start, 'segmento a cavallo dei due chunk');
    assert.strictEqual(L.normalize(e3.data.answer), L.normalize(nextWords[1]));
    const e4 = applied.exercises.find(function (e) { return e.chunkId === cIpp.id; });
    assert.ok(e4 && e4.type === 'extra' && e4.data.extraWord === 'anche');
    const e5 = applied.exercises.find(function (e) { return e.chunkId === cCaff.id; });
    assert.ok(e5 && e5.type === 'wrong' && e5.data.wrongWord === 'prima' && L.normalize(e5.data.answer) === 'dopo');
    assert.ok(!applied.exercises.some(function (e) { return e.chunkId === 'c9999'; }));
    const eMed = applied.exercises.find(function (e) { return e.chunkId === cMed.id; });
    assert.ok(eMed && L.normalize(eMed.sentence) === L.normalize(cMed.text), 'frase non trovata → chunk intero (con iniziale maiuscola)');
    assert.ok(applied.warnings.some(function (w) { return /inesistente/.test(w); }));
  });
  await test('completamento a n con le regole e ordinamento', function () {
    assert.strictEqual(applied.exercises.length, 8);
    for (let i = 1; i < applied.exercises.length; i++) assert.ok(applied.exercises[i].markerTime > applied.exercises[i - 1].markerTime);
    assert.ok(applied.exercises.some(function (e) { return e.source === 'rules'; }));
    assert.ok(applied.exercises.filter(function (e) { return e.source === 'ai'; }).length === 6);
  });
  await test('tagli: intro e sponsor applicati, taglio sull\'esercizio scartato, durata avvicinata al target', function () {
    assert.ok(G.inCut(applied.cuts, 5), 'intro tagliata');
    assert.ok(G.inCut(applied.cuts, (cSponsor.start + cSponsor.end) / 2), 'sponsor tagliato');
    applied.exercises.forEach(function (e) {
      applied.cuts.forEach(function (c) {
        assert.ok(e.segment.end <= c.start || e.segment.start >= c.end, 'esercizio dentro un taglio');
      });
    });
    assert.ok(Math.abs(applied.stats.effective - 600) <= 25, 'effettiva ' + applied.stats.effective.toFixed(0));
    assert.strictEqual(G.validateLesson({ cuts: applied.cuts, exercises: applied.exercises }).length, 0);
    assert.strictEqual(applied.title, 'Il cervello e la memoria');
  });

  await test('parole utili del piano: pulite, senza doppioni, senza campi estranei (niente emoji)', function () {
    assert.deepStrictEqual(applied.vocab.map(function (v) { return v.word; }), ['sinapsi', 'ippocampo', 'caffeina']);
    assert.strictEqual(applied.vocab[1].emoji, undefined);
    assert.strictEqual(applied.vocab[1].translation, 'hippocampus');
    assert.strictEqual(applied.vocab[0].inExercise, true);
  });
  await test('prompt: parole utili e modalità automatica', function () {
    const m = AI.buildMessages({ chunks: chunks, n: 12, auto: true, types: G.ALL_TYPES, lang: 'it', level: 'A2', duration: D, target: 600, support: 'en' });
    assert.ok(m.user.indexOf('USEFUL WORDS') !== -1 && m.user.indexOf('"vocab"') !== -1);
    assert.ok(m.user.indexOf('every 30-50 seconds') !== -1);
  });
  await test('modalità automatica: nessun completamento con le regole se il modello ne dà almeno la metà', function () {
    const a = AI.applyPlan(plan, { chunks: chunks, lang: 'it', duration: D, target: 600, n: 10, types: G.ALL_TYPES, auto: true });
    assert.strictEqual(a.exercises.filter(function (e) { return e.source === 'ai'; }).length, a.exercises.length, 'solo esercizi del modello');
    assert.ok(!a.warnings.some(function (w) { return /completati con le regole/.test(w); }));
  });
  await test('suggestVocab e translateWords con fetch finta', async function () {
    const fakeFetch = async function (url, opts) {
      const body = JSON.parse(opts.body);
      const isTr = body.messages[0].content.indexOf('WORDS:') !== -1;
      const text = isTr ? '{"vocab":[{"word":"corteccia","translation":"cortex"},{"word":"cellule","translation":"cells","emoji":"🧫"}]}'
        : '{"vocab":[{"word":"neurone","translation":"neuron","inExercise":true},{"word":"memoria","translation":"memory"}]}';
      return { ok: true, status: 200, json: async function () { return { model: body.model, usage: { input_tokens: 500, output_tokens: 100 }, content: [{ type: 'text', text: text }] }; }, text: async function () { return ''; } };
    };
    const sv = await AI.suggestVocab({ chunks: chunks, exercises: applied.exercises, lang: 'it', support: 'en', apiKey: 'k', fetchImpl: fakeFetch });
    assert.deepStrictEqual(sv.vocab.map(function (v) { return v.word; }), ['neurone', 'memoria']);
    const tr = await AI.translateWords({ words: ['corteccia', 'cellule', 'ignota'], lang: 'it', support: 'en', apiKey: 'k', fetchImpl: fakeFetch });
    assert.deepStrictEqual(tr.translations, { corteccia: 'cortex', cellule: 'cells' });
    assert.strictEqual(tr.emojis, undefined);
  });

  await test('scelta multipla: generateMC e makeTricky con fetch finta', async function () {
    const fakeFetch = async function (url, opts) {
      const body = JSON.parse(opts.body);
      const isTricky = body.messages[0].content.indexOf('Replace ONE of the wrong options') !== -1;
      const text = isTricky ? '{"index":2,"option":"Le sinapsi rallentano la memoria"}' : '{"question":"Cosa sono le sinapsi?","options":["Punti di contatto tra neuroni","Cellule del sangue","Ormoni","Ossa del cranio"],"correct":0,"tricky":null}';
      return { ok: true, status: 200, json: async function () { return { model: body.model, usage: { input_tokens: 300, output_tokens: 60 }, content: [{ type: 'text', text: text }] }; }, text: async function () { return ''; } };
    };
    const mc = await AI.generateMC({ sentence: cSin.text, context: '', lang: 'it', apiKey: 'k', fetchImpl: fakeFetch });
    assert.strictEqual(mc.options.length, 4); assert.strictEqual(mc.correct, 0); assert.strictEqual(mc.tricky, null);
    const tr = await AI.makeTricky({ question: mc.question, options: mc.options, correct: 0, sentence: cSin.text, lang: 'it', apiKey: 'k', fetchImpl: fakeFetch });
    assert.strictEqual(tr.index, 2); assert.ok(/rallentano/.test(tr.option));
    const built = EX.buildExercise('mc', cSin.text, { choices: { question: mc.question, options: mc.options, correct: 0, tricky: 2 } });
    assert.ok(built && built.data.tricky === 2 && EX.check(built, 0).correct && !EX.check(built, 2).correct);
  });

  console.log('Chiamata (fetch finta)');
  await test('generateWithAI con fetch simulata', async function () {
    const calls = [];
    const fakeFetch = async function (url, opts) {
      calls.push({ url: url, opts: opts });
      const body = JSON.parse(opts.body);
      assert.strictEqual(opts.headers['anthropic-dangerous-direct-browser-access'], 'true');
      assert.ok(body.messages[0].content.indexOf('c1|') !== -1);
      return {
        ok: true, status: 200,
        json: async function () { return { model: body.model, usage: { input_tokens: 4000, output_tokens: 1500 }, content: [{ type: 'text', text: '```json\n' + JSON.stringify(plan) + '\n```' }] }; },
        text: async function () { return ''; }
      };
    };
    const r = await AI.generateWithAI({ lines: lines, duration: D, target: 600, n: 8, types: G.ALL_TYPES, lang: 'it', level: 'B1', apiKey: 'sk-test', fetchImpl: fakeFetch });
    assert.strictEqual(calls.length, 1);
    assert.strictEqual(r.exercises.length, 8);
    assert.ok(r.ai.cost > 0 && r.ai.cost < 0.05, 'costo stimato ' + r.ai.cost);
  });
  await test('errore HTTP riportato in modo leggibile', async function () {
    const fakeFetch = async function () { return { ok: false, status: 401, text: async function () { return '{"error":{"message":"invalid x-api-key"}}'; } }; };
    let err = null;
    try { await AI.generateWithAI({ lines: lines, duration: D, target: 600, n: 5, lang: 'it', apiKey: 'bad', fetchImpl: fakeFetch }); } catch (e) { err = e; }
    assert.ok(err && /401/.test(err.message));
  });

  console.log('\n' + passed + ' test superati' + (process.exitCode ? ', con errori' : ''));
})();
