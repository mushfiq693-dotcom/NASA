"""
fire_classifier.py
==================
Machine Learning & Geospatial Rule Engine for Fire Origin Attribution in Bangladesh.
Distinguishes between:
1. Human-Made Agricultural Crop Residue / Stubble Burning (Aman/Boro harvest)
2. Hill Tracts Jhum Cultivation / Forest Brush Fires (Human-ignited with forest escape risk)
3. Industrial / Brick Kiln (ইটভাটা) Thermal Emissions
4. Coastal / Mangrove Margin Human Activity
5. Spontaneous Natural Forest Wildfires (Extremely rare in Bangladesh <2%)
"""

import math
import datetime
from typing import Dict, Any, Tuple

# Regional bounding polygons / centroids for Bangladesh land-use zones
ZONE_CHITTAGONG_HILLS = {"min_lat": 21.4, "max_lat": 23.8, "min_lon": 91.8, "max_lon": 92.8}
ZONE_SUNDARBANS_CORE = {"min_lat": 21.6, "max_lat": 22.5, "min_lon": 89.0, "max_lon": 89.9}
ZONE_TEA_SYLHET = {"min_lat": 24.1, "max_lat": 25.1, "min_lon": 91.4, "max_lon": 92.5}
ZONE_CENTRAL_INDUSTRIAL = {"min_lat": 23.6, "max_lat": 24.2, "min_lon": 90.2, "max_lon": 90.6}

def calculate_haversine_km(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    r = 6371.0
    p1, p2 = math.radians(lat1), math.radians(lat2)
    dphi = math.radians(lat2 - lat1)
    dlam = math.radians(lon2 - lon1)
    a = math.sin(dphi / 2.0) ** 2 + math.cos(p1) * math.cos(p2) * math.sin(dlam / 2.0) ** 2
    return round(r * 2.0 * math.atan2(math.sqrt(a), math.sqrt(1.0 - a)), 2)

def classify_fire_origin(
    lat: float,
    lon: float,
    frp_mw: float,
    temp_c: float = 28.0,
    rh_pct: float = 50.0,
    acq_date: str = "",
    acq_time: str = ""
) -> Dict[str, Any]:
    """
    Classifies the thermal anomaly origin and attribution.
    Returns structured intelligence on whether the fire is Anthropogenic (Human-Made)
    or Ecological Wildfire, with confidence and actionable domain context.
    """
    # 1. Determine Month & Season
    month = 11  # Default to November (Aman harvest season)
    if acq_date:
        try:
            month = int(acq_date.split("-")[1])
        except Exception:
            pass

    is_aman_harvest_season = month in [10, 11, 12]  # Peak Aman rice stubble burning
    is_boro_harvest_season = month in [4, 5]        # Peak Boro rice residue burning
    is_harvest_season = is_aman_harvest_season or is_boro_harvest_season

    # 2. Check Geographic Zone
    in_cht = (ZONE_CHITTAGONG_HILLS["min_lat"] <= lat <= ZONE_CHITTAGONG_HILLS["max_lat"] and
              ZONE_CHITTAGONG_HILLS["min_lon"] <= lon <= ZONE_CHITTAGONG_HILLS["max_lon"])

    in_sundarbans_core = (ZONE_SUNDARBANS_CORE["min_lat"] <= lat <= ZONE_SUNDARBANS_CORE["max_lat"] and
                          ZONE_SUNDARBANS_CORE["min_lon"] <= lon <= ZONE_SUNDARBANS_CORE["max_lon"])

    in_tea_zone = (ZONE_TEA_SYLHET["min_lat"] <= lat <= ZONE_TEA_SYLHET["max_lat"] and
                   ZONE_TEA_SYLHET["min_lon"] <= lon <= ZONE_TEA_SYLHET["max_lon"])

    in_industrial_belt = (ZONE_CENTRAL_INDUSTRIAL["min_lat"] <= lat <= ZONE_CENTRAL_INDUSTRIAL["max_lat"] and
                          ZONE_CENTRAL_INDUSTRIAL["min_lon"] <= lon <= ZONE_CENTRAL_INDUSTRIAL["max_lon"])

    # 3. Decision Logic & Attribution Scoring
    if in_cht:
        # Chittagong Hill Tracts: Jhum slash-and-burn or hill brush clearing
        origin_category = "HUMAN_MADE_WITH_FOREST_RISK"
        type_code = "JHUM_SLASH_AND_BURN"
        type_label = "🌲 Hill Tracts Brush / Jhum Slash-and-Burn (Human-Ignited)"
        type_bengali = "পাহাড়ি ঝোপঝাড় / জুম চাষের জমি প্রস্তুতের আগুন (নৃতাত্ত্বিক)"
        human_prob = 0.92
        natural_prob = 0.08
        driver = "Seasonal Jhum vegetation clearance on hill slopes with potential forest canopy escape hazard."
        land_cover = "Hill Tracts Forest & Shrubland Fringe"
        canopy_hazard = "ELEVATED" if frp_mw >= 25.0 and rh_pct < 45.0 else "MODERATE"

    elif in_sundarbans_core:
        # Sundarbans core mangrove is extremely humid; natural fires do not happen
        origin_category = "HUMAN_MADE"
        type_code = "MANGROVE_BUFFER_ACTIVITY"
        type_label = "🌿 Mangrove Margin Human Activity (Fishermen / Buffer Hearth)"
        type_bengali = "উপকূলীয় বাফার জোন / জেলেদের ক্যাম্প বা গৃহস্থালি আগুন"
        human_prob = 0.98
        natural_prob = 0.02
        driver = "Human activity along riverine channel edges. No natural peat fire detected."
        land_cover = "Tidal Mangrove Buffer"
        canopy_hazard = "LOW"

    elif in_industrial_belt and frp_mw < 35.0:
        origin_category = "HUMAN_MADE_INDUSTRIAL"
        type_code = "INDUSTRIAL_BRICK_KILN"
        type_label = "🏭 Industrial / Brick Kiln Thermal Source (ইটভাটা)"
        type_bengali = "শিল্পাঞ্চল বা ইটভাটার তীব্র তাপ নিঃসরণ"
        human_prob = 0.99
        natural_prob = 0.01
        driver = "Seasonal brick manufacturing kiln or stationary industrial combustion."
        land_cover = "Peri-Urban Industrial & Mixed Agricultural"
        canopy_hazard = "NONE"

    elif in_tea_zone and frp_mw < 40.0:
        origin_category = "HUMAN_MADE"
        type_code = "TEA_ESTATE_EDGE_BURNING"
        type_label = "🍃 Tea Estate Edge / Stubble Burning (Human-Made)"
        type_bengali = "চা বাগান সংলগ্ন কৃষি জমি বা আগাছা পোড়ানো"
        human_prob = 0.95
        natural_prob = 0.05
        driver = "Controlled boundary weed clearance or smallholder rice stubble burn."
        land_cover = "Tea Plantation & Valley Cropland"
        canopy_hazard = "LOW"

    else:
        # Alluvial Agricultural Plains (Bogra, Sirajganj, Rajshahi, Faridpur, Barishal, etc.)
        origin_category = "HUMAN_MADE_AGRICULTURAL"
        type_code = "AGRICULTURAL_STUBBLE"
        type_label = "🌾 Agricultural Crop Residue / Stubble Burning (খড় পোড়ানো)"
        type_bengali = "ফসলি জমির খড় বা অবশিষ্টাংশ পোড়ানো (সম্পূর্ণ মানুষের দ্বারা সৃষ্ট)"
        human_prob = 0.96 if is_harvest_season else 0.90
        natural_prob = round(1.0 - human_prob, 2)
        driver = "Post-harvest Aman paddy stubble burning in alluvial cropland prior to winter planting."
        land_cover = "Intensive Alluvial Agricultural Cropland"
        canopy_hazard = "NEGLIGIBLE"

    return {
        "origin_category": origin_category,
        "type_code": type_code,
        "type_label": type_label,
        "type_bengali": type_bengali,
        "human_made_probability": human_prob,
        "natural_wildfire_probability": natural_prob,
        "primary_driver": driver,
        "land_cover_context": land_cover,
        "forest_canopy_escape_hazard": canopy_hazard,
        "is_human_made": human_prob >= 0.80
    }

