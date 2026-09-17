import sqlite3
conn = sqlite3.connect('C:/Users/Administrator/Documents/BedaanWaves_Alpha/prisma/db/custom.db')
cursor = conn.cursor()
# Check all dates with snapshots
cursor.execute("SELECT DISTINCT capturedAt, COUNT(*) FROM ScoreSnapshot GROUP BY capturedAt ORDER BY capturedAt DESC LIMIT 10")
for row in cursor.fetchall():
    print(row)
# Check if 2026-09-16 exists
cursor.execute("SELECT COUNT(*) FROM ScoreSnapshot WHERE capturedAt = '2026-09-16T22:00:00.000Z'")
print('Sept 16 count:', cursor.fetchone()[0])
# Check latest date via API ordering
cursor.execute("SELECT capturedAt FROM ScoreSnapshot ORDER BY capturedAt DESC LIMIT 1")
print('Latest by DB:', cursor.fetchone())
conn.close()
