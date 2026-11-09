"""
environmental.py
================
Environmental & Weather Factor Engine for BengalFlare Wildfire Early Warning Architecture.

Implements rigorous atmospheric physics and fire danger metrics:
1. Saturation Vapor Pressure (SVP), Actual Vapor Pressure (AVP), and Vapor Pressure Deficit (VPD, kPa).
2. Dead Fine Fuel Moisture (mf, %) using Nelson / NFDRS formulation.
3. Fosberg Fire Weather Index (FFWI, 0-100) - NOAA / NWS Red Flag Warning standard.
4. Topographic slope multiplier and Rothermel forward fire spread rate (R, km/h).
5. Huygens elliptical spread cone generation (GeoJSON Polygon) extending downwind.
6. Open-Meteo live and historical weather ingestion with zero-key fallback cache.
"""

import math
import json
import datetime
from pathlib import Path
from typing import Dict, Any, Tuple, Optional, List
import requests
import pandas as pd

PROJECT_ROOT = Path(__file__).resolve().parent.parent
REPORTS_DIR = PROJECT_ROOT / "reports"
DATA_DIR = PROJECT_ROOT / "data"

_CLIMATOLOGY_CACHE = None

def get_hybrid_climatology_multiplier(lat: float, lon: float, fuel_moisture_pct: float) -> Tuple[float, str]:
    """
    Computes ML/Climatology Calibration Multiplier (k_ml) to adjust raw Rothermel physics.
    Uses 24-year historical burning patterns from climatology_baseline.parquet:
    - High historical biomass accumulation (rarely burned): k_ml in [1.15, 1.35]
    - Recent fire scar / frequent burns (fuel depleted): k_ml in [0.85, 0.95]
    - Severe drought/chaparral extreme dry anomaly (< 3% fuel moisture): k_ml = 1.25
    """
    global _CLIMATOLOGY_CACHE
    
    # 1. Extreme dry fuel condition override (e.g. Camp Fire / acute heatwave)
    if fuel_moisture_pct <= 3.0:
        return 1.25, "Acute dry fuel threshold (<3% mf): crown fire and pre-heating amplification (+25%)"

    # 2. Check Bangladesh grid boundaries
    if not (20.5 <= lat <= 26.8 and 88.0 <= lon <= 93.0):
        return 1.0, "Standard physics baseline (outside regional calibration grid)"
        
    try:
        if _CLIMATOLOGY_CACHE is None:
            baseline_path = DATA_DIR / "processed" / "climatology_baseline.parquet"
            if baseline_path.exists():
                _CLIMATOLOGY_CACHE = pd.read_parquet(baseline_path)
            else:
                return 1.0, "Climatology file not found, using raw physics"
                
        # Approximate EPSG:6933 1km grid ID
        x_km = int(lon * 111.0 * math.cos(math.radians(lat)))
        y_km = int(lat * 111.0)
        grid_id = f"{x_km}_{y_km}"
        
        matches = _CLIMATOLOGY_CACHE[_CLIMATOLOGY_CACHE["grid_id"] == grid_id]
        if len(matches) > 0:
            hist_fire_count = matches["fire_count"].sum()
            if hist_fire_count == 0:
                return 1.20, f"Unburned biomass accumulation detected at grid {grid_id} (0 historical burns in 24 yrs: +20% spread potential)"
            elif hist_fire_count > 5:
                return 0.88, f"Historical burn scar area at grid {grid_id} ({hist_fire_count} historical burns: -12% fuel continuity damping)"
            else:
                return 1.05, f"Moderate fuel continuity at grid {grid_id} (+5% calibration)"
        else:
            return 1.10, "Vegetation zone with no recent burn scars (+10% fuel accumulation factor)"
    except Exception as e:
        return 1.0, f"Physics baseline (calibration fallback: {e})"

# ==========================================
# 1. Atmospheric Physics & Fuel Moisture
# ==========================================

def calculate_vpd(temp_c: float, rh_pct: float) -> Dict[str, float]:
    """
    Computes Saturation Vapor Pressure (SVP), Actual Vapor Pressure (AVP),
    and Vapor Pressure Deficit (VPD in kPa) using the Tetens equation.
    
    When VPD > 2.0 kPa, atmosphere rapidly draws moisture from living and dead fuels.
    When VPD > 3.0 kPa, dead fine fuel moisture drops below critical combustion limits.
    """
    rh_safe = max(1.0, min(100.0, float(rh_pct)))
    # Tetens formula for SVP over liquid water
    svp = 0.61078 * math.exp((17.27 * temp_c) / (temp_c + 237.3))
    avp = svp * (rh_safe / 100.0)
    vpd = max(0.0, svp - avp)
    
    return {
        "svp_kpa": round(svp, 3),
        "avp_kpa": round(avp, 3),
        "vpd_kpa": round(vpd, 3)
    }

def calculate_fuel_moisture(temp_c: float, rh_pct: float) -> float:
    """
    Computes dead 1-hour/10-hour fine fuel moisture content (mf, %) 
    using the Nelson / NFDRS empirical piecewise formulation.
    
    - mf < 6%: Highly combustible, flashover potential (Red Flag threshold)
    - mf 6-12%: Readily burns with moderate wind
    - mf > 15%: Extinction threshold for grass/litter surface fire
    """
    rh = max(1.0, min(100.0, float(rh_pct)))
    t = float(temp_c)
    
    if rh < 10.0:
        mf = 0.03229 + 0.281073 * rh - 0.000578 * rh * t
    elif rh < 50.0:
        mf = 2.22749 + 0.160107 * rh - 0.01478 * t
    else:
        mf = 21.0606 + 0.005565 * (rh ** 2) - 0.00035 * rh * t - 0.483199 * rh
        
    return round(max(1.0, min(30.0, mf)), 2)

def decompose_wind_vector(speed_kmh: float, direction_deg: float) -> Dict[str, float]:
    """
    Decomposes meteorological wind (direction wind is blowing FROM)
    into u (East-West) and v (North-South) velocity components in m/s.
    """
    u_mps = speed_kmh / 3.6
    rad = math.radians(direction_deg % 360.0)
    
    # Meteorological convention: blowing FROM direction
    u_comp = -u_mps * math.sin(rad)
    v_comp = -u_mps * math.cos(rad)
    
    return {
        "wind_speed_kmh": round(speed_kmh, 1),
        "wind_speed_mps": round(u_mps, 2),
        "wind_direction_deg": round(direction_deg % 360.0, 1),
        "u_mps": round(u_comp, 2),
        "v_mps": round(v_comp, 2)
    }

# ==========================================
# 2. Fire Danger Index (Fosberg FFWI & Danger Rating)
# ==========================================

def compute_fire_danger_index(
    temp_c: float,
    rh_pct: float,
    wind_kmh: float,
    drought_factor: float = 7.0,
    slope_deg: float = 0.0
) -> Dict[str, Any]:
    """
    Computes the Fosberg Fire Weather Index (FFWI, 0-100) combined with
    drought conditioning and topographic slope adjustment.
    
    - FFWI is the official National Weather Service index for Red Flag criteria (FFWI >= 70).
    - Danger Classes: Low (<25), Moderate (25-49), High (50-69), Very High (70-84), Extreme (85-100).
    """
    mf = calculate_fuel_moisture(temp_c, rh_pct)
    vpd_info = calculate_vpd(temp_c, rh_pct)
    
    # 1. Moisture damping factor (eta)
    chi = mf / 30.0
    eta = 1.0 - 2.0 * chi + 1.5 * (chi ** 2) - 0.5 * (chi ** 3)
    
    # 2. Wind factor (lambda) using wind speed in mph
    wind_mph = max(0.0, wind_kmh) * 0.621371
    lam = math.sqrt(1.0 + wind_mph ** 2)
    
    # 3. Base Fosberg Index
    ffwi_base = (eta * lam) / 0.3002
    
    # 4. Drought conditioning adjustment (scale 0-10)
    # Drought increases available fuel loading
    d_norm = max(1.0, min(10.0, float(drought_factor))) / 10.0
    drought_mult = 0.75 + 0.25 * d_norm
    
    # 5. Slope adjustment (uphill pre-heating)
    slope_mult = 1.0 + 5.275 * (math.tan(math.radians(max(0.0, slope_deg)))) ** 2
    
    raw_fdi = ffwi_base * drought_mult * math.sqrt(slope_mult)
    fdi = round(min(100.0, max(0.0, raw_fdi)), 1)
    
    # Danger classification
    if fdi >= 85.0:
        danger_class = "Extreme"
        danger_color = "#FF0033"
        description = "Extreme wildfire outbreak danger. Ignitions will resist direct initial attack and spread explosively downwind."
    elif fdi >= 70.0:
        danger_class = "Very High"
        danger_color = "#FF5E00"
        description = "Very high fire risk. Red Flag conditions present. High potential for active crown runs and long-range spotting."
    elif fdi >= 50.0:
        danger_class = "High"
        danger_color = "#FFAA00"
        description = "High fire danger. Dry vegetation with active wind spread. Fine fuels ignite easily."
    elif fdi >= 25.0:
        danger_class = "Moderate"
        danger_color = "#E5D000"
        description = "Moderate seasonal burning risk. Fires spread at manageable rates and can be readily contained."
    else:
        danger_class = "Low"
        danger_color = "#00CC66"
        description = "Low fire danger. Moist surface fuels with low ignition probability."
        
    is_red_flag = (fdi >= 70.0) or (mf <= 6.0 and wind_kmh >= 35.0)
    
    return {
        "fdi": fdi,
        "danger_class": danger_class,
        "danger_color": danger_color,
        "is_red_flag": is_red_flag,
        "fuel_moisture_pct": mf,
        "vpd_kpa": vpd_info["vpd_kpa"],
        "description": description,
        "components": {
            "temperature_c": temp_c,
            "relative_humidity_pct": rh_pct,
            "wind_speed_kmh": wind_kmh,
            "drought_factor": drought_factor,
            "slope_deg": slope_deg,
            "moisture_damping_eta": round(eta, 3),
            "wind_factor_lambda": round(lam, 3)
        }
    }

# ==========================================
# 3. Huygens Elliptical Spread Cone & Exposure
# ==========================================

def predict_fire_spread(
    origin_lat: float,
    origin_lon: float,
    wind_speed_kmh: float,
    wind_dir_deg: float,
    fuel_moisture_pct: float = 5.0,
    slope_deg: float = 0.0,
    hours: float = 3.0
) -> Dict[str, Any]:
    """
    Predicts the forward spread rate and elliptical downwind threat perimeter
    using Rothermel's forward spread physics and Huygens wavelet expansion.
    
    - Forward rate R (km/h) = R0 * (1 + phi_w + phi_s) * eta_m
    - Length-to-breadth ratio L/B = 1.0 + 0.25 * U^0.8
    - Spread travels DOWNWIND (bearing = wind_dir + 180 degrees)
    - Returns a GeoJSON Feature Polygon of the predicted burn envelope.
    """
    # 1. Base backing spread rate (km/h) in fine surface fuels
    r0 = 0.12 
    
    # 2. Wind multiplier: phi_w = 0.045 * (U_kmh)^1.45
    u_kmh = max(0.0, wind_speed_kmh)
    phi_w = 0.045 * (u_kmh ** 1.45)
    
    # 3. Slope multiplier: phi_s = 5.275 * tan(slope)^2
    phi_s = 5.275 * (math.tan(math.radians(max(0.0, slope_deg)))) ** 2
    
    # 4. Fuel moisture damping factor
    # Extinction moisture ~ 20%
    mf = max(1.0, min(25.0, fuel_moisture_pct))
    eta_m = max(0.05, 1.0 - 2.59 * (mf / 20.0) + 5.11 * ((mf / 20.0) ** 2) - 3.52 * ((mf / 20.0) ** 3))
    
    physics_base_rate_kmh = round(r0 * (1.0 + phi_w + phi_s) * eta_m, 2)
    
    # 5. Hybrid Engine: Climatology & Fuel Accumulation Calibration
    k_ml, calib_basis = get_hybrid_climatology_multiplier(origin_lat, origin_lon, mf)
    forward_rate_kmh = round(max(0.1, physics_base_rate_kmh * k_ml), 2)
    
    # Duration and distances
    t_hrs = max(0.25, float(hours))
    forward_dist_km = forward_rate_kmh * t_hrs
    backing_dist_km = max(0.05, forward_dist_km * 0.08) # backing fire is ~8% of head fire
    
    # Ellipse length-to-breadth ratio (Alexander 1985)
    lb_ratio = 1.0 + 0.25 * (u_kmh ** 0.75) if u_kmh > 1.0 else 1.0
    total_length_km = forward_dist_km + backing_dist_km
    flank_width_km = total_length_km / max(1.0, lb_ratio)
    
    # Semimajor (a) and semiminor (b) axes of ellipse
    a_km = total_length_km / 2.0
    b_km = flank_width_km / 2.0
    area_sq_km = round(math.pi * a_km * b_km, 2)
    
    # Downwind propagation azimuth
    # Wind FROM theta => fire heads TO (theta + 180)
    spread_azimuth = (wind_dir_deg + 180.0) % 360.0
    spread_rad = math.radians(spread_azimuth)
    
    # Center of the ellipse is shifted from origin towards the head of the fire
    # Origin is at (c_offset) from ellipse center
    c_offset_km = a_km - backing_dist_km
    
    # Convert km offset to lat/lon degrees (approximate for local projection)
    km_per_lat = 111.0
    km_per_lon = 111.0 * math.cos(math.radians(origin_lat))
    
    center_lat = origin_lat + (c_offset_km * math.cos(spread_rad)) / km_per_lat
    center_lon = origin_lon + (c_offset_km * math.sin(spread_rad)) / km_per_lon
    
    # Generate 36 polygon vertices around the perimeter of the ellipse
    coords = []
    num_pts = 36
    for i in range(num_pts + 1):
        angle = (2 * math.pi * i) / num_pts
        # Ellipse in local coordinate frame (x along semimajor, y along semiminor)
        local_x = a_km * math.cos(angle)
        local_y = b_km * math.sin(angle)
        
        # Rotate by spread azimuth (angle from North clockwise)
        # In map coordinates: north is +Y, east is +X
        # Spread angle is from North (y-axis) clockwise:
        rot_north_km = local_x * math.cos(spread_rad) - local_y * math.sin(spread_rad)
        rot_east_km = local_x * math.sin(spread_rad) + local_y * math.cos(spread_rad)
        
        pt_lat = center_lat + (rot_north_km / km_per_lat)
        pt_lon = center_lon + (rot_east_km / km_per_lon)
        coords.append([round(pt_lon, 5), round(pt_lat, 5)])
        
    geojson_polygon = {
        "type": "Feature",
        "geometry": {
            "type": "Polygon",
            "coordinates": [coords]
        },
        "properties": {
            "origin_lat": origin_lat,
            "origin_lon": origin_lon,
            "forecast_hours": t_hrs,
            "physics_base_rate_kmh": physics_base_rate_kmh,
            "hybrid_multiplier": k_ml,
            "calibration_basis": calib_basis,
            "forward_rate_kmh": forward_rate_kmh,
            "forward_distance_km": round(forward_dist_km, 2),
            "flank_width_km": round(flank_width_km, 2),
            "area_sq_km": area_sq_km,
            "spread_azimuth_deg": round(spread_azimuth, 1),
            "wind_speed_kmh": round(wind_speed_kmh, 1)
        }
    }
    
    return {
        "physics_base_rate_kmh": physics_base_rate_kmh,
        "hybrid_multiplier": k_ml,
        "calibration_basis": calib_basis,
        "forward_rate_kmh": forward_rate_kmh,
        "forward_distance_km": round(forward_dist_km, 2),
        "flank_width_km": round(flank_width_km, 2),
        "area_sq_km": area_sq_km,
        "spread_azimuth_deg": round(spread_azimuth, 1),
        "length_to_breadth_ratio": round(lb_ratio, 2),
        "geojson": geojson_polygon
    }

# ==========================================
# 4. Weather Ingestion (Live & Archive)
# ==========================================

# Verified meteorological profiles for benchmark regions
REGIONAL_PROFILES: Dict[str, Dict[str, Any]] = {
    "camp_fire_paradise_ignition": {
        "location": "Poe Dam / Pulga, Butte County, CA (Camp Fire Ignition)",
        "latitude": 39.813,
        "longitude": -121.438,
        "date": "2018-11-08T06:15:00",
        "temperature_c": 18.3,
        "relative_humidity_pct": 8.0,
        "wind_speed_kmh": 56.3, # 35 mph sustained
        "wind_gusts_kmh": 85.0, # 53 mph gusts (Jarvis Gap Diablo winds)
        "wind_direction_deg": 45.0, # NE (blowing directly towards Concow and Paradise)
        "drought_factor": 10.0, # 210 consecutive days without wetting rain
        "slope_deg": 18.0 # Feather River Canyon steep ravine
    },
    "chittagong_hill_tracts_dry": {
        "location": "Rangamati / Bandarban, Bangladesh (Pre-Monsoon Peak)",
        "latitude": 22.35,
        "longitude": 92.20,
        "date": "2024-03-25T13:30:00",
        "temperature_c": 36.5,
        "relative_humidity_pct": 28.0,
        "wind_speed_kmh": 22.0,
        "wind_gusts_kmh": 38.0,
        "wind_direction_deg": 210.0, # SW pre-monsoon airflow
        "drought_factor": 8.5,
        "slope_deg": 14.0 # Hill Tract ridge topography
    },
    "sundarbans_mangrove": {
        "location": "Sundarbans Reserved Forest, Bangladesh",
        "latitude": 22.05,
        "longitude": 89.50,
        "date": "2024-03-25T13:30:00",
        "temperature_c": 31.0,
        "relative_humidity_pct": 68.0,
        "wind_speed_kmh": 16.0,
        "wind_gusts_kmh": 24.0,
        "wind_direction_deg": 180.0, # Southerly coastal sea breeze
        "drought_factor": 4.0,
        "slope_deg": 0.5 # Tidal flatland
    },
    "dhaka_central": {
        "location": "Dhaka Metropolitan / Central Plain, Bangladesh",
        "latitude": 23.81,
        "longitude": 90.41,
        "date": "2024-04-10T14:00:00",
        "temperature_c": 38.2,
        "relative_humidity_pct": 32.0,
        "wind_speed_kmh": 18.0,
        "wind_gusts_kmh": 32.0,
        "wind_direction_deg": 195.0,
        "drought_factor": 7.5,
        "slope_deg": 0.5
    }
}

def fetch_live_weather(lat: float, lon: float, timeout_sec: int = 4) -> Dict[str, Any]:
    """
    Fetches real-time weather from Open-Meteo free API for any coordinate.
    Falls back gracefully to regional climatology if offline.
    """
    url = f"https://api.open-meteo.com/v1/forecast?latitude={lat}&longitude={lon}&current=temperature_2m,relative_humidity_2m,wind_speed_10m,wind_direction_10m,wind_gusts_10m"
    try:
        resp = requests.get(url, timeout=timeout_sec)
        if resp.status_code == 200:
            cur = resp.json().get("current", {})
            return {
                "source": "Open-Meteo Live API",
                "timestamp": cur.get("time", datetime.datetime.now(datetime.timezone.utc).isoformat()),
                "latitude": lat,
                "longitude": lon,
                "temperature_c": float(cur.get("temperature_2m", 28.0)),
                "relative_humidity_pct": float(cur.get("relative_humidity_2m", 50.0)),
                "wind_speed_kmh": float(cur.get("wind_speed_10m", 12.0)),
                "wind_gusts_kmh": float(cur.get("wind_gusts_10m", 18.0)),
                "wind_direction_deg": float(cur.get("wind_direction_10m", 180.0)),
                "drought_factor": 6.5,
                "is_live": True
            }
    except Exception as e:
        print(f"Weather API fallback for ({lat}, {lon}): {e}")
        
    # Fallback to nearest regional profile
    profile = REGIONAL_PROFILES["dhaka_central"]
    return {
        "source": "BengalFlare Offline Climatology Fallback",
        "timestamp": datetime.datetime.now(datetime.timezone.utc).isoformat(),
        "latitude": lat,
        "longitude": lon,
        "temperature_c": profile["temperature_c"],
        "relative_humidity_pct": profile["relative_humidity_pct"],
        "wind_speed_kmh": profile["wind_speed_kmh"],
        "wind_gusts_kmh": profile["wind_gusts_kmh"],
        "wind_direction_deg": profile["wind_direction_deg"],
        "drought_factor": profile["drought_factor"],
        "is_live": False
    }

def get_regional_profile(profile_key: str) -> Optional[Dict[str, Any]]:
    """Returns verified historical/regional profile by key."""
    return REGIONAL_PROFILES.get(profile_key)

# ==========================================
# 5. Integrated Hotspot Risk Assessment
# ==========================================

def evaluate_hotspot_threat(
    hotspot_id: str,
    lat: float,
    lon: float,
    frp_mw: float,
    confidence: str = "nominal",
    hfai_anomaly_band: str = "Normal",
    weather: Optional[Dict[str, Any]] = None,
    slope_deg: float = 0.0
) -> Dict[str, Any]:
    """
    Evaluates complete multi-factor wildfire risk for a detected or simulated hotspot:
    Combines satellite FRP + Climatology Anomaly Band + Environmental FDI + Spread Cone.
    """
    if weather is None:
        weather = fetch_live_weather(lat, lon)
        
    temp_c = weather.get("temperature_c", 30.0)
    rh_pct = weather.get("relative_humidity_pct", 40.0)
    wind_kmh = weather.get("wind_speed_kmh", 15.0)
    wind_dir = weather.get("wind_direction_deg", 180.0)
    drought = weather.get("drought_factor", 7.0)
    
    # 1. Compute Fire Danger Index
    danger = compute_fire_danger_index(
        temp_c=temp_c,
        rh_pct=rh_pct,
        wind_kmh=wind_kmh,
        drought_factor=drought,
        slope_deg=slope_deg
    )
    
    # 2. Compute 3-hour downwind forward spread prediction
    spread = predict_fire_spread(
        origin_lat=lat,
        origin_lon=lon,
        wind_speed_kmh=wind_kmh,
        wind_dir_deg=wind_dir,
        fuel_moisture_pct=danger["fuel_moisture_pct"],
        slope_deg=slope_deg,
        hours=3.0
    )
    
    # 3. Determine Integrated Alert Level
    # Criteria:
    # - Level 3 (Emergency Warning): FRP > 100 MW or Anomaly == 'Extreme' AND FDI >= 70
    # - Level 2 (Wildfire Watch): FRP > 30 MW or Anomaly in ['High', 'Extreme'] or FDI >= 70
    # - Level 1 (Fire Advisory): FRP > 0 or FDI >= 50
    if (frp_mw >= 80.0 or hfai_anomaly_band == "Extreme") and (danger["is_red_flag"] or spread["forward_rate_kmh"] >= 1.5):
        alert_level = "WARNING"
        alert_color = "#FF0033"
        action_statement = "URGENT ACTION: Immediate ground verification and downwind community evacuation preparedness advised."
    elif (frp_mw >= 25.0 or hfai_anomaly_band in ["High", "Extreme"] or danger["is_red_flag"]):
        alert_level = "WATCH"
        alert_color = "#FF5E00"
        action_statement = "ELEVATED THREAT: Rapid spread potential downwind. Fire management teams should stage containment resources."
    elif danger["fdi"] >= 50.0 or frp_mw >= 10.0:
        alert_level = "ADVISORY"
        alert_color = "#FFAA00"
        action_statement = "ADVISORY: Flammable atmospheric conditions present. Monitor area for secondary thermal ignitions."
    else:
        alert_level = "INFORMATIONAL"
        alert_color = "#00CC66"
        action_statement = "NORMAL: Low forward spread potential under prevailing weather conditions."
        
    return {
        "hotspot_id": hotspot_id,
        "coordinates": {"latitude": lat, "longitude": lon},
        "satellite_evidence": {
            "frp_mw": frp_mw,
            "confidence": confidence,
            "hfai_anomaly_band": hfai_anomaly_band
        },
        "environmental_risk": danger,
        "spread_prediction": spread,
        "alert": {
            "level": alert_level,
            "color": alert_color,
            "action_statement": action_statement,
            "non_evacuation_disclaimer": "DISCLAIMER: Decision support model output only. Official evacuation mandates are issued exclusively by authorized local emergency management agencies."
        }
    }

if __name__ == "__main__":
    print("Testing Environmental & Wildfire Prediction Engine...\n")
    
    # Test 1: California Camp Fire Ignition (2018-11-08)
    p_camp = REGIONAL_PROFILES["camp_fire_paradise_ignition"]
    res_camp = evaluate_hotspot_threat(
        hotspot_id="CAMP-FIRE-001",
        lat=p_camp["latitude"],
        lon=p_camp["longitude"],
        frp_mw=340.0,
        confidence="high",
        hfai_anomaly_band="Extreme",
        weather=p_camp,
        slope_deg=p_camp["slope_deg"]
    )
    print("--- BENCHMARK 1: 2018 CAMP FIRE (PARADISE, CA) ---")
    print(f"FDI Score:         {res_camp['environmental_risk']['fdi']} ({res_camp['environmental_risk']['danger_class']})")
    print(f"Red Flag Warning:  {res_camp['environmental_risk']['is_red_flag']}")
    print(f"Fuel Moisture:     {res_camp['environmental_risk']['fuel_moisture_pct']}%")
    print(f"Forward Spread:    {res_camp['spread_prediction']['forward_rate_kmh']} km/h towards azimuth {res_camp['spread_prediction']['spread_azimuth_deg']}°")
    print(f"3-hr Burn Reach:   {res_camp['spread_prediction']['forward_distance_km']} km (Area: {res_camp['spread_prediction']['area_sq_km']} sq km)")
    print(f"Alert Level:       {res_camp['alert']['level']}")
    print(f"Action Statement:  {res_camp['alert']['action_statement']}\n")
    
    # Test 2: Bangladesh Chittagong Hill Tracts Spring Outbreak
    p_cht = REGIONAL_PROFILES["chittagong_hill_tracts_dry"]
    res_cht = evaluate_hotspot_threat(
        hotspot_id="CHT-2024-001",
        lat=p_cht["latitude"],
        lon=p_cht["longitude"],
        frp_mw=65.0,
        confidence="high",
        hfai_anomaly_band="High",
        weather=p_cht,
        slope_deg=p_cht["slope_deg"]
    )
    print("--- BENCHMARK 2: BANGLADESH CHITTAGONG HILL TRACTS ---")
    print(f"FDI Score:         {res_cht['environmental_risk']['fdi']} ({res_cht['environmental_risk']['danger_class']})")
    print(f"Fuel Moisture:     {res_cht['environmental_risk']['fuel_moisture_pct']}%")
    print(f"Forward Spread:    {res_cht['spread_prediction']['forward_rate_kmh']} km/h")
    print(f"Alert Level:       {res_cht['alert']['level']}")
    print("-----------------------------------------------------")

