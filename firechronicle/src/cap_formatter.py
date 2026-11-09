"""
cap_formatter.py
================
OASIS Common Alerting Protocol (CAP v1.2) XML Serializer.
Complies with OASIS Standard CAP-V1.2 / ITU-T Rec. X.1303 used by
Google Public Alerts, WMO, and international civil protection agencies.
"""

import xml.etree.ElementTree as ET
from xml.dom import minidom
import datetime
from typing import Dict, Any, List

def build_oasis_cap_xml(alert_dict: Dict[str, Any]) -> str:
    """
    Serializes a BengalFlare alert dictionary into valid OASIS CAP v1.2 XML.
    """
    now_iso = datetime.datetime.now(datetime.timezone.utc).isoformat()
    hotspot_id = alert_dict.get("hotspot_id", "BF-ALERT")
    identifier = f"urn:bengalflare:alert:{hotspot_id}:{int(datetime.datetime.now().timestamp())}"
    
    root = ET.Element("alert", xmlns="urn:oasis:names:tc:emergency:cap:1.2")
    ET.SubElement(root, "identifier").text = identifier
    ET.SubElement(root, "sender").text = "operations@bengalflare.earth"
    ET.SubElement(root, "sent").text = alert_dict.get("timestamp_utc", now_iso)
    ET.SubElement(root, "status").text = "Actual"
    ET.SubElement(root, "msgType").text = "Alert"
    ET.SubElement(root, "scope").text = "Public"
    ET.SubElement(root, "code").text = "IPAWS-CAP-1.2"
    
    # <info> block
    info = ET.SubElement(root, "info")
    ET.SubElement(info, "language").text = "en-US"
    ET.SubElement(info, "category").text = "Fire"
    ET.SubElement(info, "event").text = "Wildfire Threat & Atmospheric Propagation Warning"
    
    # Map Level to Urgency, Severity, Certainty
    level = alert_dict.get("alert", {}).get("level", "ADVISORY")
    env = alert_dict.get("environmental_risk", {})
    act = alert_dict.get("actionable_intelligence", {})
    
    if level == "WARNING":
        urgency = "Immediate"
        severity = "Severe"
        certainty = "Observed"
    elif level == "WATCH":
        urgency = "Expected"
        severity = "Moderate"
        certainty = "Likely"
    else:
        urgency = "Future"
        severity = "Minor"
        certainty = "Possible"
        
    ET.SubElement(info, "urgency").text = urgency
    ET.SubElement(info, "severity").text = severity
    ET.SubElement(info, "certainty").text = certainty
    
    event_code = ET.SubElement(info, "eventCode")
    ET.SubElement(event_code, "valueName").text = "SAME"
    ET.SubElement(event_code, "value").text = "FRW" # Fire Warning
    
    headline = alert_dict.get("alert", {}).get("headline", "BengalFlare Fire Telemetry Alert")
    ET.SubElement(info, "headline").text = headline
    
    # Description from actionable intelligence
    p3 = act.get("pillar_3_meteorological_drivers", {})
    p4 = act.get("pillar_4_threat_corridor", {})
    desc = (
        f"NASA FIRMS thermal anomaly detected. Environmental risk assessment: "
        f"FDI {env.get('fdi', 0)}/100 ({env.get('danger_class', 'Moderate')}). "
        f"{p3.get('summary', '')} "
        f"{p4.get('corridor_summary', '')}"
    )
    ET.SubElement(info, "description").text = desc
    
    # Instruction from actionable directives
    p5 = act.get("pillar_5_tactical_directives", {})
    forest_dirs = p5.get("forest_department", [])
    fire_dirs = p5.get("fire_service", [])
    admin_dirs = p5.get("local_administration_and_public", [])
    instruction_lines = []
    if forest_dirs:
        instruction_lines.append(f"Forest Services: {forest_dirs[0]}")
    if fire_dirs:
        instruction_lines.append(f"Fire Services: {fire_dirs[0]}")
    if admin_dirs:
        instruction_lines.append(f"Public Safety: {admin_dirs[0]}")
    if not instruction_lines:
        instruction_lines.append(alert_dict.get("alert", {}).get("action_statement", "Monitor area."))
    ET.SubElement(info, "instruction").text = " | ".join(instruction_lines)
    
    ET.SubElement(info, "contact").text = "BengalFlare Emergency Earth Observation Operations"
    
    # Parameters
    param_fdi = ET.SubElement(info, "parameter")
    ET.SubElement(param_fdi, "valueName").text = "FosbergFDI"
    ET.SubElement(param_fdi, "value").text = str(env.get("fdi", 0.0))
    
    spread = alert_dict.get("spread_prediction", {})
    param_spread = ET.SubElement(info, "parameter")
    ET.SubElement(param_spread, "valueName").text = "ForwardSpreadRate_kmh"
    ET.SubElement(param_spread, "value").text = str(spread.get("forward_rate_kmh", 1.0))
    
    # Area block with polygon
    coords = alert_dict.get("coordinates", {})
    lat = coords.get("latitude", 22.0)
    lon = coords.get("longitude", 92.0)
    
    area = ET.SubElement(info, "area")
    p1 = act.get("pillar_1_pinpoint_location", {})
    ET.SubElement(area, "areaDesc").text = p1.get("description", f"Vicinity of {lat:.3f}N, {lon:.3f}E")
    
    # Convert GeoJSON polygon coordinates (lon, lat) to CAP polygon format (lat,lon lat,lon ...)
    geojson = spread.get("geojson", {})
    if geojson and "geometry" in geojson and "coordinates" in geojson["geometry"]:
        poly_rings = geojson["geometry"]["coordinates"]
        if poly_rings and len(poly_rings) > 0:
            ring = poly_rings[0]
            # CAP format: "lat,lon lat,lon lat,lon ..."
            cap_poly_str = " ".join([f"{pt[1]:.4f},{pt[0]:.4f}" for pt in ring])
            ET.SubElement(area, "polygon").text = cap_poly_str
            
    # Circle fallback
    reach_km = spread.get("forward_distance_km", 5.0)
    ET.SubElement(area, "circle").text = f"{lat:.4f},{lon:.4f},{reach_km:.1f}"
    
    # Pretty print XML string
    raw_str = ET.tostring(root, encoding="utf-8")
    parsed = minidom.parseString(raw_str)
    return parsed.toprettyxml(indent="  ")

