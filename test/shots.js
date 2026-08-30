/* Screenshot delle attività nei vari temi (verifica visiva): NODE_PATH=$(npm root -g) node test/shots.js */
'use strict';
const { chromium } = require('playwright');
const BASE = process.env.BASE || 'http://localhost:8123/';

(async function () {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1100, height: 760 } });
  await page.goto(BASE + '?mock=1');
  const shot = async function (act, name, before) {
    await page.evaluate(function (a) {
      let host = document.getElementById('shot-host');
      if (!host) { host = document.createElement('div'); host.id = 'shot-host'; host.style.cssText = 'position:fixed;inset:0;z-index:9999;background:#fff'; document.body.appendChild(host); }
      window.VLAct.render(host, a, { celebrate: function () {}, sound: function () {} });
      const el = host.querySelector('.act'); if (el) el.style.minHeight = '100vh';
    }, act);
    if (before) await before();
    await page.waitForTimeout(350);
    await page.screenshot({ path: 'test/shot-' + name + '.png' });
    console.log('shot', name);
  };
  const pairs = [{ a: 'il mare', b: 'the sea' }, { a: 'la spiaggia', b: 'the beach' }, { a: 'l\'ombrellone', b: 'the beach umbrella' }, { a: 'scottarsi', b: 'to get sunburnt' }, { a: 'il bagnino', b: 'the lifeguard' }, { a: 'fare il bagno', b: 'to go for a swim' }];
  const questions = [
    { q: 'Cosa si dice quando si riceve un regalo?', options: ['Grazie mille!', 'In bocca al lupo!', 'Buon viaggio!', 'Permesso?'], correct: 0 },
    { q: 'Come si chiama il dolce tipico di Natale?', options: ['Il panettone', 'La colomba', 'Le chiacchiere', 'La cassata'], correct: 0 }
  ];
  await shot({ id: 'x1', type: 'memory', theme: 'summer', title: 'Le parole dell\'estate', data: { pairs: pairs } }, 'act-memory-summer');
  await shot({ id: 'x2', type: 'memory', theme: 'christmas', title: 'Memory di Natale', data: { pairs: pairs } }, 'act-memory-christmas', async function () {
    await page.click('#shot-host .mem-card:nth-child(2)');
    await page.waitForTimeout(500);
  });
  await shot({ id: 'x3', type: 'quiz', theme: 'christmas', title: 'Quiz delle feste', data: { questions: questions } }, 'act-quiz-christmas');
  await shot({ id: 'x4', type: 'quiz', theme: 'classic', title: 'Ripasso di grammatica', data: { questions: questions } }, 'act-quiz-classic');
  await shot({ id: 'x5', type: 'anagram', theme: 'night', title: 'Ricomponi la parola', data: { words: [{ word: 'biblioteca', hint: 'Il posto dove si prendono in prestito i libri' }] } }, 'act-anagram-night', async function () {
    await page.click('#shot-host .ana-tile:nth-child(1)');
    await page.click('#shot-host .ana-tile:nth-child(3)');
  });
  await shot({ id: 'x6', type: 'wheel', theme: 'rainbow', title: 'Domande per parlare', data: { items: [{ text: 'Il tuo piatto preferito?' }, { text: 'Dove vorresti vivere?' }, { text: 'Cosa fai nel weekend?' }, { text: 'Racconta un viaggio' }, { text: 'La tua stagione preferita?' }, { text: 'Un film che consigli' }] } }, 'act-wheel-rainbow');
  await browser.close();
  console.log('DONE');
})().catch(function (e) { console.error('SHOTS FAIL', e); process.exit(1); });
