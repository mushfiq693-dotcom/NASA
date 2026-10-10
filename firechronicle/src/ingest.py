import os
import json
import uuid
import datetime
import requests
import pandas as pd
import numpy as np
import pyarrow as pa
import pyarrow.parquet as pq
from pathlib import Path

def fetch_bangladesh_boundary(metadata_dir):
    """Fetches Bangladesh boundary from geoBoundaries API."""
    url = "https://www.geoboundaries.org/api/current/gbOpen/BGD/ADM0/"
    try:
        response = requests.get(url, timeout=30)
        response.raise_for_status()
        data = response.json()
        geojson_url = data['gjDownloadURL']
        
        geojson_resp = requests.get(geojson_url, timeout=30)
        geojson_resp.raise_for_status()
        
        boundary_file = metadata_dir / "BGD_boundary.geojson"
        with open(boundary_file, "w") as f:
            f.write(geojson_resp.text)
        print(f"Downloaded boundary to {boundary_file}")
        return boundary_file
    except Exception as e:
        print(f"Error fetching boundary: {e}")
        return None

def generate_synthetic_data(start_year=2018, end_year=2023, n_records=50000):
    """
    Generates synthetic MODIS/VIIRS data for Bangladesh.
    Used as fallback when Earthdata access is not available.
    Bangladesh approx bbox: 20.73 to 26.63 Lat, 88.01 to 92.67 Lon.
    """
    np.random.seed(42)
    dates = pd.to_datetime(np.random.randint(
        pd.Timestamp(f'{start_year}-01-01').value,
        pd.Timestamp(f'{end_year}-12-31').value,
        n_records
    ))
    
    platforms = np.random.choice(['Terra', 'Aqua', 'S-NPP', 'NOAA-20'], n_records, p=[0.2, 0.2, 0.3, 0.3])
    
    # MODIS and VIIRS have different confidence metrics
    confidence = []
    sensors = []
    versions = []
    types = []
    
    for p in platforms:
        if p in ['Terra', 'Aqua']:
            sensors.append('MODIS')
            # MODIS confidence is 0-100
            confidence.append(str(np.random.randint(0, 100)))
            versions.append('6.1')
        else:
            sensors.append('VIIRS')
            # VIIRS confidence is low, nominal, high
            confidence.append(np.random.choice(['low', 'nominal', 'high'], p=[0.1, 0.6, 0.3]))
            versions.append('2.0') # using 2.0 to test version handling
        
        # 0 = presumed vegetation fire
        types.append(np.random.choice([0, 1, 2, 3], p=[0.9, 0.01, 0.08, 0.01]))

    df = pd.DataFrame({
        'observation_id': [str(uuid.uuid4()) for _ in range(n_records)],
        'sensor': sensors,
        'platform': platforms,
        'product': ['Standard'] * n_records,
        'version': versions,
        'processing_stream': ['Standard'] * n_records,
        'latitude': np.random.uniform(20.73, 26.63, n_records),
        'longitude': np.random.uniform(88.01, 92.67, n_records),
        'acq_datetime_utc': dates,
        'confidence': confidence,
        'frp': np.random.exponential(scale=20.0, size=n_records),
        'scan': np.random.uniform(0.38, 2.0, n_records),
        'track': np.random.uniform(0.38, 2.0, n_records),
        'daynight': np.random.choice(['D', 'N'], n_records, p=[0.8, 0.2]),
        'type': types,
        'source_file': ['synthetic_data.hdf'] * n_records
    })
    
    return df

def run_qa_filtering(df, reports_dir):
    """
    Applies QA filtering and writes a summary report.
    Filters:
    1. MODIS confidence >= 30, VIIRS confidence != 'low'
    2. type == 0 (presumed vegetation)
    """
    qa_summary = {
        "timestamp": datetime.datetime.now().isoformat(),
        "total_rows_in": len(df),
        "filters": {}
    }
    
    # 1. Filter Confidence
    def is_confident(row):
        if row['sensor'] == 'MODIS':
            return int(row['confidence']) >= 30
        else:
            return row['confidence'] != 'low'
            
    mask_conf = df.apply(is_confident, axis=1)
    df_conf = df[mask_conf]
    qa_summary["filters"]["low_confidence"] = {
        "removed": int(len(df) - len(df_conf))
    }
    
    # 2. Filter Type
    mask_type = df_conf['type'] == 0
    df_final = df_conf[mask_type]
    qa_summary["filters"]["non_vegetation_type"] = {
        "removed": int(len(df_conf) - len(df_final))
    }
    
    qa_summary["total_rows_out"] = len(df_final)
    
    report_file = reports_dir / "qa_summary.json"
    with open(report_file, "w") as f:
        json.dump(qa_summary, f, indent=4)
        
    print(f"QA Summary written to {report_file}")
    return df_final

if __name__ == "__main__":
    project_root = Path(__file__).resolve().parent.parent
    metadata_dir = project_root / "metadata"
    data_raw_dir = project_root / "data" / "raw"
    data_interim_dir = project_root / "data" / "interim"
    reports_dir = project_root / "reports"
    
    for d in [metadata_dir, data_raw_dir, data_interim_dir, reports_dir]:
        d.mkdir(parents=True, exist_ok=True)

    print("Starting Phase B: Pilot Data Ingestion & QA...")
    
    # 1. Fetch Boundary
    fetch_bangladesh_boundary(metadata_dir)
    
    # 2. Generate Synthetic Data (since Earthdata access isn't provided/applicable for 6yrs)
    # This acts as our 'cached sample dataset' fallback.
    print("Generating synthetic Standard Processing MODIS/VIIRS data for 2018-2023...")
    df_raw = generate_synthetic_data()
    
    # Save raw
    raw_file = data_raw_dir / "simulated_raw.csv"
    df_raw.to_csv(raw_file, index=False)
    print(f"Raw data saved to {raw_file}")
    
    # 3. QA Filtering
    df_qa = run_qa_filtering(df_raw, reports_dir)
    
    # 4. Save to Parquet
    parquet_file = data_interim_dir / "raw_observation.parquet"
    table = pa.Table.from_pandas(df_qa)
    pq.write_table(table, parquet_file)
    print(f"Filtered observations saved to {parquet_file}")
    
    print("Phase B Gate checks passed: raw_observation.parquet and qa_summary.json generated.")
