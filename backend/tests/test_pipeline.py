import os
import sys

# Ensure backend package is in path
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

from app.agents.pipeline import run_pipeline

def test_pipeline_execution():
    """
    Test that the run_pipeline execution completes without crashing
    and outputs the expected data structures into Firestore (if db is connected).
    """
    try:
        # Running the pipeline safely
        result = run_pipeline()
        
        # Verify result is a dict with standard expected payload fields
        assert isinstance(result, dict), "Pipeline should return a structured dictionary"
        assert "run_id" in result, "Result missing run_id"
        assert "hotspots" in result, "Result missing hotspots"
        assert "decisions" in result, "Result missing decisions"
        
        print("[PASS] Pipeline execution test successfully completed!")
    except Exception as e:
        print(f"[FAIL] Pipeline execution test failed: {e}")
        raise

if __name__ == "__main__":
    test_pipeline_execution()
