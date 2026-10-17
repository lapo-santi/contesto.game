"""Export genuine Italian semantic vectors for the static browser game.
Usage: python scripts/prepare-data.py /path/to/it_core_news_lg-3.7.0
Dependencies: numpy, spacy, wordfreq. No model inference is required.
"""
import argparse
import hashlib
from datetime import datetime, timedelta
import json
import re
from pathlib import Path
from zoneinfo import ZoneInfo
import numpy as np
import spacy
from spacy.strings import hash_string
from wordfreq import top_n_list

parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument('model', type=Path)
parser.add_argument('--effective-from', help='First Italian calendar day using the new rankings (YYYY-MM-DD)')
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
targets = previous['targets']
vectors = np.stack(rows).astype(np.float32)
vectors /= np.linalg.norm(vectors, axis=1, keepdims=True)
# Keep compact reference vectors; the browser downloads rank tables only.
quantised = np.clip(np.rint(vectors * 127), -127, 127).astype(np.int8)
# Precompute every solution's ranks once; browsers only fetch today's table.
# Integer dot products and float64 norms match the browser's cosine calculation.
integer_vectors = quantised.astype(np.int32)
norms = np.sqrt(np.sum(integer_vectors.astype(np.float64) ** 2, axis=1))
print(f'Preparing ranks for {len(words):,} words with {len(model_rows):,} distinct source rows', flush=True)
dataset = hashlib.sha256(quantised.tobytes() + json.dumps(words).encode()).hexdigest()[:16]
rank_dir = out / 'ranks' / dataset
rank_dir.mkdir(exist_ok=True, parents=True)
indices = np.arange(len(words))
for number, target in enumerate(targets, start=1):
    scores = (integer_vectors @ integer_vectors[target]) / norms
    order = np.lexsort((indices, -scores))
    order = np.concatenate(([target], order[order != target]))
    ranks = np.empty(len(words), dtype='<u4')
    ranks[order] = np.arange(1, len(words) + 1)
    ranks.tofile(rank_dir / f'{target}.bin')
    if number % 100 == 0:
        print(f'Prepared {number}/{len(targets)} daily tables', flush=True)
# Keep vectors as a build/test reference; they are no longer downloaded in play.
quantised.tofile(out / 'vectors.bin')
meta = {'version': 2, 'dataset': dataset, 'dimensions': vectors.shape[1],
        'words': words, 'targets': targets,
        'source': 'spaCy it_core_news_lg 3.7.0', 'licence': 'CC BY-NC-SA 3.0',
        'model': {'name': 'it_core_news_lg', 'version': '3.7.0',
                  'vocabularyVectorRows': len(model_rows)}}
if previous.get('dataset') != dataset:
    effective_from = args.effective_from or (datetime.now(ZoneInfo('Europe/Rome')).date() + timedelta(days=1)).isoformat()
    datetime.strptime(effective_from, '%Y-%m-%d')
    meta['rankingChange'] = {'effectiveFrom': effective_from,
                             'previousDataset': previous['dataset'],
                             'previousSource': previous['source']}
elif 'rankingChange' in previous:
    meta['rankingChange'] = previous['rankingChange']
# Retain both sets of rank files so existing open games continue to work.
(out / 'vocabulary.json').write_text(json.dumps(meta, ensure_ascii=False, separators=(',', ':')))
print(f'{len(words)} words, {len(targets)} daily targets, {len(words)*4:,} bytes per daily ranking')
