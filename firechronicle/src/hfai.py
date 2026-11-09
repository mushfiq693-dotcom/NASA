import pandas as pd
import numpy as np
import joblib
import pyarrow as pa
import pyarrow.parquet as pq
import matplotlib.pyplot as plt
from pathlib import Path

def calculate_hfai(processed_dir, reports_dir):
    input_file = processed_dir / "cell_day.parquet"
    print(f"Reading {input_file}...")
    df = pd.read_parquet(input_file)
    
    # 1. Base HFAI Calculation using trained scikit-learn Harmonization Model
    model_path = processed_dir / "harmonization_model.joblib"
    calc_df = df.copy()
    calc_df['calc_count'] = calc_df['raw_count'].fillna(0)
    calc_df['calc_frp'] = calc_df['frp_sum'].fillna(0)
    
    if model_path.exists():
        print(f"Applying trained scikit-learn model from {model_path}...")
        model = joblib.load(model_path)
        
        # MODIS: baseline reference energy (FRP sum in MW)
        modis_mask = calc_df['sensor'] == 'MODIS'
        calc_df.loc[modis_mask, 'hfai_base'] = calc_df.loc[modis_mask, 'calc_frp']
        
        # VIIRS: calibrated MODIS-equivalent energy using scikit-learn ML model
        viirs_mask = calc_df['sensor'] == 'VIIRS'
        features = ['raw_count', 'frp_sum', 'frp_mean', 'frp_max', 'confidence_mean', 'mean_scan', 'mean_track']
        X_viirs = calc_df.loc[viirs_mask, features].fillna(0)
        pred_energy = model.predict(X_viirs)
        calc_df.loc[viirs_mask, 'hfai_base'] = np.clip(pred_energy, 0, None)
    else:
        print("Warning: harmonization_model.joblib not found. Using fallback mapping...")
        calc_df['sensor_weight'] = calc_df['sensor'].apply(lambda s: 1.0 if s == 'MODIS' else 0.25)
        calc_df['hfai_base'] = calc_df['calc_count'] * calc_df['sensor_weight'] * calc_df['calc_frp']
        
    # Set hfai_base to NaN where data is genuinely missing
    calc_df.loc[calc_df['observation_status'].isin(['KNOWN_OUTAGE', 'MISSING_PRODUCT']), 'hfai_base'] = np.nan
    
    # 2. Combine sensors per grid-day (Cross-Sensor Overpass Deduplication)
    # Use max energy on coincident overpasses to prevent artificial double-counting
    grid_day = calc_df.groupby(['grid_id', 'local_date']).agg(
        total_raw_count=('calc_count', 'max'),
        hfai_base=('hfai_base', 'max')
    ).reset_index()
    
    # 3. Temporal Smoothing (7-day rolling average per grid_id)
    # Sort by date for rolling
    grid_day['local_date'] = pd.to_datetime(grid_day['local_date'])
    grid_day = grid_day.sort_values(by=['grid_id', 'local_date'])
    
    # Apply rolling window
    print("Applying 7-day temporal smoothing...")
    # set index to date for rolling, group by grid_id
    grid_day = grid_day.set_index('local_date')
    
    # We use a 7-day window. min_periods=1 means it will compute even if some days are missing/NaN
    smoothed = grid_day.groupby('grid_id')['hfai_base'].rolling('7D', min_periods=1).mean().reset_index()
    smoothed = smoothed.rename(columns={'hfai_base': 'hfai_smoothed'})
    
    # Merge back
    grid_day = grid_day.reset_index()
    hfai_daily = pd.merge(grid_day, smoothed, on=['grid_id', 'local_date'])
    
    # 4. Save to parquet
    output_file = processed_dir / "hfai_daily.parquet"
    # Ensure types are correct for parquet
    hfai_daily['local_date'] = hfai_daily['local_date'].dt.date
    table = pa.Table.from_pandas(hfai_daily)
    pq.write_table(table, output_file)
    print(f"HFAI daily table saved to {output_file}")
    
    # 5. Generate validation plot (Regional Aggregation)
    regional = hfai_daily.groupby('local_date').agg(
        sum_raw_count=('total_raw_count', 'sum'),
        sum_hfai_base=('hfai_base', 'sum'),
        sum_hfai_smoothed=('hfai_smoothed', 'sum')
    ).reset_index()
    
    # Ensure date is datetime for plotting
    regional['local_date'] = pd.to_datetime(regional['local_date'])
    regional = regional.sort_values('local_date')
    
    plt.figure(figsize=(12, 6))
    
    # Plot raw count vs smoothed HFAI
    # Since scales differ, we'll use twin axes or normalize
    # Normalizing just for visual comparison of the curves
    max_raw = regional['sum_raw_count'].max() or 1
    max_hfai = regional['sum_hfai_smoothed'].max() or 1
    
    plt.plot(regional['local_date'], regional['sum_raw_count'] / max_raw, 
             alpha=0.3, label='Raw Fire Counts (Normalized)', color='gray', marker='.')
             
    plt.plot(regional['local_date'], regional['sum_hfai_smoothed'] / max_hfai, 
             alpha=0.9, label='Smoothed HFAI (Normalized)', color='red', linewidth=2)
             
    plt.title('Phase D Validation: Raw Fire Counts vs 7-Day Smoothed HFAI')
    plt.xlabel('Date')
    plt.ylabel('Normalized Intensity')
    plt.legend()
    plt.grid(True, alpha=0.3)
    plt.tight_layout()
    
    plot_file = reports_dir / "hfai_smoothing_demo.png"
    plt.savefig(plot_file)
    print(f"Validation plot saved to {plot_file}")

if __name__ == "__main__":
    project_root = Path(__file__).resolve().parent.parent
    processed_dir = project_root / "data" / "processed"
    reports_dir = project_root / "reports"
    
    print("Starting Phase D: HFAI Calculation & Smoothing...")
    calculate_hfai(processed_dir, reports_dir)
    print("Phase D processing completed.")
