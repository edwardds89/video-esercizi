/* lang.js — risorse linguistiche e utilità di testo condivise (browser + Node) */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.VLLang = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  const STOPWORDS = {
    it: `a ad al allo ai agli alla alle anche ancora avere aveva avevano ben che chi ci come con cui da dal dallo dai dagli dalla dalle
      del dello dei degli della delle di dentro deve devo dove e è ed era erano essere fa fare fatto fra gli ha hai hanno ho i il in
      invece io l la le lei li lo loro lui ma me mi mia mie miei mio molto ne nei nel nella nelle nello no noi non nostra nostri nostro
      o ogni per però più poco poi qua quale quali quando quanto quasi quel quella quelle quelli quello questa queste questi questo qui
      quindi sarà se sei sembra senza si sia siamo siete solo sono sopra sotto sta stanno stare stata stati stato sua sue sui sul sulla
      sulle sullo suo suoi tra tu tua tue tuo tuoi tutta tutte tutti tutto un una uno va vai voi vostra vostri vostro c'è cioè così già
      infatti insomma ecco allora praticamente cosa perché mentre dopo prima adesso ora oggi sempre mai proprio tipo magari cose
      comunque quindi appunto diciamo vediamo cioe perche puo può pure ormai ancora almeno oltre verso circa`,
    en: `a about above after again against all am an and any are as at be because been before being below between both but by can
      could did do does doing down during each few for from further had has have having he her here hers herself him himself his how
      i if in into is it its itself just me more most my myself no nor not now of off on once only or other our ours ourselves out over
      own same she should so some such than that the their theirs them themselves then there these they this those through to too under
      until up very was we were what when where which while who whom why will with would you your yours yourself yourselves also like
      get got really thing things well yeah okay ok right going gonna kind lot actually basically know mean think want way one two us
      im it's don't doesn't didn't i'm you're we're they're that's there's isn't aren't wasn't weren't can't won't let's`
  };

  // Parole "di chiusura" che suggeriscono una frase troncata a metà (utile senza punteggiatura)
  const TRAILING_BAD = {
    it: 'e che di a da in con per su tra fra ma o se il la lo i gli le un una uno del della dei delle al alla ai alle non più anche come quando perché'.split(' '),
    en: 'and that of to in on for with but or if the a an as at by from so because when which who what where while than then'.split(' ')
  };

  // Frasi da call-to-action / sponsor: bassa priorità didattica, alta priorità di taglio
  const CTA = {
    it: ['iscrivetevi', 'iscriviti', 'iscrivervi', 'iscrivendovi', 'campanella', 'sponsor', 'sponsorizzat', 'codice sconto', 'link in descrizione',
      'in descrizione', 'nella descrizione', 'descrizione del video', 'patreon', 'mettete like', 'mettete un like', 'lascia un like', 'lasciate un like', 'commentate', 'condividete',
      'nei commenti', 'seguitemi', 'seguimi', 'telegram', 'instagram', 'prossimo video', 'video precedente', 'ci vediamo', 'alla prossima',
      'buona visione', 'benvenuti', 'bentornati', 'in questo video', 'oggi parliamo', 'oggi vi parlo', 'grazie per'],
    en: ['subscribe', 'subscribing', 'sponsor', 'sponsored', 'promo code', 'discount code', 'link in the description', 'description below',
      'in the description', 'description of the video', 'patreon', 'like button', 'hit the bell', 'notifications', 'comment below', 'in the comments', 'follow me',
      'next video', 'previous video', 'see you', 'thanks for watching', 'stay tuned', 'merch', 'giveaway', 'welcome back', 'welcome to',
      "in today's video", 'in this video', "today we're", 'today we are']
  };

  // Coppie di parole funzionali plausibili per "find the wrong word"
  const SWAPS = {
    it: [['il', 'la'], ['un', 'una'], ['di', 'da'], ['a', 'in'], ['per', 'con'], ['che', 'chi'], ['e', 'o'], ['questo', 'quello'],
      ['questa', 'quella'], ['molto', 'poco'], ['sempre', 'mai'], ['più', 'meno'], ['prima', 'dopo'], ['sopra', 'sotto'],
      ['grande', 'piccolo'], ['nuovo', 'vecchio'], ['anche', 'neanche'], ['ma', 'quindi'], ['dentro', 'fuori'], ['tutti', 'nessuno'],
      ['è', 'era'], ['sono', 'erano'], ['ha', 'aveva'], ['hanno', 'avevano'], ['può', 'deve'], ['possono', 'devono'], ['lui', 'lei'],
      ['suo', 'sua'], ['del', 'della'], ['nel', 'nella'], ['al', 'alla'], ['gli', 'le'], ['questi', 'quelli'], ['oggi', 'ieri'],
      ['qui', 'lì'], ['vicino', 'lontano'], ['facile', 'difficile'], ['veloce', 'lento'], ['alto', 'basso']],
    en: [['the', 'a'], ['in', 'on'], ['to', 'for'], ['of', 'from'], ['is', 'are'], ['was', 'were'], ['this', 'that'], ['these', 'those'],
      ['much', 'many'], ['more', 'less'], ['always', 'never'], ['before', 'after'], ['big', 'small'], ['new', 'old'], ['and', 'but'],
      ['can', "can't"], ['he', 'she'], ['his', 'her'], ['there', 'their'], ['has', 'have'], ['does', 'do'], ['did', 'does'],
      ['up', 'down'], ['here', 'there'], ['fast', 'slow'], ['easy', 'hard'], ['high', 'low'], ['under', 'over'], ['with', 'without'],
      ['some', 'any'], ['first', 'last'], ['today', 'yesterday'], ['near', 'far'], ['inside', 'outside']]
  };

  // Parole funzionali da inserire per "find the extra word"
  const EXTRA = {
    it: ['di', 'a', 'che', 'il', 'la', 'non', 'più', 'anche', 'ma', 'un', 'una', 'se', 'per', 'in', 'con', 'si', 'lo', 'ne', 'già', 'poi', 'molto', 'è'],
    en: ['the', 'a', 'to', 'of', 'in', 'that', 'it', 'is', 'and', 'so', 'very', 'more', 'also', 'not', 'up', 'on', 'for', 'with', 'be', 'do', 'have', 'are']
  };

  const NOISE = [/\[musica\]/i, /\[applausi\]/i, /\[music\]/i, /\[applause\]/i, /\[risate\]/i, /\[laughter\]/i, /^\s*\[.*\]\s*$/];

  const sets = {};
  function stopwords(lang) {
    const l = STOPWORDS[lang] ? lang : 'it';
    if (!sets[l]) sets[l] = new Set(STOPWORDS[l].split(/\s+/).filter(Boolean).map(function (w) { return normalize(w); }));
    return sets[l];
  }

  /** Minuscolo, senza accenti (opzionale), senza punteggiatura, spazi normalizzati. */
  function normalize(s, opts) {
    const o = Object.assign({ accents: false }, opts || {});
    let t = String(s || '').toLowerCase().replace(/[’‘`´]/g, "'");
    if (!o.accents) t = t.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
    t = t.replace(/[^\p{L}\p{N}'\s-]/gu, ' ').replace(/\s+/g, ' ').trim();
    return t;
  }

  /** Divide il testo in token conservando la punteggiatura attaccata (pre/post). */
  function tokenize(text) {
    return String(text || '').split(/\s+/).filter(Boolean).map(function (raw) {
      const m = raw.match(/^([^\p{L}\p{N}]*)(.*?)([^\p{L}\p{N}]*)$/u);
      const core = m ? m[2] : raw;
      return { raw: raw, pre: m ? m[1] : '', core: core, post: m ? m[3] : '', norm: normalize(core) };
    });
  }

  function words(text) { return normalize(text).split(' ').filter(Boolean); }

  function isContent(w, lang) {
    const n = normalize(w);
    return n.length >= 3 && !stopwords(lang).has(n) && !/^\d+$/.test(n);
  }

  function hasCTA(text, lang) {
    const t = normalize(text, { accents: true });
    const list = CTA[lang] || CTA.it;
    return list.some(function (k) { return t.indexOf(k) !== -1; });
  }

  function isNoise(text) { return NOISE.some(function (r) { return r.test(text); }); }

  function endsBadly(tokens, lang) {
    if (!tokens.length) return true;
    const last = tokens[tokens.length - 1].norm;
    return (TRAILING_BAD[lang] || TRAILING_BAD.it).map(normalize).indexOf(last) !== -1;
  }

  function endsWithPunct(text) { return /[.!?…][)"'»]*\s*$/.test(String(text || '')); }

  /** Rende un paio (parola, sostituto) per "wrong word": cerca nel testo una parola presente nella tabella. */
  function swapFor(word, lang) {
    const n = normalize(word, { accents: true });
    const table = SWAPS[lang] || SWAPS.it;
    for (const pair of table) {
      if (pair[0] === n) return pair[1];
      if (pair[1] === n) return pair[0];
    }
    return null;
  }

  function extraCandidates(lang) { return (EXTRA[lang] || EXTRA.it).slice(); }

  /** Semplice PRNG deterministico (per test riproducibili). */
  function rng(seed) {
    let s = (seed >>> 0) || 123456789;
    return function () {
      s = (s * 1664525 + 1013904223) >>> 0;
      return s / 4294967296;
    };
  }

  function fmtTime(sec) {
    sec = Math.max(0, Math.round((sec || 0) * 10) / 10);
    const m = Math.floor(sec / 60), s = sec - m * 60;
    const ss = (s < 10 ? '0' : '') + s.toFixed(1);
    return m + ':' + ss;
  }

  function parseTime(str) {
    if (typeof str === 'number') return str;
    const s = String(str || '').trim().replace(',', '.');
    if (!s) return NaN;
    const parts = s.split(':').map(Number);
    if (parts.some(isNaN)) return NaN;
    if (parts.length === 3) return parts[0] * 3600 + parts[1] * 60 + parts[2];
    if (parts.length === 2) return parts[0] * 60 + parts[1];
    return parts[0];
  }

  return {
    STOPWORDS: STOPWORDS, CTA: CTA, SWAPS: SWAPS, EXTRA: EXTRA,
    stopwords: stopwords, normalize: normalize, tokenize: tokenize, words: words, isContent: isContent,
    hasCTA: hasCTA, isNoise: isNoise, endsBadly: endsBadly, endsWithPunct: endsWithPunct, swapFor: swapFor,
    extraCandidates: extraCandidates, rng: rng, fmtTime: fmtTime, parseTime: parseTime
  };
});
