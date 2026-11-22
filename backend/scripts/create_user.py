"""
CLI script to create a user account in the database.

Usage:
    python scripts/create_user.py --email admin@example.com --password StrongPassword123!
    python scripts/create_user.py (interactive prompt)
"""
import argparse
import getpass
import os
import sys
from pathlib import Path

# Add backend to sys.path
backend_dir = Path(__file__).resolve().parent.parent / "backend"
sys.path.insert(0, str(backend_dir))

from sqlmodel import Session, select
from app.core.config import settings
from app.core.security import hash_password
from app.db import engine
from app.models.user import User


def create_user(email: str, password: str) -> User:
    email = email.strip().lower()
    if not email or "@" not in email:
        print("Error: A valid email address is required.")
        sys.exit(1)

    if not password or len(password) < 8:
        print("Error: Password must be at least 8 characters long.")
        sys.exit(1)

    with Session(engine) as session:
        existing = session.exec(select(User).where(User.email == email)).first()
        if existing:
            print(f"Notice: User with email '{email}' already exists (ID: {existing.id}).")
            return existing

        user = User(
            email=email,
            hashed_password=hash_password(password),
        )
        session.add(user)
        session.commit()
        session.refresh(user)

        print(f"Success! Created user '{email}' with ID: {user.id}")
        return user


def main():
    parser = argparse.ArgumentParser(description="Create a recruiter account in the database.")
    parser.add_argument("--email", "-e", help="User email address")
    parser.add_argument("--password", "-p", help="User password")
    args = parser.parse_args()

    email = args.email
    password = args.password

    if not email:
        email = input("Enter email address: ").strip()

    if not password:
        password = getpass.getpass("Enter password (min 8 chars): ").strip()

    create_user(email, password)


if __name__ == "__main__":
    main()
