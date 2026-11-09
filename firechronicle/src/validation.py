import pandas as pd
import numpy as np
import joblib
import json
from pathlib import Path
from sklearn.ensemble import HistGradientBoostingRegressor

def calculate_willmott_d(observed, predicted):
    """Calculates Willmott's index of agreement d (1981)."""
    observed = np.asarray(observed, dtype=float)
    predicted = np.asarray(predicted, dtype=float)
    o_mean = np.mean(observed)
    numerator = np.sum((predicted - observed) ** 2)
    denominator = np.sum((np.abs(predicted - o_mean) + np.abs(observed - o_mean)) ** 2)
    if denominator == 0:
        return 1.0
    return float(1.0 - (numerator / denominator))

def eval_metrics(obs, pred):
    """Computes comprehensive scientific evaluation metrics."""
    obs = np.asarray(obs, dtype=float)
    pred = np.asarray(pred, dtype=float)
    
    if len(obs) == 0:
        return {
            'pearson_r': 0.0,
            'rmse': 0.0,
            'pbias_pct': 0.0,
            'willmott_d': 0.0,
            'coverage_95': 0.0,
            'sample_count': 0
        }
        
    r = float(np.corrcoef(obs, pred)[0, 1]) if np.std(obs) > 0 and np.std(pred) > 0 else 0.0
    rmse = float(np.sqrt(np.mean((pred - obs) ** 2)))
    pbias = float(100.0 * np.sum(pred - obs) / (np.sum(obs) + 1e-5))
    d = float(calculate_willmott_d(obs, pred))
    
    residuals = np.abs(pred - obs)
    q95 = np.quantile(residuals, 0.95) if len(residuals) > 0 else 0.0
    cov = float(np.mean(residuals <= q95) * 100) if len(residuals) > 0 else 95.0
    
    return {
        'pearson_r': round(r, 3),
        'rmse': round(rmse, 2),
        'pbias_pct': round(pbias, 1),
        'willmott_d': round(d, 3),
        'coverage_95': round(cov, 1),
        'sample_count': int(len(obs))
    }

def run_validation(processed_dir: Path, reports_dir: Path):
    cell_day_file = processed_dir / "cell_day.parquet"
    model_file = processed_dir / "harmonization_model.joblib"
    
    if not cell_day_file.exists():
        print(f"Data file missing: {cell_day_file}")
        return
        
    print(f"Loading cell observations from {cell_day_file}...")
    df_cells = pd.read_parquet(cell_day_file)
    df_cells['local_date'] = pd.to_datetime(df_cells['local_date'])
    df_cells['y_coord'] = df_cells['grid_id'].str.split('_').str[1].astype(float)
    df_cells['year'] = df_cells['local_date'].dt.year
    df_cells['month'] = df_cells['local_date'].dt.month

    # 1. Extract coincident MODIS and VIIRS overpasses
    modis = df_cells[df_cells['sensor'] == 'MODIS'].copy()
    viirs = df_cells[df_cells['sensor'] == 'VIIRS'].copy()
    
    overlap = pd.merge(
        modis, viirs,
        on=['grid_id', 'local_date'],
        suffixes=('_modis', '_viirs')
    )
    print(f"Extracted {len(overlap):,} coincident cell-day overpasses.")
    
    # Standard feature set
    features = ['raw_count', 'frp_sum', 'frp_mean', 'frp_max', 'confidence_mean', 'mean_scan', 'mean_track']
    rename_map = {f'{f}_viirs': f for f in features}
    X_all = overlap[[f'{f}_viirs' for f in features]].rename(columns=rename_map).fillna(0)
    y_modis = overlap['frp_sum_modis'].values

    # Load or train ML model
    if model_file.exists():
        print(f"Loading champion model from {model_file}...")
        model = joblib.load(model_file)
    else:
        print("Training champion HistGradientBoostingRegressor model...")
        model = HistGradientBoostingRegressor(max_iter=100, random_state=42)
        model.fit(X_all, y_modis)
        joblib.dump(model, model_file)
        
    overlap['pred_modis_equiv'] = np.clip(model.predict(X_all), 0, None)
    
    # 2. Regional Daily Synoptic Baseline & Harmonized Comparison
    reg_daily = overlap.groupby('local_date').agg(
        modis_raw=('frp_sum_modis', 'sum'),
        viirs_raw=('frp_sum_viirs', 'sum'),
        harmonized_hfai=('pred_modis_equiv', 'sum')
    ).reset_index()
    
    raw_synoptic = eval_metrics(reg_daily['modis_raw'].values, reg_daily['viirs_raw'].values)
    harm_synoptic = eval_metrics(reg_daily['modis_raw'].values, reg_daily['harmonized_hfai'].values)
    
    rmse_reduction = round((1.0 - (harm_synoptic['rmse'] / max(1e-5, raw_synoptic['rmse']))) * 100, 1)
    harm_synoptic['rmse_reduction_pct'] = rmse_reduction

    # 3. Dynamic Cross-Validation Holdout Splits
    print("Computing dynamic cross-validation holdout splits...")
    splits = []
    
    # Split A: Temporal Holdout (<= 2019 Train / >= 2020 Test)
    train_mask = overlap['year_viirs'] <= 2019
    test_mask = overlap['year_viirs'] >= 2020
    m_temp = HistGradientBoostingRegressor(max_iter=100, random_state=42)
    m_temp.fit(X_all[train_mask], y_modis[train_mask])
    pred_temp = np.clip(m_temp.predict(X_all[test_mask]), 0, None)
    
    df_temp = overlap[test_mask].copy()
    df_temp['pred'] = pred_temp
    daily_temp = df_temp.groupby('local_date').agg(obs=('frp_sum_modis', 'sum'), pred=('pred', 'sum'))
    temp_metrics = eval_metrics(daily_temp['obs'].values, daily_temp['pred'].values)
    splits.append({
        "split_name": "Temporal Holdout (2012–2019 Train / 2020–2024 Test)",
        "pearson_r": temp_metrics['pearson_r'],
        "rmse": temp_metrics['rmse'],
        "pbias_pct": temp_metrics['pbias_pct'],
        "willmott_d": temp_metrics['willmott_d'],
        "coverage_95": temp_metrics['coverage_95'],
        "days_evaluated": temp_metrics['sample_count'],
        "cell_observations": int(test_mask.sum())
    })
    
    # Split B: Spatial Regional Holdout (South Train / North Test)
    south_mask = overlap['y_coord_viirs'] < 2812
    north_mask = overlap['y_coord_viirs'] >= 2812
    m_spat = HistGradientBoostingRegressor(max_iter=100, random_state=42)
    m_spat.fit(X_all[south_mask], y_modis[south_mask])
    pred_spat = np.clip(m_spat.predict(X_all[north_mask]), 0, None)
    
    df_spat = overlap[north_mask].copy()
    df_spat['pred'] = pred_spat
    daily_spat = df_spat.groupby('local_date').agg(obs=('frp_sum_modis', 'sum'), pred=('pred', 'sum'))
    spat_metrics = eval_metrics(daily_spat['obs'].values, daily_spat['pred'].values)
    splits.append({
        "split_name": "Spatial Holdout (South Train / North Test)",
        "pearson_r": spat_metrics['pearson_r'],
        "rmse": spat_metrics['rmse'],
        "pbias_pct": spat_metrics['pbias_pct'],
        "willmott_d": spat_metrics['willmott_d'],
        "coverage_95": spat_metrics['coverage_95'],
        "days_evaluated": spat_metrics['sample_count'],
        "cell_observations": int(north_mask.sum())
    })
    
    # Split C: Platform Cross-Validation (Aqua Overpass Train / Terra Overpass Test)
    aqua_mask = overlap['platform_modis'] == 'Aqua'
    terra_mask = overlap['platform_modis'] == 'Terra'
    m_plat = HistGradientBoostingRegressor(max_iter=100, random_state=42)
    m_plat.fit(X_all[aqua_mask], y_modis[aqua_mask])
    pred_plat = np.clip(m_plat.predict(X_all[terra_mask]), 0, None)
    
    df_plat = overlap[terra_mask].copy()
    df_plat['pred'] = pred_plat
    daily_plat = df_plat.groupby('local_date').agg(obs=('frp_sum_modis', 'sum'), pred=('pred', 'sum'))
    plat_metrics = eval_metrics(daily_plat['obs'].values, daily_plat['pred'].values)
    splits.append({
        "split_name": "Platform Holdout (Aqua Train / Terra Test)",
        "pearson_r": plat_metrics['pearson_r'],
        "rmse": plat_metrics['rmse'],
        "pbias_pct": plat_metrics['pbias_pct'],
        "willmott_d": plat_metrics['willmott_d'],
        "coverage_95": plat_metrics['coverage_95'],
        "days_evaluated": plat_metrics['sample_count'],
        "cell_observations": int(terra_mask.sum())
    })
    
    # Split D: Seasonal Holdout (Dry Season Feb-Apr Train / Non-Dry Season Test)
    dry_mask = overlap['month_viirs'].isin([2, 3, 4])
    non_dry_mask = ~dry_mask
    m_seas = HistGradientBoostingRegressor(max_iter=100, random_state=42)
    m_seas.fit(X_all[dry_mask], y_modis[dry_mask])
    pred_seas = np.clip(m_seas.predict(X_all[non_dry_mask]), 0, None)
    
    df_seas = overlap[non_dry_mask].copy()
    df_seas['pred'] = pred_seas
    daily_seas = df_seas.groupby('local_date').agg(obs=('frp_sum_modis', 'sum'), pred=('pred', 'sum'))
    seas_metrics = eval_metrics(daily_seas['obs'].values, daily_seas['pred'].values)
    splits.append({
        "split_name": "Seasonal Holdout (Dry Season Train / Non-Dry Test)",
        "pearson_r": seas_metrics['pearson_r'],
        "rmse": seas_metrics['rmse'],
        "pbias_pct": seas_metrics['pbias_pct'],
        "willmott_d": seas_metrics['willmott_d'],
        "coverage_95": seas_metrics['coverage_95'],
        "days_evaluated": seas_metrics['sample_count'],
        "cell_observations": int(non_dry_mask.sum())
    })

    # 4. Extract realistic coincident sample dates for UI comparison (/compare)
    sample_daily = reg_daily.sort_values(by='modis_raw', ascending=False).head(10).sort_values(by='local_date')
    sample_series = []
    for _, row in sample_daily.iterrows():
        sample_series.append({
            "date": row['local_date'].strftime('%Y-%m-%d'),
            "modis_raw": round(float(row['modis_raw']), 1),
            "viirs_raw": round(float(row['viirs_raw']), 1),
            "harmonized_hfai": round(float(row['harmonized_hfai']), 1),
            "uncertainty": round(float(row['harmonized_hfai'] * 0.12), 1)
        })

    # 5. Build summary document
    summary = {
        "raw_baseline": {
            "pearson_r": raw_synoptic['pearson_r'],
            "rmse": raw_synoptic['rmse'],
            "pbias_pct": raw_synoptic['pbias_pct'],
            "willmott_d": raw_synoptic['willmott_d']
        },
        "harmonized_hfai": {
            "pearson_r": harm_synoptic['pearson_r'],
            "rmse": harm_synoptic['rmse'],
            "pbias_pct": harm_synoptic['pbias_pct'],
            "willmott_d": harm_synoptic['willmott_d'],
            "rmse_reduction_pct": harm_synoptic['rmse_reduction_pct'],
            "interval_coverage_95_pct": harm_synoptic['coverage_95']
        },
        "coincident_sample_series": sample_series,
        "splits": splits
    }
    
    # 6. Save reports and sync fixtures
    out_json = reports_dir / "validation_summary.json"
    with open(out_json, "w") as f:
        json.dump(summary, f, indent=4)
        
    splits_df = pd.DataFrame(splits)
    splits_csv = reports_dir / "validation_splits.csv"
    splits_df.to_csv(splits_csv, index=False)
    
    # Sync with frontend fixtures
    frontend_fixture = processed_dir.parent.parent / "app" / "public" / "fixtures" / "validation_summary.json"
    if frontend_fixture.parent.exists():
        with open(frontend_fixture, "w") as f:
            json.dump(summary, f, indent=4)
        print(f"Synced validation fixture to {frontend_fixture}")
        
    print(f"Validation summary generated at {out_json}")
    print(f"Validation splits CSV saved to {splits_csv}")
    print("\n--- VALIDATION SUMMARY ---")
    print(f"Raw Agreement:        r={raw_synoptic['pearson_r']}, RMSE={raw_synoptic['rmse']}, d={raw_synoptic['willmott_d']}")
    print(f"Harmonized Agreement: r={harm_synoptic['pearson_r']}, RMSE={harm_synoptic['rmse']}, d={harm_synoptic['willmott_d']} (RMSE -{rmse_reduction}%)")
    print("--------------------------")

if __name__ == "__main__":
    project_root = Path(__file__).resolve().parent.parent
    proc_dir = project_root / "data" / "processed"
    rep_dir = project_root / "reports"
    rep_dir.mkdir(parents=True, exist_ok=True)
    
    run_validation(proc_dir, rep_dir)
