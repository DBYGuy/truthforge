const fs = require('fs');
const path = require('path');

/**
 * Generate test input files for PCHIPBeta circuit validation
 *
 * This script creates input.json files for each test case from test_vectors.json
 * to validate the CIRCOM implementation against the Solidity reference.
 *
 * Usage:
 *   node generate_test_inputs.js
 *
 * Output:
 *   Creates test_inputs/ directory with input_0.json, input_1.json, etc.
 */

// Load test vectors
const testVectorsPath = path.join(__dirname, '../../zk_integration/phase1_step1/test_vectors.json');
const testVectors = JSON.parse(fs.readFileSync(testVectorsPath, 'utf8'));

// Create output directory
const outputDir = path.join(__dirname, 'test_inputs');
if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
}

// Generate input file for each test case
testVectors.test_cases.forEach((testCase, index) => {
    const input = {
        uniform_input: testCase.uniform_input.toString()
    };

    const outputPath = path.join(outputDir, `input_${index}.json`);
    fs.writeFileSync(outputPath, JSON.stringify(input, null, 2));

    console.log(`Generated ${outputPath}`);
    console.log(`  Test: ${testCase.name}`);
    console.log(`  Input: ${testCase.uniform_input}`);
    console.log(`  Expected: ${testCase.expected_output}`);
    console.log(`  Tolerance: ${testCase.tolerance}`);
    console.log('');
});

// Generate summary file with expected outputs
const summary = {
    description: "Test input files for PCHIPBeta circuit validation",
    generated_at: new Date().toISOString(),
    total_test_cases: testVectors.test_cases.length,
    test_cases: testVectors.test_cases.map((tc, idx) => ({
        file: `input_${idx}.json`,
        name: tc.name,
        uniform_input: tc.uniform_input,
        expected_output: tc.expected_output,
        tolerance: tc.tolerance,
        notes: tc.notes
    }))
};

const summaryPath = path.join(outputDir, 'test_summary.json');
fs.writeFileSync(summaryPath, JSON.stringify(summary, null, 2));

console.log(`Generated ${summaryPath}`);
console.log(`Total test cases: ${testVectors.test_cases.length}`);
