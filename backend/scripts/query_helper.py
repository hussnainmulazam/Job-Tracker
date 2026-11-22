"""
Database query helper for E2E tests.
Executes raw SQL or returns table records in JSON format.
"""
import json
import logging
import sys

# Silence SQLAlchemy engine info logs
logging.getLogger("sqlalchemy.engine").setLevel(logging.WARNING)

from sqlmodel import Session, text
from app.db import engine

def run_query(sql_str: str):
    with Session(engine) as session:
        result = session.exec(text(sql_str))
        try:
            rows = result.mappings().all()
            # Convert non-serializable objects (UUIDs, datetimes) to str
            serialized = []
            for row in rows:
                row_dict = {}
                for k, v in row.items():
                    if v is not None and not isinstance(v, (int, float, bool, str, list, dict)):
                        row_dict[k] = str(v)
                    else:
                        row_dict[k] = v
                serialized.append(row_dict)
            return serialized
        except Exception:
            session.commit()
            return [{"status": "ok"}]

if __name__ == "__main__":
    if len(sys.argv) > 1:
        query = sys.argv[1]
        try:
            res = run_query(query)
            print("###JSON_OUTPUT_START###")
            print(json.dumps(res, default=str))
            print("###JSON_OUTPUT_END###")
        except Exception as e:
            print("###JSON_OUTPUT_START###")
            print(json.dumps([{"error": str(e)}]))
            print("###JSON_OUTPUT_END###")
            sys.exit(1)
