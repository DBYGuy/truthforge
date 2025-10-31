#!/bin/bash
# Compile CIRCOM circuit to R1CS, WASM, and SYM formats
# Usage: ./compile.sh [circuit_name]
# Example: ./compile.sh PCHIPBeta

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
CIRCUITS_DIR="$(dirname "$SCRIPT_DIR")"
BUILD_DIR="$CIRCUITS_DIR/build"

# Default circuit name
CIRCUIT_NAME="${1:-PCHIPBeta}"
CIRCUIT_FILE="$CIRCUITS_DIR/${CIRCUIT_NAME}.circom"

# Check if circuit file exists
if [ ! -f "$CIRCUIT_FILE" ]; then
    echo "Error: Circuit file not found: $CIRCUIT_FILE"
    exit 1
fi

# Check if circom is installed
if ! command -v circom &> /dev/null; then
    echo "Error: circom is not installed"
    echo "Run ./install_circom.sh to install circom"
    exit 1
fi

echo "=========================================="
echo "Compiling CIRCOM Circuit: $CIRCUIT_NAME"
echo "=========================================="
echo "Circuit file: $CIRCUIT_FILE"
echo "Build directory: $BUILD_DIR"
echo ""

# Create build directory if it doesn't exist
mkdir -p "$BUILD_DIR"

# Compile the circuit with optimizations
echo "Running circom compiler with --O2 optimization..."
circom "$CIRCUIT_FILE" \
    --r1cs \
    --wasm \
    --sym \
    --inspect \
    --O2 \
    -o "$BUILD_DIR"

echo ""
echo "=========================================="
echo "Compilation Complete!"
echo "=========================================="
echo "Generated files in $BUILD_DIR:"
ls -lh "$BUILD_DIR"/${CIRCUIT_NAME}*

echo ""
echo "R1CS info:"
if command -v snarkjs &> /dev/null; then
    npx snarkjs r1cs info "$BUILD_DIR/${CIRCUIT_NAME}.r1cs"
else
    echo "snarkjs not found, skipping R1CS info"
fi

echo ""
echo "Next steps:"
echo "1. Generate witness: ./generate_witness.sh <input_file>"
echo "2. Run full test: ./test_circuit.sh"
