#!/bin/bash

#
# validate_circuit_manual.sh - Manual validation using pre-compiled circuit
#
# This script validates the compiled circuit against test vectors.
# Run compile_circuit.sh first to generate the WASM artifacts.
#
# Usage: ./validate_circuit_manual.sh
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

# Check if circuit is compiled
if [ ! -f "$BUILD_DIR/PCHIPBeta_test_js/PCHIPBeta_test.wasm" ]; then
    echo "ERROR: Circuit not compiled. Please run compile_circuit.sh first."
    exit 1
fi

echo "Using compiled circuit at: $BUILD_DIR/PCHIPBeta_test_js/"
echo ""

echo "Step 1: Generating test inputs..."
cd "$SCRIPT_DIR"
node generate_test_inputs.js

echo ""
echo "Step 2: Running witness calculation for all test vectors..."
PASSED=0
FAILED=0
TOTAL=0

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

    TOTAL=$((TOTAL + 1))

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

    cd "$PROJECT_ROOT"
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
    npx snarkjs wtns export json "$WITNESS_FILE" "$OUTPUT_FILE" > /dev/null 2>&1

    # Extract bias_output (signal index 1 in the witness)
    ACTUAL=$(node -e "console.log(require('$OUTPUT_FILE')[1])")

    echo "  Actual: $ACTUAL"

    # Check if within tolerance
    DIFF=$(node -e "console.log(Math.abs($ACTUAL - $EXPECTED))")

    # Use bc for comparison if available, otherwise use node
    if command -v bc &> /dev/null; then
        if (( $(echo "$DIFF <= $TOLERANCE" | bc -l) )); then
            echo "  ✓ PASSED (diff: $DIFF)"
            PASSED=$((PASSED + 1))
        else
            echo "  ✗ FAILED (diff: $DIFF, tolerance: $TOLERANCE)"
            FAILED=$((FAILED + 1))
        fi
    else
        # Fallback to node for comparison
        RESULT=$(node -e "console.log($DIFF <= $TOLERANCE ? 'PASS' : 'FAIL')")
        if [ "$RESULT" = "PASS" ]; then
            echo "  ✓ PASSED (diff: $DIFF)"
            PASSED=$((PASSED + 1))
        else
            echo "  ✗ FAILED (diff: $DIFF, tolerance: $TOLERANCE)"
            FAILED=$((FAILED + 1))
        fi
    fi

    echo ""
done

echo "========================================="
echo "Validation Summary"
echo "========================================="
echo "Total Tests: $TOTAL"
echo "Passed: $PASSED"
echo "Failed: $FAILED"
echo ""

if [ $FAILED -eq 0 ] && [ $TOTAL -gt 0 ]; then
    echo "✓ All tests passed!"
    exit 0
else
    echo "✗ Some tests failed or no tests run"
    exit 1
fi
