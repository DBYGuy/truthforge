# Debug PCHIP Implementation - Identify Issues
# Dr. Alex Chen - Applied Mathematics Solution

using Distributions, Random, StatsBase
Random.seed!(42)

println("=== DEBUGGING PCHIP IMPLEMENTATION ===\n")

# Reference Beta(2,5) distribution
beta_dist = Beta(2, 5)
println("Beta(2,5) Properties:")
println("Mean: $(round(mean(beta_dist) * 100, digits=2))")
println("Std: $(round(std(beta_dist) * 100, digits=2))")
println("P(X > 0.5): $(round((1 - cdf(beta_dist, 0.5)) * 100, digits=2))%")
println()

# Test the knot values directly
u_11knot = [0, 10, 500, 1590, 2000, 4130, 6000, 7940, 9000, 9990, 10000]
y_11knot = 100 .* quantile.(Ref(beta_dist), u_11knot / 10000.0)

println("11-Knot Configuration:")
println("u     | prob  | beta_val")
println("------|-------|----------")
for i in 1:length(u_11knot)
    prob = u_11knot[i] / 10000.0
    beta_val = y_11knot[i]
    println("$(lpad(u_11knot[i], 5)) | $(lpad(round(prob, digits=3), 5)) | $(lpad(round(beta_val, digits=2), 8))")
end
println()

# Test direct polynomial evaluation at knot points
# If coefficients are correct, polynomial should equal y values at knots

# Expert's coefficients (scaled by 1e9)
a_scaled = [0, 825549279, 3298663114, 5654043956, 6654044055, 8484043956, 9322043956, 9894043956, 9962043956, 9998043956]
b_scaled = [83983192, 25966858, 75949999, 28500000, 48300000, 16800000, 11460000, 1368000, 3600000, 400000]
c_scaled = [5373154, -53276, -126545, -48000, -48000, -2700, -1824, 1470, 600, 0]
d_scaled = [-551598, 47, 139, 30, 30, 1, 4, -59, -30, 0]

# Convert to unscaled
scale = 1e9
a = a_scaled ./ scale
b = b_scaled ./ scale
c = c_scaled ./ scale
d = d_scaled ./ scale

println("Testing Polynomial Evaluation at Knots:")
println("Knot | Expected | a + b*0 | Error | Notes")
println("-----|----------|---------|-------|------")

for i in 1:length(a)
    knot_u = u_11knot[i]
    expected = y_11knot[i]
    
    # At the start of interval i, dx = 0, so polynomial = a[i]
    computed = a[i]
    error = abs(computed - expected)
    
    note = error < 0.1 ? "✓" : "✗"
    
    println("$(lpad(knot_u, 4)) | $(lpad(round(expected, digits=2), 8)) | $(lpad(round(computed, digits=2), 7)) | $(lpad(round(error, digits=2), 5)) | $(note)")
end
println()

# Check end points of intervals
println("Testing Polynomial Evaluation at Interval Endpoints:")
println("Int | [Start, End] | f(start) | f(end) | Expected_end | End_Error")
println("----|--------------|----------|--------|--------------|----------")

for i in 1:length(a)
    start_u = u_11knot[i]
    end_u = u_11knot[i+1]
    expected_end = y_11knot[i+1]
    
    # f(start) = a[i] (dx = 0)
    f_start = a[i]
    
    # f(end) where dx = end_u - start_u
    dx = Float64(end_u - start_u)
    f_end = a[i] + b[i]*dx + c[i]*dx^2 + d[i]*dx^3
    
    end_error = abs(f_end - expected_end)
    note = end_error < 0.1 ? "✓" : "✗"
    
    println("$(lpad(i, 3)) | [$(lpad(start_u, 4)), $(lpad(end_u, 4))] | $(lpad(round(f_start, digits=2), 8)) | $(lpad(round(f_end, digits=2), 6)) | $(lpad(round(expected_end, digits=2), 12)) | $(lpad(round(end_error, digits=2), 9)) $(note)")
end
println()

# Simple evaluation function test
function simple_pchip_eval(u_val::Float64)
    # Find interval
    interval = 1
    for i in 1:length(u_11knot)-1
        if u_val >= u_11knot[i] && u_val <= u_11knot[i+1]
            interval = i
            break
        end
    end
    
    dx = u_val - u_11knot[interval]
    result = a[interval] + b[interval]*dx + c[interval]*dx^2 + d[interval]*dx^3
    
    return result
end

# Test evaluation at several points
println("Testing PCHIP Evaluation at Sample Points:")
println("u     | Expected (approx) | PCHIP Result | Error")
println("------|-------------------|--------------|------")

test_points = [0, 100, 1000, 2500, 5000, 7500, 9000, 9999]
for u_val in test_points
    expected = 100 * quantile(beta_dist, u_val / 10000.0)
    computed = simple_pchip_eval(Float64(u_val))
    error = abs(computed - expected)
    
    println("$(lpad(u_val, 5)) | $(lpad(round(expected, digits=2), 17)) | $(lpad(round(computed, digits=2), 12)) | $(lpad(round(error, digits=2), 5))")
end
println()

# Generate samples to check distribution
println("Testing Sample Generation:")
n_samples = 10000
samples = Float64[]

for i in 1:n_samples
    u_random = rand(0:9999)
    bias_val = simple_pchip_eval(Float64(u_random))
    push!(samples, clamp(bias_val, 0.0, 100.0))
end

actual_mean = mean(samples)
actual_std = std(samples)
actual_penalty = sum(samples .> 50) / length(samples) * 100

expected_mean = mean(beta_dist) * 100
expected_std = std(beta_dist) * 100
expected_penalty = (1 - cdf(beta_dist, 0.5)) * 100

println("Sample Distribution Results:")
println("Mean: $(round(actual_mean, digits=2)) (expected: $(round(expected_mean, digits=2)))")
println("Std:  $(round(actual_std, digits=2)) (expected: $(round(expected_std, digits=2)))")
println("Penalty: $(round(actual_penalty, digits=2))% (expected: $(round(expected_penalty, digits=2))%)")

mean_error = abs(actual_mean - expected_mean) / expected_mean * 100
penalty_error = abs(actual_penalty - expected_penalty)

println("\\nErrors:")
println("Mean error: $(round(mean_error, digits=2))%")
println("Penalty error: $(round(penalty_error, digits=2)) percentage points")

if mean_error < 5 && penalty_error < 2
    println("\\n✅ PCHIP Implementation Working Correctly")
else
    println("\\n❌ PCHIP Implementation Has Issues")
    
    # Additional debugging
    println("\\nDEBUG INFO:")
    println("Sample range: [$(round(minimum(samples), digits=2)), $(round(maximum(samples), digits=2))]")
    println("Negative samples: $(sum(samples .< 0))")
    println("Samples > 100: $(sum(samples .> 100))")
    
    # Check individual intervals
    println("\\nInterval Debug:")
    for i in 1:length(a)
        start_u = u_11knot[i]
        end_u = u_11knot[i+1]
        
        # Sample 10 points in this interval
        interval_samples = Float64[]
        for j in 1:10
            test_u = start_u + (end_u - start_u) * (j-1) / 9
            val = simple_pchip_eval(Float64(test_u))
            push!(interval_samples, val)
        end
        
        interval_min = minimum(interval_samples)
        interval_max = maximum(interval_samples)
        monotonic = all(interval_samples[i] <= interval_samples[i+1] for i in 1:length(interval_samples)-1)
        
        println("Interval $(i): [$(start_u), $(end_u)] -> [$(round(interval_min, digits=2)), $(round(interval_max, digits=2))] $(monotonic ? "✓" : "✗")")
    end
end

println("\\n=== DEBUG COMPLETE ===")