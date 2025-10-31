# CIRCOM Circuit Development Infrastructure

## Overview
This directory contains the CIRCOM circuit implementation for TruthForge's PCHIP-based bias calculation. The circuit implements a 10-interval piecewise linear interpolation that maps uniform random values [0, 10000) to bias percentages [0, 100] following a Beta(2,5) distribution.

## Directory Structure
```
circuits/
├── PCHIPBeta.circom           # Main PCHIP circuit implementation
├── test/
│   ├── input_case*.json       # Test input files (11 cases)
│   ├── expected_case*.json    # Expected outputs with tolerances
│   └── test_summary.json      # Summary of all test cases
├── build/                     # Compiled outputs (.r1cs, .wasm, .sym)
│   ├── PCHIPBeta.r1cs        # R1CS constraint system
│   ├── PCHIPBeta_js/         # WASM witness generator
│   ├── PCHIPBeta.sym         # Symbol mapping
│   ├── witness.wtns          # Generated witness
│   └── witness.json          # Witness in JSON format
├── scripts/
│   ├── install_circom.sh     # Install circom compiler
│   ├── compile.sh            # Compile circuit
│   ├── generate_witness.sh   # Generate witness from input
│   ├── test_circuit.sh       # Full test pipeline
│   └── generate_test_inputs.py # Generate test files from test_vectors.json
├── CONSTANTS.md              # Critical constants (INV_SCALE, etc.)
└── README.md                 # This file
```

## Prerequisites

### Required Software
- **Node.js**: v20.19.1 (already installed ✓)
- **circomlib**: v2.0.5 (already installed ✓)
- **snarkjs**: v0.7.5 (already installed ✓)
- **circom**: v2.1.6+ (needs installation)
- **Python 3**: For test generation
- **jq**: For JSON processing in test scripts

### System Requirements
- Operating System: Linux (Ubuntu/Debian preferred)
- RAM: 4GB minimum, 8GB recommended
- Disk Space: 500MB for build artifacts

## Installation

### 1. Install circom Compiler

#### Option A: Automated Installation (Recommended)
```bash
cd scripts
./install_circom.sh
```

This script will:
1. Check for Rust installation (install if needed)
2. Clone the circom repository
3. Build and install circom from source
4. Verify installation

#### Option B: Manual Installation
```bash
# Install Rust if not already installed
curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh
source "$HOME/.cargo/env"

# Clone and build circom
git clone https://github.com/iden3/circom.git
cd circom
cargo build --release
cargo install --path circom

# Verify installation
circom --version  # Should show 2.1.6 or later
```

### 2. Install Additional Dependencies
```bash
# Install jq for JSON processing
sudo apt-get install jq

# Verify all dependencies
node --version      # v20.19.1
npx snarkjs --version  # 0.7.5
circom --version    # 2.1.6+
python3 --version   # 3.x
jq --version        # 1.x
```

## Critical Constants

### Modular Inverse (Required for Circuit)
The circuit uses modular arithmetic in the BN254 prime field. To perform division by 1e9, we use the modular inverse:

```
BN254_PRIME = 21888242871839275222246405745257275088548364400416034343698204186575808495617
INV_SCALE = 10042720846718967555366586836808522468669512619243210865060536802291936071405
```

**Verification**: `(1e9 * INV_SCALE) mod BN254_PRIME = 1`

See `CONSTANTS.md` for detailed explanation and usage.

## Development Workflow

### 1. Generate Test Inputs (Already Done)
Test inputs are pre-generated from `../test_vectors.json`. To regenerate:
```bash
cd scripts
python3 generate_test_inputs.py
```

This creates 11 test cases covering:
- Boundary conditions (0, 10000)
- Interval transitions
- Mean region (~28.6%)
- High bias region (>48%)

### 2. Implement Circuit
Create `PCHIPBeta.circom` with the following structure:
```circom
pragma circom 2.1.6;

template PCHIPBeta() {
    signal input uniform;   // Input: [0, 10000)
    signal output bias;     // Output: [0, 100]

    // Modular inverse of 1e9 mod BN254 prime
    signal INV_SCALE <== 10042720846718967555366586836808522468669512619243210865060536802291936071405;

    // Implement 10-interval piecewise linear interpolation
    // See ZKVerifier.sol lines 228-258 for reference
}
```

### 3. Compile Circuit
```bash
cd scripts
./compile.sh [circuit_name]

# Example:
./compile.sh PCHIPBeta
```

**Output**:
- `build/PCHIPBeta.r1cs` - R1CS constraint system
- `build/PCHIPBeta_js/` - WASM witness generator
- `build/PCHIPBeta.sym` - Symbol mapping for debugging

**Compilation Options**:
- `--O2`: Optimization level 2 (reduces constraints)
- `--r1cs`: Generate R1CS file
- `--wasm`: Generate WASM witness calculator
- `--sym`: Generate symbol file for debugging
- `--inspect`: Show circuit information

### 4. Generate Witness
```bash
cd scripts
./generate_witness.sh <input_file> [circuit_name]

# Example:
./generate_witness.sh ../test/input_case7.json PCHIPBeta
```

**Output**:
- `build/witness.wtns` - Binary witness file
- `build/witness.json` - Human-readable witness

### 5. Run Tests
```bash
cd scripts

# Run single test case
./test_circuit.sh 7

# Run all test cases
./test_circuit.sh
```

**Test Pipeline**:
1. Compile circuit (if needed)
2. Generate witness for each test case
3. Verify witness satisfies R1CS constraints
4. Compare output with expected value (within tolerance)

## Test Cases

### Validation Criteria
Each test case includes:
- **Input**: `uniform` value [0, 10000)
- **Expected Output**: Bias percentage [0, 100]
- **Tolerance**: Allowed difference (0-2 points)
- **Description**: What the test validates

### Coverage
| Case | Name | Input | Expected | Tolerance | Purpose |
|------|------|-------|----------|-----------|---------|
| 1 | Lower boundary | 0 | 0 | 0 | Exact zero at domain start |
| 2 | First interval midpoint | 3 | 0 | 1 | Within first steep region |
| 3 | First knot boundary | 5 | 0 | 1 | Interval 1-2 boundary |
| 4 | Early transition | 100 | 2 | 1 | Interval 2 midpoint |
| 5 | Second knot | 200 | 3 | 1 | Interval 2-3 boundary |
| 6 | Core distribution | 1000 | 9 | 1 | Stable region |
| 7 | Mean region | 5000 | 24 | 1 | Near distribution mean |
| 8 | Penalty threshold | 8800 | 48 | 1 | High bias start |
| 9 | Upper tail start | 9800 | 65 | 1 | Steep upper tail |
| 10 | Near upper boundary | 9900 | 82 | 2 | Very steep gradient |
| 11 | Upper boundary | 9999 | 100 | 1 | Maximum domain value |

### Bulk Validation
After unit tests pass, run bulk validation:
- **Sample Size**: 10,000+ random inputs
- **Expected Mean**: 28.57% (±2.0%)
- **Expected Std Dev**: 16.04 (±3.0%)
- **Penalty Rate**: 10.4% (±1.0 pts)

## Reference Implementation

### Solidity Reference (ZKVerifier.sol, lines 228-258)
The CIRCOM circuit must match this Solidity implementation:

```solidity
// 10-interval Linear PCHIP Beta(2,5) evaluation
if (uniform < 5) { // Interval 1 [0,5]
    uint256 dx = uniform;
    return (0 + (116370450 * dx)) / 1e9;
} else if (uniform < 200) { // Interval 2 [5,200]
    uint256 dx = uniform - 5;
    return (581852000 + (16734810 * dx)) / 1e9;
}
// ... 8 more intervals
```

**Key Points**:
- Coefficients (a, b) are pre-scaled by 1e9
- Division by 1e9 maps to range [0, 100]
- Linear interpolation: `result = (a + b*dx) / 1e9`

### CIRCOM Translation
```circom
// Instead of division, use modular inverse
// Solidity: return (a + b*dx) / 1e9
// CIRCOM: bias <== (a + b*dx) * INV_SCALE
```

## Circuit Implementation Guidelines

### 1. Input Constraints
```circom
// Ensure input is in valid range [0, 10000)
signal rangeCheck;
rangeCheck <== LessThan(14)([uniform, 10000]);
rangeCheck === 1;
```

### 2. Interval Selection
Use if-then-else pattern or comparison operators:
```circom
component lt5 = LessThan(14);
lt5.in[0] <== uniform;
lt5.in[1] <== 5;

// If uniform < 5: interval 1
// Else: check next interval
```

### 3. Linear Interpolation
For each interval:
```circom
signal dx;
dx <== uniform - interval_start;

signal scaled_result;
scaled_result <== a + b * dx;

// Apply modular inverse for division
signal final_result;
final_result <== scaled_result * INV_SCALE;
```

### 4. Optimization Tips
- **Minimize Constraints**: Each comparison adds constraints
- **Use Multiplexers**: For selecting between intervals
- **Avoid Loops**: Unroll all 10 intervals explicitly
- **Target**: <5000 constraints for efficient proof generation

## Troubleshooting

### Common Issues

#### "circom: command not found"
```bash
# Run installation script
cd scripts
./install_circom.sh

# Or check PATH
echo $PATH | grep -q "$HOME/.cargo/bin" || export PATH="$HOME/.cargo/bin:$PATH"
```

#### "Non-quadratic constraints"
CIRCOM only allows quadratic (degree 2) constraints. Check:
- No cubic or higher degree operations
- Use intermediate signals for complex expressions

#### "Witness doesn't satisfy constraints"
- Verify input values are correct
- Check arithmetic overflow in intermediate calculations
- Ensure modular inverse is used correctly

#### "Output doesn't match expected"
- Check interval boundaries are exact
- Verify coefficients from `pchip_coefficients.json`
- Test boundary cases (0, 5, 200, etc.)

### Debugging Tools
```bash
# View circuit constraints
npx snarkjs r1cs print build/PCHIPBeta.r1cs build/PCHIPBeta.sym

# Check R1CS info (constraints, wires, labels)
npx snarkjs r1cs info build/PCHIPBeta.r1cs

# Export R1CS to JSON
npx snarkjs r1cs export json build/PCHIPBeta.r1cs build/PCHIPBeta_r1cs.json

# Verify witness
npx snarkjs wtns check build/PCHIPBeta.r1cs build/witness.wtns
```

## Performance Metrics

### Target Metrics
- **Constraints**: <5000 (lower is better)
- **Witness Generation**: <1s per input
- **Proof Generation**: <5s (Groth16, powers of tau ready)
- **Verification**: <500ms on-chain

### Actual Performance (To Be Measured)
After implementing the circuit, measure:
```bash
# Count constraints
npx snarkjs r1cs info build/PCHIPBeta.r1cs | grep "# of Constraints"

# Time witness generation
time ./scripts/generate_witness.sh test/input_case7.json
```

## Next Steps

### Phase 2 Roadmap
1. **Step 1**: Implement basic 10-interval circuit
2. **Step 2**: Optimize constraint count
3. **Step 3**: Generate trusted setup (powers of tau)
4. **Step 4**: Create Groth16 proving key
5. **Step 5**: Generate proofs for all test cases
6. **Step 6**: Export Solidity verifier
7. **Step 7**: Integrate with ZKVerifier.sol

### Integration with TruthForge
- Replace stubbed `verifyBiasProof()` in ZKVerifier.sol
- Deploy verifier contract on zkSync
- Update frontend to generate proofs client-side
- Benchmark end-to-end proof generation time

## Resources

### Documentation
- [CIRCOM Documentation](https://docs.circom.io/)
- [snarkjs Guide](https://github.com/iden3/snarkjs)
- [circomlib Library](https://github.com/iden3/circomlib)
- [BN254 Curve Spec](https://eips.ethereum.org/EIPS/eip-197)

### TruthForge References
- Phase 1 Step 1 Report: `../PHASE1_STEP1_COMPLETE.md`
- PCHIP Coefficients: `../pchip_coefficients.json`
- Test Vectors: `../test_vectors.json`
- Solidity Reference: `../../../../contracts/ZKVerifier.sol`

### Support
- CIRCOM Discord: [iden3 Community](https://discord.gg/iden3)
- zkSNARK Resources: [awesome-zero-knowledge-proofs](https://github.com/ventali/awesome-zk)

## Validation Checklist

Before proceeding to Phase 2:
- [ ] circom installed and version ≥2.1.6
- [ ] snarkjs v0.7.5 working
- [ ] circomlib v2.0.5 available
- [ ] All 11 test input files generated
- [ ] Build scripts executable and functional
- [ ] Modular inverse calculated and verified
- [ ] Directory structure complete
- [ ] Constants documented
- [ ] Reference implementation extracted

## License
Part of the TruthForge project. See main repository for license details.

## Authors
TruthForge Development Team

## Last Updated
2025-10-30 (Phase 1 Step 1 Infrastructure Setup)
