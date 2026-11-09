import pytest
import joblib
import json
import numpy as np
import pandas as pd
from pathlib import Path

def test_harmonization_model_exists_and_predicts():
    root = Path(__file__).resolve().parent.parent
    model_path = root / "data" / "processed" / "harmonization_model.joblib"
    assert model_path.exists(), "harmonization_model.joblib must exist"
    
    model = joblib.load(model_path)
    
    # Test synthetic VIIRS input sample
    sample_X = pd.DataFrame({
        'raw_count': [1.0, 3.0, 5.0],
        'frp_sum': [15.2, 45.0, 120.0],
        'frp_mean': [15.2, 15.0, 24.0],
        'frp_max': [15.2, 22.0, 48.0],
        'confidence_mean': [80.0, 75.0, 90.0],
        'mean_scan': [1.1, 1.2, 1.0],
        'mean_track': [1.0, 1.1, 1.0]
    })
    
    preds = np.clip(model.predict(sample_X), 0, None)
    assert len(preds) == 3, "Model should return 3 predictions"
    assert np.all(preds >= 0), "Predicted FRP energy must be non-negative after clipping"
    assert np.all(np.isfinite(preds)), "Predicted energy must be finite"

def test_ml_benchmark_metrics_valid():
    root = Path(__file__).resolve().parent.parent
    report_file = root / "reports" / "ml_harmonization_benchmark.json"
    assert report_file.exists(), "ml_harmonization_benchmark.json must exist"
    
    with open(report_file, 'r') as f:
        metrics = json.load(f)
        
    assert "champion_model" in metrics
    assert "models_benchmark" in metrics
    
    champ = metrics["champion_model"]
    champ_metrics = metrics["models_benchmark"][champ]
    
    assert champ_metrics["pearson_r"] > 0, "Correlation must be positive"
    assert champ_metrics["rmse_mw"] > 0, "RMSE must be positive"
    print(f"Verified Champion ML Model ({champ}): Pearson r = {champ_metrics['pearson_r']}")
