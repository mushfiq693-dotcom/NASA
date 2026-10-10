import pytest
import pandas as pd
import numpy as np
from pathlib import Path
from src.validation import calculate_willmott_d

def test_willmott_agreement():
    obs = np.array([10.0, 20.0, 30.0, 40.0])
    pred = np.array([10.0, 20.0, 30.0, 40.0])
    d = calculate_willmott_d(obs, pred)
    assert np.isclose(d, 1.0)
    
    pred_bad = np.array([40.0, 30.0, 20.0, 10.0])
    d_bad = calculate_willmott_d(obs, pred_bad)
    assert d_bad < 0.5

def test_processed_tables_exist():
    root = Path(__file__).resolve().parent.parent
    proc_dir = root / "data" / "processed"
    rep_dir = root / "reports"
    
    assert (proc_dir / "cell_day.parquet").exists(), "cell_day.parquet must exist"
    assert (proc_dir / "hfai_daily.parquet").exists(), "hfai_daily.parquet must exist"
    assert (proc_dir / "fire_anomalies.parquet").exists(), "fire_anomalies.parquet must exist"
    assert (rep_dir / "validation_summary.json").exists(), "validation_summary.json must exist"
    assert (rep_dir / "time_series.json").exists(), "time_series.json must exist"

def test_no_negative_hfai():
    root = Path(__file__).resolve().parent.parent
    proc_dir = root / "data" / "processed"
    df = pd.read_parquet(proc_dir / "hfai_daily.parquet")
    valid_hfai = df['hfai_smoothed'].dropna()
    assert (valid_hfai >= 0).all(), "HFAI must be non-negative"
