/* platforms.js — "Importa da altre piattaforme" (v120): converte una lezione fatta altrove nel formato PauseLearn.
   Oggi: ISLCollective (video-lezioni). Il pulsante dei preferiti (bookmarklet.js) legge la pagina della lezione e apre
   l'app con #platform=…; qui il payload diventa una lezione (esercizi, tempi, tagli). Modulo puro: browser + Node (test). */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory(require('./lang.js'), require('./exercises.js'));
  else root.VLPlat = factory(root.VLLang, root.VLEx);
})(typeof self !== 'undefined' ? self : this, function (L, EX) {
  'use strict';

  const PLATFORMS = {
    islcollective: { name: 'ISLCollective', host: /(^|\.)islcollective\.com$/i, kinds: ['video-lezioni'] }
  };

  /* ---------- ISLCollective ----------
     Nella pagina della video-lezione i dati sono in <script id="__NEXT_DATA__"> →
     props.pageProps.initialState.resource.resourceProfile.resource. Il bookmarklet ne prende solo il necessario
     (islSlim). Tipi ISL → PauseLearn: Q_CORRECT_THE_WRONG_WORD → wrong, Q_FIND_THE_EXTRA_WORD → extra,
     Q_GAP_FILL → gap (buchi a più parole = una casella sola, come i "run" di gapRuns), Q_SORTABLE → scramble,
     scelta multipla → mc. `time` è la pausa (fine frase), `hint` l'inizio del riascolto. `skips` → tagli. */
  const PH = '#***#';
  function clean(s) { return String(s || '').replace(/\s+/g, ' ').trim(); }
  function toks(s) { return L.tokenize(clean(s)); }
  function raw(tk) { return tk.map(function (x) { return x.raw; }); }

  /** Riduce la risorsa ISL a un payload piccolo (sta in un URL): usato dal bookmarklet. */
  function islSlim(res) {
    if (!res || !Array.isArray(res.questions)) return null;
    return {
      site: 'islcollective', id: String(res.resourceId || res.id || ''), url: res.frontendUrl || '',
      title: clean(res.videoTitle || res.title || res.headline), videoUrl: res.videoUrl || '', language: res.language || '',
      duration: res.duration || res.videoLength || 0, level: (((res.levels || [])[0] || {}).text || ''),
      skips: (res.skips || []).map(function (s) { return { start: s.start, end: s.end }; }),
      questions: res.questions.filter(function (q) { return q && !q.hidden; }).map(function (q) {
        return { type: q.questionType, time: q.time, hint: q.hint, question: q.question || '', data: q.questionData || {} };
      })
    };
  }

  function islExercise(q, lang) {
    const d = q.data || {};
    const t = q.type;
    if (t === 'Q_CORRECT_THE_WRONG_WORD' && d.sentence && d.answer) {
      const sentence = clean(d.sentence.replace(PH, d.answer));
      const i = toks(d.sentence.split(PH)[0]).length;
      const tk = toks(sentence);
      if (!tk[i] || tk[i].norm !== L.normalize(d.answer) || !d.fakeWord) return null;
      const shown = raw(tk);
      const fake = clean(d.fakeWord);
      const repl = /^\p{Lu}/u.test(tk[i].core) ? fake.charAt(0).toUpperCase() + fake.slice(1) : fake;
      shown[i] = tk[i].pre + repl + tk[i].post;
      return { type: 'wrong', sentence: sentence, data: { shown: shown, wrongIndex: i, wrongWord: fake, answer: tk[i].core, original: raw(tk) } };
    }
    if (t === 'Q_FIND_THE_EXTRA_WORD' && d.sentence) {
      const word = clean(d.extraWord && (d.extraWord.text || d.extraWord));
      const sentence = clean(d.sentence.replace(PH, ''));
      const p = toks(d.sentence.split(PH)[0]).length;
      const tk = toks(sentence);
      if (!word || p < 1 || p > tk.length - 1) return null;
      const shown = raw(tk);
      shown.splice(p, 0, word);
      return { type: 'extra', sentence: sentence, data: { shown: shown, extraIndex: p, extraWord: word, original: raw(tk) } };
    }
    if (t === 'Q_GAP_FILL' && Array.isArray(d.parts)) {
      const tokens = [], idx = [];
      d.parts.forEach(function (p) { toks(p.part).forEach(function (x) { if (p.gap) idx.push(tokens.length); tokens.push(x); }); });
      if (!idx.length || tokens.length < 3) return null;
      return { type: 'gap', sentence: raw(tokens).join(' '), data: { tokens: raw(tokens), gapIndices: idx, answers: idx.map(function (i) { return tokens[i].core; }) } };
    }
    if (t === 'Q_SORTABLE' && d.sentence) {
      const sentence = clean(d.sentence);
      const b = EX.buildExercise('scramble', sentence, { lang: lang, seed: 7 });
      return b ? { type: 'scramble', sentence: sentence, data: b.data } : null;
    }
    const opts = d.options || d.answers;
    if (Array.isArray(opts) && opts.length >= 2) {
      const options = opts.map(function (o) { return clean(typeof o === 'string' ? o : (o.text || o.answer || o.label)); });
      let correct = 0;
      opts.forEach(function (o, k) { if (o && typeof o === 'object' && (o.correct || o.isCorrect)) correct = k; });
      if (d.correctAnswer != null && !isNaN(+d.correctAnswer)) correct = +d.correctAnswer;
      const question = clean(q.question || d.question);
      const b = EX.buildExercise('mc', 'x x x', { choices: { question: question, options: options, correct: correct } });
      return b ? { type: 'mc', sentence: question, data: b.data } : null;
    }
    return null;
  }

  /** Payload (islSlim) → campi della lezione PauseLearn + elenco di ciò che non si è potuto convertire. */
  function fromISL(p, opts) {
    opts = opts || {};
    const lang = opts.lang || 'it';
    const uid = opts.uid || function () { return Math.random().toString(36).slice(2, 9); };
    const skipped = [];
    const exercises = [];
    (p.questions || []).forEach(function (q, k) {
      const b = islExercise(q, lang);
      if (!b) { skipped.push({ n: k + 1, type: q.type, time: q.time }); return; }
      const end = Math.round((q.time || 0) * 10) / 10;
      const start = (q.hint != null && q.hint < q.time) ? Math.round(q.hint * 10) / 10 : Math.max(0, end - 8);
      exercises.push({ id: 'e' + uid(), chunkId: null, chunkIds: [], type: b.type, sentence: b.sentence, segment: { start: start, end: end }, markerTime: end, data: b.data, source: 'rules', range: null, reviewed: true });
    });
    exercises.sort(function (a, b) { return a.markerTime - b.markerTime; });
    let videoId = '';
    const m = String(p.videoUrl || '').match(/[?&]v=([\w-]{6,})|youtu\.be\/([\w-]{6,})|\/embed\/([\w-]{6,})/);
    if (m) videoId = m[1] || m[2] || m[3];
    const cuts = (p.skips || []).filter(function (s) { return s && s.end > s.start; }).map(function (s) { return { start: s.start, end: s.end }; });
    const lv = String(p.level || '').match(/\b([ABC][12])\b/);
    return {
      lesson: {
        title: clean(p.title), videoId: videoId, videoUrl: p.videoUrl || '', lang: lang, level: lv ? lv[1] : 'B1',
        duration: p.duration || 0, lines: [], chunks: [], exercises: exercises, cuts: cuts,
        params: { n: exercises.length, types: ['gap', 'gapbank', 'scramble', 'missing', 'extra', 'wrong', 'mc'], range: 'smart', ai: false },
        importedFrom: { site: 'islcollective', id: String(p.id || ''), url: p.url ? 'https://en.islcollective.com/english-esl-video-lessons' + p.url : '', at: new Date().toISOString() }
      },
      skipped: skipped
    };
  }

  /** v122: lingua di studio rilevata dalle frasi (parole funzionali per lingua: L.stopwords). Il campo `language` di
   *  ISLCollective NON è affidabile (dice "en" anche per una lezione in italiano: è la lingua del sito, non del video).
   *  Restituisce {lang, score:{it:n,en:n}, sure:bool}; sure = una lingua ha almeno il doppio dell'altra e ≥ 5 parole. */
  function detectLanguage(payload, langs) {
    langs = langs || ['it', 'en'];
    const text = (payload.questions || []).map(function (q) {
      const d = q.data || {};
      if (Array.isArray(d.parts)) return d.parts.map(function (p) { return p.part; }).join(' ');
      return [d.sentence, q.question, d.question].filter(Boolean).join(' ');
    }).join(' ') + ' ' + (payload.title || '');
    const ws = L.words(text);
    const score = {};
    langs.forEach(function (l) { const sw = L.stopwords(l); score[l] = ws.filter(function (w) { return sw.has(w); }).length; });
    const sorted = langs.slice().sort(function (a, b) { return score[b] - score[a]; });
    const best = sorted[0], second = sorted[1];
    const sure = score[best] >= 5 && (second == null || score[best] >= 2 * score[second]);
    return { lang: best, score: score, sure: sure };
  }

  /** Punto d'ingresso unico: payload con .site → lezione. */
  function convert(payload, opts) {
    if (!payload || !payload.site) throw new Error('piattaforma non indicata');
    if (payload.site === 'islcollective') return fromISL(payload, opts);
    throw new Error('piattaforma non supportata: ' + payload.site);
  }

  return { PLATFORMS: PLATFORMS, islSlim: islSlim, fromISL: fromISL, convert: convert, detectLanguage: detectLanguage };
});
