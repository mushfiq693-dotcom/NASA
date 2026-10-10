import json
import os
from pathlib import Path
import pandas as pd

def main():
    root_dir = Path(__file__).resolve().parent.parent
    parquet_path = root_dir / "data" / "interim" / "raw_observation.parquet"
    out_path = root_dir / "app" / "public" / "fixtures" / "firms_points.json"

    if not parquet_path.exists():
        print(f"Error: {parquet_path} does not exist.")
        return

    print("Reading real NASA observations from parquet...")
    df = pd.read_parquet(parquet_path)
    df['date'] = pd.to_datetime(df['acq_datetime_utc']).dt.strftime('%Y-%m-%d')

    # Sample up to 50 detections per day to cover all 26 years while keeping UI rendering smooth
    sampled = df.groupby('date').head(50).copy()

    features = []
    lons = sampled['longitude'].round(4).tolist()
    lats = sampled['latitude'].round(4).tolist()
    dates = sampled['date'].tolist()
    sensors = sampled['sensor'].astype(str).tolist()
    satellites = sampled['platform'].astype(str).tolist()
    frps = sampled['frp'].round(1).tolist()
    confs = sampled['confidence'].astype(str).tolist()
    brights = sampled['brightness'].round(1).tolist()

    for lon, lat, dt, s, sat, f, c, b in zip(lons, lats, dates, sensors, satellites, frps, confs, brights):
        cat = 'both' if f > 60 else ('modis-only' if s == 'MODIS' else 'viirs-only')
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
    with open(out_path, 'w') as fp:
        json.dump(geojson, fp)

    print(f"Successfully exported {len(features):,} real NASA FIRMS fire points to {out_path}")
    print(f"File size: {os.path.getsize(out_path) / (1024*1024):.2f} MB")

if __name__ == '__main__':
    main()

