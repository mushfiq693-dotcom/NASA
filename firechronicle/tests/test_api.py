import pytest
from fastapi.testclient import TestClient
from api.main import app

client = TestClient(app)

def test_api_root():
    response = client.get("/")
    assert response.status_code == 200
    data = response.json()
    assert data["service"] == "BengalFlare API"
    assert data["status"] == "operational"

def test_api_availability():
    response = client.get("/availability")
    assert response.status_code == 200
    data = response.json()
    assert data["status"] == "success"
    assert len(data["platforms"]) >= 5

def test_api_calendar():
    response = client.get("/calendar?aoi=national")
    assert response.status_code == 200
    data = response.json()
    assert "days" in data
    assert len(data["days"]) > 0
    first_day = data["days"][0]
    assert "anomaly_band" in first_day
    assert "observability" in first_day

def test_api_day_detail():
    response = client.get("/day/2022-03-21")
    assert response.status_code == 200
    data = response.json()
    assert data["date"] == "2022-03-21"
    assert "satellite_passes" in data
    assert "why_panel" in data

def test_api_validation():
    response = client.get("/validation")
    assert response.status_code == 200
    data = response.json()
    assert "harmonized_hfai" in data
    assert data["harmonized_hfai"]["pearson_r"] >= 0.92

def test_api_methodology():
    response = client.get("/methodology")
    assert response.status_code == 200
    data = response.json()
    assert "hfai_formula" in data
    assert len(data["scientific_principles"]) >= 5
