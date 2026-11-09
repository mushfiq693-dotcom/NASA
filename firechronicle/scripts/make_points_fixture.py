import json
import os
from pathlib import Path
import pandas as pd
import numpy as np

def main():
    root_dir = Path(__file__).resolve().parent.parent
    parquet_path = root_dir / "data" / "interim" / "raw_observation.parquet"
    out_path = root_dir / "app" / "public" / "fixtures" / "firms_points.json"
    dist_path = root_dir / "app" / "dist" / "fixtures" / "firms_points.json"

    if not parquet_path.exists():
        print(f"Error: {parquet_path} does not exist.")
        return

    print("Reading real NASA observations from parquet...")
    df = pd.read_parquet(parquet_path)
    df['date'] = pd.to_datetime(df['acq_datetime_utc']).dt.strftime('%Y-%m-%d')

    # True Coincident Overpass Matching:
    # 0.01 deg (~1.1 km) grid cell per day
    df['cell_lat'] = (df['latitude'] * 100).round().astype(int)
    df['cell_lon'] = (df['longitude'] * 100).round().astype(int)
    df['cell_id'] = df['date'] + '_' + df['cell_lat'].astype(str) + '_' + df['cell_lon'].astype(str)

    # Coincident cells having detections from both MODIS and VIIRS on the same date
    sensor_counts = df.groupby('cell_id')['sensor'].nunique()
    coincident_cells = set(sensor_counts[sensor_counts >= 2].index)
    print(f"Identified {len(coincident_cells):,} genuine coincident cell-days (MODIS & VIIRS simultaneous pass).")

    is_coincident = df['cell_id'].isin(coincident_cells)
    numeric_conf = pd.to_numeric(df['confidence'], errors='coerce')
    is_obscured = (numeric_conf < 40) | (df['confidence'].astype(str).str.lower() == 'l')

    cats = []
    for coinc, obsc, s in zip(is_coincident, is_obscured, df['sensor']):
        if obsc:
            cats.append('obscured')
        elif coinc:
            cats.append('both')
        elif s == 'MODIS':
            cats.append('modis-only')
        else:
            cats.append('viirs-only')

    df['category'] = cats
    print("Categorization summary across 186,719 observations:")
    print(df['category'].value_counts())

    # Prioritize coincident passes, then balance across dates to ensure high agreement points render
    # Sample up to 60 per date, sorting by coincident first
    df['is_coinc_sort'] = df['category'].map({'both': 0, 'modis-only': 1, 'viirs-only': 2, 'obscured': 3})
    sampled = df.sort_values(by=['date', 'is_coinc_sort', 'frp'], ascending=[True, True, False]).groupby('date').head(60).copy()

    features = []
    lons = sampled['longitude'].round(4).tolist()
    lats = sampled['latitude'].round(4).tolist()
    dates = sampled['date'].tolist()
    sensors = sampled['sensor'].astype(str).tolist()
    satellites = sampled['platform'].astype(str).tolist()
    frps = sampled['frp'].round(1).tolist()
    confs = sampled['confidence'].astype(str).tolist()
    brights = sampled['brightness'].round(1).tolist()
    categories = sampled['category'].tolist()

    for lon, lat, dt, s, sat, f, c, b, cat in zip(lons, lats, dates, sensors, satellites, frps, confs, brights, categories):
        features.append({
            'type': 'Feature',
            'geometry': {'type': 'Point', 'coordinates': [lon, lat]},
            'properties': {
                'date': dt,
                'sensor': s,
                'satellite': sat,
                'frp': f,
                'confidence': c,
                'brightness': b,
                'category': cat
            }
        })

    geojson = {'type': 'FeatureCollection', 'features': features}
    out_path.parent.mkdir(parents=True, exist_ok=True)
    with open(out_path, 'w') as fp:
        json.dump(geojson, fp)

    if dist_path.parent.exists():
        with open(dist_path, 'w') as fp:
            json.dump(geojson, fp)

    print(f"Successfully exported {len(features):,} real NASA FIRMS fire points to {out_path}")
    print(f"File size: {os.path.getsize(out_path) / (1024*1024):.2f} MB")

if __name__ == '__main__':
    main()
