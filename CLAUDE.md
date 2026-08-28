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
