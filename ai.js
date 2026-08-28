/* ai.js — bozza assistita da un modello Claude: prompt, chiamata dal browser, validazione e completamento con il motore a regole */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory(require('./lang.js'), require('./exercises.js'), require('./generator.js'));
  else root.VLAI = factory(root.VLLang, root.VLEx, root.VLGen);
})(typeof self !== 'undefined' ? self : this, function (L, EX, G) {
  'use strict';

  const DEFAULT_MODEL = 'claude-sonnet-5';
  const PRICES = { 'claude-sonnet-5': [2, 10], 'claude-haiku-4-5-20251001': [1, 5], 'claude-opus-5': [5, 25] };
  const TYPE_NAMES = { gap: 'gap', scramble: 'scramble', missing: 'missing', extra: 'extra', wrong: 'wrong' };

  function fmtChunks(chunks) {
    return chunks.filter(function (c) { return !c.silence; }).map(function (c) {
      return c.id + '|' + c.start.toFixed(1) + '|' + c.end.toFixed(1) + '|' + c.text;
    }).join('\n');
  }

  function buildMessages(p) {
    const n = p.n, types = p.types && p.types.length ? p.types : G.ALL_TYPES;
    const system = 'You help a language teacher turn a YouTube video transcript into an interactive listening lesson. ' +
      'You receive the transcript split into chunks (id|start seconds|end seconds|text). Output ONLY a JSON object that follows the schema; no prose, no markdown fences.';
    const lines = [];
    lines.push('TRANSCRIPT LANGUAGE: ' + (p.lang || 'it') + '   STUDENT LEVEL (CEFR): ' + (p.level || 'B1'));
    lines.push('NUMBER OF EXERCISES: ' + n + '   ALLOWED TYPES: ' + types.join(', '));
    if (p.range && p.range.length === 2) lines.push('SENTENCE LENGTH: between ' + p.range[0] + ' and ' + p.range[1] + ' words for every exercise (a passage may span several consecutive chunks; this overrides the per-type ranges below).');
    lines.push('VIDEO DURATION: ' + Math.round(p.duration) + 's   TARGET KEPT DURATION: ' + Math.round(p.target) + 's' +
      (p.target < p.duration - 5 ? ' (skip about ' + Math.round(p.duration - p.target) + 's)' : ' (no cuts needed)'));
    if (p.focus) lines.push('TEACHER NOTES / FOCUS: ' + p.focus);
    lines.push('');
    lines.push('TASKS');
    lines.push('1. Choose exactly ' + n + ' sentences for listening exercises, spread across the video (about one per equal time slice). ' +
      'Prefer complete, self-contained sentences with vocabulary useful for the level. Avoid intros, greetings, sponsor segments, calls to action and the last 30 seconds. ' +
      'A sentence must be a CONTIGUOUS part of one chunk, or the end of one chunk plus the start of the next chunk. Give it in "sentence" with exactly the same words in the same order: ' +
      'you may add punctuation and capital letters, but never change, add, remove or reorder words. Reference the chunk id where the sentence starts in "chunk".');
    lines.push('2. Assign each sentence one type, rotating through the allowed types so each is used, with these constraints: ' +
      'gap = 7-20 words, list 1-3 content words to blank in "gaps" (exact words from the sentence); ' +
      'scramble = 5-10 words; ' +
      'missing = 6-14 words, give the word to remove in "missing"; ' +
      'extra = 6-14 words, give a function word to insert and the word it comes after in "extra": {"word","after"}; ' +
      'wrong = 6-14 words, give a word to replace and a plausible wrong replacement of the same grammatical category in "wrong": {"word","replacement"} (the replacement must not appear elsewhere in the sentence).');
    lines.push('3. Propose cuts (parts of the video to skip) as inclusive ranges of chunk ids "from"/"to", so that the kept duration is close to the target. ' +
      'Skip intros, sponsor/ads, calls to action, digressions, repetitions and long silences first. Never cut a chunk that contains an exercise sentence, nor the 20 seconds before it. ' +
      'Prefer few long cuts (at least 8 seconds each) over many short ones. If the target is not reachable without harming coherence, do your best and say so in "notes".');
    lines.push('4. Give a short lesson "title" in the transcript language.');
    lines.push('');
    lines.push('OUTPUT SCHEMA (JSON only):');
    lines.push('{"title":"...","exercises":[{"chunk":"c12","type":"gap","sentence":"...","gaps":["word1","word2"],"missing":"word","extra":{"word":"di","after":"word"},"wrong":{"word":"il","replacement":"la"},"why":"short reason"}],"cuts":[{"from":"c1","to":"c3","reason":"intro"}],"notes":"..."}');
    lines.push('Include only the fields relevant to each exercise type.');
    lines.push('');
    lines.push('TRANSCRIPT CHUNKS (id|start|end|text):');
    lines.push(fmtChunks(p.chunks));
    return { system: system, user: lines.join('\n') };
  }

  async function callAnthropic(o) {
    const f = o.fetchImpl || (typeof fetch === 'function' ? fetch : null);
    if (!f) throw new Error('fetch non disponibile');
    const res = await f('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-api-key': o.apiKey,
        'anthropic-version': '2023-06-01',
        'anthropic-dangerous-direct-browser-access': 'true'
      },
      body: JSON.stringify({
        model: o.model || DEFAULT_MODEL,
        max_tokens: o.maxTokens || 6000,
        system: o.system,
        messages: [{ role: 'user', content: o.user }]
      })
    });
    if (!res.ok) {
      let t = '';
      try { t = await res.text(); } catch (e) { /* ignore */ }
      throw new Error('API Anthropic: HTTP ' + res.status + ' ' + t.slice(0, 300));
    }
    const j = await res.json();
    const text = (j.content || []).filter(function (b) { return b.type === 'text'; }).map(function (b) { return b.text; }).join('');
    return { text: text, usage: j.usage || null, model: j.model || o.model };
  }

  function estimateCost(usage, model) {
    if (!usage) return null;
    const pr = PRICES[model] || PRICES[DEFAULT_MODEL];
    return ((usage.input_tokens || 0) * pr[0] + (usage.output_tokens || 0) * pr[1]) / 1e6;
  }

  function extractJSON(text) {
    let t = String(text || '').trim();
    t = t.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '');
    const a = t.indexOf('{'), b = t.lastIndexOf('}');
    if (a === -1 || b === -1 || b < a) throw new Error('Nessun JSON nella risposta del modello');
    t = t.slice(a, b + 1);
    try { return JSON.parse(t); }
    catch (e) {
      // tentativo: rimuove virgole finali
      return JSON.parse(t.replace(/,\s*([}\]])/g, '$1'));
    }
  }

  /** Cerca la sequenza di parole della frase dentro un chunk (+ il successivo). Ritorna { chunkIds, tokens, times } o null. */
  function locate(sentence, chunk, next, more) {
    const want = L.words(sentence);
    if (!want.length) return null;
    const pools = [[chunk]];
    if (next && !next.silence) pools.push([chunk, next]);
    if (more && more.length) {
      let pool = [chunk, next];
      for (const m of more) { if (!m || m.silence) break; pool = pool.concat([m]); pools.push(pool.slice()); }
    }
    for (const pool of pools) {
      const toks = [], times = [];
      pool.forEach(function (c) {
        const wt = G.wordTimes(c);
        c.tokens.forEach(function (t, i) { toks.push(t); times.push(wt[i] || { start: c.start, end: c.end }); });
      });
      const norms = toks.map(function (t) { return t.norm; });
      for (let i = 0; i + want.length <= norms.length; i++) {
        let ok = true;
        for (let k = 0; k < want.length; k++) if (norms[i + k] !== want[k]) { ok = false; break; }
        if (ok) {
          return {
            chunkIds: pool.map(function (c) { return c.id; }),
            tokens: toks.slice(i, i + want.length),
            start: times[i].start,
            end: times[i + want.length - 1].end
          };
        }
      }
    }
    return null;
  }

  function overlaps(a, b) { return a.start < b.end && b.start < a.end; }

  /** Applica il piano del modello: costruisce esercizi e tagli validi, completa con le regole dove serve. */
  function applyPlan(plan, ctx) {
    const chunks = ctx.chunks, lang = ctx.lang || 'it', D = ctx.duration, target = ctx.target || D;
    const n = ctx.n, types = ctx.types && ctx.types.length ? ctx.types : G.ALL_TYPES;
    const byId = {};
    chunks.forEach(function (c, i) { byId[c.id] = c; c._idx = i; });
    const warnings = [];
    const exercises = [];
    const used = new Set();

    (Array.isArray(plan.exercises) ? plan.exercises : []).forEach(function (pe, i) {
      if (exercises.length >= n) return;
      const c = byId[pe.chunk];
      if (!c || c.silence) { warnings.push('Esercizio AI ' + (i + 1) + ': chunk "' + pe.chunk + '" inesistente, saltato.'); return; }
      const next = chunks[c._idx + 1];
      let type = TYPE_NAMES[String(pe.type || '').toLowerCase()] || types[exercises.length % types.length];
      if (types.indexOf(type) === -1) type = types[exercises.length % types.length];
      let loc = pe.sentence ? locate(pe.sentence, c, next, [chunks[c._idx + 2], chunks[c._idx + 3]]) : null;
      let sentenceText;
      if (loc) {
        // usa la versione punteggiata del modello solo se le parole coincidono (già verificato da locate)
        sentenceText = String(pe.sentence).trim();
      } else {
        if (pe.sentence) warnings.push('Esercizio AI ' + (i + 1) + ': frase non trovata nel chunk ' + c.id + ', uso il chunk intero.');
        loc = { chunkIds: [c.id], tokens: c.tokens, start: c.start, end: c.end };
        sentenceText = c.text;
      }
      const choices = {
        gapWords: Array.isArray(pe.gaps) ? pe.gaps : null,
        missingWord: pe.missing || null,
        extraWord: pe.extra && pe.extra.word ? pe.extra.word : null,
        extraAfter: pe.extra && pe.extra.after != null ? pe.extra.after : null,
        wrongWord: pe.wrong && pe.wrong.word ? pe.wrong.word : null,
        wrongReplacement: pe.wrong && pe.wrong.replacement ? pe.wrong.replacement : null
      };
      const seed = 1000 + i;
      let ex = EX.buildExercise(type, sentenceText, { lang: lang, seed: seed, choices: choices });
      if (!ex) {
        for (const alt of types) { if (alt === type) continue; ex = EX.buildExercise(alt, sentenceText, { lang: lang, seed: seed }); if (ex) break; }
        if (ex) warnings.push('Esercizio AI ' + (i + 1) + ': tipo "' + type + '" non applicabile, usato "' + ex.type + '".');
      }
      if (!ex) { warnings.push('Esercizio AI ' + (i + 1) + ': frase troppo corta, saltato.'); return; }
      const seg = { start: Math.max(0, loc.start - 0.5), end: Math.min(D, loc.end + 0.6) };
      exercises.push({
        id: 'e' + c.id + '-' + Math.floor(Math.random() * 1e6).toString(36),
        chunkId: c.id, type: ex.type, sentence: sentenceText, segment: seg, markerTime: seg.end + 0.05,
        data: ex.data, source: 'ai', note: pe.why || ''
      });
      loc.chunkIds.forEach(function (id) { used.add(id); });
    });

    // Tagli proposti dal modello: intervalli grezzi
    const rawCuts = [];
    (Array.isArray(plan.cuts) ? plan.cuts : []).forEach(function (pc, i) {
      const a = byId[pc.from], b = byId[pc.to || pc.from];
      if (!a || !b) { warnings.push('Taglio AI ' + (i + 1) + ': chunk inesistente, saltato.'); return; }
      let start = Math.min(a.start, b.start), end = Math.max(a.end, b.end);
      // se il taglio finisce sull'ultimo chunk parlato, estendilo fino alla fine del video
      if (b._idx >= chunks.length - 2 && D - end < 8) end = D;
      if (a._idx === 0 || (a._idx === 1 && chunks[0].silence)) start = 0;
      rawCuts.push({ start: start, end: end, reason: pc.reason || 'proposto dal modello' });
    });

    // Completa fino a n con il motore a regole, nelle zone scoperte, evitando i tagli del modello e i 20s successivi
    if (exercises.length < n) {
      const avoid = new Set(used);
      chunks.forEach(function (c) {
        if (rawCuts.some(function (r) { return c.start < r.end + 20 && c.end > r.start; })) avoid.add(c.id);
      });
      const picks = G.selectChunks(chunks, { n: n, types: types, lang: lang, duration: D, exclude: avoid });
      const minDist = D / (2 * n);
      for (const p of picks) {
        if (exercises.length >= n) break;
        const mid = (p.chunk.start + p.chunk.end) / 2;
        if (exercises.some(function (e) { return Math.abs(e.markerTime - mid) < minDist; })) continue;
        const ex = G.makeExercise(p.chunk, p.type, { lang: lang, seed: 77, source: 'rules' });
        if (ex) { exercises.push(ex); used.add(p.chunk.id); }
      }
      warnings.push('Il modello ha proposto meno esercizi del richiesto: completati con le regole.');
    }
    exercises.sort(function (a, b) { return a.markerTime - b.markerTime; });

    // Tagli validati e ritagliati attorno agli esercizi (il modello ha già scelto i tagli conoscendo le frasi: buffer minimo)
    const protect = exercises.map(function (e) { return { start: e.segment.start - (e.source === 'ai' ? 5 : 20), end: e.segment.end + 1 }; });
    let cuts = [];
    rawCuts.forEach(function (pc) {
      let pieces = [{ start: pc.start, end: pc.end }];
      protect.forEach(function (p) {
        const out = [];
        pieces.forEach(function (pc2) {
          if (!overlaps(pc2, p)) { out.push(pc2); return; }
          if (pc2.start < p.start) out.push({ start: pc2.start, end: p.start });
          if (pc2.end > p.end) out.push({ start: p.end, end: pc2.end });
        });
        pieces = out;
      });
      pieces.forEach(function (pc2) {
        if (pc2.end - pc2.start >= 5) cuts.push({ start: pc2.start, end: pc2.end, reason: pc.reason, source: 'ai' });
      });
    });
    cuts.sort(function (a, b) { return a.start - b.start; });
    const merged = [];
    cuts.forEach(function (c) {
      const p = merged[merged.length - 1];
      if (p && c.start - p.end < 1.5) p.end = Math.max(p.end, c.end); else merged.push(c);
    });
    cuts = merged;

    let effective = G.effectiveDuration(cuts, D);
    if (effective > target + 20) {
      const r = G.fitCuts(chunks, exercises, { duration: D, target: target, contextBefore: 20, existing: cuts, lang: lang });
      cuts = r.cuts;
      effective = G.effectiveDuration(cuts, D);
      warnings.push('I tagli del modello non bastavano: aggiunti tagli con le regole (' + Math.round(effective) + 's ottenuti).');
    } else if (effective < target - 40) {
      warnings.push('Il modello ha tagliato più del necessario (' + Math.round(effective) + 's invece di ' + Math.round(target) + 's): controlla i tagli.');
    }

    return {
      exercises: exercises, cuts: cuts, title: plan.title || '', notes: plan.notes || '', warnings: warnings,
      stats: { duration: D, target: target, effective: effective, removed: D - effective, n: exercises.length }
    };
  }

  /** Flusso completo: prompt → modello → piano applicato. params: { chunks, lines, duration, target, n, types, lang, level, focus, apiKey, model, fetchImpl } */
  async function generateWithAI(params) {
    const lang = params.lang || 'it';
    const duration = params.duration;
    const chunks = params.chunks || G.annotate(G.buildChunks(params.lines, { duration: duration, lang: lang }), { lang: lang, duration: duration });
    const target = params.target && params.target > 0 ? Math.min(params.target, duration) : duration;
    const msgs = buildMessages({ chunks: chunks, n: params.n, types: params.types, lang: lang, level: params.level, focus: params.focus, duration: duration, target: target, range: params.range });
    const res = await callAnthropic({ apiKey: params.apiKey, model: params.model, system: msgs.system, user: msgs.user, maxTokens: params.maxTokens, fetchImpl: params.fetchImpl });
    const plan = extractJSON(res.text);
    const applied = applyPlan(plan, { chunks: chunks, lang: lang, duration: duration, target: target, n: params.n, types: params.types });
    applied.chunks = chunks;
    applied.ai = { model: res.model, usage: res.usage, cost: estimateCost(res.usage, res.model || params.model || DEFAULT_MODEL), raw: res.text };
    return applied;
  }

  async function testKey(apiKey, model, fetchImpl) {
    const r = await callAnthropic({ apiKey: apiKey, model: model, system: 'Reply with the single word OK.', user: 'ping', maxTokens: 5, fetchImpl: fetchImpl });
    return r;
  }

  return { DEFAULT_MODEL: DEFAULT_MODEL, PRICES: PRICES, buildMessages: buildMessages, callAnthropic: callAnthropic, extractJSON: extractJSON, locate: locate, applyPlan: applyPlan, generateWithAI: generateWithAI, estimateCost: estimateCost, testKey: testKey };
});
