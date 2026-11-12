"""
database.py
===========
High-Performance DuckDB Columnar Analytical Engine for BengalFlare.
Manages persistent multi-decadal NASA Earth Observation records (MODIS & VIIRS).
"""

from pathlib import Path
from typing import Dict, Any, List, Optional
import duckdb

PROJECT_ROOT = Path(__file__).resolve().parent.parent
DATA_DIR = PROJECT_ROOT / "data"
DB_PATH = DATA_DIR / "bengalflare.duckdb"

MODIS_CSV = PROJECT_ROOT.parent / "DL_FIRE_M-C61_820366" / "fire_archive_M-C61_820366.csv"
VIIRS_CSV = PROJECT_ROOT.parent / "DL_FIRE_SV-C2_820367" / "fire_archive_SV-C2_820367.csv"

def get_connection(read_only: bool = True) -> duckdb.DuckDBPyConnection:
    """Returns an active DuckDB database connection."""
    DATA_DIR.mkdir(parents=True, exist_ok=True)
    if not DB_PATH.exists() and read_only:
        # Initialize if missing
        initialize_database()
    return duckdb.connect(str(DB_PATH), read_only=read_only)

def initialize_database() -> None:
    """Creates tables and ingests NASA satellite archives into DuckDB."""
    DATA_DIR.mkdir(parents=True, exist_ok=True)
    con = duckdb.connect(str(DB_PATH))
    
    if MODIS_CSV.exists():
        con.execute(f"""
            CREATE OR REPLACE TABLE modis_archive AS 
            SELECT * FROM read_csv_auto('{MODIS_CSV.resolve()}')
        """)
    
    if VIIRS_CSV.exists():
        con.execute(f"""
            CREATE OR REPLACE TABLE viirs_archive AS 
            SELECT * FROM read_csv_auto('{VIIRS_CSV.resolve()}')
        """)
        
    # Create persistent alert dispatch history table
    con.execute("""
        CREATE TABLE IF NOT EXISTS alert_dispatch_log (
            alert_id VARCHAR PRIMARY KEY,
            timestamp TIMESTAMP,
            district VARCHAR,
            location_name VARCHAR,
            latitude DOUBLE,
            longitude DOUBLE,
            frp DOUBLE,
            fdi_score DOUBLE,
            danger_class VARCHAR,
            wind_speed_kmh DOUBLE,
            channels_sent VARCHAR
        )
    """)
    con.close()

def query_stats() -> Dict[str, Any]:
    """Returns summary statistics across the 24-year satellite record."""
    con = get_connection(read_only=True)
    try:
        modis_count = con.execute("SELECT COUNT(*) FROM modis_archive").fetchone()[0]
        viirs_count = con.execute("SELECT COUNT(*) FROM viirs_archive").fetchone()[0]
        return {
            "status": "connected",
            "engine": "DuckDB Columnar In-Process Analytics",
            "modis_observations": modis_count,
            "viirs_observations": viirs_count,
            "total_satellite_observations": modis_count + viirs_count,
            "database_file": str(DB_PATH.name)
        }
    finally:
        con.close()

def query_annual_discontinuity() -> List[Dict[str, Any]]:
    """Analyzes the 2012 MODIS vs VIIRS detection jump directly with SQL."""
    con = get_connection(read_only=True)
    try:
        query = """
            WITH modis_annual AS (
                SELECT 
                    strftime(acq_date, '%Y') AS year,
                    COUNT(*) AS modis_count,
                    ROUND(AVG(frp), 2) AS modis_avg_frp
                FROM modis_archive
                GROUP BY year
            ),
            viirs_annual AS (
                SELECT 
                    strftime(acq_date, '%Y') AS year,
                    COUNT(*) AS viirs_count,
                    ROUND(AVG(frp), 2) AS viirs_avg_frp
                FROM viirs_archive
                GROUP BY year
            )
            SELECT 
                COALESCE(m.year, v.year) AS year,
                COALESCE(m.modis_count, 0) AS modis_fires,
                COALESCE(v.viirs_count, 0) AS viirs_fires,
                COALESCE(m.modis_avg_frp, 0.0) AS modis_avg_frp,
                COALESCE(v.viirs_avg_frp, 0.0) AS viirs_avg_frp
            FROM modis_annual m
            FULL OUTER JOIN viirs_annual v ON m.year = v.year
            ORDER BY year ASC
        """
        df = con.execute(query).df()
        return df.to_dict(orient="records")
    finally:
        con.close()

if __name__ == "__main__":
    initialize_database()
    print("DuckDB Stats:", query_stats())

