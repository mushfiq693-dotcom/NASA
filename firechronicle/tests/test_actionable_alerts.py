import pytest
import xml.etree.ElementTree as ET
from fastapi.testclient import TestClient
from api.main import app
from src.environmental import (
    predict_fire_spread,
    compute_fire_danger_index,
    get_hybrid_climatology_multiplier,
    REGIONAL_PROFILES
)
from src.alert_engine import generate_wildfire_alert, format_actionable_intelligence
from src.cap_formatter import build_oasis_cap_xml
from src.dispatcher import dispatch_all_channels

client = TestClient(app)

def test_actionable_intelligence_has_5_pillars():
    """Verify Phase 1: Every alert contains the 5 mandatory actionable intelligence pillars."""
    p = REGIONAL_PROFILES["camp_fire_paradise_ignition"]
    alert = generate_wildfire_alert(
        hotspot_id="TEST-ACTION-01",
        lat=p["latitude"],
        lon=p["longitude"],
        frp_mw=450.0,
        confidence="high",
        hfai_anomaly_band="Extreme",
        weather_override=p,
        slope_deg=p["slope_deg"]
    )
    
    assert "actionable_intelligence" in alert, "Alert must contain actionable_intelligence"
    act = alert["actionable_intelligence"]
    
    # Pillar 1: Pinpoint Location
    assert "pillar_1_pinpoint_location" in act
    assert "coordinates" in act["pillar_1_pinpoint_location"]
    assert "nearest_landmark" in act["pillar_1_pinpoint_location"]
    
    # Pillar 2: Severity Assessment
    assert "pillar_2_severity" in act
    assert "LEVEL 3: RED FLAG WARNING" in act["pillar_2_severity"]["tier"]
    
    # Pillar 3: Meteorological Drivers
    assert "pillar_3_meteorological_drivers" in act
    assert "summary" in act["pillar_3_meteorological_drivers"]
    assert act["pillar_3_meteorological_drivers"]["wind_speed_kmh"] > 0
    
    # Pillar 4: Threat Corridor & Impact Timeline
    assert "pillar_4_threat_corridor" in act
    assert "downwind_communities" in act["pillar_4_threat_corridor"]
    assert "corridor_summary" in act["pillar_4_threat_corridor"]
    
    # Pillar 5: Role-Specific Directives
    assert "pillar_5_tactical_directives" in act
    directives = act["pillar_5_tactical_directives"]
    assert "forest_department" in directives and len(directives["forest_department"]) > 0
    assert "fire_service" in directives and len(directives["fire_service"]) > 0
    assert "local_administration_and_public" in directives and len(directives["local_administration_and_public"]) > 0
    
    # Dispatch strings
    assert "dispatch_payloads" in act
    assert len(act["dispatch_payloads"]["sms_text"]) > 20
    assert len(act["dispatch_payloads"]["telegram_markdown"]) > 50

def test_hybrid_engine_climatology_calibration():
    """Verify Phase 2: Hybrid spread engine applies climatology calibration."""
    # 1. Extreme dry fuel condition
    mult_dry, reason_dry = get_hybrid_climatology_multiplier(39.8, -121.4, fuel_moisture_pct=2.2)
    assert mult_dry == 1.25, "Acute dry fuel threshold must trigger +25% crown fire amplification"
    
    # 2. Bangladesh area with unburned biomass or historical continuity
    mult_bd, reason_bd = get_hybrid_climatology_multiplier(22.35, 92.20, fuel_moisture_pct=8.0)
    assert mult_bd >= 0.8 and mult_bd <= 1.35, "Bangladesh grid multiplier must be bounded in [0.8, 1.35]"
    
    # 3. Spread prediction records both physics and calibrated rate
    spread = predict_fire_spread(
        origin_lat=22.35,
        origin_lon=92.20,
        wind_speed_kmh=25.0,
        wind_dir_deg=200.0,
        fuel_moisture_pct=6.0,
        slope_deg=2.0,
        hours=3.0
    )
    assert "physics_base_rate_kmh" in spread
    assert "hybrid_multiplier" in spread
    assert spread["forward_rate_kmh"] > 0

def test_oasis_cap_xml_generation():
    """Verify Phase 3: Generates valid OASIS CAP v1.2 XML."""
    p = REGIONAL_PROFILES["camp_fire_paradise_ignition"]
    alert = generate_wildfire_alert(
        hotspot_id="TEST-CAP-01",
        lat=p["latitude"],
        lon=p["longitude"],
        frp_mw=350.0,
        confidence="high",
        hfai_anomaly_band="Extreme",
        weather_override=p
    )
    xml_str = build_oasis_cap_xml(alert)
    
    assert xml_str.startswith("<?xml")
    assert "urn:oasis:names:tc:emergency:cap:1.2" in xml_str
    
    # Verify XML can be parsed by standard XML parser
    root = ET.fromstring(xml_str)
    assert root.tag.endswith("alert")
    
    # Verify API endpoint returns XML
    res = client.get("/alerts/cap.xml")
    assert res.status_code == 200
    assert "application/xml" in res.headers["content-type"]
    assert "urn:oasis:names:tc:emergency:cap:1.2" in res.text

def test_actionable_and_dispatch_api_endpoints():
    """Verify Phase 4: Actionable API feed and Multi-Channel Dispatch endpoint."""
    # 1. Actionable alerts endpoint
    res_act = client.get("/alerts/actionable")
    assert res_act.status_code == 200
    data_act = res_act.json()
    assert data_act["status"] == "success"
    assert len(data_act["alerts"]) > 0
    assert "actionable_intelligence" in data_act["alerts"][0]
    
    # 2. Dispatch endpoint (Simulation mode)
    res_disp = client.post("/alerts/dispatch", json={})
    assert res_disp.status_code == 200
    data_disp = res_disp.json()
    assert data_disp["status"] == "success"
    report = data_disp["dispatch_report"]
    assert "channels" in report
    assert report["channels"]["telegram"]["status"] in ["delivered", "simulated"]
    assert report["channels"]["sms"]["status"] in ["delivered", "simulated"]
    assert report["channels"]["webhook"]["status"] in ["delivered", "simulated"]

