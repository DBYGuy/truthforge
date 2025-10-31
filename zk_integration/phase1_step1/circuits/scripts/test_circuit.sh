#!/bin/bash
# Full test pipeline: compile → witness → verify against expected output
# Usage: ./test_circuit.sh [test_case_number]
# Example: ./test_circuit.sh 1  (runs test case 1)
#          ./test_circuit.sh     (runs all test cases)

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
CIRCUITS_DIR="$(dirname "$SCRIPT_DIR")"
BUILD_DIR="$CIRCUITS_DIR/build"
TEST_DIR="$CIRCUITS_DIR/test"

CIRCUIT_NAME="PCHIPBeta"
TEST_CASE="$1"

echo "=========================================="
echo "CIRCOM Circuit Test Pipeline"
echo "=========================================="
echo "Circuit: $CIRCUIT_NAME"
echo ""

# Step 1: Compile circuit if needed
if [ ! -f "$BUILD_DIR/${CIRCUIT_NAME}.r1cs" ]; then
    echo "Step 1: Compiling circuit..."
    "$SCRIPT_DIR/compile.sh" "$CIRCUIT_NAME"
    echo ""
else
    echo "Step 1: Circuit already compiled (skipping)"
    echo ""
fi

# Step 2: Run test cases
if [ -n "$TEST_CASE" ]; then
    # Single test case
    INPUT_FILE="$TEST_DIR/input_case${TEST_CASE}.json"
    EXPECTED_FILE="$TEST_DIR/expected_case${TEST_CASE}.json"

    if [ ! -f "$INPUT_FILE" ]; then
        echo "Error: Test case $TEST_CASE not found: $INPUT_FILE"
        exit 1
    fi

    echo "Step 2: Running test case $TEST_CASE..."
    echo "Input: $INPUT_FILE"

    # Generate witness
    "$SCRIPT_DIR/generate_witness.sh" "$INPUT_FILE" "$CIRCUIT_NAME"

    # Verify witness against R1CS constraints
    echo ""
    echo "Step 3: Verifying witness satisfies R1CS constraints..."
    npx snarkjs wtns check "$BUILD_DIR/${CIRCUIT_NAME}.r1cs" "$BUILD_DIR/witness.wtns"

    # Extract output and compare with expected
    echo ""
    echo "Step 4: Comparing output with expected value..."

    if [ -f "$EXPECTED_FILE" ]; then
        EXPECTED=$(cat "$EXPECTED_FILE" | jq -r '.expected_output')
        ACTUAL=$(cat "$BUILD_DIR/witness.json" | jq -r '.[1]')  # Output signal is typically at index 1

        echo "Expected: $EXPECTED"
        echo "Actual: $ACTUAL"

        TOLERANCE=$(cat "$EXPECTED_FILE" | jq -r '.tolerance')
        DIFF=$((ACTUAL - EXPECTED))
        DIFF=${DIFF#-}  # Absolute value

        if [ "$DIFF" -le "$TOLERANCE" ]; then
            echo "✓ Test PASSED (difference: $DIFF, tolerance: $TOLERANCE)"
        else
            echo "✗ Test FAILED (difference: $DIFF, tolerance: $TOLERANCE)"
            exit 1
        fi
    else
        echo "No expected output file found, skipping comparison"
    fi

else
    # Run all test cases
    echo "Step 2: Running all test cases..."
    echo ""

    PASSED=0
    FAILED=0

    for INPUT_FILE in "$TEST_DIR"/input_case*.json; do
        if [ ! -f "$INPUT_FILE" ]; then
            echo "No test cases found in $TEST_DIR"
            exit 1
        fi

        TEST_NUM=$(basename "$INPUT_FILE" | sed 's/input_case\([0-9]*\)\.json/\1/')
        EXPECTED_FILE="$TEST_DIR/expected_case${TEST_NUM}.json"

        echo "----------------------------------------"
        echo "Test Case $TEST_NUM"
        echo "----------------------------------------"

        # Generate witness
        "$SCRIPT_DIR/generate_witness.sh" "$INPUT_FILE" "$CIRCUIT_NAME" 2>&1 | tail -5

        # Verify constraints
        npx snarkjs wtns check "$BUILD_DIR/${CIRCUIT_NAME}.r1cs" "$BUILD_DIR/witness.wtns" 2>&1 | grep -E "Constraints.*OK"

        # Compare output
        if [ -f "$EXPECTED_FILE" ]; then
            EXPECTED=$(cat "$EXPECTED_FILE" | jq -r '.expected_output')
            ACTUAL=$(cat "$BUILD_DIR/witness.json" | jq -r '.[1]')
            TOLERANCE=$(cat "$EXPECTED_FILE" | jq -r '.tolerance')

            DIFF=$((ACTUAL - EXPECTED))
            DIFF=${DIFF#-}

            if [ "$DIFF" -le "$TOLERANCE" ]; then
                echo "✓ PASSED (expected: $EXPECTED, actual: $ACTUAL, diff: $DIFF)"
                PASSED=$((PASSED + 1))
            else
                echo "✗ FAILED (expected: $EXPECTED, actual: $ACTUAL, diff: $DIFF > tolerance: $TOLERANCE)"
                FAILED=$((FAILED + 1))
            fi
        else
            echo "⚠ No expected output (actual: $ACTUAL)"
        fi

        echo ""
    done

    echo "=========================================="
    echo "Test Summary"
    echo "=========================================="
    echo "Passed: $PASSED"
    echo "Failed: $FAILED"
    echo ""

    if [ "$FAILED" -gt 0 ]; then
        exit 1
    fi
fi

echo "=========================================="
echo "All Tests Passed!"
echo "=========================================="
