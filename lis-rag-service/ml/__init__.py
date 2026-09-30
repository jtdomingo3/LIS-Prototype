"""
Future Machine Learning Pipeline for Gezyne LIS
Supports:
- Linear Regression (Volume forecasting, QC drift projection)
- Decision Trees (Clinical triage recommendation, QC rejection escalation)
- Anomaly Detection (Outlier test results, unusual reagent burn rates)
"""

def get_available_models():
    return [
        {"name": "linear_regression_qc", "description": "Projects calibration decay based on consecutive LJ runs"},
        {"name": "inventory_forecaster", "description": "Predicts reagent depletion date from test accession trends"},
        {"name": "decision_tree_triage", "description": "Suggests reflex diagnostic panels based on preliminary findings"}
    ]
