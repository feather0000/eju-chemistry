# 从各站已有章节提炼导图第三层小节（不新编）。四站 build 共用这份文件。
import re, html as _html

MAX_KIDS = 6
SKIP_IDS = {
    'freq', 'tips', 'demo', 'examples', 'practice', 'terms',
    'eju-bank', 'eju-style', 'bank', 'search', 'pitfalls',
}
SKIP_TITLE = re.compile(r'真题风格练习|出题频度|互动演示|练习题$|例题$|术语对照')

SUB = {
    '0':'₀','1':'₁','2':'₂','3':'₃','4':'₄','5':'₅','6':'₆','7':'₇','8':'₈','9':'₉',
    '+':'₊','-':'₋','=':'₌','a':'ₐ','e':'ₑ','h':'ₕ','i':'ᵢ','k':'ₖ','m':'ₘ','n':'ₙ',
    'o':'ₒ','p':'ₚ','r':'ᵣ','s':'ₛ','t':'ₜ','x':'ₓ','y':'ᵧ','l':'ₗ',
}
SUP = {
    '0':'⁰','1':'¹','2':'²','3':'³','4':'⁴','5':'⁵','6':'⁶','7':'⁷','8':'⁸','9':'⁹',
    '+':'⁺','-':'⁻','n':'ⁿ','i':'ⁱ',
}

def _brace_arg(s, i):
    """s[i] is '{'; return (inner, index_after_closing) or (None, i)."""
    if i >= len(s) or s[i] != '{':
        return None, i
    depth = 0
    for j in range(i, len(s)):
        if s[j] == '{': depth += 1
        elif s[j] == '}':
            depth -= 1
            if depth == 0:
                return s[i + 1:j], j + 1
    return None, i

def latex_plain(s):
    if not s: return ''
    s = s.strip().strip('$')
    s = s.replace(r'^\circ', '°').replace(r'^\degree', '°')
    s = s.replace('<=>', '⇌').replace('<->', '↔')
    s = s.replace(r'\rightleftharpoons', '⇌').replace(r'\Leftrightarrow', '⇔').replace(r'\leftrightarrow', '↔').replace(r'\iff', '⟺')
    # mhchem
    def _ce(inner):
        inner = inner.replace('->', '→').replace('<-', '←')
        inner = re.sub(r'\s+\^(\s|$)', '↑\\1', inner)
        inner = re.sub(r'\s+v(\s|$)', '↓\\1', inner)
        inner = re.sub(r'\^(\d+\+)', lambda m: ''.join(SUP.get(ch, ch) for ch in m.group(1)), inner)
        inner = re.sub(r'\^(\d+-)', lambda m: ''.join(SUP.get(ch, ch) for ch in m.group(1)), inner)
        inner = re.sub(r'(?<=[A-Za-z)\)])(\d+\+?)', lambda m: ''.join(SUB.get(ch, ch) for ch in m.group(1).replace('+','+')), inner)
        return inner
    for _ in range(4):
        s = re.sub(r'\\ce\{([^{}]*)\}', lambda m: _ce(m.group(1)), s)
        s = re.sub(r'\\(?:mathrm|text|operatorname|mathbf|mathit|textrm|mathrm|rm)\{([^{}]*)\}', r'\1', s)
        s = re.sub(r'\\(?:overline|bar|hat|tilde|vec|boldsymbol|dot|widetilde)\{([^{}]*)\}', r'\1', s)
    # \vec v / \vec F without braces
    s = re.sub(r'\\vec\s*\{([^{}]*)\}', r'\1', s)
    s = re.sub(r'\\vec\s*', '', s)
    s = s.replace(r'\dfrac', r'\frac').replace(r'\tfrac', r'\frac').replace(r'\cfrac', r'\frac')
    # innermost \sqrt and \frac, several passes
    for _ in range(6):
        i, out, changed = 0, '', False
        while i < len(s):
            if s.startswith(r'\sqrt', i):
                j = i + 5
                while j < len(s) and s[j] == ' ': j += 1
                if j < len(s) and s[j] == '{':
                    inner, k = _brace_arg(s, j)
                    if inner is not None:
                        out += '√' + (inner if len(inner) == 1 else inner)
                        i = k; changed = True; continue
                out += s[i]; i += 1; continue
            if s.startswith(r'\frac', i):
                j = i + 5
                while j < len(s) and s[j] == ' ': j += 1
                if j < len(s) and s[j] == '{':
                    a, k = _brace_arg(s, j)
                    if a is not None:
                        while k < len(s) and s[k] == ' ': k += 1
                        if k < len(s) and s[k] == '{':
                            b, k2 = _brace_arg(s, k)
                            if b is not None:
                                if (a, b) == ('1', '2'): out += '½'
                                elif (a, b) == ('1', '4'): out += '¼'
                                elif (a, b) == ('3', '4'): out += '¾'
                                elif (a, b) == ('1', '3'): out += '⅓'
                                else:
                                    out += f'{a}/{b}' if len(a) <= 6 and len(b) <= 10 else f'({a})/({b})'
                                i = k2; changed = True; continue
                # \frac12
                m = re.match(r'\\frac\s*(\d)(\d)', s[i:])
                if m:
                    out += '½' if m.group(1)+m.group(2)=='12' else m.group(1)+'/'+m.group(2)
                    i += m.end(); changed = True; continue
            out += s[i]; i += 1
        s = out
        if not changed: break
    s = re.sub(r'\\frac\s*([A-Za-z0-9]+)\s*([A-Za-z0-9]+)', lambda m: m.group(1) + '/' + m.group(2), s)
    s = re.sub(r'\\sqrt\s*([A-Za-z0-9]+)', lambda m: '√' + m.group(1), s)
    # longer / overlapping commands first; \left before \le
    reps = [
        (r'\longrightarrow', '→'), (r'\Leftrightarrow', '⇔'), (r'\leftrightarrow', '↔'),
        (r'\Rightarrow', '⇒'), (r'\rightarrow', '→'), (r'\Leftarrow', '⇐'), (r'\leftarrow', '←'),
        (r'\to', '→'), (r'\gets', '←'),
        (r'\varepsilon', 'ε'), (r'\vartheta', 'ϑ'), (r'\varphi', 'φ'), (r'\varrho', 'ϱ'),
        (r'\Delta', 'Δ'), (r'\Gamma', 'Γ'), (r'\Theta', 'Θ'), (r'\Lambda', 'Λ'),
        (r'\Xi', 'Ξ'), (r'\Pi', 'Π'), (r'\Sigma', 'Σ'), (r'\Upsilon', 'Υ'), (r'\Phi', 'Φ'),
        (r'\Psi', 'Ψ'), (r'\Omega', 'Ω'),
        (r'\alpha', 'α'), (r'\beta', 'β'), (r'\gamma', 'γ'), (r'\delta', 'δ'),
        (r'\epsilon', 'ε'), (r'\zeta', 'ζ'), (r'\eta', 'η'), (r'\theta', 'θ'),
        (r'\iota', 'ι'), (r'\kappa', 'κ'), (r'\lambda', 'λ'), (r'\mu', 'μ'),
        (r'\nu', 'ν'), (r'\xi', 'ξ'), (r'\pi', 'π'), (r'\rho', 'ρ'),
        (r'\sigma', 'σ'), (r'\tau', 'τ'), (r'\upsilon', 'υ'), (r'\phi', 'φ'),
        (r'\chi', 'χ'), (r'\psi', 'ψ'), (r'\omega', 'ω'),
        (r'\hbar', 'ℏ'), (r'\ell', 'ℓ'), (r'\infty', '∞'), (r'\partial', '∂'),
        (r'\sum', 'Σ'), (r'\int', '∫'), (r'\prod', 'Π'),
        (r'\cdot', '·'), (r'\times', '×'), (r'\pm', '±'), (r'\mp', '∓'),
        (r'\leq', '≤'), (r'\geq', '≥'), (r'\neq', '≠'), (r'\approx', '≈'),
        (r'\propto', '∝'), (r'\equiv', '≡'), (r'\sim', '～'),
        (r'\left', ''), (r'\right', ''), (r'\big', ''), (r'\Big', ''),
        (r'\le', '≤'), (r'\ge', '≥'), (r'\ne', '≠'),
        (r'\circ', '°'), (r'\degree', '°'), (r'\prime', "'"),
        (r'\sin', 'sin'), (r'\cos', 'cos'), (r'\tan', 'tan'), (r'\log', 'log'), (r'\ln', 'ln'),
        (r'\exp', 'exp'), (r'\max', 'max'), (r'\min', 'min'), (r'\lim', 'lim'),
        (r'\quad', ' '), (r'\qquad', ' '), (r'\,', ''), (r'\;', ''), (r'\!', ''),
        (r'\ ', ' '), (r'\:', ''),
        (r'\displaystyle', ''), (r'\textstyle', ''), (r'\scriptstyle', ''),
        (r'\limits', ''), (r'\nolimits', ''), (r'\mathrm', ''), (r'\mathbf', ''),
        (r'\rm', ''), (r'\bf', ''), (r'\hat', ''), (r'\bar', ''), (r'\tilde', ''),
    ]
    # replace longer keys first already listed; still sort by len
    reps = sorted(reps, key=lambda x: -len(x[0]))
    for a, b in reps:
        s = s.replace(a, b)
    s = re.sub(r'_\{([^{}]+)\}', lambda m: ''.join(SUB.get(ch, ch) for ch in m.group(1)), s)
    def _sup(t):
        if t and all(ch in SUP for ch in t):
            return ''.join(SUP[ch] for ch in t)
        return '^(' + t + ')'
    s = re.sub(r'\^\{([^{}]+)\}', lambda m: _sup(m.group(1)), s)
    s = re.sub(r'_([A-Za-z0-9+\-])', lambda m: SUB.get(m.group(1), m.group(1)), s)
    s = re.sub(r'\^([A-Za-z0-9+\-])', lambda m: SUP.get(m.group(1), m.group(1)), s)
    s = re.sub(r'\\frac\s*([A-Za-z0-9α-ωΑ-ΩΔπλμρθ]+)\s*([A-Za-z0-9α-ωΑ-ΩΔπλμρθ]+)', lambda m: m.group(1)+'/'+m.group(2), s)
    s = re.sub(r'\\frac\s*([A-Za-z0-9]+)\s*\{([^{}]+)\}', lambda m: m.group(1)+'/'+('('+m.group(2)+')' if len(m.group(2))>2 else m.group(2)), s)
    s = re.sub(r'\\sqrt\s*([A-Za-z0-9α-ωΑ-ΩΔ]+)', lambda m: '√'+m.group(1), s)
    s = s.replace('->', '→').replace('<-', '←')
    s = s.replace('{', '').replace('}', '').replace('\\', '')
    s = re.sub(r'\s+', ' ', s)
    s = re.sub(r'([ΔδθλμναβγπρωσφΩ])\s+', r'\1', s)
    s = re.sub(r'([A-Za-zα-ωΑ-Ω])\s+([A-Z]{1,4})\b', r'\1\2', s)
    s = re.sub(r'([A-Za-z0-9)])(sin|cos|tan|log|ln)', r'\1 \2', s)
    s = re.sub(r'\(([A-Za-z0-9½¼¾⅓])\)/', r'\1/', s)
    s = re.sub(r'\((Δ?[A-Za-zα-ω][A-Za-z0-9₀-₉]*)\)/\((Δ?[A-Za-zα-ω][A-Za-z0-9₀-₉]*)\)', r'\1/\2', s)
    s = re.sub(r' (?=[最高合内外上下左右大小])', '', s)
    s = re.sub(r'\s+', ' ', s).strip()
    return s


def _strip_tex(text):
    text = re.sub(r'\$\$([^$]+)\$\$', lambda m: latex_plain(m.group(1)), text)
    text = re.sub(r'(?<!\$)\$([^$]+)\$(?!\$)', lambda m: latex_plain(m.group(1)), text)
    return text

def section_intro(body, limit=140):
    if not body: return ''
    parts = re.findall(r'<p>(.*?)</p>', body, re.S)
    text = ' '.join(parts) if parts else body
    text = re.sub(r'<[^>]+>', '', text)
    text = _html.unescape(text)
    text = _strip_tex(text)
    text = ' '.join(text.split())
    if text.startswith('据《'):  # 出题频度套话
        return ''
    buf = ''
    for sent in re.split(r'(?<=[。；！？])', text):
        if not sent.strip(): continue
        if buf and len(buf) + len(sent) > limit: break
        buf += sent
        if len(buf) >= 48: break
    return buf.strip()

def pick_formula(body):
    if not body: return ''
    displays = re.findall(r'\$\$([^$]+)\$\$', body)
    inlines = re.findall(r'(?<!\$)\$([^$]+)\$(?!\$)', body)
    plains = []
    for raw in displays + inlines:
        p = latex_plain(raw).strip()
        if any(ch in p for ch in '=→≈≤≥⇌∝') and p.endswith(('.', '。', '．')):
            p = p[:-1].rstrip()
        compact = re.sub(r'\s+', '', p)
        if len(compact) < 2: continue
        plains.append(p)
    if not plains: return ''
    def score(p):
        s = 0
        compact = re.sub(r'\s+', '', p)
        if any(ch in p for ch in '=→≈≤≥⇌∝'): s += 6
        n = len(compact)
        if 8 <= n <= 28: s += 4
        elif 5 <= n <= 36: s += 2
        if n > 40: s -= 5
        if n < 5: s -= 3
        if re.search(r'=[+\-]?\d+(?:\.\d+)?$', compact): s -= 5
        return s
    ranked = plains[:12]
    best = max(ranked, key=score)
    top = score(best)
    for p0 in ranked:
        if score(p0) >= top - 1:
            return p0
    return best

def _short_title(zh):
    zh = re.sub(r'^\d+\s+', '', zh or '').strip()
    zh = re.sub(r'\$([^$]+)\$', lambda m: latex_plain(m.group(1)), zh)
    return zh.strip()

def kids_from_sections(sections, slug, href_base=None):
    """sections: iterable of (id, zh, ja, body_html)."""
    base = href_base if href_base is not None else f'topics/{slug}/'
    items = []
    for row in sections or []:
        if not row: continue
        sid, zh, ja, body = (list(row) + ['', '', '', ''])[:4]
        if sid in SKIP_IDS or SKIP_TITLE.search(str(zh) or ''): continue
        if not zh: continue
        fml = pick_formula(body)
        intro = section_intro(body)
        if fml and len(intro) < 24:
            intro = (fml + '。' + intro) if intro else fml
        items.append({
            'id': sid,
            'zh': _short_title(zh),
            'ja': ja or '',
            'f': fml,
            'intro': intro,
            'href': f'{base}#{sid}' if sid else base,
        })
    if len(items) > MAX_KIDS:
        extra = items[MAX_KIDS - 1:]
        items = items[:MAX_KIDS - 1]
        items.append({
            'id': '',
            'zh': f'…他 {len(extra)} 项',
            'ja': '',
            'f': '',
            'intro': '其余小节：' + '、'.join(k['zh'] for k in extra) + '。见该专题页。',
            'href': base,
            'more': True,
        })
    return items

def kids_from_html(page_html, slug, href_base=None):
    """微积分等：从专题页 <section id> + <h2> 取小节。"""
    base = href_base if href_base is not None else f'topics/{slug}/'
    if not page_html: return []
    rows = []
    for m in re.finditer(
        r'<section id="([^"]+)"[^>]*>\s*<h2>(.*?)</h2>(.*?)(?=<section id=|$)',
        page_html, re.S,
    ):
        sid, title, body = m.group(1), m.group(2), m.group(3)
        title = _html.unescape(re.sub(r'<[^>]+>', '', title)).strip()
        # 日文副标题
        ja = ''
        jm = re.search(r'<p class="jp-sub"[^>]*>(.*?)</p>', body, re.S)
        if jm:
            ja = _html.unescape(re.sub(r'<[^>]+>', '', jm.group(1))).strip()
        rows.append((sid, title, ja, body))
    return kids_from_sections(rows, slug, base)
