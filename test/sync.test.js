/* Test della sincronizzazione con il cloud (server finto in memoria, due "computer"): `node test/sync.test.js` */
'use strict';
const assert = require('assert');
const SY = require('../sync.js');

let passed = 0;
function test(name, fn) {
  return Promise.resolve().then(fn).then(function () { passed++; console.log('  ok  ' + name); })
    .catch(function (e) { console.log('  FAIL ' + name + '\n       ' + (e && e.stack ? e.stack.split('\n').slice(0, 3).join('\n       ') : e)); process.exitCode = 1; });
}
function iso(ms) { return new Date(ms).toISOString(); }
const T0 = Math.floor((Date.now() - 86400000) / 1000) * 1000;   // ieri: le date dei test devono stare nel passato

/** Un "computer": lezioni locali + stato di sincronizzazione in memoria, con l'adattatore dato. */
function device(server, userId, lessons) {
  const d = { lessons: {}, state: null, applied: [], saved: 0, statuses: [] };
  (lessons || []).forEach(function (l) { d.lessons[l.id] = JSON.parse(JSON.stringify(l)); });
  d.sync = SY.createSync({
    adapter: server.adapterFor(userId),
    getLocal: function () { return d.lessons; },
    apply: function (ch) {
      d.applied.push(ch);
      const skipped = [];
      (ch.remove || []).forEach(function (id) { if (id === d.skip) skipped.push(id); else delete d.lessons[id]; });
      (ch.replace || []).forEach(function (ls) { if (ls.id === d.skip) skipped.push(ls.id); else d.lessons[ls.id] = ls; });
      return { skipped: skipped };
    },
    save: function () { d.saved++; },
    loadState: function () { return d.state; },
    saveState: function (st) { d.state = JSON.parse(JSON.stringify(st)); },
    onStatus: function (s) { d.statuses.push(s.state); },
    delay: 1
  });
  return d;
}
function lesson(id, title, at, extra) { return Object.assign({ v: 1, id: id, title: title, exercises: [{ id: 'e1', type: 'gap', sentence: 'Il mare è caldo.' }], _cache: 'non si salva', updatedAt: iso(at) }, extra); }

(async function () {
  console.log('plan (funzione pura)');
  await test('lezioni solo locali → push; solo remote → pull; uguali → niente', function () {
    const a = lesson('a', 'A', T0), b = lesson('b', 'B', T0);
    const state = { synced: { b: { hash: SY.hash(SY.serialize(b)), at: b.updatedAt } }, deleted: {} };
    const p = SY.plan({ a: a, b: b }, [{ id: 'b', updated_at: iso(T0), deleted: false }, { id: 'c', updated_at: iso(T0), deleted: false }], state);
    assert.deepStrictEqual(p.push, ['a']); assert.deepStrictEqual(p.pull, ['c']); assert.deepStrictEqual(p.dropLocal, []); assert.deepStrictEqual(p.bump, []);
  });
  await test('remoto più recente → pull anche se il locale è sporco; locale più recente → push', function () {
    const a = lesson('a', 'A', T0 + 1000), b = lesson('b', 'B', T0);
    const p = SY.plan({ a: a, b: b }, [{ id: 'a', updated_at: iso(T0), deleted: false }, { id: 'b', updated_at: iso(T0 + 5000), deleted: false }], { synced: {}, deleted: {} });
    assert.deepStrictEqual(p.push, ['a']); assert.deepStrictEqual(p.pull, ['b']);
  });
  await test('cambiata senza toccare updatedAt → push con bump', function () {
    const a = lesson('a', 'A', T0);
    const state = { synced: { a: { hash: 'vecchia', at: a.updatedAt } }, deleted: {} };
    const p = SY.plan({ a: a }, [{ id: 'a', updated_at: iso(T0), deleted: false }], state);
    assert.deepStrictEqual(p.push, ['a']); assert.deepStrictEqual(p.bump, ['a']);
  });
  await test('tombstone remoto: si elimina in locale, salvo modifica locale successiva', function () {
    const a = lesson('a', 'A', T0), b = lesson('b', 'B', T0 + 9000);
    const state = { synced: { a: { hash: SY.hash(SY.serialize(a)), at: a.updatedAt }, b: { hash: 'diversa', at: iso(T0) } }, deleted: {} };
    const p = SY.plan({ a: a, b: b }, [{ id: 'a', updated_at: iso(T0 + 1000), deleted: true }, { id: 'b', updated_at: iso(T0 + 1000), deleted: true }], state);
    assert.deepStrictEqual(p.dropLocal, ['a']); assert.deepStrictEqual(p.push, ['b']);
  });
  await test('eliminazione locale: removeRemote se più recente, altrimenti la lezione torna', function () {
    const state = { synced: {}, deleted: { a: iso(T0 + 5000), b: iso(T0), z: iso(T0) } };
    const p = SY.plan({}, [{ id: 'a', updated_at: iso(T0), deleted: false }, { id: 'b', updated_at: iso(T0 + 5000), deleted: false }], state);
    assert.deepStrictEqual(p.removeRemote, ['a']); assert.deepStrictEqual(p.pull, ['b']);
    assert.ok(p.forgetTombstone.indexOf('b') >= 0 && p.forgetTombstone.indexOf('z') >= 0);
  });
  await test('serialize scarta i campi "_" e hash cambia col contenuto', function () {
    const a = lesson('a', 'A', T0);
    assert.ok(SY.serialize(a).indexOf('_cache') === -1);
    const h1 = SY.hash(SY.serialize(a)); a.title = 'A2';
    assert.notStrictEqual(h1, SY.hash(SY.serialize(a)));
  });

  console.log('Due computer, stesso account');
  const server = SY.memoryServer();
  const A = device(server, 'u1', [lesson('l1', 'Mare caldo', T0), lesson('l2', 'Dentifricio', T0)]);
  const B = device(server, 'u1', []);
  await test('A carica le sue lezioni; niente in sospeso dopo', async function () {
    const r = await A.sync.sync();
    assert.strictEqual(r.pushed, 2); assert.strictEqual(r.pulled, 0);
    assert.strictEqual(Object.keys(server.rows).length, 2);
    assert.strictEqual(A.sync.pending(), 0);
    assert.strictEqual(A.state.owner, 'u1');
    assert.ok(server.rows['u1:l1'].data && !('_cache' in server.rows['u1:l1'].data), 'i campi _ non vanno nel cloud');
  });
  await test('B scarica tutto; l\'impronta resta stabile anche con le chiavi riordinate dal server', async function () {
    const r = await B.sync.sync();
    assert.strictEqual(r.pulled, 2); assert.strictEqual(r.pushed, 0);
    assert.strictEqual(B.lessons.l1.title, 'Mare caldo');
    assert.strictEqual(B.sync.pending(), 0, 'dopo il pull niente risulta da caricare');
    const r2 = await B.sync.sync();
    assert.strictEqual(r2.pushed + r2.pulled, 0, 'seconda passata: nessun traffico');
  });
  await test('B modifica l1 → A la riceve', async function () {
    B.lessons.l1.title = 'Mare caldo (rivisto)'; B.lessons.l1.updatedAt = iso(T0 + 60000);
    B.sync.noteLocalChange();
    const r = await B.sync.sync(); assert.strictEqual(r.pushed, 1);
    const ra = await A.sync.sync(); assert.strictEqual(ra.pulled, 1);
    assert.strictEqual(A.lessons.l1.title, 'Mare caldo (rivisto)');
  });
  await test('A elimina l2 → B la perde', async function () {
    delete A.lessons.l2; A.sync.noteLocalChange();
    assert.ok(A.state.deleted.l2, 'tombstone locale registrata');
    const r = await A.sync.sync(); assert.strictEqual(r.removed, 1);
    assert.strictEqual(server.rows['u1:l2'].deleted, true);
    const rb = await B.sync.sync(); assert.strictEqual(rb.dropped, 1);
    assert.ok(!B.lessons.l2);
    assert.deepStrictEqual(A.state.deleted, {});
  });
  await test('modifica senza updatedAt: la data viene aggiornata e l\'altro computer la scarica', async function () {
    A.lessons.l1.exercises.push({ id: 'e2', type: 'mc' });
    const before = A.lessons.l1.updatedAt;
    A.sync.noteLocalChange();
    const r = await A.sync.sync(); assert.strictEqual(r.pushed, 1);
    assert.notStrictEqual(A.lessons.l1.updatedAt, before); assert.ok(A.saved >= 1);
    const rb = await B.sync.sync(); assert.strictEqual(rb.pulled, 1);
    assert.strictEqual(B.lessons.l1.exercises.length, 2);
  });
  await test('conflitto: vince l\'ultima modifica', async function () {
    const now = Date.now();
    A.lessons.l1.title = 'versione A'; A.lessons.l1.updatedAt = iso(now + 1000);
    B.lessons.l1.title = 'versione B'; B.lessons.l1.updatedAt = iso(now + 2000);
    await A.sync.sync(); await B.sync.sync();
    assert.strictEqual(server.rows['u1:l1'].title, 'versione B');
    const ra = await A.sync.sync(); assert.strictEqual(ra.pulled, 1);
    assert.strictEqual(A.lessons.l1.title, 'versione B');
  });
  await test('eliminata su A ma modificata dopo su B → torna su entrambi', async function () {
    delete A.lessons.l1; A.sync.noteLocalChange(); await A.sync.sync();
    assert.strictEqual(server.rows['u1:l1'].deleted, true);
    B.lessons.l1.title = 'resuscitata'; B.lessons.l1.updatedAt = iso(Date.now() + 10000);   // dopo l'eliminazione (che vale max(adesso, ultima versione + 1 s))
    const rb = await B.sync.sync(); assert.strictEqual(rb.pushed, 1);
    assert.strictEqual(server.rows['u1:l1'].deleted, false);
    const ra = await A.sync.sync(); assert.strictEqual(ra.pulled, 1);
    assert.strictEqual(A.lessons.l1.title, 'resuscitata');
  });
  await test('lezione nuova creata su A mentre il server non risponde: riprova e poi carica', async function () {
    A.lessons.l3 = lesson('l3', 'Nuova', Date.now());
    server.failNext = 'rete assente';
    await assert.rejects(A.sync.sync(), /rete assente/);
    assert.strictEqual(A.sync.status.state, 'error'); assert.strictEqual(A.sync.status.pending, 1);
    const r = await A.sync.sync(); assert.strictEqual(r.pushed, 1); assert.strictEqual(A.sync.status.state, 'ok');
  });
  await test('lezione aperta dallo studente: il pull viene rimandato, non contato come sincronizzato', async function () {
    A.lessons.l3.title = 'Nuova 2'; A.lessons.l3.updatedAt = iso(Date.now() + 2000); A.sync.noteLocalChange(); await A.sync.sync();
    B.skip = 'l3';
    const rb = await B.sync.sync(); assert.strictEqual(rb.pulled, 0);
    B.skip = null;
    const rb2 = await B.sync.sync(); assert.strictEqual(rb2.pulled, 1); assert.strictEqual(B.lessons.l3.title, 'Nuova 2');
  });
  await test('chiamate concorrenti: la seconda si accoda, nessuna eccezione', async function () {
    A.lessons.l3.title = 'x'; A.lessons.l3.updatedAt = iso(Date.now() + 3000);
    const p1 = A.sync.sync(), p2 = A.sync.sync();
    assert.strictEqual(p1, p2);
    await p1;
    await new Promise(function (res) { setTimeout(res, 400); });
    assert.strictEqual(A.sync.pending(), 0);
  });
  await test('senza utente: stato "offline", niente traffico', async function () {
    const C = device(server, null, [lesson('z', 'Z', T0)]);
    const r = await C.sync.sync();
    assert.strictEqual(r.pushed, 0); assert.strictEqual(C.sync.status.state, 'offline');
    assert.ok(!server.rows['null:z']);
  });
  await test('altro account sullo stesso browser: lo stato riparte e le lezioni locali vanno nel nuovo account', async function () {
    const D = device(server, 'u1', []); await D.sync.sync();
    assert.ok(Object.keys(D.state.synced).length >= 1);
    D.sync = SY.createSync({ adapter: server.adapterFor('u2'), getLocal: function () { return D.lessons; }, apply: function () { return {}; }, loadState: function () { return D.state; }, saveState: function (st) { D.state = st; }, delay: 1 });
    const r = await D.sync.sync();
    assert.strictEqual(D.state.owner, 'u2'); assert.ok(r.pushed >= 1);
    assert.ok(server.rows['u2:l1'] || server.rows['u2:l3']);
  });
  await test('RLS finta: non si scrive su righe di altri', async function () {
    const ad = server.adapterFor('u2');
    await assert.rejects(ad.upsert([{ owner: 'u1', id: 'hack', data: {}, updated_at: iso(T0), deleted: false }]), /RLS/);
  });

  console.log(passed + ' test superati' + (process.exitCode ? ' (con errori)' : ''));
})();
