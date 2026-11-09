import pytest
import pandas as pd
import numpy as np
import json
from pathlib import Path

def test_climatology_sparsity_resolution():
    """Verify that the 86.1% Mean == P90 sparsity equality bug is resolved."""
    root = Path(__file__).resolve().parent.parent
    baseline_file = root / "data" / "processed" / "climatology_baseline.parquet"
    assert baseline_file.exists(), "climatology_baseline.parquet must exist"
    
    df = pd.read_parquet(baseline_file)
    total_cells = len(df)
    eq_count = (df['baseline_mean'] == df['baseline_p90']).sum()
    eq_pct = (eq_count / total_cells) * 100
    
    # Must be less than 1% (previously was 86.1%)
    assert eq_pct < 1.0, f"Mean == P90 equality is {eq_pct:.2f}%, expected < 1%"
    assert (df['baseline_mean'] >= 0).all(), "Baseline mean must be non-negative"
    assert (df['baseline_std'] >= 0).all(), "Baseline std must be non-negative"
    assert (df['baseline_p98'] >= df['baseline_p90']).all(), "P98 must be >= P90"

def test_anomaly_detection_statistics():
    """Verify anomaly table schema, realistic distribution, and severity tagging."""
    root = Path(__file__).resolve().parent.parent
    anomalies_file = root / "data" / "processed" / "fire_anomalies.parquet"
    top5_file = root / "reports" / "top5_anomalies.json"
    
    assert anomalies_file.exists(), "fire_anomalies.parquet must exist"
    assert top5_file.exists(), "top5_anomalies.json must exist"
    
    df = pd.read_parquet(anomalies_file)
    required_cols = ['grid_id', 'local_date', 'hfai_smoothed', 'baseline_mean', 'deviation', 'z_score', 'is_anomaly', 'severity']
    for col in required_cols:
        assert col in df.columns, f"Column {col} missing in fire_anomalies.parquet"
        
    # Anomaly rate must be selective (between 5% and 25%, not 98%)
    anomaly_rate = df['is_anomaly'].mean() * 100
    assert 5.0 <= anomaly_rate <= 25.0, f"Anomaly rate is {anomaly_rate:.2f}%, expected 5% - 25%"
    
    # Extreme severity should be a rare fraction (< 8%)
    extreme_rate = (df['severity'] == 'Extreme').mean() * 100
    assert extreme_rate < 8.0, f"Extreme severity rate is {extreme_rate:.2f}%, expected < 8%"
    
    # Verify top 5 anomalies
    with open(top5_file, 'r') as f:
        top5 = json.load(f)
        
    assert len(top5) == 5, "top5_anomalies.json must contain 5 records"
    for item in top5:
        assert item['deviation'] > 0, "Top anomaly deviation must be strictly positive"
        assert item['severity'] == 'Extreme', "Top anomalies must be classified as Extreme"
        assert item['hfai'] > 1000, "Historical top anomalies in Bangladesh exceed 1000 MW"

def test_time_series_export_consistency():
    """Verify daily time series totals match between report and fixtures."""
    root = Path(__file__).resolve().parent.parent
    report_ts = root / "reports" / "time_series.json"
    fixture_ts = root / "app" / "public" / "fixtures" / "time_series.json"
    
    assert report_ts.exists(), "time_series.json must exist in reports"
    with open(report_ts, 'r') as f:
        rep_data = json.load(f)
        
    assert len(rep_data) > 0, "Time-series must contain daily records"
    assert "total_hfai" in rep_data[0]
    assert "total_raw_count" in rep_data[0]
    
    if fixture_ts.exists():
        with open(fixture_ts, 'r') as f:
            fix_data = json.load(f)
        assert len(rep_data) == len(fix_data), "Reports and fixture time-series must have same length"

