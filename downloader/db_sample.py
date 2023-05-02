"""
Builds and exports variable covers_db to be used in other scripts.
"""

from sqlalchemy import create_engine
from sqlalchemy.orm import scoped_session, sessionmaker

def get_covers_db():
    engine = create_engine(
        "mysql+mysqldb://username:password@hostname:3306/db$db",
        pool_recycle=3600,
    )
    session_factory = sessionmaker(bind=engine)
    session = scoped_session(session_factory)
    return session
