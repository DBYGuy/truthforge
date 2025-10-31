#!/bin/bash
# Generate witness from CIRCOM circuit and input JSON
# Usage: ./generate_witness.sh <input_json> [circuit_name]
# Example: ./generate_witness.sh ../test/input_case1.json PCHIPBeta

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
CIRCUITS_DIR="$(dirname "$SCRIPT_DIR")"
BUILD_DIR="$CIRCUITS_DIR/build"
TEST_DIR="$CIRCUITS_DIR/test"

# Arguments
INPUT_FILE="$1"
CIRCUIT_NAME="${2:-PCHIPBeta}"

# Validate input
if [ -z "$INPUT_FILE" ]; then
    echo "Error: Input JSON file required"
    echo "Usage: ./generate_witness.sh <input_json> [circuit_name]"
    exit 1
fi

# Check if input file exists
if [ ! -f "$INPUT_FILE" ]; then
    echo "Error: Input file not found: $INPUT_FILE"
    exit 1
fi

# Check if circuit is compiled
WASM_DIR="$BUILD_DIR/${CIRCUIT_NAME}_js"
WASM_FILE="$WASM_DIR/${CIRCUIT_NAME}.wasm"

if [ ! -f "$WASM_FILE" ]; then
    echo "Error: Circuit not compiled. WASM file not found: $WASM_FILE"
    echo "Run ./compile.sh first"
    exit 1
fi

# Output witness file
WITNESS_FILE="$BUILD_DIR/witness.wtns"

echo "=========================================="
echo "Generating Witness"
echo "=========================================="
echo "Circuit: $CIRCUIT_NAME"
echo "Input: $INPUT_FILE"
echo "Output: $WITNESS_FILE"
echo ""

# Generate witness using snarkjs
echo "Running witness calculator..."
npx snarkjs wtns calculate "$WASM_FILE" "$INPUT_FILE" "$WITNESS_FILE"

echo ""
echo "=========================================="
echo "Witness Generated Successfully!"
echo "=========================================="
echo "Witness file: $WITNESS_FILE"
ls -lh "$WITNESS_FILE"

# Export witness to JSON for inspection
WITNESS_JSON="$BUILD_DIR/witness.json"
echo ""
echo "Exporting witness to JSON for inspection..."
npx snarkjs wtns export json "$WITNESS_FILE" "$WITNESS_JSON"

echo "Witness JSON: $WITNESS_JSON"
echo ""
echo "First few signals:"
head -20 "$WITNESS_JSON"

echo ""
echo "Next steps:"
echo "1. Verify witness: npx snarkjs wtns check <r1cs_file> $WITNESS_FILE"
echo "2. Generate proof: npx snarkjs groth16 prove ..."
