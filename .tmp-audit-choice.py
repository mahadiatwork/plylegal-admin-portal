import json, pathlib, re

admin = pathlib.Path(r"F:\Work Projects\ply-legal-admin-portal")
client = pathlib.Path(r"F:\Work Projects\plylegal-client-portal")
fields = [json.loads(line) for line in (admin / ".tmp-text-fields.jsonl").read_text(encoding="utf-8").splitlines() if line.startswith("{")]
roots = [client / "app" / "intake", client / "src" / "components" / "intake"]
files = []
for root in roots:
    files.extend([p for p in root.rglob("*") if p.suffix in {".js", ".jsx", ".ts", ".tsx"}])

controls = re.compile(r"<(?:RadioGroup|Select|Checkbox|Combobox|CountrySelect|CountryCombobox)|RadioGroupItem|SelectItem|type\s*=\s*[\"'](?:radio|select|checkbox)[\"']")
field_by_key = {}
for field in fields:
    field_by_key.setdefault(field["key"], []).append(field)
all_keys = set(field_by_key)
hits_by_key = {key: [] for key in all_keys}
identifier = re.compile(r"[A-Za-z_][A-Za-z0-9_]*")

for path in files:
    text = path.read_text(encoding="utf-8", errors="ignore")
    lines = text.splitlines()
    rel = str(path.relative_to(client)).replace("\\", "/")
    for i, line in enumerate(lines):
        keys = set(identifier.findall(line)) & all_keys
        if not keys:
            continue
        lo, hi = max(0, i - 22), min(len(lines), i + 23)
        block = "\n".join(lines[lo:hi])
        found = controls.findall(block)
        if not found:
            continue
        for key in keys:
            hits_by_key[key].append((rel, i + 1, sorted(set(found)), line.strip()))

ignored_route_parts = {"", "intake", "temporary-work", "partner", "protection", "main-applicant", "spouse-partner", "all-applicants", "family-sponsor", "relationships", "children"}
for field in fields:
    route_parts = [part for part in field["route"].split("/") if part not in ignored_route_parts]
    hits = []
    for rel, line, found, source_line in hits_by_key[field["key"]]:
        score = sum(1 for part in route_parts if part.replace("-", "_") in rel.replace("-", "_"))
        hits.append((score, rel, line, found, source_line))
    if hits:
        hits.sort(key=lambda x: (-x[0], x[1], x[2]))
        print(json.dumps({**field, "hits": hits[:8]}, ensure_ascii=False))
