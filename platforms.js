/* platforms.js — "Importa da altre piattaforme" (v120): converte una lezione fatta altrove nel formato PauseLearn.
   Oggi: ISLCollective (video-lezioni) e, dalla v126, Wayground/Quizizz (quiz → set di esercizi). Il pulsante dei preferiti (bookmarklet.js) legge la pagina della lezione e apre
   l'app con #platform=…; qui il payload diventa una lezione (esercizi, tempi, tagli). Modulo puro: browser + Node (test). */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory(require('./lang.js'), require('./exercises.js'));
  else root.VLPlat = factory(root.VLLang, root.VLEx);
})(typeof self !== 'undefined' ? self : this, function (L, EX) {
  'use strict';

  const PLATFORMS = {
    islcollective: { name: 'ISLCollective', host: /(^|\.)islcollective\.com$/i, kinds: ['video-lezioni'] },
    wayground: { name: 'Wayground', host: /(^|\.)(wayground|quizizz)\.com$/i, kinds: ['quiz'] }
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
    // Q_MULTI_SELECT (ISL): options[{text, right}]. PauseLearn ha UNA risposta giusta: con più "right" non si converte
    // (verrebbe un esercizio che segna sbagliata una risposta giusta), va in skipped.
    const opts = d.options || d.answers;
    if (Array.isArray(opts) && opts.length >= 2) {
      const options = opts.map(function (o) { return clean(typeof o === 'string' ? o : (o.text || o.answer || o.label)); });
      const rights = [];
      opts.forEach(function (o, k) { if (o && typeof o === 'object' && (o.right || o.correct || o.isCorrect)) rights.push(k); });
      if (d.correctAnswer != null && !isNaN(+d.correctAnswer)) rights.push(+d.correctAnswer);
      if (rights.length !== 1) return null;
      const question = clean(q.question || d.question);
      const b = EX.buildExercise('mc', 'x x x', { choices: { question: question, options: options, correct: rights[0] } });
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


  /* ---------- Wayground (ex Quizizz), v126 ----------
     Nessun video: un quiz diventa un SET di esercizi (ls.chal.items, lo stesso della Sfida in classe), che si assegna
     come compito o si gioca in classe. Il bookmarklet, sulla pagina del quiz (wayground.com/…/quiz/<24 hex>), chiede
     /api/main/quiz/<id> con la sessione dell'insegnante e passa wgSlim. Tipi: BLANK (frase con <blank id>) → gap con
     lo spazio ESATTO dove l'ha messo l'autore; BLANK senza <blank> (domanda + risposta scritta) → gap in coda alla
     domanda; MCQ → mc; MSQ con una sola giusta → mc. Il resto (abbinamenti, ordina, disegno, aperte…) → skipped.
     ignoreAccentMarksForEvaluation false (il default) → item.strict: gli accenti contano, come su Wayground. */
  const ENT = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', egrave: 'è', eacute: 'é', agrave: 'à', ograve: 'ò', ugrave: 'ù', igrave: 'ì', Egrave: 'È', rsquo: '’', lsquo: '‘', hellip: '…' };
  function htmlText(h) {
    return String(h || '')
      .replace(/<br\s*\/?>/gi, ' ').replace(/<\/p>\s*<p[^>]*>/gi, ' ')
      .replace(/<[^>]+>/g, '')
      .replace(/&#(\d+);/g, function (m, n) { return String.fromCharCode(+n); })
      .replace(/&#x([0-9a-f]+);/gi, function (m, n) { return String.fromCharCode(parseInt(n, 16)); })
      .replace(/&([a-z]+);/gi, function (m, n) { return ENT[n] != null ? ENT[n] : m; })
      .replace(/\s+/g, ' ').trim();
  }
  /** Riduce la risposta di /api/main/quiz/<id> al necessario (stessa logica duplicata nel bookmarklet). */
  function wgSlim(apiData) {
    const q = apiData && (apiData.quiz || (apiData.data && apiData.data.quiz));
    const info = q && q.info;
    if (!info || !Array.isArray(info.questions)) return null;
    return {
      site: 'wayground', id: String(q._id || ''), title: clean(info.name), language: info.lang || '',
      questions: info.questions.map(function (x) {
        const st = x.structure || {};
        return { id: String(x._id || ''), type: x.type, html: (st.query && st.query.text) || '',
          options: (st.options || []).map(function (o) { return { id: String(o.id || o._id || ''), text: o.text || '' }; }),
          answer: st.answer, explain: (st.explain && st.explain.text) || '',
          accents: !!(st.settings && st.settings.ignoreAccentMarksForEvaluation) };
      })
    };
  }
  function wgItem(q, lang, uid) {
    const id = 'i' + uid();
    const strict = !q.accents;
    const explain = htmlText(q.explain);
    const base = function (it) { it.id = id; it.src = 'wayground:' + q.id; if (strict) it.strict = true; if (explain) it.explain = explain; return it; };
    const optText = function (oid) { const o = (q.options || []).find(function (x) { return x.id === String(oid); }); return o ? htmlText(o.text) : ''; };
    if (q.type === 'BLANK') {
      const MARK = '\u0001';
      const marked = String(q.html || '').replace(/<blank[^>]*id="([^"]+)"[^>]*>\s*<\/blank>/gi, function (m, b) { return ' ' + MARK + b + MARK + ' '; });
      const ans = {};
      (Array.isArray(q.answer) ? q.answer : []).forEach(function (a) { if (a && a.targetId) ans[a.targetId] = optText([].concat(a.optionId || [])[0]); });
      const text = htmlText(marked);
      const tokens = [], idx = [];
      if (text.indexOf(MARK) !== -1) {
        let ok = true;
        text.split(MARK).forEach(function (part, k) {
          if (k % 2 === 1) {
            const a = clean(ans[part] || '');
            if (!a) { ok = false; return; }
            toks(a).forEach(function (t) { idx.push(tokens.length); tokens.push(t); });
            return;
          }
          toks(part).forEach(function (t) {
            // punteggiatura staccata dopo uno spazio ("lavora ." ) si riattacca alla parola prima
            if (tokens.length && idx.indexOf(tokens.length - 1) === -1 && /^[.,;:!?…)»]+$/.test(t.raw)) { const last = tokens[tokens.length - 1]; tokens[tokens.length - 1] = L.tokenize(last.raw + t.raw)[0]; return; }
            tokens.push(t);
          });
        });
        if (!ok || !idx.length) return null;
      } else {
        // vecchio "fill in the blank" di Quizizz: la domanda e poi la risposta da scrivere
        const a = clean(optText((q.options || [])[0] && q.options[0].id) || '');
        if (!a || !text) return null;
        toks(text).forEach(function (t) { tokens.push(t); });
        toks(a).forEach(function (t) { idx.push(tokens.length); tokens.push(t); });
      }
      if (tokens.length < 2) return null;
      return base({ kind: 'gap', sentence: raw(tokens).join(' '), data: { tokens: raw(tokens), gapIndices: idx, answers: idx.map(function (i) { return tokens[i].core; }) } });
    }
    if (q.type === 'MCQ' || q.type === 'MSQ') {
      const options = (q.options || []).map(function (o) { return htmlText(o.text); });
      if (options.length < 2 || options.some(function (o) { return !o; })) return null;   // risposte solo-immagine: non si portano
      const rights = [].concat(q.answer == null ? [] : q.answer).map(Number).filter(function (n) { return !isNaN(n) && n >= 0 && n < options.length; });
      if (rights.length !== 1) return null;
      const question = htmlText(q.html);
      if (!question) return null;
      const b = EX.buildExercise('mc', 'x x x', { choices: { question: question, options: options, correct: rights[0] } });
      return b ? base({ kind: 'mc', sentence: '', data: b.data }) : null;
    }
    return null;
  }
  /** Payload wgSlim → { set: {title, items, importedFrom}, skipped }. */
  function fromWayground(p, opts) {
    opts = opts || {};
    const uid = opts.uid || function () { return Math.random().toString(36).slice(2, 9); };
    const items = [], skipped = [];
    (p.questions || []).forEach(function (q, k) {
      const it = wgItem(q, opts.lang || 'it', uid);
      if (it) items.push(it); else skipped.push({ n: k + 1, type: q.type });
    });
    return { set: { title: clean(p.title), items: items, lang: opts.lang || 'it', importedFrom: { site: 'wayground', id: String(p.id || ''), url: p.id ? 'https://wayground.com/admin/quiz/' + p.id : '', at: new Date().toISOString() } }, skipped: skipped };
  }

  /** v122: lingua di studio rilevata dalle frasi (parole funzionali per lingua: L.stopwords). Il campo `language` di
   *  ISLCollective NON è affidabile (dice "en" anche per una lezione in italiano: è la lingua del sito, non del video).
   *  Restituisce {lang, score:{it:n,en:n}, sure:bool}; sure = una lingua ha almeno il doppio dell'altra e ≥ 5 parole. */
  function detectLanguage(payload, langs) {
    langs = langs || ['it', 'en'];
    const text = (payload.questions || []).map(function (q) {
      const d = q.data || {};
      if (q.html != null) return htmlText(q.html) + ' ' + (q.options || []).map(function (o) { return htmlText(o.text); }).join(' ');   // Wayground
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
    if (payload.site === 'wayground') return fromWayground(payload, opts);
    throw new Error('piattaforma non supportata: ' + payload.site);
  }

  return { PLATFORMS: PLATFORMS, islSlim: islSlim, fromISL: fromISL, wgSlim: wgSlim, fromWayground: fromWayground, htmlText: htmlText, convert: convert, detectLanguage: detectLanguage };
});
