#!/usr/bin/env python3
"""
Generate CIRCOM test input files from test_vectors.json

Reads test vectors from phase1_step1/test_vectors.json and generates:
1. Individual input files for each test case (input_case{N}.json)
2. Individual expected output files (expected_case{N}.json)
3. Summary of all test cases

Output format for CIRCOM:
{
    "uniform": <value>
}

Expected output format:
{
    "expected_output": <value>,
    "tolerance": <value>,
    "name": "<test_case_name>",
    "notes": "<notes>"
}
"""

import json
import os
from pathlib import Path

def generate_test_inputs():
    # Paths
    script_dir = Path(__file__).parent
    circuits_dir = script_dir.parent
    phase1_dir = circuits_dir.parent
    test_vectors_file = phase1_dir / "test_vectors.json"
    test_dir = circuits_dir / "test"

    # Create test directory if it doesn't exist
    test_dir.mkdir(exist_ok=True)

    # Read test vectors
    print(f"Reading test vectors from: {test_vectors_file}")
    with open(test_vectors_file, 'r') as f:
        test_data = json.load(f)

    test_cases = test_data['test_cases']
    print(f"Found {len(test_cases)} test cases")
    print()

    # Generate files for each test case
    summary = []

    for idx, test_case in enumerate(test_cases, start=1):
        name = test_case['name']
        uniform_input = test_case['uniform_input']
        expected_output = test_case['expected_output']
        tolerance = test_case['tolerance']
        notes = test_case['notes']

        # Input file for CIRCOM
        input_file = test_dir / f"input_case{idx}.json"
        input_data = {
            "uniform": uniform_input
        }

        with open(input_file, 'w') as f:
            json.dump(input_data, f, indent=2)

        # Expected output file
        expected_file = test_dir / f"expected_case{idx}.json"
        expected_data = {
            "expected_output": expected_output,
            "tolerance": tolerance,
            "name": name,
            "notes": notes
        }

        with open(expected_file, 'w') as f:
            json.dump(expected_data, f, indent=2)

        summary.append({
            "case": idx,
            "name": name,
            "input": uniform_input,
            "expected": expected_output,
            "tolerance": tolerance,
            "input_file": str(input_file.name),
            "expected_file": str(expected_file.name)
        })

        print(f"✓ Generated test case {idx}: {name}")
        print(f"  Input: {uniform_input} → Expected: {expected_output} (±{tolerance})")

    # Generate summary file
    summary_file = test_dir / "test_summary.json"
    with open(summary_file, 'w') as f:
        json.dump({
            "description": "Summary of all CIRCOM test cases",
            "total_cases": len(test_cases),
            "bulk_validation": test_data.get('bulk_validation', {}),
            "test_cases": summary
        }, f, indent=2)

    print()
    print(f"✓ Generated summary: {summary_file}")
    print()
    print("=" * 60)
    print("Test Input Generation Complete!")
    print("=" * 60)
    print(f"Generated {len(test_cases)} test cases in: {test_dir}")
    print()
    print("Files created:")
    for item in sorted(test_dir.iterdir()):
        print(f"  - {item.name}")
    print()
    print("Next steps:")
    print("1. Implement PCHIPBeta.circom circuit")
    print("2. Compile: ./scripts/compile.sh")
    print("3. Test: ./scripts/test_circuit.sh")

if __name__ == "__main__":
    generate_test_inputs()
