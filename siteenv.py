"""EJU 站点的正式地址与预览开关。

默认 EJU_ENV=prod：给正式站用，不加「测试版」横幅，也不写 noindex。
EJU_ENV=preview：给 PR / 本地预览构建用，写入 noindex、robots.txt Disallow，
并在页顶加一条指向正式站的横幅。

SITE_BASE 用于预览构建自称的根地址（例如
https://feather0000.github.io/eju-preview/physics/pr-8/）。这时 site_path
会改成对应的路径前缀，并把页面里以 /assets/、/topics/、/physics/ 等开头的
绝对路径改到该前缀下。canonical 和 og:url 始终指向正式站。

不要把 preview 构建的 HTML 提交到四站的 main。
"""
from __future__ import annotations

import os
import re
from urllib.parse import urlparse

PROD = {
    'physics': 'https://eju.feather0.com/',
    'chemistry': 'https://chemistry.eju.feather0.com/',
    'biology': 'https://biology.eju.feather0.com/',
    'calculus': 'https://math.eju.feather0.com/',
}
HUB = 'https://eju.feather0.com/'
# 物理课程首页在总入口域名下的 /physics/，专题仍在域名根路径 /topics/。
COURSE_HOME = {
    'physics': 'physics/',
    'chemistry': '',
    'biology': '',
    'calculus': '',
}

_PV_RE = re.compile(r'<!--eju-pv-->.*?<!--/eju-pv-->', re.S)
_SKIP_DIR = {
    '.git', '.github', '__pycache__', 'content', 'demos_src', 'tools',
    'node_modules', 'codex',
}
_SUFFIX = {'.html', '.htm', '.css', '.js', '.json', '.svg'}
# 只改站点自己的根路径，避免误伤协议相对地址或已经带前缀的链接。
_ROOT_PREFIXES = ('assets/', 'topics/', 'physics/', 'claude/', 'explorer/')
_ATTR_RE = re.compile(
    r'(?P<pre>(?:href|src|poster|action|xlink:href)\s*=\s*(?P<q>["\']))'
    r'/(?P<rest>[^"\']*)(?P=q)',
    re.I,
)
_URL_RE = re.compile(
    r'(?P<pre>url\(\s*(?P<q>["\']?))/(?P<rest>[^"\')\s]+)(?P=q)?\s*\)',
    re.I,
)
_STR_RE = re.compile(
    r'(?P<pre>(?P<q>["\']))/(?P<rest>(?:assets|topics|physics|claude|explorer)/[^"\']*)(?P=q)'
)
_BANNER_STYLE = (
    '<style>'
    '.eju-pv{box-sizing:border-box;width:100%;margin:0;padding:8px 20px;'
    'border-bottom:1px solid #cfc9bc;background:#f6f3eb;color:#1c2024;'
    'font:13.5px/1.55 "Noto Sans SC","PingFang SC",sans-serif;letter-spacing:.04em}'
    '.eju-pv p{margin:0 auto;max-width:72rem}'
    '.eju-pv a{white-space:nowrap;color:#1f4e79;text-decoration:underline;'
    'text-underline-offset:.15em}'
    '[data-theme=dark] .eju-pv{background:#1b1c1a;color:#e8e4db;border-bottom-color:#3a3a36}'
    '[data-theme=dark] .eju-pv a{color:#8cb4d4}'
    '</style>'
)


def _norm(url):
    url = (url or '').strip()
    if url and not url.endswith('/'):
        url += '/'
    return url


def _path_of(url):
    path = urlparse(url).path or '/'
    if not path.endswith('/'):
        path += '/'
    return path


def load(site):
    if site not in PROD:
        raise SystemExit(f'unknown EJU site {site!r}')
    env = os.environ.get('EJU_ENV', 'prod').strip().lower() or 'prod'
    if env not in ('prod', 'preview'):
        print(f'warning: EJU_ENV={env!r} is not prod or preview; using prod')
        env = 'prod'
    prod_url = PROD[site]
    raw_base = os.environ.get('SITE_BASE', '').strip()
    site_base = _norm(raw_base) or prod_url
    if env == 'preview' and raw_base:
        site_path = _path_of(site_base)
    else:
        site_path = '/'
    return type('Cfg', (), {
        'site': site,
        'env': env,
        'preview': env == 'preview',
        'prod_url': prod_url,
        'site_url': prod_url,  # og / canonical
        'site_base': site_base,
        'site_path': site_path,
        'hub': HUB,
        'course_home': COURSE_HOME[site],
    })()


def canonical(cfg, path):
    path = path or ''
    if path.startswith('/'):
        path = path[1:]
    return cfg.prod_url + path


def extra_meta(cfg, path):
    s = f'<link rel="canonical" href="{canonical(cfg, path)}">'
    if cfg.preview:
        s += '<meta name="robots" content="noindex, nofollow">'
    return s


def banner(cfg, path=''):
    if not cfg.preview:
        return ''
    href = canonical(cfg, path)
    return (
        '<!--eju-pv-->' + _BANNER_STYLE +
        '<aside class="eju-pv" role="note">'
        '<p>测试版 / プレビュー　这是预览页，不是正式站。'
        f'<a href="{href}">打开正式版</a></p></aside><!--/eju-pv-->'
    )


def with_banner(cfg, html, path=''):
    html = _PV_RE.sub('', html)
    b = banner(cfg, path)
    if not b:
        return html
    return re.sub(r'(<body\b[^>]*>)', r'\1' + b, html, count=1, flags=re.I)


def write_robots(cfg, path='robots.txt'):
    if cfg.preview:
        open(path, 'w').write('User-agent: *\nDisallow: /\n')
    else:
        open(path, 'w').write('User-agent: *\nAllow: /\n')


def _should_rebase(rest, site_path):
    if rest.startswith('/') or rest.startswith('\\'):
        return False
    if re.match(r'[a-z][a-z0-9+.-]*:', rest, re.I):
        return False
    prefix = site_path.lstrip('/')
    if prefix and rest.startswith(prefix):
        return False
    if rest.startswith('eju-preview/'):
        return False
    if rest == '' or rest.startswith('?') or rest.startswith('#'):
        return True
    return rest.startswith(_ROOT_PREFIXES)


def rebase_text(text, site_path):
    if not site_path or site_path == '/':
        return text

    def attr(m):
        rest = m.group('rest')
        if not _should_rebase(rest, site_path):
            return m.group(0)
        return f"{m.group('pre')}{site_path}{rest}{m.group('q')}"

    def css_url(m):
        rest = m.group('rest')
        if not _should_rebase(rest, site_path):
            return m.group(0)
        q = m.group('q') or ''
        return f"url({q}{site_path}{rest}{q})"

    def js_str(m):
        rest = m.group('rest')
        if not _should_rebase(rest, site_path):
            return m.group(0)
        return f"{m.group('pre')}{site_path}{rest}{m.group('q')}"

    text = _ATTR_RE.sub(attr, text)
    text = _URL_RE.sub(css_url, text)
    text = _STR_RE.sub(js_str, text)
    return text


def _decorate_html(cfg, html, path):
    if 'name="robots"' not in html.lower():
        html = re.sub(
            r'(<head\b[^>]*>)',
            r'\1<meta name="robots" content="noindex, nofollow">',
            html, count=1, flags=re.I,
        )
    return with_banner(cfg, html, path)


def finalize_tree(cfg, root='.'):
    """Preview only: rebase root-absolute URLs and make sure every HTML page
    has the banner plus noindex. No-op for production builds."""
    if not cfg.preview:
        return 0
    root = os.path.abspath(root)
    changed = 0
    for dirpath, dirnames, filenames in os.walk(root):
        dirnames[:] = [d for d in dirnames if d not in _SKIP_DIR and not d.startswith('.')]
        for name in filenames:
            if name in ('robots.txt', 'CNAME'):
                continue
            ext = os.path.splitext(name)[1].lower()
            if ext not in _SUFFIX:
                continue
            path = os.path.join(dirpath, name)
            rel = os.path.relpath(path, root).replace('\\', '/')
            raw = open(path, encoding='utf-8').read()
            new = rebase_text(raw, cfg.site_path)
            if ext in ('.html', '.htm'):
                page = rel
                if page.endswith('/index.html'):
                    page = page[: -len('index.html')]
                elif page in ('index.html', '404.html') or page.endswith('/404.html'):
                    page = ''
                new = _decorate_html(cfg, new, page)
            if new != raw:
                open(path, 'w', encoding='utf-8').write(new)
                changed += 1
    print(f'siteenv: finalized {changed} preview files under {cfg.site_path}')
    return changed
