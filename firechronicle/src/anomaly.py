import pandas as pd
import numpy as np
import pyarrow as pa
import pyarrow.parquet as pq
from pathlib import Path
import json

def detect_anomalies(processed_dir, reports_dir):
    hfai_file = processed_dir / "hfai_daily.parquet"
    baseline_file = processed_dir / "climatology_baseline.parquet"
    summary_file = reports_dir / "climatology_summary.json"
    
    print("Reading HFAI and Baseline tables...")
    df_hfai = pd.read_parquet(hfai_file)
    df_baseline = pd.read_parquet(baseline_file)
    
    # Read empirical regional quantiles if available, otherwise compute dynamically
    p90_regional = 108.6
    p98_regional = 246.9
    if summary_file.exists():
        try:
            with open(summary_file, 'r') as f:
                c_sum = json.load(f)
                p90_regional = float(c_sum.get("regional_quantiles", {}).get("p90", p90_regional))
                p98_regional = float(c_sum.get("regional_quantiles", {}).get("p98", p98_regional))
            print(f"Loaded regional priors: P90={p90_regional:.1f} MW, P98={p98_regional:.1f} MW")
        except Exception as e:
            print(f"Using default regional priors: {e}")
            
    # Extract day of year to match baseline
    df_hfai['local_date'] = pd.to_datetime(df_hfai['local_date'])
    df_hfai['day_of_year'] = df_hfai['local_date'].dt.dayofyear
    
    # Merge HFAI with baseline
    print("Merging data to detect anomalies...")
    df = pd.merge(df_hfai, df_baseline, on=['grid_id', 'day_of_year'], how='left')
    
    # Fill missing baseline statistics with 0
    df['baseline_mean'] = df['baseline_mean'].fillna(0.0)
    df['baseline_std'] = df['baseline_std'].fillna(0.0)
    df['baseline_p90'] = df['baseline_p90'].fillna(0.0)
    df['baseline_p98'] = df['baseline_p98'].fillna(0.0)
    df['fire_count'] = df['fire_count'].fillna(0).astype(int)
    
    # Clean HFAI smoothed values
    df['hfai_clean'] = df['hfai_smoothed'].fillna(0.0)
    
    # Calculate physical deviation from zero-inflated baseline mean
    df['deviation'] = df['hfai_clean'] - df['baseline_mean']
    
    # Calculate Z-score with safe denominator (epsilon = 0.5 MW)
    std_safe = np.maximum(0.5, df['baseline_std'])
    df['z_score'] = np.round(df['deviation'] / std_safe, 2)
    
    # Empirical Bayes Shrinkage for sparse cells:
    # If a cell has fewer than 3 historical fires on that calendar day, sample percentiles
    # are uninformative (P90 collapses to 0). In those cases, shrink threshold to the regional prior.
    has_local_history = df['fire_count'] >= 3
    effective_p90 = np.where(has_local_history & (df['baseline_p90'] > 0), df['baseline_p90'], p90_regional)
    effective_p98 = np.where(has_local_history & (df['baseline_p98'] > 0), df['baseline_p98'], p98_regional)
    
    df['effective_p90'] = effective_p90
    df['effective_p98'] = effective_p98
    
    # Anomaly criterion:
    # 1. Significantly exceeds effective 90th percentile baseline
    # 2. Minimum physical significance (HFAI >= 15.0 MW) to eliminate micro-smoke noise
    df['is_anomaly'] = (df['hfai_clean'] > df['effective_p90']) & (df['hfai_clean'] >= 15.0)
    
    # Assign severity bands:
    # - Extreme: exceeds P98 threshold
    # - High: exceeds P90 threshold (and not Extreme)
    # - Normal: within expected seasonal range
    cond_extreme = df['is_anomaly'] & (df['hfai_clean'] >= df['effective_p98'])
    cond_high = df['is_anomaly'] & ~cond_extreme
    
    df['severity'] = np.select(
        [cond_extreme, cond_high],
        ['Extreme', 'High'],
        default='Normal'
    )
    
    # Drop intermediate clean column to maintain clean schema
    df = df.drop(columns=['hfai_clean'])
    
    # Save output
    output_file = processed_dir / "fire_anomalies.parquet"
    df['local_date'] = df['local_date'].dt.date
    table = pa.Table.from_pandas(df)
    pq.write_table(table, output_file)
    print(f"Fire anomalies table saved to {output_file} ({len(df):,} records)")
    print(f"  Total Anomalies Flagged: {df['is_anomaly'].sum():,} ({df['is_anomaly'].mean()*100:.2f}%)")
    print(f"  - Extreme: {(df['severity'] == 'Extreme').sum():,} ({(df['severity'] == 'Extreme').mean()*100:.2f}%)")
    print(f"  - High: {(df['severity'] == 'High').sum():,} ({(df['severity'] == 'High').mean()*100:.2f}%)")
    print(f"  - Normal Seasonal: {(df['severity'] == 'Normal').sum():,} ({(df['severity'] == 'Normal').mean()*100:.2f}%)")
    
    # Gate check: Display top 5 anomalies
    anomalies = df[df['is_anomaly'] == True]
    top5 = anomalies.sort_values(by='deviation', ascending=False).head(5)
    
    top5_report = []
    for _, row in top5.iterrows():
        top5_report.append({
            "grid_id": row['grid_id'],
            "date": str(row['local_date']),
            "hfai": round(float(row['hfai_smoothed']), 2),
            "baseline_mean": round(float(row['baseline_mean']), 2),
            "baseline_p90": round(float(row['baseline_p90']), 2),
            "effective_p90": round(float(row['effective_p90']), 2),
            "deviation": round(float(row['deviation']), 2),
            "z_score": round(float(row['z_score']), 2),
            "severity": row['severity']
        })
        
    report_file = reports_dir / "top5_anomalies.json"
    with open(report_file, 'w') as f:
        json.dump(top5_report, f, indent=4)
        
    print("\n--- TOP 5 ANOMALIES ---")
    print(json.dumps(top5_report, indent=4))
    print("-----------------------")

if __name__ == "__main__":
    project_root = Path(__file__).resolve().parent.parent
    processed_dir = project_root / "data" / "processed"
    reports_dir = project_root / "reports"
    
    print("Starting Phase F: Anomaly Detection...")
    detect_anomalies(processed_dir, reports_dir)
    print("Phase F processing completed.")
