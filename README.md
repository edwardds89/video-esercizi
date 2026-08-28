# Video Esercizi

Genera esercizi di ascolto da un video YouTube: incolli il link e la trascrizione, scegli quanti esercizi vuoi e quanto deve durare il video per lo studente, e ottieni una bozza (segnaposto sulla timeline, 5 tipi di esercizio, parti da saltare) che puoi correggere in ogni dettaglio. Poi la apri in "modalità studente": il video salta le parti tagliate, si ferma da solo a ogni esercizio, lo studente può riascoltare la frase.

Nessun server, nessun database: è una pagina statica. Le lezioni vivono nel browser (localStorage) e nei file JSON che esporti.

## Mettere online (GitHub Pages)

1. Crea un repository su GitHub (es. `video-esercizi`) e carica tutti i file di questa cartella.
2. Su GitHub: **Settings → Pages → Build and deployment → Source: Deploy from a branch → Branch: main / (root)** → Save.
3. Dopo un minuto la pagina è su `https://TUO-UTENTE.github.io/video-esercizi/`.

Aprire `index.html` direttamente dal disco (file://) funziona solo in parte: il player YouTube ha bisogno di http(s). Per provare in locale: `python3 -m http.server 8123` nella cartella e apri `http://localhost:8123/`.

## Creare una lezione

**Con il pulsante per Chrome (consigliato).** Nella home dell'app trascina "▶ Video Esercizi" nella barra dei preferiti (è un bookmarklet: un preferito con dentro un piccolo codice, nessuna estensione da installare). Poi, su un video di YouTube, cliccalo: legge titolo, durata e trascrizione dal pannello di YouTube — nel tuo browser, senza server — e apre la nuova lezione già compilata. Se il video non ha la trascrizione, avvisa che non è utilizzabile a meno di inserirla a mano.

**A mano.**
1. **Nuova lezione** → incolla il link YouTube. Se il video parte nell'anteprima, l'embed è permesso (alcuni canali lo vietano: in quel caso compare un avviso).
2. Su YouTube, sotto il video: descrizione → **Mostra trascrizione** → seleziona tutto il testo del pannello → copia → incolla nel campo "Trascrizione". Vanno bene anche file `.srt` / `.vtt`.

**Poi, in entrambi i casi:**
3. Scegli numero di esercizi, durata per lo studente ("circa 10 minuti" = tolleranza del 10%, così non vengono tagliate parti utili per guadagnare pochi secondi; oppure tutto il video o una durata precisa), tipi, lingua, livello.
4. **Genera la bozza** → si apre l'editor:
   - i numeri sulla linea del tempo portano alla scheda dell'esercizio (non si trascinano: l'orario si cambia nel campo "ferma il video a");
   - per ogni esercizio: cambia tipo, frase, parole nascoste / mancanti / in più / sbagliate, intervallo di ascolto ("Ascolta" riproduce solo quella frase);
   - "Altra frase" propone la migliore alternativa vicino allo stesso punto; "Rigenera" cambia la variante;
   - i tagli si modificano, si aggiungono ("+ Taglio dal tempo corrente") e si eliminano; "Anteprima" riproduce da 3 secondi prima del taglio.
5. **Modalità studente** per provarla come la vedrà lo studente.

### Con o senza AI

- **Solo regole** (default senza chiave): sceglie le frasi per lunghezza, pause e densità lessicale; taglia intro, sponsor, appelli al pubblico e parti a bassa densità. Con le trascrizioni automatiche di YouTube (senza punteggiatura, tempi a secondi interi) la segmentazione in frasi è approssimativa: aspettati di correggere qualche frase a mano.
- **Con l'AI** (Impostazioni AI → chiave API Anthropic): il modello legge la trascrizione, sceglie frasi complete e adatte al livello, decide le parole da nascondere e propone i tagli spiegandone il motivo. Costo indicativo: 2-4 centesimi per un video di 13 minuti con `claude-sonnet-5`. La chiave resta nel tuo browser e viene inviata solo ad Anthropic; i link per gli studenti non la contengono. Non incollare mai la chiave nei file del repo.

## Dare la lezione agli studenti

Dall'editor, **Link studente**:

1. **Link con i dati inclusi**: lungo, ma funziona subito ovunque (WhatsApp, Classroom…).
2. **File nel repo**: scarica il JSON, mettilo in `lessons/` (es. `lessons/neuralink.json`), fai commit, e condividi `https://…/index.html?lesson=neuralink`.

Gli studenti non hanno bisogno di account. I risultati compaiono a fine video solo sul loro schermo (per ora non vengono salvati da nessuna parte).

## Limiti da conoscere

- Il video **non viene scaricato né tagliato**: i "tagli" sono salti durante la riproduzione con il player ufficiale di YouTube. È l'unico modo permesso dai termini di YouTube (niente overlay sopra il player, niente download, niente audio separato). Gli esercizi compaiono sotto/accanto al player, mai sopra.
- Serve una trascrizione con i tempi. Senza sottotitoli su YouTube il video **non è utilizzabile** (l'app lo dice chiaramente), a meno di scrivere la trascrizione a mano. Prenderla "in automatico" da un sito statico non è possibile: YouTube non la espone (niente CORS sugli endpoint interni, API ufficiale solo per i propri video); un server che la scarica sarebbe fuori dai termini di YouTube e viene bloccato a fasi alterne. Il bookmarklet legge il pannello che YouTube stesso mostra nel tuo browser.
- Il bookmarklet dipende dalla grafica del pannello trascrizione di YouTube: se cambia, va aggiornato `bookmarklet.js` (resta il copia-incolla come riserva).
- Se il proprietario disabilita l'embed o rimuove il video, la lezione smette di funzionare: controllalo prima di darla in classe.
- Il pannello "Mostra trascrizione" dà i tempi a secondi interi: i confini delle frasi sono stimati (±1 s). L'intervallo di ascolto ha un margine di sicurezza e si può correggere a mano.
- Le lezioni salvate nel browser si perdono se svuoti i dati del sito: esporta i JSON che ti interessano.

## Struttura

```
index.html      pagina unica (home, nuova lezione, editor, studente)
styles.css
app.js          interfaccia, player YouTube/finto, salvataggio, link
lang.js         stopword, CTA, coppie di parole per "wrong word", utilità di testo (it/en)
generator.js    parser trascrizione (YouTube/SRT/VTT), chunk, punteggi, selezione frasi, piano dei tagli
exercises.js    costruzione e correzione dei 5 tipi di esercizio
ai.js           prompt, chiamata al modello dal browser, validazione del piano, completamento con le regole
bookmarklet.js  pulsante per Chrome: legge il pannello trascrizione di YouTube e apre l'app con i dati (#import=…)
demo-data.js    trascrizione inventata per la lezione demo (player finto)
lessons/        JSON delle lezioni pubblicate (?lesson=nome)
test/           test del motore (node test/run.js), del livello AI (node test/ai.test.js), smoke test Playwright;
                fixture-neuralink.txt = trascrizione reale (Geopop) usata dai test; fake/ = pagina YouTube finta per testare il bookmarklet
tools/          make-demo.js rigenera demo-data.js
```

Test: `node test/run.js && node test/ai.test.js`. Smoke test end-to-end (serve Playwright): avvia un server statico sulla porta 8123 e lancia `node test/smoke.js`.

## Prossimi passi possibili

- Salvare i risultati degli studenti (serve un backend minimo o un servizio tipo Supabase).
- Esercizi di vocabolario prima del video (stile Wordwall) e slide, come blocchi della stessa "unità".
- Profili insegnante, condivisione tra colleghi, pagamenti.
