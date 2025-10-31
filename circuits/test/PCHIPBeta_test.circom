pragma circom 2.0.0;

include "../PCHIPBeta.circom";

/*
 * PCHIPBeta_test: Test harness for PCHIPBeta circuit
 *
 * This test circuit allows direct testing with known uniform values
 * by bypassing the Poseidon entropy generation.
 *
 * For production testing, use the generate_test_inputs.js script to
 * create proper input files with nullifier/secret pairs.
 */
template PCHIPBeta_test() {
    signal input uniform_input;  // Direct uniform input for testing
    signal output bias_output;

    // For this test version, we calculate bias directly from uniform input
    // This matches the Solidity reference implementation exactly

    // Interval selection comparators
    component lt_5 = LessThan(14);
    component lt_200 = LessThan(14);
    component lt_800 = LessThan(14);
    component lt_1800 = LessThan(14);
    component lt_3500 = LessThan(14);
    component lt_5500 = LessThan(14);
    component lt_7500 = LessThan(14);
    component lt_8800 = LessThan(14);
    component lt_9800 = LessThan(14);

    lt_5.in[0] <== uniform_input;
    lt_5.in[1] <== 5;

    lt_200.in[0] <== uniform_input;
    lt_200.in[1] <== 200;

    lt_800.in[0] <== uniform_input;
    lt_800.in[1] <== 800;

    lt_1800.in[0] <== uniform_input;
    lt_1800.in[1] <== 1800;

    lt_3500.in[0] <== uniform_input;
    lt_3500.in[1] <== 3500;

    lt_5500.in[0] <== uniform_input;
    lt_5500.in[1] <== 5500;

    lt_7500.in[0] <== uniform_input;
    lt_7500.in[1] <== 7500;

    lt_8800.in[0] <== uniform_input;
    lt_8800.in[1] <== 8800;

    lt_9800.in[0] <== uniform_input;
    lt_9800.in[1] <== 9800;

    // Interval flags
    signal flag[10];

    flag[0] <== lt_5.out;
    flag[1] <== lt_200.out * (1 - lt_5.out);
    flag[2] <== lt_800.out * (1 - lt_200.out);
    flag[3] <== lt_1800.out * (1 - lt_800.out);
    flag[4] <== lt_3500.out * (1 - lt_1800.out);
    flag[5] <== lt_5500.out * (1 - lt_3500.out);
    flag[6] <== lt_7500.out * (1 - lt_5500.out);
    flag[7] <== lt_8800.out * (1 - lt_7500.out);
    flag[8] <== lt_9800.out * (1 - lt_8800.out);
    flag[9] <== 1 - lt_9800.out;

    // Soundness check
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
    flag_sum === 1;

    // Coefficient tables
    var knots[11] = [0, 5, 200, 800, 1800, 3500, 5500, 7500, 8800, 9800, 10000];
    var a_scaled[10] = [
        0,             // Int 0
        581852000,     // Int 1
        3845141000,    // Int 2
        8156862000,    // Int 3
        13106995000,   // Int 4
        20218104000,   // Int 5
        28641175000,   // Int 6
        38947949000,   // Int 7
        48903108000,   // Int 8
        65826649000    // Int 9
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

    // Coefficient selection
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

    // Calculate dx and bias_scaled
    signal dx;
    dx <== uniform_input - knot_selected;

    signal bias_scaled;
    bias_scaled <== a_selected + b_selected * dx;

    // Division by 1e9
    var INV_1E9 = 10042720846718967555366586836808522468669512619243210865060536802291936071405;

    signal bias_raw;
    bias_raw <== bias_scaled * INV_1E9;

    // Range validation
    component bias_le_100 = LessEqThan(8);
    bias_le_100.in[0] <== bias_raw;
    bias_le_100.in[1] <== 100;
    bias_le_100.out === 1;

    bias_output <== bias_raw;
}

component main = PCHIPBeta_test();
