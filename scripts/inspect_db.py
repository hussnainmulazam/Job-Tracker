import os
import json
import psycopg2
from dotenv import load_dotenv

load_dotenv("backend/.env")

DATABASE_URL = os.getenv("DATABASE_URL")

def inspect_postgres():
    conn = psycopg2.connect(DATABASE_URL)
    cur = conn.cursor()
    
    # 1. Get all public tables
    cur.execute("""
        SELECT table_name 
        FROM information_schema.tables 
        WHERE table_schema = 'public' 
        ORDER BY table_name;
    """)
    tables = [r[0] for r in cur.fetchall()]
    
    result = {}
    for table in tables:
        # Row count
        cur.execute(f"SELECT COUNT(*) FROM \"{table}\";")
        count = cur.fetchone()[0]
        
        # Columns
        cur.execute("""
            SELECT column_name, data_type, is_nullable
            FROM information_schema.columns
            WHERE table_schema = 'public' AND table_name = %s
            ORDER BY ordinal_position;
        """, (table,))
        cols = cur.fetchall()
        
        # Indexes
        cur.execute("""
            SELECT indexname, indexdef
            FROM pg_indexes
            WHERE schemaname = 'public' AND tablename = %s;
        """, (table,))
        indexes = cur.fetchall()
        
        # Foreign keys
        cur.execute("""
            SELECT
                kcu.column_name,
                ccu.table_name AS foreign_table_name,
                ccu.column_name AS foreign_column_name
            FROM information_schema.table_constraints AS tc
            JOIN information_schema.key_column_usage AS kcu
              ON tc.constraint_name = kcu.constraint_name
              AND tc.table_schema = kcu.table_schema
            JOIN information_schema.constraint_column_usage AS ccu
              ON ccu.constraint_name = tc.constraint_name
              AND ccu.table_schema = tc.table_schema
            WHERE tc.constraint_type = 'FOREIGN KEY' AND tc.table_name = %s;
        """, (table,))
        fks = cur.fetchall()

        result[table] = {
            "row_count": count,
            "columns": [{"name": c[0], "type": c[1], "nullable": c[2]} for c in cols],
            "indexes": [idx[0] for idx in indexes],
            "foreign_keys": [{"col": fk[0], "ref_table": fk[1], "ref_col": fk[2]} for fk in fks]
        }
        
    print(json.dumps(result, indent=2))
    conn.close()

if __name__ == "__main__":
    inspect_postgres()
