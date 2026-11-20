import os
import psycopg2
from dotenv import load_dotenv

load_dotenv("backend/.env")

DATABASE_URL = os.getenv("DATABASE_URL")

def main():
    if not DATABASE_URL:
        print("DATABASE_URL not found!")
        return

    print("Connecting to Supabase PostgreSQL...")
    conn = psycopg2.connect(DATABASE_URL)
    conn.autocommit = True
    cur = conn.cursor()

    statements = [
        "ALTER TABLE messages ADD COLUMN IF NOT EXISTS channel VARCHAR(30) DEFAULT 'email';",
        "ALTER TABLE candidates ADD COLUMN IF NOT EXISTS auto_reply_sent BOOLEAN NOT NULL DEFAULT false;",
        "ALTER TABLE candidates ADD COLUMN IF NOT EXISTS auto_reply_status VARCHAR(50);",
        "ALTER TABLE candidates ADD COLUMN IF NOT EXISTS auto_reply_error TEXT;",
        "ALTER TABLE candidates ADD COLUMN IF NOT EXISTS auto_reply_sent_at TIMESTAMPTZ;",
        "ALTER TABLE google_accounts ADD COLUMN IF NOT EXISTS auto_reply_enabled BOOLEAN NOT NULL DEFAULT false;",
    ]

    for stmt in statements:
        print(f"Executing: {stmt}")
        cur.execute(stmt)

    # Verify column existence
    cur.execute("""
        SELECT column_name, data_type, column_default
        FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = 'messages' AND column_name = 'channel';
    """)
    res = cur.fetchall()
    print("Messages 'channel' column status:", res)

    # Test query
    cur.execute("SELECT id, channel FROM messages LIMIT 1;")
    print("Test SELECT id, channel FROM messages successful. Row:", cur.fetchone())

    conn.close()
    print("Migration completed successfully!")

if __name__ == "__main__":
    main()
