// BedaanWaves — NASDAQ universe seed (real tickers + metadata).
// ~150 of the most-traded NASDAQ symbols across sectors.

export interface SeedTicker {
  ticker: string;
  name: string;
  sector: string;
  industry: string;
  marketCap: number; // USD billions
  isEtf: boolean;
  basePrice: number; // recent price anchor for synthetic generation
  beta: number; // vs NASDAQ
}

export const SEED_TICKERS: SeedTicker[] = [
  // ── Mega-cap Tech ──
  { ticker: "AAPL", name: "Apple Inc.", sector: "Technology", industry: "Consumer Electronics", marketCap: 3400, isEtf: false, basePrice: 228, beta: 1.18 },
  { ticker: "MSFT", name: "Microsoft Corporation", sector: "Technology", industry: "Software—Infrastructure", marketCap: 3100, isEtf: false, basePrice: 418, beta: 0.92 },
  { ticker: "NVDA", name: "NVIDIA Corporation", sector: "Technology", industry: "Semiconductors", marketCap: 2900, isEtf: false, basePrice: 118, beta: 1.75 },
  { ticker: "GOOGL", name: "Alphabet Inc. Class A", sector: "Communication Services", industry: "Internet Content & Information", marketCap: 2100, isEtf: false, basePrice: 168, beta: 1.04 },
  { ticker: "GOOG", name: "Alphabet Inc. Class C", sector: "Communication Services", industry: "Internet Content & Information", marketCap: 2100, isEtf: false, basePrice: 170, beta: 1.04 },
  { ticker: "AMZN", name: "Amazon.com, Inc.", sector: "Consumer Cyclical", industry: "Internet Retail", marketCap: 2050, isEtf: false, basePrice: 195, beta: 1.15 },
  { ticker: "META", name: "Meta Platforms, Inc.", sector: "Communication Services", industry: "Internet Content & Information", marketCap: 1450, isEtf: false, basePrice: 575, beta: 1.21 },
  { ticker: "TSLA", name: "Tesla, Inc.", sector: "Consumer Cyclical", industry: "Auto Manufacturers", marketCap: 850, isEtf: false, basePrice: 250, beta: 2.04 },
  { ticker: "AVGO", name: "Broadcom Inc.", sector: "Technology", industry: "Semiconductors", marketCap: 820, isEtf: false, basePrice: 175, beta: 1.28 },
  { ticker: "COST", name: "Costco Wholesale Corporation", sector: "Consumer Defensive", industry: "Discount Stores", marketCap: 410, isEtf: false, basePrice: 920, beta: 0.78 },
  { ticker: "NFLX", name: "Netflix, Inc.", sector: "Communication Services", industry: "Entertainment", marketCap: 320, isEtf: false, basePrice: 720, beta: 1.27 },
  { ticker: "TMUS", name: "T-Mobile US, Inc.", sector: "Communication Services", industry: "Telecom Services", marketCap: 270, isEtf: false, basePrice: 220, beta: 0.62 },
  { ticker: "ASML", name: "ASML Holding N.V.", sector: "Technology", industry: "Semiconductors", marketCap: 280, isEtf: false, basePrice: 715, beta: 1.45 },
  { ticker: "AMD", name: "Advanced Micro Devices, Inc.", sector: "Technology", industry: "Semiconductors", marketCap: 260, isEtf: false, basePrice: 158, beta: 1.70 },
  { ticker: "ADBE", name: "Adobe Inc.", sector: "Technology", industry: "Software—Application", marketCap: 230, isEtf: false, basePrice: 510, beta: 1.32 },
  { ticker: "PEP", name: "PepsiCo, Inc.", sector: "Consumer Defensive", industry: "Beverages—Non-Alcoholic", marketCap: 230, isEtf: false, basePrice: 168, beta: 0.55 },
  { ticker: "CSCO", name: "Cisco Systems, Inc.", sector: "Technology", industry: "Communication Equipment", marketCap: 225, isEtf: false, basePrice: 56, beta: 0.88 },
  { ticker: "LIN", name: "Linde plc", sector: "Basic Materials", industry: "Specialty Chemicals", marketCap: 220, isEtf: false, basePrice: 460, beta: 0.91 },
  { ticker: "QCOM", name: "QUALCOMM Incorporated", sector: "Technology", industry: "Semiconductors", marketCap: 180, isEtf: false, basePrice: 165, beta: 1.42 },
  { ticker: "INTU", name: "Intuit Inc.", sector: "Technology", industry: "Software—Application", marketCap: 175, isEtf: false, basePrice: 630, beta: 1.18 },
  { ticker: "AMGN", name: "Amgen Inc.", sector: "Healthcare", industry: "Biotechnology", marketCap: 165, isEtf: false, basePrice: 305, beta: 0.66 },
  { ticker: "BKNG", name: "Booking Holdings Inc.", sector: "Consumer Cyclical", industry: "Travel Services", marketCap: 165, isEtf: false, basePrice: 4700, beta: 1.31 },
  { ticker: "HON", name: "Honeywell International Inc.", sector: "Industrials", industry: "Conglomerates", marketCap: 145, isEtf: false, basePrice: 225, beta: 1.02 },
  { ticker: "ISRG", name: "Intuitive Surgical, Inc.", sector: "Healthcare", industry: "Medical Devices", marketCap: 160, isEtf: false, basePrice: 430, beta: 1.08 },
  { ticker: "VRTX", name: "Vertex Pharmaceuticals Incorporated", sector: "Healthcare", industry: "Biotechnology", marketCap: 115, isEtf: false, basePrice: 445, beta: 0.74 },
  // ── Large Tech / Software ──
  { ticker: "AMAT", name: "Applied Materials, Inc.", sector: "Technology", industry: "Semiconductors", marketCap: 155, isEtf: false, basePrice: 195, beta: 1.51 },
  { ticker: "ADI", name: "Analog Devices, Inc.", sector: "Technology", industry: "Semiconductors", marketCap: 115, isEtf: false, basePrice: 230, beta: 1.12 },
  { ticker: "PANW", name: "Palo Alto Networks, Inc.", sector: "Technology", industry: "Software—Infrastructure", marketCap: 130, isEtf: false, basePrice: 365, beta: 1.28 },
  { ticker: "MU", name: "Micron Technology, Inc.", sector: "Technology", industry: "Semiconductors", marketCap: 110, isEtf: false, basePrice: 100, beta: 1.65 },
  { ticker: "GILD", name: "Gilead Sciences, Inc.", sector: "Healthcare", industry: "Biotechnology", marketCap: 95, isEtf: false, basePrice: 76, beta: 0.58 },
  { ticker: "MDLZ", name: "Mondelez International, Inc.", sector: "Consumer Defensive", industry: "Confectioners", marketCap: 90, isEtf: false, basePrice: 66, beta: 0.60 },
  { ticker: "REGN", name: "Regeneron Pharmaceuticals, Inc.", sector: "Healthcare", industry: "Biotechnology", marketCap: 100, isEtf: false, basePrice: 925, beta: 0.74 },
  { ticker: "MRVL", name: "Marvell Technology, Inc.", sector: "Technology", industry: "Semiconductors", marketCap: 65, isEtf: false, basePrice: 75, beta: 1.62 },
  { ticker: "LRCX", name: "Lam Research Corporation", sector: "Technology", industry: "Semiconductors", marketCap: 95, isEtf: false, basePrice: 75, beta: 1.58 },
  { ticker: "KLAC", name: "KLA Corporation", sector: "Technology", industry: "Semiconductors", marketCap: 90, isEtf: false, basePrice: 745, beta: 1.43 },
  { ticker: "SNPS", name: "Synopsys, Inc.", sector: "Technology", industry: "Software—Application", marketCap: 85, isEtf: false, basePrice: 555, beta: 1.25 },
  { ticker: "CDNS", name: "Cadence Design Systems, Inc.", sector: "Technology", industry: "Software—Application", marketCap: 80, isEtf: false, basePrice: 285, beta: 1.18 },
  { ticker: "CRWD", name: "CrowdStrike Holdings, Inc.", sector: "Technology", industry: "Software—Infrastructure", marketCap: 80, isEtf: false, basePrice: 335, beta: 1.78 },
  { ticker: "ADP", name: "Automatic Data Processing, Inc.", sector: "Industrials", industry: "Staffing & Employment Services", marketCap: 120, isEtf: false, basePrice: 285, beta: 0.87 },
  { ticker: "CME", name: "CME Group Inc.", sector: "Financials", industry: "Capital Markets", marketCap: 85, isEtf: false, basePrice: 235, beta: 0.78 },
  { ticker: "TXN", name: "Texas Instruments Incorporated", sector: "Technology", industry: "Semiconductors", marketCap: 195, isEtf: false, basePrice: 210, beta: 1.04 },
  { ticker: "CMCSA", name: "Comcast Corporation", sector: "Communication Services", industry: "Telecom Services", marketCap: 165, isEtf: false, basePrice: 42, beta: 0.85 },
  { ticker: "INTC", name: "Intel Corporation", sector: "Technology", industry: "Semiconductors", marketCap: 95, isEtf: false, basePrice: 22, beta: 1.05 },
  { ticker: "PYPL", name: "PayPal Holdings, Inc.", sector: "Financials", industry: "Credit Services", marketCap: 70, isEtf: false, basePrice: 70, beta: 1.45 },
  { ticker: "SBUX", name: "Starbucks Corporation", sector: "Consumer Cyclical", industry: "Restaurants", marketCap: 110, isEtf: false, basePrice: 97, beta: 1.10 },
  { ticker: "CHTR", name: "Charter Communications, Inc.", sector: "Communication Services", industry: "Telecom Services", marketCap: 50, isEtf: false, basePrice: 355, beta: 1.06 },
  { ticker: "MAR", name: "Marriott International, Inc.", sector: "Consumer Cyclical", industry: "Lodging", marketCap: 75, isEtf: false, basePrice: 260, beta: 1.30 },
  { ticker: "ORLY", name: "O'Reilly Automotive, Inc.", sector: "Consumer Cyclical", industry: "Auto Parts", marketCap: 65, isEtf: false, basePrice: 1150, beta: 0.75 },
  { ticker: "MELI", name: "MercadoLibre, Inc.", sector: "Consumer Cyclical", industry: "Internet Retail", marketCap: 105, isEtf: false, basePrice: 2080, beta: 1.55 },
  { ticker: "FTNT", name: "Fortinet, Inc.", sector: "Technology", industry: "Software—Infrastructure", marketCap: 75, isEtf: false, basePrice: 88, beta: 1.22 },
  { ticker: "PCGR", name: "Pacific Biosciences of California, Inc.", sector: "Healthcare", industry: "Medical Devices", marketCap: 6, isEtf: false, basePrice: 9, beta: 1.80 },
  { ticker: "ABNB", name: "Airbnb, Inc.", sector: "Consumer Cyclical", industry: "Travel Services", marketCap: 85, isEtf: false, basePrice: 130, beta: 1.42 },
  { ticker: "ODFL", name: "Old Dominion Freight Line, Inc.", sector: "Industrials", industry: "Trucking", marketCap: 45, isEtf: false, basePrice: 205, beta: 1.10 },
  { ticker: "CPRT", name: "Copart, Inc.", sector: "Industrials", industry: "Specialty Business Services", marketCap: 50, isEtf: false, basePrice: 54, beta: 1.02 },
  { ticker: "WBD", name: "Warner Bros. Discovery, Inc.", sector: "Communication Services", industry: "Entertainment", marketCap: 30, isEtf: false, basePrice: 12, beta: 1.45 },
  { ticker: "KDP", name: "Keurig Dr Pepper Inc.", sector: "Consumer Defensive", industry: "Beverages—Non-Alcoholic", marketCap: 40, isEtf: false, basePrice: 28, beta: 0.55 },
  { ticker: "AEP", name: "American Electric Power Company, Inc.", sector: "Utilities", industry: "Utilities—Regulated Electric", marketCap: 105, isEtf: false, basePrice: 200, beta: 0.55 },
  { ticker: "LULU", name: "Lululemon Athletica Inc.", sector: "Consumer Cyclical", industry: "Apparel Retail", marketCap: 35, isEtf: false, basePrice: 295, beta: 1.45 },
  { ticker: "MNST", name: "Monster Beverage Corporation", sector: "Consumer Defensive", industry: "Beverages—Non-Alcoholic", marketCap: 55, isEtf: false, basePrice: 53, beta: 0.95 },
  { ticker: "CCEP", name: "Coca-Cola Europacific Partners PLC", sector: "Consumer Defensive", industry: "Beverages—Non-Alcoholic", marketCap: 45, isEtf: false, basePrice: 80, beta: 0.72 },
  { ticker: "FAST", name: "Fastenal Company", sector: "Industrials", industry: "Industrial Distribution", marketCap: 55, isEtf: false, basePrice: 70, beta: 1.05 },
  { ticker: "KDP", name: "Keurig Dr Pepper Inc.", sector: "Consumer Defensive", industry: "Beverages—Non-Alcoholic", marketCap: 40, isEtf: false, basePrice: 28, beta: 0.55 },
  { ticker: "GEHC", name: "GE HealthCare Technologies Inc.", sector: "Healthcare", industry: "Medical Devices", marketCap: 45, isEtf: false, basePrice: 80, beta: 1.02 },
  { ticker: "FANG", name: "Diamondback Energy, Inc.", sector: "Energy", industry: "Oil & Gas E&P", marketCap: 35, isEtf: false, basePrice: 185, beta: 1.45 },
  { ticker: "CTAS", name: "Cintas Corporation", sector: "Industrials", industry: "Specialty Business Services", marketCap: 75, isEtf: false, basePrice: 720, beta: 0.92 },
  { ticker: "EA", name: "Electronic Arts Inc.", sector: "Communication Services", industry: "Electronic Gaming & Multimedia", marketCap: 35, isEtf: false, basePrice: 140, beta: 0.85 },
  { ticker: "MRNA", name: "Moderna, Inc.", sector: "Healthcare", industry: "Biotechnology", marketCap: 20, isEtf: false, basePrice: 75, beta: 1.55 },
  { ticker: "DLTR", name: "Dollar Tree, Inc.", sector: "Consumer Defensive", industry: "Discount Stores", marketCap: 20, isEtf: false, basePrice: 95, beta: 0.95 },
  { ticker: "CSX", name: "CSX Corporation", sector: "Industrials", industry: "Railroads", marketCap: 65, isEtf: false, basePrice: 35, beta: 1.10 },
  { ticker: "MCHP", name: "Microchip Technology Incorporated", sector: "Technology", industry: "Semiconductors", marketCap: 40, isEtf: false, basePrice: 75, beta: 1.40 },
  { ticker: "ZS", name: "Zscaler, Inc.", sector: "Technology", industry: "Software—Infrastructure", marketCap: 30, isEtf: false, basePrice: 200, beta: 1.35 },
  { ticker: "BKR", name: "Baker Hughes Company", sector: "Energy", industry: "Oil & Gas Equipment & Services", marketCap: 35, isEtf: false, basePrice: 35, beta: 1.20 },
  { ticker: "TTWO", name: "Take-Two Interactive Software, Inc.", sector: "Communication Services", industry: "Electronic Gaming & Multimedia", marketCap: 25, isEtf: false, basePrice: 155, beta: 1.25 },
  { ticker: "ANET", name: "Arista Networks, Inc.", sector: "Technology", industry: "Communication Equipment", marketCap: 40, isEtf: false, basePrice: 350, beta: 1.35 },
  { ticker: "VRSK", name: "Verisk Analytics, Inc.", sector: "Industrials", industry: "Specialty Business Services", marketCap: 35, isEtf: false, basePrice: 230, beta: 0.78 },
  { ticker: "BIIB", name: "Biogen Inc.", sector: "Healthcare", industry: "Biotechnology", marketCap: 25, isEtf: false, basePrice: 175, beta: 0.75 },
  { ticker: "GD", name: "General Dynamics Corporation", sector: "Industrials", industry: "Aerospace & Defense", marketCap: 90, isEtf: false, basePrice: 330, beta: 0.72 },
  { ticker: "ADSK", name: "Autodesk, Inc.", sector: "Technology", industry: "Software—Application", marketCap: 55, isEtf: false, basePrice: 245, beta: 1.30 },
  { ticker: "NXPI", name: "NXP Semiconductors N.V.", sector: "Technology", industry: "Semiconductors", marketCap: 55, isEtf: false, basePrice: 220, beta: 1.40 },
  { ticker: "LRCX", name: "Lam Research Corporation", sector: "Technology", industry: "Semiconductors", marketCap: 95, isEtf: false, basePrice: 75, beta: 1.58 },
  { ticker: "SIRI", name: "Sirius XM Holdings Inc.", sector: "Communication Services", industry: "Broadcasting", marketCap: 15, isEtf: false, basePrice: 4, beta: 1.10 },
  { ticker: "TEAM", name: "Atlassian Corporation", sector: "Technology", industry: "Software—Application", marketCap: 12, isEtf: false, basePrice: 210, beta: 1.55 },
  { ticker: "PCAR", name: "PACCAR Inc", sector: "Industrials", industry: "Trucks", marketCap: 55, isEtf: false, basePrice: 110, beta: 1.15 },
  { ticker: "ROST", name: "Ross Stores, Inc.", sector: "Consumer Defensive", industry: "Apparel Retail", marketCap: 50, isEtf: false, basePrice: 150, beta: 1.00 },
  { ticker: "GFS", name: "GLOBALFOUNDRIES Inc.", sector: "Technology", industry: "Semiconductors", marketCap: 30, isEtf: false, basePrice: 45, beta: 1.35 },
  { ticker: "ARM", name: "Arm Holdings plc", sector: "Technology", industry: "Semiconductors", marketCap: 145, isEtf: false, basePrice: 140, beta: 1.85 },
  { ticker: "DASH", name: "DoorDash, Inc.", sector: "Consumer Cyclical", industry: "Internet Retail", marketCap: 60, isEtf: false, basePrice: 140, beta: 1.60 },
  { ticker: "DDOG", name: "Datadog, Inc.", sector: "Technology", industry: "Software—Application", marketCap: 40, isEtf: false, basePrice: 130, beta: 1.50 },
  { ticker: "SNOW", name: "Snowflake Inc.", sector: "Technology", industry: "Software—Application", marketCap: 45, isEtf: false, basePrice: 165, beta: 1.65 },
  { ticker: "NET", name: "Cloudflare, Inc.", sector: "Technology", industry: "Software—Infrastructure", marketCap: 25, isEtf: false, basePrice: 75, beta: 1.70 },
  { ticker: "MDB", name: "MongoDB, Inc.", sector: "Technology", industry: "Software—Application", marketCap: 20, isEtf: false, basePrice: 280, beta: 1.55 },
  { ticker: "OKTA", name: "Okta, Inc.", sector: "Technology", industry: "Software—Infrastructure", marketCap: 20, isEtf: false, basePrice: 95, beta: 1.60 },
  { ticker: "PINS", name: "Pinterest, Inc.", sector: "Communication Services", industry: "Internet Content & Information", marketCap: 25, isEtf: false, basePrice: 30, beta: 1.40 },
  { ticker: "RIVN", name: "Rivian Automotive, Inc.", sector: "Consumer Cyclical", industry: "Auto Manufacturers", marketCap: 13, isEtf: false, basePrice: 13, beta: 2.20 },
  { ticker: "COIN", name: "Coinbase Global, Inc.", sector: "Financials", industry: "Capital Markets", marketCap: 60, isEtf: false, basePrice: 245, beta: 2.40 },
  { ticker: "PLTR", name: "Palantir Technologies Inc.", sector: "Technology", industry: "Software—Infrastructure", marketCap: 95, isEtf: false, basePrice: 42, beta: 2.10 },
  { ticker: "SHOP", name: "Shopify Inc.", sector: "Technology", industry: "Software—Application", marketCap: 110, isEtf: false, basePrice: 85, beta: 1.75 },
  { ticker: "ZM", name: "Zoom Communications, Inc.", sector: "Technology", industry: "Software—Application", marketCap: 23, isEtf: false, basePrice: 80, beta: 1.30 },
  { ticker: "DOCU", name: "DocuSign, Inc.", sector: "Technology", industry: "Software—Application", marketCap: 18, isEtf: false, basePrice: 55, beta: 1.20 },
  { ticker: "ROST", name: "Ross Stores, Inc.", sector: "Consumer Defensive", industry: "Apparel Retail", marketCap: 50, isEtf: false, basePrice: 150, beta: 1.00 },
  { ticker: "EXC", name: "Exelon Corporation", sector: "Utilities", industry: "Utilities—Regulated Electric", marketCap: 40, isEtf: false, basePrice: 40, beta: 0.55 },
  { ticker: "XEL", name: "Xcel Energy Inc.", sector: "Utilities", industry: "Utilities—Regulated Electric", marketCap: 40, isEtf: false, basePrice: 70, beta: 0.50 },
  // ── ETFs (for market context display) ──
  { ticker: "QQQ", name: "Invesco QQQ Trust (NASDAQ-100 ETF)", sector: "ETF", industry: "Index ETF", marketCap: 300, isEtf: true, basePrice: 485, beta: 1.00 },
  { ticker: "QQQM", name: "Invesco NASDAQ 100 Mesa ETF", sector: "ETF", industry: "Index ETF", marketCap: 30, isEtf: true, basePrice: 215, beta: 1.00 },
  { ticker: "SPY", name: "SPDR S&P 500 ETF", sector: "ETF", industry: "Index ETF", marketCap: 500, isEtf: true, basePrice: 565, beta: 0.95 },
  { ticker: "SMH", name: "VanEck Semiconductor ETF", sector: "ETF", industry: "Sector ETF", marketCap: 25, isEtf: true, basePrice: 250, beta: 1.45 },
  { ticker: "XLK", name: "Technology Select Sector SPDR", sector: "ETF", industry: "Sector ETF", marketCap: 45, isEtf: true, basePrice: 235, beta: 1.05 },
  { ticker: "IBB", name: "iShares Biotechnology ETF", sector: "ETF", industry: "Sector ETF", marketCap: 8, isEtf: true, basePrice: 145, beta: 1.05 },
  { ticker: "TLT", name: "iShares 20+ Year Treasury Bond ETF", sector: "ETF", industry: "Bond ETF", marketCap: 50, isEtf: true, basePrice: 95, beta: -0.10 },
  { ticker: "GLD", name: "SPDR Gold Shares", sector: "ETF", industry: "Commodity ETF", marketCap: 75, isEtf: true, basePrice: 245, beta: 0.05 },
  { ticker: "USO", name: "United States Oil Fund, LP", sector: "ETF", industry: "Commodity ETF", marketCap: 2, isEtf: true, basePrice: 78, beta: 0.85 },
  { ticker: "UNG", name: "United States Natural Gas Fund, LP", sector: "ETF", industry: "Commodity ETF", marketCap: 1, isEtf: true, basePrice: 14, beta: 0.40 },
];

// Dedupe by ticker (a few may have been repeated above).
export const SEED_TICKERS_DEDUP: SeedTicker[] = (() => {
  const seen = new Set<string>();
  const out: SeedTicker[] = [];
  for (const t of SEED_TICKERS) {
    if (seen.has(t.ticker)) continue;
    seen.add(t.ticker);
    out.push(t);
  }
  return out;
})();
