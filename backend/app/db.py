"""MySQL: the shared engine settings and the table registry the migrations are checked against."""

import ssl

from sqlalchemy import URL, Engine, MetaData, create_engine

# Every table module (app/questions/sql.py, app/takes/sql.py) registers its table here.
metadata = MetaData()


def create_mysql_engine(url: URL) -> Engine:
    # TLS without certificate checks: the database is reached by private IP inside the VCN,
    # and its certificate is self-signed.
    tls = ssl.create_default_context()
    tls.check_hostname = False
    tls.verify_mode = ssl.CERT_NONE
    return create_engine(
        url,
        connect_args={"ssl": tls},
        pool_size=5,
        max_overflow=5,
        # The server drops idle connections; recycle before that and check before each use.
        pool_recycle=280,
        pool_pre_ping=True,
    )
