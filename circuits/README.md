# TruthForge ZK Circuits

Zero-knowledge proof circuits for MEV-resistant bias calculation and anonymous attribute-based voting.

## Quick Start

### 1. Install Dependencies

```bash
# Install Node.js dependencies (snarkjs, circomlib)
cd /home/adam/Projects/truthforge/truthforge
npm install

# Install circom compiler (choose one method)

# Method 1: Download pre-built binary (recommended)
curl -L https://github.com/iden3/circom/releases/download/v2.1.6/circom-linux-amd64 -o /tmp/circom
chmod +x /tmp/circom
sudo mv /tmp/circom /usr/local/bin/

# Method 2: Build from source (requires Rust)
git clone https://github.com/iden3/circom.git /tmp/circom
cd /tmp/circom
cargo build --release
sudo cp target/release/circom /usr/local/bin/

# Verify installation
circom --version  # Should show 2.1.6 or higher
```

### 2. Compile Circuit

```bash
cd circuits/test
./compile_circuit.sh
```

Expected output:
```
Compiling PCHIPBeta_test.circom with --O2 optimization...
Total Constraints: [120-150]
✓ Constraint count within target range!
```

### 3. Run Tests

```bash
cd circuits/test
./validate_circuit_manual.sh
```

Expected output:
```
Found 11 test cases
Test 0: Lower boundary ... ✓ PASSED
...
Test 10: Upper boundary ... ✓ PASSED

Validation Summary
Passed: 11/11
✓ All tests passed!
```

## Circuit Files

### Main Circuits
- **`PCHIPBeta.circom`** - Production circuit with Poseidon entropy generation
  - Inputs: `nullifier` (public), `secret` (private)
  - Outputs: `bias` [0-100], `uniform` [0-9999]
  - Constraints: ~140 (target: 120-150)

### Test Circuits
- **`test/PCHIPBeta_test.circom`** - Test harness with direct uniform input
  - Input: `uniform_input` [0-9999]
  - Output: `bias_output` [0-100]
  - Used for validation against Solidity reference

## Architecture

```
PCHIPBeta Circuit (Phase 2)
│
├─ Entropy Generation
│  └─ Poseidon(nullifier, secret, domain_sep) → uniform ∈ [0, 9999]
│
├─ Interval Selection (10 intervals, Linear PCHIP)
│  ├─ Unrolled comparators (constant-time)
│  └─ Soundness: Exactly one interval selected
│
├─ Bias Calculation
│  ├─ Select coefficients: a, b, knot
│  ├─ Compute: bias_scaled = a + b × (uniform - knot)
│  └─ Divide: bias = bias_scaled / 1e9 (via modular inverse)
│
└─ Output Validation
   └─ Range check: bias ∈ [0, 100]
```

## Mathematical Foundation

**Linear PCHIP Beta(2,5) Distribution**

The circuit implements a piecewise linear approximation of the Beta(2,5) distribution using Piecewise Cubic Hermite Interpolating Polynomial (PCHIP) method, simplified to linear segments for efficiency.

**Formula**:
```
bias(u) = (a + b × (u - u_i)) / 1e9
```

Where:
- `u` = uniform random value from Poseidon hash
- `u_i` = knot at start of selected interval
- `a, b` = coefficients for interval (from Phase 1 extraction)

**Intervals**: 10 segments optimized for Beta(2,5) distribution
- Knots: [0, 5, 200, 800, 1800, 3500, 5500, 7500, 8800, 9800, 10000]
- Mean bias: ~28.6%
- High bias (>50%): ~10.4% probability

## Security Properties

### Soundness
- **Enforced**: Exactly one interval selected via `Σflag[i] = 1` constraint
- **Prevents**: Multi-interval selection, no-interval selection attacks

### Zero-Knowledge
- **Constant-time**: All code paths execute same operations
- **Privacy**: Multiplexing hides which interval was selected
- **No leakage**: Uniform value not revealed (only bias output)

### MEV Resistance
- **Poseidon hash** with private `secret` input
- **Domain separation**: Prevents cross-circuit hash collisions
- **Unpredictable**: Attackers cannot manipulate uniform value

### Overflow Safety
- All intermediate values < BN254 field prime
- Maximum bias_scaled: ~100 × 10^9 (well below field limit)
- Validated via mathematical analysis

## Test Vectors

11 comprehensive test cases covering:
- Boundaries (0, 9999)
- Interval transitions (knot boundaries)
- Core distribution (mean region ~28.6%)
- Steep gradients (tails)
- High bias region (>50% penalty threshold)

All tests validated against Solidity reference implementation in `contracts/ZKVerifier.sol`.

## Performance Metrics

| Metric | Value | Notes |
|--------|-------|-------|
| Constraints | ~140 | Target: 120-150 |
| Proof time | 50-100ms | Estimated on consumer CPU |
| Proof size | ~200 bytes | Groth16 constant size |
| Verification gas | 250k-400k | On-chain zkSync |

## Integration

### Phase 3 Integration (Future)

```circom
include "circuits/PCHIPBeta.circom";

template AttributeVerification() {
    signal input nullifier;
    signal input secret;
    signal input degree;
    signal input attribute;

    // Calculate bias
    component biasCalc = PCHIPBeta();
    biasCalc.nullifier <== nullifier;
    biasCalc.secret <== secret;

    signal bias <== biasCalc.bias;

    // Calculate weight = degree * attribute / (1 + bias)
    // Calculate gravity = 100 - (bias * distance_factor)
    // ... additional logic ...
}
```

## Troubleshooting

### circom: command not found
```bash
# Install circom (see "Install Dependencies" above)
which circom  # Should show /usr/local/bin/circom
```

### Compilation fails with "template not found"
```bash
# Ensure circomlib is installed
npm install

# Check node_modules/circomlib exists
ls node_modules/circomlib/circuits/
```

### Witness generation fails
```bash
# Ensure circuit is compiled first
cd circuits/test
./compile_circuit.sh

# Check WASM file exists
ls ../build/PCHIPBeta_test_js/PCHIPBeta_test.wasm
```

### Test validation fails
```bash
# Check test inputs are generated
ls test/test_inputs/

# Re-generate if missing
cd test
node generate_test_inputs.js
```

## Development

### Adding New Test Cases

1. Edit `zk_integration/phase1_step1/test_vectors.json`
2. Add new test case:
```json
{
  "name": "My test",
  "uniform_input": 5000,
  "expected_output": 24,
  "tolerance": 1,
  "notes": "Test description"
}
```
3. Regenerate inputs: `node circuits/test/generate_test_inputs.js`
4. Run validation: `./circuits/test/validate_circuit_manual.sh`

### Modifying Circuit

1. Edit `circuits/PCHIPBeta.circom`
2. Update `circuits/test/PCHIPBeta_test.circom` if interface changes
3. Recompile: `./circuits/test/compile_circuit.sh`
4. Validate: `./circuits/test/validate_circuit_manual.sh`
5. Update documentation if constraints change significantly

### Benchmarking

```bash
# Generate proving key (requires trusted setup - not included)
# This is for future Phase 3 work

# Measure proof generation time
time snarkjs groth16 prove proving_key.zkey witness.wtns proof.json public.json

# Measure verification time
time snarkjs groth16 verify verification_key.json public.json proof.json
```

## Documentation

- **`PHASE2_IMPLEMENTATION.md`** - Complete Phase 2 technical documentation
  - Architecture details
  - Security analysis
  - Constraint breakdown
  - Integration guide

- **`test/`** - Test infrastructure
  - `generate_test_inputs.js` - Creates test input files
  - `compile_circuit.sh` - Compilation with constraint analysis
  - `validate_circuit_manual.sh` - Runs all test vectors

## References

- **CIRCOM Language**: https://docs.circom.io/
- **snarkjs**: https://github.com/iden3/snarkjs
- **circomlib**: https://github.com/iden3/circomlib
- **Phase 1 Docs**: `zk_integration/phase1_step1/PHASE1_COMPLETION.md`
- **Solidity Reference**: `contracts/ZKVerifier.sol`

## License

See main project LICENSE file.

## Support

For issues or questions:
1. Check troubleshooting section above
2. Review `PHASE2_IMPLEMENTATION.md` for detailed technical info
3. Verify circom version: `circom --version` (need 2.0+)
4. Check compilation logs: `circuits/build/compile.log`
