"""Compare two prepared vocabularies without printing any daily solution.

Usage: python scripts/semantic-audit.py /path/to/old/data /path/to/new/data
The cosine values describe vector alignment, not probabilities.
"""
import argparse
import json
from pathlib import Path
import numpy as np

parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument('before', type=Path)
parser.add_argument('after', type=Path)
args = parser.parse_args()

def load(directory):
    meta = json.loads((directory / 'vocabulary.json').read_text())
    vectors = np.fromfile(directory / 'vectors.bin', dtype=np.int8)
    vectors = vectors.reshape(-1, meta['dimensions']).astype(np.float64)
    vectors /= np.linalg.norm(vectors, axis=1, keepdims=True)
    return meta, vectors, {word: i for i, word in enumerate(meta['words'])}

before, old, old_ids = load(args.before)
after, new, new_ids = load(args.after)
assert before['words'] == after['words'], 'Word IDs must remain unchanged'
assert before['targets'] == after['targets'], 'Daily solutions must remain unchanged'
pairs = [
    ('santo', 'santifica'), ('santifica', 'santità'),
    ('santifica', 'castità'), ('santo', 'pio'), ('santo', 'santoro'),
    ('cane', 'gatto'), ('cane', 'tastiera'),
    ('mare', 'spiaggia'), ('mare', 'martello'),
    ('santifica', 'santificare'),
]
comparisons = []
for a, b in pairs:
    comparisons.append({'words': [a, b],
                        'before': round(float(old[old_ids[a]] @ old[old_ids[b]]), 6),
                        'after': round(float(new[new_ids[a]] @ new[new_ids[b]]), 6)})
# Identify the reported ranking by its two known positions, without disclosing its target.
reported = None
for target in before['targets']:
    ranks = np.fromfile(args.before / 'ranks' / before['dataset'] / f'{target}.bin', dtype='<u4')
    if ranks[old_ids['santo']] == 1171 and ranks[old_ids['santifica']] == 116:
        next_ranks = np.fromfile(args.after / 'ranks' / after['dataset'] / f'{target}.bin', dtype='<u4')
        reported = {word: {'before': int(ranks[old_ids[word]]),
                           'after': int(next_ranks[new_ids[word]])}
                    for word in ['santo', 'santifica', 'santità', 'castità']}
        break
print(json.dumps({'beforeSource': before['source'], 'afterSource': after['source'],
                  'words': len(after['words']), 'calendarPreserved': True,
                  'pairs': comparisons, 'reportedPuzzle': reported}, ensure_ascii=False, indent=2))
