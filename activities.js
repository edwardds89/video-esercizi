/* activities.js — attività-gioco (Memory, Quiz, Anagramma, Ruota) con temi visivi: standalone o dentro la lezione (browser + Node) */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory(require('./lang.js'));
  else root.VLAct = factory(root.VLLang);
})(typeof self !== 'undefined' ? self : this, function (L) {
  'use strict';

  /** Temi visivi condivisi da tutte le attività (dal più sobrio al più festoso): palette + decorazioni + movimento.
   *  Il CSS li disegna con .act[data-theme=…]; motion: float (fluttuano), fall (cadono: neve, petali), rise (salgono: bolle), twinkle (brillano: stelle).
   *  sw = anteprima per il chip del selettore. */
  // props = elementi ICONICI fissi e ben visibili (x,y in %, s = dimensione px, r = rotazione): sono loro a "dire" il tema.
  // deco = pochi elementi animati "una volta ogni tanto" (mai un loop fitto: non devono distrarre gli studenti).
  const THEMES = [
    { id: 'classic', name: 'Classico', emoji: '📖', deco: [], motion: 'float', props: [], sw: 'linear-gradient(135deg,#f6f1e6,#dcd0b6)' },
    { id: 'notebook', name: 'Quaderno', emoji: '📝', deco: [], motion: 'float', props: [{ e: '✏️', x: 1, y: 80, s: 52, r: -35 }], sw: 'linear-gradient(180deg,#fdfdf6 60%,#bcd6ee)' },
    { id: 'blackboard', name: 'Lavagna', emoji: '✏️', deco: [], motion: 'float', props: [{ e: '🍎', x: 91, y: 82, s: 44 }], sw: 'linear-gradient(135deg,#33473d,#2b3d34)' },
    { id: 'coffee', name: 'Caffè', emoji: '☕', deco: ['🫘'], motion: 'fall', props: [{ e: '☕', x: 90, y: 44, s: 60 }, { e: '🥐', x: 1.5, y: 80, s: 52, r: -15 }], sw: 'linear-gradient(135deg,#efe4d2,#8a5a33)' },
    { id: 'night', name: 'Nero puro', emoji: '✦', deco: [], motion: 'float', props: [], sw: 'linear-gradient(135deg,#000,#17171d)' },
    { id: 'tvshow', name: 'Gioco a premi', emoji: '🏆', deco: ['✨', '✨'], motion: 'twinkle', props: [{ e: '🏆', x: 89.5, y: 42, s: 66 }, { e: '🎤', x: 1.5, y: 78, s: 56, r: -20 }], sw: 'linear-gradient(135deg,#3a0d1c,#f3c545)' },
    { id: 'space', name: 'Spazio', emoji: '🪐', deco: ['✦', '✧', '💫'], motion: 'twinkle', props: [{ e: '🪐', x: 88, y: 36, s: 70 }, { e: '🚀', x: 2, y: 76, s: 60, r: -25 }, { e: '👩‍🚀', x: 90, y: 80, s: 50 }], sw: 'linear-gradient(135deg,#0b1030,#3a1a6e)' },
    { id: 'synth', name: 'Neon retrò', emoji: '👾', deco: [], motion: 'float', props: [{ e: '👾', x: 90, y: 40, s: 54 }, { e: '🕹️', x: 2, y: 80, s: 50, r: -15 }], sw: 'linear-gradient(180deg,#1a0b33,#ff3ec8)' },
    { id: 'ocean', name: 'Oceano', emoji: '🐚', deco: ['🫧', '🫧', '🐟'], motion: 'rise', props: [{ e: '🐠', x: 2, y: 44, s: 58 }, { e: '🌿', x: 89, y: 64, s: 60 }, { e: '🐚', x: 91, y: 88, s: 40 }], sw: 'linear-gradient(180deg,#0c86c8,#0a3d62)' },
    { id: 'jungle', name: 'Giungla', emoji: '🦜', deco: ['🍃', '🦋'], motion: 'fall', props: [{ e: '🌴', x: 1, y: 64, s: 84 }, { e: '🦜', x: 89, y: 36, s: 64 }, { e: '🐒', x: 91, y: 82, s: 50 }], sw: 'linear-gradient(135deg,#1d5a30,#123b22)' },
    { id: 'spring', name: 'Primavera', emoji: '🌸', deco: ['🌸', '🌸', '🦋'], motion: 'fall', props: [{ e: '🌷', x: 2, y: 76, s: 60 }, { e: '🌸', x: 90, y: 82, s: 52 }, { e: '🐝', x: 89, y: 40, s: 40 }], sw: 'linear-gradient(135deg,#eafbe7,#ffe3ef)' },
    { id: 'summer', name: 'Estate', emoji: '🌞', deco: ['🌊'], motion: 'float', props: [{ e: '🏖️', x: 1.5, y: 76, s: 70 }, { e: '🍉', x: 90, y: 84, s: 50 }, { e: '🕶️', x: 89, y: 42, s: 40 }], sw: 'linear-gradient(180deg,#bfe9fb,#f3e3b8)' },
    { id: 'autumn', name: 'Autunno', emoji: '🍁', deco: ['🍁', '🍂', '🍂'], motion: 'fall', props: [{ e: '🍁', x: 2, y: 76, s: 66, r: -15 }, { e: '🌰', x: 91, y: 86, s: 46 }, { e: '🍄', x: 89, y: 42, s: 46 }], sw: 'linear-gradient(135deg,#f5e5c2,#c65d2e)' },
    { id: 'winter', name: 'Inverno', emoji: '⛄', deco: ['❄', '❅', '❄'], motion: 'fall', props: [{ e: '⛄', x: 2, y: 74, s: 70 }, { e: '🌲', x: 90, y: 76, s: 62 }, { e: '🧣', x: 89, y: 40, s: 40 }], sw: 'linear-gradient(180deg,#f0f8ff,#bcdcf0)' },
    { id: 'rainbow', name: 'Arcobaleno', emoji: '🌈', deco: ['🎈'], motion: 'rise', props: [{ e: '🌈', x: 88, y: 36, s: 80 }, { e: '☁️', x: 2, y: 78, s: 56 }], sw: 'linear-gradient(90deg,#ff8a8a,#ffc86b,#7fd98a,#6db3ff,#b98aff)' },
    { id: 'candy', name: 'Caramelle', emoji: '🍭', deco: ['🍬'], motion: 'fall', props: [{ e: '🍭', x: 2, y: 76, s: 66, r: -20 }, { e: '🧁', x: 90, y: 82, s: 52 }, { e: '🍩', x: 89, y: 40, s: 46 }], sw: 'linear-gradient(135deg,#ffd9ec,#ff4f9a)' },
    { id: 'halloween', name: 'Halloween', emoji: '🎃', deco: ['🦇', '🦇', '👻'], motion: 'float', props: [{ e: '🎃', x: 1.5, y: 76, s: 76 }, { e: '💀', x: 90, y: 44, s: 52 }, { e: '🕸️', x: 0.5, y: 1, s: 64 }], sw: 'linear-gradient(135deg,#140a1e,#ff8c1a)' },
    { id: 'christmas', name: 'Natale', emoji: '🎄', deco: ['❄', '❅', '❄'], motion: 'fall', props: [{ e: '🎄', x: 1, y: 66, s: 84 }, { e: '🎁', x: 90, y: 84, s: 50 }, { e: '⭐', x: 89, y: 40, s: 44 }], sw: 'linear-gradient(135deg,#14301f,#b23a33)' }
  ];
  const THEME_IDS = THEMES.map(function (t) { return t.id; });

  /** Tipi di attività: etichette per portfolio, editor e catalogo. */
  const TYPES = {
    memory: { label: 'Memory con carte', emoji: '🃏', hint: 'Trova le coppie: parola ↔ traduzione o foto. Le carte si girano.' },
    quiz: { label: 'Quiz gioco', emoji: '🎯', hint: 'Domande a scelta multipla con punteggio, serie di risposte giuste e finale.' },
    anagram: { label: 'Anagramma', emoji: '🔤', hint: 'Riordina le lettere e ricomponi la parola (con un indizio).' },
    wheel: { label: 'Ruota della fortuna', emoji: '🎡', hint: 'Gira la ruota: esce una domanda o una parola per parlare.' }
  };

  function rng(seed) {
    let s = (seed >>> 0) || 1;
    return function () { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; };
  }
  function shuffle(arr, rand) {
    const a = arr.slice();
    for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(rand() * (i + 1)); const t = a[i]; a[i] = a[j]; a[j] = t; }
    return a;
  }

  // ---------- logica pura (testabile in Node) ----------

  /** Mazzo del memory: per ogni coppia due carte {k, side:'a'|'b', text, image}. Mescolate. */
  function memoryDeck(pairs, rand) {
    const cards = [];
    pairs.forEach(function (p, i) {
      cards.push({ k: i, side: 'a', text: p.a || '' });
      cards.push({ k: i, side: 'b', text: p.b || '', image: p.image || '' });
    });
    return shuffle(cards, rand || Math.random);
  }
  /** Colonne della griglia del memory in base al numero di carte (griglia il più quadrata possibile, max 6). */
  function memoryCols(n) {
    if (n <= 8) return Math.min(4, Math.ceil(n / 2));
    if (n <= 12) return 4;
    if (n <= 20) return 5;
    return 6;
  }

  /** Ordine delle risposte del quiz mescolato (la giusta mai sistematicamente prima); ritorna { options, correct }. */
  function quizOrder(q, rand) {
    const idx = q.options.map(function (_, i) { return i; });
    const r = rand || Math.random;
    const ord = shuffle(idx, r);
    if (ord.length > 1 && ord[0] === q.correct) { const k = 1 + Math.floor(r() * (ord.length - 1)); const t = ord[0]; ord[0] = ord[k]; ord[k] = t; }
    return { options: ord.map(function (i) { return q.options[i]; }), correct: ord.indexOf(q.correct) };
  }
  /** Punti per una risposta giusta: base 100 + bonus per la serie (streak PRIMA di questa risposta, max +100). */
  function quizPoints(streak) { return 100 + Math.min(streak, 5) * 20; }

  /** Lettere dell'anagramma mescolate (mai nell'ordine giusto se ci sono almeno 2 lettere diverse). Gli spazi restano fissi. */
  function anagramLetters(word, rand) {
    const chars = Array.from(String(word || ''));
    const idx = [];
    chars.forEach(function (c, i) { if (c !== ' ') idx.push(i); });
    const r = rand || Math.random;
    let letters = idx.map(function (i) { return chars[i]; });
    const same = function (a) { return a.join('') === idx.map(function (i) { return chars[i]; }).join(''); };
    if (new Set(letters).size > 1) { let guard = 0; do { letters = shuffle(letters, r); guard++; } while (same(letters) && guard < 20); }
    return letters;
  }

  /** Spicchio scelto dalla ruota per un angolo finale (gradi, in senso orario; la freccia sta in alto). */
  function wheelIndexAt(angle, n) {
    const per = 360 / n;
    const a = ((360 - (angle % 360)) + 360) % 360;   // rotazione oraria della ruota = la freccia "torna indietro"
    return Math.floor(a / per) % n;
  }

  /** Il contenuto come coppie {a,b,image}: base comune per trasformare un'attività in un'altra. */
  function pairsOf(act) {
    if (!act || !act.data) return [];
    if (act.type === 'memory') return (act.data.pairs || []).filter(function (p) { return p.a; }).map(function (p) { return { a: p.a, b: p.b || '', image: p.image || '' }; });
    if (act.type === 'anagram') return (act.data.words || []).filter(function (w) { return w.word; }).map(function (w) { return { a: w.word, b: w.hint || '', image: w.image || '' }; });
    if (act.type === 'quiz') return (act.data.questions || []).filter(function (q) { return q.q && Array.isArray(q.options) && q.options[q.correct]; }).map(function (q) { return { a: q.q, b: q.options[q.correct], image: '' }; });
    return [];   // la ruota ha solo voci singole: non basta per ricostruire coppie
  }
  /** Trasforma il CONTENUTO di un'attività in un altro tipo (un click, stesso materiale): {type, data} o null se non compatibile.
   *  parola+traduzione ⇄ Memory/Anagramma; coppie → Quiz (la giusta = la traduzione, i distrattori = le altre); tutto → Ruota (le voci). */
  function convert(act, to, rand) {
    if (!act || !TYPES[to] || to === act.type) return null;
    const r = rand || Math.random;
    const pairs = pairsOf(act);
    let data = null;
    if (to === 'memory') data = { pairs: pairs.filter(function (p) { return p.b || p.image; }).slice(0, 12) };
    if (to === 'anagram') data = { words: pairs.filter(function (p) { return Array.from(String(p.a).trim()).length >= 3; }).map(function (p) { return { word: p.a, hint: p.b, image: p.image }; }) };
    if (to === 'wheel') {
      const items = act.type === 'quiz' ? (act.data.questions || []).filter(function (q) { return q.q; }).map(function (q) { return { text: q.q }; }) : pairs.map(function (p) { return { text: p.a }; });
      data = { items: items };
    }
    if (to === 'quiz') {
      const withB = pairs.filter(function (p) { return p.b; });
      data = { questions: withB.map(function (p, i) {
        const others = shuffle(withB.filter(function (x, j) { return j !== i && x.b !== p.b; }).map(function (x) { return x.b; }), r).slice(0, 3);
        const options = shuffle([p.b].concat(others), r);
        return { q: p.a, options: options, correct: options.indexOf(p.b) };
      }).filter(function (q) { return q.options.length >= 2; }) };
    }
    if (!data) return null;
    const out = { type: to, data: data };
    return validate(out).length ? null : out;
  }
  /** In quali tipi si può trasformare questa attività (con il contenuto che ha adesso). */
  function convertTargets(act) {
    return Object.keys(TYPES).filter(function (to) { return convert(act, to, rng(5)) !== null; });
  }

  /** Un'attività è giocabile? Ritorna la lista dei problemi (vuota = ok). */
  function validate(act) {
    const errs = [];
    if (!act || !TYPES[act.type]) { errs.push('Tipo di attività sconosciuto.'); return errs; }
    const d = act.data || {};
    if (act.type === 'memory') {
      const pairs = (d.pairs || []).filter(function (p) { return p.a && (p.b || p.image); });
      if (pairs.length < 3) errs.push('Servono almeno 3 coppie complete (parola + traduzione o foto).');
      if (pairs.length > 12) errs.push('Massimo 12 coppie (24 carte).');
    }
    if (act.type === 'quiz') {
      const qs = (d.questions || []).filter(function (q) { return q.q && (q.options || []).filter(Boolean).length >= 2 && q.correct != null; });
      if (!qs.length) errs.push('Serve almeno una domanda con due risposte e la giusta segnata.');
    }
    if (act.type === 'anagram') {
      const ws = (d.words || []).filter(function (w) { return w.word && Array.from(w.word.trim()).length >= 3; });
      if (!ws.length) errs.push('Serve almeno una parola di 3 o più lettere.');
    }
    if (act.type === 'wheel') {
      const items = (d.items || []).filter(function (x) { return x.text; });
      if (items.length < 2) errs.push('Servono almeno 2 voci sulla ruota.');
    }
    return errs;
  }

  // ---------- utilità DOM ----------
  function h(tag, attrs) {
    const n = document.createElement(tag);
    if (attrs) Object.keys(attrs).forEach(function (k) {
      if (k === 'text') n.textContent = attrs[k];
      else if (k === 'html') n.innerHTML = attrs[k];
      else if (k === 'onclick') n.addEventListener('click', attrs[k]);
      else if (attrs[k] != null) n.setAttribute(k, attrs[k]);
    });
    for (let i = 2; i < arguments.length; i++) { const c = arguments[i]; if (c == null) continue; n.appendChild(typeof c === 'string' ? document.createTextNode(c) : c); }
    return n;
  }
  function clearNode(n) { while (n.firstChild) n.removeChild(n.firstChild); }
  function themeOf(act) { return THEME_IDS.indexOf(act.theme) >= 0 ? act.theme : 'classic'; }

  /** Scena del tema dentro rootEl: gli elementi ICONICI fissi (`.act-props`, sempre) e poche decorazioni animate
   *  "una ogni tanto" (`.act-deco`, niente con fx=false): ognuna si muove per una frazione di un ciclo lungo, poi sparisce. */
  function decorate(rootEl, act, opts) {
    const th = THEMES.find(function (t) { return t.id === themeOf(act); });
    if (!th) return null;
    if (th.props && th.props.length) {
      const props = h('div', { class: 'act-props', 'aria-hidden': 'true' });
      th.props.forEach(function (p) {
        const e = h('span', { text: p.e });
        e.style.left = p.x + '%'; e.style.top = p.y + '%'; e.style.fontSize = p.s + 'px';
        if (p.r) e.style.transform = 'rotate(' + p.r + 'deg)';
        props.appendChild(e);
      });
      rootEl.appendChild(props);
    }
    if (!th.deco.length || (opts && opts.fx === false)) return null;
    const motion = th.motion || 'float';
    // cicli lunghi: cade/sale/brilla per circa un quarto del ciclo, il resto è invisibile → "ne cade una ogni tanto"
    const dur = { float: [18, 10], fall: [28, 14], rise: [26, 12], twinkle: [8, 6] }[motion];
    const count = motion === 'twinkle' ? 4 : 3;
    const deco = h('div', { class: 'act-deco m-' + motion, 'aria-hidden': 'true' });
    const r = rng(act.id ? String(act.id).length * 97 + 13 : 41);
    for (let i = 0; i < count; i++) {
      const e = h('span', { text: th.deco[i % th.deco.length] });
      e.style.left = (4 + r() * 90) + '%';
      e.style.top = (motion === 'fall' || motion === 'rise') ? '0' : (8 + r() * 80) + '%';
      e.style.fontSize = (18 + r() * 18) + 'px';
      const d = dur[0] + r() * dur[1];
      e.style.animationDuration = d.toFixed(2) + 's';
      e.style.animationDelay = '-' + (r() * d).toFixed(2) + 's';   // sfasate lungo il ciclo: non partono tutte insieme
      deco.appendChild(e);
    }
    rootEl.appendChild(deco);
    return deco;
  }
  /** Cambia il template di una scena GIÀ resa senza toccare il gioco in corso (carte girate, punti, risposte date):
   *  aggiorna data-theme (il CSS fa il resto) e ridisegna solo elementi iconici e decorazioni. Ritorna false se il tema non esiste. */
  function retheme(rootEl, act, themeId, opts) {
    if (!rootEl || THEME_IDS.indexOf(themeId) < 0) return false;
    act.theme = themeId;
    rootEl.setAttribute('data-theme', themeId);
    Array.prototype.slice.call(rootEl.children).forEach(function (c) { if (c.classList.contains('act-props') || c.classList.contains('act-deco')) rootEl.removeChild(c); });
    decorate(rootEl, act, opts);
    return true;
  }
  /** Contenitore comune: tema + decorazioni di sfondo + area di gioco. Ritorna { rootEl, stage }. */
  function shell(container, act, opts) {
    clearNode(container);
    const rootEl = h('div', { class: 'act', 'data-theme': themeOf(act), 'data-type': act.type });
    decorate(rootEl, act, opts);
    const stage = h('div', { class: 'act-stage' });
    rootEl.appendChild(stage);
    container.appendChild(rootEl);
    return { rootEl: rootEl, stage: stage };
  }

  function fmtClock(s) { s = Math.max(0, Math.round(s)); return Math.floor(s / 60) + ':' + String(s % 60).padStart(2, '0'); }

  /** Schermata finale comune: emoji grande, titolo, righe di dettaglio, Rigioca / Continua. */
  function endScreen(stage, opts, info) {
    clearNode(stage);
    const box = h('div', { class: 'act-end' });
    box.appendChild(h('div', { class: 'act-end-emoji', text: info.emoji || '🎉' }));
    box.appendChild(h('h2', { text: info.title }));
    (info.lines || []).forEach(function (t) { box.appendChild(h('p', { class: 'act-end-line', text: t })); });
    const row = h('div', { class: 'act-row' });
    row.appendChild(h('button', { class: 'act-btn ghost', text: '↺ Rigioca', onclick: info.onReplay }));
    if (opts && opts.onDone) row.appendChild(h('button', { class: 'act-btn primary', text: opts.doneLabel || 'Continua ▶', onclick: function () { opts.onDone(info.result || {}); } }));
    box.appendChild(row);
    stage.appendChild(box);
    if (info.celebrate !== false && opts && opts.celebrate) opts.celebrate(box);
  }

  // ---------- MEMORY ----------
  function renderMemory(container, act, opts) {
    const sh = shell(container, act, opts);
    const pairs = (act.data.pairs || []).filter(function (p) { return p.a && (p.b || p.image); }).slice(0, 12);
    const play = function () {
      clearNode(sh.stage);
      const deck = memoryDeck(pairs, rng(Date.now() % 100003));
      const th = THEMES.find(function (t) { return t.id === themeOf(act); });
      let open = [];        // carte girate in attesa (max 2)
      let lockUntil = 0;    // durante il "richiudi" non si clicca
      let moves = 0, found = 0;
      const t0 = Date.now();
      const head = h('div', { class: 'act-head' });
      const title = h('div', { class: 'act-title', text: act.title || 'Memory' });
      const stats = h('div', { class: 'act-stats' });
      const mv = h('span', { class: 'act-stat', text: '0 mosse' });
      const ck = h('span', { class: 'act-stat', text: '0:00' });
      stats.appendChild(mv); stats.appendChild(ck);
      head.appendChild(title); head.appendChild(stats);
      sh.stage.appendChild(head);
      const timer = setInterval(function () { if (!document.body.contains(ck)) return clearInterval(timer); ck.textContent = fmtClock((Date.now() - t0) / 1000); }, 500);
      const grid = h('div', { class: 'mem-grid' });
      grid.style.setProperty('--cols', memoryCols(deck.length));
      sh.stage.appendChild(grid);
      const backFace = th ? th.emoji : '🃏';
      deck.forEach(function (card) {
        const inner = h('div', { class: 'mem-inner' },
          h('div', { class: 'mem-face mem-back' }, h('span', { class: 'mem-back-mark', text: backFace })),
          (function () {
            const f = h('div', { class: 'mem-face mem-front' });
            if (card.image) { const img = h('img', { src: card.image, alt: '' }); f.appendChild(img); if (card.text) f.appendChild(h('span', { class: 'mem-cap', text: card.text })); }
            else f.appendChild(h('span', { class: 'mem-word', text: card.text }));
            return f;
          })());
        const b = h('button', { class: 'mem-card', 'aria-label': 'carta coperta' }, inner);
        b._card = card;
        b.addEventListener('click', function () {
          if (Date.now() < lockUntil || b.classList.contains('up') || b.classList.contains('done')) return;
          b.classList.add('up');
          open.push(b);
          if (open.length < 2) return;
          moves++; mv.textContent = moves + (moves === 1 ? ' mossa' : ' mosse');
          const a = open[0], c = open[1]; open = [];
          if (a._card.k === c._card.k) {
            found++;
            setTimeout(function () { a.classList.add('done'); c.classList.add('done'); }, 250);
            if (found === pairs.length) {
              clearInterval(timer);
              const secs = (Date.now() - t0) / 1000;
              setTimeout(function () {
                endScreen(sh.stage, opts, {
                  emoji: '🏆', title: 'Tutte le coppie trovate!',
                  lines: [moves + ' mosse · ' + fmtClock(secs), pairs.length + ' coppie'],
                  onReplay: play, result: { done: true, moves: moves, seconds: Math.round(secs) }
                });
              }, 900);
            }
          } else {
            lockUntil = Date.now() + 950;
            a.classList.add('no'); c.classList.add('no');
            setTimeout(function () { a.classList.remove('up', 'no'); c.classList.remove('up', 'no'); }, 900);
          }
        });
        grid.appendChild(b);
      });
    };
    play();
  }

  // ---------- QUIZ ----------
  function renderQuiz(container, act, opts) {
    const sh = shell(container, act, opts);
    const qs = (act.data.questions || []).filter(function (q) { return q.q && (q.options || []).filter(Boolean).length >= 2 && q.correct != null; });
    const play = function () {
      const order = shuffle(qs.map(function (_, i) { return i; }), rng(Date.now() % 99991));
      let at = 0, score = 0, streak = 0, best = 0, right = 0;
      const step = function () {
        clearNode(sh.stage);
        if (at >= order.length) {
          const perfect = right === qs.length;
          return endScreen(sh.stage, opts, {
            emoji: perfect ? '🏆' : right >= qs.length / 2 ? '🎉' : '💪',
            title: right + ' su ' + qs.length + ' giuste',
            lines: ['Punteggio: ' + score, best > 1 ? 'Serie migliore: ' + best + ' di fila' : ''].filter(Boolean),
            onReplay: play, result: { done: true, score: score, right: right, total: qs.length }
          });
        }
        const q = qs[order[at]];
        const view = quizOrder(q, Math.random);
        const head = h('div', { class: 'act-head' });
        head.appendChild(h('div', { class: 'act-title', text: act.title || 'Quiz' }));
        const stats = h('div', { class: 'act-stats' });
        stats.appendChild(h('span', { class: 'act-stat', text: (at + 1) + ' / ' + order.length }));
        const sc = h('span', { class: 'act-stat score', text: score + ' pt' });
        stats.appendChild(sc);
        if (streak >= 2) stats.appendChild(h('span', { class: 'act-stat fire', text: '🔥 ' + streak }));
        head.appendChild(stats);
        sh.stage.appendChild(head);
        const bar = h('div', { class: 'act-bar' }, h('div', { class: 'fill' }));
        bar.firstChild.style.width = (at / order.length * 100) + '%';
        sh.stage.appendChild(bar);
        sh.stage.appendChild(h('div', { class: 'quiz-q', text: q.q }));
        const grid = h('div', { class: 'quiz-opts' });
        let picked = false;
        view.options.forEach(function (op, i) {
          const b = h('button', { class: 'quiz-opt o' + i }, h('span', { class: 'mark' }), h('span', { class: 'txt', text: op }));
          b.addEventListener('click', function () {
            if (picked) return; picked = true;
            const okAns = i === view.correct;
            grid.classList.add('shown');
            grid.children[view.correct].classList.add('good');
            if (okAns) {
              right++; score += quizPoints(streak); streak++; best = Math.max(best, streak);
              sc.textContent = score + ' pt';
              b.classList.add('picked');
              if (opts && opts.sound) opts.sound();
            } else {
              streak = 0;
              b.classList.add('bad', 'picked');
            }
            setTimeout(function () { at++; step(); }, okAns ? 950 : 1600);
          });
          grid.appendChild(b);
        });
        sh.stage.appendChild(grid);
      };
      step();
    };
    play();
  }

  // ---------- ANAGRAMMA ----------
  function renderAnagram(container, act, opts) {
    const sh = shell(container, act, opts);
    const words = (act.data.words || []).filter(function (w) { return w.word && Array.from(w.word.trim()).length >= 3; });
    const play = function () {
      const order = shuffle(words.map(function (_, i) { return i; }), rng(Date.now() % 99989));
      let at = 0, hintsUsed = 0, right = 0;
      const step = function () {
        clearNode(sh.stage);
        if (at >= order.length) {
          return endScreen(sh.stage, opts, {
            emoji: right === words.length ? '🏆' : '🎉', title: right + ' su ' + words.length + ' parole ricomposte',
            lines: [hintsUsed ? hintsUsed + (hintsUsed === 1 ? ' aiuto' : ' aiuti') : 'Senza aiuti!'],
            onReplay: play, result: { done: true, right: right, total: words.length, hints: hintsUsed }
          });
        }
        const w = words[order[at]];
        const target = w.word.trim();
        const chars = Array.from(target);
        const head = h('div', { class: 'act-head' });
        head.appendChild(h('div', { class: 'act-title', text: act.title || 'Anagramma' }));
        const stats = h('div', { class: 'act-stats' });
        stats.appendChild(h('span', { class: 'act-stat', text: (at + 1) + ' / ' + order.length }));
        head.appendChild(stats);
        sh.stage.appendChild(head);
        const body = h('div', { class: 'ana-body' });
        sh.stage.appendChild(body);
        if (w.image) body.appendChild(h('div', { class: 'ana-img' }, h('img', { src: w.image, alt: '' })));
        if (w.hint) body.appendChild(h('div', { class: 'ana-hint', text: w.hint }));
        // slot della parola (gli spazi restano fissi) + tessere delle lettere
        const slots = h('div', { class: 'ana-slots' });
        const pool = h('div', { class: 'ana-pool' });
        const letters = anagramLetters(target, Math.random);
        const state = { fill: [] };   // tessere usate, in ordine
        chars.forEach(function (c) { slots.appendChild(h('div', { class: 'ana-slot' + (c === ' ' ? ' space' : '') })); });
        const slotEls = Array.prototype.slice.call(slots.children).filter(function (s) { return !s.classList.contains('space'); });
        const fb = h('div', { class: 'act-feedback' });
        const sync = function () {
          slotEls.forEach(function (s, i) { s.textContent = state.fill[i] ? state.fill[i].textContent : ''; s.classList.toggle('full', !!state.fill[i]); });
          if (state.fill.length === slotEls.length) {
            const guess = state.fill.map(function (t) { return t.textContent; }).join('');
            const want = chars.filter(function (c) { return c !== ' '; }).join('');
            if (L.normalize(guess) === L.normalize(want)) {
              right++;
              slots.classList.add('good');
              fb.textContent = '✓ ' + target;
              if (opts && opts.sound) opts.sound();
              setTimeout(function () { at++; step(); }, 1100);
            } else {
              slots.classList.add('no');
              setTimeout(function () { slots.classList.remove('no'); }, 500);
            }
          }
        };
        const put = function (tile) { if (tile.classList.contains('used') || state.fill.length >= slotEls.length) return; tile.classList.add('used'); state.fill.push(tile); sync(); };
        const back = function () { const t = state.fill.pop(); if (t) t.classList.remove('used'); slots.classList.remove('good'); sync(); };
        letters.forEach(function (c) {
          const t = h('button', { class: 'ana-tile', text: c });
          t.addEventListener('click', function () { put(t); });
          pool.appendChild(t);
        });
        slots.addEventListener('click', back);
        body.appendChild(slots);
        body.appendChild(pool);
        const row = h('div', { class: 'act-row' });
        row.appendChild(h('button', { class: 'act-btn ghost', text: '⌫ Togli', onclick: back }));
        row.appendChild(h('button', {
          class: 'act-btn ghost', text: '💡 Aiuto', onclick: function () {
            // mette al posto giusto la prossima lettera: rimette giù le tessere sbagliate se serve
            const want = chars.filter(function (c) { return c !== ' '; });
            let k = 0;
            while (k < state.fill.length && state.fill[k].textContent === want[k]) k++;
            while (state.fill.length > k) back();
            const tile = Array.prototype.find.call(pool.children, function (t) { return !t.classList.contains('used') && t.textContent === want[k]; });
            if (tile) { hintsUsed++; put(tile); }
          }
        }));
        row.appendChild(fb);
        body.appendChild(row);
      };
      step();
    };
    play();
  }

  // ---------- RUOTA ----------
  const WHEEL_COLORS = ['#e05252', '#e8a33d', '#3dae6b', '#3d7fe8', '#8a5cd6', '#d65c9e', '#3dbdc9', '#98a83d'];
  function renderWheel(container, act, opts) {
    const sh = shell(container, act, opts);
    const all = (act.data.items || []).filter(function (x) { return x.text; });
    const play = function () {
      clearNode(sh.stage);
      let left = all.slice();
      let angle = 0, spinning = false;
      const head = h('div', { class: 'act-head' });
      head.appendChild(h('div', { class: 'act-title', text: act.title || 'Ruota della fortuna' }));
      const stats = h('div', { class: 'act-stats' });
      const cnt = h('span', { class: 'act-stat', text: left.length + ' voci' });
      stats.appendChild(cnt);
      head.appendChild(stats);
      sh.stage.appendChild(head);
      const wrap = h('div', { class: 'wheel-wrap' });
      const pin = h('div', { class: 'wheel-pin', text: '▼' });
      const disk = h('div', { class: 'wheel' });
      wrap.appendChild(pin); wrap.appendChild(disk);
      const card = h('div', { class: 'wheel-card', hidden: 'hidden' });
      const draw = function () {
        clearNode(disk);
        const n = left.length;
        const per = 360 / n;
        const stops = left.map(function (_, i) { return WHEEL_COLORS[i % WHEEL_COLORS.length] + ' ' + (i * per) + 'deg ' + ((i + 1) * per) + 'deg'; });
        disk.style.background = 'conic-gradient(' + stops.join(',') + ')';
        left.forEach(function (it, i) {
          const lab = h('div', { class: 'wheel-label' }, h('span', { text: n <= 12 ? (it.text.length > 14 ? it.text.slice(0, 13) + '…' : it.text) : String(i + 1) }));
          lab.style.transform = 'rotate(' + ((i + 0.5) * per) + 'deg)';
          disk.appendChild(lab);
        });
        cnt.textContent = n + (n === 1 ? ' voce' : ' voci');
      };
      draw();
      const row = h('div', { class: 'act-row center' });
      const spinBtn = h('button', { class: 'act-btn primary big', text: 'GIRA! 🎡' });
      const keep = h('label', { class: 'act-check' }, (function () { const c = h('input', { type: 'checkbox' }); c.checked = true; return c; })(), ' togli le voci uscite');
      row.appendChild(spinBtn); row.appendChild(keep);
      sh.stage.appendChild(wrap);
      sh.stage.appendChild(row);
      sh.stage.appendChild(card);
      spinBtn.addEventListener('click', function () {
        if (spinning || !left.length) return;
        spinning = true; card.hidden = true; spinBtn.disabled = true;
        const extra = 4 * 360 + Math.floor(Math.random() * 360);
        angle += extra;
        disk.style.transition = 'transform 3.6s cubic-bezier(.12,.68,.16,1)';
        disk.style.transform = 'rotate(' + angle + 'deg)';
        setTimeout(function () {
          spinning = false; spinBtn.disabled = false;
          const i = wheelIndexAt(angle, left.length);
          const it = left[i];
          card.hidden = false;
          clearNode(card);
          card.appendChild(h('div', { class: 'wheel-pick', text: it.text }));
          if (opts && opts.sound) opts.sound();
          if (keep.querySelector('input').checked) {
            left.splice(i, 1);
            if (left.length) { disk.style.transition = 'none'; angle = 0; disk.style.transform = 'rotate(0deg)'; draw(); }
            else {
              const done = h('div', { class: 'act-row center' });
              done.appendChild(h('button', { class: 'act-btn ghost', text: '↺ Ricomincia', onclick: play }));
              if (opts && opts.onDone) done.appendChild(h('button', { class: 'act-btn primary', text: opts.doneLabel || 'Continua ▶', onclick: function () { opts.onDone({ done: true }); } }));
              card.appendChild(done);
              spinBtn.disabled = true;
            }
          }
        }, 3700);
      });
      if (opts && opts.onDone) {
        const skipRow = h('div', { class: 'act-row center' });
        skipRow.appendChild(h('button', { class: 'act-link', text: opts.doneLabel || 'Continua ▶', onclick: function () { opts.onDone({ done: false }); } }));
        sh.stage.appendChild(skipRow);
      }
    };
    play();
  }

  /** Renderer principale: disegna l'attività dentro container. opts: { onDone(result), doneLabel, celebrate(el), sound(), fx }.
   *  Ritorna l'elemento radice della scena (.act) o null se l'attività non è completa. */
  function render(container, act, opts) {
    const errs = validate(act);
    if (errs.length) {
      clearNode(container);
      container.appendChild(h('div', { class: 'act-invalid', text: 'Questa attività non è completa: ' + errs.join(' ') }));
      return null;
    }
    const o = opts || {};
    if (act.type === 'memory') renderMemory(container, act, o);
    else if (act.type === 'quiz') renderQuiz(container, act, o);
    else if (act.type === 'anagram') renderAnagram(container, act, o);
    else if (act.type === 'wheel') renderWheel(container, act, o);
    else return null;
    return container.querySelector('.act');
  }

  return { THEMES: THEMES, TYPES: TYPES, render: render, decorate: decorate, retheme: retheme, themeOf: themeOf, validate: validate, convert: convert, convertTargets: convertTargets, pairsOf: pairsOf, memoryDeck: memoryDeck, memoryCols: memoryCols, quizOrder: quizOrder, quizPoints: quizPoints, anagramLetters: anagramLetters, wheelIndexAt: wheelIndexAt, rng: rng, shuffle: shuffle };
});
