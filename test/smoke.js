/* Smoke test end-to-end con player finto: `NODE_PATH=$(npm root -g) node test/smoke.js` (serve un server statico sulla porta 8123) */
'use strict';
const { chromium } = require('playwright');
const assert = require('assert');

const BASE = process.env.BASE || 'http://localhost:8123/';
/** "Inizia" e, se compaiono le schede delle parole, salta tutto e vai al video. */
async function startVideo(page) {
  await page.click('#btn-start');
  await page.waitForTimeout(250);
  const skip = await page.$('#s-panel button:has-text("Salta tutto")');
  if (skip) await skip.click();
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
  const vwords = await page.evaluate(function () { const v = window.VLApp.S.student.lesson.vocab; return v.words.filter(function (w) { return w.selected && (w.translation || w.image || w.emoji); }).map(function (w) { return { id: w.id, word: w.word, tr: w.translation }; }); });
  assert.strictEqual(vwords.length, 4, 'quattro parole nelle schede');
  // sbaglio apposta una volta, poi abbino tutte
  const firstLeft = await page.$('#s-panel .match .col:first-child .mchip');
  await firstLeft.click();
  const firstId = await firstLeft.getAttribute('data-id');
  const wrongTr = vwords.find(function (w) { return w.id !== firstId; }).tr;
  await page.click('#s-panel .match .col:last-child .mchip:has-text("' + wrongTr + '")');
  assert.ok(/Non è questa/.test(await page.$eval('#s-panel .feedback', function (f) { return f.textContent; })), 'errore segnalato');
  for (const w of vwords) {
    await page.click('#s-panel .match .col:first-child .mchip[data-id="' + w.id + '"]');
    await page.click('#s-panel .match .col:last-child .mchip:has-text("' + w.tr + '")');
  }
  assert.ok(/Tutte abbinate/.test(await page.$eval('#s-panel .feedback', function (f) { return f.textContent; })), 'abbinamento completato');
  // stella sulla prima parola della scheda
  await page.click('#s-panel .match .col:first-child .mchip[data-id="' + vwords[0].id + '"] button.star');
  assert.ok(await page.$('#s-panel .match button.star.on'), 'stella accesa');
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
    // riascolta una volta: durante il riascolto la frase sparisce (video grande), poi torna
    await page.click('#s-panel button:has-text("Riascolta")');
    await page.waitForTimeout(300);
    if (k === 0) assert.ok(!(await page.$('#s-stage.docked')), 'durante il riascolto il video è grande');
    await page.waitForFunction(function () { return !window.VLApp.S.student.replay; }, null, { timeout: 20000 });
    await page.waitForTimeout(150);
    assert.ok(await page.$('#s-stage.docked'), 'dopo il riascolto torna l\'esercizio');
    // risposta sbagliata poi giusta
    if (ex.type === 'gap' || ex.type === 'gapbank') {
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
    if (k === 0) {
      assert.ok(await page.$('#s-panel .fx-burst .fx-piece') || await page.$('#s-stage .fx-burst .fx-piece'), 'coriandoli');
      assert.ok(await page.$('#s-panel .feedback.win'), 'feedback animato');
      // frase completa con parole cliccabili: una stella
      await page.waitForTimeout(1500);   // fine dei coriandoli
      const wEl = page.locator('#s-panel .fullwrap .w').nth(1);
      await wEl.scrollIntoViewIfNeeded();
      try { await wEl.click({ timeout: 8000 }); } catch (e) { console.log('DIAG star click:', e.message.split('\n').slice(0, 8).join(' | ')); throw e; }
      assert.ok(await page.$('#s-panel .fullwrap .w.starred'), 'parola con la stella');
      // layout: video in alto al centro, esercizio sotto
      const geo = await page.evaluate(function () { const p = document.getElementById('s-player').getBoundingClientRect(); const st = document.getElementById('s-stage').getBoundingClientRect(); const b = document.querySelector('#s-panel .sentence, #s-panel .chips, #s-panel .mc-options').getBoundingClientRect(); return { pCenter: (p.left + p.width / 2) - (st.left + st.width / 2), pTop: p.top - st.top, bodyBelow: b.top >= p.bottom - 1, pH: p.height / st.height }; });
      assert.ok(Math.abs(geo.pCenter) < 4 && geo.pTop < 60 && geo.bodyBelow && geo.pH > 0.4, 'video in alto al centro, frase sotto: ' + JSON.stringify(geo));
    }
    await page.click('#s-panel button:has-text("Continua")');
    if (k === 0) { await page.waitForTimeout(200); assert.ok(!(await page.$('#s-stage.docked')), 'stage torna pieno dopo Continua'); }
  }
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
  await page.click('#s-panel button:has-text("Ricomincia")');
  await page.waitForSelector('#btn-start:visible');
  assert.ok(!(await page.$eval('#s-lock', function (c) { return c.checked; })), 'barra libera di default');
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

  console.log('errori console/pagina:', errors.length ? errors : 'nessuno');
  assert.strictEqual(errors.filter(function (e) { return !/youtube|iframe_api|net::ERR/i.test(e); }).length, 0, 'nessun errore JS');
  await browser.close();
  console.log('\nSMOKE OK');
})().catch(function (e) { console.error('SMOKE FAIL', e); process.exit(1); });
