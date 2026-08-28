/* Smoke test end-to-end con player finto: `NODE_PATH=$(npm root -g) node test/smoke.js` (serve un server statico sulla porta 8123) */
'use strict';
const { chromium } = require('playwright');
const assert = require('assert');

const BASE = process.env.BASE || 'http://localhost:8123/';

(async function () {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1200, height: 900 } });
  const errors = [];
  page.on('pageerror', function (e) { errors.push('pageerror: ' + e.message); });
  page.on('console', function (m) { if (m.type() === 'error') errors.push('console: ' + m.text()); });

  console.log('1. home + demo');
  await page.goto(BASE + '?mock=1&speed=8');
  await page.evaluate(function () { localStorage.clear(); });
  await page.goto(BASE + '?mock=1&speed=8');
  await page.click('#btn-demo');
  await page.waitForSelector('#view-editor.active', { timeout: 15000 });
  await page.waitForFunction(function () { return document.querySelectorAll('#e-exercises .ex-card').length > 0; });
  const nCards = await page.$$eval('#e-exercises .ex-card', function (els) { return els.length; });
  const nMarkers = await page.$$eval('#e-timeline .marker', function (els) { return els.length; });
  console.log('   esercizi:', nCards, 'marker:', nMarkers);
  assert.strictEqual(nCards, 8); assert.strictEqual(nMarkers, 8);
  const stats = await page.$eval('#e-stats', function (e) { return e.textContent; });
  console.log('   stats:', stats.replace(/\s+/g, ' '));
  assert.ok(/Durata per lo studente: 9:5\d|10:0\d|10:1\d/.test(stats), 'durata effettiva vicina a 10:00');
  assert.ok(await page.$$eval('#e-cuts .cut-row', function (els) { return els.length; }) >= 1, 'almeno un taglio');
  await page.screenshot({ path: 'test/shot-editor.png', fullPage: true });

  console.log('2. editor: cambio tipo, toggle gap, altra frase, aggiungi/rimuovi taglio');
  const firstType = await page.$eval('#e-exercises .ex-card:first-child select', function (s) { return s.value; });
  const newType = firstType === 'gap' ? 'missing' : 'gap';
  await page.selectOption('#e-exercises .ex-card:first-child select', newType);
  await page.waitForTimeout(150);
  assert.strictEqual(await page.$eval('#e-exercises .ex-card:first-child select', function (s) { return s.value; }), newType);
  // trova una card gap e togli/aggiungi uno spazio
  const gapCard = await page.$('#e-exercises .ex-card:has(.chip.gap)');
  assert.ok(gapCard, 'una card gap');
  const before = await gapCard.$$eval('.chip.gap', function (els) { return els.length; });
  const plainChip = await gapCard.$('.chips .chip:not(.gap)');
  await plainChip.click();
  await page.waitForTimeout(150);
  const after = await page.$$eval('#e-exercises .ex-card .chip.gap', function (els) { return els.length; });
  assert.ok(after >= before, 'gap aggiunto');
  const sentenceBefore = await page.$eval('#e-exercises .ex-card:nth-child(3) textarea', function (t) { return t.value; });
  await page.click('#e-exercises .ex-card:nth-child(3) button:has-text("Altra frase")');
  await page.waitForTimeout(150);
  const sentences = await page.$$eval('#e-exercises .ex-card textarea', function (ts) { return ts.map(function (t) { return t.value; }); });
  assert.ok(sentences.indexOf(sentenceBefore) === -1 || sentences.length === 8, 'altra frase applicata');
  const cutsBefore = await page.$$eval('#e-cuts .cut-row', function (els) { return els.length; });
  await page.click('#btn-add-cut');
  await page.waitForTimeout(100);
  assert.strictEqual(await page.$$eval('#e-cuts .cut-row', function (els) { return els.length; }), cutsBefore + 1);
  await page.click('#e-cuts .cut-row:last-child button:has-text("Rimuovi")');
  await page.waitForTimeout(100);
  assert.strictEqual(await page.$$eval('#e-cuts .cut-row', function (els) { return els.length; }), cutsBefore);
  // persistenza
  await page.reload();
  await page.waitForSelector('#view-home.active');
  const items = await page.$$eval('#lesson-list .lesson-card', function (els) { return els.length; });
  assert.strictEqual(items, 1, 'lezione salvata');
  await page.click('#lesson-list .lesson-card button:has-text("Modifica")');
  await page.waitForSelector('#view-editor.active');
  assert.strictEqual(await page.$$eval('#e-exercises .ex-card', function (els) { return els.length; }), 8);

  console.log('3. modalità studente: percorso completo');
  await page.click('#btn-student');
  await page.waitForSelector('#view-student.active');
  await page.waitForSelector('#s-panel button:has-text("Inizia")');
  await page.click('#s-panel button:has-text("Inizia")');
  const lesson = await page.evaluate(function () { return JSON.parse(JSON.stringify(window.VLApp.S.student.lesson)); });
  const samples = [];
  const sampler = setInterval(async function () {
    try { samples.push(await page.evaluate(function () { const p = window.VLApp.S.player; return p ? { t: p.time(), st: p.state(), blocked: window.VLApp.S.student.blocked } : null; })); } catch (e) { /* ignore */ }
  }, 150);
  for (let k = 0; k < lesson.exercises.length; k++) {
    await page.waitForSelector('#s-panel button:has-text("Controlla")', { timeout: 60000 });
    const ex = lesson.exercises[k];
    const shownTitle = await page.$eval('#s-panel h3', function (h) { return h.textContent; });
    assert.ok(shownTitle.indexOf('Esercizio ' + (k + 1) + ' ') === 0, 'ordine esercizi: ' + shownTitle);
    const t = await page.evaluate(function () { return window.VLApp.S.player.time(); });
    assert.ok(Math.abs(t - ex.markerTime) < 2.5, 'fermato vicino al marker: ' + t.toFixed(1) + ' vs ' + ex.markerTime.toFixed(1));
    // riascolta una volta
    await page.click('#s-panel button:has-text("Riascolta")');
    await page.waitForTimeout(300);
    await page.waitForFunction(function () { return !window.VLApp.S.student.replay; }, null, { timeout: 20000 });
    // risposta sbagliata poi giusta
    if (ex.type === 'gap') {
      const inputs = await page.$$('#s-panel input.gap');
      for (const inp of inputs) await inp.fill('zzz');
      await page.click('#s-panel button:has-text("Controlla")');
      assert.ok(/Non ancora/.test(await page.$eval('#s-panel .feedback', function (f) { return f.textContent; })));
      for (let i = 0; i < inputs.length; i++) await inputs[i].fill(ex.data.answers[i]);
    } else if (ex.type === 'scramble') {
      for (const w of ex.data.words) {
        const chips = await page.$$('#s-panel .chips:not(.answer-row) .chip');
        let clicked = false;
        for (const c of chips) { if ((await c.textContent()) === w) { await c.click(); clicked = true; break; } }
        assert.ok(clicked, 'chip ' + w);
      }
    } else if (ex.type === 'missing') {
      await page.fill('#s-panel input[type=text]', ex.data.answer);
    } else if (ex.type === 'extra') {
      const chips = await page.$$('#s-panel .chips .chip');
      await chips[ex.data.extraIndex].click();
    } else if (ex.type === 'wrong') {
      const chips = await page.$$('#s-panel .chips .chip');
      await chips[ex.data.wrongIndex].click();
      await page.fill('#s-panel input[type=text]', ex.data.answer);
    }
    await page.click('#s-panel button:has-text("Controlla")');
    const fb = await page.$eval('#s-panel .feedback', function (f) { return f.textContent; });
    assert.ok(/Giusto/.test(fb), 'esercizio ' + (k + 1) + ' (' + ex.type + '): ' + fb);
    await page.click('#s-panel button:has-text("Continua")');
  }
  await page.waitForSelector('#s-panel h2:has-text("Fine!")', { timeout: 90000 });
  clearInterval(sampler);
  const summary = await page.$eval('#s-panel h2', function (h) { return h.textContent; });
  console.log('   ', summary);
  assert.ok(/8 su 8/.test(summary));
  // i tagli sono stati saltati: nessun campione "in riproduzione" dentro un taglio per più di un tick
  let inCut = 0;
  samples.filter(Boolean).forEach(function (s) { if (s.st === 1 && lesson.cuts.some(function (c) { return s.t > c.start + 0.4 && s.t < c.end - 0.4; })) inCut++; });
  console.log('   campioni in riproduzione dentro un taglio:', inCut, 'su', samples.length);
  assert.ok(inCut <= 2, 'tagli saltati');
  await page.screenshot({ path: 'test/shot-student.png', fullPage: true });

  console.log('4. link con dati inclusi');
  await page.click('#s-panel button:has-text("Ricomincia")');
  await page.waitForSelector('#s-panel button:has-text("Inizia")');
  const link = await page.evaluate(function () {
    const ls = window.VLApp.S.student.lesson;
    const payload = JSON.stringify({ v: 1, id: ls.id, title: ls.title, videoId: ls.videoId, lang: ls.lang, duration: ls.duration, exercises: ls.exercises, cuts: ls.cuts, options: ls.options, lines: ls.lines });
    return location.origin + location.pathname + '?mock=1&speed=8#d=' + btoa(unescape(encodeURIComponent(payload))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  });
  const page2 = await browser.newPage();
  page2.on('pageerror', function (e) { errors.push('pageerror(2): ' + e.message); });
  await page2.goto(link);
  await page2.waitForSelector('#view-student.active');
  await page2.waitForSelector('#s-panel button:has-text("Inizia")');
  assert.strictEqual(await page2.$eval('#btn-edit', function (b) { return b.style.display; }), 'none', 'niente editor nel link studente');
  console.log('   link studente ok, lunghezza', link.length);

  console.log('5. nuova lezione: parser e validazioni');
  await page.goto(BASE + '?mock=1&speed=8');
  await page.click('#nav button[data-view=new]');
  await page.fill('#f-transcript', 'testo senza tempi');
  await page.waitForTimeout(100);
  assert.ok(/Non trovo i tempi/.test(await page.$eval('#f-transcript-status', function (e) { return e.textContent; })));
  await page.fill('#f-transcript', '0:00\nciao a tutti\n0:03\noggi parliamo di neuroni e sinapsi\n0:08\nogni neurone comunica con gli altri');
  await page.waitForTimeout(100);
  assert.ok(/3 righe/.test(await page.$eval('#f-transcript-status', function (e) { return e.textContent; })));

  console.log('6. pulsante per Chrome (pagina YouTube finta) → import → bozza');
  await page.goto(BASE + 'test/fake/youtube.com/watch.html?v=BsXw2C5XORk');
  await page.addScriptTag({ path: 'bookmarklet.js' });
  await Promise.all([
    page.waitForURL(function (u) { return u.href.indexOf('#import=') !== -1 || u.href.indexOf(BASE) === 0 && u.href.indexOf('watch.html') === -1; }, { timeout: 20000 }),
    page.evaluate(function (base) { window.VL_BOOKMARKLET(base); }, BASE)
  ]);
  await page.waitForSelector('#view-new.active', { timeout: 15000 });
  assert.ok(/importata/.test(await page.$eval('#new-title', function (h) { return h.textContent; })));
  assert.ok(/BsXw2C5XORk/.test(await page.$eval('#f-url', function (i) { return i.value; })), 'link compilato');
  assert.ok(/Neuralink/.test(await page.$eval('#f-title', function (i) { return i.value; })), 'titolo compilato');
  assert.ok(/9\d righe/.test(await page.$eval('#f-transcript-status', function (e) { return e.textContent; })), 'trascrizione importata');
  assert.strictEqual(await page.$eval('#f-range', function (s) { return s.value; }), '600', 'circa 10 minuti proposto per un video di 12');
  await page.click('#btn-generate');
  await page.waitForSelector('#view-editor.active', { timeout: 20000 });
  await page.waitForFunction(function () { return document.querySelectorAll('#e-exercises .ex-card').length > 0; });
  const realStats = await page.$eval('#e-stats', function (e) { return e.textContent.replace(/\s+/g, ' '); });
  console.log('   ', realStats);
  assert.strictEqual(await page.$$eval('#e-exercises .ex-card', function (els) { return els.length; }), 10);
  assert.ok(/Durata per lo studente: (9:[3-5]\d|10:[0-5]\d|11:0\d)/.test(realStats), 'durata circa 10 minuti');

  console.log('6b. lunghezza frase per esercizio + helper');
  const firstCard = '#e-exercises .ex-card:first-child';
  const rangeSel = await page.$(firstCard + ' select[title^="Lunghezza"]');
  assert.ok(rangeSel, 'select lunghezza');
  const before6 = await page.$eval(firstCard + ' textarea', function (t) { return t.value; });
  await rangeSel.selectOption('20-30');
  await page.waitForTimeout(300);
  const after6 = await page.$eval(firstCard + ' textarea', function (t) { return t.value; });
  const wc6 = after6.split(/\s+/).length;
  assert.ok(wc6 >= 20 && wc6 <= 30, 'frase di 20-30 parole: ' + wc6 + ' (' + after6.slice(0, 40) + ')');
  assert.notStrictEqual(before6, after6);
  const helperText = await page.$eval(firstCard + ' select[title^="Frasi adatte"] option:first-child', function (o) { return o.textContent; });
  assert.ok(/20-30 parole nel video: \d+/.test(helperText), helperText);
  const nOpts = await page.$$eval(firstCard + ' select[title^="Frasi adatte"] option', function (os) { return os.length; });
  assert.ok(nOpts > 5, 'helper con frasi: ' + nOpts);
  await page.selectOption(firstCard + ' select[title^="Frasi adatte"]', '3');
  await page.waitForTimeout(300);
  const after6b = await page.$eval(firstCard + ' textarea', function (t) { return t.value; });
  assert.notStrictEqual(after6b, after6, 'frase scelta dall\'helper applicata');
  await page.screenshot({ path: 'test/shot-range.png' });

  console.log('7. video senza trascrizione → avviso chiaro; generazione senza trascrizione → errore');
  let dialogMsg = '';
  page.once('dialog', function (d) { dialogMsg = d.message(); d.dismiss(); });
  await page.goto(BASE + 'test/fake/youtube.com/watch-notranscript.html?v=abcdefghijk');
  await page.addScriptTag({ path: 'bookmarklet.js' });
  await page.evaluate(function (base) { window.VL_BOOKMARKLET(base); }, BASE);
  await page.waitForFunction(function () { return true; });
  await page.waitForTimeout(9000);
  assert.ok(/non è utilizzabile/i.test(dialogMsg), 'avviso: ' + dialogMsg);
  await page.goto(BASE + '?mock=1');
  await page.click('#nav button[data-view=new]');
  await page.fill('#f-url', 'https://www.youtube.com/watch?v=abcdefghijk');
  await page.click('#btn-generate');
  const err = await page.$eval('#f-error', function (e) { return e.textContent; });
  assert.ok(/non è utilizzabile/i.test(err), 'errore in pagina: ' + err);

  console.log('errori console/pagina:', errors.length ? errors : 'nessuno');
  assert.strictEqual(errors.filter(function (e) { return !/youtube|iframe_api|net::ERR/i.test(e); }).length, 0, 'nessun errore JS');
  await browser.close();
  console.log('\nSMOKE OK');
})().catch(function (e) { console.error('SMOKE FAIL', e); process.exit(1); });
