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

try:
    from src.fire_classifier import classify_fire_origin
except ImportError:
    try:
        from firechronicle.src.fire_classifier import classify_fire_origin
    except ImportError:
        try:
            from fire_classifier import classify_fire_origin
        except ImportError:
            classify_fire_origin = None

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

COMPASS_BENGALI = {
    "N": "উত্তর (N)", "NNE": "উত্তর-উত্তরপূর্ব (NNE)", "NE": "উত্তর-পূর্ব (NE)", "ENE": "পূর্ব-উত্তরপূর্ব (ENE)",
    "E": "পূর্ব (E)", "ESE": "পূর্ব-দক্ষিণপূর্ব (ESE)", "SE": "দক্ষিণ-পূর্ব (SE)", "SSE": "দক্ষিণ-দক্ষিণপূর্ব (SSE)",
    "S": "দক্ষিণ (S)", "SSW": "দক্ষিণ-দক্ষিণপশ্চিম (SSW)", "SW": "দক্ষিণ-পশ্চিম (SW)", "WSW": "পশ্চিম-দক্ষিণপশ্চিম (WSW)",
    "W": "পশ্চিম (W)", "WNW": "পশ্চিম-উত্তরপশ্চিম (WNW)", "NW": "উত্তর-পশ্চিম (NW)", "NNW": "উত্তর-উত্তরপশ্চিম (NNW)"
}

COMPASS_ENGLISH = {
    "N": "North (N)", "NNE": "North-Northeast (NNE)", "NE": "Northeast (NE)", "ENE": "East-Northeast (ENE)",
    "E": "East (E)", "ESE": "East-Southeast (ESE)", "SE": "Southeast (SE)", "SSE": "South-Southeast (SSE)",
    "S": "South (S)", "SSW": "South-Southwest (SSW)", "SW": "Southwest (SW)", "WSW": "West-Southwest (WSW)",
    "W": "West (W)", "WNW": "West-Northwest (WNW)", "NW": "Northwest (NW)", "NNW": "North-Northwest (NNW)"
}

def degrees_to_compass(deg: float) -> str:
    """Converts 0-360 degrees to 16-point cardinal compass direction."""
    val = int((deg / 22.5) + 0.5)
    arr = ["N", "NNE", "NE", "ENE", "E", "ESE", "SE", "SSE", "S", "SSW", "SW", "WSW", "W", "WNW", "NW", "NNW"]
    return arr[(val % 16)]

def format_actionable_intelligence(threat: Dict[str, Any], exposed: List[Dict[str, Any]]) -> Dict[str, Any]:
    """
    Transforms raw telemetry & physical parameters into 5-pillar Actionable Intelligence:
    1. Pinpoint Location (GPS, landmark, administrative zone)
    2. Severity Assessment (Level 1-3, FDI score, danger class)
    3. Meteorological Drivers (temperature, humidity, fuel moisture, wind vector)
    4. Threat Corridor & Impact Timeline (downwind communities, population, ETA)
    5. Role-Specific Directives (Forestry, Fire Service, Administration, Public)
    Plus ready-to-dispatch SMS and Telegram formatted payloads.
    """
    coords = threat["coordinates"]
    lat, lon = coords["latitude"], coords["longitude"]
    env = threat["environmental_risk"]
    comp = env.get("components", {})
    spread = threat["spread_prediction"]
    alert_info = threat["alert"]
    level = alert_info["level"]

    # 1. Location Breakdown
    nearest_dist = 999.0
    nearest_name = "Remote Forest Sector"
    for rec in SETTLEMENT_RECEPTORS:
        d = calculate_haversine_km(lat, lon, rec["lat"], rec["lon"])
        if d < nearest_dist:
            nearest_dist = d
            nearest_name = rec["name"]

    if nearest_dist <= 25.0:
        loc_display = f"{nearest_name} (~{nearest_dist:.1f} km away)"
    elif nearest_dist <= 60.0:
        loc_display = f"{nearest_name} Outskirts (~{nearest_dist:.0f} km away)"
    else:
        loc_display = f"Regional Farmland ({lat:.3f}°N, {lon:.3f}°E · ~{nearest_dist:.0f} km from {nearest_name})"

    location_desc = f"{loc_display} · Lat {lat:.3f}°N, Lon {lon:.3f}°E"

    # 2. Severity Classification
    if level == "WARNING":
        tier_title = "LEVEL 3: RED FLAG WARNING (EMERGENCY)"
        color_code = "#FF0033"
    elif level == "WATCH":
        tier_title = "LEVEL 2: WILDFIRE WATCH (ELEVATED)"
        color_code = "#FF5E00"
    else:
        tier_title = "LEVEL 1: FIRE WEATHER ADVISORY (MONITORING)"
        color_code = "#FFAA00"

    # 3. Meteorological Drivers
    temp = comp.get("temperature_c", 30.0)
    rh = comp.get("relative_humidity_pct", 40.0)
    wind_spd = comp.get("wind_speed_kmh", 15.0)
    wind_dir = comp.get("wind_direction_deg", 180.0)
    mf = env.get("fuel_moisture_pct", 8.0)
    wind_from = degrees_to_compass(wind_dir)
    wind_toward = degrees_to_compass(spread.get("spread_azimuth_deg", (wind_dir + 180.0) % 360.0))

    if mf <= 6.0 and wind_spd >= 30.0:
        met_summary = f"CRITICAL: Extreme dry winds ({wind_spd} km/h from {wind_from}) with tinder-dry fuel moisture ({mf}%). Explosive combustion risk."
    elif mf <= 8.0 or wind_spd >= 20.0:
        met_summary = f"ELEVATED: Warm dry air ({temp}°C, {rh}% RH) with brisk winds ({wind_spd} km/h from {wind_from}). Surface fuels ignite readily."
    else:
        met_summary = f"MODERATE: Seasonal dry conditions ({temp}°C, {rh}% RH) with wind speed of {wind_spd} km/h."

    # 4. Threat Corridor & Impact Timeline
    rate = spread.get("forward_rate_kmh", 1.0)
    dist_3h = spread.get("forward_distance_km", 3.0)
    downwind_communities = [
        {
            "name": e["name"],
            "distance_km": e["distance_km"],
            "eta_hours": e.get("eta_hours", round(e["distance_km"] / max(0.1, rate), 1)),
            "population": e.get("population", 0),
            "threat_severity": e.get("threat_severity", "ELEVATED")
        }
        for e in exposed if e.get("is_downwind", False)
    ]

    if downwind_communities:
        top_c = downwind_communities[0]
        corridor_summary = f"Active spread toward {wind_toward}. Direct threat to {top_c['name']} (Pop: ~{top_c['population']:,}) in ~{top_c['eta_hours']} hrs ({top_c['distance_km']} km downwind)."
    else:
        corridor_summary = f"Propagation corridor extends {dist_3h} km towards {wind_toward} over uninhabited forest buffer."

    # 5. Role-Specific Directives
    if level == "WARNING":
        forest_directives = [
            "Establish defensive fire lines and fuel breaks along the downwind sector.",
            "Deploy all available motorized patrol units and notify Beat Officers immediately.",
            "Wet critical perimeter boundaries and monitor for long-range ember spotting."
        ]
        fire_service_directives = [
            f"Pre-position water tenders along nearest motorable roads toward {location_desc}.",
            "Coordinate with local forest department for water extraction points.",
            "Prepare high-pressure brush hoses and foam dispersal units."
        ]
        admin_and_public_directives = [
            "Issue immediate Red Flag Warning: Strictly prohibit all open-air agricultural burning.",
            "Prepare downwind settlements for potential preventive evacuation if within 5 km.",
            "Instruct residents to clear dry leaves and combustible materials within 50 meters of homes."
        ]
    elif level == "WATCH":
        forest_directives = [
            "Increase watchtower vigilance and patrol frequency along known fire corridors.",
            "Verify all ground radio communications and GPS tracking equipment.",
            "Check water reservoir levels and pump readiness at local beats."
        ]
        fire_service_directives = [
            "Place standby crews on heightened alertness.",
            "Verify road access routes leading to the coordinates.",
            "Review water tender availability for rapid rural dispatch."
        ]
        admin_and_public_directives = [
            "Advise farmers and plantation workers to avoid any debris burning during windy afternoon hours.",
            "Broadcast localized fire advisory over community loudspeakers and Union Parishad channels."
        ]
    else:
        forest_directives = [
            "Routine seasonal forest monitoring. Report any unseasonal smoke columns.",
            "Maintain access tracks clear of fallen timber."
        ]
        fire_service_directives = [
            "Standard operational standby."
        ]
        admin_and_public_directives = [
            "Routine public awareness on wildfire prevention in rural areas."
        ]

    # 6. Concise & High-Impact Formatted Dispatch Messages (English)
    wind_toward_en = COMPASS_ENGLISH.get(wind_toward, wind_toward)

    if level == "WARNING":
        header = "🚨 *WILDFIRE ALERT: RED FLAG WARNING* 🔴"
        risk_summary = "Extreme & rapid spread risk"
        why_text = f"NASA detected active fire. Strong winds ({wind_spd} km/h) & dry heat ({temp}°C) are fanning flames."
        user_directives = [
            "• Do NOT light outdoor fires or burn brush/leaves.",
            "• Keep flammable materials away from residences.",
            "• Report smoke or flames immediately to Fire Service."
        ]
    elif level == "WATCH":
        header = "⚠️ *WILDFIRE ALERT: WATCH LEVEL* 🟠"
        risk_summary = "Elevated fire danger (Monitoring closely)"
        why_text = f"NASA detected heat hotspots. Warm winds ({wind_spd} km/h) may expand the fire front."
        user_directives = [
            "• Avoid lighting open outdoor fires.",
            "• Stay alert and report any visible forest smoke."
        ]
    else:
        header = "ℹ️ *WILDFIRE ADVISORY* 🟡"
        risk_summary = "Dry conditions (Caution advised)"
        why_text = f"Satellite detected heat signatures under dry weather ({temp}°C)."
        user_directives = [
            "• Exercise extra caution with open flames outdoors."
        ]

    if downwind_communities:
        top_c = downwind_communities[0]
        heading_text = (
            f"Moving *{wind_toward_en}* towards *{top_c['name']}* (possible impact in ~{top_c['eta_hours']}h)."
        )
    else:
        heading_text = (
            f"Moving *{wind_toward_en}* over open forest (no immediate threat to settlements)."
        )

    frp_mw = threat.get("satellite_evidence", {}).get("frp_mw", 20.0)
    origin_info = classify_fire_origin(lat, lon, frp_mw, temp, rh) if classify_fire_origin else {
        "type_label": "🌾 Agricultural Stubble Burning (Human-Made)",
        "human_made_probability": 0.96,
        "primary_driver": "Post-harvest crop residue burn in agricultural cropland.",
        "land_cover_context": "Alluvial Agricultural Cropland"
    }

    telegram_markdown = (
        f"{header}\n\n"
        f"📍 *Location:* {loc_display}\n"
        f"🔥 *Fire Type:* {origin_info['type_label']}\n"
        f"🧠 *Attribution:* {int(origin_info['human_made_probability']*100)}% Human-Made ({origin_info['land_cover_context']})\n"
        f"⚠️ *Threat Level:* {risk_summary} · {frp_mw:.1f} MW FRP\n\n"
        f"🌾 *Origin Context:* {origin_info['primary_driver']}\n"
        f"🧭 *Heading:* {heading_text}\n\n"
        f"🛡️ *Action Guidance:*\n" + "\n".join(user_directives) + "\n\n"
        f"🗺️ *Live Threat Map:* https://bengalflare.vercel.app/early-warning\n"
        f"📢 *Live Alerts Channel:* @bengalflare\\_live"
    )

    sms_text = (
        f"[{tier_title.split(':')[1].strip() if ':' in tier_title else tier_title}]\n"
        f"Near: {loc_display}\n"
        f"Type: {origin_info.get('type_code', 'FIRE')}\n"
        f"Risk: {risk_summary}\n"
        f"Wind: {wind_spd}km/h towards {wind_toward}\n"
        f"Action: Avoid open burning. Map: t.me/bengalflare_live"
    )

    return {
        "pillar_1_pinpoint_location": {
            "coordinates": {"latitude": lat, "longitude": lon},
            "nearest_landmark": nearest_name,
            "distance_to_landmark_km": round(nearest_dist, 2),
            "description": location_desc,
            "fire_origin_attribution": origin_info
        },
        "pillar_2_severity": {
            "tier": tier_title,
            "level": level,
            "color": color_code,
            "fdi_score": env.get("fdi", 0.0),
            "danger_class": env.get("danger_class", "Moderate"),
            "is_red_flag": env.get("is_red_flag", False)
        },
        "pillar_3_meteorological_drivers": {
            "temperature_c": temp,
            "relative_humidity_pct": rh,
            "dead_fuel_moisture_pct": mf,
            "wind_speed_kmh": wind_spd,
            "wind_from_direction": f"{wind_from} ({wind_dir}°)",
            "wind_spread_direction": f"{wind_toward} ({spread.get('spread_azimuth_deg', 0)}°)",
            "summary": met_summary
        },
        "pillar_4_threat_corridor": {
            "forward_spread_rate_kmh": rate,
            "forward_reach_3h_km": dist_3h,
            "propagation_bearing_deg": spread.get("spread_azimuth_deg", 0),
            "propagation_compass": wind_toward,
            "downwind_communities": downwind_communities,
            "corridor_summary": corridor_summary
        },
        "pillar_5_tactical_directives": {
            "forest_department": forest_directives,
            "fire_service": fire_service_directives,
            "local_administration_and_public": admin_and_public_directives
        },
        "dispatch_payloads": {
            "sms_text": sms_text,
            "telegram_markdown": telegram_markdown
        }
    }

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
    
    # 4. Attach 5-Pillar Actionable Intelligence Package
    threat["actionable_intelligence"] = format_actionable_intelligence(threat, exposed)
    
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
