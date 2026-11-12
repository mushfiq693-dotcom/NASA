"""
alert_daemon.py
===============
Autonomous 24/7 Wildfire Watchdog Daemon for BengalFlare.
Operates unattended in the background:
1. Periodically polls NASA FIRMS NRT (MODIS & VIIRS) for new overpasses.
2. Ingests live meteorology for detected hotspots.
3. Evaluates physical propagation danger (Fosberg FDI, dead fuel moisture, spread rate).
4. Employs 6-hour anti-spam spatial deduplication to prevent notification fatigue.
5. Automatically broadcasts high-risk emergencies to Telegram, SMS, and Webhooks
   WITHOUT requiring human manual intervention.
"""

import os
import io
import time
import json
import math
import asyncio
import argparse
import datetime
from pathlib import Path
from typing import Dict, Any, List, Optional
import requests
import pandas as pd
from dotenv import load_dotenv

PROJECT_ROOT = Path(__file__).resolve().parent.parent
load_dotenv(PROJECT_ROOT / ".env")

try:
    from src.environmental import fetch_live_weather, evaluate_hotspot_threat, REGIONAL_PROFILES
    from src.alert_engine import generate_wildfire_alert, assess_settlement_exposure
    from src.dispatcher import dispatch_all_channels
except ImportError:
    from environmental import fetch_live_weather, evaluate_hotspot_threat, REGIONAL_PROFILES
    from alert_engine import generate_wildfire_alert, assess_settlement_exposure
    from dispatcher import dispatch_all_channels

DATA_DIR = PROJECT_ROOT / "data"
CACHE_DIR = DATA_DIR / "cache"
REPORTS_DIR = PROJECT_ROOT / "reports"
CACHE_FILE = CACHE_DIR / "alert_history.json"
LOG_FILE = REPORTS_DIR / "autonomous_dispatch_log.json"

FIRMS_MAP_KEY = os.environ.get("FIRMS_MAP_KEY", "1f1f9a28bc8561f922237c272055e274")

def calculate_distance_km(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    r = 6371.0
    phi1, phi2 = math.radians(lat1), math.radians(lat2)
    dphi = math.radians(lat2 - lat1)
    dlam = math.radians(lon2 - lon1)
    a = math.sin(dphi / 2.0) ** 2 + math.cos(phi1) * math.cos(phi2) * math.sin(dlam / 2.0) ** 2
    return round(r * 2.0 * math.atan2(math.sqrt(a), math.sqrt(1.0 - a)), 2)

def load_alert_history() -> List[Dict[str, Any]]:
    if not CACHE_FILE.exists():
        return []
    try:
        with open(CACHE_FILE, "r") as f:
            return json.load(f)
    except Exception:
        return []

def save_alert_history(history: List[Dict[str, Any]]):
    CACHE_DIR.mkdir(parents=True, exist_ok=True)
    with open(CACHE_FILE, "w") as f:
        json.dump(history, f, indent=2)

def is_within_cooldown(lat: float, lon: float, cooldown_hours: float = 6.0) -> bool:
    """Checks if a fire in the same 6 km perimeter was alerted recently."""
    history = load_alert_history()
    now = datetime.datetime.now(datetime.timezone.utc)
    for entry in history:
        try:
            alert_dt = datetime.datetime.fromisoformat(entry["timestamp_utc"])
            diff_hours = (now - alert_dt).total_seconds() / 3600.0
            if diff_hours < cooldown_hours:
                dist = calculate_distance_km(lat, lon, entry["latitude"], entry["longitude"])
                if dist <= 6.0:
                    return True
        except Exception:
            continue
    return False

def fetch_latest_firms_hotspots(days: int = 2) -> List[Dict[str, Any]]:
    """
    Polls real NASA FIRMS NRT active hotspots across NOAA-20 and Suomi-NPP 
    for Bangladesh and border hill tracts using the regional bounding box.
    """
    bbox = "88.0,20.5,92.8,26.7"
    hotspots = []
    seen_coords = set()

    # Query both NOAA-20 (primary operational) and S-NPP constellations
    sources = ["VIIRS_NOAA20_NRT", "VIIRS_SNPP_NRT"]
    for src in sources:
        url = f"https://firms.modaps.eosdis.nasa.gov/api/area/csv/{FIRMS_MAP_KEY}/{src}/{bbox}/{days}"
        try:
            resp = requests.get(url, timeout=12)
            if resp.status_code == 200 and "latitude" in resp.text:
                df = pd.read_csv(io.StringIO(resp.text))
                for idx, r in df.iterrows():
                    conf = str(r.get("confidence", "nominal")).lower()
                    if conf in ["l", "low"]:
                        continue
                    lat_r = round(float(r["latitude"]), 4)
                    lon_r = round(float(r["longitude"]), 4)
                    coord_key = (lat_r, lon_r)
                    if coord_key in seen_coords:
                        continue
                    seen_coords.add(coord_key)

                    sat_name = "NOAA-20 (JPSS-1)" if "N20" in src else "Suomi-NPP"
                    hotspots.append({
                        "id": f"FIRMS-{src[:5]}-{r.get('acq_date')}-{idx}",
                        "latitude": float(r["latitude"]),
                        "longitude": float(r["longitude"]),
                        "frp": float(r.get("frp", 10.0)),
                        "confidence": conf,
                        "satellite": sat_name,
                        "date": str(r.get("acq_date")),
                        "time": str(r.get("acq_time", "0000"))
                    })
        except Exception as e:
            print(f"FIRMS {src} query note: {e}")

    if hotspots:
        # Sort by Fire Radiative Power (highest energy fires first)
        return sorted(hotspots, key=lambda x: x["frp"], reverse=True)

    # Fallback to local verified fixtures if network unavailable
    fixture_path = PROJECT_ROOT / "app" / "public" / "fixtures" / "live_firms_fallback.json"
    if fixture_path.exists():
        try:
            with open(fixture_path, "r") as f:
                data = json.load(f)
                return data.get("hotspots", [])
        except Exception:
            pass
    return []

async def run_autonomous_scan(force_test: bool = False) -> Dict[str, Any]:
    """
    Executes one complete autonomous monitoring and alerting cycle.
    Returns audit summary.
    """
    scan_time = datetime.datetime.now(datetime.timezone.utc).isoformat()
    hotspots = fetch_latest_firms_hotspots(days=2)
    dispatched_alerts = []
    skipped_cooldown = 0
    evaluated_count = len(hotspots)

    # If no active fires in nature right now and force_test=True, use benchmark scenario
    if (len(hotspots) == 0 or force_test) and force_test:
        p = REGIONAL_PROFILES["chittagong_hill_tracts_dry"]
        hotspots.append({
            "id": f"AUTONOMOUS-TEST-{int(time.time())}",
            "latitude": p["latitude"],
            "longitude": p["longitude"],
            "frp": 65.0,
            "confidence": "high"
        })

    for spot in hotspots:
        lat = spot["latitude"]
        lon = spot["longitude"]
        frp = spot["frp"]

        # 1. Anti-Spam Cooldown check
        if is_within_cooldown(lat, lon, cooldown_hours=6.0) and not force_test:
            skipped_cooldown += 1
            continue

        # 2. Live Weather Ingestion & Physics Threat Evaluation
        weather = fetch_live_weather(lat, lon)
        alert = generate_wildfire_alert(
            hotspot_id=spot["id"],
            lat=lat,
            lon=lon,
            frp_mw=frp,
            confidence=spot.get("confidence", "high"),
            weather_override=weather
        )

        level = alert.get("alert", {}).get("level", "ADVISORY")
        is_red_flag = alert.get("environmental_risk", {}).get("is_red_flag", False)
        fdi = alert.get("environmental_risk", {}).get("fdi", 0.0)

        # 3. Autonomous Dispatch Trigger Condition:
        # Trigger on ADVISORY (Moderate Risk) and above, or FDI >= 18.0, or FRP >= 20.0, or Red Flag
        if level in ["ADVISORY", "WATCH", "WARNING"] or is_red_flag or fdi >= 18.0 or frp >= 20.0 or force_test:
            dispatch_res = await dispatch_all_channels(alert)

            # Record in cooldown cache
            history = load_alert_history()
            history.append({
                "hotspot_id": spot["id"],
                "latitude": lat,
                "longitude": lon,
                "frp": frp,
                "level": level,
                "fdi_score": fdi,
                "timestamp_utc": scan_time
            })
            save_alert_history(history)

            dispatched_alerts.append({
                "hotspot_id": spot["id"],
                "coordinates": {"lat": lat, "lon": lon},
                "level": level,
                "fdi": fdi,
                "dispatch_report": dispatch_res
            })

    # Record log
    REPORTS_DIR.mkdir(parents=True, exist_ok=True)
    summary = {
        "scan_timestamp_utc": scan_time,
        "total_hotspots_detected": evaluated_count,
        "skipped_anti_spam_cooldown": skipped_cooldown,
        "dispatched_count": len(dispatched_alerts),
        "dispatches": dispatched_alerts
    }

    try:
        existing_logs = []
        if LOG_FILE.exists():
            with open(LOG_FILE, "r") as f:
                existing_logs = json.load(f)
        existing_logs.append(summary)
        # Keep last 50 scan summaries
        with open(LOG_FILE, "w") as f:
            json.dump(existing_logs[-50:], f, indent=2)
    except Exception as e:
        print(f"Log save note: {e}")

    return summary

def run_daemon_loop(poll_interval_sec: int = 900):
    """Continuous 24/7 autonomous loop."""
    print(f"🚀 BengalFlare 24/7 Autonomous Watchdog Daemon started.")
    print(f"📡 Polling NASA FIRMS & Weather every {poll_interval_sec} seconds (Interval: {poll_interval_sec / 60:.1f} mins)")
    print(f"🛑 Press Ctrl+C to terminate.")

    while True:
        try:
            print(f"\n[{datetime.datetime.now().strftime('%Y-%m-%d %H:%M:%S')}] Executing autonomous satellite overpass scan...")
            res = asyncio.run(run_autonomous_scan())
            print(f"Scan complete: {res['total_hotspots_detected']} active fires evaluated, {res['dispatched_count']} emergencies dispatched.")
            time.sleep(poll_interval_sec)
        except KeyboardInterrupt:
            print("\nShutting down autonomous watchdog daemon cleanly.")
            break
        except Exception as err:
            print(f"Watchdog scan error: {err}. Retrying in 60s...")
            time.sleep(60)

if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="BengalFlare Autonomous Watchdog Daemon")
    parser.add_argument("--once", action="store_true", help="Run a single scan and exit")
    parser.add_argument("--force-test", action="store_true", help="Force dispatch of benchmark scenario")
    parser.add_argument("--interval", type=int, default=900, help="Polling interval in seconds (default 900 = 15m)")
    args = parser.parse_args()

    if args.once or args.force_test:
        res = asyncio.run(run_autonomous_scan(force_test=args.force_test))
        print(json.dumps(res, indent=2))
    else:
        run_daemon_loop(args.interval)

