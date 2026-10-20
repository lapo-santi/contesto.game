"""Build the playable vocabulary and the daily rank tables.

Usage: python scripts/build-game-data.py /path/to/spacy_lookups_data/data

Inputs (already in the repository): dist/data/vectors.bin and the `words` and
`targets` arrays of dist/data/vocabulary.json, produced by prepare-data.py.
The extra input is the Italian lemma lookup of spacy-lookups-data 1.0.5,
derived from Morph-it! (Baroni & Zanchetta, CC BY-SA 2.0 / LGPL).

What it does
* Gender and number forms of nouns and adjectives are merged into a single
  entry, shown as the masculine singular (bella, belli, belle -> bello;
  gatte, gatti, gatta -> gatto). Word IDs never change: forms become aliases.
* Superlatives (bellissimo, grandissime, ottimo...) are removed from play.
* Each daily table lists the playable entries from the closest (the solution)
  to the farthest, as little-endian uint32 word IDs.
"""
import argparse, gzip, hashlib, json, re
from pathlib import Path
import numpy as np
from wordfreq import zipf_frequency

parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
parser.add_argument('lookups', type=Path, help='spacy_lookups_data/data directory (spacy-lookups-data 1.0.5)')
parser.add_argument('--report', type=Path, help='Write every merge and exclusion to this TSV file')
args = parser.parse_args()

root = Path(__file__).resolve().parents[1]
out = root / 'dist' / 'data'
meta = json.loads((out / 'vocabulary.json').read_text())
words, dims = meta['words'], meta['dimensions']
# The original calendar is kept so the build can be repeated.
targets = meta.get('sourceTargets', meta['targets'])
index = {w: i for i, w in enumerate(words)}
overrides = json.loads((root / 'scripts' / 'lemma-overrides.json').read_text())
keep = set(overrides['keepSeparate'])

raw = np.fromfile(out / 'vectors.bin', dtype=np.int8).reshape(len(words), dims)
ints = raw.astype(np.int32)
norms = np.sqrt(np.sum(ints.astype(np.float64) ** 2, axis=1))
unit = ints / norms[:, None]
def cos(a, b): return float(unit[index[a]] @ unit[index[b]])

def repair(text):
    # The lookup files store accented letters as UTF-8 read as Latin-1 (cittÃ  for città).
    try:
        return text.encode('latin-1').decode('utf-8')
    except (UnicodeEncodeError, UnicodeDecodeError):
        return text
def lookup(name):
    raw = json.load(gzip.open(args.lookups / f'it_lemma_lookup{"_" + name if name else ""}.json.gz'))
    return {repair(k): repair(v) for k, v in raw.items()}
noun, adj, verb = lookup('noun'), lookup('adj'), lookup('verb')
function_words = set(lookup('det')) | set(lookup('pron')) | set(lookup('adp')) | set(lookup('aux'))

# 1. Superlatives -------------------------------------------------------------
SUPERLATIVE = re.compile(r'(issim|errim)(o|a|i|e|amente)$')
excluded = {}
for w in words:
    if w in overrides['superlativeAllowed']:
        continue
    base = overrides['superlativeExtra'].get(w)
    if base is None and SUPERLATIVE.search(w):
        lemma = adj.get(w)
        if lemma and lemma != w and not SUPERLATIVE.search(lemma):
            base = lemma
        else:
            stem = SUPERLATIVE.sub('', w)
            base = next((c for c in (stem + 'o', stem + 'e', stem + 're', stem) if c in index and c != w), None)
            if base is None and w in noun:      # e.g. a lexicalised noun with no base form
                continue
    if base is not None:
        excluded[w] = base if base in index else None

# 1b. Misspellings, truncations and English words ------------------------------
# Web text contains forms such as "politca", "estat" or "with". They are not
# playable; a guess of one of them suggests the intended word when there is one.
known = set()
any_lemma = {}
for name in ('', '_adj', '_noun', '_verb', '_adv', '_det', '_pron', '_adp', '_aux', '_num', '_other'):
    table = lookup(name.lstrip('_'))
    known |= set(table) | set(table.values())
    for k, v in table.items():
        any_lemma.setdefault(k, v)
zipf = {w: zipf_frequency(w, 'it') for w in words}
def typos(w):
    """Doubled-letter slips and swapped letters: purtoppo, communità, politca."""
    for i in range(len(w)):
        yield w[:i] + w[i] + w[i:]                      # a letter typed once instead of twice
        if i + 1 < len(w) and w[i] == w[i + 1]:
            yield w[:i] + w[i + 1:]                     # a letter doubled by mistake
        if i + 1 < len(w):
            yield w[:i] + w[i + 1] + w[i] + w[i + 2:]   # swapped letters
    for i in range(1, len(w) - 1):                      # a single letter missing inside the word
        for c in 'aeiouhlnrst':
            yield w[:i] + c + w[i:]
ACCENTED = {'a': 'à', 'e': 'è', 'i': 'ì', 'o': 'ò', 'u': 'ù'}
ACCENTS = {'a': 'à', 'e': 'èé', 'i': 'ì', 'o': 'ò', 'u': 'ù', 'è': 'é', 'é': 'è'}
by_prefix = {}
for w in words:
    for k in (1, 2, 3):
        if len(w) - k >= 4:
            by_prefix.setdefault(w[:-k], []).append(w)
junk = {}
accent_alias = {}
for w in words:
    if w in excluded or w in overrides.get('alwaysPlayable', ()):
        continue
    # Missing or wrong final accent: citta, perche, perchè are played as città, perché.
    # Distinct words (papa/papà, meta/metà, pero/però) are known with their own lemma.
    variants = [w[:-1] + a for a in ACCENTS.get(w[-1], ())]
    variants = [v for v in variants if v in index and v in known and zipf[v] >= zipf[w]
                and (w not in known or any_lemma.get(w) == v or (len(w) > 3 and zipf[v] >= zipf[w] + 1))]
    if variants:
        accent_alias[w] = max(variants, key=lambda v: zipf[v])
        continue
    if w in known:
        continue
    if max(zipf_frequency(w, lang) for lang in ('en', 'fr', 'es', 'de', 'pt')) - zipf[w] >= 1.0:
        junk[w] = None                                  # with, automne, estar, politik
        continue
    if zipf[w] >= 2.5 or len(w) < 4:
        continue
    candidates = set(typos(w)) | set(by_prefix.get(w, ()))
    candidates |= {w[:-1] + ACCENTED[w[-1]]} if w[-1] in ACCENTED else set()   # poverta -> povertà
    candidates |= {w[len(p):] for p in ('l', 'd', 'un', 'all', 'dell', 'nell', 'sull') if w.startswith(p)}  # lestate
    near = [c for c in candidates if c in index and c != w and len(c) >= 3 and zipf[c] >= zipf[w] + 2.2]
    if near:
        junk[w] = max(near, key=lambda c: zipf[c])
for w, s in junk.items():
    excluded[w] = s
print(f'{len(junk)} misspellings, truncations or English words removed')

# 2. Gender and number --------------------------------------------------------
def shares_stem(a, b):
    n = min(len(a), len(b))
    return a[:max(1, n - 3)] == b[:max(1, n - 3)]

parent = {}
for w in words:
    if w in excluded or w in keep or w in function_words or verb.get(w) == w:
        continue                                # infinitives: tenere is not tenero
    if w in accent_alias:
        parent[w] = accent_alias[w]
        continue
    target = None
    # Plural noun forms: case -> casa, uomini -> uomo.
    lemma = noun.get(w)
    # A singular -a form is not the plural of an -o noun (fisica is not fisico),
    # except for the irregular plurals listed in the overrides (uova, braccia).
    if lemma and w.endswith('a') and not lemma.endswith('a') and w not in overrides['pluralInA']:
        lemma = None
    if lemma and lemma != w and lemma in index:
        if cos(w, lemma) >= (0.3 if w in verb else 0.15):
            target = lemma
    # Adjective forms: belle -> bello. A word that is itself a noun lemma
    # (politica, musica, partita) is kept unless explicitly merged.
    lemma = adj.get(w)
    if target is None and lemma and lemma != w and lemma in index and shares_stem(w, lemma):
        is_noun = noun.get(w) == w
        if verb.get(w) == w:                    # infinitives: tenere is not tenero
            lemma = None
        threshold = 0.55 if w in verb else 0.25
        if is_noun:
            # Reviewed by hand for the 30,000 most frequent words; rarer ones stay separate.
            if index[w] >= 30000 or cos(w, lemma) < 0.45:
                lemma = None
        if lemma and cos(w, lemma) >= threshold:
            target = lemma
    # Feminine nouns: curated pairs plus the regular -trice and -essa endings.
    explicit = overrides['feminineNouns'].get(w)
    if explicit and explicit in index:
        target = explicit
    elif target is None and noun.get(w) == w:
        for suffix, repl in (('trice', ('tore',)), ('essa', ('e', 'o', 'a', '')), ('ografa', ('ografo',)),
                             ('ologa', ('ologo',)), ('urga', ('urgo',)), ('iera', ('iere',)), ('aia', ('aio',))):
            if w.endswith(suffix):
                for r in repl:
                    m = w[:-len(suffix)] + r
                    if len(m) > 3 and m in index and noun.get(m) == m and cos(w, m) >= 0.5:
                        target = m
                        break
            if target:
                break
    if target and target != w and target not in excluded:
        parent[w] = target

def resolve(w):
    seen = set()
    while w in parent and w not in seen:
        seen.add(w)
        w = parent[w]
    return w
canonical = {w: resolve(w) for w in parent}
canonical = {w: c for w, c in canonical.items() if c != w and c not in canonical and c not in excluded}

# 3. Targets must be playable entries ----------------------------------------
new_targets = []
for t in targets:
    w = words[t]
    if w in excluded:
        raise ValueError(f'Target {t} is a superlative')
    c = index[canonical.get(w, w)]
    if c in new_targets:
        # Keep the calendar length so every other day keeps its word.
        c = index[overrides['calendarReplacements'][w]]
        if c in new_targets or c in targets or words[c] in canonical:
            raise ValueError(f'Replacement for {w} is not a fresh entry')
    if c != t:
        print(f'Calendar: {w} -> {words[c]}')
    new_targets.append(c)

playable = np.array([i for i, w in enumerate(words) if w not in canonical and w not in excluded], dtype=np.int64)
aliases = sorted((index[w], index[c]) for w, c in canonical.items())
removed = sorted((index[w], index[b] if b else -1) for w, b in excluded.items() if w not in junk)
misspelt = sorted((index[w], index[b] if b else -1) for w, b in excluded.items() if w in junk)

# 4. Daily tables ---------------------------------------------------------------
dataset = hashlib.sha256(raw.tobytes() + json.dumps([words, aliases, removed, misspelt]).encode()).hexdigest()[:16]
rank_dir = out / 'ranks' / dataset
rank_dir.mkdir(parents=True, exist_ok=True)
sub = ints[playable]
sub_norms = norms[playable]
for n, t in enumerate(new_targets, 1):
    scores = (sub @ ints[t]) / sub_norms
    order = playable[np.lexsort((playable, -scores))]
    order = np.concatenate(([t], order[order != t])).astype('<u4')
    order.tofile(rank_dir / f'{t}.bin')
    if n % 100 == 0:
        print(f'{n}/{len(new_targets)} daily tables', flush=True)

meta = {'version': 3, 'dataset': dataset, 'dimensions': dims, 'words': words, 'targets': new_targets, 'sourceTargets': targets,
        'aliases': [x for pair in aliases for x in pair],
        'superlatives': [x for pair in removed for x in pair],
        'misspellings': [x for pair in misspelt for x in pair],
        'playable': int(len(playable)),
        'source': meta['source'], 'licence': meta['licence'], 'model': meta['model'],
        'lemmas': 'Morph-it! 0.48 via spacy-lookups-data 1.0.5 (CC BY-SA 2.0 / LGPL) + scripts/lemma-overrides.json'}
(out / 'vocabulary.json').write_text(json.dumps(meta, ensure_ascii=False, separators=(',', ':')))
if args.report:
    with open(args.report, 'w') as f:
        for w, c in sorted(canonical.items(), key=lambda x: index[x[0]]):
            f.write(f'alias\t{w}\t{c}\t{cos(w, c):.2f}\n')
        for w, b in sorted(excluded.items(), key=lambda x: index[x[0]]):
            f.write(f'{"junk" if w in junk else "superlative"}\t{w}\t{b}\n')
print(f'{len(words)} words: {len(playable)} playable entries, {len(aliases)} aliases, {len(removed)} superlatives, {len(misspelt)} misspellings; '
      f'{len(playable) * 4:,} bytes per daily table; dataset {dataset}')
