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
    // "…" davanti = il chunk continua la frase del chunk precedente (le frasi lunghe sono divise alla virgola):
    // un taglio non può iniziare lì, e non può finire su un chunk seguito da "…"
    const spoken = chunks.filter(function (c) { return !c.silence; });
    return spoken.map(function (c, i) {
      const prev = spoken[i - 1];
      const cont = c.mode === 'sentences' && prev && !G.endsSentence(prev, c) && c.start - prev.end < 1.5;
      return c.id + '|' + c.start.toFixed(1) + '|' + c.end.toFixed(1) + '|' + (cont ? '…' : '') + c.text;
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
      'Work from the TEXT: the shortened video must still make sense on its own, like a good abridgement. ALWAYS KEEP the opening that introduces the topic (what the video is about), the main line of explanation, and the conclusion. ' +
      'CUT, in this order: greetings/sponsor/calls to action, digressions and asides, repeated examples, overly detailed or technical passages (numbers, lists, minor specifics), long silences. ' +
      'Every cut must start at the beginning of a sentence and end at the end of a sentence, never mid-sentence: a chunk whose text starts with "…" continues the previous chunk\'s sentence, so a cut can neither start at it nor end right before it. Never cut a chunk that contains an exercise sentence, nor the 20 seconds before it. ' +
      'Prefer few long cuts (at least 8 seconds each) over many short ones; give a short "reason" for each. If the target is not reachable without harming coherence, do your best and say so in "notes".');
    lines.push('4. Give a short lesson "title" in the transcript language.');
    const sup = p.support || (p.lang === 'en' ? 'it' : 'en');
    lines.push('5. USEFUL WORDS: list ' + (p.nVocab || 14) + ' words (or short fixed expressions) a ' + (p.level || 'B1') + ' student whose own language is "' + sup + '" must learn to understand the video, in "vocab". ' +
      'Choose words that are OPAQUE to a ' + sup + ' speaker: skip transparent cognates (e.g. Italian "globale" ≈ English "global", "informazione" ≈ "information"), basic words a ' + (p.level || 'B1') + ' student already knows, proper names and numbers. ' +
      'Prioritize words that occur in the exercise sentences you chose (mark them with "inExercise": true), then other key words of the video. Use the dictionary form as it appears in the video (singular noun, infinitive verb, masculine adjective) ' +
      'and give the translation in language "' + sup + '" ("translation").');
    lines.push('');
    lines.push('OUTPUT SCHEMA (JSON only):');
    lines.push('{"title":"...","exercises":[{"chunk":"c12","type":"gap","sentence":"...","gaps":["word1","word2","word3"],"distractors":["w1","w2"],"missing":"word","extra":{"word":"di","after":"word"},"wrong":{"word":"il","replacement":"la"},"why":"short reason"}],"cuts":[{"from":"c1","to":"c3","reason":"intro"}],"vocab":[{"word":"smalto","translation":"enamel","inExercise":true}],"notes":"..."}');
    lines.push('Include only the fields relevant to each exercise type.');
    lines.push('');
    lines.push('TRANSCRIPT CHUNKS (id|start|end|text; a leading "…" means the chunk continues the previous sentence):');
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
    // Risposta tagliata dal limite di token: il JSON e' incompleto e non si puo' usare. Meglio dirlo che 'Nessun JSON'.
    if (j.stop_reason === 'max_tokens') throw new Error('Risposta del modello troncata (limite di ' + (o.maxTokens || 6000) + ' token): riduci il numero di esercizi o la durata e riprova');
    return { text: text, usage: j.usage || null, model: j.model || o.model, stop: j.stop_reason || null };
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
    // Senza JSON il modello ha scritto prosa (un rifiuto, una domanda, una spiegazione): si mostra COSA ha scritto,
    // altrimenti l'insegnante vede solo 'AI non usata' e non puo' capire se e' il tema del video o un guasto (3/9).
    if (a === -1 || b === -1 || b < a) throw new Error('Nessun JSON nella risposta del modello' + (t ? ' — ha scritto: «' + t.slice(0, 220).replace(/\s+/g, ' ') + (t.length > 220 ? '…' : '') + '»' : ' (risposta vuota)'));
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
      if (type === 'mc' && choices.options && choices.options.length > 1 && ctx.shuffle !== false) {
        const sh = shuffleMC(choices.options, Math.max(0, Math.min(choices.options.length - 1, choices.correct | 0)), (choices.tricky == null ? null : choices.tricky | 0), ctx.rand);
        choices.options = sh.options; choices.correct = sh.correct; choices.tricky = sh.tricky;
      }
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
        chunkId: c.id, type: ex.type, sentence: sentenceText, segment: seg, markerTime: seg.end,
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
        // a frasi intere: il modello (o il ritaglio attorno agli esercizi) può lasciare confini a metà frase
        const snapped = G.snapCutToSentences(pc2, chunks, { min: 5, duration: D });
        if (snapped) cuts.push({ start: snapped.start, end: snapped.end, reason: pc.reason, source: 'ai' });
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
      vocab: cleanVocab(plan.vocab, { lang: lang, level: ctx.level }),
      stats: { duration: D, target: target, effective: effective, removed: D - effective, n: exercises.length }
    };
  }

  /** Normalizza la lista di parole utili restituita dal modello: [{word, translation, inExercise}], senza doppioni. */
  function cleanVocab(list, o) {
    o = o || {};
    // rete di sicurezza sotto il prompt: da B1 in su una parola di base (abbiamo, quattro) non e' mai "utile", anche se il
    // modello la propone; le espressioni di piu' parole ("un conto e'") passano sempre
    const advanced = /^(B1|B2|C1|C2)$/i.test(String(o.level || 'B1'));
    const out = [], seen = {};
    (Array.isArray(list) ? list : []).forEach(function (v) {
      if (!v || typeof v !== 'object') return;
      const word = String(v.word || '').trim().replace(/\s+/g, ' ');
      if (!word || word.length > 40) return;
      const k = L.normalize(word);
      if (!k || seen[k]) return;
      if (advanced && !/\s/.test(word) && L.isBasic(word, o.lang || 'it')) return;
      seen[k] = 1;
      out.push({ word: word, translation: String(v.translation || '').trim(), inExercise: !!v.inExercise });
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
      'List ' + (params.n || 14) + ' words (or short fixed expressions) a ' + (params.level || 'B1') + ' student whose own language is ' + sup + ' must LEARN to understand the video. Choose words that are OPAQUE to a ' + sup + ' speaker: skip transparent cognates (Italian "globale" ≈ English "global", "stupido" ≈ "stupid": a student guesses those without help), basic words a ' + (params.level || 'B1') + ' student already knows, proper names and numbers. Multi-word expressions are welcome when the single word would mislead ("un conto è", "andare a male", "fare a meno di"). Prioritize words that occur in the EXERCISE SENTENCES (mark "inExercise": true), then other key words of the video. ' +
      'Dictionary form as used in the video (singular noun, infinitive verb, masculine adjective); "translation" in ' + sup + '.' +
      (params.exclude && params.exclude.length ? ' Do NOT include: ' + params.exclude.join(', ') + '.' : ''),
      'SCHEMA: {"vocab":[{"word":"...","translation":"...","inExercise":true}]}', '',
      'EXERCISE SENTENCES:', sentences || '(none)', '', 'VIDEO TEXT:', text].join('\n');
    const res = await callAnthropic({ apiKey: params.apiKey, model: params.model, system: system, user: user, maxTokens: 1500, fetchImpl: params.fetchImpl });
    const plan = extractJSON(res.text);
    return { vocab: cleanVocab(plan.vocab, { lang: params.lang, level: params.level }), ai: { model: res.model, usage: res.usage, cost: estimateCost(res.usage, res.model || params.model || DEFAULT_MODEL) } };
  }

  /**
   * Domande per parlare dopo il video: aperte, personali, sul tema (non sui dettagli), nella lingua del video,
   * ciascuna con 2-3 espressioni utili per rispondere. params: { chunks, lang, level, n, focus, apiKey, model, fetchImpl }
   * → { questions: [{ text, help }] }
   */
  /** Domande "Parliamone". mode 'warmup' = PRIMA del video (3 domande per far emergere il tema, niente spoiler);
   *  default = DOPO il video: prima domande di COMPRENSIONE specifiche di questo video ("kind":"check"), poi opinioni ancorate ai suoi punti ("kind":"talk"). */
  /**
   * Le espressioni per rispondere devono essere ATTACCHI DI FRASE, non contenuto: se dentro c'e' la risposta,
   * una domanda di comprensione smette di essere di comprensione (segnalato da Edoardo il 2/9) e una domanda
   * prima del video diventa uno spoiler. Il prompt lo chiede; questo e' il filtro che lo fa rispettare davvero.
   * Uno spezzone lungo, o pieno di numeri, non e' un attacco di frase: e' un pezzo di risposta, e si butta.
   * Se non ne resta nessuno la domanda va senza suggerimenti — per una comprensione e' la cosa giusta.
   */
  function frameHelp(help, kind) {
    const strict = kind === 'check' || kind === 'warmup';
    const max = strict ? 6 : 8;
    return String(help || '').split(/\s*·\s*/).map(function (h) { return h.trim(); }).filter(function (h) {
      if (!h) return false;
      if (h.split(/\s+/).length > max) return false;          // troppo lungo per essere un attacco: porta contenuto
      if (strict && /\d/.test(h)) return false;                // cifre = dati del video
      return true;
    }).slice(0, 3).join(' · ');
  }

  async function suggestDiscussion(params) {
    const lang = params.lang || 'it';
    const level = params.level || 'B1';
    const warmup = params.mode === 'warmup';
    const n = params.n || (warmup ? 3 : 6);
    const nCheck = Math.ceil(n / 2);
    const text = (params.chunks || []).map(function (c) { return c.text; }).join(' ').slice(0, 12000);
    const system = 'You help a language teacher prepare a speaking activity ' + (warmup ? 'BEFORE' : 'AFTER') + ' a video. Output ONLY a JSON object, no prose, no markdown fences.';
    const kindOnly = !warmup && (params.kind === 'check' || params.kind === 'talk');   // rigenerazione di UNA domanda di un tipo preciso
    const CHECK = 'COMPREHENSION questions ("kind":"check"): they verify that students understood the main ideas and key points of THIS video — what it says, why, how, with which examples, according to the video; open questions answerable by retelling the video (never yes/no, no trivial numbers or dates).';
    const TALK = 'DISCUSSION questions ("kind":"talk") for SPEAKING practice: personal reactions and opinions ANCHORED to a specific point the video made (e.g. "Il video dice che…: sei d\'accordo?", "Nel tuo paese succede la stessa cosa?").';
    let task = warmup
      ? 'Write exactly ' + n + ' warm-up questions in ' + lang + ' for BEFORE the video: they elicit the TOPIC — activate what students already know and spark curiosity. The students have NOT seen the video yet: never mention what the video says, never quote its facts, examples or numbers, no spoilers. Each question must be open (never answerable with yes/no or one word), personal and concrete ("Ti è mai capitato…?", "Cosa sai di…?", "Secondo te perché…?"). Order them from easy and personal to more general. Language and grammar suited to a ' + level + ' student; short, one sentence each. Set "kind":"warmup" on each.'
      : kindOnly
        ? 'Write exactly ' + n + ' question' + (n === 1 ? '' : 's') + ' in ' + lang + ' for AFTER the video, SPECIFIC to this video (never a generic question that could be asked without having watched it): ' + (params.kind === 'check' ? CHECK : TALK) + ' Language and grammar suited to a ' + level + ' student; short, one sentence each.'
        : 'Write ' + n + ' questions in ' + lang + ' for AFTER the video, all SPECIFIC to this video (never generic questions that could be asked without having watched it). First ' + nCheck + ' ' + CHECK + ' Then ' + (n - nCheck) + ' ' + TALK + ' Language and grammar suited to a ' + level + ' student; short, one sentence each.';
    const avoid = (params.avoid || []).map(function (a) { return String(a || '').trim(); }).filter(Boolean);
    if (avoid.length) task += ' Do NOT repeat or paraphrase these questions, already in use: ' + avoid.map(function (a) { return '"' + a + '"'; }).join('; ') + '. Ask about something else in the video.';
    const user = ['LANGUAGE OF THE VIDEO: ' + lang + '   STUDENT LEVEL: ' + level,
      task +
      ' For each question give "help": 2 or 3 SENTENCE OPENERS (in ' + lang + ', separated by " · ") — the words the student uses to START the answer, nothing more. '
      + 'Each is at most 5 words and ends with "…", e.g. "Secondo me… · Non sono d\'accordo perché… · Il video dice che…". '
      + 'They must carry NO information: never a fact, a name, a number, a place, a cause or any part of the answer, and never a word taken from the video that is not already in the question. '
      + 'A student must be able to read them without learning anything about the video. '
      + (warmup ? 'These come before the video: an opener that hints at what the video says is a spoiler.' : 'This matters most for the comprehension questions: if the opener contains the answer, the question stops being comprehension.') +
      (params.focus ? ' Teacher\'s note: ' + params.focus : ''),
      'SCHEMA: {"questions":[{"kind":"' + (warmup ? 'warmup' : 'check|talk') + '","text":"...","help":"... · ... · ..."}]}', '',
      'VIDEO TEXT' + (warmup ? ' (for your eyes only — the questions must not reveal it)' : '') + ':', text].join('\n');
    const res = await callAnthropic({ apiKey: params.apiKey, model: params.model, system: system, user: user, maxTokens: 1500, fetchImpl: params.fetchImpl });
    const plan = extractJSON(res.text);
    const questions = (Array.isArray(plan.questions) ? plan.questions : []).map(function (q) {
      const kind = warmup ? 'warmup' : kindOnly ? params.kind : (String((q && q.kind) || '').toLowerCase() === 'check' ? 'check' : 'talk');
      return { kind: kind, text: String((q && q.text) || '').trim(), help: frameHelp(String((q && q.help) || ''), kind) };
    }).filter(function (q) { return q.text; }).slice(0, 12);
    return { questions: questions, ai: { model: res.model, usage: res.usage, cost: estimateCost(res.usage, res.model || params.model || DEFAULT_MODEL) } };
  }

  /**
   * UNITÀ DI CONVERSAZIONE (senza video): da argomento + livello CEFR nasce un'unità completa come una pagina di libro —
   * lessico utile, domande numerate con le espressioni per rispondere, due sondaggi, due testi da leggere e un gioco di ruolo.
   * params: { topic, level, n, lang, uiLang, focus?, parts?, apiKey, model, fetchImpl } → { unit, ai }
   *
   * I sondaggi sono INVENTATI e vanno sempre mostrati con l'etichetta "dati di esempio": non sono ricerche vere.
   * Per lo stesso motivo le persone dei testi sono personaggi, non fonti: il campo "fiction" lo dice a chi impagina.
   */
  async function generateConvUnit(params) {
    const lang = params.lang || 'it';
    const uiLang = params.uiLang || lang;
    const level = params.level || 'B1';
    const n = Math.max(3, Math.min(14, params.n || 10));
    const topic = String(params.topic || '').trim();
    if (!topic) throw new Error('Manca l\'argomento');
    const want = params.parts || {};
    const charts = want.charts !== false, texts = want.texts !== false, role = want.roleplay !== false;
    const nCharts = charts ? 2 : 0;

    const system = 'You are an experienced language-textbook author. You write conversation units for a language class: '
      + 'everything is material for SPEAKING practice, graded to the CEFR level. Output ONLY a JSON object, no prose, no markdown fences.';

    const tasks = [];
    tasks.push('"title": a short unit title in ' + lang + ' about "' + topic + '" (like a textbook chapter, e.g. "Cibo: cucinare, ordinare, sprecare").');
    tasks.push('"vocab": 18-24 useful words and expressions in ' + lang + ' for this topic at ' + level
      + '. Real class vocabulary, not a dictionary dump: verbs and expressions too, not only nouns. '
      + 'Use "≠" between a word and its opposite ("comodo ≠ scomodo"), "/" between near-synonyms ("errore / sbaglio"), "=" between equivalents. '
      + 'Each entry: {"it":"the word or expression as it goes on the page","en":"short gloss in ' + uiLang + '"}. Order them so related words sit together.');
    tasks.push('"questions": exactly ' + n + ' numbered questions in ' + lang + ', in the order a teacher would ask them across a lesson: '
      + 'start from describing an image and from the student\'s own habits, move to memories and personal stories, then opinions, then the harder abstract ones. '
      + 'Every question is OPEN (never answerable yes/no or with one word) and asks for real talking. Two or three sentences at most, and it may contain a sub-question ("...? Secondo te perché?"). '
      + 'Each: {"text":"...","help":"2 or 3 sentence-openers in ' + lang + ' separated by ·, e.g. Secondo me… · Non sono d\'accordo perché…","ref":"photo|chart1|chart2|text1|text2|null"}. '
      + '"ref" says what the question makes the student look at: use "photo" for the 1-2 questions that describe an image, '
      + (charts ? '"chart1"/"chart2" for the two that send the student to a survey, ' : '')
      + (texts ? '"text1"/"text2" for the two that ask about the reading texts (put these last), ' : '')
      + 'null for the rest. Language and grammar suited to a ' + level + ' student.');
    if (charts) tasks.push('"charts": exactly 2 objects {"title":"the survey question in ' + lang + ', short","rows":[{"label":"...","pct":58}]}, 6 rows each, '
      + 'percentages plausible and NOT summing to 100 (people pick more than one), sorted from highest to lowest, with a low "none/never" row last. '
      + 'chart1 belongs to the question whose ref is "chart1", chart2 to "chart2". These numbers are INVENTED for discussion, so keep them believable but round.');
    if (texts) tasks.push('"texts": exactly 2 reading texts in ' + lang + ' graded to ' + level + '. '
      + 'text1 = a first-person interview with ONE INVENTED person whose job the topic has changed: {"kind":"interview","title":"a quoted sentence they say, with « »","who":"Name Surname, NN anni, job","body":"280-350 words, 6-8 paragraphs, plain spoken language, concrete details, no moral at the end"}. '
      + 'text2 = a short magazine article on the same topic: {"kind":"article","title":"a 2-3 word section heading","body":"260-320 words with 2 invented named experts quoted in « »","quote":"the one sentence from text2 worth printing big on page 1"}. '
      + 'The people are CHARACTERS you invent for the class, never real named individuals, and the article quotes no real organisation, study or statistic.');
    if (role) tasks.push('"roleplay": a phone-call task {"intro":"2-3 sentences in ' + lang + ' setting up a friend in trouble because of this topic","steps":["fatti raccontare…","spiegagli perché…","convincilo a…"]} — exactly 3 steps, imperative, second person singular.');
    tasks.push('"photos": 3 objects {"slot":"top|mid|role","query":"a 3-6 word ENGLISH search query for a photo of a REAL EVERYDAY SCENE about this topic","alt":"what the photo shows, in ' + lang + '"} — the scenes the questions with ref "photo" describe.');

    const user = ['TOPIC: ' + topic,
      'LANGUAGE OF THE UNIT (everything the student reads): ' + lang,
      'TEACHER / GLOSS LANGUAGE: ' + uiLang,
      'STUDENT LEVEL (CEFR): ' + level,
      params.focus ? 'GRAMMAR OR FUNCTION TO PRACTISE: ' + params.focus + ' — build the questions and the help expressions so that this comes out naturally in the answers; never announce it, never turn a question into a grammar drill.' : '',
      '',
      'Write ONE conversation unit with these fields:',
      tasks.map(function (t, i) { return (i + 1) + '. ' + t; }).join('\n'),
      '',
      'SCHEMA: {"title":"...","vocab":[{"it":"...","en":"..."}],"questions":[{"text":"...","help":"... · ...","ref":null}]'
      + (charts ? ',"charts":[{"title":"...","rows":[{"label":"...","pct":58}]}]' : '')
      + (texts ? ',"texts":[{"kind":"interview","title":"...","who":"...","body":"..."},{"kind":"article","title":"...","body":"...","quote":"..."}]' : '')
      + (role ? ',"roleplay":{"intro":"...","steps":["...","...","..."]}' : '')
      + ',"photos":[{"slot":"top","query":"...","alt":"..."}]}'].filter(Boolean).join('\n');

    const res = await callAnthropic({ apiKey: params.apiKey, model: params.model, system: system, user: user, maxTokens: 8000, fetchImpl: params.fetchImpl });
    const j = extractJSON(res.text);
    const str = function (v) { return String(v == null ? '' : v).trim(); };
    const unit = {
      title: str(j.title) || topic,
      topic: topic, level: level, lang: lang, uiLang: uiLang, focus: str(params.focus),
      vocab: (Array.isArray(j.vocab) ? j.vocab : []).map(function (w) { return { it: str(w && w.it), en: str(w && w.en) }; })
        .filter(function (w) { return w.it; }).slice(0, 26),
      questions: (Array.isArray(j.questions) ? j.questions : []).map(function (q) {
        const ref = str(q && q.ref).toLowerCase();
        return { text: str(q && q.text), help: str(q && q.help), ref: /^(photo|chart1|chart2|text1|text2)$/.test(ref) ? ref : '' };
      }).filter(function (q) { return q.text; }).slice(0, n),
      charts: (Array.isArray(j.charts) ? j.charts : []).slice(0, nCharts).map(function (c) {
        return {
          title: str(c && c.title),
          // "invented": i numeri sono inventati e in pagina vanno etichettati; "class" = grafico vuoto da riempire coi voti della classe
          source: 'invented',
          rows: (Array.isArray(c && c.rows) ? c.rows : []).map(function (r) {
            const pct = Math.round(Number(r && r.pct));
            return { label: str(r && r.label), pct: isFinite(pct) ? Math.max(0, Math.min(100, pct)) : 0 };
          }).filter(function (r) { return r.label; }).slice(0, 8)
        };
      }).filter(function (c) { return c.title && c.rows.length; }),
      texts: (Array.isArray(j.texts) ? j.texts : []).slice(0, 2).map(function (t) {
        return {
          kind: str(t && t.kind) === 'article' ? 'article' : 'interview',
          title: str(t && t.title), who: str(t && t.who), body: str(t && t.body), quote: str(t && t.quote),
          fiction: true   // personaggi inventati per la classe: chi impagina lo dichiara in pagina
        };
      }).filter(function (t) { return t.body; }),
      roleplay: role && j.roleplay ? {
        intro: str(j.roleplay.intro),
        steps: (Array.isArray(j.roleplay.steps) ? j.roleplay.steps : []).map(str).filter(Boolean).slice(0, 3)   // l'impaginato A4 ne tiene tre
      } : null,
      photos: (Array.isArray(j.photos) ? j.photos : []).map(function (ph) {
        const slot = str(ph && ph.slot).toLowerCase();
        return { slot: /^(top|mid|role)$/.test(slot) ? slot : 'top', query: str(ph && ph.query), alt: str(ph && ph.alt), url: '' };
      }).filter(function (ph) { return ph.query; }).slice(0, 3)
    };
    if (unit.roleplay && !unit.roleplay.intro) unit.roleplay = null;
    return { unit: unit, ai: { model: res.model, usage: res.usage, cost: estimateCost(res.usage, res.model || params.model || DEFAULT_MODEL) } };
  }

  /** Rigenerazione di UN pezzo dell'unità, lasciando intatto il resto. what: 'question'|'vocab'|'chart'|'text'|'roleplay'
   *  params: { what, unit, index?, avoid?, note?, apiKey, model, fetchImpl } → { value, ai } */
  async function regenerateConvPart(params) {
    const u = params.unit || {};
    const lang = u.lang || 'it', level = u.level || 'B1', topic = u.topic || u.title || '';
    const what = params.what;
    const system = 'You are a language-textbook author revising ONE piece of an existing conversation unit. Output ONLY a JSON object, no prose, no markdown fences.';
    const avoid = (params.avoid || []).map(function (a) { return String(a || '').trim(); }).filter(Boolean);
    let task, schema;
    if (what === 'question') {
      task = 'Write ONE new open question in ' + lang + ' for this unit, with 2-3 sentence-openers to answer it. It must ask for real talking (never yes/no) and suit a ' + level + ' student.';
      schema = '{"text":"...","help":"... · ... · ..."}';
    } else if (what === 'vocab') {
      task = 'Write ' + (params.count || 6) + ' more useful words or expressions in ' + lang + ' for this topic at ' + level + ', in the same style (use ≠ for opposites, / for near-synonyms).';
      schema = '{"vocab":[{"it":"...","en":"..."}]}';
    } else if (what === 'chart') {
      task = 'Write ONE new survey-style chart in ' + lang + ' for this unit: a short survey question and 6 rows with plausible invented percentages that do NOT sum to 100, highest first, a low "never/none" row last.';
      schema = '{"title":"...","rows":[{"label":"...","pct":58}]}';
    } else if (what === 'text') {
      task = (params.kind === 'article')
        ? 'Write ONE new short magazine article in ' + lang + ' on this topic, 260-320 words, graded to ' + level + ', quoting 2 invented named experts in « », plus the one sentence worth printing big.'
        : 'Write ONE new first-person interview in ' + lang + ' with an INVENTED person whose job this topic has changed: 280-350 words, 6-8 short paragraphs, plain spoken language, graded to ' + level + '.';
      schema = (params.kind === 'article') ? '{"kind":"article","title":"...","body":"...","quote":"..."}' : '{"kind":"interview","title":"«…»","who":"Name Surname, NN anni, job","body":"..."}';
    } else if (what === 'roleplay') {
      task = 'Write ONE new phone-call role-play task in ' + lang + ' for this topic: a friend in trouble because of it, and exactly 3 imperative steps.';
      schema = '{"intro":"...","steps":["...","...","..."]}';
    } else {
      throw new Error('Pezzo sconosciuto: ' + what);
    }
    if (avoid.length) task += ' Do NOT repeat or paraphrase what is already in the unit: ' + avoid.map(function (a) { return '"' + a.slice(0, 160) + '"'; }).join('; ') + '.';
    if (params.note) task += ' Teacher\'s note, follow it: ' + params.note;
    if (u.focus) task += ' Grammar or function to practise, brought out naturally and never announced: ' + u.focus;
    const user = ['UNIT: ' + (u.title || topic) + '   TOPIC: ' + topic + '   LANGUAGE: ' + lang + '   LEVEL: ' + level, task, 'SCHEMA: ' + schema].join('\n');
    const res = await callAnthropic({ apiKey: params.apiKey, model: params.model, system: system, user: user, maxTokens: 2500, fetchImpl: params.fetchImpl });
    const j = extractJSON(res.text);
    return { value: j, ai: { model: res.model, usage: res.usage, cost: estimateCost(res.usage, res.model || params.model || DEFAULT_MODEL) } };
  }

  /** Serie di domande a scelta multipla per l'attività Quiz: da un argomento (topic) o dal testo di un video (chunks).
   *  params: { topic?, chunks?, lang, level, n, apiKey, model, fetchImpl } → { questions:[{q,options,correct}], ai } */
  async function generateQuizSet(params) {
    const lang = params.lang || 'it';
    const level = params.level || 'B1';
    const n = params.n || 6;
    const text = (params.chunks || []).map(function (c) { return c.text; }).join(' ').slice(0, 12000);
    const system = 'You write engaging quiz questions for language students. Output ONLY a JSON object, no prose, no markdown fences.';
    const src = text ? 'about the VIDEO TEXT below (comprehension of its ideas and vocabulary, not tiny details or exact numbers)' : 'about this topic: "' + String(params.topic || '') + '"';
    let task = 'Write ' + n + ' multiple-choice question' + (n === 1 ? '' : 's') + ' in ' + lang + ' ' + src + '. Four short options each, exactly one correct ("correct" = its index). Wrong options plausible and of the same kind as the right one. Questions and options suited to a ' + level + ' student, short and clear. Vary what is asked (meaning, vocabulary, usage, true facts).';
    // rigenerazione di UNA domanda: non ripetere quelle già nel quiz
    const avoid = (params.avoid || []).map(function (a) { return String(a || '').trim(); }).filter(Boolean);
    if (avoid.length) task += ' Do NOT repeat or paraphrase these questions, already in the quiz: ' + avoid.map(function (a) { return '"' + a + '"'; }).join('; ') + '. Ask about something else.';
    const user = ['LANGUAGE: ' + lang + '   STUDENT LEVEL: ' + level,
      task,
      'SCHEMA: {"questions":[{"q":"...","options":["a","b","c","d"],"correct":0}]}',
      text ? '\nVIDEO TEXT:\n' + text : ''].join('\n');
    const res = await callAnthropic({ apiKey: params.apiKey, model: params.model, system: system, user: user, maxTokens: 2000, fetchImpl: params.fetchImpl });
    const plan = extractJSON(res.text);
    const questions = (Array.isArray(plan.questions) ? plan.questions : []).map(function (q) {
      const options = (Array.isArray(q && q.options) ? q.options : []).map(function (x) { return String(x || '').trim(); }).filter(Boolean).slice(0, 4);
      const correct = Math.max(0, Math.min(options.length - 1, parseInt(q && q.correct, 10) || 0));
      return { q: String((q && q.q) || '').trim(), options: options, correct: correct };
    }).filter(function (q) { return q.q && q.options.length >= 2; }).slice(0, 15);
    return { questions: questions, ai: { model: res.model, usage: res.usage, cost: estimateCost(res.usage, res.model || params.model || DEFAULT_MODEL) } };
  }

  /** UNA risposta nuova per una domanda del Quiz: quella giusta riformulata, oppure un distrattore nuovo (plausibile, dello stesso tipo).
   *  params: { q, options, index, lang, level, topic?, chunks?, apiKey, model, fetchImpl } → { text, ai } */
  async function generateQuizOption(params) {
    const lang = params.lang || 'it';
    const level = params.level || 'B1';
    const options = (params.options || []).map(function (x) { return String(x || '').trim(); });
    const k = params.index | 0;
    const isCorrect = params.correct === k;
    const others = options.filter(function (o, i) { return i !== k && o; });
    const text = (params.chunks || []).map(function (c) { return c.text; }).join(' ').slice(0, 8000);
    const system = 'You write multiple-choice quiz items for language students. Output ONLY a JSON object, no prose, no markdown fences.';
    const user = ['LANGUAGE: ' + lang + '   STUDENT LEVEL: ' + level,
      'QUESTION: ' + String(params.q || ''),
      (isCorrect ? 'The option to replace is the CORRECT answer' : 'The option to replace is a WRONG option') + (options[k] ? ' (currently: "' + options[k] + '")' : '') + '.',
      'OTHER OPTIONS (keep them, do not repeat them): ' + (others.length ? others.map(function (o) { return '"' + o + '"'; }).join(', ') : '(none)') + (isCorrect ? '' : '. The correct answer is "' + (options[params.correct | 0] || '') + '".'),
      'Write ONE replacement option in ' + lang + ': ' + (isCorrect ? 'a correct answer to the question, formulated differently from the current one' : 'a new plausible wrong option of the same kind and length as the correct answer, clearly wrong for someone who understood') + '. Short, suited to a ' + level + ' student.' + (params.topic ? ' Topic of the quiz: "' + params.topic + '".' : ''),
      'SCHEMA: {"option":"..."}',
      text ? '\nVIDEO TEXT (the quiz is about it):\n' + text : ''].join('\n');
    const res = await callAnthropic({ apiKey: params.apiKey, model: params.model, system: system, user: user, maxTokens: 300, fetchImpl: params.fetchImpl });
    const j = extractJSON(res.text);
    const out = String((j && j.option) || '').trim();
    if (!out) throw new Error('Il modello non ha restituito una risposta');
    return { text: out, ai: { model: res.model, usage: res.usage, cost: estimateCost(res.usage, res.model || params.model || DEFAULT_MODEL) } };
  }

  /** Mescola le opzioni di una scelta multipla (il modello mette quasi sempre quella giusta per prima) e rimappa gli indici. */
  function shuffleMC(options, correct, tricky, rand) {
    const r = typeof rand === 'function' ? rand : Math.random;
    const idx = options.map(function (o, i) { return i; });
    for (let i = idx.length - 1; i > 0; i--) { const j = Math.floor(r() * (i + 1)); const t = idx[i]; idx[i] = idx[j]; idx[j] = t; }
    // se dopo il mescolamento la giusta è ancora prima e ci sono almeno 2 opzioni, la sposta (evita il "sempre la prima")
    if (idx.length > 1 && idx[0] === correct) { const k = 1 + Math.floor(r() * (idx.length - 1)); const t = idx[0]; idx[0] = idx[k]; idx[k] = t; }
    return { options: idx.map(function (i) { return options[i]; }), correct: idx.indexOf(correct), tricky: (tricky == null || tricky < 0) ? null : idx.indexOf(tricky) };
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
    const correct = Math.max(0, Math.min(options.length - 1, j.correct | 0));
    const tricky = (j.tricky == null || j.tricky === j.correct) ? null : Math.max(0, Math.min(options.length - 1, j.tricky | 0));
    const sh = params.shuffle === false ? { options: options, correct: correct, tricky: tricky } : shuffleMC(options, correct, tricky, params.rand);
    return { question: String(j.question).trim(), options: sh.options, correct: sh.correct, tricky: sh.tricky, ai: { model: res.model, usage: res.usage, cost: estimateCost(res.usage, res.model || params.model || DEFAULT_MODEL) } };
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
    // La traduzione e' un aiuto alla comprensione, non la soluzione: le parole che lo studente deve ancora
    // trovare escono come "___" (segnalazione di Edoardo, 1/9: su un fill the gaps la traduzione le conteneva tutte).
    const hide = (params.hide || []).map(function (w) { return String(w || '').trim(); }).filter(Boolean);
    const user = ['Translate the TEXT from ' + lang + ' into natural, idiomatic ' + target + ' (British spelling: colour, realise, organise; British idiom). Keep the register of the original. ' +
      (params.whole ? 'Translate the whole sentence.' : 'The TEXT is a fragment of the SENTENCE: translate only the fragment, as it works inside that sentence (not the whole sentence).') +
      (params.literal ? ' Translate exactly what is written, word for word where possible: the sentence may contain a deliberate mistake or an extra word and you must NOT correct it, tidy it or leave it out.' : ''),
      hide.length
        ? 'IMPORTANT — the student is doing a listening exercise and still has to produce these ' + lang + ' words: ' + hide.map(function (w) { return '"' + w + '"'; }).join(', ') + '. '
          + 'In your translation, replace whatever renders each of them with "___" (three underscores, one run per item, in the place where it belongs) and translate everything else normally, so the sentence still reads as a sentence with blanks. '
          + 'Never write those words, their ' + target + ' equivalents, a synonym, or a paraphrase that gives them away — not even between brackets or as a note.'
        : '',
      'SCHEMA: {"translation":"..."}', '',
      'TEXT: ' + String(params.text || ''), '', 'SENTENCE: ' + String(params.whole ? params.text : (params.sentence || '')), '', 'CONTEXT:', String(params.context || '').slice(0, 2000)].filter(Boolean).join('\n');
    const res = await callAnthropic({ apiKey: params.apiKey, model: params.model, system: system, user: user, maxTokens: 400, fetchImpl: params.fetchImpl });
    const j = extractJSON(res.text);
    if (!j.translation) throw new Error('Nessuna traduzione nella risposta');
    return { translation: String(j.translation).trim(), ai: { model: res.model, usage: res.usage, cost: estimateCost(res.usage, res.model || params.model || DEFAULT_MODEL) } };
  }

  /** Traduzioni per una lista di parole (nel contesto del video). params: { words:[...], lang, support, context, apiKey, model, fetchImpl } → { translations: {word: translation} } */
  /**
   * CONTROLLO DELLE PAROLE UTILI. Una parola presa da sola perde il senso che aveva nella frase: "un conto" tradotto
   * "a bill" non e' sbagliato in assoluto, ma nel video vuol dire "one thing is" (segnalato da Edoardo il 3/9).
   * Qui il modello rilegge ogni voce DENTRO la frase da cui viene e dice: va bene, e' ambigua, o la traduzione e'
   * proprio quella sbagliata — e quando serve propone di allungare l'espressione ("un conto" -> "un conto e'").
   * params: { words:[{word, translation}], sentences?, lang, support, context, apiKey, model, fetchImpl }
   *   -> { items:[{word, verdict:'ok'|'ambigua'|'sbagliata', why, suggest:{word, translation}|null}], ai }
   */
  async function checkVocab(params) {
    const lang = params.lang || 'it', sup = params.support || (lang === 'en' ? 'it' : 'en');
    const words = (params.words || []).filter(function (w) { return w && w.word; });
    if (!words.length) return { items: [], ai: null };
    const system = 'You check a language teacher\'s vocabulary list against the text it was taken from. Output ONLY a JSON object, no prose, no markdown fences.';
    const user = ['LANGUAGE: ' + lang + '   GLOSS LANGUAGE: ' + sup, '',
      'For each entry, judge the ' + sup + ' gloss AS IT WILL BE SHOWN TO STUDENTS on a flashcard, next to the ' + lang + ' word alone.',
      'What counts is the meaning the word has in the EXERCISE SENTENCES: those are the sentences the students actually work on, and the teacher picked these words FOR them. The rest of the video is background only.',
      'verdict "ok" = the gloss is the meaning the word has in the text.',
      'verdict "ambigua" = the gloss is a real meaning of the word but NOT the one it has here, or the word alone is misleading out of context (e.g. ' + lang + ' "un conto" glossed "a bill" when in the text it means "one thing is").',
      'verdict "sbagliata" = the gloss is simply not a meaning of this word.',
      'When the entry only works as part of a longer expression, put that expression in "suggest.word" (copied from the text, 2-4 words) with its gloss in "suggest.translation". Otherwise "suggest": null.',
      '"why" = one short sentence in Italian for the teacher, saying what the problem is. Empty when the verdict is "ok".',
      'Be strict but not pedantic: a gloss that a student would understand correctly on the card is "ok". Judge every entry, in the same order, copying "word" exactly as given.',
      '', 'SCHEMA: {"items":[{"word":"...","verdict":"ok|ambigua|sbagliata","why":"...","suggest":{"word":"...","translation":"..."}}]}',
      '', 'ENTRIES:',
      words.map(function (w) { return '- ' + w.word + ' = ' + (w.translation || '(senza traduzione)'); }).join('\n'),
      '', 'EXERCISE SENTENCES (what the students will work on):',
      (params.sentences || []).map(function (x, i) { return (i + 1) + '. ' + x; }).join('\n') || '(none)',
      '', 'REST OF THE VIDEO (background):', String(params.context || '').slice(0, 6000)].join('\n');
    const res = await callAnthropic({ apiKey: params.apiKey, model: params.model, system: system, user: user, maxTokens: 2500, fetchImpl: params.fetchImpl });
    const j = extractJSON(res.text);
    const raw = Array.isArray(j.items) ? j.items : [];
    const str = function (v) { return String(v == null ? '' : v).trim(); };
    const byKey = {};
    raw.forEach(function (it, i) { if (it && it.word) wordKeys(str(it.word)).forEach(function (k) { if (!(k in byKey)) byKey[k] = it; }); it && (it.__i = i); });
    const items = words.map(function (w, i) {
      const hit = wordKeys(w.word).map(function (k) { return byKey[k]; }).filter(Boolean)[0] || (raw.length === words.length ? raw[i] : null);
      const v = str(hit && hit.verdict).toLowerCase();
      const verdict = v === 'ambigua' || v === 'sbagliata' ? v : 'ok';
      const sg = hit && hit.suggest && str(hit.suggest.word) ? { word: str(hit.suggest.word), translation: str(hit.suggest.translation) } : null;
      return { word: w.word, translation: w.translation || '', verdict: verdict, why: verdict === 'ok' ? '' : str(hit && hit.why), suggest: verdict === 'ok' ? null : sg };
    });
    return { items: items, ai: { model: res.model, usage: res.usage, cost: estimateCost(res.usage, res.model || params.model || DEFAULT_MODEL) } };
  }

  /** Chiavi con cui riconoscere la stessa voce: com'e' scritta e senza l'articolo/il "to" davanti
   *  ("i farmaci" e "farmaci", "to clone" e "clone"). Serve perche' il modello riporta spesso la forma del dizionario. */
  function wordKeys(word) {
    const k = L.normalize(word);
    const out = [k];
    const parts = k.split(' ');
    if (parts.length > 1 && (parts[0].length <= 3 || /'$/.test(parts[0]) || parts[0] === 'to')) out.push(parts.slice(1).join(' '));
    return out;
  }
  async function translateWords(params) {
    const lang = params.lang || 'it', sup = params.support || (lang === 'en' ? 'it' : 'en');
    const words = (params.words || []).map(function (w) { return String(w).trim(); }).filter(Boolean);
    if (!words.length) return { translations: {}, ai: null };
    const system = 'You are a bilingual dictionary for language teachers. Output ONLY a JSON object, no prose, no markdown fences.';
    // "word" deve tornare IDENTICA a com'e' stata mandata, altrimenti la traduzione non si riaggancia alla voce giusta:
    // chiedendo "la forma del dizionario" il modello rispondeva "farmaci" per "i farmaci" e la traduzione andava persa
    // (segnalato da Edoardo il 2/9: "scrive 'traduco 1 parola' ma poi rimane senza traduzione").
    const user = ['Translate each ' + lang + ' word or expression into ' + sup + ' with the meaning it has in this context (one or two words each).',
      'In "word" copy the item EXACTLY as it appears in WORDS below, character for character — keep the article, the plural and any spacing. Put the ' + sup + ' meaning in "translation". Return one entry per item, in the same order.',
      'SCHEMA: {"vocab":[{"word":"...","translation":"..."}]}', '',
      'WORDS: ' + words.join(', '), '', 'CONTEXT:', String(params.context || '').slice(0, 6000)].join('\n');
    const res = await callAnthropic({ apiKey: params.apiKey, model: params.model, system: system, user: user, maxTokens: 1200, fetchImpl: params.fetchImpl });
    const plan = extractJSON(res.text);
    const list = cleanVocab(plan.vocab, { level: 'A1' });   // qui si TRADUCE una lista scelta dall'insegnante: non si scarta niente
    const map = {};
    list.forEach(function (v) { if (v.translation) wordKeys(v.word).forEach(function (k) { if (!(k in map)) map[k] = v.translation; }); });
    const translations = {};
    const missing = [];
    words.forEach(function (w, i) {
      const hit = wordKeys(w).map(function (k) { return map[k]; }).filter(Boolean)[0];
      if (hit) translations[w] = hit; else missing.push(i);
    });
    // ultima rete: se il modello ha risposto una voce per parola, vale l'ordine
    if (missing.length && list.length === words.length) {
      missing.forEach(function (i) { if (list[i] && list[i].translation) translations[words[i]] = list[i].translation; });
    }
    return { translations: translations, ai: { model: res.model, usage: res.usage, cost: estimateCost(res.usage, res.model || params.model || DEFAULT_MODEL) } };
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
    const applied = applyPlan(plan, { chunks: chunks, lang: lang, duration: duration, target: target, n: params.n, types: params.types, auto: params.auto, level: params.level });
    applied.chunks = chunks;
    applied.ai = { model: res.model, usage: res.usage, cost: estimateCost(res.usage, res.model || params.model || DEFAULT_MODEL), raw: res.text };
    return applied;
  }

  async function testKey(apiKey, model, fetchImpl) {
    const r = await callAnthropic({ apiKey: apiKey, model: model, system: 'Reply with the single word OK.', user: 'ping', maxTokens: 5, fetchImpl: fetchImpl });
    return r;
  }

  return { DEFAULT_MODEL: DEFAULT_MODEL, PRICES: PRICES, buildMessages: buildMessages, callAnthropic: callAnthropic, extractJSON: extractJSON, locate: locate, applyPlan: applyPlan, generateWithAI: generateWithAI, estimateCost: estimateCost, testKey: testKey, cleanVocab: cleanVocab, suggestVocab: suggestVocab, translateWords: translateWords, checkVocab: checkVocab, generateMC: generateMC, shuffleMC: shuffleMC, makeTricky: makeTricky, translateSentence: translateSentence, suggestDiscussion: suggestDiscussion, frameHelp: frameHelp, generateQuizSet: generateQuizSet, generateQuizOption: generateQuizOption, generateConvUnit: generateConvUnit, regenerateConvPart: regenerateConvPart };
});
