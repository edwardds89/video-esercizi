/* Test del motore a regole: `node test/run.js` */
'use strict';
const assert = require('assert');
const L = require('../lang.js');
const EX = require('../exercises.js');
const G = require('../generator.js');
const F = require('./fixture.js');

let passed = 0;
function test(name, fn) {
  try { fn(); passed++; console.log('  ok  ' + name); }
  catch (e) { console.log('  FAIL ' + name + '\n       ' + (e && e.stack ? e.stack.split('\n').slice(0, 3).join('\n       ') : e)); process.exitCode = 1; }
}

const yt = F.youtubeTranscript();
const D = yt.duration;

console.log('Parser');
test('pannello YouTube: righe con timestamp e testo', function () {
  const p = G.parseTranscript(yt.text);
  assert.strictEqual(p.format, 'youtube');
  assert.ok(p.lines.length > 150, 'righe: ' + p.lines.length);
  for (let i = 1; i < p.lines.length; i++) assert.ok(p.lines[i].start >= p.lines[i - 1].start, 'tempi crescenti');
  p.lines.forEach(function (l) { assert.ok(l.end > l.start, 'fine > inizio'); });
  const noise = p.lines.filter(function (l) { return l.noise; });
  assert.strictEqual(noise.length, 1, '[Musica] riconosciuta come rumore');
  const joined = p.lines.map(function (l) { return l.text; }).join(' ');
  assert.ok(joined.indexOf('Come funziona il cervello') === -1, 'titolo capitolo scartato');
  assert.ok(joined.indexOf('ippocampo') !== -1, 'testo conservato');
});
test('formato inline "0:12 testo" e "[0:12] testo"', function () {
  const p = G.parseTranscript('0:00 ciao a tutti\n0:03 oggi parliamo di neuroni\n[0:07] e di sinapsi');
  assert.strictEqual(p.lines.length, 3);
  assert.strictEqual(p.lines[2].start, 7);
  assert.strictEqual(p.lines[1].text, 'oggi parliamo di neuroni');
});
test('SRT', function () {
  const s = F.srtTranscript();
  const p = G.parseTranscript(s.text);
  assert.strictEqual(p.format, 'srt');
  assert.strictEqual(p.lines.length, F.SENTENCES.length);
  assert.ok(Math.abs(p.lines[0].start - 2) < 0.01);
});
test('WebVTT', function () {
  const p = G.parseTranscript('WEBVTT\n\n00:01.000 --> 00:04.000\nHello <b>there</b>\n\n00:04.500 --> 00:08.000\nsecond line\n');
  assert.strictEqual(p.format, 'vtt');
  assert.strictEqual(p.lines[0].text, 'Hello there');
  assert.strictEqual(p.lines[1].start, 4.5);
});
test('trascrizione duplicata (letta due volte) → una copia sola; righe identiche → una', function () {
  const one = '0:00 Tutti ci laviamo i denti\n0:02 col dentifricio, ma in quanti\n0:04 sappiamo davvero a cosa serve\n0:06 il fluoro forma uno scudo\n0:08 protettivo sullo smalto dei denti.';
  const twice = G.parseTranscript(one + '\n' + one);
  assert.strictEqual(twice.lines.length, 5, 'copia doppia in coda');
  const rows = one.split('\n');
  const inter = G.parseTranscript(rows.map(function (r) { return r + '\n' + r; }).join('\n'));
  assert.strictEqual(inter.lines.length, 5, 'righe identiche adiacenti');
});
test('testo senza timestamp → formato sconosciuto', function () {
  const p = G.parseTranscript('solo testo senza tempi\naltra riga');
  assert.strictEqual(p.format, 'unknown');
  assert.strictEqual(p.lines.length, 0);
});

console.log('Chunk');
const lines = G.parseTranscript(yt.text).lines;
const chunks = G.annotate(G.buildChunks(lines, { duration: D, lang: 'it' }), { lang: 'it', duration: D });
test('chunk coerenti: id unici, tempi crescenti, lunghezze ragionevoli', function () {
  const ids = new Set(chunks.map(function (c) { return c.id; }));
  assert.strictEqual(ids.size, chunks.length);
  for (let i = 1; i < chunks.length; i++) assert.ok(chunks[i].start >= chunks[i - 1].end - 0.01, 'ordine ' + i);
  chunks.filter(function (c) { return !c.silence; }).forEach(function (c) { assert.ok(c.wordCount >= 1 && c.wordCount <= 22, 'parole: ' + c.wordCount); });
  assert.ok(chunks.some(function (c) { return c.silence; }), 'almeno un chunk di silenzio (musica / pausa)');
  assert.ok(chunks.some(function (c) { return c.cta; }), 'CTA riconosciute');
});
test('punteggi: intro e sponsor valgono poco, contenuto vale di più', function () {
  const intro = chunks.find(function (c) { return /bentornati/.test(c.text); });
  const sponsor = chunks.find(function (c) { return /codice sconto/.test(c.text); });
  const core = chunks.find(function (c) { return /plasticit/.test(c.text); });
  assert.ok(intro.value < core.value, 'intro < contenuto');
  assert.ok(sponsor.value < core.value, 'sponsor < contenuto');
  assert.ok(sponsor.exScore < core.exScore, 'sponsor non è una buona frase per esercizi');
});
test('tempi per parola', function () {
  const c = chunks.find(function (x) { return !x.silence && x.wordCount > 5; });
  const wt = G.wordTimes(c);
  assert.strictEqual(wt.length, c.lines.reduce(function (s, l) { return s + l.text.split(/\s+/).length; }, 0));
  assert.ok(wt[0].start >= c.start - 0.01 && wt[wt.length - 1].end <= c.end + 0.01);
});

console.log('Bozza');
const draft = G.generateDraft({ lines: lines, duration: D, n: 10, target: 600, types: G.ALL_TYPES, lang: 'it', seed: 7 });
test('10 esercizi, ordinati, distribuiti lungo il video', function () {
  assert.strictEqual(draft.exercises.length, 10, 'n = ' + draft.exercises.length);
  for (let i = 1; i < draft.exercises.length; i++) {
    assert.ok(draft.exercises[i].markerTime > draft.exercises[i - 1].markerTime, 'ordine');
    assert.ok(draft.exercises[i].markerTime - draft.exercises[i - 1].markerTime >= 15, 'distanza minima 15s');
  }
  const types = new Set(draft.exercises.map(function (e) { return e.type; }));
  assert.ok(types.size >= 4, 'varietà di tipi: ' + Array.from(types).join(','));
});
test('nessun esercizio su intro, sponsor o chiusura', function () {
  draft.exercises.forEach(function (e) {
    assert.ok(!/bentornati|iscrivetevi|codice sconto|link in descrizione|prossimo video/.test(e.sentence), e.sentence);
  });
});
test('tagli: durata effettiva vicina al target, tagli lunghi almeno 8s (salvo intro/outro), niente tagli sugli esercizi', function () {
  const st = draft.stats;
  assert.ok(Math.abs(st.effective - 600) <= 12, 'effettiva ' + st.effective.toFixed(1) + ' vs 600 (shortfall ' + st.shortfall.toFixed(1) + ')');
  draft.cuts.forEach(function (c) {
    const len = c.end - c.start;
    const edge = c.start <= 20 || c.end >= D - 45;
    assert.ok(len >= 8 || edge, 'taglio corto: ' + len.toFixed(1));
    draft.exercises.forEach(function (e) {
      assert.ok(e.segment.end <= c.start || e.segment.start >= c.end, 'frase dentro un taglio');
      assert.ok(!(e.markerTime >= c.start && e.markerTime < c.end), 'segnaposto dentro un taglio');
      assert.ok(e.segment.start - st.contextUsed >= c.end || e.segment.end <= c.start, 'contesto prima dell\'esercizio tagliato');
    });
  });
  assert.strictEqual(G.validateLesson({ cuts: draft.cuts, exercises: draft.exercises }).length, 0);
});
test('sponsor e intro finiscono nei tagli quando serve spazio', function () {
  const cut = function (re) { const c = chunks.find(function (x) { return re.test(x.text); }); return !!G.inCut(draft.cuts, (c.start + c.end) / 2); };
  assert.ok(cut(/codice sconto/), 'sponsor tagliato');
  assert.ok(cut(/iscrivetevi/), 'intro CTA tagliata');
});
test('target = durata → nessun taglio; target impossibile → shortfall dichiarato', function () {
  const a = G.generateDraft({ lines: lines, duration: D, n: 5, target: D, lang: 'it' });
  assert.strictEqual(a.cuts.length, 0);
  const b = G.generateDraft({ lines: lines, duration: D, n: 10, target: 60, lang: 'it' });
  assert.ok(b.stats.shortfall > 0, 'shortfall');
  assert.ok(b.stats.effective < D, 'ha comunque tagliato');
});
test('stesso seed → stessa bozza', function () {
  const a = G.generateDraft({ lines: lines, duration: D, n: 6, target: 500, lang: 'it', seed: 3 });
  const b = G.generateDraft({ lines: lines, duration: D, n: 6, target: 500, lang: 'it', seed: 3 });
  assert.deepStrictEqual(a.exercises.map(function (e) { return [e.chunkId, e.type, JSON.stringify(e.data)]; }), b.exercises.map(function (e) { return [e.chunkId, e.type, JSON.stringify(e.data)]; }));
});
test('n maggiore dei chunk disponibili non esplode', function () {
  const a = G.generateDraft({ lines: lines.slice(0, 12), duration: 40, n: 20, target: 30, lang: 'it' });
  assert.ok(a.exercises.length >= 1 && a.exercises.length <= 20);
});
test('frasi alternative vicine a un tempo', function () {
  const e = draft.exercises[3];
  const alts = G.alternatives(chunks, e.markerTime, { exclude: new Set([e.chunkId]), type: e.type, lang: 'it' });
  assert.ok(alts.length >= 2);
  alts.forEach(function (c) { assert.notStrictEqual(c.id, e.chunkId); });
});

console.log('Trascrizione reale (Geopop, con punteggiatura)');
const real = G.parseTranscript(require('fs').readFileSync(__dirname + '/fixture-neuralink.txt', 'utf8'));
test('parser: righe "0:07 testo", capitoli e [musica] in mezzo alla riga gestiti', function () {
  assert.ok(real.lines.length >= 90, 'righe ' + real.lines.length);
  assert.ok(!real.lines.some(function (l) { return /\[musica\]|Chapter/i.test(l.text); }));
  assert.ok(real.lines.filter(function (l) { return l.noise; }).length >= 5, 'righe di sola musica → rumore');
});
const realChunks = G.annotate(G.buildChunks(real.lines, { duration: 719, lang: 'it' }), { lang: 'it', duration: 719 });
test('modalità frasi: chunk allineati alla punteggiatura, mai troppo lunghi', function () {
  const sp = realChunks.filter(function (c) { return !c.silence; });
  assert.strictEqual(sp[0].mode, 'sentences');
  const punct = sp.filter(function (c) { return /[.!?…,;:]["'»)]*$/.test(c.text); }).length;
  assert.ok(punct / sp.length >= 0.7, 'chiusi da punteggiatura: ' + punct + '/' + sp.length);
  sp.forEach(function (c) { assert.ok(c.wordCount <= 26, 'chunk lungo: ' + c.wordCount); assert.ok(c.words && c.words.length === c.text.split(/\s+/).length, 'tempi per parola'); });
  assert.ok(sp.some(function (c) { return c.text === 'Ma voi vi fareste impiantare un chip nel cervello?'; }), 'prima frase intera');
});
test('bozza sulla trascrizione reale: niente CTA/sponsor tra gli esercizi, durata rispettata', function () {
  const d = G.generateDraft({ chunks: realChunks, lines: real.lines, duration: 719, n: 10, target: 540, lang: 'it', seed: 3 });
  assert.strictEqual(d.exercises.length, 10);
  d.exercises.forEach(function (e) { assert.ok(!/abbonarvi|abbonamento|meccenati|jopap|ringrazio|appuntamento/i.test(e.sentence), 'CTA: ' + e.sentence); });
  assert.ok(Math.abs(d.stats.effective - 540) <= 12, 'effettiva ' + d.stats.effective.toFixed(0));
  assert.ok(!d.cuts.some(function (c) { return c.end - c.start < 3; }), 'tagli ridicoli');
});

test('passaggi di lunghezza scelta: 20-30 e 30-40 parole, esercizi nell\'intervallo, senza CTA', function () {
  [[20, 30], [30, 40]].forEach(function (r) {
    const ps = G.passages(realChunks, { min: r[0], max: r[1], lang: 'it' });
    assert.ok(ps.length > 20, 'candidati ' + ps.length);
    ps.forEach(function (p) { assert.ok(p.wordCount >= r[0] && p.wordCount <= r[1], 'parole ' + p.wordCount); assert.strictEqual(L.words(p.text).length >= r[0], true); });
    const d = G.generateDraft({ chunks: realChunks, lines: real.lines, duration: 719, n: 6, target: 719, lang: 'it', seed: 3, range: r });
    assert.strictEqual(d.exercises.length, 6);
    d.exercises.forEach(function (e) {
      const wc = e.sentence.split(/\s+/).length;
      assert.ok(wc >= r[0] && wc <= r[1], 'esercizio con ' + wc + ' parole');
      assert.ok(!/abbonarvi|abbonamento|meccenati|jopap/i.test(e.sentence));
      assert.ok(e.chunkIds.length >= 1 && e.segment.end > e.segment.start);
    });
    const near = G.passagesNear(realChunks, 300, { range: r, lang: 'it', type: 'gap', exclude: new Set() });
    assert.ok(near.length >= 1);
  });
});

test('lunghezza consigliata ("smart"): fill the gaps su 22-32 parole con ≥3 spazi, frasi complete con maiuscola, gapbank con distrattori', function () {
  const d = G.generateDraft({ chunks: realChunks, lines: real.lines, duration: 719, n: 10, target: 719, lang: 'it', seed: 5, range: 'smart', types: ['gap', 'gapbank', 'scramble', 'missing', 'extra', 'wrong'] });
  assert.strictEqual(d.exercises.length, 10);
  d.exercises.forEach(function (e) {
    const wc = e.sentence.split(/\s+/).length;
    assert.ok(/^[^\p{L}]*\p{Lu}/u.test(e.sentence), 'maiuscola: ' + e.sentence);
    if (e.type === 'gap') { assert.ok(wc >= 22 && wc <= 32, 'gap ' + wc + ' parole'); assert.ok(e.data.gapIndices.length >= 3, 'almeno 3 spazi'); assert.ok(!e.data.wordBank, 'niente parole date'); }
    if (e.type === 'gapbank') { assert.ok(e.data.wordBank.length > e.data.answers.length, 'distrattori presenti'); assert.ok(e.data.gapIndices.length >= 3); }
    if (e.type === 'scramble') assert.ok(wc <= 24, 'scramble entro 24 parole: ' + wc);
  });
  const complete = d.exercises.filter(function (e) { return /[.!?…]["'»)]*$/.test(e.sentence); }).length;
  assert.ok(complete >= 8, 'frasi complete: ' + complete + '/10');
});

console.log('Esercizi');
const S = 'Il cervello umano contiene circa ottantasei miliardi di neuroni.';
test('gap fill: costruzione e correzione', function () {
  const ex = EX.buildExercise('gap', S, { lang: 'it', seed: 5 });
  assert.strictEqual(ex.type, 'gap');
  assert.ok(ex.data.gapIndices.length >= 3 && ex.data.gapIndices.length <= 6, 'spazi: ' + ex.data.gapIndices.length);
  assert.ok(ex.data.gapIndices.indexOf(0) === -1, 'mai la prima parola');
  const gb = EX.buildExercise('gapbank', S, { lang: 'it', seed: 5, vocab: ['fluoro', 'smalto', 'saliva', 'batteri'] });
  assert.strictEqual(gb.data.distractors.length, 2);
  assert.strictEqual(gb.data.wordBank.length, gb.data.answers.length + 2);
  assert.ok(EX.check(gb, gb.data.answers).correct);
  ex.data.answers.forEach(function (a) { assert.ok(L.isContent(a, 'it'), 'parola piena: ' + a); });
  assert.ok(EX.check(ex, ex.data.answers.map(function (a) { return a.toUpperCase(); })).correct, 'maiuscole ignorate');
  assert.ok(!EX.check(ex, ex.data.answers.map(function () { return 'xyz'; })).correct);
  const acc = EX.buildExercise('gap', 'La plasticità continua per tutta la vita.', { lang: 'it', seed: 1, choices: { gapWords: ['plasticità'] } });
  assert.deepStrictEqual(acc.data.answers, ['plasticità']);
  assert.ok(EX.check(acc, ['plasticita']).correct, 'accenti tollerati di default');
  assert.ok(!EX.check(acc, ['plasticita'], { strict: true }).correct, 'modalità rigorosa');
});
test('scrambled: mescolata diversa dall\'originale, correzione per sequenza', function () {
  const ex = EX.buildExercise('scramble', 'Oggi gioca a scacchi usando soltanto la mente.', { lang: 'it', seed: 2 });
  assert.notDeepStrictEqual(ex.data.shuffled, ex.data.words);
  assert.strictEqual(ex.data.words[0], 'oggi', 'iniziale minuscola');
  assert.ok(EX.check(ex, ex.data.words).correct);
  assert.ok(!EX.check(ex, ex.data.shuffled).correct);
  assert.strictEqual(EX.buildExercise('scramble', S + ' ' + S + ' ' + S, { lang: 'it' }), null, 'troppo lunga');
});
test('missing word', function () {
  const ex = EX.buildExercise('missing', S, { lang: 'it', seed: 9 });
  assert.ok(ex.data.missingIndex > 0 && ex.data.missingIndex < ex.data.tokens.length - 1);
  assert.ok(EX.check(ex, ex.data.answer).correct);
  assert.ok(!EX.check(ex, 'neurone').correct || ex.data.answer.toLowerCase() === 'neurone');
  const forced = EX.buildExercise('missing', S, { lang: 'it', choices: { missingWord: 'miliardi' } });
  assert.strictEqual(forced.data.answer, 'miliardi');
});
test('extra word: parola inserita, non duplicata accanto', function () {
  const ex = EX.buildExercise('extra', S, { lang: 'it', seed: 11 });
  assert.strictEqual(ex.data.shown.length, ex.data.original.length + 1);
  assert.strictEqual(ex.data.shown[ex.data.extraIndex], ex.data.extraWord);
  const n = L.normalize(ex.data.extraWord);
  assert.notStrictEqual(L.normalize(ex.data.shown[ex.data.extraIndex - 1]), n);
  assert.ok(EX.check(ex, ex.data.extraIndex).correct);
  assert.ok(!EX.check(ex, ex.data.extraIndex + 1).correct);
  const forced = EX.buildExercise('extra', S, { lang: 'it', choices: { extraWord: 'anche', extraAfter: 'contiene' } });
  assert.strictEqual(forced.data.shown[forced.data.extraIndex], 'anche');
  assert.strictEqual(L.normalize(forced.data.shown[forced.data.extraIndex - 1]), 'contiene');
});
test('wrong word: sostituzione plausibile, correzione richiede posizione e parola', function () {
  const ex = EX.buildExercise('wrong', S, { lang: 'it', seed: 4 });
  assert.ok(ex, 'costruito');
  assert.notStrictEqual(L.normalize(ex.data.shown[ex.data.wrongIndex]), L.normalize(ex.data.answer));
  assert.ok(EX.check(ex, { index: ex.data.wrongIndex, correction: ex.data.answer }).correct);
  assert.ok(!EX.check(ex, { index: ex.data.wrongIndex, correction: ex.data.wrongWord }).correct);
  assert.ok(!EX.check(ex, { index: 0, correction: ex.data.answer }).correct || ex.data.wrongIndex === 0);
  assert.strictEqual(EX.buildExercise('wrong', 'Neuroni sinapsi plasticità cervello.', { lang: 'it' }), null, 'senza parole sostituibili → null');
  const forced = EX.buildExercise('wrong', 'The brain has many neurons.', { lang: 'en', choices: { wrongWord: 'has', wrongReplacement: 'have' } });
  assert.strictEqual(forced.data.shown[forced.data.wrongIndex], 'have');
  assert.strictEqual(forced.data.answer, 'has');
});
test('inglese: generazione base', function () {
  const en = 'The first patient received the implant at the beginning of the year.';
  ['gap', 'scramble', 'missing', 'extra', 'wrong'].forEach(function (t) {
    const ex = EX.buildExercise(t, en, { lang: 'en', seed: 3 });
    assert.ok(ex, t);
  });
});
test('makeExercise ripiega su un altro tipo se quello richiesto non è applicabile', function () {
  const c = { id: 'c99', start: 10, end: 14, text: 'Neuroni sinapsi plasticità cervello.', lines: [] };
  const ex = G.makeExercise(c, 'wrong', { lang: 'it' });
  assert.ok(ex && ex.type !== 'wrong');
});

console.log('Parole utili e modalità automatica');
test('vocabCandidates: parole piene, priorità a quelle degli esercizi, niente avverbi comuni né articoli elisi', function () {
  const yt = F.youtubeTranscript();
  const lines = G.parseTranscript(yt.text).lines;
  const chunks = G.annotate(G.buildChunks(lines, { duration: yt.duration, lang: 'it' }), { lang: 'it', duration: yt.duration });
  const d = G.generateDraft({ chunks: chunks, lines: lines, duration: yt.duration, n: 8, target: 600, lang: 'it', range: 'smart' });
  const v = G.vocabCandidates(chunks, d.exercises, { lang: 'it', n: 12 });
  assert.strictEqual(v.length, 12);
  assert.ok(v[0].inExercises, 'la prima è negli esercizi');
  v.forEach(function (x) {
    assert.ok(x.word.length >= 4, x.word);
    assert.ok(!/^(molto|molte|direttamente|quindi|anche)$/.test(x.word), 'avverbio comune: ' + x.word);
    assert.ok(!/^[a-z]+'/.test(x.word), 'articolo eliso: ' + x.word);
  });
  const inEx = v.filter(function (x) { return x.inExercises; }).length;
  assert.ok(inEx >= 6, 'la maggior parte viene dalle frasi degli esercizi: ' + inEx);
});
test('modalità automatica: circa un esercizio ogni 40 s, distanza minima, solo frasi complete se la trascrizione ha la punteggiatura', function () {
  const fs = require('fs');
  const txt = fs.readFileSync(__dirname + '/fixture-neuralink.txt', 'utf8');
  const lines = G.parseTranscript(txt).lines;
  const d = G.generateDraft({ lines: lines, duration: 717, n: 'auto', target: 600, lang: 'it', range: 'smart' });
  const want = G.autoCount(600);
  assert.strictEqual(want, 15);
  assert.ok(d.exercises.length >= 9 && d.exercises.length <= want, 'numero: ' + d.exercises.length);
  for (let i = 1; i < d.exercises.length; i++) assert.ok(d.exercises[i].segment.start - d.exercises[i - 1].segment.end >= 25, 'distanza minima tra ' + (i) + ' e ' + (i + 1));
  d.exercises.forEach(function (e) { assert.ok(/^[A-ZÀ-Ü]/.test(e.sentence) && /[.!?…]["'»)]*$/.test(e.sentence), 'frase completa: ' + e.sentence.slice(0, 40)); });
  // trascrizione senza punteggiatura: non si può pretendere la frase completa, ma il numero resta simile
  const yt = F.youtubeTranscript();
  const d2 = G.generateDraft({ lines: G.parseTranscript(yt.text).lines, duration: yt.duration, n: 'auto', target: 600, lang: 'it', range: 'smart' });
  assert.ok(d2.exercises.length >= 10, 'senza punteggiatura: ' + d2.exercises.length);
});

console.log('\n' + passed + ' test superati' + (process.exitCode ? ', con errori' : ''));
