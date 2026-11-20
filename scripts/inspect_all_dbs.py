import os
import json
import psycopg2
from dotenv import load_dotenv

load_dotenv("backend/.env")

DATABASE_URL = os.getenv("DATABASE_URL")
SUPABASE_URL = os.getenv("SUPABASE_URL")
SUPABASE_SERVICE_ROLE_KEY = os.getenv("SUPABASE_SERVICE_ROLE_KEY") or os.getenv("SUPABASE_KEY")
PINECONE_API_KEY = os.getenv("PINECONE_API_KEY")
PINECONE_INDEX_NAME = os.getenv("PINECONE_INDEX_NAME", "job-tracker-cache")

def inspect_all():
    summary = {}
    
    # 1. Supabase Postgres
    try:
        conn = psycopg2.connect(DATABASE_URL)
        cur = conn.cursor()
        
        cur.execute("""
            SELECT table_name 
            FROM information_schema.tables 
            WHERE table_schema = 'public' 
            ORDER BY table_name;
        """)
        tables = [r[0] for r in cur.fetchall()]
        
        pg_info = {}
        for table in tables:
            cur.execute(f"SELECT COUNT(*) FROM \"{table}\";")
            count = cur.fetchone()[0]
            
            cur.execute("""
                SELECT column_name, data_type, is_nullable
                FROM information_schema.columns
                WHERE table_schema = 'public' AND table_name = %s
                ORDER BY ordinal_position;
            """, (table,))
            cols = cur.fetchall()
            
            cur.execute("""
                SELECT indexname, indexdef
                FROM pg_indexes
                WHERE schemaname = 'public' AND tablename = %s;
            """, (table,))
            indexes = cur.fetchall()
            
            pg_info[table] = {
                "row_count": count,
                "columns": [c[0] for c in cols],
                "column_details": [{"name": c[0], "type": c[1], "nullable": c[2]} for c in cols],
                "indexes": [idx[0] for idx in indexes],
            }
        
        # Check pgvector extension
        cur.execute("SELECT extname, extversion FROM pg_extension WHERE extname = 'vector';")
        pgvector_ext = cur.fetchall()
        
        summary["postgres"] = {
            "tables": pg_info,
            "pgvector_installed": bool(pgvector_ext),
            "pgvector_version": pgvector_ext[0][1] if pgvector_ext else None
        }
        conn.close()
    except Exception as e:
        summary["postgres"] = {"error": str(e)}

    # 2. Supabase Storage
    try:
        import requests
        headers = {
            "apikey": SUPABASE_SERVICE_ROLE_KEY,
            "Authorization": f"Bearer {SUPABASE_SERVICE_ROLE_KEY}"
        }
        resp = requests.get(f"{SUPABASE_URL}/storage/v1/bucket", headers=headers, timeout=5)
        if resp.status_code == 200:
            buckets = resp.json()
            storage_info = []
            for b in buckets:
                b_id = b.get("id")
                # List objects in bucket
                list_resp = requests.post(
                    f"{SUPABASE_URL}/storage/v1/object/list/{b_id}",
                    headers=headers,
                    json={"prefix": "", "limit": 100},
                    timeout=5
                )
                objects = list_resp.json() if list_resp.status_code == 200 else []
                storage_info.append({
                    "id": b_id,
                    "name": b.get("name"),
                    "public": b.get("public"),
                    "objects_count": len(objects) if isinstance(objects, list) else 0,
                    "sample_objects": [obj.get("name") for obj in objects[:5]] if isinstance(objects, list) else []
                })
            summary["storage"] = storage_info
        else:
            summary["storage"] = {"error": f"HTTP {resp.status_code}: {resp.text}"}
    except Exception as e:
        summary["storage"] = {"error": str(e)}

    # 3. Pinecone
    try:
        import requests
        pinecone_headers = {
            "Api-Key": PINECONE_API_KEY,
            "Content-Type": "application/json"
        }
        url = f"https://api.pinecone.io/indexes/{PINECONE_INDEX_NAME}"
        resp = requests.get(url, headers=pinecone_headers, timeout=5)
        if resp.status_code == 200:
            p_data = resp.json()
            host = p_data.get("host")
            # Stats
            stats_resp = requests.post(f"https://{host}/describe_index_stats", headers=pinecone_headers, json={}, timeout=5)
            stats = stats_resp.json() if stats_resp.status_code == 200 else {}
            summary["pinecone"] = {
                "status": "connected",
                "index_name": PINECONE_INDEX_NAME,
                "host": host,
                "dimension": p_data.get("dimension"),
                "metric": p_data.get("metric"),
                "total_vectors": stats.get("totalVectorCount", 0),
                "namespaces": stats.get("namespaces", {})
            }
        else:
            summary["pinecone"] = {
                "status": "error_or_not_found",
                "code": resp.status_code,
                "text": resp.text[:200]
            }
    except Exception as e:
        summary["pinecone"] = {"error": str(e)}

    with open("db_inspection_result.json", "w") as f:
        json.dump(summary, f, indent=2)
    print("Done. Wrote db_inspection_result.json")

if __name__ == "__main__":
    inspect_all()
