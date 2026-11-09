import pytest
import json
from pathlib import Path
from fastapi.testclient import TestClient
from api.main import app

client = TestClient(app)

def test_validation_summary_metrics():
    """Verify dynamic validation summary exists and satisfies target KPIs."""
    root = Path(__file__).resolve().parent.parent
    val_json = root / "reports" / "validation_summary.json"
    splits_csv = root / "reports" / "validation_splits.csv"
    
    assert val_json.exists(), "validation_summary.json must exist in reports"
    assert splits_csv.exists(), "validation_splits.csv must exist in reports"
    
    with open(val_json, "r") as f:
        data = json.load(f)
        
    assert "raw_baseline" in data
    assert "harmonized_hfai" in data
    assert "splits" in data
    assert "coincident_sample_series" in data
    
    harm = data["harmonized_hfai"]
    raw = data["raw_baseline"]
    
    # Mathematical bounds
    assert -1.0 <= harm["pearson_r"] <= 1.0
    assert 0.0 <= harm["willmott_d"] <= 1.0
    assert harm["rmse"] > 0
    
    # Scientific target KPIs
    assert harm["pearson_r"] >= 0.92, f"Target r >= 0.92, got {harm['pearson_r']}"
    assert harm["willmott_d"] >= 0.95, f"Target d >= 0.95, got {harm['willmott_d']}"
    assert abs(harm["pbias_pct"]) <= 5.0, f"Target |PBIAS| <= 5%, got {harm['pbias_pct']}"
    assert harm["rmse"] < raw["rmse"], "Harmonized RMSE must be lower than raw RMSE"
    assert harm["rmse_reduction_pct"] > 30.0, "RMSE reduction must exceed 30%"
    assert harm["interval_coverage_95_pct"] >= 90.0, "95% coverage must be at least 90%"

def test_validation_splits_completeness():
    """Verify all 4 cross-validation holdout splits are evaluated dynamically."""
    root = Path(__file__).resolve().parent.parent
    val_json = root / "reports" / "validation_summary.json"
    
    with open(val_json, "r") as f:
        data = json.load(f)
        
    splits = data["splits"]
    assert len(splits) == 4, f"Expected 4 cross-validation splits, got {len(splits)}"
    
    split_names = [s["split_name"] for s in splits]
    assert any("Temporal" in name for name in split_names)
    assert any("Spatial" in name for name in split_names)
    assert any("Platform" in name for name in split_names)
    assert any("Seasonal" in name for name in split_names)
    
    for s in splits:
        assert s["days_evaluated"] > 0, "Holdout split must evaluate at least 1 day"
        assert s["cell_observations"] > 0, "Holdout split must evaluate cell observations"
        assert -1.0 <= s["pearson_r"] <= 1.0
        assert 0.0 <= s["willmott_d"] <= 1.0

def test_api_validation_endpoint():
    """Verify /validation API returns real dynamic metrics."""
    response = client.get("/validation")
    assert response.status_code == 200
    data = response.json()
    assert "harmonized_hfai" in data
    assert data["harmonized_hfai"]["pearson_r"] >= 0.92
    assert len(data["splits"]) == 4

def test_api_compare_endpoint():
    """Verify /compare API returns real coincident overpass comparison series."""
    response = client.get("/compare")
    assert response.status_code == 200
    data = response.json()
    assert "series" in data
    assert len(data["series"]) > 0
    
    first = data["series"][0]
    assert "date" in first
    assert "modis_raw" in first
    assert "viirs_raw" in first
    assert "harmonized_hfai" in first
    assert first["modis_raw"] > 0
    assert first["viirs_raw"] > 0
    assert first["harmonized_hfai"] > 0

