# 試作のテンプレートとデータから、公開用の index.html を作る
#   python3 tools/build.py
import pathlib
R = pathlib.Path(__file__).resolve().parent.parent
t = (R / 'src/app.tpl.html').read_text()
d = (R / 'src/data.json').read_text()

def sub(old, new, count=1):
    global t
    assert t.count(old) == count, (old, t.count(old))
    t = t.replace(old, new)

HEAD = '''<!doctype html>
<html lang="ja">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">
<meta name="theme-color" content="#f6f3ec">
<title>たね</title>
<link rel="manifest" href="manifest.webmanifest">
<link rel="icon" href="icon.svg" type="image/svg+xml">
<link rel="apple-touch-icon" href="icon-192.png">
<script src="config.js"></script>
<script src="tane-cloud.js"></script>'''
sub('<title>たねの掛け合わせ</title>\n<meta name="claude:viewport-fit-sides" content="cover">', HEAD)
sub('<div class="page">', '</head>\n<body>\n<div class="page">')
# 保存のたびにサーバーへも送る
sub('localStorage.setItem("tane-projects",JSON.stringify(P))', 'localStorage.setItem("tane-projects",JSON.stringify(P));window.taneSync?.("tane-projects")')
sub('localStorage.setItem("tane-swipe",JSON.stringify({W,SW}))', 'localStorage.setItem("tane-swipe",JSON.stringify({W,SW}));window.taneSync?.("tane-swipe")')
sub('この画面ではAIを呼べません。claude.ai で開くと、ここでAIが実行します。', 'いまはAIを呼べません。通信を確かめて、開き直してください。')
# 引き継ぎの置き場所
sub('<div id="v-stock" hidden><div class="stk" id="stk"></div></div>', '<div id="v-stock" hidden><div class="stk" id="stk"></div><div class="stk" id="acct"></div></div>')
sub('</style>', '''.acct{border:1.5px solid var(--line);border-radius:16px;padding:10px 14px;background:var(--paper);margin-top:18px}
.acct summary{font-weight:700;cursor:pointer}
.acct-p{color:var(--muted);font-size:.84rem;margin:8px 0}
.acct-f{display:flex;flex-wrap:wrap;gap:8px}
.acct-f input{flex:1 1 220px;min-width:0;border:1.5px solid var(--line);border-radius:12px;padding:9px 12px;font:inherit;background:var(--bg);color:var(--ink)}
.acct-f button{border:1.5px solid var(--accent);background:var(--accent);color:var(--accent-ink);border-radius:999px;padding:8px 16px;font-weight:700}
.acct-f button.sub{background:transparent;color:var(--ink);border-color:var(--line)}
</style>''')
t = t.replace('/*DATA*/{}', d)
assert '/*DATA*/' not in t
t += '''
<script>if("serviceWorker"in navigator&&location.protocol==="https:")navigator.serviceWorker.register("sw.js")</script>
</body>
</html>
'''
(R / 'public').mkdir(exist_ok=True)
(R / 'public/index.html').write_text(t)
print('public/index.html', len(t))
import shutil
shutil.copy(R / 'src/tane-cloud.js', R / 'public/tane-cloud.js')
