#!/usr/bin/env python3
"""Assemble The Emergence Room from workflow piece results."""
import json, sys, html

S = '/tmp/claude-1000/-home-cameron/2b5580ff-8ba9-49b9-866f-ad2aa931e3e0/scratchpad'
SEED = int(open(f'{S}/seed.txt').read().strip())
ORDER = ['physarum', 'reaction', 'particles', 'attractor', 'dla', 'cyclic']

pieces = json.load(open(f'{S}/pieces.json'))
by = {p['slug']: p for p in pieces}
pieces = [by[s] for s in ORDER if s in by] + [p for p in pieces if p['slug'] not in ORDER]

cards, meta, code = [], [], []
for i, p in enumerate(pieces, 1):
    fno = f'EM-{i:02d}'
    acc = p.get('accent') or '#8b93a3'
    esc = lambda t: html.escape(t or '', quote=True)
    cards.append(f'''
    <article class="spec" style="--acc:{esc(acc)}">
      <div class="view" id="view-{p['slug']}">
        <canvas id="cv-{p['slug']}" aria-label="{esc(p['name'])} simulation"></canvas>
        <button class="expand" id="ex-{p['slug']}" title="Observe full-screen" aria-label="Observe {esc(p['name'])} full-screen">⤢</button>
      </div>
      <div class="label">
        <div class="fno">{fno} · living specimen</div>
        <h2 id="ttl-{p['slug']}">{esc(p['name'])}</h2>
        <i class="taxon">{esc(p['subtitle'])}</i>
        <p class="rule"><b>The rule:</b> {esc(p['rule'])}</p>
        <div class="hint">{esc(p['interaction'])}</div>
      </div>
    </article>''')
    meta.append({k: p.get(k, '') for k in
                 ('slug', 'name', 'subtitle', 'rule', 'detail', 'interaction')}
                | {'fno': fno, 'accent': acc})
    code.append(f"/* ---- {fno} {p['name']} ({p['slug']}) ---- */\n" + p['code'])

concat = '\n\n'.join(code)
open(f'{S}/pieces.concat.js', 'w').write(concat)

head = open(f'{S}/em_head.html').read()
runtime = open(f'{S}/em_runtime.html').read()
runtime = runtime.replace('%%SEED%%', str(SEED)).replace(
    '%%META%%', json.dumps(meta, ensure_ascii=False))
page = (head.replace('%%CARDS%%', '\n'.join(cards))
        + '\n<script>\n' + concat + '\n</script>\n' + runtime)
open(f'{S}/emergence.html', 'w').write(page)
print(f'assembled {len(pieces)} pieces, page {len(page)} bytes, concat {len(concat)} bytes')
