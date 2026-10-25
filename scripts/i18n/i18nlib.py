import re

def edit(path, pairs, imp=None):
    s = open(path, encoding='utf8').read()
    for a, b in pairs:
        assert s.count(a) == 1, (path, a)
        s = s.replace(a, b)
    if imp and imp not in s:
        lines = s.split('\n')
        last = -1
        inimp = False
        for i, l in enumerate(lines):
            if re.match(r'^import\s', l):
                inimp = True
            if inimp and re.search(r"from\s+['\"][^'\"]+['\"];?\s*$", l):
                last = i
                inimp = False
        lines.insert(last + 1, imp)
        s = '\n'.join(lines)
    open(path, 'w', encoding='utf8').write(s)

def add(lang, ns, anchor, block):
    p = f'i18n/locales/{lang}/{ns}.ts'
    s = open(p, encoding='utf8').read()
    assert s.count(anchor) == 1, (p, anchor)
    s = s.replace(anchor, block + anchor)
    open(p, 'w', encoding='utf8').write(s)

