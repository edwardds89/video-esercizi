/* Trascrizione sintetica in italiano (formato pannello YouTube) per i test: ~13 minuti, con intro, sponsor, capitoli, musica e chiusura. */
'use strict';

const SENTENCES = [
  // intro (0-25s)
  'ciao a tutti e bentornati sul canale oggi parliamo di come funziona il cervello',
  'se il video vi piace iscrivetevi al canale e attivate la campanella',
  // contenuto
  'il cervello umano contiene circa ottantasei miliardi di neuroni',
  'ogni neurone comunica con gli altri attraverso impulsi elettrici e chimici',
  'le sinapsi sono i punti di contatto tra un neurone e l\'altro',
  'quando impariamo qualcosa di nuovo le connessioni tra i neuroni si rafforzano',
  'questo fenomeno si chiama plasticità e continua per tutta la vita',
  'la corteccia motoria controlla i movimenti volontari del corpo',
  'se pensiamo di muovere una mano una zona precisa del cervello si attiva',
  'gli scienziati possono registrare questi segnali con piccoli elettrodi',
  'un chip impiantato nel cranio legge l\'attività di migliaia di neuroni',
  'i fili del chip sono più sottili di un capello umano',
  'un robot chirurgico li inserisce nella corteccia con grande precisione',
  'il dispositivo trasmette i dati al computer senza bisogno di cavi',
  'la batteria si ricarica dall\'esterno con un sistema a induzione',
  'il primo paziente ha ricevuto l\'impianto all\'inizio del duemilaventiquattro',
  'dopo poche settimane riusciva a muovere il cursore con il pensiero',
  'oggi gioca a scacchi sul computer usando soltanto la mente',
  'per una persona paralizzata questo cambia completamente la vita quotidiana',
  'ma la tecnologia non è ancora perfetta e i rischi restano molti',
  'alcuni fili si sono spostati e il segnale è diventato più debole',
  'gli ingegneri hanno aggiornato il software per compensare la perdita',
  'il cervello reagisce al corpo estraneo formando tessuto cicatriziale',
  'per questo motivo i materiali devono essere flessibili e biocompatibili',
  'altre aziende stanno sviluppando interfacce meno invasive',
  'alcune usano caschi con sensori che non richiedono alcun intervento',
  'la qualità del segnale però è molto più bassa rispetto agli impianti',
  'i ricercatori sperano di restituire la vista a chi l\'ha persa',
  'stimolando la corteccia visiva si possono creare piccoli punti di luce',
  'mettendo insieme molti punti si ottiene un\'immagine rudimentale',
  'la strada per una visione artificiale completa è ancora lunga',
  'un altro obiettivo è aiutare le persone che non riescono a parlare',
  'il chip riconosce le parole che il paziente immagina di pronunciare',
  'un programma le trasforma in voce sintetica in tempo reale',
  'nei test più recenti la velocità supera le sessanta parole al minuto',
  'restano aperte molte domande etiche su privacy e sicurezza dei dati',
  'chi possiede le informazioni che escono direttamente dal cervello',
  'e cosa succede se qualcuno riesce a violare il dispositivo',
  'le autorità sanitarie valutano ogni studio con molta attenzione',
  'prima di arrivare al pubblico serviranno anni di sperimentazione',
  // sponsor (dentro)
  'questa parte del video è sponsorizzata dal nostro partner di oggi',
  'con il codice sconto cervello avete il venti per cento sul primo ordine',
  'trovate il link in descrizione e ora torniamo a noi',
  // contenuto
  'la memoria a lungo termine dipende da una struttura chiamata ippocampo',
  'durante il sonno il cervello riorganizza le informazioni della giornata',
  'per questo studiare la sera e dormire bene aiuta a ricordare',
  'lo stress prolungato invece danneggia le connessioni tra i neuroni',
  'l\'attività fisica aumenta il flusso di sangue verso il cervello',
  'anche imparare una lingua straniera mantiene la mente in allenamento',
  'i bambini imparano più in fretta perché il loro cervello è più plastico',
  'ma anche gli adulti possono creare nuove connessioni a qualsiasi età',
  'la musica attiva contemporaneamente molte aree diverse del cervello',
  'suonare uno strumento migliora la coordinazione e la memoria di lavoro',
  'gli scienziati usano la risonanza magnetica per osservare il cervello in azione',
  'le immagini mostrano quali zone consumano più ossigeno in un dato momento',
  'in futuro potremo forse scrivere direttamente nella memoria',
  'oppure comunicare con un\'altra persona senza usare le parole',
  'per ora sono soltanto ipotesi ma la ricerca avanza molto velocemente',
  'ogni anno i chip diventano più piccoli e più potenti',
  'e i costi si riducono man mano che la produzione aumenta',
  'la domanda vera è se vogliamo davvero fondere mente e macchina',
  'gli antichi egizi pensavano che il cuore fosse la sede del pensiero',
  'solo nel diciassettesimo secolo si è capito il ruolo del cervello',
  'camillo golgi inventò un metodo per colorare i neuroni al microscopio',
  'santiago ramón y cajal disegnò le cellule nervose con precisione straordinaria',
  'i due ricevettero il premio nobel nello stesso anno pur essendo rivali',
  'il cervello pesa circa un chilo e quattrocento grammi negli adulti',
  'consuma però il venti per cento dell\'energia di tutto il corpo',
  'la maggior parte di questa energia serve a mantenere i segnali elettrici',
  'il lato sinistro controlla la parte destra del corpo e viceversa',
  'in molte persone il linguaggio si trova soprattutto nell\'emisfero sinistro',
  'il cervelletto coordina i movimenti e mantiene l\'equilibrio',
  'il tronco encefalico regola il respiro e il battito del cuore',
  'queste funzioni continuano anche quando dormiamo profondamente',
  'i sogni compaiono soprattutto nella fase chiamata sonno rem',
  'in quella fase gli occhi si muovono rapidamente sotto le palpebre',
  'il cervello di un adulto produce ogni giorno nuove cellule nell\'ippocampo',
  'fino a pochi anni fa gli scienziati pensavano che fosse impossibile',
  'la scoperta ha aperto nuove speranze per la cura delle malattie degenerative',
  'l\'alzheimer distrugge lentamente le connessioni tra i neuroni',
  'i primi sintomi riguardano la memoria degli eventi recenti',
  'i ricordi più vecchi resistono più a lungo perché sono distribuiti in molte aree',
  'la ricerca cerca molecole capaci di rallentare il processo',
  'alcuni farmaci recenti mostrano risultati incoraggianti ma limitati',
  'la prevenzione resta lo strumento più efficace che abbiamo',
  'una dieta equilibrata protegge i vasi sanguigni che nutrono il cervello',
  'il fumo e l\'alcol invece aumentano il rischio di danni permanenti',
  'anche le relazioni sociali mantengono attive molte funzioni cognitive',
  'chi vive isolato perde più rapidamente memoria e attenzione',
  'gli animali domestici aiutano a ridurre lo stress e a muoversi di più',
  'la meditazione modifica l\'attività delle aree legate all\'ansia',
  'bastano pochi minuti al giorno per notare i primi effetti',
  'i videogiochi allenano i riflessi ma non sostituiscono il movimento',
  'guardare troppi schermi la sera disturba la produzione di melatonina',
  'la luce blu convince il cervello che sia ancora giorno',
  'per dormire meglio conviene spegnere il telefono un\'ora prima',
  'una stanza fresca e buia favorisce un sonno profondo e continuo',
  'la caffeina resta in circolo per almeno sei ore dopo il caffè',
  'per questo un espresso dopo cena può rovinare la notte',
  'il cervello dei ragazzi si sviluppa fino ai venticinque anni circa',
  'l\'ultima area a maturare è quella che controlla le decisioni',
  'questo spiega perché gli adolescenti amano il rischio più degli adulti',
  'non è colpa loro ma del ritmo naturale dello sviluppo',
  'la scuola dovrebbe tenere conto di questi ritmi biologici',
  'iniziare le lezioni più tardi migliora i risultati degli studenti',
  'alcuni paesi hanno già sperimentato orari diversi con buoni risultati',
  'l\'intelligenza artificiale imita solo in parte il funzionamento del cervello',
  'le reti neurali artificiali usano numeri invece di impulsi elettrici',
  'un computer consuma migliaia di volte più energia per compiti simili',
  'il cervello impara da pochi esempi mentre una macchina ne richiede milioni',
  'però la macchina non si stanca e non dimentica mai nulla',
  'i due sistemi potrebbero collaborare invece di competere',
  'un chip potrebbe suggerire una parola quando la memoria non la trova',
  'oppure ricordare dove abbiamo lasciato le chiavi di casa',
  'sono scenari ancora lontani ma non più impossibili',
  'la cosa importante è decidere insieme quali limiti vogliamo darci',
  'la scienza offre strumenti ma le scelte spettano alla società',
  'il dibattito è appena iniziato e riguarda tutti noi',
  'per approfondire trovate nella descrizione alcuni articoli scientifici',
  'ho selezionato quelli scritti in modo chiaro anche per chi non è esperto',
  'nel prossimo episodio parleremo della memoria fotografica',
  'scopriremo se esiste davvero o se è soltanto una leggenda',
  'intanto provate a ricordare tre cose imparate oggi in questo video',
  'ripeterle a voce alta aiuta a fissarle nella memoria a lungo termine',
  'è un piccolo trucco che funziona anche prima di un esame',
  'sono curioso di sapere se lo userete davvero',
  // outro
  'e voi cosa ne pensate scrivetelo nei commenti qui sotto',
  'grazie per aver guardato il video fino alla fine',
  'ci vediamo al prossimo video ciao'
];

function fmt(sec) {
  const m = Math.floor(sec / 60), s = Math.floor(sec % 60);
  return m + ':' + (s < 10 ? '0' : '') + s;
}

/** Ritorna { text, duration, sentences } nel formato "0:00\ntesto" del pannello YouTube (righe di 4-8 parole). */
function youtubeTranscript(opts) {
  const o = Object.assign({ wordsPerSec: 2.1, chapters: true, music: true, punct: false }, opts || {});
  const rows = [];
  let t = 2.0;
  const spans = [];
  SENTENCES.forEach(function (s, si) {
    if (o.chapters && si === 2) rows.push('Come funziona il cervello');
    if (o.chapters && si === 43) rows.push('Memoria e apprendimento');
    if (o.music && si === 20) { rows.push(fmt(t)); rows.push('[Musica]'); t += 6; }
    const words = s.split(' ');
    const start = t;
    let i = 0;
    while (i < words.length) {
      const n = Math.min(words.length - i, 4 + ((si + i) % 4));
      let line = words.slice(i, i + n).join(' ');
      rows.push(fmt(t));
      rows.push(line);
      t += n / o.wordsPerSec;
      i += n;
    }
    spans.push({ start: start, end: t, text: s });
    t += 0.6 + ((si * 7) % 5) * 0.35; // pausa tra frasi (0.6–2.0s)
    if (si === 41) t += 5; // pausa lunga dopo lo sponsor
  });
  return { text: rows.join('\n'), duration: Math.ceil(t + 4), sentences: spans };
}

function srtTranscript() {
  const y = youtubeTranscript();
  const out = [];
  let idx = 1;
  y.sentences.forEach(function (s) {
    const a = s.start, b = s.end;
    const f = function (x) { const h = Math.floor(x / 3600), m = Math.floor((x % 3600) / 60), se = (x % 60); return String(h).padStart(2, '0') + ':' + String(m).padStart(2, '0') + ':' + se.toFixed(3).padStart(6, '0').replace('.', ','); };
    out.push(String(idx++)); out.push(f(a) + ' --> ' + f(b)); out.push(s.text); out.push('');
  });
  return { text: out.join('\n'), duration: y.duration };
}

module.exports = { SENTENCES: SENTENCES, youtubeTranscript: youtubeTranscript, srtTranscript: srtTranscript, fmt: fmt };
