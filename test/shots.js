/* Screenshot delle attività nei 10 template (verifica visiva): NODE_PATH=$(npm root -g) node test/shots.js */
'use strict';
const { chromium } = require('playwright');
const BASE = process.env.BASE || 'http://localhost:8123/';

(async function () {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1000, height: 700 } });
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
  const questions = [
    { q: 'Cosa si dice quando si riceve un regalo?', options: ['Grazie mille!', 'In bocca al lupo!', 'Buon viaggio!', 'Permesso?'], correct: 0 },
    { q: 'Come si saluta un amico?', options: ['Ciao!', 'Arrivederla!', 'Egregio signore', 'Distinti saluti'], correct: 0 }
  ];
  const pairs = [{ a: 'il mare', b: 'the sea' }, { a: 'la spiaggia', b: 'the beach' }, { a: 'l\'ombrellone', b: 'the umbrella' }, { a: 'scottarsi', b: 'to get sunburnt' }, { a: 'il bagnino', b: 'the lifeguard' }, { a: 'fare il bagno', b: 'to swim' }];
  // la griglia dei 10 template: stessa attività (Quiz) per confrontarli alla pari
  const themes = await page.evaluate(function () { return window.VLAct.THEMES.map(function (t) { return t.id; }); });
  for (const th of themes) {
    await shot({ id: 'g-' + th, type: 'quiz', theme: th, title: 'Quiz — Le presentazioni', data: { questions: questions } }, 'grid-' + th);
  }
  // extra: le carte del memory su tre template diversi
  await shot({ id: 'm1', type: 'memory', theme: 'blackboard', title: 'Memory — In classe', data: { pairs: pairs } }, 'act-memory-blackboard', async function () { await page.click('#shot-host .mem-card:nth-child(2)'); await page.waitForTimeout(500); });
  await shot({ id: 'm2', type: 'memory', theme: 'space', title: 'Memory — Nello spazio', data: { pairs: pairs } }, 'act-memory-space', async function () { await page.click('#shot-host .mem-card:nth-child(2)'); await page.waitForTimeout(500); });
  await shot({ id: 'm3', type: 'anagram', theme: 'ocean', title: 'Anagramma — In fondo al mare', data: { words: [{ word: 'biblioteca', hint: 'Il posto dove si prendono in prestito i libri' }] } }, 'act-anagram-ocean', async function () { await page.click('#shot-host .ana-tile:nth-child(1)'); await page.click('#shot-host .ana-tile:nth-child(3)'); });
  await browser.close();
  console.log('DONE');
})().catch(function (e) { console.error('SHOTS FAIL', e); process.exit(1); });
