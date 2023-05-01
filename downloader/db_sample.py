"""
Builds and exports variable covers_db to be used in other scripts.
"""

import MySQLdb

covers_db = MySQLdb.connect(
        user="username",
        passwd="password",
        host="hostname",
        port=3306,
        db="db$db",
    )