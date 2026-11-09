import os
import json
import joblib
import numpy as np
import pandas as pd
from pathlib import Path
from sklearn.model_selection import train_test_split, KFold, cross_val_score
from sklearn.ensemble import HistGradientBoostingRegressor, RandomForestRegressor
from sklearn.linear_model import Ridge
from sklearn.metrics import r2_score, mean_squared_error

def calculate_willmott_d(observed, predicted):
    """Calculates Willmott's index of agreement d (1981)."""
    o_mean = np.mean(observed)
    numerator = np.sum((predicted - observed) ** 2)
    denominator = np.sum((np.abs(predicted - o_mean) + np.abs(observed - o_mean)) ** 2)
    if denominator == 0:
        return 1.0
    return 1.0 - (numerator / denominator)

def prepare_coincident_dataset(processed_dir: Path):
    """
    Extracts coincident overpass data from cell_day.parquet where both
    MODIS and VIIRS observed the same 1 km cell on the same day.
    """
    cell_day_file = processed_dir / "cell_day.parquet"
    if not cell_day_file.exists():
        raise FileNotFoundError(f"Missing {cell_day_file}")

    print(f"Loading cell-day observations from {cell_day_file}...")
    df = pd.read_parquet(cell_day_file)

    modis = df[df['sensor'] == 'MODIS'].copy()
    viirs = df[df['sensor'] == 'VIIRS'].copy()

    # Merge on grid_id and local_date
    overlap = pd.merge(
        modis, viirs,
        on=['grid_id', 'local_date'],
        suffixes=('_modis', '_viirs')
    )
    print(f"Found {len(overlap):,} coincident overpass cell-days.")
    return overlap

def train_and_benchmark_models(processed_dir: Path, reports_dir: Path):
    """
    Trains and benchmarks scikit-learn harmonization models.
    Saves the best model and exports validation metrics to JSON.
    """
    overlap = prepare_coincident_dataset(processed_dir)

    std_features = [
        'raw_count', 'frp_sum', 'frp_mean',
        'frp_max', 'confidence_mean', 'mean_scan', 'mean_track'
    ]
    features_viirs = [f"{col}_viirs" for col in std_features]
    
    X = overlap[features_viirs].fillna(0).copy()
    X.columns = std_features
    y = overlap['frp_sum_modis'].fillna(0)

    # 80/20 train/test split with fixed seed for reproducibility
    X_train, X_test, y_train, y_test = train_test_split(
        X, y, test_size=0.2, random_state=42
    )

    candidate_models = {
        "Ridge_Baseline": Ridge(alpha=1.0),
        "RandomForest": RandomForestRegressor(n_estimators=100, max_depth=12, min_samples_leaf=5, random_state=42, n_jobs=-1),
        "HistGradientBoosting": HistGradientBoostingRegressor(max_iter=150, min_samples_leaf=20, random_state=42)
    }

    results = {}
    best_model_name = None
    best_corr = -1.0

    print("\n=== Benchmarking scikit-learn Harmonization Regressors ===")
    for name, model in candidate_models.items():
        print(f"\nTraining {name} on {len(X_train):,} samples...")
        model.fit(X_train, y_train)
        y_pred = model.predict(X_test)

        r = float(np.corrcoef(y_test, y_pred)[0, 1]) if np.std(y_pred) > 0 else 0.0
        r2 = float(r2_score(y_test, y_pred))
        rmse = float(np.sqrt(mean_squared_error(y_test, y_pred)))
        pbias = float(100.0 * np.sum(y_pred - y_test) / (np.sum(y_test) + 1e-6))
        willmott = float(calculate_willmott_d(y_test.values, y_pred))

        results[name] = {
            "pearson_r": round(r, 4),
            "r2_score": round(r2, 4),
            "rmse_mw": round(rmse, 2),
            "pbias_pct": round(pbias, 2),
            "willmott_d": round(willmott, 4)
        }

        print(f"  [{name}] Pearson r: {r:.4f} | R²: {r2:.4f} | RMSE: {rmse:.2f} MW | PBIAS: {pbias:.2f}% | Willmott d: {willmott:.4f}")

        if r > best_corr:
            best_corr = r
            best_model_name = name

    best_model = candidate_models[best_model_name]
    model_path = processed_dir / "harmonization_model.joblib"
    joblib.dump(best_model, model_path)
    print(f"\nSaved champion model ({best_model_name}) to {model_path}")

    # Write summary report
    report_file = reports_dir / "ml_harmonization_benchmark.json"
    summary = {
        "dataset": "Coincident MODIS/VIIRS Overpasses (2012-2024)",
        "total_coincident_cell_days": len(overlap),
        "train_samples": len(X_train),
        "test_samples": len(X_test),
        "champion_model": best_model_name,
        "features": std_features,
        "models_benchmark": results
    }

    with open(report_file, "w") as f:
        json.dump(summary, f, indent=4)
    print(f"Detailed benchmark metrics written to {report_file}")

    return best_model, summary

if __name__ == "__main__":
    root = Path(__file__).resolve().parent.parent
    proc_dir = root / "data" / "processed"
    rep_dir = root / "reports"
    rep_dir.mkdir(parents=True, exist_ok=True)

    train_and_benchmark_models(proc_dir, rep_dir)
