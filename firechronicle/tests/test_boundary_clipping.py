import pytest
import pandas as pd
import geopandas as gpd
from pathlib import Path
from src.ingest import run_qa_filtering

def test_boundary_clipping_removes_foreign_points(tmp_path):
    root = Path(__file__).resolve().parent.parent
    boundary_file = root / "metadata" / "BGD_boundary.geojson"
    assert boundary_file.exists(), "BGD_boundary.geojson must exist"
    
    # Test data: 2 inside Bangladesh (Dhaka, Chattogram), 2 outside (Kolkata, Guwahati)
    test_df = pd.DataFrame({
        'observation_id': ['pt-1', 'pt-2', 'pt-3', 'pt-4'],
        'sensor': ['MODIS', 'VIIRS', 'MODIS', 'VIIRS'],
        'platform': ['Terra', 'S-NPP', 'Aqua', 'S-NPP'],
        'latitude': [23.8103, 22.3384, 22.5726, 26.1445],
        'longitude': [90.4125, 91.8365, 88.3639, 91.7362],
        'confidence': ['80', 'nominal', '75', 'high'],
        'type': [0, 0, 0, 0]
    })
    
    filtered_df = run_qa_filtering(test_df, tmp_path, boundary_file=boundary_file)
    
    # pt-1 (Dhaka) and pt-2 (Chattogram) must remain
    # pt-3 (Kolkata) and pt-4 (Guwahati) must be removed
    retained_ids = set(filtered_df['observation_id'].tolist())
    assert retained_ids == {'pt-1', 'pt-2'}, f"Expected only inside points, got: {retained_ids}"

def test_raw_observations_contain_zero_foreign_points():
    root = Path(__file__).resolve().parent.parent
    parquet_file = root / "data" / "interim" / "raw_observation.parquet"
    boundary_file = root / "metadata" / "BGD_boundary.geojson"
    
    assert parquet_file.exists(), "raw_observation.parquet must exist"
    df = pd.read_parquet(parquet_file)
    gdf_boundary = gpd.read_file(boundary_file)
    
    # Sample 1000 points for quick regression check
    sample_df = df.sample(min(1000, len(df)), random_state=42)
    gdf_pts = gpd.GeoDataFrame(
        sample_df,
        geometry=gpd.points_from_xy(sample_df.longitude, sample_df.latitude),
        crs="EPSG:4326"
    )
    
    matched = gpd.sjoin(gdf_pts[['geometry']], gdf_boundary[['geometry']], predicate='within')
    assert len(matched) == len(sample_df), "All sampled observations must fall inside Bangladesh boundary"

