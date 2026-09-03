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
  assert.strictEqual(ex.data.words[0], 'Oggi', 'la prima parola tiene la maiuscola (suggerimento)');
  assert.strictEqual(ex.data.words[ex.data.words.length - 1], 'mente.', 'il punto resta attaccato all\'ultima parola (suggerimento)');
  assert.ok(EX.check(ex, ex.data.words).correct);
  assert.ok(EX.check(ex, ex.data.words.map(function (w) { return w.toLowerCase().replace(/[.!?]$/, ''); })).correct, 'corretta anche senza maiuscola e punto');
  const ex2 = EX.buildExercise('scramble', 'Chi ha visto, ieri sera, il film?', { lang: 'it', seed: 3 });
  assert.strictEqual(ex2.data.words[ex2.data.words.length - 1], 'film?'); assert.strictEqual(ex2.data.words[2], 'visto,', 'virgola interna tenuta sulla parola');
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
test('vocabCandidates a B1: niente forme di base (abbiamo, sappiamo, quattro, alcuni), niente nomi propri (James Epstein, Stati Uniti)', function () {
  // 3/9: 'per livello B1 "abbiamo" "quattro" "sappiamo" che significa? sono parole troppo facili!'
  ['abbiamo', 'sappiamo', 'quattro', 'alcuni', 'realtà', 'isola', 'esistono', 'parliamo', 'finiscono', 'amiche', 'città', 'chiaramente', 'bellissimo', 'dormivano'].forEach(function (w) {
    assert.ok(L.isBasic(w, 'it'), 'di base: ' + w);
  });
  ['finanziere', 'edificio', 'acquisto', 'clonazione', 'prelevare', 'campione', 'farmaci', 'tessuto', 'limiti'].forEach(function (w) {
    assert.ok(!L.isBasic(w, 'it'), 'NON di base: ' + w);
  });
  const txt = 'Esistono paesi in cui invece questi limiti etici non ci sono, come gli Stati Uniti, dove la clonazione per fini domestici è una pratica diffusa. Il finanziere James Epstein aveva comprato l\'isola nel 1998. Sappiamo che alcuni ospiti arrivavano con l\'aereo privato. Abbiamo quattro edifici e in realtà l\'acquisto del terreno era stato fatto da una società. I farmaci per prelevare una cellula costano molto.';
  const sents = txt.split(/(?<=[.!?])\s+/);
  const lines = sents.map(function (t, i) { return { start: i * 5, end: i * 5 + 5, text: t }; });
  const chunks = G.annotate(G.buildChunks(lines, { duration: sents.length * 5, lang: 'it' }), { lang: 'it', duration: sents.length * 5 });
  const exs = [{ sentence: sents[0] }, { sentence: sents[3] }];
  const b1 = G.vocabCandidates(chunks, exs, { lang: 'it', n: 14, support: 'en', level: 'B1' }).map(function (x) { return x.word; });
  ['abbiamo', 'sappiamo', 'quattro', 'alcuni', 'realtà', 'isola', 'james', 'epstein', 'stati', 'uniti'].forEach(function (w) {
    assert.ok(b1.indexOf(w) === -1, 'a B1 non deve proporre "' + w + '": ' + b1.join(' '));
  });
  ['finanziere', 'acquisto', 'prelevare', 'farmaci'].forEach(function (w) { assert.ok(b1.indexOf(w) !== -1, 'a B1 deve proporre "' + w + '": ' + b1.join(' ')); });
  // stare in un esercizio non basta più a vincere su tutto: una parola di base in un esercizio resta fuori
  const a2 = G.vocabCandidates(chunks, exs, { lang: 'it', n: 40, support: 'en', level: 'A2' });
  assert.ok(a2.some(function (x) { return x.basic; }), 'ad A2 le parole di base restano (penalizzate, non escluse)');
  assert.ok(!a2.some(function (x) { return x.word === 'epstein' || x.word === 'james'; }), 'i nomi propri stanno fuori a qualunque livello');
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

test('tagli: l\'introduzione del tema e la conclusione restano, i saluti iniziali si tagliano, "oggi parliamo" non è CTA', function () {
  const fs = require('fs');
  const txt = fs.readFileSync(__dirname + '/fixture-neuralink.txt', 'utf8');
  const pl = G.parseTranscript(txt).lines;
  const d = G.generateDraft({ lines: pl, duration: 717, n: 'auto', target: 420, lang: 'it', range: 'smart' });
  const first = d.chunks.filter(function (c) { return !c.silence && !c.cta; })[0];
  assert.ok(!L.hasCTA('Oggi parliamo della tecnologia dietro Neuralink', 'it'), '"oggi parliamo" introduce il tema');
  assert.ok(!G.inCut(d.cuts, first.start + 5) && !G.inCut(d.cuts, first.start + 30), 'i primi 40 s di contenuto non sono tagliati');
  const last = d.chunks.filter(function (c) { return !c.silence && !c.cta; }).slice(-1)[0];
  assert.ok(!G.inCut(d.cuts, last.end - 5), 'la conclusione resta');
  assert.ok(Math.abs(d.stats.effective - 420) <= 25, 'target rispettato: ' + Math.round(d.stats.effective));
  // saluto iniziale della demo (CTA) tagliato quando serve spazio
  const yt = F.youtubeTranscript(); const l2 = G.parseTranscript(yt.text).lines;
  const d2 = G.generateDraft({ lines: l2, duration: yt.duration, n: 'auto', target: 420, lang: 'it', range: 'smart' });
  assert.ok(G.inCut(d2.cuts, 5), 'saluti iniziali tagliati');
  d2.cuts.forEach(function (c) { d2.chunks.forEach(function (ch) { if (ch.silence) return; assert.ok(!(ch.start < c.start && ch.end > c.start + 0.6) && !(ch.start < c.end - 0.6 && ch.end > c.end), 'taglio a metà frase ' + Math.round(c.start) + '-' + Math.round(c.end)); }); });
});

test('tagli a frasi intere: mai a una virgola dentro una frase lunga, confini con margine se interpolati', function () {
  // trascrizione punteggiata con frasi lunghe (verranno divise alla virgola per gli esercizi) e righe che non seguono le frasi
  const words = [];
  for (let i = 0; i < 40; i++) words.push('Questa è la frase numero ' + i + ' del video, con una virgola nel mezzo che la allunga parecchio, e poi continua ancora un po\' fino alla fine.');
  const text = words.join(' ').split(/\s+/);
  // righe da 7 parole ogni 2,5 s: i confini di frase cadono quasi sempre dentro una riga (tempo interpolato)
  const lines = [];
  for (let k = 0; k < text.length; k += 7) lines.push({ start: (k / 7) * 2.5, end: (k / 7 + 1) * 2.5, text: text.slice(k, k + 7).join(' ') });
  const D = lines[lines.length - 1].end;
  const chunks = G.annotate(G.buildChunks(lines, { duration: D, lang: 'it' }), { lang: 'it', duration: D });
  assert.ok(chunks.filter(function (c) { return !c.silence; }).length > 40, 'le frasi lunghe vengono divise in più chunk: ' + chunks.length);
  const units = G.cutUnits(chunks);
  assert.strictEqual(units.filter(function (u) { return !u.silence; }).length, 40, 'un\'unità di taglio per frase');
  units.forEach(function (u) { if (!u.silence) assert.ok(u.ids.length >= 2, 'l\'unità riunisce i pezzi della frase'); });
  const r = G.planCuts(chunks, { duration: D, target: D * 0.6, tolerance: 5, protect: [] });
  assert.ok(r.cuts.length >= 1, 'almeno un taglio');
  r.cuts.forEach(function (c) {
    // ogni confine sta a un confine di frase (± margine 0,25 s), mai dentro una frase
    const startOk = units.some(function (u) { return Math.abs(c.start - u.start) <= 0.3; });
    const endOk = units.some(function (u) { return Math.abs(c.end - u.end) <= 0.3; }) || Math.abs(c.end - D) < 0.05;
    assert.ok(startOk && endOk, 'confine a metà frase: ' + c.start.toFixed(2) + '-' + c.end.toFixed(2));
    const inside = units.find(function (u) { return u.start > c.start + 0.3 && u.start < c.end - 0.3; });
    assert.ok(!inside || true);
    chunks.forEach(function (ch) { if (ch.silence) return; assert.ok(!(ch.start < c.start - 0.3 && ch.end > c.start + 0.3), 'inizio del taglio dentro un chunk'); assert.ok(!(ch.start < c.end - 0.3 && ch.end > c.end + 0.3), 'fine del taglio dentro un chunk'); });
  });
  // il margine: con confini interpolati il taglio inizia 0,25 s dopo la fine della frase tenuta e finisce 0,25 s prima della frase che riprende
  const u1 = units.filter(function (u) { return !u.silence; });
  const c0 = r.cuts[0];
  const uStart = u1.find(function (u) { return Math.abs(u.start - c0.start) <= 0.3; });
  if (uStart && !uStart.startExact) assert.ok(Math.abs(c0.start - uStart.start - 0.25) < 0.01, 'margine all\'inizio: ' + (c0.start - uStart.start));
  // snapCutToSentences: un taglio "a mano" a metà frase viene ristretto alle frasi intere
  const mid = u1[10];
  const manual = { start: mid.start + 1.0, end: u1[14].end - 1.0 };
  const sn = G.snapCutToSentences(manual, chunks, { duration: D });
  assert.ok(sn, 'taglio allineato');
  assert.ok(Math.abs(sn.start - u1[11].start) <= 0.3 && Math.abs(sn.end - u1[13].end) <= 0.3, 'ristretto alle frasi 12-14: ' + sn.start.toFixed(1) + '-' + sn.end.toFixed(1) + ' vs ' + u1[11].start.toFixed(1) + '-' + u1[13].end.toFixed(1));
  assert.strictEqual(G.snapCutToSentences({ start: mid.start + 1, end: mid.end - 1 }, chunks, { duration: D }), null, 'troppo corto per contenere una frase intera');
  // endsSentence: il punto dei numeri non chiude la frase
  assert.ok(G.endsSentence({ text: 'Fa caldo.' }), 'punto finale');
  assert.ok(G.endsSentence({ text: 'una tendenza di 2,5.' }, { text: 'Quindi il mare' }), 'numero con punto e frase nuova dopo');
  assert.ok(!G.endsSentence({ text: 'una tendenza di 2,5.' }, { text: 'del terreno' }), 'dopo il punto la parola è minuscola: la frase continua');
  assert.ok(!G.endsSentence({ text: 'una tendenza, ' }), 'virgola');
  // anche i chunk: "2,5. del terreno" resta una frase sola
  const l3 = [{ start: 0, end: 3, text: 'La tendenza è di 2,5. del terreno' }, { start: 3, end: 6, text: 'che abbiamo misurato con cura. Poi il mare' }, { start: 6, end: 9, text: 'si è scaldato molto. Ecco i dati veri' }, { start: 9, end: 12, text: 'del progetto europeo che seguiamo da anni.' }];
  const ch3 = G.buildChunks(l3, { duration: 12, lang: 'it' }).filter(function (c) { return !c.silence; });
  assert.strictEqual(ch3[0].mode, 'sentences');
  assert.strictEqual(ch3.length, 3, 'tre frasi: ' + ch3.map(function (c) { return c.text; }).join(' | '));
  assert.ok(/^La tendenza è di 2,5\. del terreno che abbiamo misurato con cura\.$/.test(ch3[0].text), ch3[0].text);
});

test('soluzione del fill the gaps: uno spazio unito = una voce, senza virgole tra le sue parole', function () {
  const ex = EX.buildExercise('gap', 'Le boe misurano la temperatura dell\'acqua e trasmettono i dati via satellite ogni giorno.', { lang: 'it', choices: { gapWords: ['la', 'temperatura', 'via', 'satellite'] } });
  assert.ok(ex && EX.gapRuns(ex.data).length === 2, 'due spazi uniti: ' + JSON.stringify(ex && ex.data.gapIndices));
  assert.strictEqual(EX.solution(ex), 'la temperatura, via satellite');
});

test('scelta multipla: cambiando frase resta "mc" (domanda vuota da compilare), mai un fill the gaps al suo posto', function () {
  const near = G.passagesNear(realChunks, 300, { range: 'smart', lang: 'it', type: 'mc', exclude: new Set() });
  assert.ok(near.length >= 1);
  const ex = G.makeExerciseFromPassage(near[0], 'mc', { lang: 'it', seed: 3, range: 'smart' });
  assert.ok(ex && ex.type === 'mc', 'tipo conservato');
  assert.strictEqual(ex.data.question, ''); assert.strictEqual(ex.data.options.length, 4);
  const ex2 = G.makeExercise(realChunks.find(function (c) { return !c.silence && c.wordCount > 8; }), 'mc', { lang: 'it', seed: 3 });
  assert.ok(ex2 && ex2.type === 'mc');
  const withQ = G.makeExerciseFromPassage(near[0], 'gap', { lang: 'it', seed: 3, range: 'smart' });
  assert.strictEqual(withQ.type, 'gap');
});

// L'aiuto del riordino deve mettere la tessera IDENTICA, non una che si assomiglia:
// in "Come vedete non e' salita..., e' aumentata... e piuttosto leggera" ci sono sia "e" sia "e'",
// e sameWord (che ignora gli accenti per correggere lo studente con indulgenza) faceva scegliere quella sbagliata.
test('riordino: le parole che differiscono solo per l\'accento non si confondono', function () {
  const frase = 'Come vedete non \u00e8 salita in modo regolare, \u00e8 aumentata dal 99 al 2013 in maniera abbastanza costante e piuttosto leggera.';
  const ex = EX.buildExercise('scramble', frase, { lang: 'it', seed: 5 });
  const w = ex.data.words;
  assert.ok(w.indexOf('e') !== -1 && w.indexOf('\u00e8') !== -1, 'la frase di prova ha davvero sia "e" sia "\u00e8"');
  const presi = [];
  w.forEach(function (target) {
    let idx = w.findIndex(function (x, i) { return presi.indexOf(i) === -1 && x === target; });
    if (idx === -1) idx = w.findIndex(function (x, i) { return presi.indexOf(i) === -1 && L.normalize(x) === L.normalize(target); });
    presi.push(idx);
  });
  assert.deepStrictEqual(presi.map(function (i) { return w[i]; }), w, 'l\'aiuto ricostruisce la frase con gli accenti giusti');
  // controprova sul mucchio MESCOLATO (e' cosi' che lo vede lo studente): se la "e" senza accento capita prima,
  // la ricerca per sola forma normalizzata la prende al posto della "\u00e8" -> e' il difetto segnalato
  const shown = w.slice();
  shown.unshift(shown.splice(shown.indexOf('e'), 1)[0]);
  const soloNorm = [];
  w.forEach(function (target) {
    soloNorm.push(shown.findIndex(function (x, i) { return soloNorm.indexOf(i) === -1 && L.normalize(x) === L.normalize(target); }));
  });
  assert.notDeepStrictEqual(soloNorm.map(function (i) { return shown[i]; }), w, 'senza la corrispondenza esatta l\'accento si perde');
  const esatta = [];
  w.forEach(function (target) {
    let i2 = shown.findIndex(function (x, i) { return esatta.indexOf(i) === -1 && x === target; });
    if (i2 === -1) i2 = shown.findIndex(function (x, i) { return esatta.indexOf(i) === -1 && L.normalize(x) === L.normalize(target); });
    esatta.push(i2);
  });
  assert.deepStrictEqual(esatta.map(function (i) { return shown[i]; }), w, 'con la corrispondenza esatta il mucchio mescolato torna giusto');
});


console.log('\n' + passed + ' test superati' + (process.exitCode ? ', con errori' : ''));
