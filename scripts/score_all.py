# DEPRECATED - Do not use. This script used an incorrect scoring methodology.
# Use the V2 scoring pipeline (orchestrator.ts / score_all_symbols.ts) instead.
# This script produced scores using a simple 4-factor weighted average (RSI, price change,
# volume, momentum) which does NOT follow the V2 spec §5 hierarchy (L4→L3→L2→L1→overall)
# and used wrong grade bands (STRONG_BULLISH>=75 vs spec §85, BULLISH>=60 vs spec §70, etc.)
# All data from this script should be discarded and replaced with V2 engine output.

import json
import sqlite3
import hashlib
import uuid
from datetime import datetime

print("DEPRECATED: Use V2 scoring pipeline instead. See orchestrator.ts")
