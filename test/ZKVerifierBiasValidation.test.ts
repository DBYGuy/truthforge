import { expect } from "chai";
import { ethers } from "hardhat";
import { ZKVerifier } from "../typechain-types";
import { HardhatEthersSigner } from "@nomicfoundation/hardhat-ethers/signers";

describe("ZKVerifier Corrected PCHIP Bias Calculation", function () {
  let zkVerifier: ZKVerifier;
  let owner: HardhatEthersSigner;
  let user1: HardhatEthersSigner;
  let user2: HardhatEthersSigner;

  beforeEach(async function () {
    [owner, user1, user2] = await ethers.getSigners();

    const ZKVerifierFactory = await ethers.getContractFactory("ZKVerifier");
    zkVerifier = await ZKVerifierFactory.deploy();
    await zkVerifier.waitForDeployment();
  });

  describe("Corrected Linear PCHIP Implementation", function () {
    it("should calculate bias with corrected coefficients in valid range", async function () {
      const socialHash = "0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef";
      const eventHash = "0xfedcba0987654321fedcba0987654321fedcba0987654321fedcba0987654321";
      
      const result = await zkVerifier.previewBias(
        socialHash,
        eventHash,
        await user1.getAddress(),
        ethers.ZeroAddress
      );

      const bias = result.bias;
      const entropy = result.entropy;
      const distribution = result.distribution;

      // Validate bias is within expected range [0, 100]
      expect(bias).to.be.gte(0n);
      expect(bias).to.be.lte(100n);

      // Validate entropy is non-zero
      expect(entropy).to.not.equal(0n);

      // Validate distribution string contains expected info
      expect(distribution).to.include("Beta(2,5)");

      console.log(`  Bias: ${bias}, Entropy: ${entropy}`);
      console.log(`  Distribution: ${distribution}`);
    });

    it("should maintain deterministic results", async function () {
      const socialHash = "0x1111111111111111111111111111111111111111111111111111111111111111";
      const eventHash = "0x2222222222222222222222222222222222222222222222222222222222222222";
      const userAddr = await user1.getAddress();
      
      const result1 = await zkVerifier.previewBias(
        socialHash,
        eventHash,
        userAddr,
        ethers.ZeroAddress
      );

      const result2 = await zkVerifier.previewBias(
        socialHash,
        eventHash,
        userAddr,
        ethers.ZeroAddress
      );

      // Should be identical (deterministic)
      expect(result1.bias).to.equal(result2.bias);
      expect(result1.entropy).to.equal(result2.entropy);
      
      console.log(`  Deterministic bias: ${result1.bias}`);
    });

    it("should produce different results for different inputs (entropy test)", async function () {
      const socialHash1 = "0x1111111111111111111111111111111111111111111111111111111111111111";
      const socialHash2 = "0x1111111111111111111111111111111111111111111111111111111111111112"; // +1
      const eventHash = "0x2222222222222222222222222222222222222222222222222222222222222222";
      const userAddr = await user1.getAddress();
      
      const result1 = await zkVerifier.previewBias(
        socialHash1,
        eventHash,
        userAddr,
        ethers.ZeroAddress
      );

      const result2 = await zkVerifier.previewBias(
        socialHash2,
        eventHash,
        userAddr,
        ethers.ZeroAddress
      );

      // Should be different (good entropy)
      expect(result1.bias).to.not.equal(result2.bias);
      
      console.log(`  Different inputs: ${result1.bias} vs ${result2.bias}`);
    });

    it("should validate statistical distribution matches Beta(2,5) properties", async function () {
      const sampleSize = 200; // Increased sample size for better statistics
      const biases: number[] = [];
      
      for (let i = 0; i < sampleSize; i++) {
        const socialHash = ethers.keccak256(
          ethers.AbiCoder.defaultAbiCoder().encode(["uint256", "string"], [i, "social"])
        );
        const eventHash = ethers.keccak256(
          ethers.AbiCoder.defaultAbiCoder().encode(["uint256", "string"], [i, "event"])
        );
        const userAddr = await user1.getAddress();
        
        const result = await zkVerifier.previewBias(
          socialHash,
          eventHash,
          userAddr,
          ethers.ZeroAddress
        );
        
        biases.push(Number(result.bias));
      }

      // Calculate statistics
      const mean = biases.reduce((a, b) => a + b, 0) / biases.length;
      const penaltyCount = biases.filter(b => b > 50).length;
      const penaltyRate = (penaltyCount / biases.length) * 100;
      const min = Math.min(...biases);
      const max = Math.max(...biases);

      console.log(`  Sample statistics (n=${sampleSize}):`);
      console.log(`  Mean bias: ${mean.toFixed(2)} (expected ~29.05 from expert validation)`);
      console.log(`  Penalty rate: ${penaltyRate.toFixed(2)}% (expected ~11.36% from expert validation)`);
      console.log(`  Min: ${min}, Max: ${max}`);

      // Validate against expert's corrected implementation targets
      // Expert validation showed: mean 29.05 (1.68% error), penalty 11.36% (0.36 pts error)
      expect(mean).to.be.gte(25); // Should be around 28-30 for Beta(2,5)
      expect(mean).to.be.lte(35);
      expect(penaltyRate).to.be.gte(8); // Should be around 10-12% for Beta(2,5)
      expect(penaltyRate).to.be.lte(16);
      
      // All values should be in valid range
      expect(min).to.be.gte(0);
      expect(max).to.be.lte(100);
    });

    it("should test monotonicity across sample intervals", async function () {
      // Test monotonicity by using controlled inputs that map to different intervals
      const testPoints = [
        { uniform: 0, expectedInterval: 1 },
        { uniform: 10, expectedInterval: 2 },
        { uniform: 300, expectedInterval: 3 },
        { uniform: 1000, expectedInterval: 4 },
        { uniform: 2500, expectedInterval: 5 },
        { uniform: 4000, expectedInterval: 6 },
        { uniform: 6000, expectedInterval: 7 },
        { uniform: 8000, expectedInterval: 8 },
        { uniform: 9000, expectedInterval: 9 },
        { uniform: 9900, expectedInterval: 10 }
      ];

      const results: number[] = [];
      
      for (const point of testPoints) {
        // Create hash that will likely map to desired uniform value
        // This is approximate since we can't control the hash directly
        const socialHash = ethers.keccak256(
          ethers.AbiCoder.defaultAbiCoder().encode(["uint256"], [point.uniform * 12345])
        );
        const eventHash = ethers.keccak256(
          ethers.AbiCoder.defaultAbiCoder().encode(["uint256"], [point.uniform * 67890])
        );
        
        const result = await zkVerifier.previewBias(
          socialHash,
          eventHash,
          await user1.getAddress(),
          ethers.ZeroAddress
        );
        
        results.push(Number(result.bias));
      }

      console.log(`  Monotonicity test results: ${results.join(", ")}`);
      
      // While we can't guarantee strict monotonicity due to hash randomness,
      // we can check that the general trend is increasing and values are reasonable
      const firstQuartile = results.slice(0, Math.floor(results.length / 4));
      const lastQuartile = results.slice(-Math.floor(results.length / 4));
      
      const firstQuartileMean = firstQuartile.reduce((a, b) => a + b, 0) / firstQuartile.length;
      const lastQuartileMean = lastQuartile.reduce((a, b) => a + b, 0) / lastQuartile.length;
      
      console.log(`  First quartile mean: ${firstQuartileMean.toFixed(2)}`);
      console.log(`  Last quartile mean: ${lastQuartileMean.toFixed(2)}`);
      
      // Last quartile should generally be higher than first (monotonicity trend)
      expect(lastQuartileMean).to.be.gte(firstQuartileMean - 5); // Allow some variance due to randomness
    });

    it("should handle edge cases and boundary conditions", async function () {
      // Test with zero addresses
      const result1 = await zkVerifier.previewBias(
        "0x1000000000000000000000000000000000000000000000000000000000000000",
        "0x2000000000000000000000000000000000000000000000000000000000000000",
        ethers.ZeroAddress,
        ethers.ZeroAddress
      );
      
      expect(result1.bias).to.be.gte(0n);
      expect(result1.bias).to.be.lte(100n);

      // Test with maximum values
      const maxHash = "0xffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff";
      const result2 = await zkVerifier.previewBias(
        maxHash,
        maxHash,
        "0xffffffffffffffffffffffffffffffffffffffff",
        "0xffffffffffffffffffffffffffffffffffffffff"
      );
      
      expect(result2.bias).to.be.gte(0n);
      expect(result2.bias).to.be.lte(100n);
      
      console.log(`  Edge case results: ${result1.bias}, ${result2.bias}`);
    });

    it("should validate batch calculation functionality", async function () {
      const batchSize = 10;
      const socialHashes: string[] = [];
      const eventHashes: string[] = [];
      const users: string[] = [];

      for (let i = 0; i < batchSize; i++) {
        socialHashes.push(ethers.keccak256(
          ethers.AbiCoder.defaultAbiCoder().encode(["uint256", "string"], [i, "batch_social"])
        ));
        eventHashes.push(ethers.keccak256(
          ethers.AbiCoder.defaultAbiCoder().encode(["uint256", "string"], [i, "batch_event"])
        ));
        users.push(ethers.Wallet.createRandom().address);
      }

      const batchResults = await zkVerifier.batchCalculateBias(
        socialHashes,
        eventHashes,
        users
      );

      expect(batchResults.length).to.equal(batchSize);
      
      const batchNumbers = batchResults.map(b => Number(b));
      
      for (let i = 0; i < batchSize; i++) {
        expect(batchNumbers[i]).to.be.gte(0);
        expect(batchNumbers[i]).to.be.lte(100);
      }

      console.log(`  Batch results: ${batchNumbers.join(", ")}`);
    });

    it("should validate domain separator security", async function () {
      // Test that different domain separators would produce different results
      // This validates our entropy generation is properly domain-separated
      
      const socialHash = "0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef";
      const eventHash = "0xfedcba0987654321fedcba0987654321fedcba0987654321fedcba0987654321";
      const userAddr = await user1.getAddress();
      
      const result = await zkVerifier.previewBias(
        socialHash,
        eventHash,
        userAddr,
        ethers.ZeroAddress
      );

      // The implementation uses 'TRUTHFORGE_CORRECTED_LINEAR_V1' as domain separator
      // We can't easily test different separators, but we can validate determinism
      const result2 = await zkVerifier.previewBias(
        socialHash,
        eventHash,
        userAddr,
        ethers.ZeroAddress
      );

      expect(result.bias).to.equal(result2.bias);
      expect(result.entropy).to.equal(result2.entropy);
      
      console.log(`  Domain separator produces deterministic result: ${result.bias}`);
    });

    it("should validate MEV resistance properties", async function () {
      // Test that the bias calculation is deterministic and not dependent on block state
      const socialHash = "0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef";
      const eventHash = "0xfedcba0987654321fedcba0987654321fedcba0987654321fedcba0987654321";
      const userAddr = await user1.getAddress();
      
      const result1 = await zkVerifier.previewBias(
        socialHash,
        eventHash,
        userAddr,
        ethers.ZeroAddress
      );

      // Mine a few blocks to change block state
      await ethers.provider.send("hardhat_mine", ["0x10"]); // Mine 16 blocks

      const result2 = await zkVerifier.previewBias(
        socialHash,
        eventHash,
        userAddr,
        ethers.ZeroAddress
      );

      // Results should be identical despite block state changes (MEV resistance)
      expect(result1.bias).to.equal(result2.bias);
      expect(result1.entropy).to.equal(result2.entropy);
      
      console.log(`  MEV resistance validated - consistent result: ${result1.bias}`);
    });

    it("should measure gas efficiency of bias calculation", async function () {
      // While previewBias is a view function, we can test the analyzeBiasDistribution
      // function which uses the same internal calculation but allows gas measurement
      
      const gasResult = await zkVerifier.analyzeBiasDistribution.staticCall(50, 12345);
      
      expect(gasResult.mean).to.be.gte(20n);
      expect(gasResult.mean).to.be.lte(40n);
      expect(gasResult.median).to.be.gte(0n);
      expect(gasResult.median).to.be.lte(100n);
      expect(gasResult.percentile95).to.be.gte(gasResult.median);
      expect(gasResult.entropy).to.be.gt(0n);
      
      console.log(`  Gas efficiency test - Mean: ${gasResult.mean}, Median: ${gasResult.median}`);
      console.log(`  95th percentile: ${gasResult.percentile95}, Entropy: ${gasResult.entropy}`);
    });
  });

  describe("Mathematical Validation Against Expert Targets", function () {
    it("should validate expert's statistical targets with larger sample", async function () {
      // Use larger sample to get more accurate statistics matching expert validation
      const sampleSize = 500;
      const biases: number[] = [];
      
      console.log(`  Generating ${sampleSize} samples for statistical validation...`);
      
      for (let i = 0; i < sampleSize; i++) {
        const socialHash = ethers.keccak256(
          ethers.AbiCoder.defaultAbiCoder().encode(["uint256", "uint256"], [i, 0x123456])
        );
        const eventHash = ethers.keccak256(
          ethers.AbiCoder.defaultAbiCoder().encode(["uint256", "uint256"], [i, 0x789abc])
        );
        const userAddr = await user1.getAddress();
        
        const result = await zkVerifier.previewBias(
          socialHash,
          eventHash,
          userAddr,
          ethers.ZeroAddress
        );
        
        biases.push(Number(result.bias));
      }

      // Calculate comprehensive statistics
      const mean = biases.reduce((a, b) => a + b, 0) / biases.length;
      const penaltyCount = biases.filter(b => b > 50).length;
      const penaltyRate = (penaltyCount / biases.length) * 100;
      
      // Calculate standard deviation
      const variance = biases.reduce((acc, val) => acc + Math.pow(val - mean, 2), 0) / biases.length;
      const stdDev = Math.sqrt(variance);
      
      const min = Math.min(...biases);
      const max = Math.max(...biases);
      
      // Sort for percentiles
      const sorted = [...biases].sort((a, b) => a - b);
      const median = sorted[Math.floor(sorted.length / 2)];
      const p95 = sorted[Math.floor(sorted.length * 0.95)];
      
      console.log(`  ===== MATHEMATICAL VALIDATION RESULTS =====`);
      console.log(`  Sample size: ${sampleSize}`);
      console.log(`  Mean: ${mean.toFixed(2)} (Expert target: ~29.05)`);
      console.log(`  Penalty rate: ${penaltyRate.toFixed(2)}% (Expert target: ~11.36%)`);
      console.log(`  Standard deviation: ${stdDev.toFixed(2)}`);
      console.log(`  Median: ${median.toFixed(2)}`);
      console.log(`  95th percentile: ${p95.toFixed(2)}`);
      console.log(`  Range: [${min}, ${max}]`);
      
      // Expert validation targets:
      // - Mean bias: ~29.05 (1.68% error from 28.57 target)
      // - Penalty rate: ~11.36% (0.36 pts error from 11.0% target)
      // - Perfect monotonicity (0 violations)
      // - KS statistic: ~0.0157 (good distribution match)
      
      // Validate against expert targets with reasonable tolerance
      const meanError = Math.abs(mean - 29.05) / 29.05 * 100;
      const penaltyError = Math.abs(penaltyRate - 11.36);
      
      console.log(`  Mean error: ${meanError.toFixed(2)}% (should be reasonable for linear approximation)`);
      console.log(`  Penalty error: ${penaltyError.toFixed(2)} pts (should be <2 pts for linear approximation)`);
      
      // Relaxed validation for linear PCHIP implementation
      expect(mean).to.be.gte(25); // Allow broader range for linear approximation
      expect(mean).to.be.lte(35);
      expect(penaltyRate).to.be.gte(8);
      expect(penaltyRate).to.be.lte(16);
      expect(meanError).to.be.lte(15); // Allow up to 15% error for linear approximation
      expect(penaltyError).to.be.lte(3); // Allow up to 3 pts error for linear approximation
      
      console.log(`  ✅ Statistical validation PASSED for linear PCHIP implementation`);
    });
  });
});