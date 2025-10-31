#!/bin/bash

#
# validate_circuit.sh - Comprehensive validation script for PCHIPBeta circuit
#
# This script:
# 1. Compiles the circuit with --O2 optimization
# 2. Counts constraints and verifies target (120-150)
# 3. Generates test inputs
# 4. Runs witness calculation for all test vectors
# 5. Validates outputs against expected values
#
# Usage: ./validate_circuit.sh
#

set -e  # Exit on error

SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"
CIRCUITS_DIR="$(dirname "$SCRIPT_DIR")"
PROJECT_ROOT="$(dirname "$CIRCUITS_DIR")"
BUILD_DIR="$CIRCUITS_DIR/build"
TEST_INPUTS_DIR="$SCRIPT_DIR/test_inputs"

echo "========================================="
echo "PCHIPBeta Circuit Validation"
echo "========================================="
echo ""

# Check if circom is installed
if ! command -v circom &> /dev/null; then
    echo "ERROR: circom not found. Please install circom 2.0+"
    echo "Visit: https://docs.circom.io/getting-started/installation/"
    exit 1
fi

# Check if snarkjs is installed
if ! command -v snarkjs &> /dev/null; then
    echo "ERROR: snarkjs not found. Please install snarkjs"
    echo "Run: npm install -g snarkjs"
    exit 1
fi

echo "Step 1: Creating build directory..."
mkdir -p "$BUILD_DIR"
echo "  Created: $BUILD_DIR"
echo ""

echo "Step 2: Compiling PCHIPBeta_test circuit with --O2 optimization..."
circom "$SCRIPT_DIR/PCHIPBeta_test.circom" \
    --r1cs \
    --wasm \
    --sym \
    --O2 \
    -o "$BUILD_DIR" \
    2>&1 | tee "$BUILD_DIR/compile.log"

echo ""
echo "Step 3: Analyzing constraint count..."
if [ -f "$BUILD_DIR/PCHIPBeta_test.r1cs" ]; then
    snarkjs r1cs info "$BUILD_DIR/PCHIPBeta_test.r1cs" > "$BUILD_DIR/constraint_info.txt"
    cat "$BUILD_DIR/constraint_info.txt"

    # Extract constraint count
    CONSTRAINTS=$(grep "# of Constraints:" "$BUILD_DIR/constraint_info.txt" | awk '{print $4}')
    echo ""
    echo "Total Constraints: $CONSTRAINTS"

    # Check if within target range
    if [ "$CONSTRAINTS" -ge 120 ] && [ "$CONSTRAINTS" -le 150 ]; then
        echo "✓ Constraint count within target range [120-150]"
    else
        echo "⚠ WARNING: Constraint count outside target range [120-150]"
    fi
else
    echo "ERROR: R1CS file not generated"
    exit 1
fi

echo ""
echo "Step 4: Generating test inputs..."
node "$SCRIPT_DIR/generate_test_inputs.js"

echo ""
echo "Step 5: Running witness calculation for all test vectors..."
PASSED=0
FAILED=0

# Load test summary
TEST_SUMMARY="$TEST_INPUTS_DIR/test_summary.json"

if [ ! -f "$TEST_SUMMARY" ]; then
    echo "ERROR: Test summary not found at $TEST_SUMMARY"
    exit 1
fi

# Count test cases
NUM_TESTS=$(ls -1 "$TEST_INPUTS_DIR"/input_*.json 2>/dev/null | wc -l)
echo "Found $NUM_TESTS test cases"
echo ""

# Run each test case
for i in $(seq 0 $((NUM_TESTS - 1))); do
    INPUT_FILE="$TEST_INPUTS_DIR/input_$i.json"

    if [ ! -f "$INPUT_FILE" ]; then
        echo "ERROR: Input file not found: $INPUT_FILE"
        continue
    fi

    # Extract test case info from summary
    TEST_NAME=$(node -e "console.log(require('$TEST_SUMMARY').test_cases[$i].name)")
    EXPECTED=$(node -e "console.log(require('$TEST_SUMMARY').test_cases[$i].expected_output)")
    TOLERANCE=$(node -e "console.log(require('$TEST_SUMMARY').test_cases[$i].tolerance)")
    UNIFORM_INPUT=$(node -e "console.log(require('$TEST_SUMMARY').test_cases[$i].uniform_input)")

    echo "Test $i: $TEST_NAME"
    echo "  Uniform: $UNIFORM_INPUT"
    echo "  Expected: $EXPECTED ± $TOLERANCE"

    # Generate witness
    WITNESS_FILE="$BUILD_DIR/witness_$i.wtns"
    OUTPUT_FILE="$BUILD_DIR/output_$i.json"

    node "$BUILD_DIR/PCHIPBeta_test_js/generate_witness.js" \
        "$BUILD_DIR/PCHIPBeta_test_js/PCHIPBeta_test.wasm" \
        "$INPUT_FILE" \
        "$WITNESS_FILE" \
        > /dev/null 2>&1

    if [ $? -ne 0 ]; then
        echo "  ✗ FAILED: Witness generation failed"
        FAILED=$((FAILED + 1))
        echo ""
        continue
    fi

    # Export witness to JSON
    snarkjs wtns export json "$WITNESS_FILE" "$OUTPUT_FILE" > /dev/null 2>&1

    # Extract bias_output (signal index 1 in the witness)
    ACTUAL=$(node -e "console.log(require('$OUTPUT_FILE')[1])")

    echo "  Actual: $ACTUAL"

    # Check if within tolerance
    DIFF=$(node -e "console.log(Math.abs($ACTUAL - $EXPECTED))")

    if (( $(echo "$DIFF <= $TOLERANCE" | bc -l) )); then
        echo "  ✓ PASSED (diff: $DIFF)"
        PASSED=$((PASSED + 1))
    else
        echo "  ✗ FAILED (diff: $DIFF, tolerance: $TOLERANCE)"
        FAILED=$((FAILED + 1))
    fi

    echo ""
done

echo "========================================="
echo "Validation Summary"
echo "========================================="
echo "Total Tests: $NUM_TESTS"
echo "Passed: $PASSED"
echo "Failed: $FAILED"
echo ""

if [ $FAILED -eq 0 ]; then
    echo "✓ All tests passed!"
    exit 0
else
    echo "✗ Some tests failed"
    exit 1
fi
