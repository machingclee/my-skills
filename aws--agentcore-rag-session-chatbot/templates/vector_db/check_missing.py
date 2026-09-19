import os, re, yaml
from pathlib import Path

from env import pg_connect, ROOT

article_dir = str(ROOT / "{{ARTICLES_DIR}}")

# Parse all article files using YAML frontmatter
articles = []
for root, dirs, files in os.walk(article_dir):
    for f in files:
        if f.endswith('-tc.md') or not f.endswith('.md'):
            continue
        filepath = os.path.join(root, f)
        try:
            with open(filepath) as fh:
                content = fh.read()
            # Extract YAML frontmatter between --- markers
            m = re.match(r'^---\s*\n(.*?)\n---', content, re.DOTALL)
            if not m:
                continue
            fm = yaml.safe_load(m.group(1))
            if not fm:
                continue
            title = fm.get('title')
            slug = fm.get('slug') or Path(f).stem
            wip = fm.get('wip', False)
            if title:
                articles.append((str(slug), str(title), filepath, bool(wip)))
        except:
            pass

print(f"Articles found in files: {len(articles)}")

# Get all titles from DB
conn = pg_connect()
cur = conn.cursor()
cur.execute("SELECT DISTINCT metadata->>'title' FROM embeddings")
db_titles = {row[0] for row in cur.fetchall() if row[0]}
cur.close()
conn.close()

print(f"Distinct titles in DB: {len(db_titles)}")

# Match by exact title
missing = []
for aid, title, fpath, wip in articles:
    if title not in db_titles:
        missing.append((aid, title, fpath, wip))

wip_missing = [m for m in missing if m[3]]
real_missing = [m for m in missing if not m[3]]

print(f"\nTotal missing: {len(missing)}")
print(f"  WIP (can skip): {len(wip_missing)}")
print(f"  Real missing:   {len(real_missing)}")
print("=" * 80)

if real_missing:
    print("\n=== NEED VECTORIZATION ===")
    for aid, title, fpath, wip in real_missing:
        print(f"  {aid}: {os.path.basename(fpath)}")
        print(f"       \"{title}\"")

if wip_missing:
    print(f"\n=== WIP (skip) ===")
    for aid, title, fpath, wip in wip_missing:
        print(f"  {aid}: {os.path.basename(fpath)}")
        print(f"       \"{title}\"")
