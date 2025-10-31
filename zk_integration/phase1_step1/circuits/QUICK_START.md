# Quick Start Guide - CIRCOM Circuit Implementation

**Goal**: Implement PCHIPBeta.circom for TruthForge's bias calculation

---

## 1. Install circom (5 minutes)

```bash
cd scripts
./install_circom.sh
circom --version  # Should show 2.1.6+
```

---

## 2. Review Constants (2 minutes)

**Key Constant**: Modular inverse for division by 1e9
```
INV_SCALE = 10042720846718967555366586836808522468669512619243210865060536802291936071405
```

See: `CONSTANTS.md`

---

## 3. Circuit Template (Start Here)

Create `PCHIPBeta.circom`:

```circom
pragma circom 2.1.6;

template PCHIPBeta() {
    signal input uniform;   // Range: [0, 10000)
    signal output bias;     // Range: [0, 100]

    // Modular inverse of 1e9 mod BN254 prime
    var INV_SCALE = 10042720846718967555366586836808522468669512619243210865060536802291936071405;

    // TODO: Implement 10-interval piecewise linear interpolation
    // Reference: contracts/ZKVerifier.sol lines 228-258

    // Interval 1: [0, 5)
    // if (uniform < 5) { bias = (0 + 116370450 * uniform) * INV_SCALE }

    // Interval 2: [5, 200)
    // if (uniform < 200) { bias = (581852000 + 16734810 * (uniform-5)) * INV_SCALE }

    // ... continue for all 10 intervals
}

component main = PCHIPBeta();
```

---

## 4. Compile (1 minute)

```bash
cd scripts
./compile.sh PCHIPBeta
```

**Expected output**:
- `build/PCHIPBeta.r1cs`
- `build/PCHIPBeta_js/`
- Constraint count displayed

---

## 5. Test Single Case (30 seconds)

```bash
./test_circuit.sh 7  # Test case 7: Mean region
```

**Expected**:
- Input: 5000
- Expected output: 24
- Tolerance: ±1

---

## 6. Test All Cases (1 minute)

```bash
./test_circuit.sh
```

**Success**: All 11 tests pass within tolerance

---

## 7. Debugging

If tests fail:

```bash
# View R1CS constraints
npx snarkjs r1cs print build/PCHIPBeta.r1cs build/PCHIPBeta.sym | less

# Check constraint count
npx snarkjs r1cs info build/PCHIPBeta.r1cs

# Inspect witness values
cat build/witness.json | jq '.[0:10]'  # First 10 signals
```

---

## Test Cases Summary

| Case | Input | Expected | Tolerance | Notes |
|------|-------|----------|-----------|-------|
| 1 | 0 | 0 | 0 | Lower boundary |
| 7 | 5000 | 24 | 1 | Mean region |
| 11 | 9999 | 100 | 1 | Upper boundary |

Full test data: `test/test_summary.json`

---

## Performance Targets

- **Constraints**: <5000 (lower is better)
- **Witness time**: <1 second
- **Test success**: 11/11 passing

---

## Reference Implementation

See `contracts/ZKVerifier.sol` lines 228-258 for exact algorithm.

**Pattern for each interval**:
```
dx = uniform - interval_start
result = (a + b * dx) / 1e9
```

**In CIRCOM** (replace division with modular inverse):
```circom
signal dx <== uniform - interval_start;
signal scaled <== a + b * dx;
bias <== scaled * INV_SCALE;
```

---

## Need Help?

1. **Full docs**: See `README.md`
2. **Constants**: See `CONSTANTS.md`
3. **Setup report**: See `../INFRASTRUCTURE_SETUP_COMPLETE.md`

---

**Ready to implement!** 🚀
