# contesto.it

Un gioco italiano di vicinanza semantica, ispirato a Contexto. Una parola al giorno, la stessa per tutti, con cambio a mezzanotte nel fuso Europe/Rome (ora legale inclusa).

## Giocare

Alla prima visita si apre la schermata **Come si gioca**; finché non si prova una parola, le regole restano visibili anche nella pagina, con un esempio di associazioni (se la soluzione fosse “pinguino”: delfino 24, uccello 38, animale 575, ghiaccio 950…). Le posizioni dell'esempio sono reali e i test verificano che “pinguino” non sia nel calendario.

Scrivi una parola e premi Invio. La posizione 1 è la soluzione. Le parole provate sono ordinate dalla più vicina alla più lontana, con colori dal viola (lontano) al verde lime (vicino); sotto 300 la parola è “calda”, sotto 50 “bollente”. I tentativi validi e distinti sono contati e salvati nel browser per ciascun giorno. Gli aiuti sono registrati separatamente: ogni aiuto mostra una parola a metà strada fra il tuo tentativo migliore e la soluzione, mai oltre la posizione 300. “Mi arrendo” (con conferma) mostra la soluzione. A fine partita compaiono la parola e le dieci più vicine, e il risultato si può condividere senza rivelare la parola.

La classifica riguarda le parole del giocatore, non una classifica pubblica tra giocatori. Il salvataggio è locale: non si trasferisce tra dispositivi e si perde cancellando i dati del sito.

## Forme delle parole

Ogni voce del gioco è una parola, non una forma:

- **Genere e numero** di nomi e aggettivi sono uniti nella forma maschile singolare: *bella, belli, belle → bello*, *gatta, gatte, gatti → gatto*, *attrice → attore*, *case → casa*. Chi scrive una forma vede “*belle* vale come *bello*”. Le parole diverse che sembrano coppie restano separate (*porta/porto*, *politica/politico*, *musica*, *partita*, *fisica*), come i plurali con significato proprio (*soldi*, *occhiali*, *forbici*, *nozze*) e gli infiniti (*tenere* non è *tenero*).
- **Nomi propri, marchi e sigle** non sono giocabili: persone, città, aziende e prodotti (*roma, salvini, unicredit, bankitalia, iphone*). Nei testi giornalistici su cui è addestrato il modello questi nomi compaiono accanto alle parole comuni (*banca* → *unicredit*) e affollerebbero la classifica. Una parola è considerata un nome quando il dizionario ortografico italiano la accetta solo con la maiuscola, oppure quando né il dizionario né Morph-it la conoscono. Alcuni anglicismi d'uso comune restano ammessi (`alwaysPlayable` in `scripts/lemma-overrides.json`).
- **Plurali regolari** che il lessico non conosce vengono uniti quando i vettori confermano che è la stessa parola (*pomodorini → pomodorino*, *trovate → trovato*); i verbi coniugati restano separati.
- **Superlativi** (*bellissimo, grandissime, ottimo, pessima*) non sono accettati: il gioco suggerisce la forma base. Restano *massimo*, *minimo*, *ultimo*, *prossimo*.
- **Grafie errate, troncamenti e parole straniere** presenti nei testi web (*purtoppo, estat, lestate, with, automne*) non sono giocabili; quando c'è, il gioco propone la parola voluta. Le forme senza accento valgono come quelle accentate (*citta → città*, *perche → perché*); si possono anche scrivere articoli elisi (*l'acqua*).

Le forme restano nel vocabolario con il loro indice, quindi i salvataggi precedenti continuano a funzionare e vengono ricondotti alla voce comune. Le decisioni si basano sul lessico morfologico Morph-it! (tramite spacy-lookups-data 1.0.5), sulla similarità dei vettori e su un elenco rivisto a mano per le 30.000 parole più frequenti (`scripts/lemma-overrides.json`). Le parole più rare che sono anche nomi femminili autonomi restano separate per prudenza. Il resoconto completo di ogni unione ed esclusione si ottiene con `--report`.

## Come funziona la distanza

Il vocabolario usa vettori italiani preaddestrati di spaCy `it_core_news_lg` 3.7.0. La selezione parte dalle 200.000 parole più frequenti di wordfreq e conserva solo parole alfabetiche con un vettore disponibile: 139.545 forme, da cui si ottengono **78.369 voci giocabili** (29.345 forme unite a un'altra voce, 919 superlativi, 13.811 grafie errate o parole straniere e 17.101 nomi propri, marchi o parole sconosciute esclusi). Non è un dizionario completo. I vettori sono normalizzati e quantizzati in interi a 8 bit. Per ogni soluzione si calcola la similarità coseno con tutte le voci giocabili; la classifica decrescente determina la posizione mostrata. Il browser scarica soltanto la classifica della soluzione del giorno, già calcolata, e non deve scaricare o confrontare i vettori. Si usa quindi una **posizione semantica**, non una distanza tra lettere, né una percentuale di probabilità. A parità di punteggio decide l'indice nel vocabolario. La soluzione è sempre prima.

Le soluzioni sono una selezione di nomi comuni, mescolata una sola volta con un seme riproducibile. Il calendario parte il 6 ottobre 2026 e cicla dopo aver esaurito l'elenco. Nessuna parola si ripete entro un ciclo. Con l'unione delle forme, quattro voci future del calendario sono cambiate senza spostare le altre: *capelli → capello*, e *nonna*, *zia*, *figlia* (che coincidevano con *nonno*, *zio*, *figlio*) sono state sostituite da *nipote*, *parente*, *genitore*. L'elenco originale è in `sourceTargets`.

Il sito è interamente statico: non servono API, segreti o server a pagamento. Il primo caricamento dei dati richiede circa 2,4 MB prima della compressione HTTP: 2,1 MB di vocabolario e 0,31 MB per la classifica del giorno. Ogni classifica elenca gli indici delle voci giocabili dalla più vicina alla più lontana (uint32 little-endian). Le classifiche hanno percorsi associati alla versione dei dati, così il browser può riutilizzarle dalla cache senza confondere versioni diverse. Il file `vectors.bin` rimane disponibile per verifiche e riproducibilità, ma non viene richiesto durante il gioco. I font sono richiesti a Google Fonts; senza rete si usa il font di sistema.

**Limite di GitHub Pages:** i dati del gioco, inclusa la sequenza di soluzioni, sono scaricabili e ispezionabili. L'orologio è quello del dispositivo. Questa architettura non protegge da chi bara; per competizioni o premi occorre un backend con calendario e soluzione sul server. GitHub Pages consiglia siti sotto 1 GB: pubblica solo la cartella di classifiche indicata da `dataset` in `vocabulary.json` (circa 178 MB).

## Avvio locale

Richiede Python 3 per l'anteprima e Node.js 18 o successivo per i test. Non occorre installare pacchetti JavaScript.

```sh
npm test
npm start
```

Apri http://localhost:8000. Servi il sito tramite HTTP: aprire `index.html` direttamente non consente il caricamento dei dati.

## GitHub Pages

Il workflow `.github/workflows/pages.yml` verifica i test e pubblica `dist` ad ogni push su `main`. Nel repository, apri **Settings → Pages → Build and deployment → Source → GitHub Actions**. L'indirizzo previsto è `https://laposanti.github.io/contesto.game/`.

I percorsi degli asset sono relativi, quindi funzionano anche sotto la sottocartella di un repository. `contesto.game` è il nome del repository: un dominio personalizzato omonimo richiede di acquistare il dominio e configurarne il DNS.

## Riprodurre i dati

I file in `dist/data` sono già pronti. Per ricostruirli:

1. **Vettori** (solo se cambia il modello). Scarica ed estrai https://huggingface.co/spacy/it_core_news_lg (versione 3.7.0), poi:

   ```sh
   python -m venv .venv
   .venv/bin/pip install numpy==2.5.4 spacy==3.8.16 wordfreq==3.1.1
   .venv/bin/python scripts/prepare-data.py /percorso/it_core_news_lg-3.7.0
   ```

   La preparazione conserva gli indici delle parole già pubblicate e il calendario originale.

2. **Voci giocabili e classifiche.** Servono il lessico di spacy-lookups-data 1.0.5, wordfreq, spylls e il dizionario Hunspell italiano (pacchetto npm `dictionary-it` 2.0.0, GPL 3: usato solo durante la preparazione, non viene pubblicato):

   ```sh
   .venv/bin/pip install numpy wordfreq==3.1.1 spylls
   (cd /tmp && npm pack dictionary-it@2.0.0 && tar xzf dictionary-it-2.0.0.tgz)
   .venv/bin/pip download --no-deps spacy-lookups-data==1.0.5 -d /tmp/lookups
   unzip -o /tmp/lookups/spacy_lookups_data-1.0.5-*.whl 'spacy_lookups_data/data/it*' -d /tmp/lookups
   .venv/bin/python scripts/build-game-data.py /tmp/lookups/spacy_lookups_data/data --hunspell /tmp/package/index --report /tmp/forme.tsv
   npm test
   ```

   Lo script scrive `dist/data/vocabulary.json` e `dist/data/ranks/<dataset>/<soluzione>.bin`. Si può ripetere: parte sempre da `sourceTargets`. Per correggere un'unione sbagliata, aggiungi la parola a `keepSeparate` in `scripts/lemma-overrides.json` (o una coppia a `feminineNouns`) e rilancia. Dopo una ricostruzione elimina le cartelle di `dist/data/ranks` diverse dal nuovo `dataset`.

La versione effettiva delle dipendenze del modello è registrata in `scripts/data-environment.txt`.

## Licenze e attribuzioni

- Codice e interfaccia: MIT, © 2026 Lapo Santi (vedi LICENSE).
- Vettori e dati derivati: **CC BY-NC-SA 3.0**, spaCy / Explosion e autori indicati in `dist/data/LICENSES-SOURCES.txt`. Il file `dist/data/LICENSE-model.txt` conserva la licenza originale. Questa licenza impone attribuzione, uso non commerciale e condivisione dei dati derivati con la stessa licenza. Non si estende automaticamente al codice del sito.
- Forme delle parole: **Morph-it!** di Marco Baroni ed Eros Zanchetta (CC BY-SA 2.0 / LGPL), tramite i file di Giovanni Toffoli in spacy-lookups-data. Attribuzione e licenza in `dist/data/LICENSES-SOURCES.txt`.
- wordfreq: Robyn Speer e collaboratori; codice Apache 2.0, dati CC BY-SA 4.0. Usato per scegliere il vocabolario e per riconoscere grafie errate e parole straniere. https://github.com/rspeer/wordfreq
- Nessuna affiliazione con Contexto. Nome, interfaccia e codice del progetto sono indipendenti.

## Verifiche

`npm test` verifica tutte le classifiche (una delle quali ricalcolata dai vettori), il cambio di giorno alla mezzanotte italiana, le unioni di genere e numero e le parole che devono restare separate, l'esclusione dei superlativi e dei nomi propri, le grafie errate, le comodità di scrittura (accenti, elisioni), la conversione dei salvataggi, gli aiuti, la condivisione e una partita completa nell'app simulata. Questi controlli non garantiscono che ogni associazione del modello corrisponda all'intuizione di ogni giocatore.

`scripts/semantic-audit.py` confronta due edizioni dei vettori senza stampare le soluzioni del calendario; il risultato precedente è in `scripts/semantic-audit.json`.
