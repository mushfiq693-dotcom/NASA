import pytest
import math
from fastapi.testclient import TestClient
from api.main import app
from src.environmental import (
    calculate_vpd,
    calculate_fuel_moisture,
    decompose_wind_vector,
    compute_fire_danger_index,
    predict_fire_spread,
    REGIONAL_PROFILES
)
from src.alert_engine import (
    calculate_haversine_km,
    assess_settlement_exposure,
    generate_wildfire_alert
)

client = TestClient(app)

def test_atmospheric_physics():
    """Verify VPD and dead fuel moisture calculations."""
    # Test VPD
    vpd_normal = calculate_vpd(25.0, 60.0)
    assert 0.5 <= vpd_normal["vpd_kpa"] <= 2.0
    
    vpd_dry = calculate_vpd(35.0, 15.0)
    assert vpd_dry["vpd_kpa"] > 4.0, "High temp and low RH must yield elevated VPD"
    
    # Test Dead Fuel Moisture
    mf_normal = calculate_fuel_moisture(25.0, 60.0)
    assert 8.0 <= mf_normal <= 18.0
    
    mf_red_flag = calculate_fuel_moisture(18.0, 8.0)
    assert mf_red_flag < 6.0, f"Red Flag fine fuel moisture must be < 6%, got {mf_red_flag}"

def test_wind_vector_physics():
    """Verify meteorological wind decomposition into orthogonal m/s components."""
    # Wind from North (0 deg) should have u=0, v=-u_mps
    w_north = decompose_wind_vector(36.0, 0.0) # 36 km/h = 10 m/s
    assert math.isclose(w_north["u_mps"], 0.0, abs_tol=0.1)
    assert math.isclose(w_north["v_mps"], -10.0, abs_tol=0.1)
    
    # Wind speed magnitude invariance: u^2 + v^2 = (U/3.6)^2
    w_diag = decompose_wind_vector(72.0, 45.0) # 20 m/s
    mag = math.sqrt(w_diag["u_mps"] ** 2 + w_diag["v_diag" if "v_diag" in w_diag else "v_mps"] ** 2)
    assert math.isclose(mag, 20.0, abs_tol=0.2)

def test_fosberg_fire_danger_index():
    """Verify Fosberg FFWI differentiates benign from Red Flag conditions."""
    # Normal safe day
    fdi_safe = compute_fire_danger_index(temp_c=25.0, rh_pct=65.0, wind_kmh=10.0)
    assert fdi_safe["danger_class"] == "Low"
    assert not fdi_safe["is_red_flag"]
    
    # Camp Fire 2018 conditions (Paradise, CA)
    p_camp = REGIONAL_PROFILES["camp_fire_paradise_ignition"]
    fdi_camp = compute_fire_danger_index(
        temp_c=p_camp["temperature_c"],
        rh_pct=p_camp["relative_humidity_pct"],
        wind_kmh=p_camp["wind_speed_kmh"],
        drought_factor=p_camp["drought_factor"],
        slope_deg=p_camp["slope_deg"]
    )
    assert fdi_camp["fdi"] >= 85.0, f"Camp Fire FDI should be Extreme (>=85), got {fdi_camp['fdi']}"
    assert fdi_camp["danger_class"] == "Extreme"
    assert fdi_camp["is_red_flag"] is True

def test_huygens_spread_prediction_geometry():
    """Verify forward rate of spread and GeoJSON elliptical polygon generation."""
    origin_lat, origin_lon = 22.35, 92.20
    wind_dir = 45.0 # NE wind
    
    spread = predict_fire_spread(
        origin_lat=origin_lat,
        origin_lon=origin_lon,
        wind_speed_kmh=40.0,
        wind_dir_deg=wind_dir,
        fuel_moisture_pct=4.0,
        hours=3.0
    )
    
    assert spread["forward_rate_kmh"] > 0.5
    assert spread["forward_distance_km"] > 1.5
    # Downwind azimuth: 45 + 180 = 225 deg (SW)
    assert math.isclose(spread["spread_azimuth_deg"], 225.0, abs_tol=0.5)
    
    # Verify GeoJSON polygon format
    poly = spread["geojson"]
    assert poly["type"] == "Feature"
    assert poly["geometry"]["type"] == "Polygon"
    coords = poly["geometry"]["coordinates"][0]
    assert len(coords) >= 36
    # Polygon must be closed (first pt == last pt)
    assert coords[0] == coords[-1]

def test_settlement_exposure_camp_fire():
    """Verify that Concow and Paradise are correctly flagged as downwind exposed."""
    p_camp = REGIONAL_PROFILES["camp_fire_paradise_ignition"]
    alert = generate_wildfire_alert(
        hotspot_id="CAMP-FIRE-TEST",
        lat=p_camp["latitude"],
        lon=p_camp["longitude"],
        frp_mw=450.0,
        confidence="high",
        hfai_anomaly_band="Extreme",
        weather_override=p_camp,
        slope_deg=p_camp["slope_deg"]
    )
    
    assert alert["alert"]["level"] == "WARNING"
    assert "Paradise" in alert["alert"]["headline"] or "Concow" in alert["alert"]["headline"]
    
    names = [r["name"] for r in alert["exposed_receptors"]]
    assert any("Concow" in n for n in names)
    assert any("Paradise" in n for n in names)
    
    concow = next(r for r in alert["exposed_receptors"] if "Concow" in r["name"])
    assert concow["is_downwind"] is True
    assert concow["distance_km"] < 15.0

def test_api_environmental_endpoints():
    """Verify all new API endpoints respond with 200 OK and valid schemas."""
    # 1. Weather live
    r_w = client.get("/weather/live?lat=23.81&lon=90.41")
    assert r_w.status_code == 200
    assert "fire_danger" in r_w.json()
    assert "fdi" in r_w.json()["fire_danger"]
    
    # 2. Weather profiles
    r_p = client.get("/weather/profiles")
    assert r_p.status_code == 200
    assert "camp_fire_paradise_ignition" in r_p.json()["profiles"]
    
    # 3. Spread prediction
    r_s = client.get("/spread/predict?lat=22.35&lon=92.20&wind_speed=25&wind_dir=180&hours=2")
    assert r_s.status_code == 200
    assert "forward_rate_kmh" in r_s.json()
    assert "geojson" in r_s.json()
    
    # 4. Alerts
    r_a = client.get("/alerts")
    assert r_a.status_code == 200
    assert r_a.json()["total_alerts"] >= 1
    assert "disclaimer" in r_a.json()

