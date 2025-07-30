import { expect } from "chai";
import { ethers } from "hardhat";
import { SignerWithAddress } from "@nomicfoundation/hardhat-ethers/signers";
import {
  PoolFactory,
  TruthForgeToken,
  ZKVerifier,
  ValidationPool,
  PoolFactory__factory,
  TruthForgeToken__factory,
  ZKVerifier__factory,
} from "../typechain-types";
import { time } from "@nomicfoundation/hardhat-network-helpers";

describe("PoolFactory Contract", function () {
  let poolFactory: PoolFactory;
  let token: TruthForgeToken;
  let zkVerifier: ZKVerifier;
  let owner: SignerWithAddress;
  let oracle: SignerWithAddress;
  let poolAdmin: SignerWithAddress;
  let user1: SignerWithAddress;
  let user2: SignerWithAddress;

  const flagWeights = [100, 150, 200, 250];
  const creationFee = ethers.parseEther("10");
  const microPoolDuration = 2 * 60 * 60; // 2 hours
  const mainPoolDuration = 24 * 60 * 60; // 24 hours
  const verifiableThreshold = 80;

  const newsHash1 = ethers.keccak256(ethers.toUtf8Bytes("news-item-1"));
  const newsHash2 = ethers.keccak256(ethers.toUtf8Bytes("news-item-2"));

  beforeEach(async function () {
    const signers = await ethers.getSigners();
    
    if (signers.length < 5) {
      throw new Error("Need at least 5 signers for testing");
    }
    
    owner = signers[0];
    oracle = signers[1];
    poolAdmin = signers[2]; 
    user1 = signers[3];
    user2 = signers[4];

    // Deploy TruthForgeToken
    const TokenFactory = await ethers.getContractFactory("TruthForgeToken");
    token = await TokenFactory.deploy(owner.address, owner.address); // Use owner as treasury for testing
    await token.waitForDeployment();

    // Deploy ZKVerifier
    const ZKVerifierFactory = await ethers.getContractFactory("ZKVerifier");
    zkVerifier = await ZKVerifierFactory.deploy();
    await zkVerifier.waitForDeployment();

    // Deploy PoolFactory
    const FactoryFactory = await ethers.getContractFactory("PoolFactory");
    poolFactory = await FactoryFactory.deploy(
      await token.getAddress(),
      await zkVerifier.getAddress(),
      oracle.address
    );
    await poolFactory.waitForDeployment();

    // Setup roles
    const POOL_ADMIN_ROLE = await poolFactory.POOL_ADMIN_ROLE();
    await poolFactory.connect(owner).grantRole(POOL_ADMIN_ROLE, poolAdmin.address);

    // Mint tokens to users and approve factory
    await token.connect(owner).mint(user1.address, ethers.parseEther("1000"));
    await token.connect(owner).mint(user2.address, ethers.parseEther("1000"));
    
    await token.connect(user1).approve(await poolFactory.getAddress(), ethers.parseEther("1000"));
    await token.connect(user2).approve(await poolFactory.getAddress(), ethers.parseEther("1000"));
  });

  describe("Deployment", function () {
    it("Should initialize with correct parameters", async function () {
      expect(await poolFactory.token()).to.equal(await token.getAddress());
      expect(await poolFactory.zkVerifier()).to.equal(await zkVerifier.getAddress());
      expect(await poolFactory.oracleAddress()).to.equal(oracle.address);
      expect(await poolFactory.poolCreationFee()).to.equal(ethers.parseEther("10"));
      expect(await poolFactory.microPoolDuration()).to.equal(microPoolDuration);
      expect(await poolFactory.mainPoolDuration()).to.equal(mainPoolDuration);
      expect(await poolFactory.verifiableThreshold()).to.equal(verifiableThreshold);
    });

    it("Should grant correct roles", async function () {
      const DEFAULT_ADMIN_ROLE = await poolFactory.DEFAULT_ADMIN_ROLE();
      const ORACLE_ROLE = await poolFactory.ORACLE_ROLE();
      const POOL_ADMIN_ROLE = await poolFactory.POOL_ADMIN_ROLE();
      
      expect(await poolFactory.hasRole(DEFAULT_ADMIN_ROLE, owner.address)).to.be.true;
      expect(await poolFactory.hasRole(ORACLE_ROLE, oracle.address)).to.be.true;
      expect(await poolFactory.hasRole(POOL_ADMIN_ROLE, poolAdmin.address)).to.be.true;
    });

    it("Should reject invalid constructor parameters", async function () {
      const FactoryFactory = await ethers.getContractFactory("PoolFactory");
      
      await expect(FactoryFactory.deploy(
        ethers.ZeroAddress, // Invalid token
        await zkVerifier.getAddress(),
        oracle.address
      )).to.be.revertedWith("Invalid token address");

      await expect(FactoryFactory.deploy(
        await token.getAddress(),
        ethers.ZeroAddress, // Invalid zkVerifier
        oracle.address
      )).to.be.revertedWith("Invalid zkVerifier address");

      await expect(FactoryFactory.deploy(
        await token.getAddress(),
        await zkVerifier.getAddress(),
        ethers.ZeroAddress // Invalid oracle
      )).to.be.revertedWith("Invalid oracle address");
    });
  });

  describe("Pool Creation by Users", function () {
    it("Should create pool with valid parameters", async function () {
      const tx = await poolFactory.connect(user1).createPool(newsHash1, flagWeights);
      const receipt = await tx.wait();
      
      await expect(tx)
        .to.emit(poolFactory, "PoolCreated");

      expect(await poolFactory.pools(newsHash1)).to.not.equal(ethers.ZeroAddress);
      
      // Check flag weights were stored
      const storedWeights = [];
      for (let i = 0; i < flagWeights.length; i++) {
        storedWeights.push(await poolFactory.storyFlagWeights(newsHash1, i));
      }
      expect(storedWeights).to.deep.equal(flagWeights.map(w => BigInt(w)));
    });

    it("Should transfer creation fee", async function () {
      const initialBalance = await token.balanceOf(user1.address);
      const initialFactoryBalance = await token.balanceOf(await poolFactory.getAddress());
      
      await poolFactory.connect(user1).createPool(newsHash1, flagWeights);
      
      expect(await token.balanceOf(user1.address)).to.equal(initialBalance - creationFee);
      expect(await token.balanceOf(await poolFactory.getAddress())).to.equal(initialFactoryBalance + creationFee);
    });

    it("Should reject duplicate pool creation", async function () {
      await poolFactory.connect(user1).createPool(newsHash1, flagWeights);
      
      await expect(poolFactory.connect(user2).createPool(newsHash1, flagWeights))
        .to.be.revertedWith("Pool exists");
    });

    it("Should reject invalid news hash", async function () {
      await expect(poolFactory.connect(user1).createPool(ethers.ZeroHash, flagWeights))
        .to.be.revertedWith("Invalid news hash");
    });

    it("Should reject too many flag weights", async function () {
      const tooManyWeights = new Array(15).fill(100); // More than MAX_FLAG_WEIGHTS (10)
      
      await expect(poolFactory.connect(user1).createPool(newsHash1, tooManyWeights))
        .to.be.revertedWith("Too many flag weights");
    });

    it("Should reject flag weights that are too high", async function () {
      const highWeights = [1001]; // Above 1000 limit
      
      await expect(poolFactory.connect(user1).createPool(newsHash1, highWeights))
        .to.be.revertedWith("Flag weight too high");
    });

    it("Should reject if insufficient allowance", async function () {
      // User3 has no tokens or allowance
      const user3 = (await ethers.getSigners())[5];
      
      await expect(poolFactory.connect(user3).createPool(newsHash1, flagWeights))
        .to.be.revertedWith("Insufficient allowance");
    });

    it("Should reject when paused", async function () {
      await poolFactory.connect(poolAdmin).pause();
      
      await expect(poolFactory.connect(user1).createPool(newsHash1, flagWeights))
        .to.be.revertedWithCustomError(poolFactory, "EnforcedPause");
    });
  });

  describe("Pool Creation by Oracle", function () {
    it("Should allow oracle to create pool", async function () {
      const tx = await poolFactory.connect(oracle).createPoolFromOracle(newsHash1, flagWeights);
      
      await expect(tx)
        .to.emit(poolFactory, "PoolCreated");

      expect(await poolFactory.pools(newsHash1)).to.not.equal(ethers.ZeroAddress);
    });

    it("Should not charge fee for oracle creation", async function () {
      const initialFactoryBalance = await token.balanceOf(await poolFactory.getAddress());
      
      await poolFactory.connect(oracle).createPoolFromOracle(newsHash1, flagWeights);
      
      expect(await token.balanceOf(await poolFactory.getAddress())).to.equal(initialFactoryBalance);
    });

    it("Should not allow non-oracle to create oracle pool", async function () {
      await expect(poolFactory.connect(user1).createPoolFromOracle(newsHash1, flagWeights))
        .to.be.revertedWithCustomError(poolFactory, "AccessControlUnauthorizedAccount");
    });

    it("Should validate parameters for oracle creation", async function () {
      await expect(poolFactory.connect(oracle).createPoolFromOracle(ethers.ZeroHash, flagWeights))
        .to.be.revertedWith("Invalid news hash");

      const tooManyWeights = new Array(15).fill(100);
      await expect(poolFactory.connect(oracle).createPoolFromOracle(newsHash1, tooManyWeights))
        .to.be.revertedWith("Too many flag weights");
    });
  });

  describe("Micro Pool Resolution", function () {
    beforeEach(async function () {
      // Create a pool first
      await poolFactory.connect(user1).createPool(newsHash1, flagWeights);
    });

    it("Should allow oracle to resolve micro pool", async function () {
      const consensusPercent = 85; // Above threshold
      
      await expect(poolFactory.connect(oracle).resolveMicroPool(newsHash1, consensusPercent))
        .to.emit(poolFactory, "MicroConsensusReached")
        .withArgs(newsHash1, consensusPercent, true);

      expect(await poolFactory.easilyVerifiable(newsHash1)).to.be.true;
    });

    it("Should allow pool admin to resolve micro pool", async function () {
      const consensusPercent = 85;
      
      await expect(poolFactory.connect(poolAdmin).resolveMicroPool(newsHash1, consensusPercent))
        .to.emit(poolFactory, "MicroConsensusReached")
        .withArgs(newsHash1, consensusPercent, true);
    });

    it("Should not set easily verifiable if below threshold", async function () {
      const consensusPercent = 70; // Below threshold (80)
      
      await poolFactory.connect(oracle).resolveMicroPool(newsHash1, consensusPercent);
      
      expect(await poolFactory.easilyVerifiable(newsHash1)).to.be.false;
    });

    it("Should reject invalid consensus percent", async function () {
      await expect(poolFactory.connect(oracle).resolveMicroPool(newsHash1, 101))
        .to.be.revertedWith("Invalid consensus percent");
    });

    it("Should reject for non-existent pool", async function () {
      await expect(poolFactory.connect(oracle).resolveMicroPool(newsHash2, 85))
        .to.be.revertedWith("Pool not exists");
    });

    it("Should not allow unauthorized users", async function () {
      await expect(poolFactory.connect(user1).resolveMicroPool(newsHash1, 85))
        .to.be.revertedWith("Unauthorized");
    });
  });

  describe("Pool Closure", function () {
    let poolAddress: string;

    beforeEach(async function () {
      await poolFactory.connect(user1).createPool(newsHash1, flagWeights);
      poolAddress = await poolFactory.pools(newsHash1);
    });

    it("Should close pool after end time", async function () {
      // Fast forward past pool end time
      await time.increase(mainPoolDuration + 1);
      
      await expect(poolFactory.closePool(newsHash1))
        .to.emit(poolFactory, "PoolClosed")
        .withArgs(newsHash1, poolAddress, false); // false = not early closure
    });

    it("Should allow early closure if easily verifiable", async function () {
      // resolveMicroPool with threshold >= 80 automatically closes the pool
      await expect(poolFactory.connect(oracle).resolveMicroPool(newsHash1, 85))
        .to.emit(poolFactory, "MicroConsensusReached")
        .withArgs(newsHash1, 85, true);
      
      // Verify the pool is already closed
      expect(await validationPool.closed()).to.be.true;
      expect(await validationPool.easilyVerifiable()).to.be.true;
    });

    it("Should allow pool admin to close pool anytime", async function () {
      await expect(poolFactory.connect(poolAdmin).closePool(newsHash1))
        .to.emit(poolFactory, "PoolClosed");
    });

    it("Should reject closure of non-existent pool", async function () {
      await expect(poolFactory.closePool(newsHash2))
        .to.be.revertedWith("Pool not exists");
    });

    it("Should reject early closure by non-admin", async function () {
      await expect(poolFactory.connect(user1).closePool(newsHash1))
        .to.be.revertedWith("Pool active");
    });
  });

  describe("Admin Functions", function () {
    it("Should allow pool admin to set creation fee", async function () {
      const newFee = ethers.parseEther("20");
      
      await poolFactory.connect(poolAdmin).setCreationFee(newFee);
      expect(await poolFactory.poolCreationFee()).to.equal(newFee);
    });

    it("Should not allow zero creation fee", async function () {
      await expect(poolFactory.connect(poolAdmin).setCreationFee(0))
        .to.be.revertedWith("Fee must be positive");
    });

    it("Should allow pool admin to set durations", async function () {
      const newMicro = 1 * 60 * 60; // 1 hour
      const newMain = 48 * 60 * 60; // 48 hours
      
      await poolFactory.connect(poolAdmin).setDurations(newMicro, newMain);
      expect(await poolFactory.microPoolDuration()).to.equal(newMicro);
      expect(await poolFactory.mainPoolDuration()).to.equal(newMain);
    });

    it("Should reject invalid durations", async function () {
      const tooShort = 30 * 60; // 30 minutes (below MIN_POOL_DURATION)
      const tooLong = 8 * 24 * 60 * 60; // 8 days (above MAX_POOL_DURATION)
      
      await expect(poolFactory.connect(poolAdmin).setDurations(tooShort, mainPoolDuration))
        .to.be.revertedWith("Invalid micro duration");

      await expect(poolFactory.connect(poolAdmin).setDurations(microPoolDuration, tooLong))
        .to.be.revertedWith("Invalid main duration");

      await expect(poolFactory.connect(poolAdmin).setDurations(mainPoolDuration, microPoolDuration))
        .to.be.revertedWith("Micro duration must be <= main duration");
    });

    it("Should allow pool admin to set threshold", async function () {
      const newThreshold = 90;
      
      await poolFactory.connect(poolAdmin).setThreshold(newThreshold);
      expect(await poolFactory.verifiableThreshold()).to.equal(newThreshold);
    });

    it("Should reject invalid threshold", async function () {
      await expect(poolFactory.connect(poolAdmin).setThreshold(0))
        .to.be.revertedWith("Invalid threshold");

      await expect(poolFactory.connect(poolAdmin).setThreshold(101))
        .to.be.revertedWith("Invalid threshold");
    });

    it("Should allow admin to set oracle", async function () {
      const newOracle = user2.address;
      const ORACLE_ROLE = await poolFactory.ORACLE_ROLE();
      
      await poolFactory.connect(owner).setOracle(newOracle);
      
      expect(await poolFactory.oracleAddress()).to.equal(newOracle);
      expect(await poolFactory.hasRole(ORACLE_ROLE, newOracle)).to.be.true;
      expect(await poolFactory.hasRole(ORACLE_ROLE, oracle.address)).to.be.false;
    });

    it("Should not allow setting zero address as oracle", async function () {
      await expect(poolFactory.connect(owner).setOracle(ethers.ZeroAddress))
        .to.be.revertedWith("Invalid oracle address");
    });

    it("Should not allow non-admin to call admin functions", async function () {
      await expect(poolFactory.connect(user1).setCreationFee(ethers.parseEther("20")))
        .to.be.revertedWithCustomError(poolFactory, "AccessControlUnauthorizedAccount");

      await expect(poolFactory.connect(user1).setDurations(1 * 60 * 60, 48 * 60 * 60))
        .to.be.revertedWithCustomError(poolFactory, "AccessControlUnauthorizedAccount");

      await expect(poolFactory.connect(user1).setThreshold(90))
        .to.be.revertedWithCustomError(poolFactory, "AccessControlUnauthorizedAccount");

      await expect(poolFactory.connect(user1).setOracle(user2.address))
        .to.be.revertedWithCustomError(poolFactory, "AccessControlUnauthorizedAccount");
    });
  });

  describe("Fee Management", function () {
    beforeEach(async function () {
      // Create some pools to generate fees
      await poolFactory.connect(user1).createPool(newsHash1, flagWeights);
      await poolFactory.connect(user2).createPool(newsHash2, flagWeights);
    });

    it("Should allow pool admin to withdraw fees", async function () {
      const expectedFees = creationFee * 2n;
      const initialBalance = await token.balanceOf(owner.address);
      
      await expect(poolFactory.connect(poolAdmin).withdrawFees())
        .to.not.be.reverted;
      
      const finalBalance = await token.balanceOf(owner.address);
      expect(finalBalance).to.equal(initialBalance + expectedFees);
      expect(await token.balanceOf(await poolFactory.getAddress())).to.equal(0);
    });

    it("Should reject withdrawal when no fees", async function () {
      // First withdraw all fees
      await poolFactory.connect(poolAdmin).withdrawFees();
      
      await expect(poolFactory.connect(poolAdmin).withdrawFees())
        .to.be.revertedWith("No fees to withdraw");
    });

    it("Should not allow non-admin to withdraw fees", async function () {
      await expect(poolFactory.connect(user1).withdrawFees())
        .to.be.revertedWithCustomError(poolFactory, "AccessControlUnauthorizedAccount");
    });
  });

  describe("Pause Functionality", function () {
    it("Should allow pool admin to pause and unpause", async function () {
      await poolFactory.connect(poolAdmin).pause();
      expect(await poolFactory.paused()).to.be.true;
      
      await poolFactory.connect(poolAdmin).unpause();
      expect(await poolFactory.paused()).to.be.false;
    });

    it("Should prevent pool creation when paused", async function () {
      await poolFactory.connect(poolAdmin).pause();
      
      await expect(poolFactory.connect(user1).createPool(newsHash1, flagWeights))
        .to.be.revertedWithCustomError(poolFactory, "EnforcedPause");

      await expect(poolFactory.connect(oracle).createPoolFromOracle(newsHash1, flagWeights))
        .to.be.revertedWithCustomError(poolFactory, "EnforcedPause");
    });

    it("Should not allow non-admin to pause", async function () {
      await expect(poolFactory.connect(user1).pause())
        .to.be.revertedWithCustomError(poolFactory, "AccessControlUnauthorizedAccount");
    });
  });

  describe("View Functions", function () {
    beforeEach(async function () {
      await poolFactory.connect(user1).createPool(newsHash1, flagWeights);
    });

    it("Should return correct pool info", async function () {
      const [poolAddress, exists, isEasilyVerifiable, storedWeights] = 
        await poolFactory.getPoolInfo(newsHash1);
      
      expect(poolAddress).to.not.equal(ethers.ZeroAddress);
      expect(exists).to.be.true;
      expect(isEasilyVerifiable).to.be.false;
      expect(storedWeights).to.deep.equal(flagWeights.map(w => BigInt(w)));
    });

    it("Should return empty info for non-existent pool", async function () {
      const [poolAddress, exists, isEasilyVerifiable, storedWeights] = 
        await poolFactory.getPoolInfo(newsHash2);
      
      expect(poolAddress).to.equal(ethers.ZeroAddress);
      expect(exists).to.be.false;
      expect(isEasilyVerifiable).to.be.false;
      expect(storedWeights).to.deep.equal([]);
    });

    it("Should support interface detection", async function () {
      const interfaceId = "0x7965db0b"; // AccessControl interface ID
      expect(await poolFactory.supportsInterface(interfaceId)).to.be.true;
    });
  });

  describe("Edge Cases", function () {
    it("Should handle empty flag weights", async function () {
      const emptyWeights: number[] = [];
      
      await expect(poolFactory.connect(user1).createPool(newsHash1, emptyWeights))
        .to.not.be.reverted;
      
      const [, , , storedWeights] = await poolFactory.getPoolInfo(newsHash1);
      expect(storedWeights).to.deep.equal([]);
    });

    it("Should handle maximum valid flag weights", async function () {
      const maxWeights = new Array(10).fill(1000); // MAX_FLAG_WEIGHTS with max values
      
      await expect(poolFactory.connect(user1).createPool(newsHash1, maxWeights))
        .to.not.be.reverted;
    });

    it("Should handle boundary consensus percentages", async function () {
      await poolFactory.connect(user1).createPool(newsHash1, flagWeights);
      
      // Exactly at threshold
      await poolFactory.connect(oracle).resolveMicroPool(newsHash1, 80);
      expect(await poolFactory.easilyVerifiable(newsHash1)).to.be.true;
      
      // Reset for another test
      await poolFactory.connect(user1).createPool(newsHash2, flagWeights);
      
      // Just below threshold
      await poolFactory.connect(oracle).resolveMicroPool(newsHash2, 79);
      expect(await poolFactory.easilyVerifiable(newsHash2)).to.be.false;
    });
  });

  describe("Integration", function () {
    it("Should create functional validation pool", async function () {
      await poolFactory.connect(user1).createPool(newsHash1, flagWeights);
      
      const poolAddress = await poolFactory.pools(newsHash1);
      const pool = await ethers.getContractAt("ValidationPool", poolAddress);
      
      expect(await pool.newsHash()).to.equal(newsHash1);
      expect(await pool.token()).to.equal(await token.getAddress());
      expect(await pool.zkVerifier()).to.equal(await zkVerifier.getAddress());
      
      // Check flag weights were passed correctly
      for (let i = 0; i < flagWeights.length; i++) {
        expect(await pool.storyFlagWeights(i)).to.equal(flagWeights[i]);
      }
    });

    it("Should handle full workflow", async function () {
      // 1. Create pool
      await poolFactory.connect(user1).createPool(newsHash1, flagWeights);
      
      // 2. Resolve micro pool (automatically closes when threshold >= 80)
      await poolFactory.connect(oracle).resolveMicroPool(newsHash1, 85);
      expect(await poolFactory.easilyVerifiable(newsHash1)).to.be.true;
      
      // 3. Verify pool is already closed
      const poolAddress = await poolFactory.pools(newsHash1);
      const pool = await ethers.getContractAt("ValidationPool", poolAddress);
      expect(await pool.closed()).to.be.true;
    });
  });
});