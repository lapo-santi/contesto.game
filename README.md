# contesto.it

Un gioco italiano di vicinanza semantica, ispirato a Contexto. Una parola al giorno, la stessa per tutti, con cambio a mezzanotte nel fuso Europe/Rome (ora legale inclusa).

## Giocare

Scrivi una parola e premi Invio. La posizione 1 è la soluzione. Le parole provate sono ordinate dalla più vicina alla più lontana, con colori dal viola (lontano) al verde lime (vicino). I tentativi validi e distinti sono contati e salvati nel browser per ciascun giorno. Gli aiuti sono registrati separatamente. Il risultato si può condividere senza rivelare la parola.

La classifica riguarda le parole del giocatore, non una classifica pubblica tra giocatori. Il salvataggio è locale: non si trasferisce tra dispositivi e si perde cancellando i dati del sito.

## Come funziona la distanza

Il vocabolario usa vettori italiani preaddestrati di spaCy `it_core_news_md` 3.7.0. La selezione parte dalle 200.000 parole più frequenti di wordfreq e conserva solo parole alfabetiche con un vettore disponibile: il vocabolario comprende 139.545 parole (prima erano 33.142), incluse molte forme flesse. Non è un dizionario completo: rimangono esclusi i termini senza un vettore disponibile. I vettori sono normalizzati e quantizzati in interi a 8 bit per ridurre il download. Durante la preparazione dei dati, per ogni soluzione si calcola la similarità coseno di tutte le parole; la classifica decrescente delle similarità determina la posizione mostrata. Il browser scarica soltanto la classifica della soluzione del giorno, già calcolata, e non deve scaricare o confrontare i vettori. Si usa quindi una **posizione semantica**, non una distanza tra lettere, né una percentuale di probabilità. La quantizzazione introduce una piccola approssimazione; a parità di punteggio decide l'indice nel vocabolario. La soluzione è sempre prima.

Le soluzioni sono una selezione di nomi comuni, mescolata una sola volta con un seme riproducibile. Il calendario parte il 6 ottobre 2026 e cicla dopo aver esaurito l'elenco. Nessuna parola si ripete entro un ciclo. Il modello può produrre relazioni inattese e non riconoscere alcuni termini, grafie o flessioni. Usa il singolare o un sinonimo quando una parola manca.

Il sito è interamente statico: non servono API, segreti o server a pagamento. Il primo caricamento dei dati richiede circa 2,18 MB: 1,63 MB di vocabolario e 0,56 MB per la classifica del giorno, rispetto ai precedenti 10,30 MB (circa il 79% in meno, prima della compressione HTTP). Le classifiche hanno percorsi associati alla versione dei dati, così il browser può riutilizzarle dalla cache senza confondere versioni diverse. Il file `vectors.bin` rimane disponibile per verifiche e riproducibilità, ma non viene richiesto durante il gioco. I font sono richiesti a Google Fonts; senza rete si usa il font di sistema.

**Limite di GitHub Pages:** i dati del gioco, inclusa la sequenza di soluzioni, sono scaricabili e ispezionabili. L'orologio è quello del dispositivo. Questa architettura non protegge da chi bara; per competizioni o premi occorre un backend con calendario e soluzione sul server.

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

## Riprodurre il vocabolario

Scarica ed estrai il modello indicato da https://huggingface.co/spacy/it_core_news_md (versione 3.7.0). In un ambiente Python separato:

```sh
python -m venv .venv
.venv/bin/pip install numpy==2.5.4 spacy==3.8.16 wordfreq==3.1.1
.venv/bin/python scripts/prepare-data.py /percorso/it_core_news_md-3.7.0
npm test
```

La versione effettiva delle dipendenze utilizzate è registrata in `scripts/data-environment.txt`. I file già preparati in `dist/data` permettono di pubblicare senza ripetere questa fase. La preparazione conserva gli indici delle parole già pubblicate e la sequenza delle 568 soluzioni, aggiungendo le nuove parole in coda: i tentativi salvati restano validi e il calendario non cambia. Le posizioni possono cambiare perché la classifica comprende più parole. Lo script usa il `vocabulary.json` già incluso come base e genera anche `dist/data/ranks/<versione>/<soluzione>.bin`. Tutte queste classifiche devono essere pubblicate insieme al vocabolario. Una ricostruzione che riordina gli indici o cambia la sequenza richiede una nuova chiave di salvataggio in `app.js`.

## Licenze e attribuzioni

- Codice e interfaccia: MIT, © 2026 Lapo Santi (vedi LICENSE).
- Vettori e dati derivati: **CC BY-NC-SA 3.0**, spaCy / Explosion e autori indicati in `dist/data/LICENSES-SOURCES.txt`. Il file `dist/data/LICENSE-model.txt` conserva la licenza originale. Questa licenza impone attribuzione, uso non commerciale e condivisione dei dati derivati con la stessa licenza. Non si estende automaticamente al codice del sito.
- wordfreq: Robyn Speer e collaboratori; codice Apache 2.0, dati CC BY-SA 4.0. La selezione del vocabolario derivata dalle frequenze mantiene anche questi obblighi di attribuzione e condivisione. https://github.com/rspeer/wordfreq
- Nessuna affiliazione con Contexto. Nome, interfaccia e codice del progetto sono indipendenti.
