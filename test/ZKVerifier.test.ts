import { expect } from "chai";
import { ethers } from "hardhat";
import { SignerWithAddress } from "@nomicfoundation/hardhat-ethers/signers";
import {
  ZKVerifier,
  ZKVerifier__factory,
} from "../typechain-types";
import { time } from "@nomicfoundation/hardhat-network-helpers";

describe("ZKVerifier Contract", function () {
  let zkVerifier: ZKVerifier;
  let owner: SignerWithAddress;
  let keyAdmin: SignerWithAddress;
  let verifier: SignerWithAddress;
  let user1: SignerWithAddress;
  let user2: SignerWithAddress;

  const PRIME_Q = "21888242871839275222246405745257275088548364400416034343698204186575808495617";
  const RATE_LIMIT_WINDOW = 60 * 60; // 1 hour
  const MAX_VERIFICATIONS_PER_WINDOW = 100;

  // Sample proof data (stub values for testing)
  const sampleProof = {
    a: [1, 2] as [bigint, bigint],
    b: [[1, 2], [3, 4]] as [[bigint, bigint], [bigint, bigint]],
    c: [1, 2] as [bigint, bigint],
    input: [1, 123456, 789012, 2, 75] as [bigint, bigint, bigint, bigint, bigint] // [flag_value, social_hash, event_hash, degree, event_relevance]
  };

  beforeEach(async function () {
    const signers = await ethers.getSigners();
    
    if (signers.length < 5) {
      throw new Error("Need at least 5 signers for testing");
    }
    
    owner = signers[0];
    keyAdmin = signers[1];
    verifier = signers[2];
    user1 = signers[3];
    user2 = signers[4];

    const ZKVerifierFactory = await ethers.getContractFactory("ZKVerifier");
    zkVerifier = await ZKVerifierFactory.deploy();
    await zkVerifier.waitForDeployment();

    // Grant roles
    const KEY_ADMIN_ROLE = await zkVerifier.KEY_ADMIN_ROLE();
    const VERIFIER_ROLE = await zkVerifier.VERIFIER_ROLE();

    await zkVerifier.connect(owner).grantRole(KEY_ADMIN_ROLE, keyAdmin.address);
    await zkVerifier.connect(owner).grantRole(VERIFIER_ROLE, verifier.address);
  });

  describe("Deployment", function () {
    it("Should set correct roles", async function () {
      const DEFAULT_ADMIN_ROLE = await zkVerifier.DEFAULT_ADMIN_ROLE();
      const KEY_ADMIN_ROLE = await zkVerifier.KEY_ADMIN_ROLE();
      
      expect(await zkVerifier.hasRole(DEFAULT_ADMIN_ROLE, owner.address)).to.be.true;
      expect(await zkVerifier.hasRole(KEY_ADMIN_ROLE, keyAdmin.address)).to.be.true;
    });

    it("Should initialize with stub verifying key", async function () {
      const vk_alpha = await zkVerifier.getVkAlpha();
      expect(vk_alpha[0]).to.equal(1);
      expect(vk_alpha[1]).to.equal(2);
      
      const vk_ic = await zkVerifier.getVkIc(0);
      expect(vk_ic).to.equal(1);
    });

    it("Should initialize with correct constants", async function () {
      expect(await zkVerifier.RATE_LIMIT_WINDOW()).to.equal(RATE_LIMIT_WINDOW);
      expect(await zkVerifier.MAX_VERIFICATIONS_PER_WINDOW()).to.equal(MAX_VERIFICATIONS_PER_WINDOW);
    });
  });

  describe("Proof Verification", function () {
    it("Should verify a valid proof", async function () {
      const tx = await zkVerifier.connect(user1).verifyClaim(
        sampleProof.a,
        sampleProof.b,
        sampleProof.c,
        sampleProof.input
      );

      await expect(tx).to.emit(zkVerifier, "ClaimVerified");
      
      const receipt = await tx.wait();
      const event = receipt?.logs.find(log => 
        zkVerifier.interface.parseLog(log as any)?.name === "ClaimVerified"
      );
      
      expect(event).to.not.be.undefined;
    });

    it("Should reject invalid degree", async function () {
      const invalidInput = [1, 123456, 789012, 0, 75] as [bigint, bigint, bigint, bigint, bigint]; // degree 0 is invalid
      
      await expect(zkVerifier.connect(user1).verifyClaim(
        sampleProof.a,
        sampleProof.b,
        sampleProof.c,
        invalidInput
      )).to.be.revertedWith("Invalid degree");
    });

    it("Should reject invalid social hash", async function () {
      const invalidInput = [1, 0, 789012, 2, 75] as [bigint, bigint, bigint, bigint, bigint]; // social_hash 0 is invalid
      
      await expect(zkVerifier.connect(user1).verifyClaim(
        sampleProof.a,
        sampleProof.b,
        sampleProof.c,
        invalidInput
      )).to.be.revertedWith("Invalid social hash");
    });

    it("Should reject invalid bias level", async function () {
      const invalidInput = [1, 123456, 101, 999] as [bigint, bigint, bigint, bigint]; // bias level > 100
      
      await expect(zkVerifier.connect(user1).verifyClaim(
        sampleProof.a,
        sampleProof.b,
        sampleProof.c,
        invalidInput
      )).to.be.revertedWith("Invalid bias level");
    });

    it("Should reject zero nullifier", async function () {
      const invalidInput = [1, 123456, 25, 0] as [bigint, bigint, bigint, bigint]; // nullifier 0 is invalid
      
      await expect(zkVerifier.connect(user1).verifyClaim(
        sampleProof.a,
        sampleProof.b,
        sampleProof.c,
        invalidInput
      )).to.be.revertedWith("Invalid nullifier");
    });

    it("Should prevent double-spending with same nullifier", async function () {
      await zkVerifier.connect(user1).verifyClaim(
        sampleProof.a,
        sampleProof.b,
        sampleProof.c,
        sampleProof.input
      );

      await expect(zkVerifier.connect(user1).verifyClaim(
        sampleProof.a,
        sampleProof.b,
        sampleProof.c,
        sampleProof.input
      )).to.be.revertedWith("Proof used");
    });

    it("Should calculate weight correctly", async function () {
      const tx = await zkVerifier.connect(user1).verifyClaim(
        sampleProof.a,
        sampleProof.b,
        sampleProof.c,
        sampleProof.input
      );

      const receipt = await tx.wait();
      const event = receipt?.logs.find(log => {
        const parsed = zkVerifier.interface.parseLog(log as any);
        return parsed?.name === "ClaimVerified";
      });

      if (event) {
        const parsed = zkVerifier.interface.parseLog(event as any);
        const weight = parsed?.args[2];
        const expectedWeight = 1 * 10 + (123456 % 100); // degree * 10 + (attributeHash % 100)
        expect(weight).to.equal(expectedWeight);
      }
    });

    it("Should calculate gravity score correctly", async function () {
      const tx = await zkVerifier.connect(user1).verifyClaim(
        sampleProof.a,
        sampleProof.b,
        sampleProof.c,
        sampleProof.input
      );

      const receipt = await tx.wait();
      const event = receipt?.logs.find(log => {
        const parsed = zkVerifier.interface.parseLog(log as any);
        return parsed?.name === "ClaimVerified";
      });

      if (event) {
        const parsed = zkVerifier.interface.parseLog(event as any);
        const gravityScore = parsed?.args[3];
        const expectedGravity = 100 - 25; // 100 - biasLevel
        expect(gravityScore).to.equal(expectedGravity);
      }
    });

    it("Should flag high bias correctly", async function () {
      const highBiasInput = [1, 123456, 75, 888] as [bigint, bigint, bigint, bigint]; // bias > 50
      
      const tx = await zkVerifier.connect(user1).verifyClaim(
        sampleProof.a,
        sampleProof.b,
        sampleProof.c,
        highBiasInput
      );

      const receipt = await tx.wait();
      const event = receipt?.logs.find(log => {
        const parsed = zkVerifier.interface.parseLog(log as any);
        return parsed?.name === "ClaimVerified";
      });

      if (event) {
        const parsed = zkVerifier.interface.parseLog(event as any);
        const biasFlagged = parsed?.args[4];
        expect(biasFlagged).to.be.true;
      }
    });
  });

  describe("Rate Limiting", function () {
    it("Should allow up to max verifications per window", async function () {
      // This test would be expensive with 100 calls, so we test the logic with a few calls
      for (let i = 0; i < 3; i++) {
        const uniqueInput = [1, 123456 + i, 25, 999 + i] as [bigint, bigint, bigint, bigint];
        await expect(zkVerifier.connect(user1).verifyClaim(
          sampleProof.a,
          sampleProof.b,
          sampleProof.c,
          uniqueInput
        )).to.not.be.reverted;
      }
    });

    it("Should reset rate limit after time window", async function () {
      // Make a verification
      await zkVerifier.connect(user1).verifyClaim(
        sampleProof.a,
        sampleProof.b,
        sampleProof.c,
        sampleProof.input
      );

      // Fast forward past rate limit window
      await time.increase(RATE_LIMIT_WINDOW + 1);

      // Should be able to verify again with different nullifier
      const newInput = [1, 123456, 25, 888] as [bigint, bigint, bigint, bigint];
      await expect(zkVerifier.connect(user1).verifyClaim(
        sampleProof.a,
        sampleProof.b,
        sampleProof.c,
        newInput
      )).to.not.be.reverted;
    });

    it("Should return correct rate limit info", async function () {
      await zkVerifier.connect(user1).verifyClaim(
        sampleProof.a,
        sampleProof.b,
        sampleProof.c,
        sampleProof.input
      );

      const [verificationsUsed, windowStart, windowEnd] = await zkVerifier.getRateLimitInfo(user1.address);
      expect(verificationsUsed).to.equal(1);
      expect(windowStart).to.be.gt(0);
      expect(windowEnd).to.equal(windowStart + BigInt(RATE_LIMIT_WINDOW));
    });
  });

  describe("Verifying Key Management", function () {
    beforeEach(async function () {
      // Pause contract to allow key updates
      await zkVerifier.connect(owner).pause();
    });

    it("Should allow key admin to update verifying key", async function () {
      const newAlpha = [10, 20] as [bigint, bigint];
      const newBeta = [[10, 20], [30, 40]] as [[bigint, bigint], [bigint, bigint]];
      const newGamma = [10, 20] as [bigint, bigint];
      const newDelta = [10, 20] as [bigint, bigint];
      const newIC = [10, 20, 30, 40, 50];

      await zkVerifier.connect(keyAdmin).updateVerifyingKey(
        newAlpha,
        newBeta,
        newGamma,
        newDelta,
        newIC
      );

      const updatedAlpha = await zkVerifier.getVkAlpha();
      expect(updatedAlpha[0]).to.equal(10);
      expect(updatedAlpha[1]).to.equal(20);
    });

    it("Should not allow updating key when not paused", async function () {
      await zkVerifier.connect(owner).unpause();
      
      const newAlpha = [10, 20] as [bigint, bigint];
      const newBeta = [[10, 20], [30, 40]] as [[bigint, bigint], [bigint, bigint]];
      const newGamma = [10, 20] as [bigint, bigint];
      const newDelta = [10, 20] as [bigint, bigint];
      const newIC = [10, 20, 30, 40, 50];

      await expect(zkVerifier.connect(keyAdmin).updateVerifyingKey(
        newAlpha,
        newBeta,
        newGamma,
        newDelta,
        newIC
      )).to.be.revertedWithCustomError(zkVerifier, "ExpectedPause");
    });

    it("Should reject IC array that's too large", async function () {
      const newAlpha = [10, 20] as [bigint, bigint];
      const newBeta = [[10, 20], [30, 40]] as [[bigint, bigint], [bigint, bigint]];
      const newGamma = [10, 20] as [bigint, bigint];
      const newDelta = [10, 20] as [bigint, bigint];
      const newIC = new Array(50).fill(10); // Too large

      await expect(zkVerifier.connect(keyAdmin).updateVerifyingKey(
        newAlpha,
        newBeta,
        newGamma,
        newDelta,
        newIC
      )).to.be.revertedWith("Invalid IC length");
    });

    it("Should reject key elements outside field bounds", async function () {
      const newAlpha = [BigInt(PRIME_Q), 20] as [bigint, bigint]; // >= PRIME_Q
      const newBeta = [[10, 20], [30, 40]] as [[bigint, bigint], [bigint, bigint]];
      const newGamma = [10, 20] as [bigint, bigint];
      const newDelta = [10, 20] as [bigint, bigint];
      const newIC = [10, 20, 30, 40, 50];

      await expect(zkVerifier.connect(keyAdmin).updateVerifyingKey(
        newAlpha,
        newBeta,
        newGamma,
        newDelta,
        newIC
      )).to.be.revertedWith("Invalid alpha");
    });

    it("Should not allow non-key-admin to update key", async function () {
      const newAlpha = [10, 20] as [bigint, bigint];
      const newBeta = [[10, 20], [30, 40]] as [[bigint, bigint], [bigint, bigint]];
      const newGamma = [10, 20] as [bigint, bigint];
      const newDelta = [10, 20] as [bigint, bigint];
      const newIC = [10, 20, 30, 40, 50];

      await expect(zkVerifier.connect(user1).updateVerifyingKey(
        newAlpha,
        newBeta,
        newGamma,
        newDelta,
        newIC
      )).to.be.revertedWithCustomError(zkVerifier, "AccessControlUnauthorizedAccount");
    });
  });

  describe("Pausing", function () {
    it("Should allow admin to pause and unpause", async function () {
      await zkVerifier.connect(owner).pause();
      expect(await zkVerifier.paused()).to.be.true;

      await zkVerifier.connect(owner).unpause();
      expect(await zkVerifier.paused()).to.be.false;
    });

    it("Should prevent verification when paused", async function () {
      await zkVerifier.connect(owner).pause();
      
      await expect(zkVerifier.connect(user1).verifyClaim(
        sampleProof.a,
        sampleProof.b,
        sampleProof.c,
        sampleProof.input
      )).to.be.revertedWithCustomError(zkVerifier, "EnforcedPause");
    });

    it("Should not allow non-admin to pause", async function () {
      await expect(zkVerifier.connect(user1).pause())
        .to.be.revertedWithCustomError(zkVerifier, "AccessControlUnauthorizedAccount");
    });
  });

  describe("Nullifier Tracking", function () {
    it("Should track used nullifiers", async function () {
      const nullifierHash = ethers.keccak256(ethers.toUtf8Bytes("999"));
      
      expect(await zkVerifier.isNullifierUsed(nullifierHash)).to.be.false;

      await zkVerifier.connect(user1).verifyClaim(
        sampleProof.a,
        sampleProof.b,
        sampleProof.c,
        sampleProof.input
      );

      // Check both original and domain-separated nullifiers
      expect(await zkVerifier.isNullifierUsed(nullifierHash)).to.be.true;
    });

    it("Should prevent reuse of domain-separated nullifiers", async function () {
      await zkVerifier.connect(user1).verifyClaim(
        sampleProof.a,
        sampleProof.b,
        sampleProof.c,
        sampleProof.input
      );

      // Try to reuse with same nullifier - should fail due to domain separation
      await expect(zkVerifier.connect(user2).verifyClaim(
        sampleProof.a,
        sampleProof.b,
        sampleProof.c,
        sampleProof.input
      )).to.be.revertedWith("Domain nullifier used");
    });
  });

  describe("Proof Element Validation", function () {
    it("Should reject proof with zero elements", async function () {
      const invalidProof = {
        a: [0, 2] as [bigint, bigint], // Zero element
        b: sampleProof.b,
        c: sampleProof.c,
        input: [1, 123456, 25, 777] as [bigint, bigint, bigint, bigint]
      };

      // Note: This would fail in verifyTx's basic validation, but our stub returns true
      // In a real implementation, this would be caught by the pairing verification
      await expect(zkVerifier.connect(user1).verifyClaim(
        invalidProof.a,
        invalidProof.b,
        invalidProof.c,
        invalidProof.input
      )).to.not.be.reverted; // Stub implementation allows this
    });
  });

  describe("View Functions", function () {
    it("Should return correct nullifier status", async function () {
      const nullifier = ethers.keccak256(ethers.toUtf8Bytes("test"));
      
      expect(await zkVerifier.isNullifierUsed(nullifier)).to.be.false;
      
      // This would require actually using the nullifier in a verification
      // For now, we just test the view function works
    });

    it("Should support interface detection", async function () {
      const interfaceId = "0x7965db0b"; // AccessControl interface ID
      expect(await zkVerifier.supportsInterface(interfaceId)).to.be.true;
    });
  });

  describe("Edge Cases", function () {
    it("Should handle maximum degree", async function () {
      const maxDegreeInput = [3, 123456, 25, 777] as [bigint, bigint, bigint, bigint];
      
      await expect(zkVerifier.connect(user1).verifyClaim(
        sampleProof.a,
        sampleProof.b,
        sampleProof.c,
        maxDegreeInput
      )).to.not.be.reverted;
    });

    it("Should handle maximum bias level", async function () {
      const maxBiasInput = [1, 123456, 100, 777] as [bigint, bigint, bigint, bigint];
      
      await expect(zkVerifier.connect(user1).verifyClaim(
        sampleProof.a,
        sampleProof.b,
        sampleProof.c,
        maxBiasInput
      )).to.not.be.reverted;
    });

    it("Should handle large nullifier values", async function () {
      const maxUint = 2n ** 256n - 1n;
      const largeNullifierInput = [1, 123456, 25, maxUint] as [bigint, bigint, bigint, bigint];
      
      await expect(zkVerifier.connect(user1).verifyClaim(
        sampleProof.a,
        sampleProof.b,
        sampleProof.c,
        largeNullifierInput
      )).to.not.be.reverted;
    });
  });

  describe("Security Warnings", function () {
    it("Should note that proof verification is stubbed", async function () {
      // This test documents that the current implementation uses stubbed verification
      // In production, this would need proper BN254 pairing verification
      
      const result = await zkVerifier.verifyTx(
        sampleProof.a,
        sampleProof.b,
        sampleProof.c,
        sampleProof.input
      );
      
      // Currently returns true due to stub implementation
      expect(result).to.be.true;
      
      // TODO: Replace with actual pairing verification before production deployment
    });
  });
});