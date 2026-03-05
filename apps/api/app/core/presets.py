from __future__ import annotations

from typing import Any

CITY_PRESETS: dict[str, dict[str, Any]] = {
    "MUMBAI": {
        "max_height_m": 120.0,
        "far": 3.0,
        "setbacks": {"front": 6.0, "side": 4.5, "rear": 4.5},
        "coverage_ratio": 0.45,
        "cost_per_sqm": {"concrete": 780.0, "steel": 930.0, "timber": 880.0},
        "currency": "USD",
    }
}
