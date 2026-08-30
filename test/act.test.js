/* Test dell'attività-gioco (logica pura, senza DOM): `node test/act.test.js` */
'use strict';
const assert = require('assert');
const A = require('../activities.js');

let n = 0;
function t(name, fn) { fn(); n++; console.log('  ok ', name); }

t('memoryDeck: ogni coppia produce due carte, tutte presenti', function () {
  const pairs = [{ a: 'cane', b: 'dog' }, { a: 'gatto', b: 'cat' }, { a: 'pane', b: 'bread' }, { a: 'mare', b: 'sea' }];
  const deck = A.memoryDeck(pairs, A.rng(7));
  assert.strictEqual(deck.length, 8);
  for (let k = 0; k < 4; k++) {
    const two = deck.filter(function (c) { return c.k === k; });
    assert.strictEqual(two.length, 2);
    assert.notStrictEqual(two[0].side, two[1].side);
  }
});

t('memoryDeck: la foto va sul retro (lato b)', function () {
  const deck = A.memoryDeck([{ a: 'sole', b: '', image: 'x.jpg' }], A.rng(1));
  const b = deck.find(function (c) { return c.side === 'b'; });
  assert.strictEqual(b.image, 'x.jpg');
  assert.ok(!deck.find(function (c) { return c.side === 'a'; }).image);
});

t('memoryCols: griglia sensata', function () {
  assert.strictEqual(A.memoryCols(6), 3);
  assert.strictEqual(A.memoryCols(8), 4);
  assert.strictEqual(A.memoryCols(12), 4);
  assert.strictEqual(A.memoryCols(16), 5);
  assert.strictEqual(A.memoryCols(24), 6);
});

t('quizOrder: permuta le risposte e rimappa la giusta', function () {
  const q = { options: ['giusta', 'no1', 'no2', 'no3'], correct: 0 };
  for (let s = 1; s < 40; s++) {
    const v = A.quizOrder(q, A.rng(s));
    assert.strictEqual(v.options.length, 4);
    assert.strictEqual(v.options[v.correct], 'giusta');
    assert.deepStrictEqual(v.options.slice().sort(), q.options.slice().sort());
  }
});

t('quizOrder: la giusta non è sistematicamente la prima', function () {
  let first = 0;
  for (let s = 1; s <= 60; s++) { if (A.quizOrder({ options: ['g', 'a', 'b', 'c'], correct: 0 }, A.rng(s)).correct === 0) first++; }
  assert.ok(first < 30, 'giusta per prima ' + first + ' volte su 60');
});

t('quizPoints: base 100 + bonus serie (tetto a 5)', function () {
  assert.strictEqual(A.quizPoints(0), 100);
  assert.strictEqual(A.quizPoints(1), 120);
  assert.strictEqual(A.quizPoints(5), 200);
  assert.strictEqual(A.quizPoints(12), 200);
});

t('anagramLetters: stesse lettere, ordine diverso, spazi esclusi', function () {
  for (let s = 1; s < 30; s++) {
    const letters = A.anagramLetters('scuola', A.rng(s));
    assert.strictEqual(letters.length, 6);
    assert.deepStrictEqual(letters.slice().sort(), 'scuola'.split('').sort());
    assert.notStrictEqual(letters.join(''), 'scuola');
  }
  assert.strictEqual(A.anagramLetters('il mare', A.rng(3)).length, 6);   // lo spazio non diventa una tessera
  assert.deepStrictEqual(A.anagramLetters('aaa', A.rng(2)), ['a', 'a', 'a']);   // tutte uguali: nessun loop infinito
});

t('wheelIndexAt: la freccia in alto pesca lo spicchio giusto', function () {
  assert.strictEqual(A.wheelIndexAt(0, 8), 0);
  assert.strictEqual(A.wheelIndexAt(45, 8), 7);        // ruota girata di uno spicchio in senso orario
  assert.strictEqual(A.wheelIndexAt(4 * 360 + 90, 4), 3);
  assert.strictEqual(A.wheelIndexAt(360, 5), 0);
  for (let a = 0; a < 720; a += 13) { const i = A.wheelIndexAt(a, 7); assert.ok(i >= 0 && i < 7); }
});

t('validate: memory richiede 3 coppie complete, quiz una domanda vera', function () {
  assert.ok(A.validate({ type: 'memory', data: { pairs: [{ a: 'x', b: 'y' }, { a: 'z', b: 'w' }] } }).length > 0);
  assert.strictEqual(A.validate({ type: 'memory', data: { pairs: [{ a: 'x', b: 'y' }, { a: 'z', b: 'w' }, { a: 'k', image: 'i.jpg' }] } }).length, 0);
  assert.ok(A.validate({ type: 'quiz', data: { questions: [{ q: '', options: ['a', 'b'], correct: 0 }] } }).length > 0);
  assert.strictEqual(A.validate({ type: 'quiz', data: { questions: [{ q: '?', options: ['a', 'b'], correct: 1 }] } }).length, 0);
  assert.ok(A.validate({ type: 'anagram', data: { words: [{ word: 'no' }] } }).length > 0);
  assert.strictEqual(A.validate({ type: 'anagram', data: { words: [{ word: 'casa', hint: 'house' }] } }).length, 0);
  assert.ok(A.validate({ type: 'wheel', data: { items: [{ text: 'solo una' }] } }).length > 0);
  assert.strictEqual(A.validate({ type: 'wheel', data: { items: [{ text: 'a' }, { text: 'b' }] } }).length, 0);
  assert.ok(A.validate({ type: 'boh' }).length > 0);
});

t('18 template dichiarati (dal sobrio al festoso), con movimento e anteprima', function () {
  assert.deepStrictEqual(A.THEMES.map(function (t2) { return t2.id; }), ['classic', 'notebook', 'blackboard', 'coffee', 'night', 'tvshow', 'space', 'synth', 'ocean', 'jungle', 'spring', 'summer', 'autumn', 'winter', 'rainbow', 'candy', 'halloween', 'christmas']);
  A.THEMES.forEach(function (t2) { assert.ok(t2.name && t2.emoji && t2.sw && ['float', 'fall', 'rise', 'twinkle'].indexOf(t2.motion) >= 0, t2.id); });
  const ids = new Set(A.THEMES.map(function (t2) { return t2.id; }));
  assert.strictEqual(ids.size, 18, 'id unici');
  assert.deepStrictEqual(Object.keys(A.TYPES), ['memory', 'quiz', 'anagram', 'wheel']);
});

t('trasforma: coppie ⇄ Memory/Anagramma, coppie → Quiz con distrattori veri, tutto → Ruota', function () {
  const mem = { type: 'memory', data: { pairs: [{ a: 'cane', b: 'dog' }, { a: 'gatto', b: 'cat' }, { a: 'pane', b: 'bread' }, { a: 'mare', b: 'sea' }] } };
  assert.deepStrictEqual(A.convertTargets(mem).sort(), ['anagram', 'quiz', 'wheel']);
  const ana = A.convert(mem, 'anagram', A.rng(3));
  assert.strictEqual(ana.data.words.length, 4);
  assert.strictEqual(ana.data.words[0].word, 'cane');
  assert.strictEqual(ana.data.words[0].hint, 'dog');
  const back = A.convert({ type: 'anagram', data: ana.data }, 'memory', A.rng(3));
  assert.deepStrictEqual(back.data.pairs.map(function (p) { return p.a + '/' + p.b; }), ['cane/dog', 'gatto/cat', 'pane/bread', 'mare/sea']);
  const quiz = A.convert(mem, 'quiz', A.rng(9));
  assert.strictEqual(quiz.data.questions.length, 4);
  quiz.data.questions.forEach(function (q) {
    assert.ok(q.options.length >= 2 && q.options.length <= 4);
    const pair = mem.data.pairs.find(function (p) { return p.a === q.q; });
    assert.strictEqual(q.options[q.correct], pair.b, 'la giusta è la traduzione');
    q.options.forEach(function (o) { assert.ok(mem.data.pairs.some(function (p) { return p.b === o; }), 'distrattore preso dalle altre coppie'); });
  });
  const wheel = A.convert(mem, 'wheel', A.rng(2));
  assert.deepStrictEqual(wheel.data.items.map(function (x) { return x.text; }), ['cane', 'gatto', 'pane', 'mare']);
});

t('trasforma: il Quiz diventa Ruota (le domande) e Memory (domanda ↔ risposta giusta); la Ruota non si trasforma', function () {
  const quiz = { type: 'quiz', data: { questions: [
    { q: 'Come si dice hello?', options: ['ciao', 'pane', 'sole', 'cane'], correct: 0 },
    { q: 'Come si dice thanks?', options: ['scusa', 'grazie'], correct: 1 },
    { q: 'Come si dice bye?', options: ['arrivederci', 'buongiorno'], correct: 0 }
  ] } };
  const wheel = A.convert(quiz, 'wheel', A.rng(4));
  assert.strictEqual(wheel.data.items.length, 3);
  const mem = A.convert(quiz, 'memory', A.rng(4));
  assert.strictEqual(mem.data.pairs.length, 3);
  assert.deepStrictEqual(mem.data.pairs[0], { a: 'Come si dice hello?', b: 'ciao', image: '' });
  assert.deepStrictEqual(A.convertTargets({ type: 'wheel', data: { items: [{ text: 'a' }, { text: 'b' }, { text: 'c' }] } }), []);
  assert.strictEqual(A.convert(quiz, 'quiz', A.rng(1)), null, 'stesso tipo: niente');
});

console.log('\n' + n + ' test superati');
