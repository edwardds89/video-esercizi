/* generator.js — parser della trascrizione, chunk, punteggi, selezione esercizi e piano dei tagli (browser + Node) */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory(require('./lang.js'), require('./exercises.js'));
  else root.VLGen = factory(root.VLLang, root.VLEx);
})(typeof self !== 'undefined' ? self : this, function (L, EX) {
  'use strict';

  const TYPE_RANGES = { gap: [18, 40], gapbank: [12, 30], scramble: [5, 12], missing: [8, 20], extra: [8, 20], wrong: [8, 20] };
  // Lunghezze consigliate per tipo ("smart"): fill the gaps su frasi di 25-30 parole, gli altri più corti
  const SMART_RANGES = { gap: [22, 32], gapbank: [18, 30], scramble: [7, 12], missing: [10, 20], extra: [10, 20], wrong: [10, 20] };
  const ALL_TYPES = ['gap', 'gapbank', 'scramble', 'missing', 'extra', 'wrong'];
  const DEFAULT_TYPES = ['gap', 'scramble', 'missing', 'extra', 'wrong'];

  function capFirst(text) {
    const t = String(text || '').trim();
    const m = t.match(/^([^\p{L}]*)(\p{L})/u);
    if (!m) return t;
    return t.slice(0, m[1].length) + m[2].toUpperCase() + t.slice(m[1].length + m[2].length);
  }
  /** Lessico del video (parole piene, per i distrattori): più frequenti prima. */
  function vocabulary(chunks, lang) {
    const f = {};
    const orig = {};
    for (const c of chunks) for (const t of c.tokens || []) {
      if (!t.norm || t.core.length < 4 || !L.isContent(t.core, lang || 'it')) continue;
      f[t.norm] = (f[t.norm] || 0) + 1;
      if (!orig[t.norm]) orig[t.norm] = t.core.toLowerCase();
    }
    return Object.keys(f).sort(function (a, b) { return f[b] - f[a]; }).map(function (k) { return orig[k]; });
  }
  function resolveRange(range, type) {
    if (range === 'smart') return SMART_RANGES[type] || SMART_RANGES.gap;
    if (Array.isArray(range) && range.length === 2) return range;
    return null;
  }

  // ---------- 1. Parser della trascrizione ----------

  const TS_ONLY = /^(\d{1,2}):(\d{2})(?::(\d{2}))?$/;
  const TS_INLINE = /^[\[(]?(\d{1,2}:\d{2}(?::\d{2})?)[\])]?\s*[-–—:]?\s+(.+)$/;
  const SRT_RANGE = /^(\d{1,2}:\d{2}:\d{2}[.,]\d{1,3})\s*-->\s*(\d{1,2}:\d{2}:\d{2}[.,]\d{1,3})/;
  const VTT_RANGE = /^(\d{1,2}:\d{2}[.,]\d{1,3})\s*-->\s*(\d{1,2}:\d{2}[.,]\d{1,3})/;

  function tsToSec(s) {
    const p = s.replace(',', '.').split(':').map(Number);
    if (p.length === 3) return p[0] * 3600 + p[1] * 60 + p[2];
    if (p.length === 2) return p[0] * 60 + p[1];
    return p[0];
  }

  function cleanText(t) {
    return String(t || '').replace(/<[^>]+>/g, '').replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&gt;/g, '>').replace(/&lt;/g, '<')
      .replace(/\[[^\]]{1,40}\]/g, ' ')   // [musica], [applausi], [Music]... anche in mezzo alla riga
      .replace(/\s+/g, ' ').trim();
  }
  const SKIP_ROW = /^#?\s*(chapter|capitolo|kapitel|chapitre|cap[ií]tulo)\s*\d+\s*[:.\-–]/i;
  const DURATION_ROW = /^\d+\s+(seconds?|secondi|second[oi]|minutes?|minut[oi]|hours?|or[ae])\b/i;

  /**
   * Riconosce: pannello "Mostra trascrizione" di YouTube (timestamp su una riga e testo sulla successiva, oppure "0:12 testo"),
   * SRT, WebVTT, "[0:12] testo". Restituisce { lines: [{start,end,text}], format }.
   */
  function parseTranscript(raw) {
    const text = String(raw || '').replace(/\r\n?/g, '\n').replace(/ /g, ' ');
    const rows = text.split('\n').map(function (r) { return r.trim(); });
    let lines = [];
    let format = 'unknown';

    const hasSrt = rows.some(function (r) { return SRT_RANGE.test(r) || VTT_RANGE.test(r); });
    if (hasSrt) {
      format = rows[0].toUpperCase().indexOf('WEBVTT') === 0 ? 'vtt' : 'srt';
      let cur = null;
      for (const r of rows) {
        const m = r.match(SRT_RANGE) || r.match(VTT_RANGE);
        if (m) {
          if (cur) lines.push(cur);
          cur = { start: tsToSec(m[1]), end: tsToSec(m[2]), text: '' };
        } else if (cur) {
          if (r === '') { lines.push(cur); cur = null; }
          else if (!/^\d+$/.test(r)) cur.text = (cur.text + ' ' + cleanText(r)).trim();
        }
      }
      if (cur) lines.push(cur);
    } else {
      format = 'youtube';
      let cur = null, extra = 0;
      for (const r of rows) {
        if (r === '' || SKIP_ROW.test(r) || DURATION_ROW.test(r)) continue;
        let m = r.match(TS_ONLY);
        if (m) {
          if (cur) lines.push(cur);
          cur = { start: tsToSec(r), end: null, text: '' };
          extra = 0;
          continue;
        }
        m = r.match(TS_INLINE);
        if (m) {
          if (cur) lines.push(cur);
          cur = { start: tsToSec(m[1]), end: null, text: cleanText(m[2]) };
          extra = 1;
          continue;
        }
        if (!cur) continue; // intestazioni prima del primo timestamp ("Trascrizione", titolo capitolo...)
        if (extra === 0) { cur.text = cleanText(r); extra = 1; }
        else {
          // Riga aggiuntiva: probabile titolo di capitolo se corta, altrimenti testo andato a capo
          const wc = L.words(r).length;
          if (wc > 8) cur.text = (cur.text + ' ' + cleanText(r)).trim();
        }
      }
      if (cur) lines.push(cur);
    }

    lines = lines.filter(function (l) { return typeof l.start === 'number' && !isNaN(l.start); });
    // Trascrizione incollata (o letta) due volte di seguito: i tempi ripartono da capo → tieni la prima copia
    for (let i = 1; i < lines.length; i++) {
      if (lines[i].start < lines[i - 1].start - 60 && i >= lines.length * 0.4 && lines[i].text === lines[0].text) { lines = lines.slice(0, i); break; }
    }
    lines.sort(function (a, b) { return a.start - b.start; });
    // Righe identiche (stesso tempo, stesso testo) → una sola
    lines = lines.filter(function (l, i) { return !(i > 0 && lines[i - 1].start === l.start && lines[i - 1].text === l.text); });
    // Velocità di parlato stimata sull'intera trascrizione (il pannello YouTube dà solo secondi interi e nessuna fine riga)
    let totalWords = 0;
    lines.forEach(function (l) { totalWords += L.words(l.text).length; });
    const span = lines.length > 1 ? lines[lines.length - 1].start - lines[0].start : 0;
    const wps = span > 10 ? Math.min(4, Math.max(1.2, totalWords / span * 1.08)) : 2.4;
    for (let i = 0; i < lines.length; i++) {
      const l = lines[i], nx = lines[i + 1];
      if (L.isNoise(l.text)) l.text = cleanText(l.text);
      l.noise = l.text === '';
      if (l.end == null || l.end <= l.start) {
        const est = Math.max(0.8, L.words(l.text).length / wps);
        l.end = nx ? Math.min(nx.start, l.start + est) : l.start + est;
        if (nx && nx.start - l.start < 0.3) l.end = nx.start;
        l.estimated = true;
      }
      if (l.end <= l.start) l.end = l.start + 0.5;
    }
    if (!lines.length) format = 'unknown';
    return { lines: lines, format: format };
  }

  // ---------- 2. Chunk (unità di senso approssimate) ----------

  function silenceChunk(start, end) {
    return { start: start, end: end, text: '', lines: [], tokens: [], wordCount: 0, silence: true };
  }
  function chunkFromWords(ws) {
    const text = ws.map(function (x) { return x.w; }).join(' ').trim();
    const tokens = L.tokenize(text);
    return { start: ws[0].start, end: ws[ws.length - 1].end, text: text, lines: [], words: ws.map(function (x) { return { start: x.start, end: x.end }; }), tokens: tokens, wordCount: tokens.length };
  }
  /** Parole con tempi stimati (distribuite uniformemente dentro la riga), più marcatori di silenzio. */
  function wordStream(lines) {
    const out = [];
    lines.forEach(function (l, i) {
      if (l.noise) { out.push({ silence: true, start: l.start, end: l.end }); return; }
      const ws = String(l.text).split(/\s+/).filter(Boolean);
      const d = (l.end - l.start) / Math.max(1, ws.length);
      ws.forEach(function (w, k) { out.push({ w: w, start: l.start + k * d, end: l.start + (k + 1) * d, line: i }); });
    });
    return out;
  }
  function hasPunctuation(lines) {
    const text = lines.map(function (l) { return l.text; }).join(' ');
    const words = L.words(text).length;
    const marks = (text.match(/[.!?…]+(\s|$)/g) || []).length;
    return words >= 20 && marks / words >= 1 / 30;
  }
  const SENT_END = /[.!?…]+["'»)\]]*$/;

  /** Modalità "frasi": trascrizione con punteggiatura → una frase per chunk, con tempi per parola interpolati. */
  function sentenceChunks(lines, o) {
    const stream = wordStream(lines);
    const chunks = [];
    let cur = [];
    const flush = function () { if (cur.length) { chunks.push(chunkFromWords(cur)); cur = []; } };
    for (let i = 0; i < stream.length; i++) {
      const it = stream[i];
      const prev = stream[i - 1];
      if (it.silence) { flush(); if (it.end - it.start >= 0.3) chunks.push(silenceChunk(it.start, it.end)); continue; }
      if (prev && !prev.silence && it.start - prev.end >= o.silenceMin) { flush(); chunks.push(silenceChunk(prev.end, it.start)); }
      cur.push(it);
      if (SENT_END.test(it.w) && !/^\d+[.,]$/.test(it.w)) flush();
    }
    flush();
    // Frasi troppo lunghe: dividi alla virgola/punto e virgola più vicina al centro, altrimenti a metà
    const CONJ = { it: ['e', 'ma', 'però', 'quindi', 'cioè', 'perché', 'che', 'mentre', 'oppure', 'o', 'anche', 'poi', 'allora', 'infatti', 'invece'],
      en: ['and', 'but', 'because', 'so', 'which', 'while', 'or', 'that', 'then', 'also', 'when'] };
    const conj = new Set((CONJ[o.lang] || CONJ.it).map(function (w) { return L.normalize(w); }));
    const hardMax = o.maxWords + 10;
    function splitLong(c) {
      if (c.wordCount <= o.maxWords) return [c];
      const raw = c.text.split(/\s+/);
      const ws = c.words.map(function (t, k) { return { w: raw[k], start: t.start, end: t.end }; });
      const mid = ws.length / 2;
      let best = -1, bestCost = Infinity;
      for (let k = o.minWords - 1; k < ws.length - o.minWords; k++) {
        let weight = 0;
        if (/[,;:]["'»)]*$/.test(ws[k].w) || /[-–—]$/.test(ws[k].w)) weight = 1;          // taglio dopo una virgola
        else if (conj.has(L.normalize(ws[k + 1].w))) weight = 0.6;                      // taglio prima di una congiunzione
        if (!weight) continue;
        const cost = Math.abs(k + 1 - mid) / weight;
        if (cost < bestCost) { bestCost = cost; best = k; }
      }
      const tolerated = best !== -1 && Math.abs(best + 1 - mid) <= mid * 0.7;
      if (!tolerated) {
        if (ws.length <= hardMax) return [c];      // meglio una frase un po' lunga che spezzata a metà clausola
        best = Math.floor(mid) - 1;
      }
      if (best < o.minWords - 1 || ws.length - best - 1 < o.minWords) return [c];
      return splitLong(chunkFromWords(ws.slice(0, best + 1))).concat(splitLong(chunkFromWords(ws.slice(best + 1))));
    }
    const out = [];
    chunks.forEach(function (c) { if (c.silence) out.push(c); else splitLong(c).forEach(function (x) { out.push(x); }); });
    return out;
  }

  /** Modalità "pause": senza punteggiatura → spezza alle pause tra le righe (ricorsivamente alla pausa più marcata). */
  function pauseChunks(lines, o) {
    const segs = [];
    let cur = null, prevEnd = 0;
    function close() { if (cur && cur.lines.length) segs.push(cur); cur = null; }
    function silence(start, end) { if (end - start >= 0.3) segs.push({ silence: true, start: start, end: end }); }
    for (let i = 0; i < lines.length; i++) {
      const l = lines[i];
      if (l.start - prevEnd >= o.silenceMin) { close(); silence(prevEnd, l.start); }
      if (l.noise) { close(); silence(l.start, l.end); prevEnd = Math.max(prevEnd, l.end); continue; }
      if (!cur) cur = { lines: [] };
      cur.lines.push({ start: l.start, end: l.end, text: l.text });
      const nx = lines[i + 1];
      const gapToNext = nx ? nx.start - l.end : 99;
      if (L.endsWithPunct(l.text) || gapToNext >= o.pauseBreak || !nx) close();
      prevEnd = Math.max(prevEnd, l.end);
    }
    close();
    const wcOf = function (ls) { return ls.reduce(function (s, l) { return s + L.words(l.text).length; }, 0); };
    function split(ls) {
      const total = wcOf(ls);
      if (total <= o.maxWords || ls.length < 2) return [ls];
      let best = -1, bestGap = -1, bestDist = Infinity, acc = 0;
      for (let k = 0; k < ls.length - 1; k++) {
        acc += L.words(ls[k].text).length;
        if (acc < o.minWords || total - acc < o.minWords) continue;
        const gap = ls[k + 1].start - ls[k].end;
        const dist = Math.abs(acc - total / 2);
        if (gap > bestGap + 0.05 || (Math.abs(gap - bestGap) <= 0.05 && dist < bestDist)) { best = k; bestGap = gap; bestDist = dist; }
      }
      if (best === -1) return [ls];
      if (bestGap < 0.15) {
        acc = 0; best = -1; bestDist = Infinity;
        for (let k = 0; k < ls.length - 1; k++) {
          acc += L.words(ls[k].text).length;
          if (acc < o.minWords || total - acc < o.minWords) continue;
          const dist = Math.abs(acc - total / 2);
          if (dist < bestDist) { best = k; bestDist = dist; }
        }
        if (best === -1) return [ls];
      }
      return split(ls.slice(0, best + 1)).concat(split(ls.slice(best + 1)));
    }
    const chunks = [];
    for (const sg of segs) {
      if (sg.silence) { chunks.push(silenceChunk(sg.start, sg.end)); continue; }
      for (const part of split(sg.lines)) {
        const text = part.map(function (l) { return l.text; }).join(' ').trim();
        const tokens = L.tokenize(text);
        chunks.push({ start: part[0].start, end: part[part.length - 1].end, text: text, lines: part, tokens: tokens, wordCount: tokens.length });
      }
    }
    return chunks;
  }

  function buildChunks(lines, opts) {
    const o = Object.assign({ maxWords: 16, minWords: 4, pauseBreak: 1.0, silenceMin: 2.5, duration: null, lang: 'it', mode: 'auto' }, opts || {});
    const mode = o.mode === 'auto' ? (hasPunctuation(lines) ? 'sentences' : 'pauses') : o.mode;
    const chunks = mode === 'sentences' ? sentenceChunks(lines, o) : pauseChunks(lines, o);

    // Fonde i chunk minuscoli (1-2 parole) con il precedente parlato se contiguo
    const merged = [];
    for (const c of chunks) {
      const prev = merged[merged.length - 1];
      if (!c.silence && c.wordCount <= 2 && prev && !prev.silence && c.start - prev.end < 0.8 && prev.wordCount < o.maxWords + 4) {
        prev.text = (prev.text + ' ' + c.text).trim();
        prev.end = c.end;
        if (prev.words && c.words) prev.words = prev.words.concat(c.words); else { prev.lines = (prev.lines || []).concat(c.lines || []); prev.words = null; }
        prev.tokens = L.tokenize(prev.text);
        prev.wordCount = prev.tokens.length;
      } else merged.push(c);
    }

    if (o.duration && merged.length && o.duration - merged[merged.length - 1].end >= o.silenceMin) {
      merged.push(silenceChunk(merged[merged.length - 1].end, o.duration));
    }
    merged.forEach(function (c, i) {
      c.id = 'c' + (i + 1);
      c.gapAfter = merged[i + 1] ? Math.max(0, merged[i + 1].start - c.end) : 99;
      c.cta = !c.silence && L.hasCTA(c.text, o.lang);
      c.mode = mode;
    });
    return merged;
  }

  /** Tempo stimato di ogni parola di un chunk (parole distribuite uniformemente nella riga di appartenenza). */
  function wordTimes(chunk) {
    if (chunk.words && chunk.words.length) return chunk.words.map(function (w) { return { start: w.start, end: w.end }; });
    const out = [];
    for (const ln of chunk.lines || []) {
      const ws = String(ln.text).split(/\s+/).filter(Boolean);
      const d = (ln.end - ln.start) / Math.max(1, ws.length);
      ws.forEach(function (w, i) { out.push({ start: ln.start + i * d, end: ln.start + (i + 1) * d }); });
    }
    return out;
  }

  // ---------- 3. Punteggi ----------

  function wordFreq(chunks) {
    const f = {};
    for (const c of chunks) for (const t of c.tokens || []) if (t.norm) f[t.norm] = (f[t.norm] || 0) + 1;
    return f;
  }

  function lengthScore(wc) {
    if (wc >= 8 && wc <= 14) return 1;
    if ((wc >= 5 && wc <= 7) || (wc >= 15 && wc <= 18)) return 0.7;
    if (wc >= 19 && wc <= 24) return 0.4;
    if (wc >= 3) return 0.2;
    return 0;
  }

  function annotate(chunks, ctx) {
    const lang = ctx.lang || 'it';
    const D = ctx.duration || (chunks.length ? chunks[chunks.length - 1].end : 0);
    const freq = ctx.freq || wordFreq(chunks);
    for (const c of chunks) {
      if (c.silence) { c.value = 0; c.exScore = 0; c.contentRatio = 0; c.rate = 0; continue; }
      const dur = Math.max(0.5, c.end - c.start);
      const content = c.tokens.filter(function (t) { return L.isContent(t.core, lang); });
      c.contentRatio = c.wordCount ? content.length / c.wordCount : 0;
      c.rate = c.wordCount / dur;
      let rarity = 0;
      if (content.length) {
        rarity = content.reduce(function (s, t) { return s + 1 / Math.sqrt(freq[t.norm] || 1); }, 0) / content.length;
      }
      // valore "da tenere" (usato per decidere i tagli)
      let v = 0.25 * Math.min(1, c.rate / 2.5) + 0.55 * c.contentRatio + 0.2 * rarity;
      if (c.cta) v *= 0.15;
      if (c.start < 20) v *= 0.4;
      if (D && c.end > D - 45) v *= 0.5;
      c.value = Math.max(0, Math.min(1, v));
      // idoneità come frase per esercizio
      let s = lengthScore(c.wordCount) * (0.5 + 0.5 * c.contentRatio) * (0.7 + 0.3 * rarity);
      if (c.cta) s *= 0.1;
      if (c.start < 12) s *= 0.1;
      else if (c.start < 30) s *= 0.3;
      if (D && c.end > D - 30) s *= 0.5;
      if (L.endsBadly(c.tokens, lang)) s *= 0.5;
      if (L.startsSoftly(c.tokens, lang)) s *= 0.8;
      if (L.endsWithPunct(c.text)) s *= 1.2;
      if (/^[^\p{L}]*\p{Lu}/u.test(c.text)) s *= 1.15;   // inizia con la maiuscola: probabile inizio di frase
      if (c.gapAfter >= 0.5) s *= 1.15;
      if (/\d{3,}/.test(c.text)) s *= 0.85;
      c.exScore = s;
    }
    return chunks;
  }

  function typeFit(type, chunk, lang) {
    const r = TYPE_RANGES[type] || TYPE_RANGES.gap;
    const wc = chunk.wordCount;
    let f = (wc >= r[0] && wc <= r[1]) ? 1 : (wc >= r[0] - 3 && wc <= r[1] + 3) ? 0.6 : 0.25;
    if (type === 'wrong' && !chunk.tokens.some(function (t) { return L.swapFor(t.core, lang); })) f *= 0.15;
    if (type === 'scramble' && wc > 12) f *= 0.2;
    if (type === 'gap' && !chunk.tokens.some(function (t) { return L.isContent(t.core, lang); })) f *= 0.1;
    return f;
  }

  // ---------- 4. Selezione dei chunk per gli esercizi ----------

  function selectChunks(chunks, params) {
    const n = Math.max(1, params.n | 0);
    const types = (params.types && params.types.length ? params.types : DEFAULT_TYPES).filter(function (t) { return ALL_TYPES.indexOf(t) !== -1; });
    const lang = params.lang || 'it';
    const D = params.duration || chunks[chunks.length - 1].end;
    const exclude = params.exclude || new Set();
    const cands = chunks.filter(function (c) { return !c.silence && c.exScore > 0 && !exclude.has(c.id); });
    const used = new Set();
    const picks = [];
    const binW = D / n;

    for (let k = 0; k < n; k++) {
      const lo = k * binW, hi = (k + 1) * binW;
      let type = types[k % types.length];
      const inBin = cands.filter(function (c) { const mid = (c.start + c.end) / 2; return mid >= lo && mid < hi && !used.has(c.id); });
      if (!inBin.length) { picks.push({ bin: k, chunk: null, type: type }); continue; }
      let best = null, bestS = -1, bestType = type;
      for (const c of inBin) {
        let s = c.exScore * typeFit(type, c, lang);
        let t = type;
        if (typeFit(type, c, lang) < 0.5) {
          // il tipo previsto non calza: prova gli altri e prendi il migliore
          for (const alt of types) {
            const sa = c.exScore * typeFit(alt, c, lang) * 0.9;
            if (sa > s) { s = sa; t = alt; }
          }
        }
        if (s > bestS) { bestS = s; best = c; bestType = t; }
      }
      used.add(best.id);
      picks.push({ bin: k, chunk: best, type: bestType });
    }
    // Bin vuoti: prendi i migliori rimasti, lontani almeno mezzo bin dagli altri
    for (const p of picks) {
      if (p.chunk) continue;
      const rest = cands.filter(function (c) { return !used.has(c.id); })
        .filter(function (c) {
          const mid = (c.start + c.end) / 2;
          return picks.every(function (q) { return !q.chunk || Math.abs((q.chunk.start + q.chunk.end) / 2 - mid) >= binW / 2; });
        })
        .sort(function (a, b) { return b.exScore * typeFit(p.type, b, lang) - a.exScore * typeFit(p.type, a, lang); });
      if (rest.length) { p.chunk = rest[0]; used.add(rest[0].id); }
    }
    return picks.filter(function (p) { return p.chunk; }).sort(function (a, b) { return a.chunk.start - b.chunk.start; });
  }

  // ---------- 4b. Passaggi di lunghezza scelta (più chunk consecutivi) ----------

  const RANGES = { auto: null, smart: 'smart', '5-10': [5, 10], '10-15': [10, 15], '15-20': [15, 20], '20-30': [20, 30], '30-40': [30, 40], '40-60': [40, 60] };

  function startsSentence(chunks, i) {
    const c = chunks[i], prev = chunks[i - 1];
    if (!prev || prev.silence) return true;
    if (L.endsWithPunct(prev.text)) return true;
    const first = c.text.charAt(0);
    return first !== first.toLowerCase();
  }

  /**
   * Tutti i passaggi (sequenze di chunk consecutivi, senza silenzi in mezzo) con un numero di parole nell'intervallo [min,max].
   * Ogni passaggio: { start, end, text, chunkIds, wordCount, score, startsSentence, endsSentence }.
   */
  function passages(chunks, opts) {
    const o = Object.assign({ min: 5, max: 20, lang: 'it', maxGap: 1.5, exclude: null }, opts || {});
    const out = [];
    const mid = (o.min + o.max) / 2;
    for (let i = 0; i < chunks.length; i++) {
      const ci = chunks[i];
      if (ci.silence || (o.exclude && o.exclude.has(ci.id))) continue;
      let words = 0, sc = 0, ids = [], texts = [], end = ci.end;
      for (let j = i; j < chunks.length; j++) {
        const cj = chunks[j];
        if (cj.silence || (o.exclude && o.exclude.has(cj.id))) break;
        if (j > i && cj.start - chunks[j - 1].end > o.maxGap) break;
        words += cj.wordCount; sc += (cj.exScore || 0) * cj.wordCount; ids.push(cj.id); texts.push(cj.text); end = cj.end;
        if (words > o.max) break;
        if (words >= o.min) {
          const endsS = L.endsWithPunct(cj.text);
          const startsS = startsSentence(chunks, i);
          let score = (sc / Math.max(1, words)) * (startsS ? 1.3 : 0.8) * (endsS ? 1.3 : 0.7) * (1 - 0.3 * Math.abs(words - mid) / Math.max(1, o.max - o.min));
          if (ids.length > 1 && !endsS) score *= 0.8;
          out.push({ start: ci.start, end: end, text: texts.join(' '), chunkIds: ids.slice(), wordCount: words, score: score, startsSentence: startsS, endsSentence: endsS, cta: ids.some(function (id) { return chunks.find(function (c) { return c.id === id; }).cta; }) });
          if (endsS && words >= mid) break; // fermati alla prima chiusura di frase oltre il centro dell'intervallo
        }
      }
    }
    out.forEach(function (p) { if (p.cta) p.score *= 0.1; });
    return out.sort(function (a, b) { return a.start - b.start; });
  }

  function typeFitRange(type, p, lang) {
    let f = 1;
    const toks = L.tokenize(p.text);
    if (type === 'wrong' && !toks.some(function (t) { return L.swapFor(t.core, lang); })) f *= 0.15;
    if ((type === 'gap' || type === 'gapbank') && toks.filter(function (t) { return L.isContent(t.core, lang); }).length < 3) f *= 0.1;
    if (type === 'scramble' && p.wordCount > 14) f *= 0.5;
    return f;
  }

  /** Selezione di n passaggi nell'intervallo di parole scelto, distribuiti lungo il video. */
  function selectPassages(chunks, params) {
    const n = Math.max(1, params.n | 0);
    const types = (params.types && params.types.length ? params.types : DEFAULT_TYPES);
    const lang = params.lang || 'it';
    const D = params.duration || chunks[chunks.length - 1].end;
    const cache = {};
    const candsFor = function (type) {
      const r = resolveRange(params.range, type) || TYPE_RANGES[type] || TYPE_RANGES.gap;
      const key = r.join('-');
      if (!cache[key]) cache[key] = passages(chunks, { min: r[0], max: r[1], lang: lang, exclude: params.exclude || null });
      return cache[key];
    };
    const usedIds = new Set();
    const picks = [];
    const binW = D / n;
    for (let k = 0; k < n; k++) {
      const lo = k * binW, hi = (k + 1) * binW;
      const type = types[k % types.length];
      const cands = candsFor(type);
      // prima le frasi complete (iniziano e finiscono con la frase), poi le altre
      let best = null, bestS = -1;
      [true, false].forEach(function (completeOnly) {
        if (best) return;
        for (const p of cands) {
          if (completeOnly && !(p.startsSentence && p.endsSentence)) continue;
          const m = (p.start + p.end) / 2;
          if (m < lo || m >= hi) continue;
          if (p.chunkIds.some(function (id) { return usedIds.has(id); })) continue;
          const sc = p.score * typeFitRange(type, p, lang);
          if (sc > bestS) { bestS = sc; best = p; }
        }
      });
      if (best) { best.chunkIds.forEach(function (id) { usedIds.add(id); }); picks.push({ bin: k, passage: best, type: type }); }
    }
    return picks.sort(function (a, b) { return a.passage.start - b.passage.start; });
  }

  /** Passaggi alternativi vicino a un tempo, nell'intervallo scelto (per "altra frase" e per l'helper). */
  function passagesNear(chunks, time, opts) {
    const o = Object.assign({ window: 75, exclude: new Set(), type: 'gap', lang: 'it', range: [5, 20] }, opts || {});
    const r = resolveRange(o.range, o.type) || TYPE_RANGES[o.type] || TYPE_RANGES.gap;
    return passages(chunks, { min: r[0], max: r[1], lang: o.lang })
      .filter(function (p) { return !p.chunkIds.some(function (id) { return o.exclude.has(id); }) && Math.abs((p.start + p.end) / 2 - time) <= o.window; })
      .sort(function (a, b) { return b.score * typeFitRange(o.type, b, o.lang) - a.score * typeFitRange(o.type, a, o.lang); });
  }

  function makeExerciseFromPassage(p, type, opts) {
    const lang = opts.lang || 'it';
    const seed = (opts.seed || 1) * 7919 + p.wordCount;
    const text = capFirst(p.text);
    const bo = { lang: lang, seed: seed, vocab: opts.vocab || null, distractors: opts.distractors };
    let ex = EX.buildExercise(type, text, bo);
    if (!ex) {
      for (const alt of ['gap', 'missing', 'scramble', 'extra', 'wrong']) { if (alt === type) continue; ex = EX.buildExercise(alt, text, bo); if (ex) break; }
    }
    if (!ex) return null;
    const seg = { start: Math.max(0, p.start - 0.2), end: p.end + 0.35 };
    return { id: 'e' + p.chunkIds[0] + '-' + Math.floor(Math.random() * 1e6).toString(36), chunkId: p.chunkIds[0], chunkIds: p.chunkIds.slice(), type: ex.type, sentence: text, segment: seg, markerTime: seg.end + 0.05, data: ex.data, source: opts.source || 'rules', range: opts.range || null };
  }

  /** Chunk alternativo vicino a un tempo (per "altra frase" nell'editor). */
  function alternatives(chunks, time, opts) {
    const o = Object.assign({ window: 60, exclude: new Set(), type: 'gap', lang: 'it' }, opts || {});
    return chunks.filter(function (c) {
      return !c.silence && c.exScore > 0 && !o.exclude.has(c.id) && Math.abs((c.start + c.end) / 2 - time) <= o.window;
    }).sort(function (a, b) {
      return b.exScore * typeFit(o.type, b, o.lang) - a.exScore * typeFit(o.type, a, o.lang);
    });
  }

  function nearestChunk(chunks, time) {
    let best = null, bd = Infinity;
    for (const c of chunks) {
      if (c.silence) continue;
      const d = time < c.start ? c.start - time : time > c.end ? time - c.end : 0;
      if (d < bd) { bd = d; best = c; }
    }
    return best;
  }

  // ---------- 5. Piano dei tagli ----------

  function overlaps(a, b) { return a.start < b.end && b.start < a.end; }

  function planCuts(chunks, params) {
    const D = params.duration || chunks[chunks.length - 1].end;
    const T = params.target;
    const minCut = params.minCut || 8;
    const protect = (params.protect || []).map(function (p) { return { start: Math.max(0, p.start), end: Math.min(D, p.end) }; });
    const existing = params.existing || [];
    const tol = Math.max(0, params.tolerance || 0);
    let need = D - T - existing.reduce(function (s, c) { return s + (c.end - c.start); }, 0);
    if (!(need > tol)) return { cuts: [], removed: 0, shortfall: 0 };

    // Unità sulla linea del tempo con copertura completa 0..D
    const units = [];
    if (chunks.length && chunks[0].start > 0.5) units.push({ start: 0, end: chunks[0].start, value: 0, silence: true });
    for (const c of chunks) units.push({ start: c.start, end: c.end, value: c.value || 0, silence: !!c.silence, cta: !!c.cta, id: c.id });
    if (chunks.length && D - chunks[chunks.length - 1].end > 0.5) units.push({ start: chunks[chunks.length - 1].end, end: D, value: 0, silence: true });
    units.forEach(function (u, i) {
      u.free = !protect.some(function (p) { return overlaps(u, p); }) && !existing.some(function (p) { return overlaps(u, p); });
    });

    // Sequenze consecutive di unità libere
    const runs = [];
    let run = null;
    units.forEach(function (u) {
      if (u.free) { if (!run) { run = { units: [] }; runs.push(run); } run.units.push(u); }
      else run = null;
    });
    runs.forEach(function (r) {
      r.start = r.units[0].start;
      r.end = r.units[r.units.length - 1].end;
      r.length = r.end - r.start;
      let tot = 0, wv = 0;
      r.units.forEach(function (u) { const d = Math.max(0.1, u.end - u.start); tot += d; wv += d * u.value; });
      r.mean = tot ? wv / tot : 0;
      r.intro = r.start <= 20;
      r.outro = r.end >= D - 45;
      r.cta = r.units.some(function (u) { return u.cta; });
      r.ctaShare = r.length ? r.units.reduce(function (s, u) { return s + (u.cta ? u.end - u.start : 0); }, 0) / r.length : 0;
      r.silence = r.units.every(function (u) { return u.silence; });
      let pr = r.mean;
      if (r.silence) pr = 0;
      if (r.cta) pr *= 0.3;
      if (r.intro) pr *= 0.4;
      if (r.outro) pr *= 0.5;
      r.priority = pr;
    });
    runs.sort(function (a, b) { return a.priority - b.priority; });

    const cuts = [];
    let removed = 0;
    for (const r of runs) {
      if (removed >= need - 2) break;
      if (removed >= need - tol && r.priority >= 0.3) break;   // dentro la tolleranza: non tagliare contenuto vero
      const remaining = need - removed;
      const minForRun = r.silence ? 3 : r.cta ? 4 : (r.intro || r.outro) ? 5 : minCut;
      if (r.length < minForRun) continue;
      const reason = r.silence ? 'silenzio' : r.ctaShare > 0.5 ? 'sponsor / appello al pubblico' : (r.intro && r.length < 60) ? 'introduzione' : (r.outro && r.length < 90) ? 'chiusura' : r.mean < 0.35 ? 'bassa densità' : 'parte secondaria';
      if (r.length <= remaining + minCut / 2) {
        cuts.push({ start: r.start, end: r.end, reason: reason });
        removed += r.length;
        continue;
      }
      // Sotto-sequenza: finestra di lunghezza >= remaining con valore medio minimo, senza eccedere troppo
      let best = null;
      for (let i = 0; i < r.units.length; i++) {
        let wv = 0, tot = 0;
        for (let j = i; j < r.units.length; j++) {
          const u = r.units[j];
          const d = Math.max(0.1, u.end - u.start);
          tot += d; wv += d * u.value;
          const len = u.end - r.units[i].start;
          if (len >= remaining) {
            if (len <= remaining + 15) {
              const mean = wv / tot;
              if (!best || mean < best.mean) best = { start: r.units[i].start, end: u.end, mean: mean, len: len };
            }
            break;
          }
        }
      }
      if (!best) {
        // nessuna finestra ammissibile: prendi dall'inizio della sequenza una lunghezza ~remaining
        let j = 0;
        while (j < r.units.length - 1 && r.units[j].end - r.start < remaining) j++;
        best = { start: r.start, end: r.units[j].end, len: r.units[j].end - r.start };
      }
      if (best.len >= minCut) {
        cuts.push({ start: best.start, end: best.end, reason: reason });
        removed += best.len;
      }
    }

    cuts.sort(function (a, b) { return a.start - b.start; });
    const mergedCuts = [];
    for (const c of cuts) {
      const p = mergedCuts[mergedCuts.length - 1];
      if (p && c.start - p.end < 1.5) { p.end = Math.max(p.end, c.end); }
      else mergedCuts.push({ start: c.start, end: c.end, reason: c.reason });
    }
    removed = mergedCuts.reduce(function (s, c) { return s + (c.end - c.start); }, 0);
    return { cuts: mergedCuts, removed: removed, shortfall: Math.max(0, need - tol - removed) };
  }

  function keepRanges(cuts, duration) {
    const out = [];
    let t = 0;
    const sorted = (cuts || []).slice().sort(function (a, b) { return a.start - b.start; });
    for (const c of sorted) {
      if (c.start > t) out.push({ start: t, end: c.start });
      t = Math.max(t, c.end);
    }
    if (t < duration) out.push({ start: t, end: duration });
    return out;
  }

  function effectiveDuration(cuts, duration) {
    return keepRanges(cuts, duration).reduce(function (s, r) { return s + (r.end - r.start); }, 0);
  }

  function inCut(cuts, t) {
    for (const c of cuts || []) if (t >= c.start && t < c.end) return c;
    return null;
  }

  // ---------- 6. Bozza completa ----------

  function makeExercise(chunk, type, opts) {
    const lang = opts.lang || 'it';
    const seed = (opts.seed || 1) * 7919 + parseInt(String(chunk.id).replace(/\D/g, ''), 10);
    const text = capFirst(chunk.text);
    const bo = { lang: lang, seed: seed, vocab: opts.vocab || null, distractors: opts.distractors };
    let ex = EX.buildExercise(type, text, bo);
    if (!ex) {
      for (const alt of ['gap', 'missing', 'scramble', 'extra', 'wrong']) {
        if (alt === type) continue;
        ex = EX.buildExercise(alt, text, bo);
        if (ex) break;
      }
    }
    if (!ex) return null;
    const seg = { start: Math.max(0, chunk.start - 0.2), end: chunk.end + 0.35 };
    return {
      id: 'e' + chunk.id + '-' + Math.floor(Math.random() * 1e6).toString(36),
      chunkId: chunk.id,
      chunkIds: [chunk.id],
      type: ex.type,
      sentence: text,
      segment: seg,
      markerTime: seg.end + 0.05,
      data: ex.data,
      source: opts.source || 'rules'
    };
  }

  function generateDraft(params) {
    const lang = params.lang || 'it';
    const lines = params.lines;
    const duration = params.duration || (lines.length ? lines[lines.length - 1].end : 0);
    const chunks = params.chunks || annotate(buildChunks(lines, { duration: duration, lang: lang }), { lang: lang, duration: duration });
    const n = Math.max(1, params.n | 0);
    const types = params.types && params.types.length ? params.types : DEFAULT_TYPES.slice();
    const target = params.target && params.target > 0 ? Math.min(params.target, duration) : duration;
    const vocab = vocabulary(chunks, lang);

    const range = params.range === 'smart' ? 'smart' : (params.range && params.range.length === 2 ? params.range : null);
    const exercises = [];
    if (range) {
      selectPassages(chunks, { n: n, types: types, lang: lang, duration: duration, range: range, exclude: params.exclude }).forEach(function (p) {
        const ex = makeExerciseFromPassage(p.passage, p.type, { lang: lang, seed: params.seed || 1, range: range, vocab: vocab, distractors: params.distractors });
        if (ex) exercises.push(ex);
      });
    } else {
      selectChunks(chunks, { n: n, types: types, lang: lang, duration: duration, exclude: params.exclude }).forEach(function (p) {
        const ex = makeExercise(p.chunk, p.type, { lang: lang, seed: params.seed || 1, vocab: vocab, distractors: params.distractors });
        if (ex) exercises.push(ex);
      });
    }

    const result = fitCuts(chunks, exercises, { duration: duration, target: target, tolerance: params.tolerance, contextBefore: params.contextBefore, lang: lang });
    return {
      chunks: chunks, exercises: exercises, cuts: result.cuts,
      stats: { duration: duration, target: target, removed: result.removed, effective: effectiveDuration(result.cuts, duration), shortfall: result.shortfall, contextUsed: result.contextUsed, n: exercises.length }
    };
  }

  /** Calcola i tagli proteggendo gli esercizi; riduce il contesto se la durata target non è raggiungibile. */
  function fitCuts(chunks, exercises, params) {
    const duration = params.duration, target = params.target;
    const ctxList = [params.contextBefore == null ? 25 : params.contextBefore, 15, 8, 3].filter(function (v, i, a) { return a.indexOf(v) === i; }).sort(function (a, b) { return b - a; });
    let best = null;
    for (const ctx of ctxList) {
      const protect = exercises.map(function (e) { return { start: e.segment.start - ctx, end: e.segment.end + 1.0 }; });
      const r = planCuts(chunks, { duration: duration, target: target, tolerance: params.tolerance, protect: protect, existing: params.existing || [], lang: params.lang });
      r.contextUsed = ctx;
      if (!best || r.shortfall < best.shortfall) best = r;
      if (r.shortfall <= 5) break;
    }
    if (params.existing && params.existing.length) {
      best.cuts = best.cuts.concat(params.existing).sort(function (a, b) { return a.start - b.start; });
      best.removed = best.cuts.reduce(function (s, c) { return s + (c.end - c.start); }, 0);
    }
    return best;
  }

  function validateLesson(lesson) {
    const warns = [];
    const cuts = lesson.cuts || [];
    (lesson.exercises || []).forEach(function (e, i) {
      if (inCut(cuts, e.markerTime)) warns.push('Esercizio ' + (i + 1) + ': il segnaposto è dentro una parte tagliata.');
      const c = inCut(cuts, (e.segment.start + e.segment.end) / 2);
      if (c) warns.push('Esercizio ' + (i + 1) + ': la frase da ascoltare è dentro una parte tagliata (' + L.fmtTime(c.start) + '–' + L.fmtTime(c.end) + ').');
      if (e.segment.end <= e.segment.start) warns.push('Esercizio ' + (i + 1) + ': intervallo di ascolto non valido.');
    });
    cuts.forEach(function (c, i) { if (c.end <= c.start) warns.push('Taglio ' + (i + 1) + ': fine prima dell\'inizio.'); });
    return warns;
  }

  return {
    TYPE_RANGES: TYPE_RANGES, SMART_RANGES: SMART_RANGES, ALL_TYPES: ALL_TYPES, DEFAULT_TYPES: DEFAULT_TYPES, RANGES: RANGES,
    capFirst: capFirst, vocabulary: vocabulary, resolveRange: resolveRange,
    passages: passages, selectPassages: selectPassages, passagesNear: passagesNear, makeExerciseFromPassage: makeExerciseFromPassage,
    parseTranscript: parseTranscript, buildChunks: buildChunks, wordTimes: wordTimes, annotate: annotate, wordFreq: wordFreq,
    typeFit: typeFit, selectChunks: selectChunks, alternatives: alternatives, nearestChunk: nearestChunk,
    planCuts: planCuts, keepRanges: keepRanges, effectiveDuration: effectiveDuration, inCut: inCut,
    makeExercise: makeExercise, generateDraft: generateDraft, fitCuts: fitCuts, validateLesson: validateLesson
  };
});
