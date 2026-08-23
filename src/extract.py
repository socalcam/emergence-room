#!/usr/bin/env python3
"""Pull final pieces out of the workflow journal into pieces.json."""
import json, sys
J = sys.argv[1]
impls, finals = {}, {}
for line in open(J):
    try: e = json.loads(line)
    except: continue
    r = e.get('result')
    if not isinstance(r, dict): continue
    if 'verdict' in r and 'final_code' in r:
        finals[r['slug']] = r
    elif 'code' in r and 'rule' in r:
        impls[r['slug']] = r
out = []
for slug, im in impls.items():
    fv = finals.get(slug)
    p = dict(im)
    if fv:
        p['code'] = fv.get('final_code') or im['code']
        p['verdict'] = fv.get('verdict')
        p['issues'] = fv.get('issues') or []
    out.append(p)
S = '/tmp/claude-1000/-home-cameron/2b5580ff-8ba9-49b9-866f-ad2aa931e3e0/scratchpad'
json.dump(out, open(f'{S}/pieces.json','w'))
for p in out:
    print(f"{p['slug']:<10} {p.get('verdict','?'):<7} issues={len(p.get('issues',[]))} code={len(p['code'])}B accent={p.get('accent')}")
print(f"total: {len(out)}")
