"""
alert_engine.py
===============
Wildfire Early Warning & Threat Alerting Engine for BengalFlare.

Orchestrates multi-source risk assessment:
1. Ingests detected active fire hotspots (NRT FIRMS / Parquet anomalies).
2. Computes environmental risk factors (VPD, Fuel Moisture, Fosberg FDI).
3. Projects downwind forward spread rate and elliptical threat cones (Huygens).
4. Evaluates proximity to vulnerable settlements and critical infrastructure.
5. Dispatches 3-Tier Early Warning Alerts with transparent supporting evidence.
"""

import json
import math
import datetime
from pathlib import Path
from typing import Dict, Any, List, Optional
import pandas as pd

try:
    from src.environmental import (
        compute_fire_danger_index,
        predict_fire_spread,
        fetch_live_weather,
        REGIONAL_PROFILES,
        evaluate_hotspot_threat
    )
except ImportError:
    try:
        from firechronicle.src.environmental import (
            compute_fire_danger_index,
            predict_fire_spread,
            fetch_live_weather,
            REGIONAL_PROFILES,
            evaluate_hotspot_threat
        )
    except ImportError:
        from environmental import (
            compute_fire_danger_index,
            predict_fire_spread,
            fetch_live_weather,
            REGIONAL_PROFILES,
            evaluate_hotspot_threat
        )

PROJECT_ROOT = Path(__file__).resolve().parent.parent
PROCESSED_DIR = PROJECT_ROOT / "data" / "processed"
REPORTS_DIR = PROJECT_ROOT / "reports"

# Known vulnerable settlement clusters and protected zones
SETTLEMENT_RECEPTORS = [
    {"name": "Bandarban Town & Hill Communities", "lat": 22.19, "lon": 92.22, "type": "settlement", "population": 45000, "region": "Chittagong Hill Tracts"},
    {"name": "Rangamati Lakeside Settlements", "lat": 22.65, "lon": 92.17, "type": "settlement", "population": 65000, "region": "Chittagong Hill Tracts"},
    {"name": "Khagrachhari Valley Communities", "lat": 23.11, "lon": 91.98, "type": "settlement", "population": 38000, "region": "Chittagong Hill Tracts"},
    {"name": "Sreemangal Tea Estates & Reserve Edge", "lat": 24.30, "lon": 91.73, "type": "plantation_settlement", "population": 28000, "region": "Sylhet Division"},
    {"name": "Mongla / Sundarbans Buffer Zone", "lat": 22.48, "lon": 89.60, "type": "mangrove_fringe", "population": 35000, "region": "Khulna Division"},
    {"name": "Paradise Town Center, CA (Camp Fire Benchmark)", "lat": 39.759, "lon": -121.621, "type": "wildland_urban_interface", "population": 26800, "region": "Butte County, CA"},
    {"name": "Concow Community, CA", "lat": 39.758, "lon": -121.520, "type": "wildland_urban_interface", "population": 710, "region": "Butte County, CA"}
]

def calculate_haversine_km(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    """Computes great-circle distance in km between two lat/lon points."""
    r = 6371.0 # Earth radius in km
    phi1, phi2 = math.radians(lat1), math.radians(lat2)
    dphi = math.radians(lat2 - lat1)
    dlam = math.radians(lon2 - lon1)
    
    a = math.sin(dphi / 2.0) ** 2 + math.cos(phi1) * math.cos(phi2) * math.sin(dlam / 2.0) ** 2
    c = 2.0 * math.atan2(math.sqrt(a), math.sqrt(1.0 - a))
    return round(r * c, 2)

def calculate_bearing_deg(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    """Computes compass initial bearing from point 1 to point 2 (0-360 deg)."""
    phi1, phi2 = math.radians(lat1), math.radians(lat2)
    dlam = math.radians(lon2 - lon1)
    
    x = math.sin(dlam) * math.cos(phi2)
    y = math.cos(phi1) * math.sin(phi2) - math.sin(phi1) * math.cos(phi2) * math.cos(dlam)
    deg = math.degrees(math.atan2(x, y))
    return round((deg + 360.0) % 360.0, 1)

def assess_settlement_exposure(
    origin_lat: float,
    origin_lon: float,
    spread_prediction: Dict[str, Any],
    max_search_dist_km: float = 35.0
) -> List[Dict[str, Any]]:
    """
    Evaluates whether any downstream communities fall within the forward spread
    reach and downwind cone angle (+/- 35 degrees of spread azimuth).
    """
    head_bearing = spread_prediction.get("spread_azimuth_deg", 0.0)
    reach_km = spread_prediction.get("forward_distance_km", 10.0)
    
    exposed = []
    for rec in SETTLEMENT_RECEPTORS:
        dist = calculate_haversine_km(origin_lat, origin_lon, rec["lat"], rec["lon"])
        if dist > max_search_dist_km:
            continue
            
        bearing_to_rec = calculate_bearing_deg(origin_lat, origin_lon, rec["lat"], rec["lon"])
        bearing_diff = abs((bearing_to_rec - head_bearing + 180.0) % 360.0 - 180.0)
        
        # In downwind cone if within 35 degrees of head azimuth
        is_downwind = bearing_diff <= 35.0
        
        # Estimated time of arrival (ETA in hours) based on forward spread rate
        spread_rate = max(0.1, spread_prediction.get("forward_rate_kmh", 1.0))
        eta_hours = round(dist / spread_rate, 1) if is_downwind else None
        
        if is_downwind and dist <= (reach_km * 1.5):
            threat_severity = "CRITICAL" if dist <= reach_km else "HIGH"
        elif is_downwind:
            threat_severity = "ELEVATED"
        elif dist <= 5.0:
            threat_severity = "PROXIMATE_FLANK"
        else:
            continue
            
        exposed.append({
            "name": rec["name"],
            "type": rec["type"],
            "population": rec["population"],
            "distance_km": dist,
            "bearing_deg": bearing_to_rec,
            "is_downwind": is_downwind,
            "threat_severity": threat_severity,
            "eta_hours": eta_hours
        })
        
    return sorted(exposed, key=lambda x: x["distance_km"])

def generate_wildfire_alert(
    hotspot_id: str,
    lat: float,
    lon: float,
    frp_mw: float,
    confidence: str = "high",
    hfai_anomaly_band: str = "High",
    weather_override: Optional[Dict[str, Any]] = None,
    slope_deg: float = 0.0
) -> Dict[str, Any]:
    """
    Generates a full-fledged Wildfire Early Warning Alert package.
    """
    # 1. Evaluate threat through environmental engine
    threat = evaluate_hotspot_threat(
        hotspot_id=hotspot_id,
        lat=lat,
        lon=lon,
        frp_mw=frp_mw,
        confidence=confidence,
        hfai_anomaly_band=hfai_anomaly_band,
        weather=weather_override,
        slope_deg=slope_deg
    )
    
    # 2. Assess exposed settlements within downwind reach
    exposed = assess_settlement_exposure(
        origin_lat=lat,
        origin_lon=lon,
        spread_prediction=threat["spread_prediction"]
    )
    
    # 3. Escalate alert if critical settlements are directly downwind
    base_level = threat["alert"]["level"]
    critical_downwind = any(e["threat_severity"] in ["CRITICAL", "HIGH"] for e in exposed)
    
    if critical_downwind and base_level in ["WATCH", "ADVISORY"]:
        alert_level = "WARNING"
        headline = f"LEVEL 3 EMERGENCY WARNING: Active fire propagating directly toward inhabited settlements ({exposed[0]['name']})"
    elif base_level == "WARNING":
        alert_level = "WARNING"
        target_name = exposed[0]['name'] if exposed else "downwind areas"
        headline = f"LEVEL 3 EMERGENCY WARNING: High-intensity thermal anomaly with extreme spread potential toward {target_name}"
    elif base_level == "WATCH":
        alert_level = "WATCH"
        headline = f"LEVEL 2 WILDFIRE WATCH: Elevated fire danger index with rapid spread potential"
    else:
        alert_level = "ADVISORY"
        headline = f"LEVEL 1 FIRE ADVISORY: Environmental conditions conducive to fire development"
        
    threat["alert"]["level"] = alert_level
    threat["alert"]["headline"] = headline
    threat["exposed_receptors"] = exposed
    threat["timestamp_utc"] = datetime.datetime.now(datetime.timezone.utc).isoformat()
    
    return threat

def scan_active_anomalies_for_alerts(top_n: int = 5) -> List[Dict[str, Any]]:
    """
    Scans the processed anomalies database and generates active threat alerts
    for top high-risk events.
    """
    anomalies_file = PROCESSED_DIR / "fire_anomalies.parquet"
    if not anomalies_file.exists():
        return []
        
    df = pd.read_parquet(anomalies_file)
    extreme_df = df[df["severity"] == "Extreme"].sort_values(by="deviation", ascending=False).head(top_n)
    
    alerts = []
    for idx, row in extreme_df.iterrows():
        # Recover coordinates from grid_id (x_y in EPSG:6933 km)
        try:
            parts = str(row["grid_id"]).split("_")
            x_km, y_km = float(parts[0]), float(parts[1])
            # Approximate inverse EPSG:6933 to lat/lon for Bangladesh
            # EPSG:6933 origin: lat 0, lon 0. Latitude is approx y / 111.0
            lat = round(y_km / 111.0, 4)
            lon = round(x_km / (111.0 * math.cos(math.radians(lat))), 4)
        except Exception:
            lat, lon = 22.35, 92.20 # default CHT
            
        alert = generate_wildfire_alert(
            hotspot_id=f"HIST-{row['grid_id']}-{str(row['local_date'])}",
            lat=lat,
            lon=lon,
            frp_mw=float(row.get("hfai_smoothed", 150.0)),
            confidence="high",
            hfai_anomaly_band="Extreme",
            weather_override=REGIONAL_PROFILES.get("chittagong_hill_tracts_dry")
        )
        alerts.append(alert)
        
    return alerts

if __name__ == "__main__":
    print("Testing Wildfire Early Warning & Alert Engine...\n")
    
    # Camp Fire Retrospective Simulation Alert
    p_camp = REGIONAL_PROFILES["camp_fire_paradise_ignition"]
    camp_alert = generate_wildfire_alert(
        hotspot_id="CAMP-FIRE-IGNITION-0615PST",
        lat=p_camp["latitude"],
        lon=p_camp["longitude"],
        frp_mw=450.0,
        confidence="high",
        hfai_anomaly_band="Extreme",
        weather_override=p_camp,
        slope_deg=p_camp["slope_deg"]
    )
    
    print("=== RETROSPECTIVE BENCHMARK: 2018 CAMP FIRE ALERT ===")
    print(f"Alert Level:       {camp_alert['alert']['level']}")
    print(f"Headline:          {camp_alert['alert']['headline']}")
    print(f"FDI Danger:        {camp_alert['environmental_risk']['fdi']} ({camp_alert['environmental_risk']['danger_class']})")
    print(f"Spread Rate:       {camp_alert['spread_prediction']['forward_rate_kmh']} km/h (Azimuth {camp_alert['spread_prediction']['spread_azimuth_deg']}°)")
    print(f"Exposed Receptors: {len(camp_alert['exposed_receptors'])} communities in forward reach")
    for rec in camp_alert["exposed_receptors"]:
        print(f"  - {rec['name']}: {rec['distance_km']} km downwind, ETA: {rec['eta_hours']} hrs ({rec['threat_severity']})")
    print(f"Action:            {camp_alert['alert']['action_statement']}")
    print(f"Disclaimer:        {camp_alert['alert']['non_evacuation_disclaimer']}\n")
