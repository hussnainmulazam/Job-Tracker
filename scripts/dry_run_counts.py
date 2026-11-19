"""
Dry-run script to list row count of every app table and Supabase Storage bucket.
"""
import os
import psycopg
from dotenv import load_dotenv

load_dotenv("backend/.env")
db_url = os.getenv("DATABASE_URL")

conn = psycopg.connect(db_url, connect_timeout=20)
cur = conn.cursor()

print("=" * 60)
print("             DATABASE TABLE ROW COUNTS (DRY RUN)")
print("=" * 60)

cur.execute("""
    SELECT table_name 
    FROM information_schema.tables 
    WHERE table_schema = 'public' 
    ORDER BY table_name;
""")
tables = [r[0] for r in cur.fetchall()]

for t in tables:
    cur.execute(f'SELECT count(*) FROM "{t}";')
    cnt = cur.fetchone()[0]
    print(f"  {t.ljust(30)}: {cnt} rows")

print("\n" + "=" * 60)
print("           SUPABASE STORAGE BUCKET COUNTS (DRY RUN)")
print("=" * 60)
try:
    cur.execute("SELECT id, name FROM storage.buckets;")
    buckets = cur.fetchall()
    if not buckets:
        print("  No storage buckets found in Supabase storage schema (0 buckets).")
    else:
        for b_id, b_name in buckets:
            cur.execute("SELECT count(*) FROM storage.objects WHERE bucket_id = %s;", (b_id,))
            obj_cnt = cur.fetchone()[0]
            print(f"  Bucket '{b_name}' ({b_id}): {obj_cnt} objects")
except Exception as e:
    print(f"  Error reading storage.buckets: {e}")

from pathlib import Path
local_uploads = list(Path("uploads").glob("*")) if Path("uploads").exists() else []
backend_uploads = list(Path("backend/uploads").glob("*")) if Path("backend/uploads").exists() else []
print("\n" + "=" * 60)
print("             LOCAL STORAGE FILES (DRY RUN)")
print("=" * 60)
print(f"  uploads/                   : {len(local_uploads)} files")
print(f"  backend/uploads/           : {len(backend_uploads)} files")

print("\n" + "=" * 60)
print("         PRESERVED LOGIN USER & GOOGLE CONNECTION")
print("=" * 60)
cur.execute("SELECT id, email, created_at FROM users WHERE email = 'hussnainmulazam@gmail.com';")
user_row = cur.fetchone()
print(f"  Login User to Keep: {user_row}")

cur.execute("SELECT id, user_id, email, last_synced_at FROM google_accounts WHERE email = 'hussnainmulazam@gmail.com';")
google_row = cur.fetchone()
print(f"  Google Connection to Keep: {google_row}")

conn.close()
