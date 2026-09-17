import sqlite3
from datetime import datetime, timezone

db_path = "C:/Users/Administrator/Documents/BedaanWaves_Alpha/prisma/db/custom.db"
conn = sqlite3.connect(db_path)
cursor = conn.cursor()

# Step 1: Delete old integer snapshots that conflict with my new ones (2026-09-16T22:00:00.000Z)
cursor.execute("""
    DELETE FROM ScoreSnapshot
    WHERE typeof(capturedAt) = 'integer'
    AND ticker IN (SELECT ticker FROM ScoreSnapshot WHERE capturedAt = '2026-09-16T22:00:00.000Z')
""")
deleted = cursor.rowcount
print(f"Deleted {deleted} conflicting snapshots")

# Step 2: Convert remaining integer timestamps to ISO strings
cursor.execute("SELECT id, ticker, capturedAt FROM ScoreSnapshot WHERE typeof(capturedAt) = 'integer'")
rows = cursor.fetchall()
print(f"Converting {len(rows)} remaining integer timestamps...")

fixed = 0
skipped = 0
for row in rows:
    snapshot_id, ticker, ts = row
    dt = datetime.fromtimestamp(ts / 1000, tz=timezone.utc)
    iso_str = dt.strftime("%Y-%m-%dT%H:%M:%S.000Z")
    try:
        cursor.execute("UPDATE ScoreSnapshot SET capturedAt = ? WHERE id = ?", (iso_str, snapshot_id))
        fixed += 1
    except sqlite3.IntegrityError:
        skipped += 1

conn.commit()
conn.close()
print(f"Fixed {fixed}, skipped {skipped}")
