"""Refresh content versions after edits, including worker imports and lazy templates."""
from pathlib import Path
import hashlib
import re

root = Path(__file__).resolve().parents[1]
def digest(path):
    return hashlib.sha256((root / path).read_bytes()).hexdigest()[:12]

def rewrite(path, transform):
    file = root / path
    file.write_text(transform(file.read_text()))

locale = hashlib.sha256(b''.join((root / f'locales/{lang}.json').read_bytes()
    for lang in ['en', 'es', 'fr'])).hexdigest()[:12]
rewrite('scripts/translation.js', lambda text: re.sub(r'const LOCALE_VERSION = "[^"]+";',
    f'const LOCALE_VERSION = "{locale}";', text))
rewrite('scripts/dataload.js', lambda text: re.sub(r"data/audit-overrides.json(?:\?v=[^']+)?",
    'data/audit-overrides.json?v=' + digest('data/audit-overrides.json'), text))
rewrite('scripts/dataload.js', lambda text: re.sub(r"data/plus-move-projections.json(?:\?v=[^']+)?",
    'data/plus-move-projections.json?v=' + digest('data/plus-move-projections.json'), text))
rewrite('scripts/dataload.js', lambda text: re.sub(r"data/catch-xl-profiles.json(?:\?v=[^']+)?",
    'data/catch-xl-profiles.json?v=' + digest('data/catch-xl-profiles.json'), text))
def versions(text, paths):
    for path in paths:
        text = re.sub(re.escape(path) + r'''(?:\?v=[^'"\s]+)?''',
            path + '?v=' + digest('scripts/' + path), text)
    return text
rewrite('scripts/raid-leaderboard-worker.js', lambda text: versions(text,
    ['pokemon_enums.js', 'settings.js', 'data-rules.js', 'catch-xl.js', 'pokemon_utils.js', 'calc.js']))
rewrite('scripts/raid-leaderboard.js', lambda text: re.sub(r"raid-leaderboard-worker.js\?v=[^']+",
    'raid-leaderboard-worker.js?v=' + digest('scripts/raid-leaderboard-worker.js'), text))
def template_versions(text):
    for name in ['pokedex', 'rankings', 'raid-leaderboard', 'data-audit', 'faq']:
        path = 'templates/' + name + '.html'
        text = re.sub(re.escape(path) + r"(?:\?v=[^']+)?", path + '?v=' + digest(path), text)
    return text
rewrite('index.js', template_versions)
def entry_versions(text):
    paths = ['scripts/' + name + '.js' for name in ['dataload', 'translation', 'settings',
        'data-rules', 'catch-xl', 'plus-projections', 'dialogs', 'moves', 'pokemon_utils', 'calc', 'pokedex', 'rankings', 'raid-points',
        'data-audit', 'raid-leaderboard']]
    paths += ['index.js', 'styles/raid-leaderboard.css', 'styles/data-audit.css']
    for path in paths:
        text = re.sub(re.escape(path) + r'(?:\?v=[^"]+)?', path + '?v=' + digest(path), text)
    return re.sub(r'locales/en.json\?v=[^"]+', 'locales/en.json?v=' + locale, text)
rewrite('index.html', entry_versions)
