"""Export genuine Italian semantic vectors for the static browser game.
Usage: python scripts/prepare-data.py /path/to/it_core_news_lg-3.7.0
Then run scripts/build-game-data.py to build the playable entries and daily tables.
Dependencies: numpy, spacy, wordfreq. No model inference is required.
"""
import argparse
import json
import re
from pathlib import Path
import numpy as np
import spacy
from spacy.strings import hash_string
from wordfreq import top_n_list

parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument('model', type=Path)
args = parser.parse_args()
model = args.model
model_meta = json.loads((model / 'meta.json').read_text())
if model_meta['name'] != 'core_news_lg' or model_meta['version'] != '3.7.0':
    raise ValueError('Use it_core_news_lg 3.7.0 to reproduce this edition')
vocab = spacy.vocab.Vocab().from_disk(model / 'vocab')
if len(vocab.vectors.data) < 500000:
    raise ValueError('The complete model must contain at least 500,000 vector rows')
print('Loaded the complete Italian model', flush=True)
# A frequency-based list keeps the vocabulary useful for everyday Italian.
words = []
rows = []
model_rows = set()
# Keep the published vocabulary and daily calendar stable during the model change.
out = Path(__file__).resolve().parents[1] / 'dist' / 'data'
previous = json.loads((out / 'vocabulary.json').read_text())
candidates = dict.fromkeys(previous['words'] + top_n_list('it', 200000))
for word in candidates:
    if not re.fullmatch(r'[a-zàèéìòóù]{2,25}', word):
        continue
    key = hash_string(word)
    if key not in vocab.vectors.key2row:
        continue
    vector = vocab.vectors.data[vocab.vectors.key2row[key]]
    if np.linalg.norm(vector) == 0:
        continue
    model_rows.add(vocab.vectors.key2row[key])
    words.append(word)
    rows.append(vector)

# Preserve the exact word IDs and published solution calendar during this migration.
if words != previous['words']:
    raise ValueError('A model transition must preserve the exact vocabulary')
targets = previous.get('sourceTargets', previous['targets'])
vectors = np.stack(rows).astype(np.float32)
vectors /= np.linalg.norm(vectors, axis=1, keepdims=True)
# Compact reference vectors; the browser downloads precomputed rank tables only.
quantised = np.clip(np.rint(vectors * 127), -127, 127).astype(np.int8)
quantised.tofile(out / 'vectors.bin')
meta = {'version': 3, 'dimensions': vectors.shape[1], 'words': words, 'targets': targets, 'sourceTargets': targets,
        'source': 'spaCy it_core_news_lg 3.7.0', 'licence': 'CC BY-NC-SA 3.0',
        'model': {'name': 'it_core_news_lg', 'version': '3.7.0', 'vocabularyVectorRows': len(model_rows)}}
(out / 'vocabulary.json').write_text(json.dumps(meta, ensure_ascii=False, separators=(',', ':')))
print(f'{len(words)} words, {len(targets)} daily targets. Now run scripts/build-game-data.py.')
