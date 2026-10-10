import pandas as pd
import pyarrow as pa
import pyarrow.parquet as pq
from pathlib import Path
import json

def detect_anomalies(processed_dir, reports_dir):
    hfai_file = processed_dir / "hfai_daily.parquet"
    baseline_file = processed_dir / "climatology_baseline.parquet"
    
    print("Reading HFAI and Baseline tables...")
    df_hfai = pd.read_parquet(hfai_file)
    df_baseline = pd.read_parquet(baseline_file)
    
    # Extract day of year to match baseline
    df_hfai['local_date'] = pd.to_datetime(df_hfai['local_date'])
    df_hfai['day_of_year'] = df_hfai['local_date'].dt.dayofyear
    
    # Merge HFAI with baseline
    print("Merging data to detect anomalies...")
    df = pd.merge(df_hfai, df_baseline, on=['grid_id', 'day_of_year'], how='left')
    
    # Calculate deviation
    # Deviation is the raw difference between current HFAI and the mean baseline
    df['deviation'] = df['hfai_smoothed'] - df['baseline_mean']
    
    # Tag anomalies (using > 90th percentile as rule, and must be > 0 to ignore 0 values)
    # Also require hfai_smoothed > baseline_p90
    df['is_anomaly'] = (df['hfai_smoothed'] > df['baseline_p90']) & (df['hfai_smoothed'] > 0)
    
    # Convert bool to int for parquet compatibility if needed, or keep as bool. Parquet handles bool.
    
    # Save output
    output_file = processed_dir / "fire_anomalies.parquet"
    # Convert date back to simple date for saving if necessary, though timestamp is fine
    df['local_date'] = df['local_date'].dt.date
    table = pa.Table.from_pandas(df)
    pq.write_table(table, output_file)
    print(f"Fire anomalies table saved to {output_file}")
    
    # Gate check: Display top 5 anomalies
    anomalies = df[df['is_anomaly'] == True]
    top5 = anomalies.sort_values(by='deviation', ascending=False).head(5)
    
    top5_report = []
    for _, row in top5.iterrows():
        top5_report.append({
            "grid_id": row['grid_id'],
            "date": str(row['local_date']),
            "hfai": float(row['hfai_smoothed']),
            "baseline_mean": float(row['baseline_mean']),
            "baseline_p90": float(row['baseline_p90']),
            "deviation": float(row['deviation'])
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
