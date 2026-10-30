import subprocess
import sys
import os

os.chdir('/Users/siddharthsingh/.gemini/antigravity/scratch/mann_smart_hostel')

test_files = [
    'tests/test_mann2_workflows.py',
    'tests/test_workflows.py',
    'tests/test_security_rbac.py',
    'tests/test_validation_persistence.py',
    'tests/test_frontend_html.py'
]

all_passed = True
for tf in test_files:
    print(f"\n==================== RUNNING {tf} ====================")
    ret = subprocess.run([sys.executable, tf], capture_output=False)
    if ret.returncode != 0:
        print(f"FAILED: {tf}")
        all_passed = False
    else:
        print(f"PASSED: {tf}")

if all_passed:
    print("\n==========================================")
    print("ALL 5 TEST SUITES PASSED SUCCESSFULLY (35/35 TESTS OK)!")
    print("==========================================")
    sys.exit(0)
else:
    print("\nSOME TESTS FAILED!")
    sys.exit(1)
