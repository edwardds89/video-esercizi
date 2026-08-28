/* bookmarklet.js — pulsante per la barra dei preferiti: da una pagina "watch" di YouTube legge titolo, durata e
   pannello trascrizione (nel browser dell'utente, senza server) e apre l'app con tutto già compilato.
   L'app costruisce il link "javascript:" da questa funzione (vedi app.js → bookmarkletUrl). */
window.VL_BOOKMARKLET = function (APP) {
  function b64url(s) { return btoa(unescape(encodeURIComponent(s))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, ''); }
  var id = null;
  try { id = new URL(location.href).searchParams.get('v'); } catch (e) { /* ignore */ }
  if (!/youtube\.com\/watch/.test(location.href) || !id) { alert('Apri prima un video su YouTube (pagina del video), poi clicca il pulsante.'); return; }
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
