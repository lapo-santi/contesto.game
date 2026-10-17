"""Export genuine Italian semantic vectors for the static browser game.
Usage: python scripts/prepare-data.py /path/to/it_core_news_md-3.7.0
Dependencies: numpy, spacy, wordfreq. No model inference is required.
"""
import hashlib
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
# Keep existing IDs and the daily calendar stable, then append more words.
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
    words.append(word)
    rows.append(vector)

# Preserve the published solution calendar.
assert words[:len(previous['words'])] == previous['words'], 'Existing vocabulary must remain available'
targets = previous['targets']
vectors = np.stack(rows).astype(np.float32)
vectors /= np.linalg.norm(vectors, axis=1, keepdims=True)
# Signed 8-bit normalised vectors reduce transfer size by a factor of four.
quantised = np.clip(np.rint(vectors * 127), -127, 127).astype(np.int8)
# Precompute every solution's ranks once; browsers only fetch today's table.
# Integer dot products and float64 norms match the browser's cosine calculation.
integer_vectors = quantised.astype(np.int32)
norms = np.sqrt(np.sum(integer_vectors.astype(np.float64) ** 2, axis=1))
dataset = hashlib.sha256(quantised.tobytes() + json.dumps(words).encode()).hexdigest()[:16]
rank_dir = out / 'ranks' / dataset
rank_dir.mkdir(exist_ok=True, parents=True)
indices = np.arange(len(words))
for target in targets:
    scores = (integer_vectors @ integer_vectors[target]) / norms
    order = np.lexsort((indices, -scores))
    order = np.concatenate(([target], order[order != target]))
    ranks = np.empty(len(words), dtype='<u4')
    ranks[order] = np.arange(1, len(words) + 1)
    ranks.tofile(rank_dir / f'{target}.bin')
# Keep vectors as a build/test reference; they are no longer downloaded in play.
quantised.tofile(out / 'vectors.bin')
meta = {'version': 2, 'dataset': dataset, 'dimensions': vectors.shape[1],
        'words': words, 'targets': targets,
        'source': 'spaCy it_core_news_md 3.7.0', 'licence': 'CC BY-NC-SA 3.0'}
(out / 'vocabulary.json').write_text(json.dumps(meta, ensure_ascii=False, separators=(',', ':')))
print(f'{len(words)} words, {len(targets)} daily targets, {len(words)*4:,} bytes per daily ranking')
