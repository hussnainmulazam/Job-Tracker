"""
Export all tables from PostgreSQL to SQL format.
"""
import os
import datetime
from pathlib import Path
import psycopg
from dotenv import load_dotenv

load_dotenv("backend/.env")
db_url = os.getenv("DATABASE_URL")

backup_dir = Path("backups")
backup_dir.mkdir(exist_ok=True)
date_str = datetime.date.today().isoformat()
backup_file = backup_dir / f"pre-reset-{date_str}.sql"

print(f"Connecting to database to generate backup: {backup_file} ...")
conn = psycopg.connect(db_url, connect_timeout=20)
cur = conn.cursor()

cur.execute("""
    SELECT table_name 
    FROM information_schema.tables 
    WHERE table_schema = 'public' 
    ORDER BY table_name;
""")
tables = [r[0] for r in cur.fetchall()]

with open(backup_file, "w", encoding="utf-8") as f:
    f.write(f"-- Backup generated on {datetime.datetime.now().isoformat()}\n\n")
    for table in tables:
        f.write(f"-- Table: {table}\n")
        cur.execute(f'SELECT * FROM "{table}";')
        rows = cur.fetchall()
        if not rows:
            f.write(f"-- No rows in {table}\n\n")
            continue
        
        col_names = [desc[0] for desc in cur.description]
        cols_formatted = ", ".join([f'"{col}"' for col in col_names])
        
        for row in rows:
            vals = []
            for val in row:
                if val is None:
                    vals.append("NULL")
                elif isinstance(val, (int, float)):
                    vals.append(str(val))
                elif isinstance(val, bool):
                    vals.append("TRUE" if val else "FALSE")
                elif isinstance(val, (dict, list)):
                    import json
                    json_str = json.dumps(val).replace("'", "''")
                    vals.append(f"'{json_str}'")
                else:
                    val_str = str(val).replace("'", "''")
                    vals.append(f"'{val_str}'")
            vals_formatted = ", ".join(vals)
            f.write(f'INSERT INTO "{table}" ({cols_formatted}) VALUES ({vals_formatted});\n')
        f.write("\n")

conn.close()
print(f"Backup complete! Successfully wrote to {backup_file} (Size: {backup_file.stat().st_size} bytes)")
