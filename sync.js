/* sync.js — lezioni nel cloud (Supabase): unione tra la copia locale (localStorage) e quella remota.
   Regola: vince l'ultima modifica (updatedAt della lezione); le eliminazioni viaggiano come "tombstone" (riga con deleted=true).
   Il modulo è puro (plan/createSync lavorano su un adattatore iniettato) e si testa in Node senza rete. */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.VLSync = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  // Configurazione pubblica. La chiave "anon" di Supabase è fatta per stare nel browser: i dati sono protetti dalle regole per riga (RLS),
  // ogni utente legge e scrive solo le proprie lezioni. Con url vuoto il cloud è spento e l'app lavora solo in locale.
  const CONFIG = {
    url: 'https://raakqcqrcgbfncevxauz.supabase.co',          // progetto "video-lezioni" (org Video Lezioni, Supabase, eu-west-1)
    anonKey: 'sb_publishable_40BFSphEmaZ0u7FU9MI8_w_ZHEwunq-',   // chiave pubblicabile: può stare nel repo, non dà accesso ai dati altrui
    table: 'lessons',
    lib: 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.112.4/dist/umd/supabase.js'
  };

  function replacer(k, v) { return typeof k === 'string' && k.charAt(0) === '_' ? undefined : v; }
  /** Stessa serializzazione del salvataggio locale: i campi che iniziano con "_" sono cache di sessione. */
  function serialize(lesson) { return JSON.stringify(lesson, replacer); }
  /** FNV-1a a 32 bit + lunghezza: basta per capire se una lezione è cambiata dall'ultima sincronizzazione. */
  function hash(str) {
    let h = 0x811c9dc5;
    for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 0x01000193) >>> 0; }
    return ('0000000' + h.toString(16)).slice(-8) + ':' + str.length;
  }
  function time(x) { const t = Date.parse(x || ''); return isNaN(t) ? 0 : t; }
  function isDirty(lesson, entry) { return !entry || entry.hash !== hash(serialize(lesson)); }

  /**
   * Decide cosa fare confrontando le lezioni locali con i metadati remoti. Funzione pura.
   * local: {id: lezione}; remote: [{id, updated_at, deleted}]; state: {synced: {id: {hash, at}}, deleted: {id: iso}}.
   * Restituisce liste di id: pull (scaricare), push (caricare), dropLocal (eliminare in locale perché eliminate altrove),
   * removeRemote (mandare l'eliminazione), forgetTombstone (eliminazioni locali non più necessarie), bump (lezioni cambiate
   * senza aggiornare updatedAt: prima di caricarle si aggiorna la data, altrimenti l'altro computer non le scaricherebbe).
   */
  function plan(local, remote, state) {
    state = state || {};
    const synced = state.synced || {}, deleted = state.deleted || {};
    const out = { pull: [], push: [], dropLocal: [], removeRemote: [], forgetTombstone: [], bump: [], remoteAt: {} };
    const seen = {};
    (remote || []).forEach(function (r) {
      seen[r.id] = true;
      const lo = local[r.id], rt = time(r.updated_at);
      out.remoteAt[r.id] = rt;
      if (r.deleted) {
        if (!lo) { if (deleted[r.id]) out.forgetTombstone.push(r.id); return; }
        // eliminata altrove: sopravvive solo se qui è stata modificata DOPO l'eliminazione
        if (isDirty(lo, synced[r.id]) && time(lo.updatedAt) > rt) out.push.push(r.id);
        else out.dropLocal.push(r.id);
        return;
      }
      if (!lo) {
        if (deleted[r.id]) {
          if (time(deleted[r.id]) > rt) out.removeRemote.push(r.id);
          else { out.pull.push(r.id); out.forgetTombstone.push(r.id); }   // modificata altrove dopo l'eliminazione qui: torna
        } else out.pull.push(r.id);
        return;
      }
      const lt = time(lo.updatedAt);
      if (rt > lt + 1) out.pull.push(r.id);
      else if (lt > rt + 1) out.push.push(r.id);
      else if (isDirty(lo, synced[r.id])) { out.push.push(r.id); out.bump.push(r.id); }
    });
    Object.keys(local).forEach(function (id) { if (!seen[id]) out.push.push(id); });
    Object.keys(deleted).forEach(function (id) { if (!seen[id]) out.forgetTombstone.push(id); });
    return out;
  }

  /**
   * Motore di sincronizzazione.
   * opts: adapter (user/list/get/upsert/remove), getLocal() → {id: lezione}, apply({replace: [lezioni], remove: [id]}) → {skipped: [id]}?,
   *       save() (persiste il locale dopo un "bump"), loadState() → stato, saveState(stato), onStatus(status), delay (ms, default 1500).
   */
  function createSync(opts) {
    const adapter = opts.adapter;
    const state = Object.assign({ synced: {}, deleted: {}, owner: null, lastSync: null }, opts.loadState && opts.loadState() || {});
    state.synced = state.synced || {}; state.deleted = state.deleted || {};
    const status = { state: 'idle', message: '', lastSync: state.lastSync || null, pending: 0, user: null };
    let busy = null, again = false, timer = null, applying = false, failures = 0;

    function persist() { if (opts.saveState) opts.saveState(state); }
    function countPending() {
      const local = opts.getLocal(); let n = 0;
      Object.keys(local).forEach(function (id) { if (isDirty(local[id], state.synced[id])) n++; });
      return n + Object.keys(state.deleted).length;
    }
    function emit(s, msg) {
      status.state = s; status.message = msg || ''; status.lastSync = state.lastSync || null;
      if (s !== 'syncing') status.pending = countPending();
      if (opts.onStatus) opts.onStatus(status);
    }
    /** Da chiamare dopo ogni salvataggio locale: registra le eliminazioni e programma il caricamento. */
    function noteLocalChange() {
      if (applying) return;
      const local = opts.getLocal(); let changed = false;
      Object.keys(state.synced).forEach(function (id) {
        if (local[id]) return;
        // l'eliminazione è più recente dell'ultima versione sincronizzata anche se l'orologio locale è indietro
        state.deleted[id] = new Date(Math.max(Date.now(), time(state.synced[id].at) + 1000)).toISOString();
        delete state.synced[id]; changed = true;
      });
      if (changed) persist();
      schedule();
    }
    function schedule(ms) { clearTimeout(timer); timer = setTimeout(function () { sync().catch(function () { /* già segnalato */ }); }, ms == null ? (opts.delay == null ? 1500 : opts.delay) : ms); }

    function sync() {
      if (busy) { again = true; return busy; }
      clearTimeout(timer);
      busy = (async function () {
        const result = { pulled: 0, pushed: 0, removed: 0, dropped: 0 };
        try {
          const user = await adapter.user();
          status.user = user;
          if (!user) { emit('offline'); return result; }
          if (state.owner && state.owner !== user.id) { state.synced = {}; state.deleted = {}; }   // altro account: si riparte da zero
          state.owner = user.id;
          emit('syncing');
          const local = opts.getLocal();
          const remote = await adapter.list();
          const p = plan(local, remote, state);
          // 1) scarica
          let skipped = [];
          if (p.pull.length || p.dropLocal.length) {
            const rows = p.pull.length ? await adapter.get(p.pull) : [];
            const replace = [];
            rows.forEach(function (r) { if (!r.data || r.deleted) return; const ls = r.data; ls.id = r.id; replace.push(ls); });
            applying = true;
            try { skipped = (opts.apply({ replace: replace, remove: p.dropLocal }) || {}).skipped || []; } finally { applying = false; }
            const now = opts.getLocal();
            replace.forEach(function (ls) { if (skipped.indexOf(ls.id) >= 0 || !now[ls.id]) return; state.synced[ls.id] = { hash: hash(serialize(now[ls.id])), at: ls.updatedAt || null }; result.pulled++; });
            p.dropLocal.forEach(function (id) { if (skipped.indexOf(id) >= 0) return; delete state.synced[id]; result.dropped++; });
          }
          // 2) carica
          const local2 = opts.getLocal();
          if (p.bump.length) {
            // data più recente sia dell'orologio locale sia della copia remota (orologi sfasati tra computer)
            applying = true;
            try { p.bump.forEach(function (id) { if (local2[id]) local2[id].updatedAt = new Date(Math.max(Date.now(), (p.remoteAt[id] || 0) + 1000)).toISOString(); }); if (opts.save) opts.save(); } finally { applying = false; }
          }
          const rows = [];
          p.push.forEach(function (id) {
            const ls = local2[id]; if (!ls) return;
            const str = serialize(ls);
            rows.push({ owner: user.id, id: id, title: ls.title || '', data: JSON.parse(str), deleted: false, updated_at: ls.updatedAt || new Date().toISOString(), _hash: hash(str) });
          });
          if (rows.length) {
            await adapter.upsert(rows.map(function (r) { const c = Object.assign({}, r); delete c._hash; return c; }));
            rows.forEach(function (r) { state.synced[r.id] = { hash: r._hash, at: r.updated_at }; });
            result.pushed = rows.length;
          }
          if (p.removeRemote.length) {
            await adapter.remove(p.removeRemote.map(function (id) { return { owner: user.id, id: id, deleted: true, data: null, updated_at: state.deleted[id] }; }));
            p.removeRemote.forEach(function (id) { delete state.deleted[id]; });
            result.removed = p.removeRemote.length;
          }
          p.forgetTombstone.forEach(function (id) { delete state.deleted[id]; });
          state.lastSync = new Date().toISOString();
          failures = 0;
          persist();
          emit('ok');
          return result;
        } catch (e) {
          failures++;
          emit('error', e && e.message ? e.message : String(e));
          if (countPending()) schedule(Math.min(600000, 30000 * Math.pow(2, failures - 1)));   // riprova con attesa crescente
          throw e;
        } finally {
          busy = null;
          if (again) { again = false; schedule(300); }
        }
      })();
      return busy;
    }
    return { sync: sync, noteLocalChange: noteLocalChange, schedule: schedule, status: status, state: state, pending: countPending };
  }

  /** Adattatore per supabase-js (client già creato). Tabella `lessons` con chiave (owner, id) e RLS owner = auth.uid(). */
  function supabaseAdapter(client, table) {
    table = table || CONFIG.table;
    function chk(res) { if (res.error) throw new Error(res.error.message || String(res.error)); return res.data; }
    return {
      user: async function () { const res = await client.auth.getSession(); return res.data && res.data.session ? res.data.session.user : null; },
      list: async function () { return chk(await client.from(table).select('id,title,updated_at,deleted')) || []; },
      get: async function (ids) {
        const out = [];
        for (let i = 0; i < ids.length; i += 40) out.push.apply(out, chk(await client.from(table).select('id,title,data,updated_at,deleted').in('id', ids.slice(i, i + 40))) || []);
        return out;
      },
      upsert: async function (rows) { for (let i = 0; i < rows.length; i += 10) chk(await client.from(table).upsert(rows.slice(i, i + 10), { onConflict: 'owner,id' })); },
      remove: async function (rows) { chk(await client.from(table).upsert(rows, { onConflict: 'owner,id' })); }
    };
  }

  /** Server finto in memoria (test e modalità mock): più "computer" condividono le stesse righe. Riordina le chiavi come farebbe jsonb. */
  function memoryServer(initialRows) {
    const rows = {};
    (initialRows || []).forEach(function (r) { rows[r.owner + ':' + r.id] = r; });
    function sortKeys(v) {
      if (Array.isArray(v)) return v.map(sortKeys);
      if (v && typeof v === 'object') { const o = {}; Object.keys(v).sort(function (a, b) { return a.length - b.length || (a < b ? -1 : a > b ? 1 : 0); }).forEach(function (k) { o[k] = sortKeys(v[k]); }); return o; }
      return v;
    }
    const server = {
      rows: rows,
      calls: [],
      failNext: null,
      adapterFor: function (userId) {
        function maybeFail(op) { server.calls.push(op); if (server.failNext) { const e = new Error(server.failNext); server.failNext = null; throw e; } }
        return {
          user: async function () { return userId ? { id: userId, email: userId + '@esempio.it' } : null; },
          list: async function () { maybeFail('list'); return Object.values(rows).filter(function (r) { return r.owner === userId; }).map(function (r) { return { id: r.id, title: r.title, updated_at: r.updated_at, deleted: r.deleted }; }); },
          get: async function (ids) { maybeFail('get'); return ids.map(function (id) { return rows[userId + ':' + id]; }).filter(Boolean).map(function (r) { return { id: r.id, title: r.title, data: r.data ? sortKeys(JSON.parse(JSON.stringify(r.data))) : null, updated_at: r.updated_at, deleted: r.deleted }; }); },
          upsert: async function (rs) { maybeFail('upsert'); rs.forEach(function (r) { if (r.owner !== userId) throw new Error('RLS: owner diverso'); rows[r.owner + ':' + r.id] = Object.assign({}, rows[r.owner + ':' + r.id], r, { data: r.data ? JSON.parse(JSON.stringify(r.data)) : null }); }); },
          remove: async function (rs) { maybeFail('remove'); rs.forEach(function (r) { if (r.owner !== userId) throw new Error('RLS: owner diverso'); rows[r.owner + ':' + r.id] = Object.assign({}, rows[r.owner + ':' + r.id], r); }); }
        };
      }
    };
    return server;
  }

  return { CONFIG: CONFIG, plan: plan, createSync: createSync, supabaseAdapter: supabaseAdapter, memoryServer: memoryServer, serialize: serialize, hash: hash };
});
