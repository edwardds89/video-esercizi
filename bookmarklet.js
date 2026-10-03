/* bookmarklet.js — pulsante per la barra dei preferiti: da una pagina "watch" di YouTube legge titolo, durata e
   pannello trascrizione (nel browser dell'utente, senza server) e apre l'app con tutto già compilato.
   v120: sulla pagina di una video-lezione ISLCollective legge invece la lezione (esercizi, tempi, tagli) dal
   <script id="__NEXT_DATA__"> e apre l'app con #platform=… ("Importa da altre piattaforme", vedi platforms.js).
   v126: sulla pagina di un quiz Wayground/Quizizz legge il quiz dall'API del sito e apre l'app con #platform=….
   L'app costruisce il link "javascript:" da questa funzione (vedi app.js → bookmarkletUrl). */
window.VL_BOOKMARKLET = function (APP) {
  function b64url(s) { return btoa(unescape(encodeURIComponent(s))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, ''); }
  if (/(^|\.)islcollective\.com$/i.test(location.hostname)) {
    var res = null;
    try {
      var nd = JSON.parse(document.getElementById('__NEXT_DATA__').textContent);
      res = nd.props.pageProps.initialState.resource.resourceProfile.resource;
    } catch (e) { /* struttura diversa: gestito sotto */ }
    if (!res || !res.questions || !res.questions.length) { alert('Apri la pagina di una TUA video-lezione su ISLCollective (quella con il video e le domande), poi clicca il pulsante.'); return; }
    var c = function (s) { return String(s || '').replace(/\s+/g, ' ').trim(); };
    var slim = {
      site: 'islcollective', id: String(res.resourceId || res.id || ''), url: res.frontendUrl || '',
      title: c(res.videoTitle || res.title || res.headline), videoUrl: res.videoUrl || '', language: res.language || '',
      duration: res.duration || res.videoLength || 0, level: ((res.levels || [])[0] || {}).text || '',
      skips: (res.skips || []).map(function (s) { return { start: s.start, end: s.end }; }),
      questions: res.questions.filter(function (q) { return q && !q.hidden; }).map(function (q) {
        return { type: q.questionType, time: q.time, hint: q.hint, question: q.question || '', data: q.questionData || {} };
      })
    };
    location.href = APP + '#platform=' + b64url(JSON.stringify(slim));
    return;
  }
  if (/(^|\.)(wayground|quizizz)\.com$/i.test(location.hostname)) {
    // v126: quiz di Wayground (ex Quizizz) → set di esercizi. I dati si chiedono all'API del sito con la sessione
    // dell'insegnante (stessa origine: niente CORS). Stessa riduzione di VLPlat.wgSlim (platforms.js).
    var qid = (location.pathname.match(/[0-9a-f]{24}/i) || [])[0];
    if (!qid) { alert('Apri su Wayground la pagina di un TUO quiz (quella con l\'elenco delle domande), poi clicca il pulsante.'); return; }
    fetch('/api/main/quiz/' + qid, { credentials: 'include' }).then(function (r) { return r.json(); }).then(function (j) {
      var q = j && j.data && j.data.quiz, info = q && q.info;
      if (!info || !info.questions || !info.questions.length) { alert('Non riesco a leggere le domande di questo quiz: sei entrato su Wayground con il tuo account?'); return; }
      var slim = { site: 'wayground', id: String(q._id || qid), title: String(info.name || '').replace(/\s+/g, ' ').trim(), language: info.lang || '',
        questions: info.questions.map(function (x) {
          var st = x.structure || {};
          return { id: String(x._id || ''), type: x.type, html: (st.query && st.query.text) || '',
            options: (st.options || []).map(function (o) { return { id: String(o.id || o._id || ''), text: o.text || '' }; }),
            answer: st.answer, explain: (st.explain && st.explain.text) || '', accents: !!(st.settings && st.settings.ignoreAccentMarksForEvaluation) };
        }) };
      location.href = APP + '#platform=' + b64url(JSON.stringify(slim));
    }).catch(function (e) { alert('Wayground non ha risposto (' + e.message + '): ricarica la pagina del quiz e riprova.'); });
    return;
  }
  if (/(^|\.)wordwall\.net$/i.test(location.hostname)) {
    // v179: attività di Wordwall → set di esercizi. window.pageData dice quale attività è; il contenuto è un JSON sul CDN
    // di Wordwall (stessa riduzione di VLPlat.wwSlim in platforms.js). Per ora solo le attività fatte di COPPIE.
    var pd = window.pageData || {};
    if (!pd.activityGuid || !pd.authorUserId) { alert('Apri su Wordwall la pagina di una TUA attività (quella dove si gioca), poi clicca il pulsante.'); return; }
    fetch('https://user.cdn.wordwall.net/content-models/' + pd.authorUserId + '/' + pd.activityGuid + '.json').then(function (r) { return r.json(); }).then(function (m) {
      var c = m && m.content, tx = function (x) { var d = document.createElement('div'); d.innerHTML = String((x && x.text) || ''); return (d.textContent || '').replace(/\s+/g, ' ').trim(); };
      if (!c || !c.pairs || !c.pairs.length) { alert('Questo tipo di attività di Wordwall non lo so ancora importare (template ' + (m && m.templateId) + ', contenuto: ' + Object.keys(c || {}).join(', ') + '). Per ora importo le attività fatte di coppie (Match up e simili). Manda questo messaggio a chi cura PauseLearn.'); return; }
      var slim = { site: 'wordwall', id: String(pd.activityId || ''), title: String(pd.activityTitle || '').replace(/\s+/g, ' ').trim(), templateId: m.templateId,
        pairs: c.pairs.map(function (p) { return { a: tx(p.primary), b: tx(p.secondary), img: (p.secondary && p.secondary.image) || (p.primary && p.primary.image) || '' }; }) };
      location.href = APP + '#platform=' + b64url(JSON.stringify(slim));
    }).catch(function (e) { alert('Wordwall non ha risposto (' + e.message + '): ricarica la pagina dell\'attività e riprova.'); });
    return;
  }
  if (/(^|\.)learningapps\.org$/i.test(location.hostname)) {
    // v181: app di LearningApps → set di esercizi. I dati (AppClientAppData) stanno nel riquadro più interno della pagina
    // (display → watch.php → show.php, stessa origine): si cerca lì dentro. Stessa riduzione di VLPlat.laSlim.
    var find = function (w, depth) {
      try { if (w.AppClientAppData && w.AppClientAppData.initparameters) return w.AppClientAppData; } catch (e) { return null; }
      if (depth > 4) return null;
      try { for (var i = 0; i < w.frames.length; i++) { var r = find(w.frames[i], depth + 1); if (r) return r; } } catch (e) { /* riquadro di un altro sito */ }
      return null;
    };
    var D = find(window, 0);
    if (!D) { alert('Apri su LearningApps la pagina di una app (quella dove si gioca), aspetta che sia caricata, poi clicca il pulsante.'); return; }
    if (String(D.tool) !== '140') { alert('Questo tipo di app di LearningApps non lo so ancora importare (tool ' + D.tool + '). Per ora importo "Testo con lacune". Manda questo messaggio a chi cura PauseLearn.'); return; }
    var q = {}; String(D.initparameters).split('&').forEach(function (kv) { var i = kv.indexOf('='); if (i < 1) return; var k = kv.slice(0, i), v = kv.slice(i + 1); try { k = decodeURIComponent(k.replace(/\+/g, ' ')); v = decodeURIComponent(v.replace(/\+/g, ' ')); } catch (e) { /* com'è */ } if (!/^(backgroundImage|feedback)$/.test(k)) q[k] = v; });
    var st = function (h) { var d = document.createElement('div'); d.innerHTML = String(h || ''); return (d.textContent || '').replace(/\s+/g, ' ').trim(); };
    var lid = ''; try { var u = new URL(location.href); lid = u.searchParams.get('v') || u.searchParams.get('id') || ''; } catch (e) { /* ignore */ }
    location.href = APP + '#platform=' + b64url(JSON.stringify({ site: 'learningapps', id: lid, title: st(D.title), tool: String(D.tool), task: st(D.tasktext), p: q, sample: String(q.clozetext || '').replace(/\s+/g, ' ').trim() }));
    return;
  }
  var id = null;
  try { id = new URL(location.href).searchParams.get('v'); } catch (e) { /* ignore */ }
  if (!/youtube\.com\/watch/.test(location.href) || !id) { alert('Apri prima un video su YouTube (pagina del video), una tua video-lezione su ISLCollective, un tuo quiz su Wayground, una tua attività su Wordwall o una tua app su LearningApps, poi clicca il pulsante.'); return; }
  var title = document.title.replace(/^\(\d+\)\s*/, '').replace(/\s*-\s*YouTube\s*$/, '');
  var video = document.querySelector('video');
  var duration = (video && video.duration) || 0;
  if (video) { try { video.pause(); } catch (e) { /* ignore */ } }

  function dedupe(arr) {
    // il DOM di YouTube può contenere ogni segmento due volte (pannello vecchio + nuovo): tieni una sola copia
    var seen = {}, out = [];
    for (var i = 0; i < arr.length; i++) { if (!seen[arr[i]]) { seen[arr[i]] = 1; out.push(arr[i]); } }
    return out;
  }
  function fromDom() {
    var segs = Array.prototype.slice.call(document.querySelectorAll('ytd-transcript-segment-renderer'));
    if (segs.length >= 3) {
      return dedupe(segs.map(function (s) {
        var t = (s.querySelector('.segment-timestamp') || {}).textContent || '';
        var x = (s.querySelector('.segment-text') || {}).textContent || '';
        return t.trim() + ' ' + x.trim().replace(/\s+/g, ' ');
      }));
    }
    // solo il pannello della trascrizione: quello dei capitoli ha lo stesso aspetto (tempi + titoli) ma non è una trascrizione
    var panels = Array.prototype.slice.call(document.querySelectorAll('ytd-engagement-panel-section-list-renderer'))
      .filter(function (p) {
        var tid = (p.getAttribute('target-id') || '').toLowerCase();
        if (/chapter|macro-markers|comments|description/.test(tid)) return false;
        var head = (((p.querySelector('#header') || {}).innerText || '') + ' ' + (p.innerText || '').slice(0, 400)).toLowerCase();
        return p.getAttribute('visibility') === 'ENGAGEMENT_PANEL_VISIBILITY_EXPANDED' && (/transcript/.test(tid) || /trascrizione|transcript/.test(head));
      });
    for (var i = 0; i < panels.length; i++) {
      var lines = (panels[i].innerText || '').split('\n'), out = [];
      for (var k = 0; k < lines.length; k++) {
        var l = lines[k].trim();
        if (/^\d{1,2}:\d{2}(:\d{2})?$/.test(l)) {
          var j = k + 1;
          if (j < lines.length && /^\d+\s+(second|minute|hour|secondi|minut|or[ae])/i.test(lines[j].trim())) j++;
          out.push(l + ' ' + (lines[j] || '').trim().replace(/\s+/g, ' '));
          k = j;
        }
      }
      if (out.length >= 3) return dedupe(out);
    }
    return null;
  }
  function openPanel() {
    var ex = document.querySelector('#description-inline-expander #expand, tp-yt-paper-button#expand');
    if (ex) { try { ex.click(); } catch (e) { /* ignore */ } }
    var btn = document.querySelector('ytd-video-description-transcript-section-renderer button, [target-id*="transcript"] button, button[aria-label*="rascrizione" i], button[aria-label*="ranscript" i]');
    if (!btn) btn = Array.prototype.slice.call(document.querySelectorAll('button')).filter(function (b) {
      return /transcript|trascrizione/i.test((b.textContent || '') + ' ' + (b.getAttribute('aria-label') || ''));
    })[0];
    if (btn) { try { btn.click(); } catch (e) { /* ignore */ } }
    return !!btn;
  }
  function go(segs) {
    var payload = { v: id, title: title, duration: Math.round(duration), transcript: segs.join('\n') };
    location.href = APP + '#import=' + b64url(JSON.stringify(payload));
  }
  var segs = fromDom();
  if (segs) { go(segs); return; }
  var hadButton = openPanel();
  var tries = 0;
  (function poll() {
    segs = fromDom();
    if (segs) { go(segs); return; }
    if (tries === 12 && !hadButton) hadButton = openPanel();   // secondo tentativo: la descrizione può aprirsi in ritardo
    if (++tries > 50) {
      alert('Trascrizione non disponibile per questo video: NON è utilizzabile con Video Esercizi, a meno di inserire la trascrizione a mano nell\'app.' +
        (hadButton ? ' (Il pannello "Trascrizione" non si è aperto: prova ad aprirlo tu — descrizione → Mostra trascrizione — e clicca di nuovo il pulsante.)' : ' (Non trovo il pulsante "Mostra trascrizione" nella pagina.)'));
      return;
    }
    setTimeout(poll, 300);
  })();
};
