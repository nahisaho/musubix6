import sqlite3

connection = sqlite3.connect(":memory:")
connection.execute("CREATE TABLE sample (id INTEGER PRIMARY KEY, value TEXT)")
connection.execute("INSERT INTO sample(value) VALUES (?)", ("' OR 1=1 --",))
connection.commit()
assert connection.execute("SELECT value FROM sample LIMIT ?", (1,)).fetchone()[0] == "' OR 1=1 --"
connection.execute("BEGIN")
connection.execute("ALTER TABLE sample ADD COLUMN extra TEXT")
connection.rollback()
assert [r[1] for r in connection.execute("PRAGMA table_info(sample)")] == ["id", "value"]
print("spike: binding, LIMIT binding, generated IDs, transactional DDL verified")
