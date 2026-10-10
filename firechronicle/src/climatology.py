import pandas as pd
import pyarrow as pa
import pyarrow.parquet as pq
import matplotlib.pyplot as plt
from pathlib import Path

def calculate_climatology(processed_dir, reports_dir):
    input_file = processed_dir / "hfai_daily.parquet"
    print(f"Reading {input_file}...")
    df = pd.read_parquet(input_file)
    
    # Ensure date is datetime
    df['local_date'] = pd.to_datetime(df['local_date'])
    
    # Extract day of year for the baseline calculation
    # Using month-day string to handle leap years consistently, or dayofyear
    df['day_of_year'] = df['local_date'].dt.dayofyear
    
    # Calculate baseline (mean and 90th percentile) for each grid cell and day of year
    print("Calculating multi-year daily baselines (mean and 90th percentile)...")
    
    # Since we need 90th percentile, we define a lambda
    def q90(x):
        return x.quantile(0.90)
    
    climatology = df.groupby(['grid_id', 'day_of_year']).agg(
        baseline_mean=('hfai_smoothed', 'mean'),
        baseline_p90=('hfai_smoothed', q90)
    ).reset_index()
    
    # Output to parquet
    output_file = processed_dir / "climatology_baseline.parquet"
    table = pa.Table.from_pandas(climatology)
    pq.write_table(table, output_file)
    print(f"Climatology baseline table saved to {output_file}")
    
    # Generate distribution plot for the Gate
    plt.figure(figsize=(10, 5))
    
    # Plot histogram of baseline means (excluding absolute zeroes for clarity if heavily skewed)
    non_zero_means = climatology[climatology['baseline_mean'] > 0]['baseline_mean'].dropna()
    non_zero_p90 = climatology[climatology['baseline_p90'] > 0]['baseline_p90'].dropna()
    
    plt.hist(non_zero_means, bins=50, alpha=0.5, label='Baseline Mean (HFAI)', color='blue')
    plt.hist(non_zero_p90, bins=50, alpha=0.5, label='Baseline 90th Percentile (HFAI)', color='red')
    
    plt.title('Phase E Validation: Statistical Distribution of HFAI Baselines')
    plt.xlabel('HFAI Value')
    plt.ylabel('Frequency (Cell-Days)')
    plt.yscale('log') # Log scale because fire distributions are heavily right-skewed
    plt.legend()
    plt.grid(True, alpha=0.3)
    plt.tight_layout()
    
    plot_file = reports_dir / "baseline_distribution.png"
    plt.savefig(plot_file)
    print(f"Validation plot saved to {plot_file}")

if __name__ == "__main__":
    project_root = Path(__file__).resolve().parent.parent
    processed_dir = project_root / "data" / "processed"
    reports_dir = project_root / "reports"
    
    print("Starting Phase E: Climatology / Baselines...")
    calculate_climatology(processed_dir, reports_dir)
    print("Phase E processing completed.")
