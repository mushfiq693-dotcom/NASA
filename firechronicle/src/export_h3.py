import pandas as pd
import geopandas as gpd
import h3
import pyarrow as pa
import pyarrow.parquet as pq
from pathlib import Path
import os
import json

def export_h3(processed_dir, reports_dir):
    input_file = processed_dir / "fire_anomalies.parquet"
    print(f"Reading {input_file}...")
    df = pd.read_parquet(input_file)
    
    # 1. Recover Lat/Lon from EPSG:6933 grid_id
    print("Converting grid_id back to Lat/Lon...")
    # grid_id format: "x_y" where x and y are in km
    grid_coords = df['grid_id'].str.split('_', expand=True)
    df['x_m'] = grid_coords[0].astype(float) * 1000
    df['y_m'] = grid_coords[1].astype(float) * 1000
    
    gdf = gpd.GeoDataFrame(df, geometry=gpd.points_from_xy(df.x_m, df.y_m), crs="EPSG:6933")
    gdf = gdf.to_crs("EPSG:4326")
    
    df['lat'] = gdf.geometry.y
    df['lon'] = gdf.geometry.x
    
    # 2. Convert to H3 Resolution 7
    print("Assigning H3 Resolution 7 indexes...")
    # h3.latlng_to_cell is used in h3-py version 4+
    df['h3_res7'] = df.apply(lambda row: h3.latlng_to_cell(row['lat'], row['lon'], 7), axis=1)
    
    # 3. Aggregate at H3 level
    # We only care about anomalies for visualization or aggregated metrics
    print("Aggregating anomalies at H3 level...")
    # Filter only anomalies for the spatial map layer
    anomalies = df[df['is_anomaly'] == True]
    
    h3_agg = anomalies.groupby(['h3_res7', 'local_date']).agg(
        hfai_smoothed=('hfai_smoothed', 'max'), # Max intensity in that hex
        deviation=('deviation', 'max')
    ).reset_index()
    
    # 4. Save to Parquet
    output_file = processed_dir / "h3_anomalies.parquet"
    # Ensure types
    h3_agg['local_date'] = pd.to_datetime(h3_agg['local_date']).dt.date
    table = pa.Table.from_pandas(h3_agg)
    pq.write_table(table, output_file)
    print(f"H3 Anomalies saved to {output_file}")
    
    # Check size
    file_size_mb = os.path.getsize(output_file) / (1024 * 1024)
    print(f"Gate Check: File size is {file_size_mb:.4f} MB")
    
    # 5. Daily Time-Series Export for Charts
    # Aggregate HFAI smoothed and total raw counts per day for the whole region
    print("Exporting daily time-series for UI charts...")
    timeseries = df.groupby('local_date').agg(
        total_hfai=('hfai_smoothed', 'sum'),
        total_raw_count=('total_raw_count', 'sum')
    ).reset_index()
    timeseries['local_date'] = pd.to_datetime(timeseries['local_date']).dt.strftime('%Y-%m-%d')
    
    ts_file = reports_dir / "time_series.json"
    ts_dict = timeseries.to_dict(orient='records')
    with open(ts_file, 'w') as f:
        json.dump(ts_dict, f)
        
    print(f"Time-series exported to {ts_file}")

if __name__ == "__main__":
    project_root = Path(__file__).resolve().parent.parent
    processed_dir = project_root / "data" / "processed"
    reports_dir = project_root / "reports"
    
    print("Starting Phase G: Export for Visualization...")
    export_h3(processed_dir, reports_dir)
    print("Phase G processing completed.")
