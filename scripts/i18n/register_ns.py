# Kullanım: python register_ns.py <ns> [<ns> ...]  — i18n/locales/{tr,en}/index.ts'e namespace ekler (alfabetik).
import re, sys
for ns in sys.argv[1:]:
    for lang in ['tr', 'en']:
        p = f'i18n/locales/{lang}/index.ts'
        s = open(p, encoding='utf8').read()
        if f"from './{ns}';" in s:
            continue
        imports = re.findall(r"^import \{ (\w+) \} from '\./\w+';$", s, re.M)
        names = sorted(set(imports + [ns]))
        body_start = s.index('= {') + 3
        head = s[:s.index("import { ")] if lang == 'tr' else s[:s.index("import { ")]
        prefix = s[:s.index("import { " + imports[0] + " }")]
        decl = s[s.index('export const'):body_start]
        out = prefix + ''.join(f"import {{ {n} }} from './{n}';\n" for n in names) + '\n' + decl + '\n' + ''.join(f'  {n},\n' for n in names) + '};\n'
        open(p, 'w', encoding='utf8').write(out)
print(open('i18n/locales/en/index.ts', encoding='utf8').read())
