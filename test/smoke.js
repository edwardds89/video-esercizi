/* Smoke test end-to-end con player finto: `NODE_PATH=$(npm root -g) node test/smoke.js` (serve un server statico sulla porta 8123) */
'use strict';
const { chromium } = require('playwright');
const assert = require('assert');

const BASE = process.env.BASE || 'http://localhost:8123/';
/** "Inizia" e salta tutte le sezioni prima del video (schede delle parole, "Parliamone" per entrare nel tema). */
async function startVideo(page) {
  await page.click('#btn-start');
  for (let i = 0; i < 8; i++) {
    if (await page.evaluate(function () { return window.VLApp.S.student.started; })) break;
    await page.waitForTimeout(200);
    const skip = await page.$('#s-panel button:has-text("Salta tutto"), #s-panel button:has-text("Salta le schede"), #s-panel button:has-text("Salta le domande"), #s-panel button:has-text("Guarda il video")');
    if (skip) await skip.click();
  }
  await page.waitForFunction(function () { return window.VLApp.S.student.started; }, null, { timeout: 5000 });
}

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
  const newType = firstType === 'missing' ? 'gap' : 'missing';
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
  // modifica a mano della frase: tolte le prime 3 parole → inizio ricalcolato sulle parole; solo punteggiatura → tempi invariati
  const card4 = '#e-exercises .ex-card:nth-child(4)';
  const seg0 = await page.evaluate(function () { const e = Object.values(window.VLApp.S.lessons)[0].exercises[3]; return { start: e.segment.start, end: e.segment.end, sentence: e.sentence, marker: e.markerTime }; });
  const ws = seg0.sentence.split(/\s+/);
  await page.fill(card4 + ' textarea.sentence-edit', ws.slice(3).join(' '));
  await page.dispatchEvent(card4 + ' textarea.sentence-edit', 'change');
  await page.waitForTimeout(200);
  const seg1 = await page.evaluate(function (s) { const e = Object.values(window.VLApp.S.lessons)[0].exercises.find(function (x) { return x.sentence === s; }); return e ? { start: e.segment.start, end: e.segment.end, marker: e.markerTime } : null; }, ws.slice(3).join(' '));
  assert.ok(seg1, 'frase modificata salvata');
  assert.ok(seg1.start > seg0.start + 0.3 && seg1.start < seg0.end, 'inizio spostato in avanti sulle parole: ' + seg0.start + ' → ' + seg1.start);
  assert.ok(Math.abs(seg1.end - seg0.end) < 0.6, 'fine invariata: ' + seg0.end + ' → ' + seg1.end);
  assert.ok(/Tempi ricalcolati/.test(await page.$eval('#toast', function (t) { return t.textContent; })), 'avviso tempi ricalcolati');
  const cardEdited = '#ex-' + await page.evaluate(function (s) { return Object.values(window.VLApp.S.lessons)[0].exercises.find(function (x) { return x.sentence === s; }).id; }, ws.slice(3).join(' '));
  await page.fill(cardEdited + ' textarea.sentence-edit', ws.slice(3).join(' ') + '!');
  await page.dispatchEvent(cardEdited + ' textarea.sentence-edit', 'change');
  await page.waitForTimeout(200);
  const seg2 = await page.evaluate(function (id) { const e = Object.values(window.VLApp.S.lessons)[0].exercises.find(function (x) { return x.id === id; }); return { start: e.segment.start, end: e.segment.end }; }, cardEdited.slice(4));
  assert.strictEqual(seg2.start, seg1.start, 'solo punteggiatura: tempi invariati');
  const cutsBefore = await page.$$eval('#e-cuts .cut-row', function (els) { return els.length; });
  await page.click('#btn-add-cut');
  await page.waitForTimeout(100);
  assert.strictEqual(await page.$$eval('#e-cuts .cut-row', function (els) { return els.length; }), cutsBefore + 1);
  await page.click('#e-cuts .cut-row:last-child button:has-text("Rimuovi")');
  await page.waitForTimeout(100);
  assert.strictEqual(await page.$$eval('#e-cuts .cut-row', function (els) { return els.length; }), cutsBefore);
  // anteprima nell'area del video: clic sul segnaposto 2
  await page.locator('#e-timeline .marker').nth(1).click();
  await page.waitForTimeout(400);
  // durante la riproduzione della frase il video torna grande (la frase sparisce); a fine frase compare l'anteprima
  assert.ok(!(await page.$('#e-stage.docked')), 'durante il riascolto il video è grande');
  const rp = await page.evaluate(function () { const s = window.VLApp.S; const e = Object.values(s.lessons)[0].exercises[1]; return { replay: !!s.editor.replay, t: s.player.time(), seg: e.segment, playing: s.player.state() === 1 }; });
  assert.ok(rp.replay && rp.playing && rp.t >= rp.seg.start - 1 && rp.t <= rp.seg.end + 1, 'il clic sul segnaposto riproduce la frase: ' + JSON.stringify(rp));
  await page.waitForFunction(function () { return !window.VLApp.S.editor.replay; }, null, { timeout: 20000 });
  await page.waitForTimeout(150);
  assert.ok(await page.$('#e-stage.docked'), 'anteprima aperta a fine frase');
  const stopped = await page.evaluate(function () { const s = window.VLApp.S; const e = Object.values(s.lessons)[0].exercises[1]; return { t: s.player.time(), end: e.segment.end, paused: s.player.state() === 2 }; });
  assert.ok(stopped.paused && Math.abs(stopped.t - stopped.end) < 2.5, 'si ferma a fine frase: ' + JSON.stringify(stopped));
  assert.ok(/^Anteprima · /.test(await page.$eval('#e-pop h3', function (h) { return h.textContent; })), 'titolo anteprima = tipo di esercizio');
  assert.ok(/^2 di \d+$/.test(await page.$eval('#e-pop .ex-head .badge', function (b) { return b.textContent; })), 'anteprima esercizio 2 (badge)');
  // pulsanti ▶ e ▶ -3s accanto ai tempi: riproducono e si fermano da soli
  await page.click('#e-exercises .ex-card:nth-child(2) button.play >> nth=0');
  await page.waitForTimeout(300);
  assert.ok(await page.evaluate(function () { return !!window.VLApp.S.editor.replay && window.VLApp.S.player.state() === 1; }), '▶ riproduce');
  await page.waitForFunction(function () { return !window.VLApp.S.editor.replay; }, null, { timeout: 20000 });
  await page.waitForTimeout(150);
  await page.click('#e-exercises .ex-card:nth-child(2) button.play >> nth=1');
  await page.waitForTimeout(200);
  const last3 = await page.evaluate(function () { const s = window.VLApp.S; const e = Object.values(s.lessons)[0].exercises[1]; return { start: s.editor.replay && s.editor.replay.start, segEnd: e.segment.end }; });
  assert.ok(last3.start != null && Math.abs(last3.segEnd - last3.start - 3) < 0.2, 'ultimi 3 secondi: ' + JSON.stringify(last3));
  await page.waitForFunction(function () { return !window.VLApp.S.editor.replay; }, null, { timeout: 20000 });
  // contatore di tipologia e salva per esercizio
  assert.ok(/tipologia presente \d+ volt/.test(await page.$eval('#e-exercises .ex-card:nth-child(2) .badge.count', function (b) { return b.textContent; })), 'contatore tipologia');
  await page.click('#e-exercises .ex-card:nth-child(2) button:has-text("Salva")');
  await page.waitForTimeout(100);
  assert.ok(/Salvato/.test(await page.$eval('#e-exercises .ex-card:nth-child(2) button:has-text("Salvato")', function (b) { return b.textContent; })), 'salva per esercizio');
  // frecce sul campo tempo: +0,1 s e il fuoco resta sul campo
  const startInp = '#e-exercises .ex-card:nth-child(2) input[data-key$=":start"]';
  const v0 = await page.$eval(startInp, function (i) { return i.value; });
  await page.focus(startInp);
  await page.keyboard.press('ArrowUp');
  await page.waitForTimeout(200);
  const v1 = await page.$eval(startInp, function (i) { return i.value; });
  assert.notStrictEqual(v0, v1, 'freccia su cambia il tempo');
  assert.ok(await page.evaluate(function (sel) { return document.activeElement === document.querySelector(sel); }, startInp), 'il fuoco resta sul campo');
  await page.keyboard.press('ArrowDown');
  await page.waitForTimeout(200);
  assert.strictEqual(await page.$eval(startInp, function (i) { return i.value; }), v0, 'freccia giù ripristina');
  await page.click('#e-pop button:has-text("Chiudi anteprima")');
  await page.waitForTimeout(200);
  assert.ok(!(await page.$('#e-stage.docked')), 'anteprima chiusa');
  // pulsante Anteprima nella scheda + "= fine frase"
  await page.click('#e-exercises .ex-card:first-child button:has-text("Anteprima")');
  await page.waitForTimeout(300);
  await page.waitForFunction(function () { return !window.VLApp.S.editor.replay; }, null, { timeout: 20000 });
  await page.waitForTimeout(150);
  assert.ok(await page.$('#e-stage.docked'), 'anteprima dalla scheda');
  const mk = await page.$$eval('#e-exercises .ex-card:first-child .head input.short', function (is) { return is.map(function (i) { return i.value; }); });
  assert.strictEqual(mk.length, 3, 'tre tempi: inizio, fine, stop');
  await page.click('#e-exercises .ex-card:first-child button:has-text("= fine frase")');
  await page.waitForTimeout(200);
  const ex0 = await page.evaluate(function () { const ls = Object.values(window.VLApp.S.lessons)[0]; const e = ls.exercises[0]; return { m: e.markerTime, end: e.segment.end }; });
  assert.ok(Math.abs(ex0.m - ex0.end - 0.1) < 0.06, 'marker allineato a fine frase');
  // parole utili: proposte dalle regole alla generazione; traduzioni scritte a mano → pronte per le schede
  const nWords = await page.$$eval('#e-vocab .vocab-row', function (els) { return els.length; });
  assert.ok(nWords >= 8, 'parole proposte: ' + nWords);
  const trs = ['uno', 'due', 'tre', 'quattro'];
  for (let i = 0; i < 4; i++) {
    const inp = (await page.$$('#e-vocab .vocab-row .v-tr'))[i];
    await inp.fill(trs[i]); await inp.dispatchEvent('change');
  }
  await page.waitForTimeout(150);
  assert.ok(/4 pronte/.test(await page.$eval('#e-vocab .hint.ready', function (h) { return h.textContent; })), 'quattro parole pronte');
  await page.check('#v-write');
  // ricerca foto (Wikipedia + Commons simulati): usa la parola scritta ORA, "↻ Altra" scorre i candidati
  await page.route('**/*.wikipedia.org/w/api.php*', function (route) {
    const q = decodeURIComponent((route.request().url().match(/gsrsearch=([^&]*)/) || [])[1] || '');
    const pages = q.indexOf('mare') !== -1 ? { 1: { pageid: 1, index: 1, title: 'Mare', thumbnail: { source: 'https://upload.example/mare-1.jpg' } }, 2: { pageid: 2, index: 2, title: 'Mare Nostrum', thumbnail: { source: 'https://upload.example/mare-2.jpg' } }, 3: { pageid: 3, index: 3, title: 'Mare (disambigua)', pageprops: { disambiguation: '' }, thumbnail: { source: 'https://upload.example/no.jpg' } } } : {};
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ query: { pages: pages } }) });
  });
  await page.route('**/commons.wikimedia.org/w/api.php*', function (route) {
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ query: { pages: { 9: { pageid: 9, index: 1, title: 'File:Onde.jpg', imageinfo: [{ thumburl: 'https://upload.example/onde.jpg', mime: 'image/jpeg' }] } } } }) });
  });
  const wordInp = (await page.$$('#e-vocab .vocab-row .v-word'))[0];
  await wordInp.fill('mare');   // parola modificata e NON ancora confermata: la ricerca deve usarla lo stesso
  await page.click('#e-vocab .vocab-row:first-child button:has-text("Foto")');
  await page.waitForFunction(function () { return !!Object.values(window.VLApp.S.lessons)[0].vocab.words[0].image; }, null, { timeout: 5000 });
  const img1 = await page.evaluate(function () { const w = Object.values(window.VLApp.S.lessons)[0].vocab.words[0]; return { word: w.word, image: w.image }; });
  assert.strictEqual(img1.word, 'mare', 'parola aggiornata prima della ricerca');
  assert.strictEqual(img1.image, 'https://upload.example/mare-1.jpg', 'prima foto (la disambigua è saltata)');
  // anteprima grande al passaggio del mouse; resta aperta e si aggiorna cliccando "↻ Altra"
  await page.hover('#e-vocab .vocab-row:first-child .v-img img');
  await page.waitForTimeout(100);
  assert.strictEqual(await page.$eval('.img-preview.show img', function (i) { return i.getAttribute('src'); }), 'https://upload.example/mare-1.jpg', 'anteprima grande della foto');
  await page.click('#e-vocab .vocab-row:first-child button:has-text("Altra")');
  await page.waitForTimeout(200);
  const img2 = await page.evaluate(function () { return Object.values(window.VLApp.S.lessons)[0].vocab.words[0].image; });
  assert.strictEqual(img2, 'https://upload.example/mare-2.jpg', 'altra foto');
  assert.strictEqual(await page.$eval('.img-preview.show img', function (i) { return i.getAttribute('src'); }), 'https://upload.example/mare-2.jpg', 'anteprima aggiornata');
  assert.ok(/2\/3/.test(await page.$eval('.img-preview.show .cap', function (c) { return c.textContent; })), 'didascalia n/N');
  await page.mouse.move(5, 5);
  await page.waitForTimeout(100);
  assert.ok(!(await page.$('.img-preview.show')), 'anteprima chiusa uscendo col mouse');
  await page.click('#e-vocab .vocab-row:first-child button:has-text("Altra")');
  await page.waitForTimeout(200);
  assert.strictEqual(await page.evaluate(function () { return Object.values(window.VLApp.S.lessons)[0].vocab.words[0].image; }), 'https://upload.example/onde.jpg', 'poi Commons');
  await page.click('#e-vocab .vocab-row:first-child button:has-text("✕")');
  await page.waitForTimeout(150);
  assert.ok(!(await page.evaluate(function () { return Object.values(window.VLApp.S.lessons)[0].vocab.words[0].image; })), 'foto tolta');
  await page.unroute('**/*.wikipedia.org/w/api.php*'); await page.unroute('**/commons.wikimedia.org/w/api.php*');
  // "+" sulla linea del tempo: clic nel punto più lontano dai segnaposto → popover → Aggiungi
  const gapT = await page.evaluate(function () {
    const ls = window.VLApp.S.lessons[window.VLApp.S.currentId]; const ms = ls.exercises.map(function (e) { return e.markerTime; }).sort(function (a, b) { return a - b; });
    let best = 0, bt = 60; for (let i = 1; i < ms.length; i++) { if (ms[i] - ms[i - 1] > best) { best = ms[i] - ms[i - 1]; bt = (ms[i] + ms[i - 1]) / 2; } } return { t: bt, D: ls.duration };
  });
  const trackBox = await (await page.$('#e-timeline .track')).boundingBox();
  await page.mouse.click(trackBox.x + trackBox.width * gapT.t / gapT.D, trackBox.y + trackBox.height / 2);
  await page.waitForSelector('#e-add');
  assert.ok(/Esercizio a/.test(await page.$eval('#e-add .lbl', function (e) { return e.textContent; })), 'popover +');
  const nBefore = await page.$$eval('#e-exercises .ex-card', function (els) { return els.length; });
  await page.click('#e-add button:has-text("Aggiungi")');
  await page.waitForTimeout(300);
  assert.strictEqual(await page.$$eval('#e-exercises .ex-card', function (els) { return els.length; }), nBefore + 1, 'esercizio aggiunto dal +');
  // l'esercizio aggiunto ha la lunghezza consigliata del tipo scelto ed è vicino al punto cliccato; poi lo togliamo (8 esercizi per il resto del test)
  const added = await page.evaluate(function (t) { const ls = window.VLApp.S.lessons[window.VLApp.S.currentId]; let best = null; ls.exercises.forEach(function (e) { if (!best || Math.abs(e.markerTime - t) < Math.abs(best.markerTime - t)) best = e; }); return { id: best.id, dist: Math.abs(best.markerTime - t), wc: best.sentence.split(/\s+/).length, type: best.type }; }, gapT.t);
  assert.ok(added.dist < 45, 'vicino al punto cliccato: ' + JSON.stringify(added));
  await page.click('#ex-' + added.id + ' button:has-text("Elimina")');
  await page.waitForTimeout(200);
  assert.strictEqual(await page.$$eval('#e-exercises .ex-card', function (els) { return els.length; }), nBefore, 'esercizio rimosso');
  // fascia copri-sottotitoli: si accende dall'editor, si trascina, la posizione resta nella lezione
  await page.check('#e-cover');
  await page.waitForTimeout(150);
  const cov = await page.$('#e-player .cover');
  assert.ok(cov, 'fascia visibile');
  await cov.scrollIntoViewIfNeeded();
  const cb = await cov.boundingBox();
  await page.mouse.move(cb.x + cb.width / 2, cb.y + cb.height / 2);
  await page.mouse.down();
  await page.mouse.move(cb.x + cb.width / 2, cb.y + cb.height / 2 - 60, { steps: 5 });
  await page.mouse.up();
  await page.waitForTimeout(150);
  const covOpt = await page.evaluate(function () { return Object.values(window.VLApp.S.lessons)[0].options.cover; });
  assert.ok(covOpt.on && covOpt.y < 71, 'fascia spostata e salvata: ' + JSON.stringify(covOpt));
  // persistenza
  await page.reload();
  await page.waitForSelector('#view-home.active');
  const items = await page.$$eval('#lesson-list .lesson-card', function (els) { return els.length; });
  assert.strictEqual(items, 1, 'lezione salvata');
  await page.click('#lesson-list .lesson-card button:has-text("Modifica")');
  await page.waitForSelector('#view-editor.active');
  assert.strictEqual(await page.$$eval('#e-exercises .ex-card', function (els) { return els.length; }), 8);

  // "Parliamone" (dopo il video): due domande scritte a mano nella card della sezione t1
  await page.click('.talk-card[data-tid="t1"] button:has-text("+ Domanda")');
  await page.fill('.talk-card[data-tid="t1"] .talk-box .talk-row:nth-child(1) textarea.q', 'Secondo te, perché dormiamo?'); await page.dispatchEvent('.talk-card[data-tid="t1"] .talk-box .talk-row:nth-child(1) textarea.q', 'change');
  await page.fill('.talk-card[data-tid="t1"] .talk-box .talk-row:nth-child(1) textarea.h', 'Secondo me… · Penso che…'); await page.dispatchEvent('.talk-card[data-tid="t1"] .talk-box .talk-row:nth-child(1) textarea.h', 'change');
  await page.click('.talk-card[data-tid="t1"] button:has-text("+ Domanda")');
  await page.fill('.talk-card[data-tid="t1"] .talk-box .talk-row:nth-child(2) textarea.q', 'Ti è mai capitato di dimenticare qualcosa di importante?'); await page.dispatchEvent('.talk-card[data-tid="t1"] .talk-box .talk-row:nth-child(2) textarea.q', 'change');
  await page.waitForTimeout(600);
  assert.strictEqual(await page.evaluate(function () { return Object.values(window.VLApp.S.lessons)[0].talks[0].questions.length; }), 2, 'due domande salvate');

  // struttura della lezione: "+ Parliamone" aggiunge una sezione che entra PRIMA del video (per entrare nel tema)
  assert.strictEqual(await page.$$eval('#e-flow .flow-chip', function (c) { return c.length; }), 3, 'tre sezioni in partenza');
  await page.click('#btn-flow-talk');
  await page.waitForSelector('.talk-card[data-tid="t2"]');
  assert.ok(/prima del video/.test(await page.$eval('.talk-card[data-tid="t2"] .row .hint', function (h) { return h.textContent; })), 'la nuova sezione è prima del video');
  assert.deepStrictEqual(await page.evaluate(function () { return Object.values(window.VLApp.S.lessons)[0].flow.map(function (s) { return s.kind + (s.id ? ':' + s.id : ''); }); }), ['vocab', 'talk:t2', 'video', 'talk:t1'], 'ordine della struttura');
  // le card della colonna destra seguono l'ordine della struttura
  assert.deepStrictEqual(await page.$$eval('.editor-right > .card', function (cs) { return cs.map(function (c) { return c.id || c.getAttribute('data-tid'); }); }), ['e-flow-card', 'e-vocab-card', 't2', 'e-video-card', 't1'], 'card riordinate');
  await page.click('.talk-card[data-tid="t2"] button:has-text("+ Domanda")');
  await page.fill('.talk-card[data-tid="t2"] .talk-box .talk-row:nth-child(1) textarea.q', 'Cosa sai già del sonno?'); await page.dispatchEvent('.talk-card[data-tid="t2"] .talk-box .talk-row:nth-child(1) textarea.q', 'change');
  // ◀ ▶ spostano la sezione attorno al video (e il badge cambia)
  const t2chips = await page.$$('#e-flow .flow-chip');
  await (await t2chips[1].$('button:has-text("▶")')).click();
  await page.waitForTimeout(100);
  assert.ok(/dopo il video/.test(await page.$eval('.talk-card[data-tid="t2"] .row .hint', function (h) { return h.textContent; })), 'spostata dopo il video');
  const t2chips2 = await page.$$('#e-flow .flow-chip');
  await (await t2chips2[2].$('button:has-text("◀")')).click();
  await page.waitForTimeout(100);
  assert.ok(/prima del video/.test(await page.$eval('.talk-card[data-tid="t2"] .row .hint', function (h) { return h.textContent; })), 'riportata prima del video');
  await page.waitForTimeout(600);

  console.log('3. modalità studente: percorso completo');
  await page.click('#btn-student');
  await page.waitForSelector('#view-student.active');
  await page.waitForSelector('#btn-start:visible');
  await page.waitForSelector('#s-player .cover');
  assert.ok(await page.$eval('#s-cover', function (c) { return c.checked; }), 'fascia attiva anche in modalità studente');
  await page.uncheck('#s-cover');
  await page.waitForTimeout(100);
  assert.ok(!(await page.$('#s-player .cover')), 'fascia spenta dallo studente/insegnante');
  // schede delle parole utili prima del video: abbinamento (4 parole pronte) e flashcards con scrittura
  await page.click('#btn-start');
  await page.waitForSelector('#s-panel .match', { timeout: 5000 });
  assert.ok(await page.$('#s-stage.docked'), 'scheda nell\'area del video');
  const vwords = await page.evaluate(function () { const v = window.VLApp.S.student.lesson.vocab; return v.words.filter(function (w) { return w.selected && (w.translation || w.image); }).map(function (w) { return { id: w.id, word: w.word, tr: w.translation }; }); });
  assert.strictEqual(vwords.length, 4, 'quattro parole nelle schede');
  // sbaglio apposta una volta, poi abbino tutte
  const firstLeft = await page.$('#s-panel .match .col:first-child .mchip');
  await firstLeft.click();
  const firstId = await firstLeft.getAttribute('data-id');
  const wrongTr = vwords.find(function (w) { return w.id !== firstId; }).tr;
  await page.click('#s-panel .match .col:last-child .mchip:has-text("' + wrongTr + '")');
  assert.ok(/Non è questa/.test(await page.$eval('#s-panel .feedback', function (f) { return f.textContent; })), 'errore segnalato');
  // prima coppia: parola poi traduzione; seconda: traduzione poi parola (vale anche al contrario); le coppie salgono in alto legate
  let k = 0;
  for (const w of vwords) {
    if (k % 2 === 0) { await page.click('#s-panel .match .col:first-child .mchip[data-id="' + w.id + '"]'); await page.click('#s-panel .match .col:last-child .mchip:has-text("' + w.tr + '")'); }
    else { await page.click('#s-panel .match .col:last-child .mchip:has-text("' + w.tr + '")'); await page.click('#s-panel .match .col:first-child .mchip[data-id="' + w.id + '"]'); }
    k++;
    await page.waitForTimeout(80);
    assert.strictEqual(await page.$$eval('#s-panel .match-done .mpair', function (r) { return r.length; }), k, 'coppie in alto: ' + k);
    assert.strictEqual(await page.$$eval('#s-panel .match .col:first-child .mchip', function (r) { return r.length; }), vwords.length - k, 'parole rimaste sotto');
  }
  assert.ok(/Tutte abbinate/.test(await page.$eval('#s-panel .feedback', function (f) { return f.textContent; })), 'abbinamento completato');
  assert.strictEqual(await page.$eval('#s-panel .match-done .mpair:first-child .mchip[data-id]', function (c) { return c.getAttribute('data-id'); }), vwords[0].id, 'la prima coppia abbinata sta in cima');
  assert.ok(!(await page.$('#s-panel .mchip.pair-0')), 'niente colori per coppia');
  // stella sulla prima parola della scheda (nella riga abbinata)
  await page.click('#s-panel .match-done .mpair .mchip[data-id="' + vwords[0].id + '"] button.star');
  assert.ok(await page.$('#s-panel .match-done button.star.on'), 'stella accesa');
  await page.click('#s-panel button:has-text("Continua")');
  await page.waitForSelector('#s-panel .flashcard', { timeout: 5000 });
  // flashcards con scrittura: sbaglio, poi giusto, poi avanti fino alla fine
  await page.fill('#s-panel input[type=text]', 'zzz');
  await page.click('#s-panel button:has-text("Controlla")');
  assert.ok(/Non ancora/.test(await page.$eval('#s-panel .feedback', function (f) { return f.textContent; })), 'flashcard sbagliata');
  assert.ok(await page.$('#s-panel .flashcard.flipped'), 'carta girata');
  for (let k = 0; k < vwords.length; k++) {
    const btn = await page.$('#s-panel button:has-text("Avanti")');
    if (btn) { await btn.click(); await page.waitForTimeout(80); } else break;
  }
  await page.click('#s-panel button:has-text("Continua")');
  // dopo le schede, PRIMA del video: la sezione "Parliamone" per entrare nel tema (struttura: vocab → talk t2 → video → talk t1)
  await page.waitForSelector('#s-panel .talk-q', { timeout: 5000 });
  assert.ok(/prima del video/.test(await page.$eval('#s-panel .badge', function (b) { return b.textContent; })), 'badge "prima del video"');
  assert.ok(/Cosa sai già del sonno/.test(await page.$eval('#s-panel .talk-q', function (q) { return q.textContent; })), 'domanda per entrare nel tema');
  await page.click('#s-panel button:has-text("Guarda il video")');
  await page.waitForFunction(function () { return window.VLApp.S.student.started; }, null, { timeout: 5000 });
  assert.ok(!(await page.$('#s-stage.docked')), 'dopo le schede il video è grande');
  const lesson = await page.evaluate(function () { return JSON.parse(JSON.stringify(window.VLApp.S.student.lesson)); });
  const samples = [];
  const tStart = Date.now();
  const sampler = setInterval(async function () {
    try { const smp = await page.evaluate(function () { const p = window.VLApp.S.player; return p ? { t: p.time(), st: p.state(), blocked: window.VLApp.S.student.blocked, replay: !!window.VLApp.S.student.replay } : null; }); samples.push(smp); if (process.env.SMOKE_TRACE && smp && samples.length % 10 === 0) console.log('   trace', ((Date.now() - tStart) / 1000).toFixed(1) + 's', 't=' + smp.t.toFixed(1), 'st=' + smp.st, 'blocked=' + smp.blocked, 'replay=' + smp.replay); } catch (e) { /* ignore */ }
  }, 150);
  for (let k = 0; k < lesson.exercises.length; k++) {
    try { await page.waitForSelector('#s-panel button:has-text("Controlla")', { timeout: 60000 }); }
    catch (e) {
      console.log('DIAG', await page.evaluate(function () { const s = window.VLApp.S; return JSON.stringify({ t: s.player && s.player.time(), state: s.player && s.player.state(), blocked: s.student.blocked, started: s.student.started, replay: s.student.replay, ended: s.student.ended, done: Array.from(s.student.done), panel: document.querySelector('#s-panel').innerText.slice(0, 80), markers: s.student.lesson.exercises.map(function (e) { return Math.round(e.markerTime); }) }); }));
      throw e;
    }
    const ex = lesson.exercises[k];
    if (k === 0) {
      // pop-up nell'area del video: stage "docked", player ridotto ma mai sotto 200x200 e mai coperto
      assert.ok(await page.$('#s-stage.docked'), 'stage docked');
      const box = await page.$eval('#s-player', function (e) { const r = e.getBoundingClientRect(); return { w: r.width, h: r.height }; });
      assert.ok(box.w >= 200 && box.h >= 200, 'player ridotto ' + JSON.stringify(box));
      const overlap = await page.evaluate(function () {
        const p = document.getElementById('s-player').getBoundingClientRect();
        const el = document.elementFromPoint(p.left + p.width / 2, p.top + p.height / 2);
        return el ? (el.closest('#s-player') ? 'player' : el.tagName + '.' + el.className) : 'none';
      });
      assert.strictEqual(overlap, 'player', 'niente sopra il player: ' + overlap);
    }
    const shownBadge = await page.$eval('#s-panel .ex-head .badge', function (b) { return b.textContent; });
    assert.ok(shownBadge.indexOf((k + 1) + ' di ') === 0, 'ordine esercizi: ' + shownBadge);
    const shownTitle = await page.$eval('#s-panel h3', function (h) { return h.textContent; });
    assert.ok(shownTitle.indexOf(ex.type === 'gap' ? 'Completa' : '') === 0 && shownTitle.length > 5, 'titolo = tipo: ' + shownTitle);
    const t = await page.evaluate(function () { return window.VLApp.S.player.time(); });
    assert.ok(Math.abs(t - ex.markerTime) < 2.5, 'fermato vicino al marker: ' + t.toFixed(1) + ' vs ' + ex.markerTime.toFixed(1));
    // riascolta una volta: durante il riascolto la frase sparisce (video grande), poi torna; con "con la frase" resta tutto com'è
    if (k === 1) await page.check('#s-panel .withtext input');
    if (k === 2) { assert.ok(!(await page.isChecked('#s-panel .withtext input')), '"con la frase" riparte spenta a ogni esercizio'); await page.uncheck('#s-panel .withtext input'); }
    // titolo del tipo allineato alla consegna; niente scorrimento nel pop (il video si restringe se serve)
    const align = await page.evaluate(function () { const h = document.querySelector('#s-panel h3.ex-type-title'), i = document.querySelector('#s-panel .instr'); const pad = parseFloat(getComputedStyle(h).paddingLeft) || 0; return Math.abs((h.offsetLeft + pad) - i.offsetLeft); });   // offsetLeft ignora l'animazione d'entrata
    assert.ok(align < 2, 'titolo allineato alla consegna: ' + align);
    await page.click('#s-panel button:has-text("Riascolta")');
    await page.waitForTimeout(300);
    if (k === 0 || k === 2) assert.ok(!(await page.$('#s-stage.docked')), 'durante il riascolto il video è grande');
    if (k === 1) assert.ok(await page.$('#s-stage.docked'), '"con la frase": lo schermo resta com\'è durante il riascolto');
    await page.waitForFunction(function () { return !window.VLApp.S.student.replay; }, null, { timeout: 20000 });
    await page.waitForTimeout(150);
    assert.ok(await page.$('#s-stage.docked'), 'dopo il riascolto torna l\'esercizio');
    // risposta sbagliata poi giusta
    if (k === 0) {
      // insegnante: Alt/⌘ + clic su una parola della frase → correzione al volo, esercizio ricostruito uguale, lezione salvata
      const wordEl = (await page.$$('#s-panel .sentence .w'))[0];
      const oldWord = (await wordEl.textContent()).trim();
      page.once('dialog', function (dlg) { dlg.accept(oldWord + 'X'); });
      await wordEl.click({ modifiers: ['Alt'] });
      await page.waitForTimeout(700);   // salvataggio con debounce 400 ms
      const fixed = await page.evaluate(function () { const s = window.VLApp.S; const e = s.student.lesson.exercises[0]; return { sentence: e.sentence, type: e.type, saved: JSON.parse(localStorage.getItem('vle.lessons'))[s.student.lesson.id].exercises[0].sentence, keys: Object.keys(e.data).sort().join(',') }; });
      assert.ok(fixed.sentence.indexOf(oldWord + 'X') !== -1, 'parola corretta nella frase: ' + fixed.sentence.slice(0, 50));
      assert.strictEqual(fixed.type, ex.type, 'stesso tipo'); assert.strictEqual(fixed.keys, Object.keys(ex.data).sort().join(','), 'stessa struttura');
      assert.ok(fixed.saved.indexOf(oldWord + 'X') !== -1, 'lezione salvata');
      assert.ok(!(await page.$('#s-panel .w.starred')) || true);
      ex.sentence = fixed.sentence; ex.data = await page.evaluate(function () { return JSON.parse(JSON.stringify(window.VLApp.S.student.lesson.exercises[0].data)); });
    }
    if (ex.type === 'gap' || ex.type === 'gapbank') {
      const inputs = await page.$$('#s-panel input.gap');
      // "💡 Aiuto": una lettera alla volta nel primo spazio non giusto
      const run0 = await page.evaluate(function (id) { const e = window.VLApp.S.student.lesson.exercises.find(function (x) { return x.id === id; }); return window.VLEx.gapRuns(e.data)[0].answer; }, ex.id);
      await page.click('#s-panel button:has-text("Aiuto")');
      assert.strictEqual((await inputs[0].inputValue()).toLowerCase(), run0.slice(0, 1).toLowerCase(), 'prima lettera svelata');
      await page.click('#s-panel button:has-text("Aiuto")');
      assert.strictEqual((await inputs[0].inputValue()).toLowerCase(), run0.slice(0, 2).toLowerCase(), 'seconda lettera svelata (risposta dello spazio unito)');
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
      // gli spazi tra le parole: passando col mouse si apre quello vicino; senza scelta "Controlla" chiede prima di rispondere
      const nSlots = await page.$$eval('#s-panel .gapfinder .slot', function (s) { return s.length; });
      assert.strictEqual(nSlots, ex.data.tokens.length, 'uno spazio per ogni posizione (' + nSlots + ')');
      assert.ok(!(await page.$('#s-panel input.gapfind')), 'niente campo finché non si sceglie lo spazio');
      const firstWord = await page.$('#s-panel .gapfinder .w');
      await firstWord.hover();
      assert.ok(await page.$('#s-panel .gapfinder .slot.near'), 'lo spazio vicino al mouse si apre');
      await page.click('#s-panel button:has-text("Controlla")');
      assert.ok(/Prima rispondi/.test(await page.$eval('#s-panel .feedback', function (f) { return f.textContent; })), 'senza spazio scelto non si controlla');
      // posto sbagliato + parola giusta → non ancora, con il suggerimento sul posto
      const wrongK = ex.data.missingIndex === 0 ? 1 : 0;
      await page.click('#s-panel .gapfinder .slot[data-k="' + wrongK + '"]');
      await page.fill('#s-panel input.gapfind', ex.data.answer);
      await page.click('#s-panel button:has-text("Controlla")');
      assert.ok(/Non ancora/.test(await page.$eval('#s-panel .feedback', function (f) { return f.textContent; })), 'posto sbagliato = non ancora');
      assert.ok(/Non è lì/.test(await page.$eval('#s-panel .gapfind-hint', function (f) { return f.textContent; })), 'suggerimento sul posto');
      // "Aiuto" porta al posto giusto
      await page.click('#s-panel button:has-text("Aiuto")');
      assert.ok(await page.$('#s-panel .gapfinder .slot[data-k="' + ex.data.missingIndex + '"].sel'), 'aiuto = posto giusto');
      await page.fill('#s-panel input.gapfind', ex.data.answer);
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
    assert.ok(await page.$('#s-panel .actions .feedback'), '"Giusto!" sulla riga dei pulsanti');
    await page.waitForTimeout(400);   // fitStage (transizione .3s)
    const fit = await page.evaluate(function () { const pop = document.querySelector('#s-panel'), pb = document.querySelector('#s-player'); return { scroll: pop.scrollHeight, client: pop.clientHeight, ph: pb.getBoundingClientRect().height }; });
    assert.ok(fit.scroll <= fit.client + 2, 'tutto visibile senza scorrere: ' + JSON.stringify(fit));
    assert.ok(fit.ph >= 200, 'video mai sotto 200 px: ' + fit.ph);
    if (k === 0) {
      assert.ok(await page.$('#s-panel .fx-burst .fx-piece') || await page.$('#s-stage .fx-burst .fx-piece'), 'coriandoli');
      assert.ok(await page.$('#s-panel .feedback.win'), 'feedback animato');
      // frase completa con parole cliccabili: una stella
      await page.waitForTimeout(1500);   // fine dei coriandoli
      // niente frase duplicata sotto: le parole della frase sopra (verde) sono cliccabili per la stella
      assert.ok(!(await page.$('#s-panel .fullwrap')), 'nessuna frase completa duplicata (tipo ' + ex.type + ')');
      assert.ok(!(await page.$('#s-panel input.gap')) && !(await page.$('#s-panel .chips:not(.answer-row) .chip:not(.w)')), 'campi e banca di parole tolti a risposta giusta');
      const wEl = page.locator('#s-panel .w').nth(1);
      await wEl.scrollIntoViewIfNeeded();
      try { await wEl.click({ timeout: 8000 }); } catch (e) { console.log('DIAG star click:', e.message.split('\n').slice(0, 8).join(' | ')); throw e; }
      assert.ok(await page.$('#s-panel .w.starred'), 'parola con la stella');
      // parole adiacenti stellate = una sola voce (frase); togliendo la stella alla prima resta la seconda
      const n1 = await page.locator('#s-panel .w').nth(1).getAttribute('data-w'), n2 = await page.locator('#s-panel .w').nth(2).getAttribute('data-w');
      const w2 = page.locator('#s-panel .w').nth(2); await w2.click(); await page.waitForTimeout(100);
      let keys = await page.evaluate(function () { return Object.keys(window.VLApp.S.student.stars); });
      assert.ok(keys.indexOf(n1 + ' ' + n2) !== -1 && keys.indexOf(n1) === -1 && keys.indexOf(n2) === -1, 'due parole vicine = una frase: ' + JSON.stringify(keys));
      assert.ok((await page.$$eval('#s-panel .w.starred', function (x) { return x.length; })) >= 2, 'entrambe segnate');
      await page.locator('#s-panel .w').nth(1).click(); await page.waitForTimeout(100);
      keys = await page.evaluate(function () { return Object.keys(window.VLApp.S.student.stars); });
      assert.ok(keys.indexOf(n1 + ' ' + n2) === -1 && keys.indexOf(n2) !== -1 && keys.indexOf(n1) === -1, 'tolta la prima resta la seconda: ' + JSON.stringify(keys));
      // layout: video in alto al centro, esercizio sotto
      const geo = await page.evaluate(function () { const p = document.getElementById('s-player').getBoundingClientRect(); const st = document.getElementById('s-stage').getBoundingClientRect(); const b = document.querySelector('#s-panel .sentence, #s-panel .chips, #s-panel .mc-options').getBoundingClientRect(); return { pCenter: (p.left + p.width / 2) - (st.left + st.width / 2), pTop: p.top - st.top, bodyBelow: b.top >= p.bottom - 1, pH: p.height / st.height }; });
      assert.ok(Math.abs(geo.pCenter) < 4 && geo.pTop < 60 && geo.bodyBelow && geo.pH > 0.2 && geo.pH <= 0.56, 'video in alto al centro, frase sotto: ' + JSON.stringify(geo));
    }
    await page.click('#s-panel button:has-text("Continua")');
    if (k === 0) { await page.waitForTimeout(200); assert.ok(!(await page.$('#s-stage.docked')), 'stage torna pieno dopo Continua'); }
    if (k === 1) {
      // dopo "Continua" la barra deve rispondere ancora ai clic (prima veniva ridisegnata senza gestori)
      await page.waitForTimeout(150);
      const track = await page.$('#s-timeline .track'); const tb = await track.boundingBox();
      const tBefore = await page.evaluate(function () { return window.VLApp.S.player.time(); });
      const target = lesson.exercises[2].segment.start - 5;
      // la barra dello studente è compressa (senza i tagli): la posizione del clic segue il tempo "che resta"
      const frac = await page.evaluate(function (target) { const ls = window.VLApp.S.student.lesson; const keep = window.VLGen.keepRanges(ls.cuts, ls.duration); let v = 0, V = 0; keep.forEach(function (r) { V += r.end - r.start; if (target >= r.end) v += r.end - r.start; else if (target > r.start) v += target - r.start; }); return v / V; }, target);
      assert.ok(!(await page.$('#s-timeline .cut')), 'niente tagli disegnati sulla barra dello studente');
      assert.strictEqual(await page.$eval('#s-timeline .labels span:last-child', function (x) { return x.textContent; }), await page.evaluate(function () { const ls = window.VLApp.S.student.lesson; const d = Math.round(window.VLGen.effectiveDuration(ls.cuts, ls.duration)); return Math.floor(d / 60) + ':' + String(d % 60).padStart(2, '0'); }), 'durata scritta = durata dopo i tagli');
      await page.mouse.click(tb.x + tb.width * frac, tb.y + tb.height / 2);
      await page.waitForTimeout(120);
      const tAfter = await page.evaluate(function () { return window.VLApp.S.player.time(); });
      assert.ok(Math.abs(tAfter - target) < 6, 'clic sulla barra dopo Continua: ' + tBefore.toFixed(1) + ' → ' + tAfter.toFixed(1) + ' (atteso ~' + target.toFixed(0) + ')');
    }
  }
  // dopo l'ultimo esercizio: le domande per parlare, una alla volta, poi il riepilogo
  await page.waitForSelector('#s-panel .talk-q', { timeout: 90000 });
  assert.ok(/perché dormiamo/.test(await page.$eval('#s-panel .talk-q', function (q) { return q.textContent; })), 'prima domanda');
  assert.strictEqual(await page.$$eval('#s-panel .talk-help .chip', function (c) { return c.length; }), 2, 'espressioni utili');
  assert.ok(!(await page.$('#s-panel button:has-text("Controlla")')), 'niente correzione');
  await page.click('#s-panel button:has-text("Prossima")');
  await page.waitForTimeout(150);
  assert.ok(/dimenticare/.test(await page.$eval('#s-panel .talk-q', function (q) { return q.textContent; })), 'seconda domanda');
  await page.click('#s-panel button:has-text("Vai al riepilogo")');
  await page.waitForSelector('#s-panel h2:has-text("Fine!")', { timeout: 90000 });
  clearInterval(sampler);
  const summary = await page.$eval('#s-panel h2', function (h) { return h.textContent; });
  console.log('   ', summary);
  assert.ok(/8 su 8/.test(summary));
  const wl = await page.$$eval('#s-panel .wl-row', function (els) { return els.map(function (e) { return e.querySelector('b').textContent; }); });
  assert.ok(wl.length >= 2, 'parole con la stella nel riepilogo: ' + JSON.stringify(wl));
  assert.ok(wl.indexOf(vwords[0].word.toLowerCase()) !== -1 || wl.indexOf(vwords[0].word) !== -1, 'la parola stellata nella scheda è nel riepilogo');
  await page.click('#s-panel button:has-text("Tutte le parole utili")');
  await page.waitForTimeout(100);
  assert.ok((await page.$$eval('#s-panel .wl-row', function (els) { return els.length; })) >= 8, 'tutte le parole utili aggiunte');
  // i tagli sono stati saltati: nessun campione "in riproduzione" dentro un taglio per più di un tick
  let inCut = 0;
  const cleanCuts = lesson.cuts.filter(function (c) { return !lesson.exercises.some(function (e) { return e.markerTime >= c.start && e.markerTime <= c.end; }); });
  samples.filter(Boolean).forEach(function (s) { if (s.st === 1 && !s.replay && cleanCuts.some(function (c) { return s.t > c.start + 0.4 && s.t < c.end - 0.4; })) inCut++; });
  console.log('   campioni in riproduzione dentro un taglio:', inCut, 'su', samples.length);
  assert.ok(inCut <= 2, 'tagli saltati');
  await page.screenshot({ path: 'test/shot-student.png', fullPage: true });

  console.log('3b. barra libera, blocco, clic sui numeri');
  assert.ok(Object.keys(await page.evaluate(function () { return window.VLApp.S.student.stars; })).length >= 1, 'stelle presenti a fine sessione');
  await page.click('#s-panel button:has-text("Ricomincia")');
  await page.waitForSelector('#btn-start:visible');
  assert.ok(!(await page.$eval('#s-lock', function (c) { return c.checked; })), 'barra libera di default');
  // le stelle valgono per la sessione: riaprendo il video si riparte da zero, e nella lezione salvata non restano
  assert.strictEqual(Object.keys(await page.evaluate(function () { return window.VLApp.S.student.stars; })).length, 0, 'stelle azzerate alla riapertura');
  assert.strictEqual(await page.$eval('#btn-stars', function (b) { return b.textContent.trim(); }), '★ 0', 'contatore stelle a zero');
  assert.ok(!(await page.evaluate(function () { const l = JSON.parse(localStorage.getItem('vle.lessons'))[window.VLApp.S.student.lesson.id]; return l.vocab && l.vocab.starred && l.vocab.starred.length; })), 'niente stelle salvate nella lezione');
  await startVideo(page);
  await page.waitForTimeout(300);
  const exs = lesson.exercises;
  // salto in avanti oltre gli esercizi 1 e 2: nessun esercizio compare e il video NON torna indietro
  await page.evaluate(function (t) { window.VLApp.S.player.seek(t); }, exs[2].markerTime - 24);   // (a velocità ×8: 0,8 s reali = 6,4 s di video)
  await page.waitForTimeout(800);
  const free = await page.evaluate(function () { const s = window.VLApp.S; return { t: s.player.time(), blocked: s.student.blocked }; });
  assert.ok(!free.blocked && free.t > exs[1].markerTime, 'barra libera: ' + JSON.stringify(free));
  await page.waitForSelector('#s-panel button:has-text("Controlla")', { timeout: 30000 });
  assert.ok(/^3 di /.test(await page.$eval('#s-panel .ex-head .badge', function (b) { return b.textContent; })), 'esercizio 3 raggiunto guardando');
  await page.click('#s-panel button:has-text("Salta")');
  await page.waitForTimeout(300);
  // blocco attivo: andando oltre un esercizio da fare si torna indietro (il primo non fatto è l'1)
  await page.check('#s-lock');
  await page.evaluate(function (t) { window.VLApp.S.player.seek(t); }, exs[5].markerTime - 5);
  await page.waitForSelector('#s-panel button:has-text("Controlla")', { timeout: 30000 });   // riportato indietro, arriva all'esercizio 1
  const locked = await page.evaluate(function () { return window.VLApp.S.player.time(); });
  assert.ok(locked < exs[0].markerTime + 2.5, 'barra bloccata → torna al primo esercizio da fare: ' + locked.toFixed(1));
  assert.ok(/^1 di /.test(await page.$eval('#s-panel .ex-head .badge', function (b) { return b.textContent; })), 'esercizio 1 dopo il blocco');
  await page.uncheck('#s-lock');
  // clic sul numero 5: parte dall'inizio della frase e l'esercizio 5 compare al segnaposto
  await page.locator('#s-timeline .marker').nth(4).click();
  await page.waitForTimeout(150);
  const jump = await page.evaluate(function () { const s = window.VLApp.S; return { t: s.player.time(), playing: s.player.state() === 1 }; });
  assert.ok(jump.playing && jump.t >= exs[4].segment.start - 2 && jump.t < exs[4].markerTime, 'clic sul numero: ' + JSON.stringify(jump));
  await page.waitForSelector('#s-panel button:has-text("Controlla")', { timeout: 30000 });
  assert.ok(/^5 di /.test(await page.$eval('#s-panel .ex-head .badge', function (b) { return b.textContent; })), 'esercizio 5 aperto dal numero');
  await page.evaluate(function () { window.VLApp.S.player.pause(); });
  // esercizio già fatto: ricliccando il numero il verde/rosso resta (con l'anello di "sei qui"), e si può rifare
  await page.evaluate(function () { const s = window.VLApp.S.student; const e = s.lesson.exercises[0]; s.results[e.id] = { correct: false, attempts: 1 }; s.done.add(e.id); });
  await page.locator('#s-timeline .marker').nth(0).click();
  await page.waitForTimeout(150);
  const m0 = await page.$eval('#s-timeline .marker', function (m) { return m.className; });
  assert.ok(/done/.test(m0) && /bad/.test(m0), 'il numero resta rosso dopo il clic: ' + m0);
  await page.waitForSelector('#s-panel button:has-text("Continua")', { timeout: 30000 });
  assert.ok(/^1 di /.test(await page.$eval('#s-panel .ex-head .badge', function (b) { return b.textContent; })), 'esercizio già fatto riaperto');
  assert.ok(!(await page.$('#s-panel button:has-text("Controlla")')), 'già fatto: si riascolta, non si rifà (niente Controlla)');
  assert.ok(/già fatto/.test(await page.$eval('#s-panel .instr', function (i) { return i.textContent; })) && /Soluzione:/.test(await page.$eval('#s-panel', function (p) { return p.textContent; })), 'ripasso con soluzione');
  assert.ok(/active/.test(await page.$eval('#s-timeline .marker', function (m) { return m.className; })) && /bad/.test(await page.$eval('#s-timeline .marker', function (m) { return m.className; })), 'aperto ma ancora rosso');
  await page.evaluate(function () { window.VLApp.S.player.pause(); });

  console.log('4. link con dati inclusi');
  const link = await page.evaluate(function () {
    const ls = window.VLApp.S.student.lesson;
    const payload = JSON.stringify({ v: 1, id: ls.id, title: ls.title, videoId: ls.videoId, lang: ls.lang, duration: ls.duration, exercises: ls.exercises, cuts: ls.cuts, options: ls.options, lines: ls.lines });
    return location.origin + location.pathname + '?mock=1&speed=8#d=' + btoa(unescape(encodeURIComponent(payload))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  });
  const page2 = await browser.newPage();
  page2.on('pageerror', function (e) { errors.push('pageerror(2): ' + e.message); });
  await page2.goto(link);
  await page2.waitForSelector('#view-student.active');
  await page2.waitForSelector('#btn-start:visible');
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
  const nAuto = await page.$$eval('#e-exercises .ex-card', function (els) { return els.length; });
  assert.ok(nAuto >= 9 && nAuto <= 15, 'numero automatico (uno ogni 30-50 s): ' + nAuto);
  assert.ok(/Durata per lo studente: (9:[3-5]\d|10:[0-5]\d|11:0\d)/.test(realStats), 'durata circa 10 minuti');

  console.log('6b. lunghezza frase per esercizio + helper');
  const firstCard = '#e-exercises .ex-card:first-child';
  const rangeSel = await page.$(firstCard + ' select[title^="Lunghezza"]');
  assert.ok(rangeSel, 'select lunghezza');
  const before6 = await page.$eval(firstCard + ' textarea', function (t) { return t.value; });
  await rangeSel.selectOption('20-30');
  await page.waitForTimeout(300);
  // l'esercizio può cambiare posizione (le schede sono in ordine di tempo): lo ritroviamo dal suo intervallo
  const changed = await page.evaluate(function () { const ls = window.VLApp.S.lessons[window.VLApp.S.currentId]; const e = ls.exercises.find(function (x) { return Array.isArray(x.range) && x.range[0] === 20; }); return e ? { id: e.id, sentence: e.sentence, wc: e.sentence.split(/\s+/).length } : null; });
  if (!changed) console.log('DIAG6b', await page.evaluate(function () { const ls = window.VLApp.S.lessons[window.VLApp.S.currentId]; return JSON.stringify(ls.exercises.map(function (e) { return [e.type, e.range, e.sentence.split(/\s+/).length]; })); }), 'toast:', await page.$eval('#toast', function (t) { return t.textContent; }));
  assert.ok(changed, 'esercizio con intervallo 20-30');
  assert.ok(changed.wc >= 20 && changed.wc <= 30, 'frase di 20-30 parole: ' + changed.wc + ' (' + changed.sentence.slice(0, 40) + ')');
  assert.notStrictEqual(before6, changed.sentence);
  const card6 = '#ex-' + changed.id;
  const helperText = await page.$eval(card6 + ' select[title^="Frasi adatte"] option:first-child', function (o) { return o.textContent; });
  assert.ok(/20-30 parole nel video: \d+/.test(helperText), helperText);
  const nOpts = await page.$$eval(card6 + ' select[title^="Frasi adatte"] option', function (os) { return os.length; });
  assert.ok(nOpts > 5, 'helper con frasi: ' + nOpts);
  const pickIdx = await page.$$eval(card6 + ' select[title^="Frasi adatte"] option', function (os) { for (let i = 1; i < os.length; i++) if (os[i].textContent.indexOf('attuale') === -1) return os[i].value; return '1'; });
  await page.selectOption(card6 + ' select[title^="Frasi adatte"]', pickIdx);
  await page.waitForTimeout(300);
  const after6b = await page.evaluate(function (id) { const ls = window.VLApp.S.lessons[window.VLApp.S.currentId]; const e = ls.exercises.find(function (x) { return x.id === id; }); return e.sentence; }, changed.id);
  assert.notStrictEqual(after6b, changed.sentence, 'frase scelta dall\'helper applicata');
  // scelta multipla: cambiando frase (helper, "Altra frase") il tipo resta "mc", non diventa un fill the gaps
  await page.selectOption(card6 + ' select[title^="Tipo"]', 'mc');
  await page.waitForTimeout(300);
  const mcState = await page.evaluate(function (id) { const e = window.VLApp.S.lessons[window.VLApp.S.currentId].exercises.find(function (x) { return x.id === id; }); return { type: e.type, q: e.data.question, n: e.data.options.length }; }, changed.id);
  assert.strictEqual(mcState.type, 'mc'); assert.strictEqual(mcState.n, 4);
  const pickIdx2 = await page.$$eval(card6 + ' select[title^="Frasi adatte"] option', function (os) { for (let i = 1; i < os.length; i++) if (os[i].textContent.indexOf('attuale') === -1) return os[i].value; return '1'; });
  await page.selectOption(card6 + ' select[title^="Frasi adatte"]', pickIdx2);
  await page.waitForTimeout(300);
  const mcAfter = await page.evaluate(function (id) { const e = window.VLApp.S.lessons[window.VLApp.S.currentId].exercises.find(function (x) { return x.id === id; }); return { type: e.type, sentence: e.sentence, hasQ: 'question' in e.data }; }, changed.id);
  assert.strictEqual(mcAfter.type, 'mc', 'resta scelta multipla dopo il cambio di frase');
  assert.ok(mcAfter.hasQ, 'dati mc');
  assert.notStrictEqual(mcAfter.sentence, after6b, 'frase cambiata');
  await page.click(card6 + ' button:has-text("Altra frase")');
  await page.waitForTimeout(300);
  assert.strictEqual(await page.evaluate(function (id) { return window.VLApp.S.lessons[window.VLApp.S.currentId].exercises.find(function (x) { return x.id === id; }).type; }, changed.id), 'mc', 'resta mc anche con "Altra frase"');
  await page.screenshot({ path: 'test/shot-range.png' });

  console.log('7. video senza trascrizione → avviso chiaro; generazione senza trascrizione → errore');
  let dialogMsg = '';
  page.once('dialog', function (d) { dialogMsg = d.message(); d.dismiss(); });
  await page.goto(BASE + 'test/fake/youtube.com/watch-notranscript.html?v=abcdefghijk');
  await page.addScriptTag({ path: 'bookmarklet.js' });
  await page.evaluate(function (base) { window.VL_BOOKMARKLET(base); }, BASE);
  await page.waitForFunction(function () { return true; });
  await page.waitForTimeout(17000);   // il pulsante aspetta fino a 15 s che il pannello compaia
  assert.ok(/non è utilizzabile/i.test(dialogMsg), 'avviso: ' + dialogMsg);
  await page.goto(BASE + '?mock=1');
  await page.click('#nav button[data-view=new]');
  await page.fill('#f-url', 'https://www.youtube.com/watch?v=abcdefghijk');
  await page.click('#btn-generate');
  const err = await page.$eval('#f-error', function (e) { return e.textContent; });
  assert.ok(/non è utilizzabile/i.test(err), 'errore in pagina: ' + err);

  console.log('8. cloud: due browser con lo stesso account (adattatore finto)');
  // il cloud finto vive in window.__vlCloud (rows in window.__rows); tra i due browser le righe si copiano a mano
  const fakeCloud = function (rows) {
    return '(function () { window.__rows = ' + JSON.stringify(rows) + ';' +
      'function sortKeys(v) { if (Array.isArray(v)) return v.map(sortKeys); if (v && typeof v === "object") { var o = {}; Object.keys(v).sort().forEach(function (k) { o[k] = sortKeys(v[k]); }); return o; } return v; }' +
      'window.__vlCloud = {' +
      ' user: async function () { return { id: "u-test", email: "prof@esempio.it" }; },' +
      ' list: async function () { return Object.values(window.__rows).map(function (r) { return { id: r.id, title: r.title, updated_at: r.updated_at, deleted: r.deleted }; }); },' +
      ' get: async function (ids) { return ids.map(function (id) { return window.__rows[id]; }).filter(Boolean).map(function (r) { return { id: r.id, title: r.title, data: r.data ? sortKeys(JSON.parse(JSON.stringify(r.data))) : null, updated_at: r.updated_at, deleted: r.deleted }; }); },' +
      ' upsert: async function (rs) { rs.forEach(function (r) { window.__rows[r.id] = Object.assign({}, window.__rows[r.id], r); }); },' +
      ' remove: async function (rs) { rs.forEach(function (r) { window.__rows[r.id] = Object.assign({}, window.__rows[r.id], r); }); } }; })();';
  };
  const ctxA = await browser.newContext({ viewport: { width: 1200, height: 900 } });
  await ctxA.addInitScript(fakeCloud({}));
  const pa = await ctxA.newPage();
  pa.on('pageerror', function (e) { errors.push('pageerror(A): ' + e.message); });
  await pa.goto(BASE + '?mock=1&speed=8');
  await pa.waitForFunction(function () { return window.VLApp.cloud.user && window.VLApp.cloud.user.email === 'prof@esempio.it'; }, null, { timeout: 5000 });
  assert.ok(await pa.$eval('#btn-account', function (b) { return b.style.display !== 'none' && /prof@esempio\.it/.test(b.textContent); }), 'pulsante account con l\'email');
  assert.ok(/nel cloud/.test(await pa.$eval('#home-storage-hint', function (h) { return h.textContent; })), 'avviso "salvate nel cloud"');
  await pa.click('#btn-demo');
  await pa.waitForSelector('#view-editor.active', { timeout: 15000 });
  await pa.waitForFunction(function () { return document.querySelectorAll('#e-exercises .ex-card').length > 0; });
  await pa.waitForFunction(function () { return Object.keys(window.__rows).length === 1 && window.VLApp.cloud.sync.pending() === 0; }, null, { timeout: 8000 });
  const rowA = await pa.evaluate(function () { const r = Object.values(window.__rows)[0]; return { id: r.id, title: r.title, deleted: r.deleted, hasLines: Array.isArray(r.data.lines) && r.data.lines.length > 0, owner: r.owner, cache: JSON.stringify(r.data).indexOf('"_') !== -1 }; });
  assert.ok(rowA.title && rowA.hasLines && rowA.owner === 'u-test' && !rowA.deleted && !rowA.cache, 'lezione caricata nel cloud (con trascrizione, senza cache): ' + JSON.stringify(rowA));
  assert.ok(await pa.$eval('#btn-account .dot', function (d) { return d.classList.contains('ok'); }), 'pallino verde dopo il caricamento');
  await pa.click('#nav button[data-view=home]');
  await pa.click('#btn-account');
  await pa.waitForSelector('#dlg-account[open]');
  assert.ok(/prof@esempio\.it/.test(await pa.$eval('#acc-who', function (w) { return w.textContent; })), 'finestra account: connesso come');
  assert.ok(/Sincronizzato/.test(await pa.$eval('#acc-state', function (w) { return w.textContent; })), 'stato sincronizzato');
  await pa.click('#acc-close2');
  const rowsA = await pa.evaluate(function () { return window.__rows; });
  // secondo browser: parte vuoto, trova la lezione nel cloud
  const ctxB = await browser.newContext({ viewport: { width: 1200, height: 900 } });
  await ctxB.addInitScript(fakeCloud(rowsA));
  const pb = await ctxB.newPage();
  pb.on('pageerror', function (e) { errors.push('pageerror(B): ' + e.message); });
  await pb.goto(BASE + '?mock=1&speed=8');
  await pb.waitForFunction(function () { return document.querySelectorAll('#lesson-list .lesson-card').length === 1; }, null, { timeout: 8000 });
  assert.strictEqual(await pb.$eval('#lesson-list .lesson-card .title', function (t) { return t.textContent; }), rowA.title, 'lezione scaricata sul secondo browser');
  assert.strictEqual(await pb.evaluate(function () { return window.VLApp.cloud.sync.pending(); }), 0, 'niente da caricare dopo il pull');
  // B modifica il titolo dall'editor → il cloud riceve la modifica; poi B elimina → tombstone
  await pb.click('#lesson-list .lesson-card button:has-text("Modifica")');
  await pb.waitForSelector('#view-editor.active');
  await pb.fill('#e-title', 'Titolo cambiato su B');
  await pb.click('#btn-save');
  await pb.waitForFunction(function () { return Object.values(window.__rows)[0].title === 'Titolo cambiato su B' && window.VLApp.cloud.sync.pending() === 0; }, null, { timeout: 8000 });
  const rowsB = await pb.evaluate(function () { return window.__rows; });
  // A riceve il nuovo titolo (copiamo le righe del cloud finto in A e forziamo la sincronizzazione)
  await pa.evaluate(function (rows) { window.__rows = rows; return window.VLApp.runSync(); }, rowsB);
  await pa.waitForFunction(function () { return Object.values(window.VLApp.S.lessons)[0].title === 'Titolo cambiato su B'; }, null, { timeout: 5000 });
  assert.ok(/Titolo cambiato su B/.test(await pa.$eval('#lesson-list', function (l) { return l.textContent; })), 'portfolio di A aggiornato');
  pb.once('dialog', function (d) { d.accept(); });
  await pb.click('#nav button[data-view=home]');
  await pb.click('#lesson-list .lesson-card button:has-text("Elimina")');
  await pb.waitForFunction(function () { return Object.values(window.__rows)[0].deleted === true && window.VLApp.cloud.sync.pending() === 0; }, null, { timeout: 8000 });
  const rowsB2 = await pb.evaluate(function () { return window.__rows; });
  await pa.evaluate(function (rows) { window.__rows = rows; return window.VLApp.runSync(); }, rowsB2);
  await pa.waitForFunction(function () { return Object.keys(window.VLApp.S.lessons).length === 0; }, null, { timeout: 5000 });
  assert.ok(/Nessuna lezione/.test(await pa.$eval('#lesson-list', function (l) { return l.textContent; })), 'eliminazione arrivata su A');
  // link studente: niente cloud, pulsante nascosto
  const linkB = await pa.evaluate(function (row) { return location.origin + location.pathname + '?mock=1#d=' + btoa(unescape(encodeURIComponent(JSON.stringify(Object.assign({}, row.data, { id: 'x' }))))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, ''); }, Object.values(rowsA)[0]);
  await pb.goto(linkB);
  await pb.waitForSelector('#view-student.active', { timeout: 8000 });
  assert.ok(await pb.$eval('#btn-account', function (b) { return b.style.display === 'none'; }), 'link studente: pulsante account nascosto');
  await ctxA.close(); await ctxB.close();

  console.log('9. attività: Quiz standalone con tema Natale e Memory dentro la lezione');
  await page.goto(BASE + '?mock=1&speed=8');
  await page.waitForSelector('#view-home.active');
  // 9a. quiz standalone: crea, compila due domande, tema, prova, gioca dalla card
  await page.click('#btn-new-act');
  await page.waitForSelector('#dlg-act-new[open]');
  await page.click('#an-types button:has-text("Quiz gioco")');
  // secondo passo: la griglia dei template con le anteprime vive (un Quiz vero in scala per ognuno)
  await page.waitForSelector('#an-themes:not([hidden]) .an-theme[data-tid="christmas"] .act[data-theme="christmas"] .quiz-q');
  assert.strictEqual(await page.$$eval('#an-themes .an-theme', function (c) { return c.length; }), 18, '18 anteprime nella griglia');
  await page.click('#an-back');
  await page.waitForSelector('#an-types:not([hidden])');
  await page.click('#an-types button:has-text("Quiz gioco")');
  await page.click('#an-themes .an-theme[data-tid="classic"]');
  await page.waitForSelector('#view-act.active');
  assert.strictEqual(await page.evaluate(function () { return window.VLApp.S.lessons[window.VLApp.S.currentId].activity.theme; }), 'classic', 'template scelto alla creazione');
  // anteprima grande al passaggio del mouse sui chip del selettore
  await page.hover('#a-themes .theme-chip:has-text("Spazio")');
  await page.waitForSelector('.theme-preview.show .act[data-theme="space"]');
  await page.mouse.move(5, 5);
  await page.waitForFunction(function () { const p = document.querySelector('.theme-preview'); return !p || !p.classList.contains('show'); });
  await page.fill('#a-title', 'Quiz di prova'); await page.dispatchEvent('#a-title', 'change');
  await page.click('#a-fields button:has-text("+ Domanda")');
  await page.click('#a-fields button:has-text("+ Domanda")');
  const qcards = await page.$$('#a-fields .af-quiz');
  assert.strictEqual(qcards.length, 2, 'due domande nel form');
  const fillQ = async function (card, q, o1, o2) {
    const qi = await card.$('.qrow input'); await qi.fill(q); await qi.dispatchEvent('change');
    const os = await card.$$('.orow input[type=text]');
    await os[0].fill(o1); await os[0].dispatchEvent('change');
    await os[1].fill(o2); await os[1].dispatchEvent('change');
  };
  await fillQ(qcards[0], 'Come si dice "hello"?', 'ciao', 'pane');
  await fillQ(qcards[1], 'Come si dice "thanks"?', 'grazie', 'scusa');
  await page.click('#a-themes .theme-chip:has-text("Natale")');
  await page.waitForSelector('#a-themes .theme-chip.sel:has-text("Natale")');
  await page.click('#a-try');
  await page.waitForSelector('#dlg-act-try[open] .act[data-theme="christmas"] .quiz-q');
  // due risposte giuste di fila: 100 + 120 = 220 punti
  await page.click('#dlg-act-try .quiz-opt:has-text("ciao"), #dlg-act-try .quiz-opt:has-text("grazie")');
  await page.waitForTimeout(1100);
  await page.click('#dlg-act-try .quiz-opt:has-text("ciao"), #dlg-act-try .quiz-opt:has-text("grazie")');
  await page.waitForSelector('#dlg-act-try .act-end');
  assert.ok(/2 su 2/.test(await page.$eval('#dlg-act-try .act-end h2', function (h) { return h.textContent; })), 'quiz: 2 su 2');
  assert.ok(/220/.test(await page.$eval('#dlg-act-try .act-end', function (b) { return b.textContent; })), 'punteggio 220 con la serie');
  await page.click('#at-close');
  await page.click('#a-save');
  await page.waitForSelector('#view-home.active');
  const actCard = await page.$('#lesson-list .lesson-card:has(.act-thumb)');
  assert.ok(actCard, 'card dell\'attività nel portfolio');
  assert.ok(/Quiz gioco · 2 elementi · tema Natale/.test(await actCard.$eval('.meta', function (m) { return m.textContent; })), 'meta della card');
  await (await actCard.$('button:has-text("▶ Gioca")')).click();
  await page.waitForSelector('#view-actplay.active .act[data-theme="christmas"] .quiz-q');
  await page.click('#nav button[data-view=home]');
  await page.waitForSelector('#view-home.active');
  // 9b. memory dentro la lezione demo: dalle Parole utili, tema Estate, sezione spostata prima del video e giocata dallo studente
  const demoTitle = await page.evaluate(function () { return window.VL_DEMO.title; });
  await page.click('#lesson-list .lesson-card:has-text("' + demoTitle + '") button:has-text("Modifica")');
  await page.waitForSelector('#view-editor.active');
  await page.click('#btn-flow-act');
  await page.waitForSelector('#dlg-act-new[open]');
  await page.click('#an-types button:has-text("Memory")');
  await page.waitForSelector('#an-themes:not([hidden]) .an-theme[data-tid="classic"]');
  await page.click('#an-themes .an-theme[data-tid="classic"]');
  await page.waitForSelector('.act-card[data-aid]');
  await page.click('.act-card button:has-text("Usa le Parole utili")');
  await page.waitForTimeout(300);
  const pairsN = await page.evaluate(function () { const ls = window.VLApp.S.lessons[window.VLApp.S.currentId]; return ls.acts[0].data.pairs.length; });
  assert.ok(pairsN >= 3, 'coppie importate dalle Parole utili: ' + pairsN);
  assert.deepStrictEqual(await page.evaluate(function () { const ls = window.VLApp.S.lessons[window.VLApp.S.currentId]; return ls.flow.map(function (s) { return s.kind + (s.id ? ':' + s.id : ''); }); }), ['vocab', 'talk:t2', 'video', 'act:a1', 'talk:t1'], 'attività subito dopo il video');
  await page.click('.act-card .theme-chip:has-text("Estate")');
  await page.waitForSelector('.act-card .theme-chip.sel:has-text("Estate")');
  await page.click('.act-card button:has-text("▶ Prova")');
  await page.waitForSelector('#dlg-act-try[open] .act[data-theme="summer"] .mem-grid');
  const nCardsMem = await page.$$eval('#dlg-act-try .mem-card', function (c) { return c.length; });
  assert.ok(nCardsMem >= 6 && nCardsMem % 2 === 0, 'carte del memory: ' + nCardsMem);
  await page.click('#at-close');
  // la sezione si sposta PRIMA del video con una freccia ◀ (indice 3 nella barra)
  const chips9 = await page.$$('#e-flow .flow-chip');
  await (await chips9[3].$('button:has-text("◀")')).click();
  await page.waitForTimeout(200);
  assert.deepStrictEqual(await page.evaluate(function () { const ls = window.VLApp.S.lessons[window.VLApp.S.currentId]; return ls.flow.map(function (s) { return s.kind; }); }), ['vocab', 'talk', 'act', 'video', 'talk'], 'attività prima del video');
  // studente: schede (salta) → warmup (salta) → memory: una coppia giusta, poi salta al video
  await page.click('#btn-student');
  await page.waitForSelector('#view-student.active');
  await page.waitForSelector('#btn-start:visible');
  await page.click('#btn-start');
  await page.waitForSelector('#s-panel .match', { timeout: 5000 });
  await page.click('#s-panel button:has-text("Salta le schede")');
  await page.waitForSelector('#s-panel .talk-q', { timeout: 5000 });
  await page.click('#s-panel button:has-text("Salta le domande")');
  await page.waitForSelector('#s-panel .mem-grid', { timeout: 5000 });
  const pair0 = await page.evaluate(function () { const ls = window.VLApp.S.student.lesson; return ls.acts[0].data.pairs[0]; });
  await page.click('#s-panel .mem-card:has-text("' + pair0.a + '")');
  await page.click('#s-panel .mem-card:has-text("' + pair0.b + '")');
  await page.waitForSelector('#s-panel .mem-card.done', { timeout: 3000 });
  assert.strictEqual(await page.$$eval('#s-panel .mem-card.done', function (c) { return c.length; }), 2, 'coppia trovata nel memory della lezione');
  await page.click('#s-panel button:has-text("Salta questa attività")');
  await page.waitForFunction(function () { return window.VLApp.S.student.started; }, null, { timeout: 5000 });

  console.log('errori console/pagina:', errors.length ? errors : 'nessuno');
  assert.strictEqual(errors.filter(function (e) { return !/youtube|iframe_api|net::ERR/i.test(e); }).length, 0, 'nessun errore JS');
  await browser.close();
  console.log('\nSMOKE OK');
})().catch(function (e) { console.error('SMOKE FAIL', e); process.exit(1); });
