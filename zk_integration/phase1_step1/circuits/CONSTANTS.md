# CIRCOM Circuit Constants

## BN254 Prime Field
CIRCOM uses the BN254 (alt_bn128) elliptic curve with prime field:
```
p = 21888242871839275222246405745257275088548364400416034343698204186575808495617
```

## Scaling Factor
For division operations, we use a scaling factor:
```
SCALE = 1e9 = 1000000000
```

## Modular Inverse (Critical for Circuit)
The modular inverse of SCALE mod p, required for division in the circuit:
```
INV_SCALE = 10042720846718967555366586836808522468669512619243210865060536802291936071405
```

### Verification
```
(SCALE * INV_SCALE) mod p = 1
(1000000000 * 10042720846718967555366586836808522468669512619243210865060536802291936071405) mod p = 1
```

## Usage in CIRCOM
To perform division by 1e9 in the circuit:
```circom
// Instead of: result = value / 1e9
// Use: result = (value * INV_SCALE) % p
signal output result <== value * 10042720846718967555366586836808522468669512619243210865060536802291936071405;
```

## PCHIP Coefficients
All coefficient values (a, b) from `pchip_coefficients.json` are already scaled by 1e9.
To get the final result in range [0, 100], multiply by INV_SCALE in the circuit.

## Interval Boundaries
```
Interval 1:  [0, 5]
Interval 2:  [5, 200]
Interval 3:  [200, 800]
Interval 4:  [800, 1800]
Interval 5:  [1800, 3500]
Interval 6:  [3500, 5500]
Interval 7:  [5500, 7500]
Interval 8:  [7500, 8800]
Interval 9:  [8800, 9800]
Interval 10: [9800, 10000]
```

## Linear PCHIP Formula
```
result = (a + b * dx) * INV_SCALE
where:
  dx = uniform - interval_start
  a, b are pre-scaled by 1e9
```
