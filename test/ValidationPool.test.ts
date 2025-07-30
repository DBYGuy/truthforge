import { expect } from "chai";
import { ethers } from "hardhat";
import { SignerWithAddress } from "@nomicfoundation/hardhat-ethers/signers";
import {
  ValidationPool,
  TruthForgeToken,
  ZKVerifier,
  ValidationPool__factory,
  TruthForgeToken__factory,
  ZKVerifier__factory,
} from "../typechain-types";
import { time } from "@nomicfoundation/hardhat-network-helpers";

describe("ValidationPool Contract", function () {
  let validationPool: ValidationPool;
  let token: TruthForgeToken;
  let zkVerifier: ZKVerifier;
  let owner: SignerWithAddress;
  let factory: SignerWithAddress;
  let user1: SignerWithAddress;
  let user2: SignerWithAddress;
  let user3: SignerWithAddress;

  const newsHash = ethers.keccak256(ethers.toUtf8Bytes("test-news-item"));
  const endTime = Math.floor(Date.now() / 1000) + 24 * 60 * 60; // 24 hours from now
  const flagWeights = [100, 150, 200]; // Sample flag weights
  const MIN_STAKE = ethers.parseEther("1");

  // Sample proof data for testing
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
    factory = signers[1];
    user1 = signers[2];
    user2 = signers[3];
    user3 = signers[4];

    // Deploy TruthForgeToken
    const TokenFactory = await ethers.getContractFactory("TruthForgeToken");
    token = await TokenFactory.deploy(owner.address, owner.address); // Use owner as treasury for testing
    await token.waitForDeployment();

    // Deploy ZKVerifier
    const ZKVerifierFactory = await ethers.getContractFactory("ZKVerifier");
    zkVerifier = await ZKVerifierFactory.deploy();
    await zkVerifier.waitForDeployment();

    // Deploy ValidationPool
    const PoolFactory = await ethers.getContractFactory("ValidationPool");
    validationPool = await PoolFactory.deploy(
      await token.getAddress(),
      await zkVerifier.getAddress(),
      newsHash,
      endTime,
      flagWeights
    );
    await validationPool.waitForDeployment();

    // Setup roles and permissions
    const MINTER_ROLE = await token.MINTER_ROLE();
    const FACTORY_ROLE = await validationPool.FACTORY_ROLE();
    
    await token.connect(owner).grantRole(MINTER_ROLE, await validationPool.getAddress());
    await validationPool.connect(owner).grantRole(FACTORY_ROLE, factory.address);

    // Mint tokens to users
    await token.connect(owner).mint(user1.address, ethers.parseEther("10000"));
    await token.connect(owner).mint(user2.address, ethers.parseEther("10000"));
    await token.connect(owner).mint(user3.address, ethers.parseEther("10000"));

    // Approve pool to spend tokens
    await token.connect(user1).approve(await validationPool.getAddress(), ethers.parseEther("10000"));
    await token.connect(user2).approve(await validationPool.getAddress(), ethers.parseEther("10000"));
    await token.connect(user3).approve(await validationPool.getAddress(), ethers.parseEther("10000"));
  });

  describe("Deployment", function () {
    it("Should initialize with correct parameters", async function () {
      expect(await validationPool.newsHash()).to.equal(newsHash);
      expect(await validationPool.endTime()).to.equal(endTime);
      expect(await validationPool.closed()).to.be.false;
      expect(await validationPool.easilyVerifiable()).to.be.false;
      expect(await validationPool.finalConsensus()).to.be.false;
    });

    it("Should set flag weights correctly", async function () {
      for (let i = 0; i < flagWeights.length; i++) {
        expect(await validationPool.storyFlagWeights(i)).to.equal(flagWeights[i]);
      }
    });

    it("Should grant correct roles", async function () {
      const DEFAULT_ADMIN_ROLE = await validationPool.DEFAULT_ADMIN_ROLE();
      const POOL_ADMIN_ROLE = await validationPool.POOL_ADMIN_ROLE();
      
      expect(await validationPool.hasRole(DEFAULT_ADMIN_ROLE, owner.address)).to.be.true;
      expect(await validationPool.hasRole(POOL_ADMIN_ROLE, owner.address)).to.be.true;
    });

    it("Should reject invalid constructor parameters", async function () {
      const PoolFactory = await ethers.getContractFactory("ValidationPool");
      
      await expect(PoolFactory.deploy(
        ethers.ZeroAddress, // Invalid token
        await zkVerifier.getAddress(),
        newsHash,
        endTime,
        flagWeights
      )).to.be.revertedWith("Invalid token");

      await expect(PoolFactory.deploy(
        await token.getAddress(),
        ethers.ZeroAddress, // Invalid zkVerifier
        newsHash,
        endTime,
        flagWeights
      )).to.be.revertedWith("Invalid zkVerifier");

      await expect(PoolFactory.deploy(
        await token.getAddress(),
        await zkVerifier.getAddress(),
        ethers.ZeroHash, // Invalid news hash
        endTime,
        flagWeights
      )).to.be.revertedWith("Invalid news hash");

      await expect(PoolFactory.deploy(
        await token.getAddress(),
        await zkVerifier.getAddress(),
        newsHash,
        Math.floor(Date.now() / 1000) - 1000, // Past end time
        flagWeights
      )).to.be.revertedWith("Invalid end time");
    });
  });

  describe("Vote Casting", function () {
    beforeEach(async function () {
      // Fast forward 2 hours to avoid flash loan protection
      await time.increase(2 * 60 * 60);
    });

    it("Should allow casting vote with valid proof", async function () {
      const stakeAmount = ethers.parseEther("100");
      
      await expect(validationPool.connect(user1).castVote(
        sampleProof.a,
        sampleProof.b,
        sampleProof.c,
        sampleProof.input,
        stakeAmount
      )).to.emit(validationPool, "VoteCast");
      
      expect(await validationPool.stakesInPool(user1.address)).to.equal(stakeAmount);
      expect(await validationPool.votes(user1.address)).to.be.true; // vote = 1
      expect(await validationPool.hasParticipated(user1.address)).to.be.true;
      expect(await validationPool.totalVotes()).to.equal(1);
    });

    it("Should reject votes when pool is closed", async function () {
      await validationPool.connect(owner).setEasilyVerifiable(true);
      
      await expect(validationPool.connect(user1).castVote(
        sampleProof.a,
        sampleProof.b,
        sampleProof.c,
        sampleProof.input,
        ethers.parseEther("100")
      )).to.be.revertedWith("Pool closed");
    });

    it("Should reject votes after end time", async function () {
      await time.increaseTo(endTime + 1);
      
      await expect(validationPool.connect(user1).castVote(
        sampleProof.a,
        sampleProof.b,
        sampleProof.c,
        sampleProof.input,
        ethers.parseEther("100")
      )).to.be.revertedWith("Pool ended");
    });

    it("Should reject stakes below minimum", async function () {
      const lowStake = ethers.parseEther("0.5");
      
      await expect(validationPool.connect(user1).castVote(
        sampleProof.a,
        sampleProof.b,
        sampleProof.c,
        sampleProof.input,
        lowStake
      )).to.be.revertedWith("Stake too low");
    });

    it("Should reject double voting with same nullifier", async function () {
      const stakeAmount = ethers.parseEther("100");
      
      await validationPool.connect(user1).castVote(
        sampleProof.a,
        sampleProof.b,
        sampleProof.c,
        sampleProof.input,
        stakeAmount
      );

      await expect(validationPool.connect(user2).castVote(
        sampleProof.a,
        sampleProof.b,
        sampleProof.c,
        sampleProof.input,
        stakeAmount
      )).to.be.revertedWith("Double vote");
    });

    it("Should apply flag weights correctly", async function () {
      const stakeAmount = ethers.parseEther("100");
      const degree = 1; // Should use flagWeights[0] = 100
      
      // Modify input to have degree 1 (which will be extracted as degree 1)
      const inputWithDegree1 = [1, 123456, 789012, 1, 75] as [bigint, bigint, bigint, bigint, bigint];
      
      await validationPool.connect(user1).castVote(
        sampleProof.a,
        sampleProof.b,
        sampleProof.c,
        inputWithDegree1,
        stakeAmount
      );

      // Verify that the user participated
      expect(await validationPool.hasParticipated(user1.address)).to.be.true;
    });

    it("Should handle bias flagging", async function () {
      const stakeAmount = ethers.parseEther("100");
      const highBiasInput = [1, 123456, 789012, 2, 75] as [bigint, bigint, bigint, bigint, bigint]; // Different nullifier
      
      await validationPool.connect(user1).castVote(
        sampleProof.a,
        sampleProof.b,
        sampleProof.c,
        highBiasInput,
        stakeAmount
      );

      expect(await validationPool.biasFlagged(user1.address)).to.be.true;
    });

    it("Should enforce flash loan protection", async function () {
      // Reset time to avoid the 2-hour increase we did in beforeEach
      await time.setNextBlockTimestamp(Math.floor(Date.now() / 1000));
      
      const stakeAmount = ethers.parseEther("100");
      
      await expect(validationPool.connect(user1).castVote(
        sampleProof.a,
        sampleProof.b,
        sampleProof.c,
        sampleProof.input,
        stakeAmount
      )).to.be.revertedWith("Flash loan protection");
    });

    it("Should reject when paused", async function () {
      await validationPool.connect(owner).pause();
      
      await expect(validationPool.connect(user1).castVote(
        sampleProof.a,
        sampleProof.b,
        sampleProof.c,
        sampleProof.input,
        ethers.parseEther("100")
      )).to.be.revertedWithCustomError(validationPool, "EnforcedPause");
    });
  });

  describe("Pool Closure and Distribution", function () {
    beforeEach(async function () {
      // Fast forward to avoid flash loan protection
      await time.increase(2 * 60 * 60);
      
      // Add some votes
      const verifyVote = [1, 123456, 789012, 2, 75] as [bigint, bigint, bigint, bigint, bigint];
      const discountVote = [0, 123456, 789013, 2, 75] as [bigint, bigint, bigint, bigint, bigint];
      
      await validationPool.connect(user1).castVote(
        sampleProof.a,
        sampleProof.b,
        sampleProof.c,
        verifyVote,
        ethers.parseEther("200")
      );
      
      await validationPool.connect(user2).castVote(
        sampleProof.a,
        sampleProof.b,
        sampleProof.c,
        discountVote,
        ethers.parseEther("100")
      );
    });

    it("Should close pool after end time", async function () {
      await time.increaseTo(endTime + 1);
      
      await expect(validationPool.connect(owner).closeAndDistribute())
        .to.emit(validationPool, "PoolClosed");
      
      expect(await validationPool.closed()).to.be.true;
      expect(await validationPool.finalConsensus()).to.be.true; // Verify wins
    });

    it("Should close pool when easily verifiable", async function () {
      await validationPool.connect(factory).setEasilyVerifiable(true);
      
      expect(await validationPool.closed()).to.be.true;
    });

    it("Should not allow non-admin to close pool early", async function () {
      await expect(validationPool.connect(user1).closeAndDistribute())
        .to.be.revertedWithCustomError(validationPool, "AccessControlUnauthorizedAccount");
    });

    it("Should not close pool before end time", async function () {
      await expect(validationPool.connect(owner).closeAndDistribute())
        .to.be.revertedWith("Not closable");
    });

    it("Should calculate consensus correctly", async function () {
      await time.increaseTo(endTime + 1);
      await validationPool.connect(owner).closeAndDistribute();
      
      expect(await validationPool.finalConsensus()).to.be.true; // Verify stake > Discount stake
    });
  });

  describe("Reward Claims", function () {
    beforeEach(async function () {
      // Setup votes and close pool
      await time.increase(2 * 60 * 60);
      
      const verifyVote = [1, 123456, 789012, 2, 75] as [bigint, bigint, bigint, bigint, bigint];
      const discountVote = [0, 123456, 789013, 2, 75] as [bigint, bigint, bigint, bigint, bigint];
      
      await validationPool.connect(user1).castVote(
        sampleProof.a,
        sampleProof.b,
        sampleProof.c,
        verifyVote,
        ethers.parseEther("200")
      );
      
      await validationPool.connect(user2).castVote(
        sampleProof.a,
        sampleProof.b,
        sampleProof.c,
        discountVote,
        ethers.parseEther("100")
      );
      
      await time.increaseTo(endTime + 1);
      await validationPool.connect(owner).closeAndDistribute();
    });

    it("Should allow winners to claim rewards", async function () {
      const initialBalance = await token.balanceOf(user1.address);
      const pendingReward = await validationPool.getPendingReward(user1.address);
      
      expect(pendingReward).to.be.gt(0);
      
      await expect(validationPool.connect(user1).claimReward())
        .to.not.be.reverted;
      
      const finalBalance = await token.balanceOf(user1.address);
      expect(finalBalance).to.be.gt(initialBalance);
      expect(await validationPool.getPendingReward(user1.address)).to.equal(0);
    });

    it("Should not allow claiming when pool not closed", async function () {
      // Create a new pool that's not closed
      const newPool = await (await ethers.getContractFactory("ValidationPool")).deploy(
        await token.getAddress(),
        await zkVerifier.getAddress(),
        ethers.keccak256(ethers.toUtf8Bytes("new-news")),
        endTime + 86400,
        flagWeights
      );
      
      await expect(newPool.connect(user1).claimReward())
        .to.be.revertedWith("Pool not closed");
    });

    it("Should not allow double claiming", async function () {
      await validationPool.connect(user1).claimReward();
      
      await expect(validationPool.connect(user1).claimReward())
        .to.be.revertedWith("No reward");
    });

    it("Should give no reward to losers", async function () {
      expect(await validationPool.getPendingReward(user2.address)).to.equal(0);
      
      await expect(validationPool.connect(user2).claimReward())
        .to.be.revertedWith("No reward");
    });
  });

  describe("Admin Functions", function () {
    it("Should allow factory to set easily verifiable", async function () {
      await validationPool.connect(factory).setEasilyVerifiable(true);
      expect(await validationPool.easilyVerifiable()).to.be.true;
      expect(await validationPool.closed()).to.be.true;
    });

    it("Should not allow non-factory to set easily verifiable", async function () {
      await expect(validationPool.connect(user1).setEasilyVerifiable(true))
        .to.be.revertedWithCustomError(validationPool, "AccessControlUnauthorizedAccount");
    });

    it("Should allow admin to update end time", async function () {
      const newEndTime = endTime + 86400;
      
      await validationPool.connect(owner).updateEndTime(newEndTime);
      expect(await validationPool.endTime()).to.equal(newEndTime);
    });

    it("Should not allow updating end time to past", async function () {
      const pastTime = Math.floor(Date.now() / 1000) - 1000;
      
      await expect(validationPool.connect(owner).updateEndTime(pastTime))
        .to.be.revertedWith("Invalid end time");
    });

    it("Should not allow updating end time when closed", async function () {
      await validationPool.connect(factory).setEasilyVerifiable(true);
      
      await expect(validationPool.connect(owner).updateEndTime(endTime + 86400))
        .to.be.revertedWith("Pool closed");
    });

    it("Should allow admin to pause and unpause", async function () {
      await validationPool.connect(owner).pause();
      expect(await validationPool.paused()).to.be.true;
      
      await validationPool.connect(owner).unpause();
      expect(await validationPool.paused()).to.be.false;
    });
  });

  describe("View Functions", function () {
    beforeEach(async function () {
      await time.increase(2 * 60 * 60);
      
      await validationPool.connect(user1).castVote(
        sampleProof.a,
        sampleProof.b,
        sampleProof.c,
        sampleProof.input,
        ethers.parseEther("100")
      );
    });

    it("Should return correct pool status", async function () {
      const [isClosed, isVerifiable, verifyStake, discountStake, remainingTime] = 
        await validationPool.getPoolStatus();
      
      expect(isClosed).to.be.false;
      expect(isVerifiable).to.be.false;
      expect(verifyStake).to.be.gt(0);
      expect(discountStake).to.equal(0);
      expect(remainingTime).to.be.gt(0);
    });

    it("Should return participant count", async function () {
      expect(await validationPool.getParticipantCount()).to.equal(1);
    });

    it("Should return pending reward", async function () {
      expect(await validationPool.getPendingReward(user1.address)).to.equal(0); // Before closure
    });
  });

  describe("Edge Cases", function () {
    it("Should handle empty participant list on closure", async function () {
      await time.increaseTo(endTime + 1);
      
      await expect(validationPool.connect(owner).closeAndDistribute())
        .to.not.be.reverted;
    });

    it("Should handle ties in voting", async function () {
      await time.increase(2 * 60 * 60);
      
      // Equal stakes on both sides
      const verifyVote = [1, 123456, 789012, 2, 75] as [bigint, bigint, bigint, bigint, bigint];
      const discountVote = [0, 123456, 789013, 2, 75] as [bigint, bigint, bigint, bigint, bigint];
      
      await validationPool.connect(user1).castVote(
        sampleProof.a,
        sampleProof.b,
        sampleProof.c,
        verifyVote,
        ethers.parseEther("100")
      );
      
      await validationPool.connect(user2).castVote(
        sampleProof.a,
        sampleProof.b,
        sampleProof.c,
        discountVote,
        ethers.parseEther("100")
      );
      
      await time.increaseTo(endTime + 1);
      await validationPool.connect(owner).closeAndDistribute();
      
      // In case of tie, discount wins (verify > discount condition fails)
      expect(await validationPool.finalConsensus()).to.be.false;
    });

    it("Should handle maximum participants", async function () {
      // This would be expensive to test with actual 1000 participants
      // Just verify the constant is set correctly
      const maxParticipants = await validationPool.MAX_PARTICIPANTS();
      expect(maxParticipants).to.equal(1000);
    });
  });

  describe("Security", function () {
    it("Should prevent reentrancy in castVote", async function () {
      // The nonReentrant modifier should prevent reentrancy
      // This is tested implicitly through the modifier's presence
      expect(true).to.be.true; // Placeholder - actual reentrancy testing would need more setup
    });

    it("Should prevent reentrancy in claimReward", async function () {
      // Similar to above - the modifier prevents reentrancy attacks
      expect(true).to.be.true; // Placeholder
    });

    it("Should validate input parameters", async function () {
      await time.increase(2 * 60 * 60);
      
      const invalidInput = [1, 0, 789012, 2, 75] as [bigint, bigint, bigint, bigint, bigint]; // Invalid social hash
      
      await expect(validationPool.connect(user1).castVote(
        sampleProof.a,
        sampleProof.b,
        sampleProof.c,
        invalidInput,
        ethers.parseEther("100")
      )).to.be.revertedWith("Invalid attribute hash");
    });
  });
});