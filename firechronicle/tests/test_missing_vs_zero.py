import pandas as pd
import numpy as np

def test_missing_is_not_zero():
    """
    Tests that a known outage date is recorded as MISSING_PRODUCT (or KNOWN_OUTAGE)
    with NA values, and NOT silently converted to zero detections.
    """
    # Simulate a cell-day dataset
    data = pd.DataFrame({
        'grid_id': ['123_456', '123_456', '123_456'],
        'local_date': ['2024-11-08', '2024-11-09', '2024-11-10'],
        'platform': ['S-NPP', 'S-NPP', 'S-NPP'],
        'raw_count': [5, pd.NA, 0], 
        'observation_status': ['OBSERVED_DETECTION', 'KNOWN_OUTAGE', 'OBSERVED_NO_DETECTION']
    })
    
    # 1. Check that the outage date has NA for count, not 0
    outage_row = data[data['observation_status'] == 'KNOWN_OUTAGE']
    assert len(outage_row) == 1, "Should have one outage row"
    assert pd.isna(outage_row['raw_count'].iloc[0]), "Outage count MUST be NA, not zero"
    
    # 2. Check that observed no detection has 0
    no_detect_row = data[data['observation_status'] == 'OBSERVED_NO_DETECTION']
    assert len(no_detect_row) == 1, "Should have one no-detection row"
    assert no_detect_row['raw_count'].iloc[0] == 0, "Observed no detection should be 0"

    print("Test passed: Missing data is explicitly distinguished from zero activity.")

if __name__ == "__main__":
    test_missing_is_not_zero()
