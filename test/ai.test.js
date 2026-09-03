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
    const mc = await AI.generateMC({ sentence: cSin.text, context: '', lang: 'it', apiKey: 'k', fetchImpl: fakeFetch, shuffle: false });
    assert.strictEqual(mc.options.length, 4); assert.strictEqual(mc.correct, 0); assert.strictEqual(mc.tricky, null);
    // di default le risposte vengono mescolate e la giusta non è mai "sempre la prima"
    let firsts = 0;
    for (let k = 0; k < 40; k++) {
      const m = await AI.generateMC({ sentence: cSin.text, context: '', lang: 'it', apiKey: 'k', fetchImpl: fakeFetch });
      assert.strictEqual(m.options[m.correct], 'Punti di contatto tra neuroni', 'indice della giusta rimappato');
      assert.deepStrictEqual(m.options.slice().sort(), mc.options.slice().sort(), 'stesse opzioni');
      if (m.correct === 0) firsts++;
    }
    assert.ok(firsts === 0, 'la giusta non resta in prima posizione');
    const sh = AI.shuffleMC(['a', 'b', 'c', 'd'], 0, 2, function () { return 0.99; });
    assert.strictEqual(sh.options[sh.correct], 'a'); assert.strictEqual(sh.options[sh.tricky], 'c');
    const tr = await AI.makeTricky({ question: mc.question, options: mc.options, correct: 0, sentence: cSin.text, lang: 'it', apiKey: 'k', fetchImpl: fakeFetch });
    assert.strictEqual(tr.index, 2); assert.ok(/rallentano/.test(tr.option));
    const built = EX.buildExercise('mc', cSin.text, { choices: { question: mc.question, options: mc.options, correct: 0, tricky: 2 } });
    assert.ok(built && built.data.tricky === 2 && EX.check(built, 0).correct && !EX.check(built, 2).correct);
  });

  await test('Parliamone DOPO il video: prima comprensione specifica ("check"), poi opinioni ancorate ("talk")', async function () {
    const fakeFetch = async function (url, opts) {
      const body = JSON.parse(opts.body);
      const u = body.messages[0].content;
      assert.ok(u.indexOf('AFTER the video') !== -1 && u.indexOf('COMPREHENSION') !== -1 && u.indexOf('SPECIFIC to this video') !== -1, 'il prompt chiede domande specifiche e di comprensione');
      assert.ok(u.indexOf('First 3 COMPREHENSION') !== -1 && u.indexOf('Then 2 DISCUSSION') !== -1, 'metà comprensione (arrotondata per eccesso), il resto discussione');
      const text = '{"questions":[{"kind":"check","text":"Secondo il video, perché il sonno serve alla memoria?","help":"Il video dice che… · Perché…"},{"kind":"talk","text":"","help":"x"},{"kind":"talk","text":"Il video dice che dormiamo poco: nel tuo paese è così?","help":"Da noi… · Secondo me…"},{"text":"Senza kind: è discussione","help":"Penso che…"}]}';
      return { ok: true, status: 200, json: async function () { return { model: body.model, usage: { input_tokens: 400, output_tokens: 120 }, content: [{ type: 'text', text: text }] }; }, text: async function () { return ''; } };
    };
    const r = await AI.suggestDiscussion({ chunks: chunks, lang: 'it', level: 'B1', n: 5, apiKey: 'k', fetchImpl: fakeFetch });
    assert.strictEqual(r.questions.length, 3, 'la domanda vuota viene scartata');
    assert.strictEqual(r.questions[0].kind, 'check');
    assert.strictEqual(r.questions[1].kind, 'talk');
    assert.strictEqual(r.questions[2].kind, 'talk', 'senza kind = discussione');
    assert.ok(/perché il sonno/.test(r.questions[0].text) && r.questions[0].help.split('·').length === 2);
    assert.ok(r.ai.cost > 0);
  });

  await test('Parliamone: rigenerare UNA domanda di un tipo preciso, senza ripetere le altre', async function () {
    const fakeFetch = async function (url, opts) {
      const body = JSON.parse(opts.body);
      const u = body.messages[0].content;
      assert.ok(u.indexOf('Write exactly 1 question in it') !== -1, 'una sola domanda');
      assert.ok(u.indexOf('COMPREHENSION questions') !== -1 && u.indexOf('DISCUSSION questions') === -1, 'solo il tipo richiesto (comprensione)');
      assert.ok(u.indexOf('Do NOT repeat or paraphrase these questions, already in use: "Perché dormiamo?"; "Cosa succede al cervello?"') !== -1, 'le altre domande vanno evitate');
      const text = '{"questions":[{"kind":"talk","text":"Quali fasi del sonno descrive il video?","help":"Il video dice che… · Prima… poi…"}]}';
      return { ok: true, status: 200, json: async function () { return { model: body.model, usage: { input_tokens: 300, output_tokens: 60 }, content: [{ type: 'text', text: text }] }; }, text: async function () { return ''; } };
    };
    const r = await AI.suggestDiscussion({ chunks: chunks, lang: 'it', level: 'B1', n: 1, kind: 'check', avoid: ['Perché dormiamo?', '', 'Cosa succede al cervello?'], apiKey: 'k', fetchImpl: fakeFetch });
    assert.strictEqual(r.questions.length, 1);
    assert.strictEqual(r.questions[0].kind, 'check', 'il tipo richiesto vince su quello scritto dal modello');
  });

  await test('Parliamone PRIMA del video (warmup): 3 domande di default, niente spoiler, kind "warmup"', async function () {
    const fakeFetch = async function (url, opts) {
      const body = JSON.parse(opts.body);
      const u = body.messages[0].content;
      assert.ok(u.indexOf('exactly 3 warm-up questions') !== -1, 'tre domande di default');
      assert.ok(u.indexOf('no spoilers') !== -1 && u.indexOf('for your eyes only') !== -1, 'il testo del video non va rivelato');
      assert.ok(u.indexOf('COMPREHENSION') === -1, 'nessuna domanda di comprensione prima del video');
      const text = '{"questions":[{"kind":"warmup","text":"Quante ore dormi di solito?","help":"Di solito… · Dipende…"},{"text":"Cosa sai del sonno?","help":"So che…"}]}';
      return { ok: true, status: 200, json: async function () { return { model: body.model, usage: { input_tokens: 400, output_tokens: 80 }, content: [{ type: 'text', text: text }] }; }, text: async function () { return ''; } };
    };
    const r = await AI.suggestDiscussion({ chunks: chunks, lang: 'it', level: 'B1', mode: 'warmup', apiKey: 'k', fetchImpl: fakeFetch });
    assert.strictEqual(r.questions.length, 2);
    assert.ok(r.questions.every(function (q) { return q.kind === 'warmup'; }), 'tutte warmup, anche senza kind nel JSON');
  });

  await test('Quiz: rigenerare UNA domanda senza ripetere le altre, e UNA risposta (giusta riformulata / distrattore nuovo)', async function () {
    const fakeFetch = async function (url, opts) {
      const body = JSON.parse(opts.body);
      const u = body.messages[0].content;
      assert.ok(u.indexOf('Write 1 multiple-choice question in it') !== -1, 'una sola domanda');
      assert.ok(u.indexOf('already in the quiz: "Come si saluta un amico?"; "Cosa si dice a tavola?"') !== -1, 'le altre domande vanno evitate');
      const text = '{"questions":[{"q":"Cosa si dice quando si riceve un regalo?","options":["Grazie mille!","Permesso?","In bocca al lupo!","Buon viaggio!"],"correct":0}]}';
      return { ok: true, status: 200, json: async function () { return { model: body.model, usage: { input_tokens: 300, output_tokens: 60 }, content: [{ type: 'text', text: text }] }; }, text: async function () { return ''; } };
    };
    const r = await AI.generateQuizSet({ chunks: chunks, lang: 'it', level: 'A2', n: 1, avoid: ['Come si saluta un amico?', '', 'Cosa si dice a tavola?'], apiKey: 'k', fetchImpl: fakeFetch });
    assert.strictEqual(r.questions.length, 1);
    assert.strictEqual(r.questions[0].options.length, 4);
    // una risposta: distrattore (indice 2, la giusta è 0)
    const fakeOpt = async function (url, opts) {
      const body = JSON.parse(opts.body);
      const u = body.messages[0].content;
      assert.ok(u.indexOf('QUESTION: Cosa si dice quando si riceve un regalo?') !== -1);
      assert.ok(u.indexOf('is a WRONG option (currently: "In bocca al lupo!")') !== -1, 'sa quale opzione sostituisce');
      assert.ok(u.indexOf('The correct answer is "Grazie mille!"') !== -1, 'conosce la giusta');
      assert.ok(u.indexOf('OTHER OPTIONS (keep them, do not repeat them): "Grazie mille!", "Permesso?", "Buon viaggio!"') !== -1, 'non ripete le altre');
      return { ok: true, status: 200, json: async function () { return { model: body.model, usage: { input_tokens: 200, output_tokens: 10 }, content: [{ type: 'text', text: '{"option":"Arrivederci!"}' }] }; }, text: async function () { return ''; } };
    };
    const o = await AI.generateQuizOption({ q: 'Cosa si dice quando si riceve un regalo?', options: ['Grazie mille!', 'Permesso?', 'In bocca al lupo!', 'Buon viaggio!'], correct: 0, index: 2, chunks: chunks, lang: 'it', level: 'A2', apiKey: 'k', fetchImpl: fakeOpt });
    assert.strictEqual(o.text, 'Arrivederci!');
    // la risposta giusta: va riformulata, non sostituita con una sbagliata
    const fakeCorrect = async function (url, opts) {
      const body = JSON.parse(opts.body);
      const u = body.messages[0].content;
      assert.ok(u.indexOf('is the CORRECT answer (currently: "Grazie mille!")') !== -1, 'sa che è la giusta');
      assert.ok(u.indexOf('formulated differently') !== -1);
      return { ok: true, status: 200, json: async function () { return { model: body.model, usage: { input_tokens: 200, output_tokens: 10 }, content: [{ type: 'text', text: '{"option":"Grazie, è bellissimo!"}' }] }; }, text: async function () { return ''; } };
    };
    const c = await AI.generateQuizOption({ q: 'Cosa si dice quando si riceve un regalo?', options: ['Grazie mille!', 'Permesso?', 'In bocca al lupo!', 'Buon viaggio!'], correct: 0, index: 0, topic: 'Le presentazioni', lang: 'it', apiKey: 'k', fetchImpl: fakeCorrect });
    assert.strictEqual(c.text, 'Grazie, è bellissimo!');
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

  console.log('Traduzione delle parole utili');
  const twFetch = function (vocab, calls) {
    return async function (url, opts) {
      const body = JSON.parse(opts.body);
      if (calls) calls.push(body);
      return { ok: true, status: 200, json: async function () { return { model: 'm', usage: { input_tokens: 400, output_tokens: 120 }, content: [{ type: 'text', text: JSON.stringify({ vocab: vocab }) }] }; }, text: async function () { return ''; } };
    };
  };
  await test('il modello deve ricopiare la parola esattamente com\'e\' stata mandata', async function () {
    const calls = [];
    await AI.translateWords({ words: ['i farmaci'], lang: 'it', support: 'en', apiKey: 'sk', fetchImpl: twFetch([{ word: 'i farmaci', translation: 'drugs' }], calls) });
    const u = calls[0].messages[0].content;
    assert.ok(/EXACTLY as it appears in WORDS/.test(u), 'glielo si chiede esplicitamente');
    assert.ok(!/dictionary form/.test(u), 'e non gli si chiede piu\' la forma del dizionario, che gli faceva togliere l\'articolo');
  });
  await test('la traduzione si aggancia anche se il modello toglie l\'articolo', async function () {
    // il caso segnalato: "i farmaci" chiesto, "farmaci" risposto -> prima si perdeva
    const r = await AI.translateWords({ words: ['i farmaci', 'il patrimonio'], lang: 'it', support: 'en', apiKey: 'sk', fetchImpl: twFetch([{ word: 'farmaci', translation: 'drugs' }, { word: 'patrimonio', translation: 'heritage' }]) });
    assert.deepStrictEqual(r.translations, { 'i farmaci': 'drugs', 'il patrimonio': 'heritage' });
  });
  await test('vale anche col "to" degli infiniti inglesi', async function () {
    const r = await AI.translateWords({ words: ['to clone'], lang: 'en', support: 'it', apiKey: 'sk', fetchImpl: twFetch([{ word: 'clone', translation: 'clonare' }]) });
    assert.deepStrictEqual(r.translations, { 'to clone': 'clonare' });
  });
  await test('se i nomi non combaciano affatto, vale l\'ordine delle risposte', async function () {
    const r = await AI.translateWords({ words: ['gli avanzi', 'lo spreco'], lang: 'it', support: 'en', apiKey: 'sk', fetchImpl: twFetch([{ word: 'leftover food', translation: 'leftovers' }, { word: 'wastefulness', translation: 'waste' }]) });
    assert.deepStrictEqual(r.translations, { 'gli avanzi': 'leftovers', 'lo spreco': 'waste' });
  });
  await test('se il modello risponde a meta\' e i nomi non combaciano, non si inventa niente', async function () {
    const r = await AI.translateWords({ words: ['gli avanzi', 'lo spreco'], lang: 'it', support: 'en', apiKey: 'sk', fetchImpl: twFetch([{ word: 'qualcosa di diverso', translation: 'something' }]) });
    assert.deepStrictEqual(r.translations, {}, 'meglio nessuna traduzione che una traduzione sbagliata');
  });

  console.log('Parliamone: i suggerimenti non contengono la risposta');
  const helpFetch = function (calls, help) {
    return async function (url, opts) {
      const body = JSON.parse(opts.body);
      if (calls) calls.push(body);
      const qs = { questions: [{ kind: 'check', text: 'Che cosa dice il video sul Mediterraneo?', help: help }] };
      return { ok: true, status: 200, json: async function () { return { model: 'm', usage: { input_tokens: 500, output_tokens: 200 }, content: [{ type: 'text', text: JSON.stringify(qs) }] }; }, text: async function () { return ''; } };
    };
  };
  await test('il prompt chiede attacchi di frase senza informazioni', async function () {
    const calls = [];
    await AI.suggestDiscussion({ chunks: chunks, lang: 'it', level: 'B1', n: 4, apiKey: 'sk', fetchImpl: helpFetch(calls, 'Secondo me…') });
    const u = calls[0].messages[0].content;
    assert.ok(/SENTENCE OPENERS/.test(u), 'devono essere attacchi di frase');
    assert.ok(/carry NO information/.test(u) && /never a fact, a name, a number/.test(u), 'e non devono portare informazioni');
    assert.ok(/stops being comprehension/.test(u), 'il modello deve sapere perché conta');
  });
  await test('gli spezzoni che contengono la risposta vengono buttati', async function () {
    // il caso segnalato: la "comprensione" arrivava con la risposta dentro i suggerimenti
    const leak = 'Il video dice che il Mediterraneo è il mare che si scalda più velocemente al mondo · Secondo il video…';
    const r = await AI.suggestDiscussion({ chunks: chunks, lang: 'it', level: 'B1', n: 1, kind: 'check', apiKey: 'sk', fetchImpl: helpFetch(null, leak) });
    assert.strictEqual(r.questions[0].help, 'Secondo il video…', 'resta solo l\'attacco di frase');
  });
  await test('niente cifre nei suggerimenti di una comprensione', async function () {
    const r = await AI.suggestDiscussion({ chunks: chunks, lang: 'it', level: 'B1', n: 1, kind: 'check', apiKey: 'sk', fetchImpl: helpFetch(null, 'Sono aumentati di 2 gradi · Il video dice che…') });
    assert.strictEqual(r.questions[0].help, 'Il video dice che…');
  });
  await test('se non resta niente, la comprensione va senza suggerimenti', async function () {
    const r = await AI.suggestDiscussion({ chunks: chunks, lang: 'it', level: 'B1', n: 1, kind: 'check', apiKey: 'sk', fetchImpl: helpFetch(null, 'Perché le correnti calde arrivano dall\'Atlantico e restano intrappolate') });
    assert.strictEqual(r.questions[0].help, '', 'meglio nessun suggerimento che un suggerimento che risponde');
  });
  await test('le domande di opinione tengono attacchi un po\' piu\' lunghi', async function () {
    const r = await AI.suggestDiscussion({ chunks: chunks, lang: 'it', level: 'B1', n: 1, kind: 'talk', apiKey: 'sk', fetchImpl: helpFetch(null, 'Non sono d\'accordo perché secondo me… · Nel mio paese…') });
    assert.strictEqual(r.questions[0].help.split(' · ').length, 2, 'per le opinioni un attacco piu\' articolato va bene');
  });

  console.log('Traduzione che non fa da soluzione');
  const trFetch = function (calls) {
    return async function (url, opts) {
      calls.push(JSON.parse(opts.body));
      return { ok: true, status: 200, json: async function () { return { model: 'm', usage: { input_tokens: 200, output_tokens: 60 }, content: [{ type: 'text', text: '{"translation":"Fish accustomed to cooler waters ___ ___, while…"}' }] }; }, text: async function () { return ''; } };
    };
  };
  await test('le parole da trovare non finiscono nella traduzione', async function () {
    const calls = [];
    await AI.translateSentence({ text: 'I pesci scappano verso nord', whole: true, lang: 'it', hide: ['scappano verso nord', 'abituati a vivere'], apiKey: 'sk', fetchImpl: trFetch(calls) });
    const u = calls[0].messages[0].content;
    assert.ok(u.indexOf('"scappano verso nord"') !== -1 && u.indexOf('"abituati a vivere"') !== -1, 'le parole da coprire arrivano al modello');
    assert.ok(u.indexOf('"___"') !== -1, 'devono uscire come ___');
    assert.ok(/synonym|paraphrase/.test(u), 'nemmeno un sinonimo o una parafrasi');
  });
  await test('a esercizio chiuso la traduzione torna intera', async function () {
    const calls = [];
    await AI.translateSentence({ text: 'I pesci scappano verso nord', whole: true, lang: 'it', hide: [], apiKey: 'sk', fetchImpl: trFetch(calls) });
    assert.ok(calls[0].messages[0].content.indexOf('___') === -1, 'niente mascheratura quando non c\'è più niente da nascondere');
  });
  await test('parola in più / sbagliata: si traduce quello che c\'è scritto, senza correggerlo', async function () {
    const calls = [];
    await AI.translateSentence({ text: 'I pesci scappano molto verso nord', whole: true, lang: 'it', literal: true, apiKey: 'sk', fetchImpl: trFetch(calls) });
    assert.ok(/must NOT correct it/.test(calls[0].messages[0].content), 'il modello non deve sistemare la frase da solo');
  });
  await test('quali parole coprire, per tipo di esercizio', function () {
    const gap = EX.buildExercise('gap', 'I pesci abituati al fresco scappano verso nord ogni anno adesso', { lang: 'it', seed: 3 });
    assert.ok(EX.hiddenWords(gap).length > 0, 'nel fill the gaps si copre quello che va scritto');
    const mc = { type: 'mc', data: { options: ['a', 'b'], correct: 0 } };
    assert.deepStrictEqual(EX.hiddenWords(mc), [], 'nella scelta multipla non c\'è niente da coprire nella frase');
    assert.deepStrictEqual(EX.hiddenWords({ type: 'extra', data: { extraWord: 'molto' } }), [], 'la parola di troppo è già sotto gli occhi');
    assert.deepStrictEqual(EX.hiddenWords({ type: 'wrong', data: { wrongWord: 'caldo', answer: 'fresco' } }), ['fresco'], 'la parola giusta resta coperta');
  });

  console.log('Unita di conversazione (senza video)');
  const convReply = function (over) {
    const u = {
      title: 'Cibo: cucinare, ordinare, sprecare',
      vocab: [{ it: 'fare la spesa', en: 'to do the shopping' }, { it: 'comodo ≠ scomodo', en: 'handy / awkward' }, { it: '', en: 'scartata' }],
      questions: [
        { text: 'Osserva la foto e descrivi che cosa vedi.', help: 'Nella foto c’è… · Secondo me…', ref: 'photo' },
        { text: 'Quante volte a settimana cucini?', help: 'Di solito… · Quasi mai…', ref: 'chart1' },
        { text: 'Leggi il testo n. 1: che cosa è cambiato?', help: 'Il testo dice che…', ref: 'text1' },
        { text: '', help: 'scartata', ref: null }
      ],
      charts: [{ title: 'Perché ordini cibo a domicilio?', rows: [{ label: 'Non ho tempo', pct: 64 }, { label: 'Mai', pct: 140 }, { label: '', pct: 9 }] }],
      texts: [{ kind: 'interview', title: '«Cucino per cento persone»', who: 'Maria Bellini, 41 anni, cuoca', body: 'Ho aperto la mia trattoria dodici anni fa.' },
      { kind: 'article', title: 'Che spreco!', body: 'Ogni anno finisce nella spazzatura un quinto del cibo.', quote: 'Lo spreco nasce al supermercato.' },
      { kind: 'article', title: 'terzo, da scartare', body: 'x' }],
      roleplay: { intro: 'Un tuo amico ordina cibo ogni sera.', steps: ['fatti raccontare…', 'spiegagli…', 'convincilo…', 'quarto di troppo'] },
      photos: [{ slot: 'top', query: 'man eating takeaway at laptop', alt: 'un uomo mangia davanti al computer' }, { slot: 'zzz', query: 'open fridge', alt: 'frigorifero' }, { slot: 'role', query: '', alt: 'scartata' }]
    };
    Object.assign(u, over || {});
    return u;
  };
  const convFetch = function (grab, over) {
    return async function (url, opts) {
      const body = JSON.parse(opts.body);
      if (grab) grab.push(body);
      return {
        ok: true, status: 200,
        json: async function () { return { model: body.model, usage: { input_tokens: 900, output_tokens: 2200 }, content: [{ type: 'text', text: JSON.stringify(convReply(over)) }] }; },
        text: async function () { return ''; }
      };
    };
  };

  await test('il prompt porta argomento, livello, lingue e focus grammaticale', async function () {
    const calls = [];
    await AI.generateConvUnit({ topic: 'Cibo e spreco', level: 'A2', n: 8, lang: 'it', uiLang: 'en', focus: 'congiuntivo', apiKey: 'sk', fetchImpl: convFetch(calls) });
    const u = calls[0].messages[0].content;
    assert.ok(u.indexOf('TOPIC: Cibo e spreco') !== -1);
    assert.ok(u.indexOf('STUDENT LEVEL (CEFR): A2') !== -1);
    assert.ok(u.indexOf('TEACHER / GLOSS LANGUAGE: en') !== -1);
    assert.ok(u.indexOf('congiuntivo') !== -1, 'il focus grammaticale deve arrivare al modello');
    assert.ok(u.indexOf('never announce it') !== -1, 'il focus non deve diventare un esercizio di grammatica');
  });
  await test('unita completa: lessico, domande con ref, grafici, testi, roleplay, foto', async function () {
    const r = await AI.generateConvUnit({ topic: 'Cibo', level: 'B1', n: 10, lang: 'it', apiKey: 'sk', fetchImpl: convFetch() });
    const u = r.unit;
    assert.strictEqual(u.title, 'Cibo: cucinare, ordinare, sprecare');
    assert.strictEqual(u.vocab.length, 2, 'le voci senza parola si scartano');
    assert.strictEqual(u.questions.length, 3, 'le domande vuote si scartano');
    assert.deepStrictEqual(u.questions.map(function (q) { return q.ref; }), ['photo', 'chart1', 'text1']);
    assert.strictEqual(u.texts.length, 2, 'al massimo due testi');
    assert.strictEqual(u.roleplay.steps.length, 3, 'il roleplay ha 3 passi');
    assert.ok(r.ai.cost > 0);
  });
  await test('i sondaggi restano etichettati come inventati e con percentuali valide', async function () {
    const r = await AI.generateConvUnit({ topic: 'Cibo', level: 'B1', n: 6, lang: 'it', apiKey: 'sk', fetchImpl: convFetch() });
    const c = r.unit.charts[0];
    assert.strictEqual(c.source, 'invented', 'i dati sono inventati: la pagina deve poterlo dichiarare');
    assert.deepStrictEqual(c.rows.map(function (x) { return x.pct; }), [64, 100], 'percentuali fuori scala corrette, righe senza etichetta scartate');
  });
  await test('i personaggi dei testi sono marcati come inventati', async function () {
    const r = await AI.generateConvUnit({ topic: 'Cibo', level: 'B1', n: 6, lang: 'it', apiKey: 'sk', fetchImpl: convFetch() });
    assert.ok(r.unit.texts.every(function (t) { return t.fiction === true; }));
    assert.strictEqual(r.unit.texts[0].who, 'Maria Bellini, 41 anni, cuoca');
  });
  await test('le foto tengono solo gli slot noti e con query', async function () {
    const r = await AI.generateConvUnit({ topic: 'Cibo', level: 'B1', n: 6, lang: 'it', apiKey: 'sk', fetchImpl: convFetch() });
    assert.strictEqual(r.unit.photos.length, 2, 'la foto senza query si scarta');
    assert.deepStrictEqual(r.unit.photos.map(function (p) { return p.slot; }), ['top', 'top'], 'slot sconosciuto ripiegato su top');
  });
  await test('senza argomento non si genera niente', async function () {
    let err = null;
    try { await AI.generateConvUnit({ topic: '  ', level: 'B1', apiKey: 'sk', fetchImpl: convFetch() }); } catch (e) { err = e; }
    assert.ok(err && /argomento/i.test(err.message));
  });
  await test('parti disattivabili: niente grafici, testi o roleplay nel prompt', async function () {
    const calls = [];
    const r = await AI.generateConvUnit({ topic: 'Cibo', level: 'B1', n: 6, lang: 'it', parts: { charts: false, texts: false, roleplay: false }, apiKey: 'sk', fetchImpl: convFetch(calls) });
    const u = calls[0].messages[0].content;
    assert.ok(u.indexOf('"charts"') === -1 && u.indexOf('"roleplay"') === -1);
    assert.strictEqual(r.unit.charts.length, 0);
    assert.strictEqual(r.unit.roleplay, null);
  });
  await test('rigenerazione di una sola domanda, senza ripetere le altre', async function () {
    const calls = [];
    const fake = async function (url, opts) {
      calls.push(JSON.parse(opts.body));
      return { ok: true, status: 200, json: async function () { return { model: 'm', usage: { input_tokens: 300, output_tokens: 120 }, content: [{ type: 'text', text: '{"text":"Nuova domanda?","help":"Secondo me…"}' }] }; }, text: async function () { return ''; } };
    };
    const r = await AI.regenerateConvPart({ what: 'question', unit: { title: 'Cibo', lang: 'it', level: 'B1', focus: 'congiuntivo' }, avoid: ['Quante volte cucini?'], note: 'piu personale', apiKey: 'sk', fetchImpl: fake });
    const u = calls[0].messages[0].content;
    assert.ok(u.indexOf('Quante volte cucini?') !== -1, 'le domande gia presenti vanno evitate');
    assert.ok(u.indexOf('piu personale') !== -1, 'la nota dell\'insegnante arriva al modello');
    assert.ok(u.indexOf('congiuntivo') !== -1);
    assert.strictEqual(r.value.text, 'Nuova domanda?');
  });
  await test('un pezzo sconosciuto non parte nemmeno', async function () {
    let err = null;
    try { await AI.regenerateConvPart({ what: 'boh', unit: {}, apiKey: 'sk', fetchImpl: async function () { throw new Error('non deve chiamare'); } }); } catch (e) { err = e; }
    assert.ok(err && /sconosciuto/.test(err.message));
  });

  console.log('\n' + passed + ' test superati' + (process.exitCode ? ', con errori' : ''));
})();
