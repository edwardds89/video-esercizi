/* ai.js — bozza assistita da un modello Claude: prompt, chiamata dal browser, validazione e completamento con il motore a regole */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory(require('./lang.js'), require('./exercises.js'), require('./generator.js'));
  else root.VLAI = factory(root.VLLang, root.VLEx, root.VLGen);
})(typeof self !== 'undefined' ? self : this, function (L, EX, G) {
  'use strict';

  const DEFAULT_MODEL = 'claude-sonnet-5';
  const PRICES = { 'claude-sonnet-5': [2, 10], 'claude-haiku-4-5-20251001': [1, 5], 'claude-opus-5': [5, 25] };
  const TYPE_NAMES = { gap: 'gap', gapbank: 'gapbank', scramble: 'scramble', missing: 'missing', extra: 'extra', wrong: 'wrong', mc: 'mc' };

  function fmtChunks(chunks) {
    return chunks.filter(function (c) { return !c.silence; }).map(function (c) {
      return c.id + '|' + c.start.toFixed(1) + '|' + c.end.toFixed(1) + '|' + c.text;
    }).join('\n');
  }

  function buildMessages(p) {
    const n = p.n, types = p.types && p.types.length ? p.types : G.DEFAULT_TYPES;
    const system = 'You help a language teacher turn a YouTube video transcript into an interactive listening lesson. ' +
      'You receive the transcript split into chunks (id|start seconds|end seconds|text). Output ONLY a JSON object that follows the schema; no prose, no markdown fences.';
    const lines = [];
    lines.push('TRANSCRIPT LANGUAGE: ' + (p.lang || 'it') + '   STUDENT LEVEL (CEFR): ' + (p.level || 'B1'));
    lines.push('NUMBER OF EXERCISES: ' + n + (p.auto ? ' (about one every 30-50 seconds of kept video; if a slot has no complete sentence of the required length, leave it without an exercise — fewer is fine)' : '') + '   ALLOWED TYPES: ' + types.join(', '));
    if (p.range === 'smart') lines.push('SENTENCE LENGTH: gap/missing/extra/wrong 25-32 words, gapbank 22-30, scramble 16-22, mc 25-40 (a passage may span several consecutive chunks).');
    else if (p.range && p.range.length === 2) lines.push('SENTENCE LENGTH: between ' + p.range[0] + ' and ' + p.range[1] + ' words for every exercise (a passage may span several consecutive chunks; this overrides the per-type ranges below).');
    lines.push('VIDEO DURATION: ' + Math.round(p.duration) + 's   TARGET KEPT DURATION: ' + Math.round(p.target) + 's' +
      (p.target < p.duration - 5 ? ' (skip about ' + Math.round(p.duration - p.target) + 's)' : ' (no cuts needed)'));
    if (p.focus) lines.push('TEACHER NOTES / FOCUS: ' + p.focus);
    if (p.tricky) lines.push('TRICKY: yes — every mc exercise must include one deliberately misleading wrong option.');
    lines.push('');
    lines.push('TASKS');
    lines.push('1. Choose exactly ' + n + ' sentences for listening exercises, spread across the video (about one per equal time slice). ' +
      'Every sentence must be COMPLETE and self-contained: it starts where a sentence starts (capital letter) and ends with its final punctuation; it may contain two short sentences. Prefer vocabulary useful for the level. Avoid intros, greetings, sponsor segments, calls to action and the last 30 seconds. ' +
      'A sentence must be a CONTIGUOUS part of one chunk, or the end of one chunk plus the start of the next chunk. Give it in "sentence" with exactly the same words in the same order: ' +
      'you may add punctuation and capital letters, but never change, add, remove or reorder words. Reference the chunk id where the sentence starts in "chunk".');
    lines.push('2. Assign each sentence one type, rotating through the allowed types so each is used, with these constraints: ' +
      'gap = 18-40 words (about 25-30 is ideal), list 3-5 content words to blank in "gaps" (exact words from the sentence, not adjacent, not the first word); ' +
      'gapbank = 12-30 words, same as gap but the student gets a word bank: list 3-4 "gaps" and 2 plausible wrong words from the video in "distractors"; ' +
      'scramble = 16-22 words; ' +
      'missing = 25-32 words, give the word to remove in "missing"; ' +
      'extra = 25-32 words, give a function word to insert and the word it comes after in "extra": {"word","after"}; ' +
      'wrong = 25-32 words, give a word to replace and a plausible wrong replacement of the same grammatical category in "wrong": {"word","replacement"} (the replacement must not appear elsewhere in the sentence); ' +
      'mc = 25-40 words: a comprehension question about the sentence in the transcript language in "question", four short "options", the index of the right one in "correct" (0-3) and, if TRICKY is requested, the index of a deliberately misleading but wrong option in "tricky".');
    lines.push('3. Propose cuts (parts of the video to skip) as inclusive ranges of chunk ids "from"/"to", so that the kept duration is close to the target. ' +
      'Skip intros, sponsor/ads, calls to action, digressions, repetitions and long silences first. Never cut a chunk that contains an exercise sentence, nor the 20 seconds before it. ' +
      'Prefer few long cuts (at least 8 seconds each) over many short ones. If the target is not reachable without harming coherence, do your best and say so in "notes".');
    lines.push('4. Give a short lesson "title" in the transcript language.');
    const sup = p.support || (p.lang === 'en' ? 'it' : 'en');
    lines.push('5. USEFUL WORDS: list ' + (p.nVocab || 14) + ' words (or short fixed expressions) a ' + (p.level || 'B1') + ' student must know to understand the video, in "vocab". ' +
      'Prioritize words that occur in the exercise sentences you chose (mark them with "inExercise": true), then other key words of the video. Use the dictionary form as it appears in the video (singular noun, infinitive verb, masculine adjective) ' +
      'and give the translation in language "' + sup + '" ("translation"). For concrete words add one emoji that pictures the meaning ("emoji"); leave it empty for abstract words. No numbers, no proper names, no function words.');
    lines.push('');
    lines.push('OUTPUT SCHEMA (JSON only):');
    lines.push('{"title":"...","exercises":[{"chunk":"c12","type":"gap","sentence":"...","gaps":["word1","word2","word3"],"distractors":["w1","w2"],"missing":"word","extra":{"word":"di","after":"word"},"wrong":{"word":"il","replacement":"la"},"why":"short reason"}],"cuts":[{"from":"c1","to":"c3","reason":"intro"}],"vocab":[{"word":"smalto","translation":"enamel","emoji":"🦷","inExercise":true}],"notes":"..."}');
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
    const n = ctx.n, types = ctx.types && ctx.types.length ? ctx.types : G.DEFAULT_TYPES;
    const vocab = G.vocabulary(chunks, lang);
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
      sentenceText = G.capFirst(sentenceText);
      const choices = {
        gapWords: Array.isArray(pe.gaps) ? pe.gaps : null,
        distractors: Array.isArray(pe.distractors) ? pe.distractors : null,
        missingWord: pe.missing || null,
        extraWord: pe.extra && pe.extra.word ? pe.extra.word : null,
        extraAfter: pe.extra && pe.extra.after != null ? pe.extra.after : null,
        wrongWord: pe.wrong && pe.wrong.word ? pe.wrong.word : null,
        wrongReplacement: pe.wrong && pe.wrong.replacement ? pe.wrong.replacement : null,
        question: pe.question || null, options: Array.isArray(pe.options) ? pe.options : null, correct: pe.correct, tricky: pe.tricky
      };
      const seed = 1000 + i;
      let ex = EX.buildExercise(type, sentenceText, { lang: lang, seed: seed, choices: choices, vocab: vocab });
      if (!ex) {
        for (const alt of types) { if (alt === type) continue; ex = EX.buildExercise(alt, sentenceText, { lang: lang, seed: seed, vocab: vocab }); if (ex) break; }
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
    // (in modalità automatica il modello può lasciare vuoti gli slot senza una frase adatta: si completa solo se ne ha dati meno della metà)
    const minWanted = ctx.auto ? Math.ceil(n / 2) : n;
    if (exercises.length < minWanted) {
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
        const ex = G.makeExercise(p.chunk, p.type, { lang: lang, seed: 77, source: 'rules', vocab: vocab });
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
      vocab: cleanVocab(plan.vocab),
      stats: { duration: D, target: target, effective: effective, removed: D - effective, n: exercises.length }
    };
  }

  /** Normalizza la lista di parole utili restituita dal modello: [{word, translation, emoji, inExercise}], senza doppioni. */
  function cleanVocab(list) {
    const out = [], seen = {};
    (Array.isArray(list) ? list : []).forEach(function (v) {
      if (!v || typeof v !== 'object') return;
      const word = String(v.word || '').trim().replace(/\s+/g, ' ');
      if (!word || word.length > 40) return;
      const k = L.normalize(word);
      if (!k || seen[k]) return;
      seen[k] = 1;
      out.push({ word: word, translation: String(v.translation || '').trim(), emoji: String(v.emoji || '').trim().slice(0, 4), inExercise: !!v.inExercise });
    });
    return out;
  }

  /** Parole utili su richiesta (editor): dalle frasi degli esercizi e dal video. params: { chunks, exercises, lang, support, level, n, apiKey, model, fetchImpl } */
  async function suggestVocab(params) {
    const lang = params.lang || 'it', sup = params.support || (lang === 'en' ? 'it' : 'en');
    const sentences = (params.exercises || []).map(function (e, i) { return (i + 1) + '. ' + e.sentence; }).join('\n');
    const text = (params.chunks || []).map(function (c) { return c.text; }).join(' ').slice(0, 12000);
    const system = 'You help a language teacher prepare vocabulary for a video lesson. Output ONLY a JSON object, no prose, no markdown fences.';
    const user = ['LANGUAGE OF THE VIDEO: ' + lang + '   STUDENT LEVEL: ' + (params.level || 'B1') + '   TRANSLATION LANGUAGE: ' + sup,
      'List ' + (params.n || 14) + ' words (or short fixed expressions) the student must know to understand the video. Prioritize words that occur in the EXERCISE SENTENCES (mark "inExercise": true), then other key words of the video. ' +
      'Dictionary form as used in the video (singular noun, infinitive verb, masculine adjective); "translation" in ' + sup + '; "emoji": one emoji picturing the meaning for concrete words, empty for abstract ones. No numbers, proper names or function words.' +
      (params.exclude && params.exclude.length ? ' Do NOT include: ' + params.exclude.join(', ') + '.' : ''),
      'SCHEMA: {"vocab":[{"word":"...","translation":"...","emoji":"","inExercise":true}]}', '',
      'EXERCISE SENTENCES:', sentences || '(none)', '', 'VIDEO TEXT:', text].join('\n');
    const res = await callAnthropic({ apiKey: params.apiKey, model: params.model, system: system, user: user, maxTokens: 1500, fetchImpl: params.fetchImpl });
    const plan = extractJSON(res.text);
    return { vocab: cleanVocab(plan.vocab), ai: { model: res.model, usage: res.usage, cost: estimateCost(res.usage, res.model || params.model || DEFAULT_MODEL) } };
  }

  /** Domanda a scelta multipla su una frase del video. params: { sentence, context, lang, level, tricky, apiKey, model, fetchImpl } → { question, options, correct, tricky } */
  async function generateMC(params) {
    const lang = params.lang || 'it';
    const system = 'You write comprehension questions for language students. Output ONLY a JSON object, no prose, no markdown fences.';
    const user = ['LANGUAGE: ' + lang + '   STUDENT LEVEL: ' + (params.level || 'B1'),
      'Write ONE multiple-choice comprehension question in ' + lang + ' about the SENTENCE below (the student has just listened to it). Four short options, exactly one correct. ' +
      'Wrong options must be plausible and of the same kind as the right one.' + (params.tricky ? ' One wrong option must be "tricky": it echoes words that really occur in the sentence but does not answer the question, or is a near-synonym with the wrong nuance; give its index in "tricky".' : ' Set "tricky" to null.'),
      'SCHEMA: {"question":"...","options":["a","b","c","d"],"correct":0,"tricky":null}', '',
      'SENTENCE: ' + String(params.sentence || ''), '', 'CONTEXT (surrounding transcript):', String(params.context || '').slice(0, 3000)].join('\n');
    const res = await callAnthropic({ apiKey: params.apiKey, model: params.model, system: system, user: user, maxTokens: 600, fetchImpl: params.fetchImpl });
    const j = extractJSON(res.text);
    const options = (Array.isArray(j.options) ? j.options : []).map(function (x) { return String(x || '').trim(); }).filter(Boolean).slice(0, 4);
    if (!j.question || options.length < 2) throw new Error('Il modello non ha restituito una domanda valida');
    return { question: String(j.question).trim(), options: options, correct: Math.max(0, Math.min(options.length - 1, j.correct | 0)), tricky: (j.tricky == null || j.tricky === j.correct) ? null : Math.max(0, Math.min(options.length - 1, j.tricky | 0)), ai: { model: res.model, usage: res.usage, cost: estimateCost(res.usage, res.model || params.model || DEFAULT_MODEL) } };
  }

  /** Su richiesta: sostituisce una risposta sbagliata con una "tricky". params: { question, options, correct, sentence, context, lang, level, apiKey, model, fetchImpl } → { index, option } */
  async function makeTricky(params) {
    const lang = params.lang || 'it';
    const opts = (params.options || []).map(function (x) { return String(x || '').trim(); });
    const wrongIdx = opts.map(function (o, i) { return i; }).filter(function (i) { return i !== (params.correct | 0) && opts[i]; });
    if (!wrongIdx.length) throw new Error('Servono almeno due risposte');
    const system = 'You write comprehension questions for language students. Output ONLY a JSON object, no prose, no markdown fences.';
    const user = ['LANGUAGE: ' + lang + '   STUDENT LEVEL: ' + (params.level || 'B1'),
      'Below is a multiple-choice question about a SENTENCE the student has listened to. Replace ONE of the wrong options (indices ' + wrongIdx.join(', ') + ') with a "tricky" wrong option: it must echo words that really occur in the sentence, or be a near-synonym with the wrong nuance, so that a careless student picks it — but it must be clearly wrong on a careful listening. Keep it short, same style as the others. Never touch the correct option (index ' + (params.correct | 0) + ').',
      'SCHEMA: {"index":1,"option":"..."}', '',
      'QUESTION: ' + String(params.question || ''), 'OPTIONS: ' + JSON.stringify(opts), '', 'SENTENCE: ' + String(params.sentence || ''), '', 'CONTEXT:', String(params.context || '').slice(0, 2000)].join('\n');
    const res = await callAnthropic({ apiKey: params.apiKey, model: params.model, system: system, user: user, maxTokens: 300, fetchImpl: params.fetchImpl });
    const j = extractJSON(res.text);
    const index = j.index | 0;
    if (wrongIdx.indexOf(index) === -1 || !j.option) throw new Error('Il modello non ha restituito una risposta tricky valida');
    return { index: index, option: String(j.option).trim(), ai: { model: res.model, usage: res.usage, cost: estimateCost(res.usage, res.model || params.model || DEFAULT_MODEL) } };
  }

  /** Traduzione (parziale o totale) di una frase, in inglese britannico curato. params: { text, whole, context, lang, apiKey, model, fetchImpl } → { translation } */
  async function translateSentence(params) {
    const lang = params.lang || 'it';
    const target = params.target || 'British English';
    const system = 'You are a professional translator for language teachers. Output ONLY a JSON object, no prose, no markdown fences.';
    const user = ['Translate the TEXT from ' + lang + ' into natural, idiomatic ' + target + ' (British spelling: colour, realise, organise; British idiom). Keep the register of the original. ' +
      (params.whole ? 'Translate the whole sentence.' : 'The TEXT is a fragment of the SENTENCE: translate only the fragment, as it works inside that sentence (not the whole sentence).'),
      'SCHEMA: {"translation":"..."}', '',
      'TEXT: ' + String(params.text || ''), '', 'SENTENCE: ' + String(params.whole ? params.text : (params.sentence || '')), '', 'CONTEXT:', String(params.context || '').slice(0, 2000)].join('\n');
    const res = await callAnthropic({ apiKey: params.apiKey, model: params.model, system: system, user: user, maxTokens: 400, fetchImpl: params.fetchImpl });
    const j = extractJSON(res.text);
    if (!j.translation) throw new Error('Nessuna traduzione nella risposta');
    return { translation: String(j.translation).trim(), ai: { model: res.model, usage: res.usage, cost: estimateCost(res.usage, res.model || params.model || DEFAULT_MODEL) } };
  }

  /** Traduzioni per una lista di parole (nel contesto del video). params: { words:[...], lang, support, context, apiKey, model, fetchImpl } → { translations: {word: translation} } */
  async function translateWords(params) {
    const lang = params.lang || 'it', sup = params.support || (lang === 'en' ? 'it' : 'en');
    const words = (params.words || []).map(function (w) { return String(w).trim(); }).filter(Boolean);
    if (!words.length) return { translations: {}, ai: null };
    const system = 'You are a bilingual dictionary for language teachers. Output ONLY a JSON object, no prose, no markdown fences.';
    const user = ['Translate each ' + lang + ' word into ' + sup + ' with the meaning it has in this context (one or two words each; keep the dictionary form). Also give one emoji for concrete words (empty for abstract).',
      'SCHEMA: {"vocab":[{"word":"...","translation":"...","emoji":""}]}', '',
      'WORDS: ' + words.join(', '), '', 'CONTEXT:', String(params.context || '').slice(0, 6000)].join('\n');
    const res = await callAnthropic({ apiKey: params.apiKey, model: params.model, system: system, user: user, maxTokens: 1200, fetchImpl: params.fetchImpl });
    const plan = extractJSON(res.text);
    const map = {}, emo = {};
    cleanVocab(plan.vocab).forEach(function (v) { map[L.normalize(v.word)] = v.translation; if (v.emoji) emo[L.normalize(v.word)] = v.emoji; });
    const translations = {}, emojis = {};
    words.forEach(function (w) { const k = L.normalize(w); if (map[k]) translations[w] = map[k]; if (emo[k]) emojis[w] = emo[k]; });
    return { translations: translations, emojis: emojis, ai: { model: res.model, usage: res.usage, cost: estimateCost(res.usage, res.model || params.model || DEFAULT_MODEL) } };
  }

  /** Flusso completo: prompt → modello → piano applicato. params: { chunks, lines, duration, target, n, types, lang, level, focus, apiKey, model, fetchImpl } */
  async function generateWithAI(params) {
    const lang = params.lang || 'it';
    const duration = params.duration;
    const chunks = params.chunks || G.annotate(G.buildChunks(params.lines, { duration: duration, lang: lang }), { lang: lang, duration: duration });
    const target = params.target && params.target > 0 ? Math.min(params.target, duration) : duration;
    const msgs = buildMessages({ chunks: chunks, n: params.n, auto: params.auto, types: params.types, lang: lang, level: params.level, focus: params.focus, duration: duration, target: target, range: params.range, support: params.support, nVocab: params.nVocab, tricky: params.tricky });
    const res = await callAnthropic({ apiKey: params.apiKey, model: params.model, system: msgs.system, user: msgs.user, maxTokens: params.maxTokens, fetchImpl: params.fetchImpl });
    const plan = extractJSON(res.text);
    const applied = applyPlan(plan, { chunks: chunks, lang: lang, duration: duration, target: target, n: params.n, types: params.types, auto: params.auto });
    applied.chunks = chunks;
    applied.ai = { model: res.model, usage: res.usage, cost: estimateCost(res.usage, res.model || params.model || DEFAULT_MODEL), raw: res.text };
    return applied;
  }

  async function testKey(apiKey, model, fetchImpl) {
    const r = await callAnthropic({ apiKey: apiKey, model: model, system: 'Reply with the single word OK.', user: 'ping', maxTokens: 5, fetchImpl: fetchImpl });
    return r;
  }

  return { DEFAULT_MODEL: DEFAULT_MODEL, PRICES: PRICES, buildMessages: buildMessages, callAnthropic: callAnthropic, extractJSON: extractJSON, locate: locate, applyPlan: applyPlan, generateWithAI: generateWithAI, estimateCost: estimateCost, testKey: testKey, cleanVocab: cleanVocab, suggestVocab: suggestVocab, translateWords: translateWords, generateMC: generateMC, makeTricky: makeTricky, translateSentence: translateSentence };
});
