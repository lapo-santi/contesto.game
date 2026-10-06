"""Export genuine Italian semantic vectors for the static browser game.
Usage: python scripts/prepare-data.py /path/to/it_core_news_md-3.7.0
Dependencies: numpy, spacy, wordfreq. No model inference is required.
"""
import json
import re
import sys
from pathlib import Path
import numpy as np
import spacy
from spacy.strings import hash_string
from wordfreq import top_n_list

model = Path(sys.argv[1])
vocab = spacy.vocab.Vocab().from_disk(model / 'vocab')
# A frequency-based list keeps the vocabulary useful for everyday Italian.
words = []
rows = []
for word in top_n_list('it', 35000):
    if not re.fullmatch(r'[a-zàèéìòóù]{2,25}', word):
        continue
    key = hash_string(word)
    if key not in vocab.vectors.key2row:
        continue
    vector = vocab.vectors.data[vocab.vectors.key2row[key]]
    if np.linalg.norm(vector) == 0:
        continue
    words.append(word)
    rows.append(vector)

# Choose concrete, familiar nouns as solutions; shuffle once with a fixed seed.
solutions = '''casa mare montagna fiume lago bosco albero fiore foglia radice seme frutto mela pera pesca banana arancia limone uva ciliegia fragola pane pasta riso pizza formaggio latte burro miele zucchero sale pepe acqua vino birra caffè tè cioccolato gelato torta biscotto cucina tavola piatto bicchiere bottiglia forchetta cucchiaio coltello pentola forno frigorifero sedia letto divano armadio finestra porta muro tetto pavimento giardino balcone scala stanza camera bagno salotto scuola università libro quaderno matita penna gomma lavagna lezione esame studente maestro professore biblioteca storia scienza matematica fisica chimica biologia musica canzone voce suono silenzio pianoforte chitarra violino tamburo concerto teatro cinema film attore regista palco arte pittura quadro disegno colore pennello fotografia immagine museo statua scultura poesia romanzo racconto lettera parola lingua discorso conversazione domanda risposta pensiero idea memoria sogno sonno notte giorno mattina sera alba tramonto sole luna stella cielo nuvola pioggia neve vento temporale fulmine tuono nebbia ghiaccio inverno primavera estate autunno tempo orologio minuto settimana mese anno calendario festa compleanno regalo candela famiglia madre padre figlio figlia fratello sorella nonno nonna zio zia cugino amico amore affetto gioia felicità tristezza paura rabbia sorpresa speranza desiderio fiducia coraggio pazienza fortuna destino vita morte salute malattia medico ospedale farmacia medicina cura dolore febbre cuore sangue cervello occhio orecchio naso bocca dente mano piede braccio gamba testa viso capelli pelle corpo muscolo osso sport calcio pallone squadra partita stadio tennis nuoto corsa bicicletta palestra atletica sci viaggio vacanza valigia treno aereo automobile nave barca autobus strada autostrada ponte porto aeroporto stazione biglietto passaporto mappa città paese villaggio quartiere piazza mercato negozio supermercato ristorante albergo banca ufficio fabbrica lavoro mestiere denaro moneta prezzo stipendio risparmio debito economia commercio industria agricoltura contadino campo raccolto grano farina verdura pomodoro patata carota cipolla insalata spinacio zucca fungo animale cane gatto cavallo mucca pecora capra maiale coniglio topo leone tigre elefante giraffa zebra scimmia orso lupo volpe cervo cinghiale uccello aquila rondine piccione gallina anatra oca pesce delfino balena squalo tartaruga serpente rana farfalla ape formica mosca zanzara ragno natura ambiente foresta deserto oceano spiaggia sabbia isola costa collina valle roccia pietra terra vulcano fuoco fiamma cenere fumo energia elettricità batteria motore macchina computer telefono schermo tastiera internet rete messaggio notizia giornale televisione radio pubblicità informazione ricerca tecnologia robot satellite spazio universo pianeta viaggio esplorazione avventura segreto mistero indizio gioco enigma sfida vittoria sconfitta premio campione regola legge giudice tribunale giustizia libertà pace guerra soldato esercito politica governo parlamento presidente elezione voto società comunità popolo cultura tradizione religione chiesa tempio preghiera fede festa vestito scarpa cappello camicia pantalone gonna giacca cappotto maglione guanto sciarpa calza cintura borsa orologio anello collana orecchino diamante oro argento ferro acciaio legno plastica vetro carta tessuto lana seta cotone ago filo forbice bottone ombrello sapone profumo asciugamano specchio pettine spazzola chiave serratura luce lampada tappeto cuscino coperta tenda giocattolo bambola aquilone altalena ruota corda scatola pacco cestino secchio martello chiodo vite trapano attrezzo strumento problema soluzione equilibrio ordine caos limite distanza direzione centro confine inizio fine progetto piano futuro passato presente esperienza capacità talento impegno successo errore scelta occasione bisogno abitudine emozione sentimento rispetto gentilezza bellezza eleganza semplicità verità bugia dubbio certezza rischio sicurezza pericolo protezione aiuto sostegno incontro appuntamento attesa ritardo velocità movimento passo gesto sorriso lacrima abbraccio bacio respiro odore sapore gusto fame sete forza peso misura numero forma cerchio quadrato triangolo linea punto superficie volume temperatura pressione gravità onda ritmo melodia armonia fantasia creatività curiosità attenzione concentrazione ragione intuizione conoscenza saggezza filosofia'''.split()
lookup = {word: i for i, word in enumerate(words)}
targets = sorted({lookup[word] for word in solutions if word in lookup})
np.random.default_rng(20261006).shuffle(targets)
assert len(targets) >= 365, f'Only {len(targets)} targets'
vectors = np.stack(rows).astype(np.float32)
vectors /= np.linalg.norm(vectors, axis=1, keepdims=True)
# Signed 8-bit normalised vectors reduce transfer size by a factor of four.
quantised = np.clip(np.rint(vectors * 127), -127, 127).astype(np.int8)
out = Path(__file__).resolve().parents[1] / 'dist' / 'data'
out.mkdir(exist_ok=True, parents=True)
quantised.tofile(out / 'vectors.bin')
meta = {'version': 1, 'dimensions': vectors.shape[1], 'words': words, 'targets': targets,
        'source': 'spaCy it_core_news_md 3.7.0', 'licence': 'CC BY-NC-SA 3.0'}
(out / 'vocabulary.json').write_text(json.dumps(meta, ensure_ascii=False, separators=(',', ':')))
print(f'{len(words)} words, {len(targets)} daily targets, {quantised.nbytes:,} bytes')
