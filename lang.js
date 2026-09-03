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
      'buona visione', 'benvenuti', 'bentornati', 'grazie per', 'abbonarvi', 'abbonatevi',
      'abbonamento', 'mecenati', 'meccenati', 'sostenerci', 'sosteneteci', 'membri del canale', 'iscriversi al canale', 'torniamo al video',
      'vi ringrazio', 'ringrazio anche', 'appuntamento qui', 'per il supporto'],
    en: ['subscribe', 'subscribing', 'sponsor', 'sponsored', 'promo code', 'discount code', 'link in the description', 'description below',
      'in the description', 'description of the video', 'patreon', 'like button', 'hit the bell', 'notifications', 'comment below', 'in the comments', 'follow me',
      'next video', 'previous video', 'see you', 'thanks for watching', 'stay tuned', 'merch', 'giveaway', 'welcome back', 'welcome to',
      'join the channel', 'become a member', 'support us', 'back to the video',
      'thank you for watching', 'thanks to our']
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

  // segnali di digressione / esempio / dettaglio: candidati ai tagli quando serve accorciare
  const DIGRESSION = {
    it: ['per esempio', 'ad esempio', "tra l'altro", 'a proposito', 'piccola parentesi', 'parentesi', 'curiosita', 'per inciso', 'detto questo', 'nota a margine', 'piccola nota', 'per la cronaca', 'tra parentesi', 'un esempio', 'facciamo un esempio', 'immaginate', 'pensate che'],
    en: ['for example', 'for instance', 'by the way', 'side note', 'fun fact', 'incidentally', 'as an aside', 'imagine', 'think about it', 'let me give you an example']
  };
  function isDigression(text, lang) {
    const t = normalize(text);
    const list = DIGRESSION[lang] || DIGRESSION.it;
    return list.some(function (k) { return t.indexOf(normalize(k)) !== -1; });
  }
  // Parole "trasparenti" per chi parla inglese (cognati latini): globale/global, specifico/specific, informazione/information…
  // Euristica sulle desinenze: non perfetta, ma evita di proporre come "utili" parole che uno studente anglofono capisce a colpo d'occhio.
  const COGNATE_IT_EN = /(zione|sione|ale|ali|ico|ica|ici|iche|ità|ita|mento|menti|enza|enze|anza|anze|ore|ori|ista|isti|ismo|ismi|ura|ure|ivo|iva|ivi|ive|oso|osa|osi|ose|abile|ibile|abili|ibili|ario|aria|ente|enti|ante|anti)$/;
  // ---------- lessico di base (A1-A2): quello che uno studente B1 SA GIÀ ----------
  // Segnalato da Edoardo il 3/9 ('per livello B1 "abbiamo" "quattro" "sappiamo" che significa? sono parole troppo facili!'):
  // la vecchia lista aveva solo i lemmi (sapere, avere), ma nel parlato ci sono le forme coniugate (sappiamo, abbiamo),
  // e non aveva numeri, giorni, pronomi, quantificatori. Due liste:
  //  - FORME: irregolari, numeri, giorni, mesi, pronomi, quantificatori, avverbi → confronto diretto;
  //  - LEMMI: verbi all'infinito, nomi al singolare, aggettivi al maschile → ci si arriva togliendo le desinenze regolari (guessLemmas).
  const BASIC_IT_FORMS = new Set(('' +
    // numeri e ordinali
    ' uno una due tre quattro cinque sei sette otto nove dieci undici dodici tredici quattordici quindici sedici diciassette diciotto diciannove venti trenta quaranta cinquanta sessanta settanta ottanta novanta cento mille duemila milione milioni miliardo miliardi primo prima primi prime secondo seconda terzo terza quarto quarta quinto quinta sesto settimo ottavo nono decimo ultimo ultima ultimi ultime metà mezzo mezza doppio doppia' +
    // giorni, mesi, tempo
    ' lunedì martedì mercoledì giovedì venerdì sabato domenica gennaio febbraio marzo aprile maggio giugno luglio agosto settembre ottobre novembre dicembre oggi domani ieri stasera stamattina adesso ora ore sempre mai spesso presto tardi subito ancora già poi dopo prima intanto mattina mattino sera notte pomeriggio settimana settimane mese mesi anno anni giorno giorni minuto minuti secondo secondi momento momenti volta volte tempo tempi stagione estate inverno autunno primavera weekend fine' +
    // pronomi, possessivi, dimostrativi, quantificatori
    ' io tu lui lei noi voi loro egli esso essa essi esse mio mia miei mie tuo tua tuoi tue suo sua suoi sue nostro nostra nostri nostre vostro vostra vostri vostre questo questa questi queste quello quella quelli quelle quegli quel quei alcuni alcune alcuno alcuna qualche ogni tutti tutte tutto tutta molto molti molte molta poco pochi poche poca tanto tanti tante tanta troppo troppi troppe troppa altro altri altre altra stesso stessa stessi stesse nessuno nessuna niente nulla qualcosa qualcuno qualcuna ognuno ognuna ciascuno entrambi entrambe parecchi parecchie vari varie certo certa certi certe tale tali quale quali quanto quanta quanti quante chi cosa chiunque qualunque qualsiasi' +
    // avverbi e parole funzionali molto frequenti
    ' sì no non anche neanche nemmeno neppure forse magari quasi solo soltanto proprio davvero veramente abbastanza piuttosto ancora invece però quindi allora perché perciò dunque infatti cioè insomma comunque almeno soprattutto bene male meglio peggio così come dove quando mentre finché appena sopra sotto dentro fuori davanti dietro vicino lontano qui qua lì là via sinistra destra insieme intorno attraverso verso contro senza tra fra durante secondo circa oltre ecco pure inoltre altrimenti purtroppo sicuramente probabilmente esattamente naturalmente ovviamente certamente generalmente specialmente praticamente semplicemente' +
    // essere
    ' sono sei è siamo siete ero eri era eravamo eravate erano sarò sarai sarà saremo sarete saranno stato stata stati state sia siano sarei saresti sarebbe saremmo sareste sarebbero fossi fosse fossimo fossero essendo essere' +
    // avere
    ' ho hai ha abbiamo avete hanno avevo avevi aveva avevamo avevate avevano avrò avrai avrà avremo avrete avranno avuto avuta avuti avute abbia abbiano avrei avresti avrebbe avremmo avreste avrebbero avessi avesse avessero avendo avere' +
    // fare dire andare venire stare dare
    ' faccio fai fa facciamo fate fanno facevo facevi faceva facevamo facevate facevano farò farai farà faremo farete faranno fatto fatta fatti fatte faccia facciano facessi facesse farei faresti farebbe farebbero facendo fare' +
    ' dico dici dice diciamo dite dicono dicevo dicevi diceva dicevamo dicevate dicevano dirò dirai dirà diremo direte diranno detto detta detti dette dica dicano direi direbbe dicendo dire' +
    ' vado vai va andiamo andate vanno andavo andavi andava andavamo andavate andavano andrò andrai andrà andremo andrete andranno andato andata andati andate vada vadano andrei andrebbe andando andare' +
    ' vengo vieni viene veniamo venite vengono venivo venivi veniva venivamo venivate venivano verrò verrai verrà verremo verrete verranno venuto venuta venuti venute venga vengano verrei verrebbe venendo venire' +
    ' sto stai sta stiamo state stanno stavo stavi stava stavamo stavate stavano starò starai starà staremo starete staranno stia stiano starei starebbe stando stare' +
    ' do dai dà diamo date danno davo davi dava davamo davate davano darò darai darà daremo darete daranno dato data dati date dia diano darei darebbe dando dare' +
    // sapere potere volere dovere vedere tenere rimanere uscire piacere
    ' so sai sa sappiamo sapete sanno sapevo sapevi sapeva sapevamo sapevate sapevano saprò saprai saprà sapremo saprete sapranno saputo saputa sappia sappiano saprei saprebbe sapendo sapere' +
    ' posso puoi può possiamo potete possono potevo potevi poteva potevamo potevate potevano potrò potrai potrà potremo potrete potranno potuto potuta possa possano potrei potresti potrebbe potremmo potreste potrebbero potendo potere' +
    ' voglio vuoi vuole vogliamo volete vogliono volevo volevi voleva volevamo volevate volevano vorrò vorrai vorrà vorremo vorrete vorranno voluto voluta voglia vogliano vorrei vorresti vorrebbe vorremmo vorreste vorrebbero volendo volere' +
    ' devo devi deve dobbiamo dovete devono dovevo dovevi doveva dovevamo dovevate dovevano dovrò dovrai dovrà dovremo dovrete dovranno dovuto dovuta debba debbano dovrei dovresti dovrebbe dovremmo dovreste dovrebbero dovendo dovere' +
    ' vedo vedi vede vediamo vedete vedono vedevo vedeva vedevano vedrò vedrai vedrà vedremo vedrete vedranno visto vista visti viste veda vedano vedrei vedrebbe vedendo vedere' +
    ' tengo tieni tiene teniamo tenete tengono tenevo teneva tenevano terrò terrà terranno tenuto tenuta tenga tenere' +
    ' rimango rimani rimane rimaniamo rimanete rimangono rimanevo rimaneva rimanevano rimarrò rimarrà rimarranno rimasto rimasta rimasti rimaste rimanga rimanere' +
    ' esco esci esce usciamo uscite escono uscivo usciva uscivano uscirò uscirà uscito uscita usciti uscite esca uscire' +
    ' piaccio piaci piace piacciamo piacete piacciono piaceva piacevano piacerà piaciuto piaciuta piaccia piacere' +
    // participi e forme irregolari di verbi comuni
    ' preso presa presi prese messo messa messi messe letto letta letti lette scritto scritta scritti scritte aperto aperta aperti aperte chiuso chiusa chiusi chiuse perso persa persi perse vinto vinta morto morta morti morte nato nata nati nate scelto scelta scelti scelte chiesto chiesta risposto risposta deciso decisa vissuto vissuta successo successa conosciuto conosciuta bevuto bevuta rotto rotta corso corsa offerto offerta scoperto scoperta detto fatto stato venuto rimasto visto capito capita' +
    ' bevo bevi beve beviamo bevete bevono muoio muori muore moriamo muoiono siedo siedi siede sediamo siedono scelgo scegli sceglie scegliamo scelgono esco tolgo togli toglie tolgono salgo sali sale saliamo salgono' +
    // parole di base che non seguono le regole
    ' città realtà società università qualità possibilità difficoltà verità libertà attività novità età caffè tè perché' +
    '').split(/\s+/).filter(Boolean).map(function (w) { return normalize(w); }));
  const BASIC_IT_WORDS = new Set(('' +
    // nomi (singolare)
    ' casa tempo anno giorno mano acqua cibo bocca dente testa occhio piede gamba braccio cuore corpo capello faccia naso orecchio uomo donna bambino bambina ragazzo ragazza signore signora amico amica famiglia madre padre mamma papà figlio figlia fratello sorella nonno nonna zio zia marito moglie genitore bambino scuola classe lezione compito esame lavoro ufficio libro quaderno penna tavolo sedia porta finestra letto cucina bagno camera stanza casa palazzo strada via piazza città paese regione mondo vita morte sole luna cielo mare terra fuoco aria notte mattina sera pomeriggio settimana mese ora minuto secondo numero nome cognome parola lingua frase domanda risposta cosa persona gente soldi euro prezzo negozio mercato supermercato ristorante bar pane latte carne pesce frutta verdura vino birra caffè zucchero sale olio pasta pizza pranzo cena colazione colore rosso verde blu bianco nero giallo macchina auto treno aereo autobus bicicletta stazione aeroporto viaggio vacanza albergo biglietto telefono cellulare computer internet foto film musica canzone televisione giornale sport calcio partita gioco festa regalo animale cane gatto cavallo albero fiore giardino parco montagna fiume lago spiaggia isola campagna aria pioggia neve vento freddo caldo problema idea motivo esempio modo tipo parte punto posto luogo fine inizio centro storia paese governo stato legge politica guerra pace medico dottore ospedale malattia salute medicina studente insegnante professore maestro amore paura piacere bisogno voglia ragione torto fame sete sonno porta chiave borsa vestito scarpa cappotto camicia pantaloni maglia giacca carta lettera messaggio email indirizzo banca ufficio azienda società ditta cliente capo collega soldo prezzo conto denaro' +
    // aggettivi (maschile singolare)
    ' grande piccolo nuovo vecchio buono cattivo bello brutto caldo freddo alto basso lungo corto breve veloce lento facile difficile aperto chiuso pieno vuoto pulito sporco felice contento triste stanco malato sano forte debole giovane anziano ricco povero vero falso importante possibile impossibile primo ultimo prossimo scorso stesso altro libero occupato pronto giusto sbagliato uguale diverso simile caro economico gratis gratuito grosso magro grasso largo stretto leggero pesante dolce salato amaro buono famoso interessante noioso divertente strano normale semplice chiaro scuro sicuro pericoloso tranquillo nervoso gentile simpatico antipatico intelligente stupido bravo capace utile inutile necessario pubblico privato italiano inglese francese spagnolo tedesco americano europeo straniero moderno antico intero completo solo unico vicino lontano' +
    // avverbi e altro
    ' molto poco tanto troppo bene male sempre mai spesso ancora già presto tardi subito insieme lontano vicino').split(/\s+/).filter(Boolean).map(function (w) { return normalize(w); }));
  const BASIC_IT_VERBS = new Set(('' +
    // verbi (infinito)
    ' mangiare bere dormire andare venire fare dire vedere sentire parlare leggere scrivere aprire chiudere prendere dare mettere sapere volere potere dovere piacere pensare guardare ascoltare camminare correre lavorare studiare giocare comprare vendere pagare aiutare chiamare aspettare cercare trovare perdere vincere iniziare cominciare finire arrivare partire entrare uscire salire scendere tornare restare rimanere vivere morire nascere crescere cambiare usare provare capire credere sperare amare odiare ricordare dimenticare stare essere avere portare lasciare chiedere rispondere conoscere sembrare servire succedere diventare tenere sedere viaggiare cucinare pulire lavare ridere piangere imparare insegnare spiegare raccontare decidere scegliere mostrare significare esistere bastare contare costare abitare tornare passare spendere mandare inviare ricevere telefonare incontrare invitare visitare preparare cantare ballare nuotare suonare dipingere disegnare dimenticare svegliare alzare vestire mettere togliere accendere spegnere chiudere aprire entrare girare fermare muovere cadere spingere tirare tagliare rompere costruire riparare offrire regalare desiderare preferire piacere interessare bisognare sembrare parere accadere avvenire riuscire provare cercare permettere vietare sperare temere dubitare crescere durare mancare restare rimanere sedere seguire smettere continuare cominciare finire terminare tenere ottenere ricevere perdere trovare scoprire coprire scendere salire volare guidare parcheggiare').split(/\s+/).filter(Boolean).map(function (w) { return normalize(w); }));
  // Desinenze regolari (senza accenti: le forme vengono normalizzate). Per ciascuna si prova lo stem + are/ere/ire.
  const V_END = ('iamo ate ete ite ano ono isco isci isce iscono isca iscano avo avi ava avamo avate avano evo evi eva evamo evate evano ivo ivi iva ivamo ivate ivano ' +
    'ero erai era eremo erete eranno erei eresti erebbe eremmo ereste erebbero iro irai ira iremo irete iranno irei iresti irebbe iremmo ireste irebbero ' +
    'ato ata ati ate uto uta uti ute ito ita iti ite ando endo iate ino o i a e').split(' ').sort(function (a, b) { return b.length - a.length; });
  function guessLemmas(n) {
    // due liste separate: le desinenze VERBALI si confrontano solo con gli infiniti, quelle nominali solo con nomi/aggettivi.
    // Senza questa separazione "cellule" → "cellul"+"are" = "cellulare" (il telefono) e la parola sembrava di base.
    const v = [], w = [];
    for (const e of V_END) {
      if (n.length - e.length < 2 || !n.endsWith(e)) continue;
      const st = n.slice(0, -e.length);
      v.push(st + 'are', st + 'ere', st + 'ire');
      if (e.charAt(0) === 'i' && st.length > 2) v.push(st.slice(0, -1) + 'ire');   // isc-: fin-isco → finire
      if (/c$|g$/.test(st) && (e === 'ano' || e === 'ono' || e === 'o')) v.push(st + 'iare');
    }
    // nomi e aggettivi: plurale/femminile → maschile singolare
    if (/che$/.test(n)) w.push(n.slice(0, -3) + 'ca');
    if (/ghe$/.test(n)) w.push(n.slice(0, -3) + 'ga');
    if (/chi$/.test(n)) w.push(n.slice(0, -3) + 'co');
    if (/ghi$/.test(n)) w.push(n.slice(0, -3) + 'go');
    if (/ci$/.test(n)) w.push(n.slice(0, -1) + 'o', n.slice(0, -1) + 'a', n.slice(0, -2) + 'cio');
    if (/gi$/.test(n)) w.push(n.slice(0, -1) + 'o', n.slice(0, -2) + 'gio');
    if (/i$/.test(n)) w.push(n.slice(0, -1) + 'o', n.slice(0, -1) + 'e', n.slice(0, -1) + 'a');
    if (/e$/.test(n)) w.push(n.slice(0, -1) + 'a', n.slice(0, -1) + 'o');
    if (/a$/.test(n)) w.push(n.slice(0, -1) + 'o');
    if (/issimo$|issima$|issimi$|issime$/.test(n)) w.push(n.replace(/issim[oaie]$/, 'o'), n.replace(/issim[oaie]$/, 'e'));
    if (/mente$/.test(n)) { const b = n.slice(0, -5); w.push(b, b + 'e', b.replace(/a$/, 'o')); }   // chiaramente → chiaro, semplicemente → semplice, facilmente → facile
    return { v: v, w: w };
  }
  const ELISION = /^(?:l|un|d|dell|all|nell|sull|dall|quell|c|s|n|m|t|v|gl|degl|agl|negl|sugl)'/;
  function isBasic(word, lang) {
    if (lang !== 'it') return false;
    const n = normalize(word).replace(ELISION, '').trim();
    if (!n) return false;
    if (BASIC_IT_FORMS.has(n) || BASIC_IT_VERBS.has(n) || BASIC_IT_WORDS.has(n)) return true;
    const g = guessLemmas(n);
    return g.v.some(function (l) { return BASIC_IT_VERBS.has(l); }) || g.w.some(function (l) { return BASIC_IT_WORDS.has(l); });
  }
  function isCognate(word, lang, support) {
    const w = normalize(word).replace(/'/g, '');
    if (!w || w.length < 5) return false;
    if ((lang === 'it' && support === 'en') || (lang === 'en' && support === 'it')) return COGNATE_IT_EN.test(w) && w.length >= 6;
    return false;
  }
  function hasCTA(text, lang) {
    const t = normalize(text, { accents: true });
    const list = CTA[lang] || CTA.it;
    return list.some(function (k) { return t.indexOf(k) !== -1; });
  }

  function isNoise(text) { return NOISE.some(function (r) { return r.test(text); }); }

  const LEADING_SOFT = {
    it: 'che ma cioè e però quindi mentre perché oppure o poi allora invece anche'.split(' '),
    en: 'that but and because so which while or then also when'.split(' ')
  };
  function startsSoftly(tokens, lang) {
    if (!tokens.length) return false;
    return (LEADING_SOFT[lang] || LEADING_SOFT.it).map(normalize).indexOf(tokens[0].norm) !== -1;
  }
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
    let s = String(str || '').trim().replace(',', '.');
    if (!s) return NaN;
    // "1.19.8" (punti al posto dei due punti) → "1:19.8"
    const dots = s.split('.');
    if (dots.length === 3 && s.indexOf(':') === -1) s = dots[0] + ':' + dots[1] + '.' + dots[2];
    const parts = s.split(':').map(Number);
    if (parts.some(isNaN)) return NaN;
    if (parts.length === 3) return parts[0] * 3600 + parts[1] * 60 + parts[2];
    if (parts.length === 2) return parts[0] * 60 + parts[1];
    return parts[0];
  }

  return {
    STOPWORDS: STOPWORDS, CTA: CTA, SWAPS: SWAPS, EXTRA: EXTRA, isDigression: isDigression, isCognate: isCognate, isBasic: isBasic, guessLemmas: guessLemmas,
    stopwords: stopwords, normalize: normalize, tokenize: tokenize, words: words, isContent: isContent,
    hasCTA: hasCTA, isNoise: isNoise, endsBadly: endsBadly, startsSoftly: startsSoftly, endsWithPunct: endsWithPunct, swapFor: swapFor,
    extraCandidates: extraCandidates, rng: rng, fmtTime: fmtTime, parseTime: parseTime
  };
});
