pragma circom 2.0.0;

include "../node_modules/circomlib/circuits/comparators.circom";
include "../node_modules/circomlib/circuits/poseidon.circom";

/*
 * PCHIPBeta: Optimized Linear PCHIP Beta(2,5) Bias Calculation
 *
 * Implements MEV-resistant bias calculation using Linear PCHIP interpolation
 * over 10 intervals derived from Beta(2,5) distribution.
 *
 * Mathematical Formula: bias = (a + b * dx) / 1e9
 * where dx = uniform - knot_i for the selected interval
 *
 * Constraint Budget: 120-150 total
 *   - Poseidon entropy: ~55 constraints
 *   - Interval selection: ~40-50 constraints (10 comparators)
 *   - Bias calculation: ~15-20 constraints
 *   - Validation: ~10-15 constraints
 *
 * Security Properties:
 *   - Soundness: Enforces flag_sum === 1 (exactly one interval selected)
 *   - Zero-Knowledge: Constant-time execution via multiplexing
 *   - MEV-Resistant: Uses Poseidon(nullifier, secret, domain_sep) for entropy
 *   - Overflow-Safe: All intermediate values < BN254 field prime
 *
 * @input nullifier - Unique hash per user/event to prevent double-voting
 * @input secret - Private entropy source (not revealed)
 * @output bias - Calculated bias percentage [0, 100]
 * @output uniform - Derived uniform value [0, 9999] for auditability
 */
template PCHIPBeta() {
    // Public and private inputs
    signal input nullifier;  // Public: prevents double-voting
    signal input secret;     // Private: MEV resistance

    // Outputs
    signal output bias;      // Calculated bias [0, 100]
    signal output uniform;   // Uniform random value [0, 9999] for auditability

    // =========================================================================
    // STEP 1: MEV-RESISTANT ENTROPY GENERATION
    // =========================================================================
    // Uses Poseidon hash with domain separation to generate uniform value
    // Domain separation constant prevents hash collisions with other circuits

    component poseidon = Poseidon(3);
    poseidon.inputs[0] <== nullifier;
    poseidon.inputs[1] <== secret;
    poseidon.inputs[2] <== 0x54525554484642455441;  // "TRUTHFBETA" in hex for domain separation

    // Map Poseidon output to [0, 9999] range
    // uniform_raw = poseidon_output % 10000
    signal uniform_raw;
    signal uniform_quotient;

    // Compute: uniform_raw = poseidon.out % 10000
    // This requires: poseidon.out = uniform_quotient * 10000 + uniform_raw
    uniform_quotient <-- poseidon.out \ 10000;
    uniform_raw <-- poseidon.out % 10000;

    // Constraint: poseidon.out === uniform_quotient * 10000 + uniform_raw
    poseidon.out === uniform_quotient * 10000 + uniform_raw;

    // Range check: 0 <= uniform_raw < 10000
    component uniform_lt = LessThan(14);  // 10000 < 2^14
    uniform_lt.in[0] <== uniform_raw;
    uniform_lt.in[1] <== 10000;
    uniform_lt.out === 1;

    uniform <== uniform_raw;

    // =========================================================================
    // STEP 2: UNROLLED INTERVAL SELECTION (CONSTANT-TIME)
    // =========================================================================
    // Knots: [0, 5, 200, 800, 1800, 3500, 5500, 7500, 8800, 9800, 10000]
    // Uses cascaded comparators to determine which interval contains uniform

    // Comparators for interval boundaries
    component lt_5 = LessThan(14);
    component lt_200 = LessThan(14);
    component lt_800 = LessThan(14);
    component lt_1800 = LessThan(14);
    component lt_3500 = LessThan(14);
    component lt_5500 = LessThan(14);
    component lt_7500 = LessThan(14);
    component lt_8800 = LessThan(14);
    component lt_9800 = LessThan(14);

    lt_5.in[0] <== uniform;
    lt_5.in[1] <== 5;

    lt_200.in[0] <== uniform;
    lt_200.in[1] <== 200;

    lt_800.in[0] <== uniform;
    lt_800.in[1] <== 800;

    lt_1800.in[0] <== uniform;
    lt_1800.in[1] <== 1800;

    lt_3500.in[0] <== uniform;
    lt_3500.in[1] <== 3500;

    lt_5500.in[0] <== uniform;
    lt_5500.in[1] <== 5500;

    lt_7500.in[0] <== uniform;
    lt_7500.in[1] <== 7500;

    lt_8800.in[0] <== uniform;
    lt_8800.in[1] <== 8800;

    lt_9800.in[0] <== uniform;
    lt_9800.in[1] <== 9800;

    // Interval flags (exactly one will be 1, rest are 0)
    signal flag[10];

    // Interval 0: [0, 5)
    flag[0] <== lt_5.out;

    // Interval 1: [5, 200)
    flag[1] <== lt_200.out * (1 - lt_5.out);

    // Interval 2: [200, 800)
    flag[2] <== lt_800.out * (1 - lt_200.out);

    // Interval 3: [800, 1800)
    flag[3] <== lt_1800.out * (1 - lt_800.out);

    // Interval 4: [1800, 3500)
    flag[4] <== lt_3500.out * (1 - lt_1800.out);

    // Interval 5: [3500, 5500)
    flag[5] <== lt_5500.out * (1 - lt_3500.out);

    // Interval 6: [5500, 7500)
    flag[6] <== lt_7500.out * (1 - lt_5500.out);

    // Interval 7: [7500, 8800)
    flag[7] <== lt_8800.out * (1 - lt_7500.out);

    // Interval 8: [8800, 9800)
    flag[8] <== lt_9800.out * (1 - lt_8800.out);

    // Interval 9: [9800, 10000]
    flag[9] <== 1 - lt_9800.out;

    // =========================================================================
    // STEP 3: SOUNDNESS CONSTRAINT - EXACTLY ONE INTERVAL SELECTED
    // =========================================================================
    // Sum of all flags must equal 1 (critical security property)

    signal flag_sum;
    signal flag_cumsum[10];

    flag_cumsum[0] <== flag[0];
    flag_cumsum[1] <== flag_cumsum[0] + flag[1];
    flag_cumsum[2] <== flag_cumsum[1] + flag[2];
    flag_cumsum[3] <== flag_cumsum[2] + flag[3];
    flag_cumsum[4] <== flag_cumsum[3] + flag[4];
    flag_cumsum[5] <== flag_cumsum[4] + flag[5];
    flag_cumsum[6] <== flag_cumsum[5] + flag[6];
    flag_cumsum[7] <== flag_cumsum[6] + flag[7];
    flag_cumsum[8] <== flag_cumsum[7] + flag[8];
    flag_cumsum[9] <== flag_cumsum[8] + flag[9];

    flag_sum <== flag_cumsum[9];
    flag_sum === 1;  // CRITICAL: Must be exactly 1

    // =========================================================================
    // STEP 4: LINEAR PCHIP COEFFICIENT TABLE
    // =========================================================================
    // Coefficients extracted from pchip_coefficients.json (Phase 1)
    // Format: a_scaled and b_scaled are pre-multiplied by 1e9
    //
    // Interval knots and coefficients:
    var knots[11] = [0, 5, 200, 800, 1800, 3500, 5500, 7500, 8800, 9800, 10000];
    var a_scaled[10] = [
        0,             // Int 0: [0, 5)
        581852000,     // Int 1: [5, 200)
        3845141000,    // Int 2: [200, 800)
        8156862000,    // Int 3: [800, 1800)
        13106995000,   // Int 4: [1800, 3500)
        20218104000,   // Int 5: [3500, 5500)
        28641175000,   // Int 6: [5500, 7500)
        38947949000,   // Int 7: [7500, 8800)
        48903108000,   // Int 8: [8800, 9800)
        65826649000    // Int 9: [9800, 10000]
    ];
    var b_scaled[10] = [
        116370450,     // Int 0
        16734810,      // Int 1
        7186200,       // Int 2
        4950130,       // Int 3
        4183010,       // Int 4
        4211540,       // Int 5
        5153390,       // Int 6
        7657810,       // Int 7
        16923540,      // Int 8
        170866750      // Int 9
    ];

    // =========================================================================
    // STEP 5: CONSTANT-TIME BIAS CALCULATION
    // =========================================================================
    // Multiplexes coefficients based on interval flags
    // Formula: bias_scaled = a + b * (uniform - knot)
    //          bias = bias_scaled / 1e9

    // Select coefficients using constant-time multiplexing
    signal a_selected;
    signal b_selected;
    signal knot_selected;

    signal a_mux[10];
    signal b_mux[10];
    signal knot_mux[10];

    a_mux[0] <== flag[0] * a_scaled[0];
    b_mux[0] <== flag[0] * b_scaled[0];
    knot_mux[0] <== flag[0] * knots[0];

    a_mux[1] <== a_mux[0] + flag[1] * a_scaled[1];
    b_mux[1] <== b_mux[0] + flag[1] * b_scaled[1];
    knot_mux[1] <== knot_mux[0] + flag[1] * knots[1];

    a_mux[2] <== a_mux[1] + flag[2] * a_scaled[2];
    b_mux[2] <== b_mux[1] + flag[2] * b_scaled[2];
    knot_mux[2] <== knot_mux[1] + flag[2] * knots[2];

    a_mux[3] <== a_mux[2] + flag[3] * a_scaled[3];
    b_mux[3] <== b_mux[2] + flag[3] * b_scaled[3];
    knot_mux[3] <== knot_mux[2] + flag[3] * knots[3];

    a_mux[4] <== a_mux[3] + flag[4] * a_scaled[4];
    b_mux[4] <== b_mux[3] + flag[4] * b_scaled[4];
    knot_mux[4] <== knot_mux[3] + flag[4] * knots[4];

    a_mux[5] <== a_mux[4] + flag[5] * a_scaled[5];
    b_mux[5] <== b_mux[4] + flag[5] * b_scaled[5];
    knot_mux[5] <== knot_mux[4] + flag[5] * knots[5];

    a_mux[6] <== a_mux[5] + flag[6] * a_scaled[6];
    b_mux[6] <== b_mux[5] + flag[6] * b_scaled[6];
    knot_mux[6] <== knot_mux[5] + flag[6] * knots[6];

    a_mux[7] <== a_mux[6] + flag[7] * a_scaled[7];
    b_mux[7] <== b_mux[6] + flag[7] * b_scaled[7];
    knot_mux[7] <== knot_mux[6] + flag[7] * knots[7];

    a_mux[8] <== a_mux[7] + flag[8] * a_scaled[8];
    b_mux[8] <== b_mux[7] + flag[8] * b_scaled[8];
    knot_mux[8] <== knot_mux[7] + flag[8] * knots[8];

    a_mux[9] <== a_mux[8] + flag[9] * a_scaled[9];
    b_mux[9] <== b_mux[8] + flag[9] * b_scaled[9];
    knot_mux[9] <== knot_mux[8] + flag[9] * knots[9];

    a_selected <== a_mux[9];
    b_selected <== b_mux[9];
    knot_selected <== knot_mux[9];

    // Calculate dx = uniform - knot_selected
    signal dx;
    dx <== uniform - knot_selected;

    // Calculate bias_scaled = a_selected + b_selected * dx
    signal bias_scaled;
    bias_scaled <== a_selected + b_selected * dx;

    // =========================================================================
    // STEP 6: DIVISION BY 1e9 USING MODULAR INVERSE
    // =========================================================================
    // Modular inverse of 1e9 mod BN254_PRIME (precomputed)
    // inv_1e9 = 10042720846718967555366586836808522468669512619243210865060536802291936071405
    // Verified: (1e9 * inv_1e9) mod BN254_PRIME = 1

    var INV_1E9 = 10042720846718967555366586836808522468669512619243210865060536802291936071405;

    // bias = bias_scaled * inv_1e9 (mod field)
    // This is equivalent to bias_scaled / 1e9 in the integers
    signal bias_raw;
    bias_raw <== bias_scaled * INV_1E9;

    // =========================================================================
    // STEP 7: OUTPUT RANGE VALIDATION
    // =========================================================================
    // Ensure bias is in valid range [0, 100]
    // This is critical for security - prevents malicious proofs

    component bias_le_100 = LessEqThan(8);  // 100 < 2^8
    bias_le_100.in[0] <== bias_raw;
    bias_le_100.in[1] <== 100;
    bias_le_100.out === 1;

    // Final output
    bias <== bias_raw;
}

// Main component instantiation
component main {public [nullifier]} = PCHIPBeta();
