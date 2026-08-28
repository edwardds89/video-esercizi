/* exercises.js — costruzione e correzione dei 5 tipi di esercizio (browser + Node) */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory(require('./lang.js'));
  else root.VLEx = factory(root.VLLang);
})(typeof self !== 'undefined' ? self : this, function (L) {
  'use strict';

  const LABELS = {
    gap: 'Completa gli spazi (fill the gaps)',
    gapbank: 'Completa gli spazi — semplificato, con le parole (fill the gaps)',
    scramble: 'Riordina la frase (scrambled sentence)',
    missing: 'Trova la parola mancante (find the missing word)',
    extra: 'Trova la parola in più (find the extra word)',
    wrong: 'Trova la parola sbagliata (find the wrong word)',
    mc: 'Scelta multipla (multiple choice)'
  };

  const INSTRUCTIONS = {
    gap: 'Ascolta e scrivi le parole mancanti.',
    gapbank: 'Ascolta e metti negli spazi le parole giuste: nella lista ce ne sono anche di sbagliate.',
    scramble: 'Tocca le parole nell\'ordine giusto per ricostruire la frase che hai sentito.',
    missing: 'In questa frase manca una parola rispetto a quello che hai sentito: scrivila.',
    extra: 'In questa frase c\'è una parola in più rispetto a quello che hai sentito: toccala.',
    wrong: 'In questa frase c\'è una parola diversa da quella che hai sentito: toccala e scrivi quella giusta.',
    mc: 'Ascolta e scegli la risposta giusta.'
  };

  function shuffle(arr, rand) {
    const a = arr.slice();
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(rand() * (i + 1));
      const t = a[i]; a[i] = a[j]; a[j] = t;
    }
    return a;
  }

  function sameSeq(a, b) {
    if (a.length !== b.length) return false;
    for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return false;
    return true;
  }

  function matchCase(sample, word) {
    if (sample && sample[0] === sample[0].toUpperCase() && sample[0] !== sample[0].toLowerCase()) {
      return word[0].toUpperCase() + word.slice(1);
    }
    return word;
  }

  function findIndex(tokens, word, from) {
    const n = L.normalize(word);
    for (let i = from || 0; i < tokens.length; i++) if (tokens[i].norm === n) return i;
    return -1;
  }

  /**
   * Costruisce un esercizio dal testo di una frase.
   * opts: { lang, seed, choices } — choices permette a un modello AI (o all'insegnante) di imporre le parole scelte.
   * Ritorna { type, data } oppure null se il tipo non è applicabile alla frase.
   */
  function buildExercise(type, sentence, opts) {
    const o = Object.assign({ lang: 'it', seed: 1, choices: null }, opts || {});
    const rand = L.rng(o.seed);
    const tokens = L.tokenize(sentence);
    const ch = o.choices || {};
    if (tokens.length < 3) return null;

    if (type === 'gap' || type === 'gapbank') {
      // Almeno 3 spazi (se la frase lo permette), circa uno ogni 7 parole; parole piene, mai adiacenti, mai la prima
      let idx = [];
      if (ch.gapWords && ch.gapWords.length) {
        for (const w of ch.gapWords) { const i = findIndex(tokens, w); if (i !== -1 && idx.indexOf(i) === -1) idx.push(i); }
      }
      if (!idx.length) {
        const content = tokens.map(function (t, i) { return { i: i, t: t }; }).filter(function (x) { return x.i > 0 && L.isContent(x.t.core, o.lang); });
        const others = tokens.map(function (t, i) { return { i: i, t: t }; }).filter(function (x) { return x.i > 0 && !L.isContent(x.t.core, o.lang) && x.t.core.length >= 3; });
        const want = Math.max(3, Math.min(6, Math.round(tokens.length / 7)));
        const pick = function (cands, limit) {
          const scored = cands.map(function (x) { return { i: x.i, s: x.t.core.length + rand() * 3 }; }).sort(function (a, b) { return b.s - a.s; });
          for (const c of scored) {
            if (idx.length >= limit) break;
            if (idx.some(function (j) { return Math.abs(j - c.i) <= 1; })) continue;
            idx.push(c.i);
          }
        };
        pick(content, want);
        if (idx.length < 3) pick(others, 3);
        if (idx.length < Math.min(3, Math.floor((tokens.length - 1) / 2))) return null;
        if (!idx.length) return null;
      }
      idx.sort(function (a, b) { return a - b; });
      const answers = idx.map(function (i) { return tokens[i].core; });
      const data = { tokens: tokens.map(function (t) { return t.raw; }), gapIndices: idx, answers: answers };
      if (type === 'gapbank') {
        // banca di parole: le risposte più, se richiesto, parole sbagliate SIMILI alle risposte (stessa desinenza/lunghezza), prese dal lessico del video
        let distractors = Array.isArray(ch.distractors) ? ch.distractors.slice() : [];
        const nd = o.distractors == null ? 2 : o.distractors;
        if (!distractors.length && nd > 0 && Array.isArray(o.vocab)) {
          const used = new Set(tokens.map(function (t) { return t.norm; }));
          const pool = o.vocab.filter(function (w) { return !used.has(L.normalize(w)); });
          distractors = similarDistractors(answers, pool, nd, rand);
        }
        data.distractors = distractors;
        data.wordBank = shuffle(answers.concat(distractors), rand);
      }
      return { type: type, data: data };
    }

    if (type === 'scramble') {
      if (tokens.length > 24) return null;
      // la prima parola tiene la maiuscola e l'ultima il punto (o ? !): sono suggerimenti voluti su inizio e fine della frase;
      // la punteggiatura interna (virgole) resta fuori e ricompare a risposta giusta
      const last = tokens.length - 1;
      const words = tokens.map(function (t, i) {
        let w = t.core;
        if (i === last && /[.!?…]$/.test(t.post || '')) w += (t.post.match(/[.!?…]+$/) || [''])[0];
        return w;
      }).filter(Boolean);
      if (words.length < 3) return null;
      let sh = shuffle(words, rand), tries = 0;
      while (sameSeq(sh, words) && tries++ < 10) sh = shuffle(words, rand);
      if (sameSeq(sh, words)) sh = words.slice().reverse();
      return { type: 'scramble', data: { words: words, shuffled: sh } };
    }

    if (type === 'missing') {
      let i = -1;
      if (ch.missingWord) i = findIndex(tokens, ch.missingWord);
      if (i === -1) {
        const cands = tokens.map(function (t, j) { return j; }).filter(function (j) {
          return j > 0 && j < tokens.length - 1 && L.isContent(tokens[j].core, o.lang);
        });
        if (!cands.length) return null;
        i = cands[Math.floor(rand() * cands.length)];
      }
      return { type: 'missing', data: { tokens: tokens.map(function (t) { return t.raw; }), missingIndex: i, answer: tokens[i].core } };
    }

    if (type === 'extra') {
      const list = L.extraCandidates(o.lang);
      let word = ch.extraWord ? String(ch.extraWord).trim() : '';
      let p = -1;
      if (ch.extraAfter != null) {
        if (typeof ch.extraAfter === 'number') p = ch.extraAfter + 1;
        else { const j = findIndex(tokens, ch.extraAfter); if (j !== -1) p = j + 1; }
      }
      if (!word || p < 1 || p > tokens.length - 1) {
        let tries = 0;
        do {
          word = list[Math.floor(rand() * list.length)];
          p = 1 + Math.floor(rand() * (tokens.length - 1));
          tries++;
        } while (tries < 30 && (tokens[p - 1].norm === L.normalize(word) || (tokens[p] && tokens[p].norm === L.normalize(word))));
      }
      const shown = tokens.map(function (t) { return t.raw; });
      shown.splice(p, 0, word);
      return { type: 'extra', data: { shown: shown, extraIndex: p, extraWord: word, original: tokens.map(function (t) { return t.raw; }) } };
    }

    if (type === 'mc') {
      // scelta multipla: domanda + 4 opzioni scritte dall'insegnante o dal modello (choices); senza domanda non è costruibile
      const q = String(ch.question || '').trim();
      const opts4 = Array.isArray(ch.options) ? ch.options.map(function (x) { return String(x || '').trim(); }) : [];
      if (!q || opts4.filter(Boolean).length < 2) return null;
      const correct = Math.max(0, Math.min(opts4.length - 1, ch.correct | 0));
      const tricky = (ch.tricky == null || ch.tricky === correct) ? null : Math.max(0, Math.min(opts4.length - 1, ch.tricky | 0));
      return { type: 'mc', data: { question: q, options: opts4, correct: correct, tricky: tricky } };
    }

    if (type === 'wrong') {
      let i = -1, repl = null;
      if (ch.wrongWord) {
        i = findIndex(tokens, ch.wrongWord);
        if (i !== -1) repl = ch.wrongReplacement ? String(ch.wrongReplacement).trim() : L.swapFor(tokens[i].core, o.lang);
        if (i !== -1 && repl && L.normalize(repl) === tokens[i].norm) repl = null;
        if (!repl) i = -1;
      }
      if (i === -1) {
        const cands = tokens.map(function (t, j) { return j; }).filter(function (j) { return L.swapFor(tokens[j].core, o.lang); });
        if (!cands.length) return null;
        const mid = cands.filter(function (j) { return j > 0 && j < tokens.length - 1; });
        const pool = mid.length ? mid : cands;
        i = pool[Math.floor(rand() * pool.length)];
        repl = L.swapFor(tokens[i].core, o.lang);
      }
      const shown = tokens.map(function (t) { return t.raw; });
      shown[i] = tokens[i].pre + matchCase(tokens[i].core, repl) + tokens[i].post;
      return { type: 'wrong', data: { shown: shown, wrongIndex: i, wrongWord: repl, answer: tokens[i].core, original: tokens.map(function (t) { return t.raw; }) } };
    }
    return null;
  }

  /** Quanto una parola "assomiglia" a un'altra: stessa desinenza, stesso inizio, lunghezza simile (per distrattori credibili). */
  function similarity(a, b) {
    const x = L.normalize(a), y = L.normalize(b);
    if (!x || !y || x === y) return -1;
    let suf = 0; while (suf < Math.min(x.length, y.length) - 1 && x[x.length - 1 - suf] === y[y.length - 1 - suf]) suf++;
    let pre = 0; while (pre < Math.min(x.length, y.length) - 1 && x[pre] === y[pre]) pre++;
    const lenPenalty = Math.abs(x.length - y.length) * 0.6;
    return Math.min(suf, 4) * 1.5 + Math.min(pre, 3) * 1.2 - lenPenalty + (x[0] === y[0] ? 0.5 : 0);
  }
  /** nd parole sbagliate ma plausibili: per ogni risposta la parola del lessico più simile (mai uguale a una risposta). */
  function similarDistractors(answers, pool, nd, rand) {
    const taken = new Set(answers.map(function (a) { return L.normalize(a); }));
    const out = [];
    let k = 0, guard = 0;
    while (out.length < nd && guard++ < 50) {
      const ans = answers[k % answers.length]; k++;
      let best = null, bestS = -Infinity;
      pool.forEach(function (w) { const n = L.normalize(w); if (taken.has(n)) return; const sc = similarity(ans, w) + rand() * 0.8; if (sc > bestS) { bestS = sc; best = w; } });
      if (!best) break;
      taken.add(L.normalize(best)); out.push(best);
    }
    return out;
  }

  function eq(a, b, strict) {
    const opts = { accents: !!strict };
    return L.normalize(a, opts) === L.normalize(b, opts);
  }

  /**
   * Spazi "uniti": parole nascoste adiacenti formano un unico spazio in cui lo studente scrive tutta l'espressione.
   * Ritorna [{ indices:[i,...], answer:'parola1 parola2' }] nell'ordine della frase.
   */
  function gapRuns(d) {
    const idx = (d.gapIndices || []).slice().sort(function (a, b) { return a - b; });
    const runs = [];
    idx.forEach(function (i) {
      const last = runs[runs.length - 1];
      const ans = d.answers[d.gapIndices.indexOf(i)];
      if (last && i === last.indices[last.indices.length - 1] + 1) { last.indices.push(i); last.answer += ' ' + ans; }
      else runs.push({ indices: [i], answer: ans });
    });
    return runs;
  }

  /** Corregge una risposta. Ritorna { correct, detail }. */
  function check(exercise, answer, opts) {
    const strict = !!(opts && opts.strict);
    const d = exercise.data;
    switch (exercise.type) {
      case 'gap':
      case 'gapbank': {
        const arr = Array.isArray(answer) ? answer : [answer];
        const runs = gapRuns(d);
        if (runs.length !== d.gapIndices.length && arr.length === runs.length) {
          // risposte per spazio unito (una per gruppo di parole adiacenti)
          const perRun = runs.map(function (r, k) { return eq(arr[k] || '', r.answer, strict); });
          return { correct: perRun.every(Boolean), detail: perRun };
        }
        const per = d.answers.map(function (a, i) { return eq(arr[i] || '', a, strict); });
        return { correct: per.every(Boolean), detail: per };
      }
      case 'scramble': {
        const arr = Array.isArray(answer) ? answer : String(answer || '').split(/\s+/);
        const got = arr.map(function (w) { return L.normalize(w, { accents: strict }); });
        const want = d.words.map(function (w) { return L.normalize(w, { accents: strict }); });
        return { correct: sameSeq(got, want), detail: got.map(function (w, i) { return w === want[i]; }) };
      }
      case 'missing':
        return { correct: eq(answer || '', d.answer, strict), detail: null };
      case 'mc':
        return { correct: Number(answer) === d.correct, detail: null };
      case 'extra':
        return { correct: Number(answer) === d.extraIndex, detail: null };
      case 'wrong': {
        const a = answer || {};
        const okIdx = Number(a.index) === d.wrongIndex;
        const okWord = eq(a.correction || '', d.answer, strict);
        return { correct: okIdx && okWord, detail: { index: okIdx, word: okWord } };
      }
    }
    return { correct: false, detail: null };
  }

  /** Testo "soluzione" leggibile. */
  function solution(exercise) {
    const d = exercise.data;
    switch (exercise.type) {
      case 'gap': case 'gapbank': return d.answers.join(', ');
      case 'scramble': return d.words.join(' ');
      case 'missing': return d.answer;
      case 'mc': return d.options[d.correct];
      case 'extra': return d.extraWord;
      case 'wrong': return d.wrongWord + ' → ' + d.answer;
    }
    return '';
  }

  return { LABELS: LABELS, INSTRUCTIONS: INSTRUCTIONS, buildExercise: buildExercise, check: check, solution: solution, shuffle: shuffle, gapRuns: gapRuns, similarity: similarity, similarDistractors: similarDistractors };
});
