import asyncio
import json
import os
import sys

# Add backend to path
sys.path.insert(0, os.path.abspath("backend"))

from app.routers.debug import debug_integrations

async def main():
    print("Running debug_integrations()...")
    res = await debug_integrations(verified_phone="923704570873")
    print("=== DIAGNOSTIC RESULTS ===")
    print(json.dumps(res, indent=2))

if __name__ == "__main__":
    asyncio.run(main())
