import sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parent))
from app.main import app

openapi = app.openapi()
paths = openapi.get("paths", {})
print(f"Total distinct paths defined in OpenAPI: {len(paths)}")
endpoints = []
for path, methods in sorted(paths.items()):
    for method in sorted(methods.keys()):
        endpoints.append(f"{method.upper():6} {path}")

print(f"Total distinct method+path endpoints: {len(endpoints)}")
for ep in endpoints:
    print(ep)
