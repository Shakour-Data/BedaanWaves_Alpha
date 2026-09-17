import json, sqlite3, os

# Get top 500 tickers from DB
conn = sqlite3.connect('C:/Users/Administrator/Documents/BedaanWaves_Alpha/prisma/db/custom.db')
cursor = conn.cursor()
cursor.execute('SELECT ticker, name, sector, industry, marketCap, isEtf FROM symbol ORDER BY marketCap DESC LIMIT 500')
rows = cursor.fetchall()
conn.close()

# Load OHLCV data
market = 'C:/Users/Administrator/Documents/BedaanWaves_Alpha/src/lib/scoring/seed/real-market-data.json'
with open(market) as f:
    data = json.load(f)

# Generate universe.ts with 500 symbols
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

with open('C:/Users/Administrator/Documents/BedaanWaves_Alpha/src/lib/scoring/seed/universe_score500.ts', 'w') as f:
    f.write('\n'.join(lines))

print(f'Generated universe_score500.ts with {len(rows)} symbols, {len(tickers_with_data)} with OHLCV')
