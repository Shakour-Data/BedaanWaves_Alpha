#!/usr/bin/env python3
"""
BedaanWaves — Add real economic releases to macro data.

DEPRECATED: This script is now a no-op. The unified fetch_real_macro.py script
fetches ALL real macro data in one pass:
  - Market-based indicators (daily, 2y): yfinance
  - Annual economic releases: World Bank API (10+ real data points with variance)
  - Latest published government statistics: BLS/BEA/Fed/U.Michigan (carried forward)

The old approach of carrying forward a single published value for economic
releases has been replaced by real historical data from the World Bank API
where available, and carried-forward latest published values otherwise.

Run scripts/fetch_real_macro.py instead.
"""
import json
from pathlib import Path

MACRO_FILE = Path("src/lib/scoring/seed/real-macro-data.json")

def main():
    data = json.loads(MACRO_FILE.read_text())
    macro = data["macro"]
    print("=== add_economic_releases.py (deprecated, no-op) ===")
    print(f"Macro indicators already present: {len(macro)}")
    for k, v in sorted(macro.items()):
        n = len(v) if isinstance(v, list) else 0
        unique = len(set(p["value"] for p in v)) if isinstance(v, list) and v else 0
        print(f"  {k:30} {n:5} pts  unique={unique}")
    print("\nThis script is deprecated. All real economic release data is now fetched")
    print("by scripts/fetch_real_macro.py (yfinance 2y + World Bank API + published stats).")

if __name__ == "__main__":
    main()
