"""Turn the web package's woff2 subsets into TTFs React Native can load.

- Rubik is a variable font (wght 300-900): React Native wants static faces, so
  it is instanced at 400 / 500 / 700.
- Each family ships as a Hebrew and a Latin subset; RN has no per-glyph font
  stack, so the two subsets are merged into one TTF per face.

Usage (needs `pip install fonttools brotli`):
  python3 scripts/convert-fonts.py <dir with packages/web/src/fonts/*.woff2> assets/fonts
The woff2 files are the Google Fonts files the website self-hosts (via @fontsource).
"""
import sys, os, tempfile
from fontTools.ttLib import TTFont
from fontTools.varLib.instancer import instantiateVariableFont
from fontTools.merge import Merger

src, out = sys.argv[1], sys.argv[2]
os.makedirs(out, exist_ok=True)
tmp = tempfile.mkdtemp()


def load(name):
    f = TTFont(os.path.join(src, name))
    f.flavor = None
    return f


def set_names(font, family, style, ps):
    name = font['name']
    for rec in list(name.names):
        if rec.nameID in (1, 2, 3, 4, 6, 16, 17):
            name.removeNames(nameID=rec.nameID)
    full = f'{family} {style}' if style != 'Regular' else family
    for nid, val in ((1, family), (2, style), (3, ps), (4, full), (6, ps)):
        name.setName(val, nid, 3, 1, 0x409)
        name.setName(val, nid, 1, 0, 0)


def merge(parts, dest, family, style, ps, weight):
    paths = []
    for i, f in enumerate(parts):
        p = os.path.join(tmp, f'{ps}-{i}.ttf')
        f.save(p)
        paths.append(p)
    merged = Merger().merge(paths)
    set_names(merged, family, style, ps)
    merged['OS/2'].usWeightClass = weight
    merged.save(os.path.join(out, dest))
    print('wrote', dest, len(merged.getGlyphOrder()), 'glyphs')


for weight, style in ((400, 'Regular'), (500, 'Medium'), (700, 'Bold')):
    parts = []
    for sub in ('hebrew', 'latin'):
        f = load(f'rubik-{sub}-wght-normal.woff2')
        f = instantiateVariableFont(f, {'wght': weight}, updateFontNames=False)
        parts.append(f)
    merge(parts, f'Rubik-{style}.ttf', 'Rubik', style, f'Rubik-{style}', weight)

merge(
    [load('secular-one-hebrew-400-normal.woff2'), load('secular-one-latin-400-normal.woff2')],
    'SecularOne-Regular.ttf', 'Secular One', 'Regular', 'SecularOne-Regular', 400,
)
