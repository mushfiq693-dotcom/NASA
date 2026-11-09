import pandas as pd
import numpy as np
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
    df['day_of_year'] = df['local_date'].dt.dayofyear
    
    # Total historical years spanned by the archive (2001-2026 = 26 years)
    num_years = max(1, df['local_date'].dt.year.nunique())
    print(f"Calculating zero-inflated multi-year daily baselines across {num_years} archive years...")
    
    # 1. Vectorized aggregation per grid cell and day of year
    agg = df.groupby(['grid_id', 'day_of_year'])['hfai_smoothed'].agg(
        fire_count='count',
        hfai_sum='sum',
        hfai_sq_sum=lambda x: (x ** 2).sum()
    ).reset_index()
    
    # 2. True zero-inflated mean and standard deviation
    # In unburned years for that cell-doy, HFAI was 0.
    agg['baseline_mean'] = agg['hfai_sum'] / num_years
    var = np.maximum(0.0, (agg['hfai_sq_sum'] / num_years) - (agg['baseline_mean'] ** 2))
    agg['baseline_std'] = np.sqrt(var)
    
    # 3. Exact zero-inflated 90th and 98th percentiles
    agg['baseline_p90'] = 0.0
    agg['baseline_p98'] = 0.0
    
    # In a 26-year archive, groups with fire_count < 2 have P90 = 0 and P98 = 0.
    # Only groups with fire_count >= 2 need quantile estimation.
    active_mask = agg['fire_count'] >= 2
    if active_mask.any():
        active_keys = set(zip(agg.loc[active_mask, 'grid_id'], agg.loc[active_mask, 'day_of_year']))
        sub_df = df[df.set_index(['grid_id', 'day_of_year']).index.isin(active_keys)]
        
        def calc_quantiles(group):
            vals = np.sort(group['hfai_smoothed'].dropna().values)
            m = len(vals)
            if m == 0:
                return (0.0, 0.0)
            n_zeros = num_years - m
            
            # P90
            k90 = 0.90 * (num_years - 1)
            if k90 < n_zeros:
                p90 = 0.0
            else:
                q90 = (k90 - n_zeros) / max(1, m - 1)
                p90 = float(np.quantile(vals, min(1.0, max(0.0, q90))))
                
            # P98
            k98 = 0.98 * (num_years - 1)
            if k98 < n_zeros:
                p98 = 0.0
            else:
                q98 = (k98 - n_zeros) / max(1, m - 1)
                p98 = float(np.quantile(vals, min(1.0, max(0.0, q98))))
                
            return (p90, max(p98, p90))
            
        q_dict = sub_df.groupby(['grid_id', 'day_of_year']).apply(calc_quantiles).to_dict()
        
        p90_vals = []
        p98_vals = []
        for _, row in agg[active_mask].iterrows():
            q = q_dict.get((row['grid_id'], row['day_of_year']), (0.0, 0.0))
            p90_vals.append(q[0])
            p98_vals.append(q[1])
            
        agg.loc[active_mask, 'baseline_p90'] = p90_vals
        agg.loc[active_mask, 'baseline_p98'] = p98_vals

    # Ensure monotonic percentile invariant
    agg['baseline_p98'] = np.maximum(agg['baseline_p98'], agg['baseline_p90'])

    # Clean output columns
    climatology = agg[['grid_id', 'day_of_year', 'baseline_mean', 'baseline_std', 'baseline_p90', 'baseline_p98', 'fire_count']].copy()
    
    # Output to parquet
    output_file = processed_dir / "climatology_baseline.parquet"
    table = pa.Table.from_pandas(climatology)
    pq.write_table(table, output_file)
    print(f"Climatology baseline table saved to {output_file} ({len(climatology):,} cell-days)")
    
    # Audit check: how many rows have baseline_mean == baseline_p90?
    eq_count = (climatology['baseline_mean'] == climatology['baseline_p90']).sum()
    print(f"Audit Metric: Cells where mean == p90 reduced to {eq_count:,} ({eq_count/len(climatology)*100:.2f}%)")
    
    # Calculate regional empirical distribution quantiles for shrinkage prior
    non_null_hfai = df['hfai_smoothed'].dropna()
    regional_summary = {
        "archive_years": int(num_years),
        "total_cell_days": int(len(df)),
        "unique_cells": int(df['grid_id'].nunique()),
        "cells_mean_equals_p90": int(eq_count),
        "sparsity_equality_pct": round(float(eq_count / len(climatology) * 100), 4),
        "regional_quantiles": {
            "p50": round(float(non_null_hfai.quantile(0.50)), 2),
            "p75": round(float(non_null_hfai.quantile(0.75)), 2),
            "p90": round(float(non_null_hfai.quantile(0.90)), 2),
            "p95": round(float(non_null_hfai.quantile(0.95)), 2),
            "p98": round(float(non_null_hfai.quantile(0.98)), 2),
            "p99": round(float(non_null_hfai.quantile(0.99)), 2)
        }
    }
    
    summary_file = reports_dir / "climatology_summary.json"
    import json
    with open(summary_file, 'w') as f:
        json.dump(regional_summary, f, indent=4)
    print(f"Climatology summary saved to {summary_file}")
    
    # Generate distribution plot for the Gate
    plt.figure(figsize=(10, 5))
    non_zero_means = climatology[climatology['baseline_mean'] > 0]['baseline_mean'].dropna()
    non_zero_p90 = climatology[climatology['baseline_p90'] > 0]['baseline_p90'].dropna()
    
    plt.hist(non_zero_means, bins=50, alpha=0.5, label='Baseline Mean (HFAI)', color='blue')
    if len(non_zero_p90) > 0:
        plt.hist(non_zero_p90, bins=50, alpha=0.5, label='Baseline 90th Percentile (HFAI)', color='red')
    
    plt.title('Phase E Validation: Statistical Distribution of Zero-Inflated HFAI Baselines')
    plt.xlabel('HFAI Value')
    plt.ylabel('Frequency (Cell-Days)')
    plt.yscale('log')
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
