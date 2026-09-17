#!/bin/bash
# Fetch real macro indicators from FRED (via curl).
# Saves each series as a CSV in /tmp/fred/

mkdir -p /tmp/fred

# Format: fred_id:db_field
SERIES="
GDP:real_gdp
INDPRO:industrial_production
HOUST:housing_permits
UMCSENT:consumer_sentiment
CPIAUCSL:cpi_index
CORESTICKM159SFRBATL:core_cpi_index
FEDFUNDS:fed_funds_rate
DGS2:treasury_yield_2y
DGS10:treasury_yield_10y
DGS30:treasury_yield_30y
T10Y2Y:yield_curve_spread
DTWEXBGS:dollar_index
DEXUSEU:usd_eur
DEXUSUK:usd_gbp
DEXJPUS:usd_jpy_inverse
DCOILBRENTEU:oil_price
GOLDPMGBD228NLBM:gold_price
PAYEMS:nonfarm_payrolls
UNRATE:unemployment_rate
TCTLFG:capacity_utilization
"

echo "$SERIES" | grep -v '^$' | while IFS=: read -r fred_id db_field; do
  out="/tmp/fred/${fred_id}.csv"
  printf "  [FRED] %-25s -> %-25s: " "$fred_id" "$db_field"
  http=$(curl -s --max-time 20 -o "$out" -w "%{http_code}" \
    -H "User-Agent: Mozilla/5.0 BedaanWaves/1.0" \
    "https://fred.stlouisfed.org/graph/fredgraph.csv?id=${fred_id}&cosd=2023-01-01")
  if [ "$http" = "200" ] && [ -s "$out" ]; then
    rows=$(wc -l < "$out")
    last=$(tail -1 "$out" | cut -c1-50)
    echo "OK (${rows} rows, last=${last})"
  else
    echo "FAIL (HTTP $http)"
    rm -f "$out"
  fi
  sleep 0.4
done

echo ""
echo "=== FRED fetch complete ==="
ls /tmp/fred/ | wc -l
echo "files saved"