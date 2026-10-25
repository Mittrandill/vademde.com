"""Kullanıcıya görünebilecek metinleri (string literal + JSX text) satır numarasıyla listeler."""
import re, sys

CODE_ATTRS = re.compile(r'\b(variant|color|name|accessibilityRole|keyboardType|autoCapitalize|returnKeyType|pathname|icon|tone|size|behavior|textContentType|autoComplete|keyboardShouldPersistTaps|align|gap|key|queryKey|style|resizeMode|mode|display|presentation|animation|testID|direction|status|type|kind|format|unit|code)\s*[=:]\s*$')
SKIP_LINE = re.compile(r"^\s*(import |export \* from|//|\*|/\*)|from '|require\(|console\.|router\.(push|replace)\(['`]/|queryKey:|\.select\(|\.eq\(|\.from\(|\.in\(|\.order\(")
LIT = re.compile(r"'((?:[^'\\\n]|\\.)*)'|\"((?:[^\"\\\n]|\\.)*)\"|`((?:[^`\\]|\\.)*)`")
TRCH = re.compile(r'[çğıöşüÇĞİÖŞÜ]')

def interesting(s):
    if not re.search(r'[A-Za-zçğıöşüÇĞİÖŞÜ]{2,}', s):
        return False
    if s.startswith(('@/', './', '../', '/', 'http', '#', 'rgba', 'ios', 'android')):
        return False
    if re.fullmatch(r'[a-z0-9_\-.:/\[\]${}]+', s) and not TRCH.search(s):
        return False  # kod tanımlayıcısı
    if re.fullmatch(r'[A-Z][A-Za-z]+', s) and s in ('TRY', 'USD', 'EUR'):
        return False
    if re.fullmatch(r'[a-zA-Z]+(-[a-z]+)*(-outline)?', s) and not TRCH.search(s) and ' ' not in s and s[0].islower():
        return False
    return True

for path in sys.argv[1:]:
    lines = open(path, encoding='utf8').read().split('\n')
    print(f'--- {path}')
    for i, line in enumerate(lines, 1):
        if SKIP_LINE.search(line):
            continue
        hits = []
        for m in LIT.finditer(line):
            s = next(g for g in m.groups() if g is not None)
            before = line[:m.start()]
            if CODE_ATTRS.search(before):
                continue
            if re.search(r"\bt\($", before) or re.search(r"\bt\(\s*$", before):
                continue
            if interesting(s):
                hits.append(s)
        stripped = line.strip()
        # JSX text satırı: etiket/ifade içermeyen düz metin
        if stripped and not hits and not re.search(r"[=;(){}\[\]<>]|^\w+[,:]|^[.?:|&]|^\.\.\.|=>", stripped) \
                and re.search(r'[A-Za-zçğıöşü]{3,}\s+[A-Za-zçğıöşü]', stripped):
            hits.append('JSX: ' + stripped)
        if stripped and not hits and re.fullmatch(r"[A-ZÇĞİÖŞÜ][A-Za-zÇĞİÖŞÜçğıöşü .,'’/%…!?-]*", stripped) and not re.fullmatch(r"[A-Z][a-zA-Z]+,?", stripped):
            hits.append('JSX: ' + stripped)
        elif stripped and not hits and re.fullmatch(r"[A-ZÇĞİÖŞÜ]{2,}[A-ZÇĞİÖŞÜ ]*", stripped):
            hits.append('JSX: ' + stripped)
        m2 = re.search(r'>([^<>{}]*[A-Za-zçğıöşüÇĞİÖŞÜ]{2,}[^<>{}]*)<', line)
        if m2 and m2.group(1).strip():
            hits.append('JSX: ' + m2.group(1).strip())
        if hits:
            print(f'{i}: ' + ' | '.join(hits))
