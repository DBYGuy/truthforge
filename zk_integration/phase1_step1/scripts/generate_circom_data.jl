#!/usr/bin/env julia
"""
Phase 1, Step 1: Generate CIRCOM-compatible coefficient data
Extracts Linear PCHIP Beta(2,5) coefficients from validated Solidity implementation
"""

using JSON

println("="^70)
println("PHASE 1 STEP 1: CIRCOM Data Generation")
println("="^70)
println()

# Extracted coefficients from ZKVerifier.sol lines 228-258
# Format: (a_scaled, b_scaled, c_scaled, d_scaled)
solidity_coeffs = [
    (0, 116370450, 0, 0),                # Interval 1: [0, 5]
    (581852000, 16734810, 0, 0),         # Interval 2: [5, 200]
    (3845141000, 7186200, 0, 0),         # Interval 3: [200, 800]
    (8156862000, 4950130, 0, 0),         # Interval 4: [800, 1800]
    (13106995000, 4183010, 0, 0),        # Interval 5: [1800, 3500]
    (20218104000, 4211540, 0, 0),        # Interval 6: [3500, 5500]
    (28641175000, 5153390, 0, 0),        # Interval 7: [5500, 7500]
    (38947949000, 7657810, 0, 0),        # Interval 8: [7500, 8800]
    (48903108000, 16923540, 0, 0),       # Interval 9: [8800, 9800]
    (65826649000, 170866750, 0, 0)       # Interval 10: [9800, 10000]
]

# Knot points defining interval boundaries
knots = [0, 5, 200, 800, 1800, 3500, 5500, 7500, 8800, 9800, 10000]

# Beta(2,5) quantile values at knots (for reference/validation)
quantile_values = [
    0.00,      # u=0
    0.581852,  # u=5
    3.845141,  # u=200
    8.156862,  # u=800
    13.106995, # u=1800
    20.218104, # u=3500
    28.641175, # u=5500
    38.947949, # u=7500
    48.903108, # u=8800
    65.826649, # u=9800
    100.0      # u=10000
]

interval_notes = [
    "Early tail region - steep gradient",
    "Low bias transition zone",
    "Core distribution - gradual slope",
    "Core distribution - stable region",
    "Mid-range approach to mean",
    "Mean region (~28.6%)",
    "Upper distribution rise",
    "Penalty threshold approach (50%)",
    "High bias region",
    "Upper tail - very steep gradient"
]

# Build main coefficient data structure
coeffs_data = Dict(
    "metadata" => Dict(
        "implementation" => "Linear PCHIP Beta(2,5)",
        "version" => "CORRECTED_LINEAR_PCHIP_BETA_2_5_V1",
        "date_generated" => "2025-10-30",
        "source_file" => "contracts/ZKVerifier.sol",
        "source_lines" => "228-258",
        "source_function" => "_calculateBiasV2",
        "validation" => Dict(
            "mean_error_pct" => 1.73,
            "penalty_error_pts" => 0.1,
            "monotonicity_violations" => 0,
            "continuity_max_gap" => 9.0e-6,
            "requirements_met" => "8/8",
            "validation_sample_size" => 100001
        ),
        "mathematical_form" => "f(u) = (a + b * (u - u_i)) / scale_factor",
        "field" => "BN254",
        "field_prime" => "21888242871839275222246405745257275088548364400416034343698204186575808495617",
        "constraint_estimate" => "200-250 total (PCHIP + entropy)"
    ),
    "configuration" => Dict(
        "num_knots" => 11,
        "num_intervals" => 10,
        "input_range" => [0, 10000],
        "input_description" => "Uniform distribution [0, 9999]",
        "output_range" => [0, 100],
        "output_description" => "Bias percentage",
        "scale_factor" => 1000000000,
        "scale_factor_notation" => "1e9",
        "polynomial_degree" => 1,
        "polynomial_type" => "linear"
    ),
    "knots" => knots,
    "quantile_values" => quantile_values,
    "intervals" => []
)

# Generate interval data
println("Extracting interval data...")
for i in 1:10
    a, b, c, d = solidity_coeffs[i]

    interval = Dict(
        "index" => i - 1,  # 0-indexed for CIRCOM
        "range" => [knots[i], knots[i+1]],
        "length" => knots[i+1] - knots[i],
        "a_scaled" => string(a),
        "b_scaled" => string(b),
        "c_scaled" => string(c),
        "d_scaled" => string(d),
        "beta_value_start" => quantile_values[i],
        "beta_value_end" => quantile_values[i+1],
        "formula" => "bias = ($(a) + $(b)*dx) / 1e9, where dx = u - $(knots[i])",
        "notes" => interval_notes[i]
    )

    push!(coeffs_data["intervals"], interval)
    println("  ✓ Interval $(i): [$(knots[i]), $(knots[i+1])]")
end

# Add validation metrics
coeffs_data["validation_metrics"] = Dict(
    "mean_target" => 28.57,
    "mean_achieved" => 28.81,
    "std_target" => 16.04,
    "std_achieved" => 16.10,
    "penalty_rate_target" => 0.104,
    "penalty_rate_achieved" => 0.1061,
    "ks_statistic" => 0.0164,
    "ks_threshold" => 0.02
)

# Write pchip_coefficients.json
output_file = "../pchip_coefficients.json"
println("\nWriting coefficient data...")
open(output_file, "w") do f
    JSON.print(f, coeffs_data, 2)
end
println("✅ Generated: pchip_coefficients.json")

# Generate test vectors
println("\nGenerating test vectors...")

test_vectors = Dict(
    "description" => "Test vectors for validating CIRCOM implementation against Solidity reference",
    "usage" => "Compare CIRCOM circuit output against expected_output for each test case",
    "test_cases" => [
        Dict(
            "name" => "Lower boundary",
            "uniform_input" => 0,
            "expected_output" => 0,
            "tolerance" => 0,
            "notes" => "Exact zero at domain start"
        ),
        Dict(
            "name" => "First interval midpoint",
            "uniform_input" => 3,
            "expected_output" => 0,
            "tolerance" => 1,
            "notes" => "Within first steep region"
        ),
        Dict(
            "name" => "First knot boundary",
            "uniform_input" => 5,
            "expected_output" => 0,
            "tolerance" => 1,
            "notes" => "Boundary between intervals 1-2"
        ),
        Dict(
            "name" => "Early transition",
            "uniform_input" => 100,
            "expected_output" => 2,
            "tolerance" => 1,
            "notes" => "Interval 2 midpoint"
        ),
        Dict(
            "name" => "Second knot",
            "uniform_input" => 200,
            "expected_output" => 3,
            "tolerance" => 1,
            "notes" => "Boundary between intervals 2-3"
        ),
        Dict(
            "name" => "Core distribution",
            "uniform_input" => 1000,
            "expected_output" => 9,
            "tolerance" => 1,
            "notes" => "Interval 4 - stable region"
        ),
        Dict(
            "name" => "Mean region",
            "uniform_input" => 5000,
            "expected_output" => 24,
            "tolerance" => 1,
            "notes" => "Near distribution mean (~28.6%)"
        ),
        Dict(
            "name" => "Penalty threshold",
            "uniform_input" => 8800,
            "expected_output" => 48,
            "tolerance" => 1,
            "notes" => "Start of high bias region"
        ),
        Dict(
            "name" => "Upper tail start",
            "uniform_input" => 9800,
            "expected_output" => 65,
            "tolerance" => 1,
            "notes" => "Start of steep upper tail"
        ),
        Dict(
            "name" => "Near upper boundary",
            "uniform_input" => 9900,
            "expected_output" => 82,
            "tolerance" => 2,
            "notes" => "Very steep gradient region"
        ),
        Dict(
            "name" => "Upper boundary",
            "uniform_input" => 9999,
            "expected_output" => 100,
            "tolerance" => 1,
            "notes" => "Maximum domain value"
        )
    ],
    "bulk_validation" => Dict(
        "description" => "Statistical validation over full range",
        "method" => "Generate 10,000+ random samples and compute statistics",
        "sample_points" => 10001,
        "expected_mean" => 28.57,
        "expected_std" => 16.04,
        "expected_penalty_rate" => 0.104,
        "tolerance_mean_pct" => 2.0,
        "tolerance_std_pct" => 3.0,
        "tolerance_penalty_pts" => 1.0
    )
)

# Write test_vectors.json
test_file = "../test_vectors.json"
open(test_file, "w") do f
    JSON.print(f, test_vectors, 2)
end
println("✅ Generated: test_vectors.json")

println("\n" * "="^70)
println("DATA GENERATION COMPLETE")
println("="^70)
println("\nFiles created:")
println("  • pchip_coefficients.json - Main coefficient data for CIRCOM")
println("  • test_vectors.json       - Validation test cases")
println("\nNext step: Run validation test suite")
println("  julia scripts/test_extracted_data.jl")
println()
