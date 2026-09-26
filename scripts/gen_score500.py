import json, sqlite3, os

db_path = os.environ.get("DATABASE_URL", "").replace("file:", "").replace("custom.db", "custom.db")
if not db_path or "DATABASE_URL" not in os.environ:
    db_path = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "prisma", "db", "custom.db")

conn = sqlite3.connect(db_path)
cursor = conn.cursor()
cursor.execute('SELECT ticker, name, sector, industry, marketCap, isEtf FROM symbol ORDER BY marketCap DESC LIMIT 500')
rows = cursor.fetchall()
conn.close()

market_path = os.environ.get("REAL_MARKET_DATA_PATH", "")
if not market_path:
    market_path = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "src", "lib", "scoring", "seed", "real-market-data.json")

with open(market_path) as f:
    data = json.load(f)

lines = []
lines.append('// BedaanWaves — Top 500 NASDAQ symbols for scoring.')
lines.append('// Auto-generated for V2 scoring engine.')
lines.append('')
lines.append('export interface SeedTicker {')
lines.append('  ticker: string;')
lines.append('  name: string;')
lines.append('  sector: string;')
lines.append('  industry: string;')
lines.append('  marketCap: number;')
lines.append('  isEtf: boolean;')
lines.append('  basePrice: number;')
lines.append('  beta: number;')
lines.append('}')
lines.append('')
lines.append('export const SEED_TICKERS: SeedTicker[] = [')

tickers_with_data = []
for i, (ticker, name, sector, industry, mcap, is_etf) in enumerate(rows):
    sector = sector or 'Technology'
    industry = industry or 'Electronic Equipment'
    mcap = mcap or 1e9
    if ticker in data.get('tickers', []) and len(data.get('per_ticker', {}).get(ticker, {}).get('ohlcv', [])) > 0:
        tickers_with_data.append(ticker)
        td = data['per_ticker'][ticker]
        last_close = td['ohlcv'][-1]['close'] if td.get('ohlcv') else 50.0
        base_price = last_close
    else:
        base_price = 50.0
    comma = "," if i < len(rows) - 1 else ""
    lines.append(f'  {{ ticker: "{ticker}", name: "{name[:200]}", sector: "{sector}", industry: "{industry}", marketCap: {mcap}, isEtf: {str(bool(is_etf)).lower()}, basePrice: {base_price}, beta: 1.0 }}{comma}')

lines.append('];')
lines.append('')
lines.append('export const SEED_TICKERS_DEDUP: SeedTicker[] = SEED_TICKERS;')

output_path = os.environ.get("UNIVERSE_OUTPUT_PATH", "")
if not output_path:
    output_path = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "src", "lib", "scoring", "seed", "universe_score500.ts")

with open(output_path, 'w') as f:
    f.write('\n'.join(lines))

print(f'Generated universe_score500.ts with {len(rows)} symbols, {len(tickers_with_data)} with OHLCV')