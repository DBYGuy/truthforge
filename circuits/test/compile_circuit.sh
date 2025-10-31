#!/bin/bash

#
# compile_circuit.sh - Manual compilation and constraint analysis
#
# This script compiles the PCHIPBeta_test circuit and analyzes constraints.
# Since circom may not be installed, this provides installation instructions
# and uses npx for snarkjs (which is available locally).
#
# Usage: ./compile_circuit.sh
#

set -e  # Exit on error

SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"
CIRCUITS_DIR="$(dirname "$SCRIPT_DIR")"
PROJECT_ROOT="$(dirname "$CIRCUITS_DIR")"
BUILD_DIR="$CIRCUITS_DIR/build"

echo "========================================="
echo "PCHIPBeta Circuit Compilation"
echo "========================================="
echo ""

# Check if circom is installed
if ! command -v circom &> /dev/null; then
    echo "ERROR: circom not found."
    echo ""
    echo "Please install circom 2.0+ using one of these methods:"
    echo ""
    echo "Option 1 - Install from releases (recommended):"
    echo "  curl -L https://github.com/iden3/circom/releases/download/v2.1.6/circom-linux-amd64 -o /tmp/circom"
    echo "  chmod +x /tmp/circom"
    echo "  sudo mv /tmp/circom /usr/local/bin/"
    echo ""
    echo "Option 2 - Build from source:"
    echo "  git clone https://github.com/iden3/circom.git"
    echo "  cd circom"
    echo "  cargo build --release"
    echo "  sudo cp target/release/circom /usr/local/bin/"
    echo ""
    echo "For more info: https://docs.circom.io/getting-started/installation/"
    exit 1
fi

# Verify circom version
CIRCOM_VERSION=$(circom --version | grep -oP 'circom compiler \K[0-9.]+' || echo "unknown")
echo "Found circom version: $CIRCOM_VERSION"
echo ""

# Create build directory
echo "Creating build directory..."
mkdir -p "$BUILD_DIR"
echo "  Created: $BUILD_DIR"
echo ""

# Compile with --O2 optimization
echo "Compiling PCHIPBeta_test.circom with --O2 optimization..."
echo "  Input: $SCRIPT_DIR/PCHIPBeta_test.circom"
echo "  Output: $BUILD_DIR"
echo ""

circom "$SCRIPT_DIR/PCHIPBeta_test.circom" \
    --r1cs \
    --wasm \
    --sym \
    --O2 \
    -o "$BUILD_DIR" \
    2>&1 | tee "$BUILD_DIR/compile.log"

echo ""
echo "Compilation complete!"
echo ""

# Analyze R1CS
if [ -f "$BUILD_DIR/PCHIPBeta_test.r1cs" ]; then
    echo "========================================="
    echo "Constraint Analysis"
    echo "========================================="
    echo ""

    cd "$PROJECT_ROOT"
    npx snarkjs r1cs info "$BUILD_DIR/PCHIPBeta_test.r1cs" | tee "$BUILD_DIR/constraint_info.txt"

    echo ""
    echo "Constraint details saved to: $BUILD_DIR/constraint_info.txt"
    echo ""

    # Extract constraint count
    CONSTRAINTS=$(grep "# of Constraints:" "$BUILD_DIR/constraint_info.txt" | awk '{print $4}')

    if [ -n "$CONSTRAINTS" ]; then
        echo "========================================="
        echo "Constraint Count Summary"
        echo "========================================="
        echo "Total Constraints: $CONSTRAINTS"
        echo "Target Range: 120-150"
        echo ""

        if [ "$CONSTRAINTS" -ge 120 ] && [ "$CONSTRAINTS" -le 150 ]; then
            echo "✓ Constraint count within target range!"
        elif [ "$CONSTRAINTS" -lt 120 ]; then
            echo "⚠ Below target range (very good - efficient implementation)"
        else
            echo "⚠ Above target range (may need optimization)"
        fi
    fi
else
    echo "ERROR: R1CS file not generated"
    exit 1
fi

echo ""
echo "Build artifacts:"
echo "  R1CS: $BUILD_DIR/PCHIPBeta_test.r1cs"
echo "  WASM: $BUILD_DIR/PCHIPBeta_test_js/PCHIPBeta_test.wasm"
echo "  SYM: $BUILD_DIR/PCHIPBeta_test.sym"
echo ""
echo "Next steps:"
echo "  1. Generate test inputs: node $SCRIPT_DIR/generate_test_inputs.js"
echo "  2. Run validation: cd $SCRIPT_DIR && bash validate_circuit_manual.sh"
echo ""
