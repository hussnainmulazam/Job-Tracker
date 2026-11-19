"""
Database and Storage Reset Script for Job Tracker / TalentFlow.

Usage:
  python scripts/reset_db.py --dry-run
  python scripts/reset_db.py --confirm
"""
import argparse
import os
import shutil
import sys
from pathlib import Path
import psycopg
from dotenv import load_dotenv

load_dotenv("backend/.env")
db_url = os.getenv("DATABASE_URL")

PRESERVE_EMAIL = "hussnainmulazam@gmail.com"

# Tables to completely empty (TRUNCATE CASCADE or DELETE)
EMPTY_TABLES = [
    "candidate_links",
    "scorecards",
    "interviews",
    "scheduling_links",
    "availability_schedules",
    "messages",
    "notifications",
    "audit_logs",
    "emails_synced",
    "candidates",
    "job_openings",
    "cv_versions",
    "applications",
    "jobs",
]

def get_row_counts(cur):
    counts = {}
    cur.execute("""
        SELECT table_name 
        FROM information_schema.tables 
        WHERE table_schema = 'public' 
        ORDER BY table_name;
    """)
    tables = [r[0] for r in cur.fetchall()]
    for t in tables:
        cur.execute(f'SELECT count(*) FROM "{t}";')
        counts[t] = cur.fetchone()[0]
    return counts

def reset_database(confirm: bool = False):
    if not db_url:
        print("ERROR: DATABASE_URL not found in backend/.env")
        sys.exit(1)
        
    conn = psycopg.connect(db_url, connect_timeout=20)
    cur = conn.cursor()
    
    print("=" * 60)
    print("   JOB TRACKER DATABASE RESET & PURGE UTILITY")
    print("=" * 60)
    
    cur.execute("SELECT id, email FROM users WHERE email = %s;", (PRESERVE_EMAIL,))
    user_row = cur.fetchone()
    if not user_row:
        print(f"WARNING: Primary user {PRESERVE_EMAIL} not found in database!")
    else:
        user_id = user_row[0]
        print(f"Preserving Login User: {PRESERVE_EMAIL} (ID: {user_id})")

    print("\nCurrent table counts before reset:")
    counts_before = get_row_counts(cur)
    for t, c in counts_before.items():
        print(f"  {t.ljust(25)}: {c} rows")
        
    if not confirm:
        print("\n[DRY RUN ONLY] No changes were made. Use --confirm to perform actual purge.")
        conn.close()
        return

    print("\nExecuting database purge...")
    
    # 1. Truncate all application tables
    for t in EMPTY_TABLES:
        try:
            cur.execute(f'TRUNCATE TABLE "{t}" RESTART IDENTITY CASCADE;')
            print(f"  Truncated {t}")
        except Exception as e:
            print(f"  Could not truncate {t}: {e}, trying DELETE...")
            conn.rollback()
            cur.execute(f'DELETE FROM "{t}";')
            conn.commit()
            print(f"  Deleted all from {t}")

    # 2. Clean google_accounts (keep only preserved user)
    if user_row:
        cur.execute("DELETE FROM google_accounts WHERE user_id != %s;", (user_id,))
    else:
        cur.execute("DELETE FROM google_accounts;")
    print("  Cleaned google_accounts (kept primary user)")

    # 3. Clean users table (keep only preserved user)
    if user_row:
        cur.execute("DELETE FROM users WHERE email != %s;", (PRESERVE_EMAIL,))
    print(f"  Cleaned users table (kept only {PRESERVE_EMAIL})")

    conn.commit()

    # 4. Clean storage buckets if any
    try:
        cur.execute("SELECT id FROM storage.buckets;")
        buckets = cur.fetchall()
        for b in buckets:
            cur.execute("DELETE FROM storage.objects WHERE bucket_id = %s;", (b[0],))
            print(f"  Emptied Supabase storage bucket: {b[0]}")
        conn.commit()
    except Exception as e:
        print(f"  Storage clean notice: {e}")

    # 5. Clean local uploads
    for folder in ["uploads", "backend/uploads"]:
        p = Path(folder)
        if p.exists():
            for item in p.iterdir():
                if item.is_file() and item.name != ".gitkeep":
                    item.unlink()
                elif item.is_dir():
                    shutil.rmtree(item)
            print(f"  Cleaned local files in {folder}/")

    print("\nRow counts after reset:")
    counts_after = get_row_counts(cur)
    for t, c in counts_after.items():
        print(f"  {t.ljust(25)}: {c} rows")

    conn.close()
    print("\nDatabase reset complete!")

if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Purge fake/test data from DB while keeping primary user & connection.")
    parser.add_argument("--confirm", action="store_true", help="Execute the deletion")
    parser.add_argument("--dry-run", action="store_true", help="Perform a dry run without changing data")
    args = parser.parse_args()
    
    if not args.confirm and not args.dry_run:
        print("Please specify either --dry-run or --confirm")
        sys.exit(1)
        
    reset_database(confirm=args.confirm)
