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

/** Nessuno sfondamento orizzontale: il documento non deve essere più largo della finestra (una riga di chip che non va
 *  a capo, un <select> con opzioni lunghe o una card troppo larga stirano tutta la pagina). */
async function noOverflow(page, where) {
  const r = await page.evaluate(function () {
    const wide = [];
    document.querySelectorAll('.view.active *').forEach(function (e) {
      const b = e.getBoundingClientRect();
      if (b.width && b.right > innerWidth + 2 && getComputedStyle(e).position !== 'fixed') wide.push((e.id ? '#' + e.id : e.tagName + '.' + String(e.className).slice(0, 30)) + ' →' + Math.round(b.right));
    });
    return { doc: document.documentElement.scrollWidth, win: innerWidth, wide: wide.slice(0, 5) };
  });
  assert.ok(r.doc <= r.win + 2, where + ': la pagina sfora in larghezza (' + r.doc + ' > ' + r.win + ') ' + r.wide.join(', '));
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
  await noOverflow(page, 'editor');

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
  // v56: i tempi NON si ricalcolano da soli; lo fa "⟳ Aggiorna tempi" quando lo chiede l'insegnante
  assert.ok(Math.abs(seg1.start - seg0.start) < 0.001 && Math.abs(seg1.end - seg0.end) < 0.001, 'i tempi restano dove sono: ' + seg0.start + ' → ' + seg1.start);
  const cardMod = '#ex-' + await page.evaluate(function (s2) { return Object.values(window.VLApp.S.lessons)[0].exercises.find(function (x) { return x.sentence === s2; }).id; }, ws.slice(3).join(' '));
  await page.click(cardMod + ' button:has-text("Aggiorna tempi")');
  await page.waitForTimeout(300);
  const seg1b = await page.evaluate(function (s2) { const e = Object.values(window.VLApp.S.lessons)[0].exercises.find(function (x) { return x.sentence === s2; }); return { start: e.segment.start, end: e.segment.end, marker: e.markerTime }; }, ws.slice(3).join(' '));
  assert.ok(seg1b.start > seg0.start + 0.3 && seg1b.start < seg0.end, 'chiesto a mano, l\'inizio si sposta sulle parole: ' + seg0.start + ' → ' + seg1b.start);
  assert.ok(Math.abs(seg1b.end - seg0.end) < 0.6, 'fine invariata: ' + seg0.end + ' → ' + seg1b.end);
  assert.ok(/Tempi spostati sulle parole/.test(await page.$eval('#toast', function (t) { return t.textContent; })), 'e lo dice');
  const cardEdited = '#ex-' + await page.evaluate(function (s) { return Object.values(window.VLApp.S.lessons)[0].exercises.find(function (x) { return x.sentence === s; }).id; }, ws.slice(3).join(' '));
  await page.fill(cardEdited + ' textarea.sentence-edit', ws.slice(3).join(' ') + '!');
  await page.dispatchEvent(cardEdited + ' textarea.sentence-edit', 'change');
  await page.waitForTimeout(200);
  const seg2 = await page.evaluate(function (id) { const e = Object.values(window.VLApp.S.lessons)[0].exercises.find(function (x) { return x.id === id; }); return { start: e.segment.start, end: e.segment.end }; }, cardEdited.slice(4));
  assert.strictEqual(seg2.start, seg1b.start, 'solo punteggiatura: tempi invariati');
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
  // contatore di tipologia e "segna come controllato" per esercizio (v57: il salvataggio e' automatico, il pulsante marca)
  assert.ok(/tipologia presente \d+ volt/.test(await page.$eval('#e-exercises .ex-card:nth-child(2) .badge.count', function (b) { return b.textContent; })), 'contatore tipologia');
  await page.click('#e-exercises .ex-card:nth-child(2) button.right');
  await page.waitForTimeout(200);
  assert.ok(await page.$('#e-exercises .ex-card:nth-child(2).reviewed'), 'la card si segna come controllata');
  await page.click('#e-exercises .ex-card:nth-child(2) button.right');
  await page.waitForTimeout(200);
  assert.ok(!(await page.$('#e-exercises .ex-card:nth-child(2).reviewed')), 'e si puo\' togliere');
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
  // pulsante Anteprima nella scheda + i due soli tempi (v55: il terzo, "il video si ferma a", non esiste piu')
  await page.click('#e-exercises .ex-card:first-child button:has-text("Anteprima")');
  await page.waitForTimeout(300);
  await page.waitForFunction(function () { return !window.VLApp.S.editor.replay; }, null, { timeout: 20000 });
  await page.waitForTimeout(150);
  assert.ok(await page.$('#e-stage.docked'), 'anteprima dalla scheda');
  const mk = await page.$$eval('#e-exercises .ex-card:first-child .head input.short', function (is) { return is.map(function (i) { return i.value; }); });
  assert.strictEqual(mk.length, 2, 'due tempi: inizio e fine della frase');
  const ex0 = await page.evaluate(function () { const ls = Object.values(window.VLApp.S.lessons)[0]; const e = ls.exercises[0]; return { m: e.markerTime, end: e.segment.end }; });
  assert.strictEqual(ex0.m, ex0.end, 'il video si ferma esattamente alla fine della frase');
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

  // template delle schede Parole utili: stessi 18 delle attività; scelgo Lavagna
  assert.strictEqual(await page.$$eval('#v-theme .theme-chip', function (c) { return c.length; }), 18, '18 template per le schede');
  await page.click('#v-theme .theme-chip:has-text("Lavagna")');
  await page.waitForSelector('#v-theme .theme-chip.sel:has-text("Lavagna")');
  assert.strictEqual(await page.evaluate(function () { return Object.values(window.VLApp.S.lessons)[0].vocab.theme; }), 'blackboard');

  // "Parliamone" (dopo il video): due domande scritte a mano nella card della sezione t1
  await page.click('.talk-card[data-tid="t1"] button:has-text("+ Domanda")');
  await page.fill('.talk-card[data-tid="t1"] .talk-box .talk-row:nth-child(1) textarea.q', 'Secondo te, perché dormiamo?'); await page.dispatchEvent('.talk-card[data-tid="t1"] .talk-box .talk-row:nth-child(1) textarea.q', 'change');
  await page.fill('.talk-card[data-tid="t1"] .talk-box .talk-row:nth-child(1) textarea.h', 'Secondo me… · Penso che…'); await page.dispatchEvent('.talk-card[data-tid="t1"] .talk-box .talk-row:nth-child(1) textarea.h', 'change');
  await page.click('.talk-card[data-tid="t1"] button:has-text("+ Domanda")');
  await page.fill('.talk-card[data-tid="t1"] .talk-box .talk-row:nth-child(2) textarea.q', 'Ti è mai capitato di dimenticare qualcosa di importante?'); await page.dispatchEvent('.talk-card[data-tid="t1"] .talk-box .talk-row:nth-child(2) textarea.q', 'change');
  await page.waitForTimeout(600);
  assert.strictEqual(await page.evaluate(function () { return Object.values(window.VLApp.S.lessons)[0].talks[0].questions.length; }), 2, 'due domande salvate');
  // il tipo della domanda (dopo il video) si assegna e si cambia cliccando l'etichetta: tipo? → comprensione → opinione
  assert.strictEqual(await page.$eval('.talk-card[data-tid="t1"] .talk-box .talk-row:nth-child(1) .kind', function (k) { return k.textContent; }), 'tipo?', 'domanda scritta a mano: tipo da assegnare');
  await page.click('.talk-card[data-tid="t1"] .talk-box .talk-row:nth-child(1) .kind');
  await page.waitForSelector('.talk-card[data-tid="t1"] .talk-box .talk-row:nth-child(1) .kind.check');
  await page.click('.talk-card[data-tid="t1"] .talk-box .talk-row:nth-child(1) .kind');
  await page.waitForSelector('.talk-card[data-tid="t1"] .talk-box .talk-row:nth-child(1) .kind.talk');
  assert.strictEqual(await page.evaluate(function () { return Object.values(window.VLApp.S.lessons)[0].talks[0].questions[0].kind; }), 'talk');

  // struttura della lezione: "+ Parliamone" chiede QUANDO (prima = per entrare nel tema, dopo = comprensione e opinioni) e mette la sezione al posto giusto
  assert.strictEqual(await page.$$eval('#e-flow .flow-chip', function (c) { return c.length; }), 3, 'tre sezioni in partenza');
  await page.click('#btn-flow-talk');
  await page.waitForSelector('#dlg-talk-new[open]');
  await page.click('#dlg-talk-new button[data-when="before"]');
  await page.waitForSelector('.talk-card[data-tid="t2"]');
  assert.ok(/prima del video/.test(await page.$eval('.talk-card[data-tid="t2"] .row .hint', function (h) { return h.textContent; })), 'la nuova sezione è prima del video');
  assert.ok(/Prima del video/.test(await page.$eval('.talk-card[data-tid="t2"] .when-chip.sel', function (b) { return b.textContent; })), 'chip "Prima del video" selezionato');
  // il nome della sezione nella barra porta alla sua card
  await page.click('#e-flow .flow-chip button.txt:has-text("Parole utili")');
  await page.waitForSelector('#e-vocab-card.flash-card');
  // il chip "Dopo il video" sposta la sezione in fondo, e viceversa
  await page.click('.talk-card[data-tid="t2"] .when-chip:has-text("Dopo il video")');
  await page.waitForTimeout(150);
  assert.deepStrictEqual(await page.evaluate(function () { return Object.values(window.VLApp.S.lessons)[0].flow.map(function (s) { return s.kind + (s.id ? ':' + s.id : ''); }); }), ['vocab', 'video', 'talk:t1', 'talk:t2'], 'spostata dopo il video, in fondo');
  await page.click('.talk-card[data-tid="t2"] .when-chip:has-text("Prima del video")');
  await page.waitForTimeout(150);
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
  assert.ok(await page.$('#s-panel.vocab-act[data-theme="blackboard"] .vocab-wrap .match'), 'le schede vestono il template Lavagna');
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
  assert.ok(!(await page.$('#s-panel.vocab-act')), 'il template delle schede non veste le domande');
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
      // gli spazi a riposo sono larghi zero (v52, per non rientrare le righe): si clicca la frase nel punto dello spazio,
      // che e' quello che fa anche lo studente — il gestore su .gapfinder sceglie lo spazio piu' vicino al puntatore
      await page.evaluate(function (k) {
        const s = document.querySelector('#s-panel .gapfinder');
        const r = s.querySelector('.slot[data-k="' + k + '"]').getBoundingClientRect();
        s.dispatchEvent(new MouseEvent('click', { clientX: r.left + r.width / 2, clientY: r.top + r.height / 2, bubbles: true }));
      }, wrongK);
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
  await noOverflow(page, 'editor attività');
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
    const qi = await card.$('.qrow textarea'); await qi.fill(q); await qi.dispatchEvent('change');
    const os = await card.$$('.orow textarea');
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
  await noOverflow(page, 'editor con card attività');
  const pairsN = await page.evaluate(function () { const ls = window.VLApp.S.lessons[window.VLApp.S.currentId]; return ls.acts[0].data.pairs.length; });
  assert.ok(pairsN >= 3, 'coppie importate dalle Parole utili: ' + pairsN);
  assert.deepStrictEqual(await page.evaluate(function () { const ls = window.VLApp.S.lessons[window.VLApp.S.currentId]; return ls.flow.map(function (s) { return s.kind + (s.id ? ':' + s.id : ''); }); }), ['vocab', 'talk:t2', 'video', 'act:a1', 'talk:t1'], 'attività subito dopo il video');
  // l'anteprima del template mostra QUESTA attività: un memory con le coppie vere, non un quiz d'esempio
  await page.hover('.act-card .theme-chip:has-text("Giungla")');
  await page.waitForSelector('.theme-preview.show .act[data-theme="jungle"][data-type="memory"]');
  assert.strictEqual(await page.$$eval('.theme-preview.show .mem-card', function (c) { return c.length; }), pairsN * 2, 'anteprima memory con le coppie vere');
  await page.mouse.move(5, 5);
  await page.waitForFunction(function () { const p = document.querySelector('.theme-preview'); return !p || !p.classList.contains('show'); });
  // …e per le Parole utili mostra le schede di abbinamento vestite del template
  await page.hover('#v-theme .theme-chip:has-text("Caffè")');
  await page.waitForSelector('.theme-preview.show .pop.vocab-act[data-theme="coffee"] .match .mchip');
  assert.ok(!(await page.$('.theme-preview.show .quiz-q')), 'schede, non quiz, nell\'anteprima delle Parole utili');
  await page.mouse.move(5, 5);
  await page.waitForFunction(function () { const p = document.querySelector('.theme-preview'); return !p || !p.classList.contains('show'); });
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
  // le schede devono stare TUTTE nello schermo: nessun pulsante fuori dal pannello, niente scorrimento
  const fit = await page.evaluate(function () {
    const panel = document.querySelector('#s-panel'), pb = panel.getBoundingClientRect();
    const fuori = Array.from(panel.querySelectorAll('button')).filter(function (b) { const r = b.getBoundingClientRect(); return r.height && (r.bottom > pb.bottom + 1 || r.top < pb.top - 1); }).map(function (b) { return b.textContent.trim(); });
    return { scroll: panel.scrollHeight - panel.clientHeight, fuori: fuori };
  });
  assert.strictEqual(fit.fuori.length, 0, 'pulsanti fuori dallo schermo nelle schede: ' + fit.fuori.join(', '));
  assert.ok(fit.scroll <= 2, 'le schede non devono farsi scorrere: ' + fit.scroll);
  await page.click('#s-panel button:has-text("Salta le schede")');
  await page.waitForSelector('#s-panel .talk-q', { timeout: 5000 });
  await page.click('#s-panel button:has-text("Salta le domande")');
  await page.waitForSelector('#s-panel .mem-grid', { timeout: 5000 });
  const pair0 = await page.evaluate(function () { const ls = window.VLApp.S.student.lesson; return ls.acts[0].data.pairs[0]; });
  await page.click('#s-panel .mem-card:has-text("' + pair0.a + '")');
  await page.click('#s-panel .mem-card:has-text("' + pair0.b + '")');
  await page.waitForSelector('#s-panel .mem-card.done', { timeout: 3000 });
  assert.strictEqual(await page.$$eval('#s-panel .mem-card.done', function (c) { return c.length; }), 2, 'coppia trovata nel memory della lezione');
  // 🎨 template al volo durante il gioco: la coppia trovata resta trovata, il tema cambia (e si salva nella lezione del proprietario)
  await page.click('#s-panel .act-theme-btn');
  await page.waitForSelector('#s-panel .act-theme-pop:not([hidden])');
  await page.click('#s-panel .act-theme-pop .theme-chip:has-text("Spazio")');
  await page.waitForSelector('#s-panel .act[data-theme="space"] .mem-grid');
  assert.strictEqual(await page.$$eval('#s-panel .mem-card.done', function (c) { return c.length; }), 2, 'cambio template senza reset: la coppia resta');
  assert.ok(await page.$('#s-panel .act[data-theme="space"] .act-props'), 'elementi iconici del nuovo tema');
  assert.strictEqual(await page.evaluate(function () { return window.VLApp.S.lessons[window.VLApp.S.currentId].acts[0].theme; }), 'space', 'tema salvato nella lezione (proprietario)');
  await page.click('#s-panel button:has-text("Salta questa attività")');
  await page.waitForFunction(function () { return window.VLApp.S.student.started; }, null, { timeout: 5000 });

  console.log('10. annulla/ripeti (pulsante, Cmd/Ctrl+Z) e template al volo sulle schede delle Parole utili');
  await page.click('#btn-edit');
  await page.waitForSelector('#view-editor.active');
  await page.waitForTimeout(800);   // fuori dalla finestra di fusione delle modifiche
  const flow0 = await page.evaluate(function () { return window.VLApp.S.lessons[window.VLApp.S.currentId].flow.map(function (s) { return s.kind; }); });
  // operazione A: sposta l'attività dopo il video (▶ sul chip dell'attività)
  const chips10 = await page.$$('#e-flow .flow-chip');
  await (await chips10[2].$('button:has-text("▶")')).click();
  await page.waitForTimeout(200);
  const flowA = await page.evaluate(function () { return window.VLApp.S.lessons[window.VLApp.S.currentId].flow.map(function (s) { return s.kind; }); });
  assert.notDeepStrictEqual(flowA, flow0, 'sezione spostata');
  assert.ok(!(await page.$eval('#btn-undo', function (b) { return b.disabled; })), 'ora c\'è qualcosa da annullare');
  await page.waitForTimeout(800);
  // operazione B: digitazione veloce in una domanda di Parliamone = UNA sola operazione
  const talkQ = await page.$('.talk-card textarea.talk-in.q');
  const qBefore = await talkQ.inputValue();
  await talkQ.fill(''); await talkQ.type('Nuova domanda?', { delay: 15 });
  await page.click('#e-stats');   // il campo perde il fuoco → change → il modello si aggiorna
  await page.waitForTimeout(150);
  assert.strictEqual(await page.evaluate(function () { const ls = window.VLApp.S.lessons[window.VLApp.S.currentId]; return ls.talks.map(function (t) { return t.questions.map(function (q) { return q.text; }); }).flat().indexOf('Nuova domanda?') >= 0; }), true, 'testo digitato nel modello');
  // Cmd+Z fuori dai campi: annulla la digitazione, il riordino resta
  await page.keyboard.press('Meta+z');
  await page.waitForTimeout(200);
  assert.strictEqual(await page.evaluate(function () { const ls = window.VLApp.S.lessons[window.VLApp.S.currentId]; return ls.talks.map(function (t) { return t.questions.map(function (q) { return q.text; }); }).flat().indexOf('Nuova domanda?'); }), -1, 'digitazione annullata in blocco');
  assert.strictEqual((await page.$eval('.talk-card textarea.talk-in.q', function (t) { return t.value; })), qBefore, 'la textarea mostra il testo di prima');
  assert.deepStrictEqual(await page.evaluate(function () { return window.VLApp.S.lessons[window.VLApp.S.currentId].flow.map(function (s) { return s.kind; }); }), flowA, 'il riordino resta');
  // Ctrl+Z: annulla anche il riordino → struttura iniziale; poi Ripeti con il pulsante
  await page.keyboard.press('Control+z');
  await page.waitForTimeout(200);
  assert.deepStrictEqual(await page.evaluate(function () { return window.VLApp.S.lessons[window.VLApp.S.currentId].flow.map(function (s) { return s.kind; }); }), flow0, 'riordino annullato');
  assert.ok(!(await page.$eval('#btn-redo', function (b) { return b.disabled; })), 'Ripeti disponibile');
  await page.click('#btn-redo');
  await page.waitForTimeout(200);
  assert.deepStrictEqual(await page.evaluate(function () { return window.VLApp.S.lessons[window.VLApp.S.currentId].flow.map(function (s) { return s.kind; }); }), flowA, 'riordino ripetuto');
  // dentro un campo Cmd+Z è del browser: la storia dell'app non si muove
  const undoStateBefore = await page.$eval('#btn-undo', function (b) { return b.disabled; });
  await page.focus('#e-title');
  await page.keyboard.press('Meta+z');
  await page.waitForTimeout(150);
  assert.strictEqual(await page.$eval('#btn-undo', function (b) { return b.disabled; }), undoStateBefore, 'nessun undo dell\'app dentro un campo');
  // la pagina resta ESATTAMENTE dov'è: cambio del tipo (sul posto) e riordino di una domanda (re-render con àncora)
  await page.evaluate(function () { document.querySelector('.talk-card[data-tid="t1"]').scrollIntoView({ block: 'center' }); });
  await page.waitForTimeout(100);
  const y0 = await page.evaluate(function () { return window.scrollY; });
  assert.ok(y0 > 300, 'la card è in basso nella pagina: ' + y0);
  const kindBefore = await page.$eval('.talk-card[data-tid="t1"] .talk-row .kind', function (b) { return b.className; });
  await page.click('.talk-card[data-tid="t1"] .talk-row .kind');
  await page.waitForTimeout(150);
  const kindAfter = await page.$eval('.talk-card[data-tid="t1"] .talk-row .kind', function (b) { return b.className; });
  assert.notStrictEqual(kindAfter, kindBefore, 'tipo cambiato: ' + kindBefore + ' → ' + kindAfter);
  assert.strictEqual(await page.evaluate(function () { return window.scrollY; }), y0, 'cambio tipo: nessuno scorrimento');
  assert.ok(/(check|talk)/.test(await page.evaluate(function () { return window.VLApp.S.lessons[window.VLApp.S.currentId].talks.find(function (t) { return t.id === 't1'; }).questions[0].kind; })), 'tipo salvato nel modello');
  const top0 = await page.$eval('.talk-card[data-tid="t1"]', function (c) { return c.getBoundingClientRect().top; });
  await page.click('.talk-card[data-tid="t1"] .talk-row button:has-text("↓")');
  await page.waitForTimeout(150);
  const top1 = await page.$eval('.talk-card[data-tid="t1"]', function (c) { return c.getBoundingClientRect().top; });
  assert.ok(Math.abs(top1 - top0) < 2, 'riordino: la card resta dov\'era (' + top0 + ' → ' + top1 + ')');
  await page.waitForTimeout(800);
  // quiz nell'editor: con la chiave AI compaiono ✨ per singola domanda e singola risposta
  await page.evaluate(function () { window.VLApp.S.settings.apiKey = 'sk-test'; });
  await page.click('#btn-flow-act');
  await page.waitForSelector('#dlg-act-new[open]');
  await page.click('#an-types button:has-text("Quiz gioco")');
  await page.waitForSelector('#an-themes:not([hidden]) .an-theme[data-tid="tvshow"]');
  await page.click('#an-themes .an-theme[data-tid="tvshow"]');
  await page.waitForSelector('.act-card[data-aid="a2"]');
  await page.click('.act-card[data-aid="a2"] button:has-text("+ Domanda")');
  await page.waitForSelector('.act-card[data-aid="a2"] .af-quiz');
  assert.strictEqual(await page.$$eval('.act-card[data-aid="a2"] .af-quiz .qrow .regen', function (b) { return b.length; }), 1, '✨ Rigenera sulla domanda');
  assert.strictEqual(await page.$$eval('.act-card[data-aid="a2"] .af-quiz .orow .regen', function (b) { return b.length; }), 4, '✨ su ognuna delle 4 risposte');
  // domanda lunga: la casella cresce, niente frase tagliata (feedback: "non riesco a vedere la domanda intera")
  const qLunga = 'Qual è la conclusione principale del video riguardo al Mediterraneo e a quello che succede alle specie che ci vivono?';
  const qBox = await page.$('.act-card[data-aid="a2"] .af-quiz .qrow textarea');
  await qBox.fill(qLunga); await qBox.dispatchEvent('change');
  await page.waitForTimeout(200);
  const dim = await page.$eval('.act-card[data-aid="a2"] .af-quiz .qrow textarea', function (t) { return [t.clientHeight, t.scrollHeight]; });
  assert.ok(dim[0] >= dim[1] - 2, 'la domanda si legge per intero: ' + dim.join('/'));
  assert.ok(dim[0] >= 58, 'la casella della domanda parte da due righe: ' + dim[0]);
  await page.evaluate(function () { window.VLApp.S.settings.apiKey = ''; });
  // schede delle Parole utili: 🎨 al volo dopo una coppia abbinata → la coppia resta e il tema cambia
  await page.click('#btn-student');
  await page.waitForSelector('#view-student.active');
  await page.waitForSelector('#btn-start:visible');
  await page.click('#btn-start');
  await page.waitForSelector('#s-panel .match .mchip', { timeout: 5000 });
  const w0 = await page.evaluate(function () { const c = document.querySelector('#s-panel .match .col .mchip'); return { id: c.getAttribute('data-id'), word: c.querySelector('.txt').textContent }; });
  await page.click('#s-panel .match .mchip[data-id="' + w0.id + '"]');
  const tr0 = await page.evaluate(function (id) { const ls = window.VLApp.S.student.lesson; const w = ls.vocab.words.find(function (x) { return x.id === id; }); return w.translation; }, w0.id);
  await page.click('#s-panel .match .mchip.target:has-text("' + tr0 + '")');
  await page.waitForSelector('#s-panel .match-done .mpair');
  const themeBefore = await page.$eval('#s-panel', function (p) { return p.getAttribute('data-theme'); });
  await page.click('#s-panel > .act-theme-btn');
  await page.waitForSelector('#s-panel > .act-theme-pop:not([hidden])');
  await page.click('#s-panel > .act-theme-pop .theme-chip:has-text("Halloween")');
  await page.waitForSelector('#s-panel.vocab-act[data-theme="halloween"] .match-done .mpair');
  assert.notStrictEqual(themeBefore, 'halloween');
  assert.strictEqual(await page.$$eval('#s-panel .match-done .mpair', function (c) { return c.length; }), 1, 'la coppia abbinata resta dopo il cambio di template');
  assert.strictEqual(await page.evaluate(function () { return window.VLApp.S.lessons[window.VLApp.S.currentId].vocab.theme; }), 'halloween', 'template delle schede salvato nella lezione');
  assert.ok(await page.$('#s-panel > .act-props'), 'zucca e compagnia sul pannello');

  console.log('11. eliminare si può annullare: barra con "Annulla" + Cmd/Ctrl+Z');
  page.on('dialog', function (d) { d.accept(); });   // da qui in poi le eliminazioni chiedono conferma
  await page.click('#btn-edit');   // dall'anteprima studente si torna all'editor
  await page.waitForSelector('#view-editor.active');
  await page.waitForTimeout(400);
  // sezione attività tolta dalla lezione: la barra lo dice e Annulla la rimette
  await page.click('#btn-flow-act');
  await page.waitForSelector('#dlg-act-new[open]');
  await page.click('#an-types button:has-text("Anagramma")');
  await page.waitForSelector('#an-themes:not([hidden]) .an-theme[data-tid="classic"]');
  await page.click('#an-themes .an-theme[data-tid="classic"]');
  const aid = await page.evaluate(function () { const ls = window.VLApp.S.lessons[window.VLApp.S.currentId]; return ls.acts[ls.acts.length - 1].id; });
  await page.waitForSelector('.act-card[data-aid="' + aid + '"]');
  await page.waitForTimeout(800);
  await page.click('.act-card[data-aid="' + aid + '"] button:has-text("✕ Sezione")');
  await page.waitForSelector('#undo-bar.show');
  assert.ok(/Sezione .* tolta dalla lezione/.test(await page.$eval('#undo-bar', function (b) { return b.textContent; })), 'la barra spiega come tornare indietro');
  assert.strictEqual(await page.$$eval('.act-card[data-aid="' + aid + '"]', function (c) { return c.length; }), 0, 'sezione tolta');
  await page.click('#undo-bar .undo');
  await page.waitForSelector('.act-card[data-aid="' + aid + '"]');   // rimessa dal pulsante Annulla
  // lezione intera eliminata dall'editor: torna con Ctrl+Z dal portfolio
  const titleNow = await page.evaluate(function () { return window.VLApp.S.lessons[window.VLApp.S.currentId].title; });
  const nPrima = await page.evaluate(function () { return Object.keys(window.VLApp.S.lessons).length; });
  await page.click('#btn-delete');
  await page.waitForSelector('#view-home.active');
  await page.waitForSelector('#undo-bar.show');
  assert.strictEqual(await page.evaluate(function () { return Object.keys(window.VLApp.S.lessons).length; }), nPrima - 1, 'lezione eliminata');
  await page.keyboard.press('Control+z');
  await page.waitForTimeout(200);
  assert.strictEqual(await page.evaluate(function () { return Object.keys(window.VLApp.S.lessons).length; }), nPrima, 'lezione ripristinata con Ctrl+Z');
  assert.ok(await page.$('#lesson-list .lesson-card:has-text("' + titleNow.replace(/"/g, '\\"') + '")'), 'card di nuovo nel portfolio');

  // ogni eliminazione di CONTENUTO nell'editor offre la stessa via d'uscita (esercizio: il caso che è costato una lezione rifatta)
  await page.click('#lesson-list .lesson-card:has-text("' + titleNow.replace(/"/g, '\\"') + '") button:has-text("Modifica")');
  await page.waitForSelector('#view-editor.active');
  await page.waitForFunction(function () { return document.querySelectorAll('#e-exercises .ex-card').length > 0; });
  await page.waitForTimeout(800);
  const nEx = await page.$$eval('#e-exercises .ex-card', function (c) { return c.length; });
  const primaFrase = await page.evaluate(function () { return window.VLApp.S.lessons[window.VLApp.S.currentId].exercises[0].sentence; });
  await page.click('#e-exercises .ex-card:first-child button:has-text("Elimina")');
  await page.waitForSelector('#undo-bar.show');
  assert.ok(/Eliminato: esercizio 1/.test(await page.$eval('#undo-bar', function (b) { return b.textContent; })), 'la barra compare anche per un esercizio');
  assert.strictEqual(await page.$$eval('#e-exercises .ex-card', function (c) { return c.length; }), nEx - 1, 'esercizio eliminato');
  await page.click('#undo-bar .undo');
  await page.waitForTimeout(300);
  assert.strictEqual(await page.$$eval('#e-exercises .ex-card', function (c) { return c.length; }), nEx, 'esercizio ripristinato');
  assert.strictEqual(await page.evaluate(function () { return window.VLApp.S.lessons[window.VLApp.S.currentId].exercises[0].sentence; }), primaFrase, 'stessa frase di prima');

  console.log('12. Parliamone: anche le espressioni gialle sono parole da stellare');
  await page.evaluate(function () {
    const ls = window.VLApp.S.lessons[window.VLApp.S.currentId];
    ls.talks[0].questions = [{ id: 'q1', kind: 'talk', text: 'Ti preoccupa il futuro del pianeta?', help: 'mi preoccupa perché… · Ho paura che…' }];
    window.VLApp.S.student = { lesson: ls, stars: {}, talkIdx: 0, queue: [], done: new Set(), results: {}, attempts: {}, hints: {} };
    window.VLApp.renderTalk(ls.talks[0].questions, false);
  });
  await page.waitForSelector('#s-panel .talk-help .chip', { state: 'attached' });
  const nChipW = await page.$$eval('#s-panel .talk-help .chip .w', function (w) { return w.length; });
  assert.ok(nChipW >= 5, 'le espressioni gialle sono fatte di parole cliccabili, non di solo testo (erano ' + nChipW + ')');
  const stellata = await page.evaluate(function () {
    const w = document.querySelectorAll('#s-panel .talk-help .chip .w')[1];
    w.click();
    return { on: w.classList.contains('starred'), stars: Object.keys(window.VLApp.S.student.stars).length };
  });
  assert.ok(stellata.on, 'la parola del chip giallo prende la stella');
  assert.ok(stellata.stars > 0, 'la stella finisce nel riepilogo');

  console.log('13. Conversazione senza video: editor e foglio A4 in due pagine');
  await page.evaluate(function () {
    const u = {
      id: 'c1', title: 'Cibo e spreco', topic: 'Cibo', level: 'B1', lang: 'it', uiLang: 'en', focus: '', n: 6,
      vocab: [{ it: 'fare la spesa', en: 'to shop' }, { it: 'gli avanzi', en: 'leftovers' }, { it: 'buttare via', en: 'to throw away' }],
      questions: [{ text: 'Descrivi la foto in alto.', help: 'Nella foto c’è…', ref: 'photo' },
      { text: 'Quante volte cucini?', help: 'Di solito…', ref: 'chart1' },
      { text: 'Leggi il testo n. 1: che cosa è cambiato?', help: 'Il testo dice…', ref: 'text1' }],
      charts: [{ title: 'Perché ordini a domicilio?', source: 'invented', rows: [{ label: 'Non ho tempo', pct: 64 }, { label: 'Mai', pct: 14 }] },
      { title: 'Che cosa butti?', source: 'class', rows: [{ label: 'Frutta', pct: 58 }, { label: 'Pane', pct: 46 }] }],
      texts: [{ kind: 'interview', title: '«Cucino per cento persone»', who: 'Maria Bellini, 41 anni, cuoca', body: 'Ho aperto la trattoria dodici anni fa.\n\nPoi sono arrivate le app.', fiction: true },
      { kind: 'article', title: 'Che spreco!', body: 'Ogni anno finisce nella spazzatura un quinto del cibo.', quote: 'Lo spreco nasce al supermercato.', fiction: true }],
      roleplay: { intro: 'Un tuo amico ordina ogni sera. Telefonagli e:', steps: ['fatti raccontare…', 'spiegagli…', 'convincilo…'] },
      photos: []
    };
    const ls = { id: 'convsmoke', title: 'Cibo e spreco', conv: u, updatedAt: new Date().toISOString() };
    window.VLApp.S.lessons[ls.id] = ls;
    window.VLApp.openConvEditor(ls.id);
  });
  await page.waitForSelector('#view-conv.active');
  await page.waitForTimeout(400);
  assert.strictEqual(await page.$$eval('#c-fields .conv-q', function (c) { return c.length; }), 3, 'le domande sono modificabili una per una');
  assert.strictEqual(await page.$$eval('#c-fields .conv-chart', function (c) { return c.length; }), 2, 'i due sondaggi sono modificabili');
  assert.ok(await page.$('#c-fields .conv-q button.ai'), 'ogni domanda ha il ✨ per rigenerarla da sola');
  await noOverflow(page, 'editor della conversazione');

  await page.click('#c-print');
  await page.waitForSelector('#view-convprint.active .cp-page');
  await page.waitForTimeout(500);
  assert.strictEqual(await page.$$eval('#cp-sheet .cp-page', function (c) { return c.length; }), 2, 'il foglio è di due pagine');
  // due pagine A4 devono restare due pagine A4: quello che non ci sta lo si scopre qui, non alla fotocopiatrice
  const fitA4 = await page.evaluate(function () {
    const pr = document.createElement('div');
    pr.style.cssText = 'position:absolute;visibility:hidden;height:297mm;width:1mm';
    document.body.appendChild(pr);
    const A4 = pr.getBoundingClientRect().height;
    pr.remove();
    return [].map.call(document.querySelectorAll('.cp-page'), function (p) { return Math.round(p.getBoundingClientRect().height - A4); });
  });
  assert.ok(fitA4.every(function (d) { return d <= 1; }), 'nessuna pagina sfora l\'A4 (scarto in px: ' + JSON.stringify(fitA4) + ')');
  assert.strictEqual(await page.$$eval('#cp-sheet .cp-vocab li', function (c) { return c.length; }), 3, 'il lessico va nella colonna di sinistra');
  assert.strictEqual(await page.$$eval('#cp-sheet .cp-q li', function (c) { return c.length; }), 3, 'le domande sono numerate nella colonna larga');
  assert.strictEqual(await page.$$eval('#cp-sheet .cp-steps li', function (c) { return c.length; }), 3, 'la telefonata ha i suoi tre passi');
  // i numeri inventati vanno dichiarati in pagina, e il sondaggio "di classe" si stampa vuoto
  const notes = await page.$$eval('#cp-sheet .cp-note', function (n) { return n.map(function (x) { return x.textContent; }); });
  assert.ok(/dati di esempio/.test(notes[0]), 'il sondaggio inventato lo dichiara: ' + notes[0]);
  assert.ok(/classe/.test(notes[1]), 'il sondaggio da riempire in classe lo dice');
  assert.strictEqual(await page.$$eval('#cp-sheet .cp-chart', function (c) { return c[1].querySelector('.bar i').style.width; }), '0%', 'le barre del sondaggio di classe partono vuote');
  assert.ok(/inventati/.test(await page.$eval('#cp-sheet .cp-disc', function (d) { return d.textContent; })), 'in fondo il foglio dice che le persone sono inventate');
  await noOverflow(page, 'foglio A4');

  console.log('14. una scheda senza modifiche non sovrascrive quello che ha salvato un\'altra');
  const salvate = await page.evaluate(function () {
    // la scheda non ha modifiche in sospeso: chiudendosi non deve riscrivere niente
    const prima = localStorage.getItem('vle.lessons');
    localStorage.setItem('vle.lessons', JSON.stringify({ altra: { id: 'altra', title: 'salvata da un altro computer' } }));
    window.dispatchEvent(new Event('pagehide'));
    const dopo = JSON.parse(localStorage.getItem('vle.lessons'));
    localStorage.setItem('vle.lessons', prima);
    return Object.keys(dopo);
  });
  assert.deepStrictEqual(salvate, ['altra'], 'la scheda ferma non ha sovrascritto le lezioni dell\'altra');

  console.log('15. "trova la parola mancante": le righe partono tutte allineate, e lo spazio si apre lo stesso');
  await page.evaluate(function () {
    const S = window.VLApp.S, EX = window.VLEx;
    // dopo la conversazione S.currentId punta a un'unità senza esercizi: qui serve la lezione col video
    const ls = Object.keys(S.lessons).map(function (k) { return S.lessons[k]; })
      .filter(function (x) { return Array.isArray(x.exercises) && x.exercises.length; })[0];
    const f = 'E attenzione, i dati ci dicono con chiarezza che il Mediterraneo è il mare che si sta scaldando con la velocità più in assoluto.';
    const nb = EX.buildExercise('missing', f, { lang: 'it', seed: 4 });
    const ex = ls.exercises[0];
    ex.type = 'missing'; ex.sentence = f; ex.data = nb.data;
    window.VLApp.openEditor(ls.id);
  });
  await page.waitForTimeout(900);
  await page.click('#e-exercises .ex-card:first-child button:has-text("Anteprima")');
  await page.waitForSelector('.gapfinder');
  await page.waitForTimeout(400);
  const gf = await page.evaluate(function () {
    const s = document.querySelector('.gapfinder');
    const box = s.getBoundingClientRect();
    const words = [].slice.call(s.querySelectorAll('.w'));
    const rows = {};
    words.forEach(function (x) { const r = x.getBoundingClientRect(); const k = Math.round(r.top); (rows[k] = rows[k] || []).push(Math.round(r.left - box.left)); });
    const starts = Object.keys(rows).sort(function (a, b) { return a - b; }).map(function (k) { return Math.min.apply(null, rows[k]); });
    const w4 = words[4].getBoundingClientRect();
    const x = w4.right + 1, y = w4.top + w4.height / 2;
    s.dispatchEvent(new MouseEvent('mousemove', { clientX: x, clientY: y, bubbles: true }));
    const near = s.querySelector('.slot.near');
    return new Promise(function (r) {
      setTimeout(function () {
        const larghezza = near ? Math.round(near.getBoundingClientRect().width) : 0;
        s.dispatchEvent(new MouseEvent('click', { clientX: x, clientY: y, bubbles: true }));
        r({ starts: starts, near: !!near, larghezza: larghezza, scrivibile: !!s.querySelector('.slot.sel input.gapfind') });
      }, 300);
    });
  });
  // gli spazi cliccabili sono larghi 0,4em: davanti alla prima parola di ogni riga la spingevano dentro
  assert.ok(gf.starts.length > 1, 'la frase di prova va a capo (righe: ' + gf.starts.length + ')');
  assert.ok(gf.starts.every(function (x) { return x <= 1; }), 'tutte le righe partono dal margine (inizi: ' + JSON.stringify(gf.starts) + ')');
  assert.ok(gf.near && gf.larghezza >= 20, 'lo spazio si apre lo stesso sotto il puntatore (largo ' + gf.larghezza + 'px)');
  assert.ok(gf.scrivibile, 'e cliccandolo ci si può scrivere dentro');

  console.log('16. schede parole: si divide in piu\' schermate solo quando serve davvero');
  await page.setViewportSize({ width: 1512, height: 950 });
  await page.evaluate(function () {
    const S = window.VLApp.S;
    const ls = Object.keys(S.lessons).map(function (k) { return S.lessons[k]; })
      .filter(function (x) { return Array.isArray(x.exercises) && x.exercises.length; })[0];
    ls.vocab = ls.vocab || {};
    ls.vocab.support = 'en';
    ls.vocab.cards = { matching: true, flashcards: false, write: false };
    ls.vocab.words = ['fondere/to melt', 'scappare/to escape', 'i dati/data', 'abituato/accustomed', 'il ghiaccio/ice', 'sciogliersi/to dissolve', 'la corrente/current', 'riscaldarsi/to warm up']
      .map(function (x, i) { const q = x.split('/'); return { id: 'w' + i, word: q[0], translation: q[1], image: '', selected: true }; });
    window.VLApp.openStudent(ls.id);
  });
  await page.waitForSelector('#view-student.active');
  await page.click('#btn-start');
  await page.waitForSelector('#s-panel .match');
  await page.waitForTimeout(900);
  const mc = await page.evaluate(function () {
    const p = document.querySelector('#s-panel');
    const foot = p.querySelector('.card-foot') || p.querySelector('.actions');
    return {
      coppie: p.querySelectorAll('.match .col:first-child .mchip').length,
      testata: (p.textContent.match(/\(\d+ di \d+\)/) || [''])[0],
      scroll: p.scrollHeight - p.clientHeight,
      pulsantiDentro: foot ? Math.round(p.getBoundingClientRect().bottom - foot.getBoundingClientRect().bottom) : 1
    };
  });
  // v52 stimava lo spazio con (altezza - 260)/52 e spezzava in due schermate lasciando mezzo schermo vuoto:
  // ora si misura lo spazio vero, quindi con 8 parole su uno schermo normale ci stanno tutte
  assert.strictEqual(mc.coppie, 8, 'con spazio a sufficienza le 8 coppie stanno in una sola schermata (erano ' + mc.coppie + ')');
  assert.strictEqual(mc.testata, '', 'e non compare "(1 di 2)"');
  assert.ok(mc.scroll <= 1, 'senza barra di scorrimento');
  assert.ok(mc.pulsantiDentro >= 0, 'con i pulsanti sempre dentro il pannello');
  // schermo basso: si divide, ma in round BILANCIATI e senza mai scorrere
  await page.setViewportSize({ width: 1180, height: 620 });
  await page.evaluate(function () { window.VLApp.openStudent(window.VLApp.S.student.lesson.id); });
  await page.waitForSelector('#view-student.active');
  await page.click('#btn-start');
  await page.waitForSelector('#s-panel .match');
  await page.waitForTimeout(900);
  const mc2 = await page.evaluate(function () {
    const p = document.querySelector('#s-panel');
    const foot = p.querySelector('.card-foot') || p.querySelector('.actions');
    const m = p.textContent.match(/\((\d+) di (\d+)\)/);
    return {
      coppie: p.querySelectorAll('.match .col:first-child .mchip').length,
      giri: m ? +m[2] : 1,
      scroll: p.scrollHeight - p.clientHeight,
      pulsantiDentro: foot ? Math.round(p.getBoundingClientRect().bottom - foot.getBoundingClientRect().bottom) : 1
    };
  });
  assert.ok(mc2.giri > 1, 'su uno schermo basso si divide');
  assert.ok(mc2.coppie * mc2.giri - 8 < mc2.giri, 'i giri sono bilanciati, niente ultimo giro con una coppia sola (' + mc2.coppie + ' x ' + mc2.giri + ')');
  assert.ok(mc2.scroll <= 1 && mc2.pulsantiDentro >= 0, 'e anche lì niente scorrimento, pulsanti dentro');
  await page.setViewportSize({ width: 1280, height: 900 });

  console.log('17. Parliamone: i suggerimenti di una comprensione non contengono la risposta');
  await page.evaluate(function () {
    const S = window.VLApp.S;
    const ls = Object.keys(S.lessons).map(function (k) { return S.lessons[k]; })
      .filter(function (x) { return Array.isArray(x.exercises) && x.exercises.length; })[0];
    ls.talks[0].questions = [
      { id: 'q1', kind: 'check', text: 'Che cosa dice il video sul Mediterraneo?', help: 'Il video dice che il Mediterraneo è il mare che si scalda più in fretta al mondo · Secondo il video…' },
      { id: 'q2', kind: 'check', text: 'Perché i pesci si spostano?', help: 'Perché l\'acqua è salita di 2 gradi · Si spostano perché…' },
      { id: 'q3', kind: 'talk', text: 'Ti preoccupa?', help: 'Non sono d\'accordo perché secondo me… · Nel mio paese…' }
    ];
    window.VLApp.openEditor(ls.id);
  });
  await page.waitForSelector('#view-editor.active');
  await page.waitForTimeout(800);
  const pulisci = page.locator('.talk-card button', { hasText: 'Togli le risposte' });
  assert.strictEqual(await pulisci.count(), 1, 'l\'editor si accorge dei suggerimenti che rispondono al posto dello studente');
  assert.ok(/\(2\)/.test(await pulisci.textContent()), 'e dice quante domande sono');
  await pulisci.click();
  await page.waitForTimeout(500);
  const dopo = await page.evaluate(function () {
    const S = window.VLApp.S;
    const ls = Object.keys(S.lessons).map(function (k) { return S.lessons[k]; })
      .filter(function (x) { return Array.isArray(x.exercises) && x.exercises.length; })[0];
    return ls.talks[0].questions.map(function (q) { return q.help; });
  });
  assert.strictEqual(dopo[0], 'Secondo il video…', 'della comprensione resta solo l\'attacco di frase');
  assert.strictEqual(dopo[1], 'Si spostano perché…', 'via anche lo spezzone con le cifre');
  assert.ok(dopo[2].indexOf('Nel mio paese') !== -1, 'le domande di opinione non si toccano');
  assert.ok(await page.$('#undo-bar.show'), 'e si può annullare');
  assert.strictEqual(await page.locator('.talk-card button', { hasText: 'Togli le risposte' }).count(), 0, 'il pulsante sparisce quando non serve più');

  console.log('18. due soli tempi per esercizio, e "Aggiorna testo" riscrive la frase su quei secondi');
  await page.evaluate(function () {
    const S = window.VLApp.S;
    const ls = Object.keys(S.lessons).map(function (k) { return S.lessons[k]; })
      .filter(function (x) { return Array.isArray(x.exercises) && x.exercises.length; })[0];
    window.VLApp.openEditor(ls.id);
  });
  await page.waitForSelector('#view-editor.active');
  await page.waitForFunction(function () { return document.querySelectorAll('#e-exercises .ex-card').length > 0; });
  await page.waitForTimeout(700);
  const tempi = await page.evaluate(function () {
    const card = document.querySelector('#e-exercises .ex-card');
    const ls = window.VLApp.S.lessons[window.VLApp.S.currentId];
    return {
      campi: card.querySelectorAll('.head input').length,
      riga: card.querySelector('.head').textContent,
      disallineati: ls.exercises.filter(function (e) { return e.markerTime !== e.segment.end; }).length
    };
  });
  // il terzo tempo ("il video si ferma a") non esiste piu': il segnaposto E' la fine della frase
  assert.strictEqual(tempi.campi, 2, 'nella riga dei tempi ci sono due soli numeri (erano ' + tempi.campi + ')');
  assert.ok(!/si ferma a/.test(tempi.riga), 'e non si parla piu\' di un terzo tempo');
  assert.strictEqual(tempi.disallineati, 0, 'in ogni esercizio il segnaposto coincide con la fine della frase');

  const primaFrase2 = await page.evaluate(function () { return window.VLApp.S.lessons[window.VLApp.S.currentId].exercises[0].sentence; });
  await page.evaluate(function () {
    const ls = window.VLApp.S.lessons[window.VLApp.S.currentId];
    const ex = ls.exercises[0];
    ex.segment = { start: Math.round((ex.segment.start + 12) * 10) / 10, end: Math.round((ex.segment.end + 16) * 10) / 10 };
    window.VLApp.openEditor(ls.id);
  });
  await page.waitForTimeout(700);
  const agg = page.locator('#e-exercises .ex-card button', { hasText: 'Aggiorna testo' }).first();
  assert.strictEqual(await agg.count(), 1, 'il pulsante "Aggiorna testo" c\'e\'');
  assert.ok(await agg.evaluate(function (b) { return b.classList.contains('warn'); }), 'ed e\' acceso: il testo non corrisponde piu\' ai tempi');
  await agg.click();
  await page.waitForTimeout(700);
  const dopo2 = await page.evaluate(function () {
    const ls = window.VLApp.S.lessons[window.VLApp.S.currentId];
    const ex = ls.exercises.slice().sort(function (a, b) { return a.segment.end - b.segment.end; })[0];
    return { frase: ex.sentence, allineato: ex.markerTime === ex.segment.end };
  });
  assert.notStrictEqual(dopo2.frase, primaFrase2, 'la frase e\' stata riscritta su quei secondi');
  assert.ok(dopo2.frase.length > 10, 'e non e\' vuota');
  assert.ok(dopo2.allineato, 'il segnaposto resta la fine della frase anche dopo');

  // Nessuno dei due lati si muove da solo: cambiando il TESTO i tempi restano dove sono
  // finche' non si preme "⟳ Aggiorna tempi" ("devo io essere quello che chiede di ricalcolarlo").
  const t0 = await page.evaluate(function () {
    const ex = window.VLApp.S.lessons[window.VLApp.S.currentId].exercises[0];
    return { s: ex.segment.start, e: ex.segment.end, frase: ex.sentence };
  });
  const accorciata = t0.frase.split(/\s+/).slice(3).join(' ');
  const ta2 = page.locator('#e-exercises .ex-card textarea.sentence-edit').first();
  await ta2.fill(accorciata);
  await ta2.dispatchEvent('change');
  await page.waitForTimeout(600);
  const t1 = await page.evaluate(function () {
    const ex = window.VLApp.S.lessons[window.VLApp.S.currentId].exercises[0];
    return { s: ex.segment.start, e: ex.segment.end };
  });
  assert.ok(Math.abs(t1.s - t0.s) < 0.001 && Math.abs(t1.e - t0.e) < 0.001, 'i tempi non si spostano da soli quando cambia il testo');
  const bTempi = page.locator('#e-exercises .ex-card button', { hasText: 'Aggiorna tempi' }).first();
  assert.strictEqual(await bTempi.count(), 1, 'c\'e\' il pulsante "Aggiorna tempi"');
  assert.ok(await bTempi.evaluate(function (x) { return x.classList.contains('warn'); }), 'ed e\' acceso: testo e tempi non combaciano');
  await bTempi.click();
  await page.waitForTimeout(700);
  const t2 = await page.evaluate(function () {
    const ex = window.VLApp.S.lessons[window.VLApp.S.currentId].exercises[0];
    return { s: ex.segment.start, e: ex.segment.end, m: ex.markerTime };
  });
  assert.ok(t2.s > t0.s + 0.2, 'chiesto a mano, l\'inizio si sposta sulle parole rimaste');
  assert.strictEqual(t2.m, t2.e, 'e il segnaposto resta la fine della frase');
  assert.ok(!(await page.locator('#e-exercises .ex-card button', { hasText: 'Aggiorna tempi' }).first().evaluate(function (x) { return x.classList.contains('warn'); })), 'i pulsanti si spengono quando testo e tempi combaciano');

  console.log('19. esercizio "controllato": sfondo verde, e il salvataggio resta automatico');
  await page.evaluate(function () {
    const S = window.VLApp.S;
    const ls = Object.keys(S.lessons).map(function (k) { return S.lessons[k]; })
      .filter(function (x) { return Array.isArray(x.exercises) && x.exercises.length; })[0];
    window.VLApp.openEditor(ls.id);
  });
  await page.waitForSelector('#view-editor.active');
  await page.waitForFunction(function () { return document.querySelectorAll('#e-exercises .ex-card').length > 0; });
  await page.waitForTimeout(700);
  const rev = function () {
    return page.evaluate(function () {
      const c = document.querySelector('#e-exercises .ex-card');
      return { verde: c.classList.contains('reviewed'), sfondo: getComputedStyle(c).backgroundColor, pulsante: c.querySelector('button.right').textContent.trim() };
    });
  };
  const r0 = await rev();
  assert.ok(!r0.verde && r0.sfondo === 'rgb(255, 255, 255)', 'gli esercizi proposti partono bianchi');
  await page.locator('#e-exercises .ex-card button.right').first().click();
  await page.waitForTimeout(500);
  const r1 = await rev();
  assert.ok(r1.verde && r1.sfondo !== 'rgb(255, 255, 255)', 'dopo "segna come controllato" la card diventa verde');
  assert.ok(/Controllato/.test(r1.pulsante), 'e il pulsante lo dice');
  assert.strictEqual(await page.evaluate(function () {
    return JSON.parse(localStorage.getItem('vle.lessons'))[window.VLApp.S.currentId].exercises[0].reviewed;
  }), true, 'il segno e\' salvato nella lezione, non solo a schermo');
  // se il contenuto cambia, il "controllato" non vale piu': va rimesso guardandolo
  await page.locator('#e-exercises .ex-card button', { hasText: 'Rigenera' }).first().click();
  await page.waitForTimeout(600);
  assert.ok(!(await rev()).verde, 'rigenerando l\'esercizio il verde si spegne');
  await page.locator('#e-exercises .ex-card button.right').first().click();
  await page.waitForTimeout(400);
  assert.ok((await rev()).verde, 'e si puo\' rimettere');
  await page.locator('#e-exercises .ex-card button.right').first().click();
  await page.waitForTimeout(400);
  assert.ok(!(await rev()).verde, 'e togliere');
  // il salvataggio automatico c'e' comunque: una modifica qualsiasi finisce in localStorage senza premere niente
  const frasePrima = await page.evaluate(function () { return window.VLApp.S.lessons[window.VLApp.S.currentId].exercises[1].sentence; });
  await page.evaluate(function () {
    const ls = window.VLApp.S.lessons[window.VLApp.S.currentId];
    ls.exercises[1].sentence = 'Frase cambiata senza premere nessun pulsante di salvataggio.';
    window.VLApp.S.__t = ls;
  });
  await page.evaluate(function () { window.VLApp.S.lessons[window.VLApp.S.currentId].updatedAt = new Date().toISOString(); });
  await page.locator('#e-exercises .ex-card textarea.sentence-edit').first().dispatchEvent('change');
  await page.waitForTimeout(900);
  const inStorage = await page.evaluate(function () {
    return JSON.parse(localStorage.getItem('vle.lessons'))[window.VLApp.S.currentId].exercises[1].sentence;
  });
  assert.notStrictEqual(inStorage, frasePrima, 'le modifiche finiscono in localStorage da sole, senza premere Salva');

  console.log('20. sincronia audio, spazi fra le parole, banca che si svuota, Traduci con la bandiera');
  await page.evaluate(function () {
    const S = window.VLApp.S;
    const ls = Object.keys(S.lessons).map(function (k) { return S.lessons[k]; })
      .filter(function (x) { return Array.isArray(x.exercises) && x.exercises.length; })[0];
    S.settings.apiKey = 'sk-test';
    window.VLApp.openEditor(ls.id);
  });
  await page.waitForSelector('#view-editor.active');
  await page.waitForFunction(function () { return document.querySelectorAll('#e-exercises .ex-card').length > 0; });
  await page.waitForTimeout(700);
  // la sincronia audio si regola e sposta davvero la riproduzione
  await page.click('#e-sync-plus'); await page.click('#e-sync-plus');
  await page.waitForTimeout(250);
  const sync = await page.evaluate(function () {
    const ls = window.VLApp.S.lessons[window.VLApp.S.currentId];
    const ex = ls.exercises[0];
    let seekTo = null;
    const orig = window.VLApp.S.player.seek;
    window.VLApp.S.player.seek = function (t) { seekTo = t; return orig.call(this, t); };
    document.querySelector('#e-exercises .ex-card button.play').click();
    window.VLApp.S.player.seek = orig;
    return { offset: ls.options.audioOffset, chiesto: seekTo, inizio: ex.segment.start, mostrato: document.querySelector('#e-sync-val').textContent };
  });
  assert.ok(Math.abs(sync.offset - 0.2) < 0.001, 'la sincronia si regola a passi di un decimo');
  assert.ok(/0,2/.test(sync.mostrato), 'ed e\' scritta in chiaro: ' + sync.mostrato);
  assert.ok(Math.abs(sync.chiesto - (sync.inizio + sync.offset)) < 0.01, 'il video parte spostato dell\'offset');
  await page.click('#e-sync-zero'); await page.waitForTimeout(200);
  assert.strictEqual(await page.evaluate(function () { return window.VLApp.S.lessons[window.VLApp.S.currentId].options.audioOffset; }), 0, 'e si azzera');
  // il controllo delle traduzioni: l'avviso propone, non applica da solo
  await page.evaluate(function () {
    const ls = window.VLApp.S.lessons[window.VLApp.S.currentId];
    ls.vocab.words.unshift({ id: 'wtest', word: 'un conto', translation: 'a bill', selected: true });
    window.VLApp.openEditor(ls.id);
  });
  await page.waitForTimeout(600);
  await page.evaluate(function () {
    const ls = window.VLApp.S.lessons[window.VLApp.S.currentId];
    window.VLApp.renderVocabWarnings(ls, [{ word: 'un conto', translation: 'a bill', verdict: 'ambigua', why: 'Qui introduce un paragone.', suggest: { word: 'un conto è', translation: 'one thing is' } }]);
  });
  await page.waitForSelector('#e-vocab-warn .vw-row');
  assert.strictEqual(await page.evaluate(function () {
    return window.VLApp.S.lessons[window.VLApp.S.currentId].vocab.words[0].word;
  }), 'un conto', 'finche\' non clicchi, niente cambia');
  await page.click('#e-vocab-warn button:has-text("Usa questa")');
  await page.waitForTimeout(500);
  const vv = await page.evaluate(function () {
    const w = window.VLApp.S.lessons[window.VLApp.S.currentId].vocab.words.find(function (x) { return /un conto/.test(x.word); });
    return w ? { word: w.word, tr: w.translation } : null;
  });
  assert.strictEqual(vv.word, 'un conto è', 'la proposta si applica solo su richiesta');
  assert.strictEqual(vv.tr, 'one thing is', 'con la sua traduzione');
  // Traduci con la bandiera + elenco delle lingue
  await page.click('#e-exercises .ex-card:first-child button:has-text("Anteprima")');
  await page.waitForSelector('.tr-wrap .tr-btn');
  await page.waitForTimeout(300);
  const bandiera = await page.$eval('.tr-wrap .tr-btn', function (b) { return b.textContent; });
  assert.ok(/Traduci/.test(bandiera) && bandiera.length > 8, 'il pulsante mostra una bandiera: ' + JSON.stringify(bandiera));
  await page.click('.tr-wrap .tr-pick');
  await page.waitForSelector('.tr-menu .tr-opt');
  const nLingue = await page.$$eval('.tr-menu .tr-opt', function (o) { return o.length; });
  assert.ok(nLingue >= 16, 'almeno sedici lingue fra cui scegliere (sono ' + nLingue + ')');
  await page.evaluate(function () { [].slice.call(document.querySelectorAll('.tr-opt')).filter(function (o) { return /Spagnolo/.test(o.textContent); })[0].click(); });
  await page.waitForTimeout(250);
  assert.notStrictEqual(await page.$eval('.tr-wrap .tr-btn', function (b) { return b.textContent; }), bandiera, 'scegliendo un\'altra lingua la bandiera cambia');

  console.log('21. foto delle schede: si ingrandisce al clic e si chiude sempre; aiuto "parola in più" a zona');
  const fotoSvg = function (t) { return 'data:image/svg+xml;base64,' + Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="400" height="300"><rect width="400" height="300" fill="#8fb8de"/><text x="200" y="160" font-size="30" text-anchor="middle">' + t + '</text></svg>').toString('base64'); };
  await page.evaluate(function (imgs) {
    const S = window.VLApp.S;
    const ls = Object.keys(S.lessons).map(function (k) { return S.lessons[k]; })
      .filter(function (x) { return Array.isArray(x.exercises) && x.exercises.length; })[0];
    ls.vocab = ls.vocab || {};
    ls.vocab.support = 'en';
    ls.vocab.cards = { matching: true, flashcards: false, write: false };
    ls.vocab.words = [
      { id: 'z1', word: 'i farmaci', translation: 'drugs', image: imgs[0], selected: true },
      { id: 'z2', word: 'prelevare una cellula', translation: 'to harvest a cell', image: '', selected: true },
      { id: 'z3', word: 'un campione', translation: 'a sample', image: imgs[1], selected: true }
    ];
    window.VLApp.openStudent(ls.id);
  }, [fotoSvg('A'), fotoSvg('B')]);
  await page.waitForSelector('#view-student.active');
  await page.click('#btn-start');
  await page.waitForSelector('#s-panel .match .mchip');
  await page.waitForTimeout(700);
  // i blocchi con la foto e quelli con la parola hanno la stessa altezza
  const altezze = await page.$$eval('#s-panel .match .col .mchip', function (c) { return c.map(function (x) { return Math.round(x.getBoundingClientRect().height); }); });
  assert.ok(Math.max.apply(null, altezze) - Math.min.apply(null, altezze) <= 2, 'blocchi proporzionati: ' + JSON.stringify(altezze));
  assert.ok(await page.$('#s-panel .back .zoom-hint'), 'sulla foto c\'e\' scritto come ingrandirla');
  // la foto sta DENTRO il rettangolo arrotondato: niente pixel fuori dal bordo del blocco (v61)
  const fuori = await page.$$eval('#s-panel .match .col .mchip', function (cs) {
    return cs.map(function (c) {
      const im = c.querySelector('img'); if (!im) return 0;
      const a = c.getBoundingClientRect(), b = im.getBoundingClientRect();
      return Math.round(Math.max(0, a.top - b.top, b.bottom - a.bottom, a.left - b.left, b.right - a.right));
    });
  });
  assert.ok(Math.max.apply(null, fuori.concat([0])) === 0, 'la foto non esce dal blocco: ' + JSON.stringify(fuori));
  const aperto = function () { return page.evaluate(function () { const p = document.querySelector('.img-preview'); return !!(p && p.classList.contains('show')); }); };
  // il passaggio del mouse NON deve aprire niente (prima restava aperto e copriva le parole)
  await page.hover('#s-panel .back.zoomable');
  await page.waitForTimeout(400);
  assert.ok(!(await aperto()), 'il passaggio del mouse non apre l\'ingrandimento');
  // IL CLIC SULLA FOTO E' L'ABBINAMENTO, non lo zoom (v61: 'non mi fa fare il matching, se clicco con la parola
  // giusta da abbinare mi si apre ogni volta il pop-up'). Lo zoom sta solo sul pulsantino.
  await page.click('#s-panel .match .col .mchip:not(.target)');              // prima la parola
  await page.waitForTimeout(150);
  await page.click('#s-panel .back.zoomable');                              // poi una foto
  await page.waitForTimeout(350);
  assert.ok(!(await aperto()), 'il clic sulla foto NON apre l\'ingrandimento');
  const scelto = await page.evaluate(function () {
    return { coppie: document.querySelectorAll('#s-panel .match-done .mpair').length,
             sbagliato: !!document.querySelector('#s-panel .mchip.wrongpick'),
             sel: document.querySelectorAll('#s-panel .mchip.sel').length };
  });
  assert.ok(scelto.coppie + (scelto.sbagliato ? 1 : 0) > 0, 'il clic sulla foto conta come abbinamento (giusto o sbagliato), non come zoom');
  await page.waitForTimeout(800);
  // il pulsantino apre e chiude
  await page.click('#s-panel .back .zoom-hint');
  await page.waitForTimeout(300);
  assert.ok(await aperto(), 'il pulsantino "ingrandisci" lo apre');
  assert.ok(await page.$('.img-preview .img-x'), 'e c\'e\' sempre la ✕ per chiuderlo');
  await page.click('#s-panel .back .zoom-hint');
  await page.waitForTimeout(300);
  assert.ok(!(await aperto()), 'e ricliccandolo si chiude (non si riapre da solo)');
  await page.click('#s-panel .back .zoom-hint'); await page.waitForTimeout(300);
  await page.click('.img-preview .img-x');
  await page.waitForTimeout(300);
  assert.ok(!(await aperto()), 'la ✕ chiude');
  await page.click('#s-panel .back .zoom-hint'); await page.waitForTimeout(250);
  await page.keyboard.press('Escape'); await page.waitForTimeout(250);
  assert.ok(!(await aperto()), 'Esc chiude');
  // e non deve seguirti nella sezione successiva
  await page.click('#s-panel .back .zoom-hint'); await page.waitForTimeout(250);
  assert.ok(await aperto(), 'riaperto per la prova');
  await page.click('#s-panel .actions button.link');   // "Salta le schede"
  await page.waitForTimeout(600);
  assert.ok(!(await aperto()), 'cambiando sezione l\'ingrandimento si chiude');

  // aiuto di "parola in più": segna una zona che lampeggia, non la parola
  const info = await page.evaluate(function () {
    const S = window.VLApp.S, EX = window.VLEx;
    const ls = S.lessons[S.currentId];
    const f = 'È un dataset incredibile, certo limitato al dato superficiale dell\'acqua, ma a livello globale.';
    const nb = EX.buildExercise('extra', f, { lang: 'it', seed: 9 });
    const ex = ls.exercises[0];
    ex.type = 'extra'; ex.sentence = f; ex.data = nb.data;
    window.VLApp.openEditor(ls.id);
    return { parola: nb.data.extraWord };
  });
  await page.waitForTimeout(800);
  await page.click('#e-exercises .ex-card:first-child button:has-text("Anteprima")');
  await page.waitForSelector('#e-stage .chips .chip, .pop .chips .chip, #e-panel .chips .chip');
  await page.waitForTimeout(300);
  const zona = function () { return page.evaluate(function () { const z = [].slice.call(document.querySelectorAll('.chip.zone')); return { n: z.length, testi: z.map(function (c) { return c.textContent; }), lampeggia: z.filter(function (c) { return c.classList.contains('zone-flash'); }).length }; }); };
  assert.strictEqual((await zona()).n, 0, 'prima dell\'aiuto non c\'e\' nessuna zona');
  await page.click('button.hint-btn');
  await page.waitForTimeout(400);
  const z1 = await zona();
  assert.strictEqual(z1.n, 5, 'il primo aiuto segna cinque parole (erano ' + z1.n + ')');
  assert.ok(z1.testi.indexOf(info.parola) !== -1, 'la parola in più è dentro la zona');
  assert.strictEqual(z1.lampeggia, 5, 'e la zona lampeggia');
  await page.click('button.hint-btn');
  await page.waitForTimeout(400);
  const z2 = await zona();
  assert.strictEqual(z2.n, 3, 'il secondo aiuto stringe a tre');
  assert.ok(z2.testi.indexOf(info.parola) !== -1, 'e la parola c\'e\' ancora');

  console.log('22. taglio "fino alla fine del video" e annuncio YouTube che non manda in tilt la lezione');
  await page.evaluate(function () {
    const S = window.VLApp.S;
    const ls = Object.keys(S.lessons).map(function (k) { return S.lessons[k]; })
      .filter(function (x) { return Array.isArray(x.exercises) && x.exercises.length; })[0];
    window.VLApp.openEditor(ls.id);
  });
  await page.waitForSelector('#view-editor.active');
  await page.waitForFunction(function () { return document.querySelectorAll('#e-cuts .cut-row').length > 0; });
  await page.waitForTimeout(500);
  await page.click('#e-cuts .cut-row:first-child button:has-text("Fino alla fine")');
  await page.waitForTimeout(400);
  const fineTaglio = await page.evaluate(function () {
    const ls = window.VLApp.S.lessons[window.VLApp.S.currentId];
    return { max: ls.cuts.map(function (c) { return c.end; }).sort(function (a, b) { return b - a; })[0], durata: ls.duration };
  });
  assert.ok(Math.abs(fineTaglio.max - fineTaglio.durata) < 0.11, 'il taglio arriva alla fine del video (' + fineTaglio.max + ' vs ' + fineTaglio.durata + ')');
  await page.keyboard.press('Control+z');
  await page.waitForTimeout(300);

  // durante un annuncio il player restituisce i tempi DELLO SPOT: niente esercizi, niente riascolti chiusi a vuoto
  const ad = await page.evaluate(function () {
    const S = window.VLApp.S, ls = S.lessons[S.currentId];
    const vera = S.player.duration;
    S.player.duration = function () { return 15; };          // durata tipica di un annuncio
    const inAdOra = ls.duration > 20;
    S.player.duration = vera;
    return { durataVideo: ls.duration, riconoscibile: inAdOra };
  });
  assert.ok(ad.riconoscibile, 'il video di prova è abbastanza lungo da distinguere uno spot');
  const durante = await page.evaluate(function () {
    const S = window.VLApp.S, ls = S.lessons[S.currentId];
    const vera = S.player.duration;
    S.player.duration = function () { return 15; };
    const esito = { inAd: window.VLApp.inAd(ls) };
    S.player.duration = vera;
    esito.fuoriAd = window.VLApp.inAd(ls);
    return esito;
  });
  assert.strictEqual(durante.inAd, true, 'con la durata dello spot l\'app capisce che c\'è un annuncio');
  assert.strictEqual(durante.fuoriAd, false, 'e con la durata vera no');

  // ASPETTARE NON E' ESSERE BLOCCATI (v62, 'ci ha messo 20 secondi per partire'): un player che sta caricando
  // (stato 3) per 8 secondi NON deve far dire 'Il video non riparte: premi ▶'; deve dire che sta caricando,
  // e non deve tempestarlo di play(). Un player davvero fermo (stato 2, che ignora play) viene riprovato e poi,
  // se non parte, il riascolto viene CHIUSO (prima restava un riascolto morto e l'editor non tornava normale).
  const toastSeen = function () { return page.evaluate(function () { const t = document.querySelector('#toast'); return t && t.classList.contains('show') ? t.textContent : ''; }); };
  await page.evaluate(function () {
    const S = window.VLApp.S, p = S.player;
    p._realPlay = p.play; p._realState = p.state; p._plays = 0;
    p.play = function () { p._plays++; };                 // sordo
    p.state = function () { return 3; };                  // "sta caricando"
  });
  await page.click('#e-exercises .ex-card:first-child button.play:has-text("▶")');
  await page.waitForTimeout(2200);
  let tst = await toastSeen();
  assert.ok(/caricando/.test(tst), 'dopo 2 s dice che sta caricando (era: "' + tst + '")');
  await page.waitForTimeout(6000);
  const durante8 = await page.evaluate(function () { const S = window.VLApp.S; return { replay: !!S.editor.replay, plays: S.player._plays, done: !!(S.editor.replay && S.editor.replay.done) }; });
  assert.ok(durante8.replay && !durante8.done, 'dopo 8 s di caricamento il riascolto e\' ancora in attesa, non abbandonato');
  assert.ok(durante8.plays <= 3, 'mentre carica non si insiste con play() (chiamate: ' + durante8.plays + ')');
  tst = await toastSeen();
  assert.ok(!/non riparte/.test(tst), 'niente falso allarme "non riparte" mentre carica');
  // ora il player e' FERMO (in pausa) e ignora play(): si riprova, poi si molla e si chiude il riascolto
  await page.evaluate(function () {
    const S = window.VLApp.S, p = S.player;
    p.state = function () { return 2; }; p._plays = 0;
    S.editor.replay.at = Date.now(); S.editor.replay.waitSaid = false; S.editor.replay.tries = 0;
  });
  await page.waitForTimeout(7000);
  const fermo = await page.evaluate(function () { const S = window.VLApp.S; return { replay: !!S.editor.replay, plays: S.player._plays }; });
  assert.ok(fermo.plays >= 3, 'con il player fermo si riprova play() piu\' volte (chiamate: ' + fermo.plays + ')');
  assert.ok(!fermo.replay, 'quando si rinuncia il riascolto viene chiuso, non lasciato appeso');
  tst = await toastSeen();
  assert.ok(/non riparte/.test(tst), 'e solo allora si avvisa (era: "' + tst + '")');
  await page.evaluate(function () { const p = window.VLApp.S.player; p.play = p._realPlay; p.state = p._realState; });

  console.log('23. lo spot passa in muto durante le schede: riquadro visibile, poi audio riacceso e video pulito');
  // il warm parte solo con un player YouTube: si traveste il player finto (kind, mute/unmute veri del mock)
  await page.evaluate(function () {
    const S = window.VLApp.S;
    const ls = Object.keys(S.lessons).map(function (k) { return S.lessons[k]; })
      .filter(function (x) { return Array.isArray(x.exercises) && x.exercises.length; })[0];
    ls.vocab.cards = { matching: true, flashcards: false, write: false };
    ls.vocab.words = [
      { id: 'w1', word: 'sonno', translation: 'sleep', selected: true },
      { id: 'w2', word: 'cervello', translation: 'brain', selected: true },
      { id: 'w3', word: 'sogno', translation: 'dream', selected: true }
    ];
    window.VLApp.openStudent(ls.id);
  });
  await page.waitForSelector('#view-student.active');
  await page.waitForTimeout(400);
  await page.evaluate(function () {
    const p = window.VLApp.S.player;
    p.kind = 'yt';
    p._dur = p.duration; p.duration = function () { return 15; };   // c'e' uno spot: il player dichiara la durata dello spot
  });
  await page.click('#btn-start');
  await page.waitForTimeout(900);
  const warm1 = await page.evaluate(function () {
    const S = window.VLApp.S, st = S.student;
    return { warm: !!(st && st.warmAd), visto: !!(st && st.warmAd && st.warmAd.seen), muto: !!S.player.muted,
             riquadro: document.querySelector('#s-stage').classList.contains('warmad'),
             tag: !!document.querySelector('#warmad-tag'),
             schede: !!document.querySelector('#s-panel .match .mchip') };
  });
  assert.ok(warm1.warm, 'il warm e\' attivo dopo "Inizia"');
  assert.ok(warm1.visto, 'lo spot e\' stato riconosciuto (durata corta)');
  assert.ok(warm1.muto, 'il player e\' in muto');
  assert.ok(warm1.riquadro, 'il riquadro del player e\' visibile (mai un player nascosto che suona)');
  assert.ok(warm1.tag, 'l\'etichetta "spot in corso" c\'e\'');
  assert.ok(warm1.schede, 'intanto lo studente e\' sulle schede delle parole');
  // lo spot finisce: la durata torna quella vera, il contenuto parte (il mock sta gia' suonando) -> chiusura pulita
  await page.evaluate(function () { const p = window.VLApp.S.player; p.duration = p._dur; });
  await page.waitForTimeout(1200);
  const warm2 = await page.evaluate(function () {
    const S = window.VLApp.S, st = S.student;
    return { warm: !!(st && st.warmAd), muto: !!S.player.muted, riquadro: document.querySelector('#s-stage').classList.contains('warmad'),
             tag: !!document.querySelector('#warmad-tag'), fermo: S.player.state() !== 1, tempo: S.player.time() };
  });
  assert.ok(!warm2.warm, 'finito lo spot il warm si chiude da solo');
  assert.ok(!warm2.muto, 'l\'audio e\' riacceso');
  assert.ok(!warm2.riquadro && !warm2.tag, 'riquadro ed etichetta spariscono');
  assert.ok(warm2.fermo, 'il video e\' in pausa, pronto');
  assert.ok(warm2.tempo < 1, 'ed e\' tornato all\'inizio (t=' + warm2.tempo + ')');
  await page.evaluate(function () { const p = window.VLApp.S.player; p.kind = 'mock'; });

  console.log('errori console/pagina:', errors.length ? errors : 'nessuno');
  assert.strictEqual(errors.filter(function (e) { return !/youtube|iframe_api|net::ERR/i.test(e); }).length, 0, 'nessun errore JS');
  await browser.close();
  console.log('\nSMOKE OK');
})().catch(function (e) { console.error('SMOKE FAIL', e); process.exit(1); });
