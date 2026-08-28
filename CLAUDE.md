# Video Esercizi — note per chi lavora sul codice

- App statica senza build: script classici caricati da index.html nell'ordine lang → exercises → generator → ai → demo-data → app.
- lang/generator/exercises/ai usano un wrapper UMD: funzionano sia nel browser (window.VLLang, VLEx, VLGen, VLAI) sia in Node (require).
- Test: `node test/run.js` (motore a regole), `node test/ai.test.js` (livello AI con fetch finta), `node test/smoke.js` (Playwright, serve un server statico su :8123 e `?mock=1&speed=8`).
- Il player YouTube non è testabile in sandbox senza rete: il player finto (`videoId: 'demo'` o `?mock=1`) implementa la stessa interfaccia (time/duration/seek/play/pause/state/destroy).
- Vincoli YouTube da rispettare: nessun overlay sopra il player, nessun download/estrazione audio, player almeno 200×200. Gli esercizi stanno fuori dal player.
- Lingua dell'interfaccia: italiano. Le lezioni sono salvate in localStorage (`vle.lessons`), la chiave API in `vle.settings`.
- Trascrizione: mai "scaricata" da server; arriva dal pannello di YouTube via bookmarklet (`#import=<base64url JSON {v,title,duration,transcript}>`) o incollata. Senza trascrizione → errore esplicito, il video non è utilizzabile.
- generator.js ha due modalità di chunk: "sentences" (trascrizioni con punteggiatura, tempi per parola interpolati) e "pauses" (sottotitoli automatici senza punteggiatura).
- "Durata circa N minuti" = target con tolleranza 10% (params.tolerance): il piano dei tagli smette di tagliare contenuto vero quando è dentro la tolleranza.
- Deploy su GitHub Pages: i tag <script>/<link> in index.html hanno `?v=DATA-N` per aggirare la cache CDN (10 min): a ogni upload di JS/CSS aumentare il numero.
- Sottotitoli YouTube: spegnerli con `setOption('captions','track',{})` ripetuto dopo il PLAYING; mai `unloadModule` (pulsante CC incoerente, sottotitoli che restano).
- Stage: il player non viene mai coperto; durante un esercizio si riduce nell'angolo (min 356×200) e l'esercizio occupa il resto dell'area (.stage.docked).
- Studente: la barra è libera di default (chi guida il video decide); `options.lock` / checkbox "Blocca la barra" impedisce di superare un esercizio da fare. Un esercizio scatta solo se il segnaposto viene attraversato guardando (confronto col tick precedente e col tempo reale), non con un salto della barra. Clic su un numero (timeline o pallini) = vai a quell'esercizio.
- Editor: campi tempo con frecce ↑↓ (±0,1 s, Maiusc ±1 s) e fuoco mantenuto dopo il ridisegno (`S.editor.focusKey`); "▶" accanto ai tempi riproduce esattamente da inizio a fine.
- Non usare la classe `.right` (margin-left:auto) per stati: la classe di "risposta giusta" sui chip è `.good`.
- Annunci YouTube: il player incorporato mostra pre-roll/mid-roll dei video monetizzati; l'app non può bloccarli (termini YouTube). Senza annunci solo con YouTube Premium nel browser o con il YouTube Player for Education (programma a licenza per piattaforme).
