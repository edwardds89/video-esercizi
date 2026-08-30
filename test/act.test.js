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

t('temi e tipi dichiarati', function () {
  assert.deepStrictEqual(A.THEMES.map(function (t2) { return t2.id; }), ['classic', 'night', 'rainbow', 'summer', 'christmas']);
  assert.deepStrictEqual(Object.keys(A.TYPES), ['memory', 'quiz', 'anagram', 'wheel']);
});

console.log('\n' + n + ' test superati');
