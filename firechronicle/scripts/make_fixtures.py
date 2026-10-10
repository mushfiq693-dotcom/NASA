import os
import json
import pandas as pd
from pathlib import Path
import random

def main():
    root_dir = Path(__file__).resolve().parent.parent
    processed_dir = root_dir / "data" / "processed"
    reports_dir = root_dir / "reports"
    fixtures_dir = root_dir / "app" / "public" / "fixtures"
    
    os.makedirs(fixtures_dir, exist_ok=True)
    
    print("Generating fixtures...")
    
    # 1. Time Series
    ts_file = reports_dir / "time_series.json"
    if ts_file.exists():
        with open(ts_file, 'r') as f:
            ts_data = json.load(f)
        with open(fixtures_dir / "time_series.json", 'w') as f:
            json.dump({"data": ts_data, "source": "real"}, f)
    else:
        # Generate synthetic time series
        ts_data = []
        for d in pd.date_range("2018-01-01", "2023-12-31"):
            ts_data.append({
                "local_date": d.strftime("%Y-%m-%d"),
                "total_hfai": random.uniform(0, 100),
                "total_raw_count": random.randint(0, 500)
            })
        with open(fixtures_dir / "time_series.json", 'w') as f:
            json.dump({"data": ts_data, "source": "synthetic"}, f)

    # 2. Anomalies
    anomalies_file = processed_dir / "h3_anomalies.parquet"
    if anomalies_file.exists():
        try:
            df = pd.read_parquet(anomalies_file)
            df['local_date'] = df['local_date'].astype(str)
            # Just take a subset (e.g. top 500 rows) for fixtures to keep it light
            df_subset = df.head(500)
            with open(fixtures_dir / "anomalies.json", 'w') as f:
                json.dump({"data": df_subset.to_dict(orient="records"), "source": "real"}, f)
        except Exception as e:
            print(f"Error reading anomalies: {e}")
    else:
        # Synthetic anomalies
        syn_anomalies = []
        with open(fixtures_dir / "anomalies.json", 'w') as f:
            json.dump({"data": syn_anomalies, "source": "synthetic"}, f)
            
    # 3. Stats / Summary
    stats = {
        "total_detections_modis": 154320,
        "total_detections_viirs": 432100,
        "missing_platform_days": 14,
        "record_coverage_start": "2018-01-01",
        "record_coverage_end": "2023-12-31"
    }
    with open(fixtures_dir / "stats.json", 'w') as f:
        json.dump({"data": stats, "source": "synthetic"}, f)
        
    print(f"Fixtures written to {fixtures_dir}")

if __name__ == "__main__":
    main()
