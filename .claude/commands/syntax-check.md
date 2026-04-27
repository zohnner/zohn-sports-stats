Run `node --check` on every JS file in the project and report any syntax errors.

```bash
for f in js/*.js functions/api/*.js data/*.js; do
  node --check "$f" 2>&1 && echo "OK  $f" || echo "ERR $f"
done
```

Print a summary: total files checked, any failures. If all pass, say "All JS files pass syntax check."
