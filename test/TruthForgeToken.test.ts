import { expect } from "chai";
import { ethers } from "hardhat";
import { SignerWithAddress } from "@nomicfoundation/hardhat-ethers/signers";
import {
  TruthForgeToken,
  TruthForgeToken__factory,
} from "../typechain-types";
import { time } from "@nomicfoundation/hardhat-network-helpers";

describe("TruthForgeToken Contract", function () {
  let truthForgeToken: TruthForgeToken;
  let owner: SignerWithAddress;
  let minter: SignerWithAddress;
  let pauser: SignerWithAddress;
  let emergencyAdmin: SignerWithAddress;
  let user1: SignerWithAddress;
  let user2: SignerWithAddress;

  const TOTAL_SUPPLY_CAP = ethers.parseEther("100000000000"); // 100B tokens
  const EMERGENCY_TIMELOCK = 24 * 60 * 60; // 1 day

  beforeEach(async function () {
    const signers = await ethers.getSigners();
    
    if (signers.length < 6) {
      throw new Error("Need at least 6 signers for testing");
    }
    
    owner = signers[0];
    minter = signers[1];
    pauser = signers[2];
    emergencyAdmin = signers[3];
    user1 = signers[4];
    user2 = signers[5];

    const TruthForgeTokenFactory = await ethers.getContractFactory("TruthForgeToken");
    truthForgeToken = await TruthForgeTokenFactory.deploy(owner.address, owner.address); // Use owner as treasury for testing
    await truthForgeToken.waitForDeployment();

    // Grant roles
    const MINTER_ROLE = await truthForgeToken.MINTER_ROLE();
    const PAUSER_ROLE = await truthForgeToken.PAUSER_ROLE();
    const EMERGENCY_ROLE = await truthForgeToken.EMERGENCY_ROLE();

    await truthForgeToken.connect(owner).grantRole(MINTER_ROLE, minter.address);
    await truthForgeToken.connect(owner).grantRole(PAUSER_ROLE, pauser.address);
    await truthForgeToken.connect(owner).grantRole(EMERGENCY_ROLE, emergencyAdmin.address);
  });

  describe("Deployment", function () {
    it("Should set correct roles", async function () {
      const DEFAULT_ADMIN_ROLE = await truthForgeToken.DEFAULT_ADMIN_ROLE();
      const MINTER_ROLE = await truthForgeToken.MINTER_ROLE();
      
      expect(await truthForgeToken.hasRole(DEFAULT_ADMIN_ROLE, owner.address)).to.be.true;
      expect(await truthForgeToken.hasRole(MINTER_ROLE, minter.address)).to.be.true;
    });

    it("Should not mint full supply in constructor", async function () {
      expect(await truthForgeToken.totalSupply()).to.equal(0);
      expect(await truthForgeToken.mintedSupply()).to.equal(0);
    });

    it("Should have correct token details", async function () {
      expect(await truthForgeToken.name()).to.equal("TruthForge Token");
      expect(await truthForgeToken.symbol()).to.equal("VERIFY");
      expect(await truthForgeToken.decimals()).to.equal(18);
    });

    it("Should initialize with correct constants", async function () {
      expect(await truthForgeToken.TOTAL_SUPPLY_CAP()).to.equal(TOTAL_SUPPLY_CAP);
      expect(await truthForgeToken.EMERGENCY_TIMELOCK()).to.equal(EMERGENCY_TIMELOCK);
    });
  });

  describe("Minting", function () {
    it("Should allow minter to mint tokens", async function () {
      const mintAmount = ethers.parseEther("1000");
      
      await expect(truthForgeToken.connect(minter).mint(user1.address, mintAmount))
        .to.not.be.reverted;

      expect(await truthForgeToken.balanceOf(user1.address)).to.equal(mintAmount);
      expect(await truthForgeToken.mintedSupply()).to.equal(mintAmount);
    });

    it("Should not allow minting above cap", async function () {
      const overCapAmount = TOTAL_SUPPLY_CAP + 1n;
      
      await expect(truthForgeToken.connect(minter).mint(user1.address, overCapAmount))
        .to.be.revertedWith("Exceeds supply cap");
    });

    it("Should not allow non-minter to mint", async function () {
      const mintAmount = ethers.parseEther("1000");
      
      await expect(truthForgeToken.connect(user1).mint(user1.address, mintAmount))
        .to.be.revertedWithCustomError(truthForgeToken, "AccessControlUnauthorizedAccount");
    });

    it("Should not allow minting to zero address", async function () {
      const mintAmount = ethers.parseEther("1000");
      
      await expect(truthForgeToken.connect(minter).mint(ethers.ZeroAddress, mintAmount))
        .to.be.revertedWith("Cannot mint to zero address");
    });

    it("Should not allow minting zero amount", async function () {
      await expect(truthForgeToken.connect(minter).mint(user1.address, 0))
        .to.be.revertedWith("Amount must be positive");
    });
  });

  describe("Pausing", function () {
    beforeEach(async function () {
      // Mint some tokens first
      await truthForgeToken.connect(minter).mint(user1.address, ethers.parseEther("1000"));
    });

    it("Should allow pauser to pause and unpause", async function () {
      await truthForgeToken.connect(pauser).pause();
      expect(await truthForgeToken.paused()).to.be.true;

      await truthForgeToken.connect(pauser).unpause();
      expect(await truthForgeToken.paused()).to.be.false;
    });

    it("Should prevent transfers when paused", async function () {
      await truthForgeToken.connect(pauser).pause();
      
      await expect(truthForgeToken.connect(user1).transfer(user2.address, ethers.parseEther("100")))
        .to.be.revertedWithCustomError(truthForgeToken, "EnforcedPause");
    });

    it("Should not allow non-pauser to pause", async function () {
      await expect(truthForgeToken.connect(user1).pause())
        .to.be.revertedWithCustomError(truthForgeToken, "AccessControlUnauthorizedAccount");
    });
  });

  describe("Emergency Withdrawal", function () {
    beforeEach(async function () {
      // Send ETH to contract
      await owner.sendTransaction({
        to: await truthForgeToken.getAddress(),
        value: ethers.parseEther("1")
      });
    });

    it("Should initiate emergency withdrawal", async function () {
      const amount = ethers.parseEther("0.5");
      
      await truthForgeToken.connect(emergencyAdmin).initiateEmergencyWithdraw(ethers.ZeroAddress, amount);
      
      const withdrawal = await truthForgeToken.pendingWithdrawal();
      expect(withdrawal.active).to.be.true;
      expect(withdrawal.token).to.equal(ethers.ZeroAddress);
      expect(withdrawal.amount).to.equal(amount);
    });

    it("Should not allow multiple pending withdrawals", async function () {
      const amount = ethers.parseEther("0.5");
      
      await truthForgeToken.connect(emergencyAdmin).initiateEmergencyWithdraw(ethers.ZeroAddress, amount);
      
      await expect(truthForgeToken.connect(emergencyAdmin).initiateEmergencyWithdraw(ethers.ZeroAddress, amount))
        .to.be.revertedWith("Withdrawal already pending");
    });

    it("Should execute emergency withdrawal after timelock", async function () {
      const amount = ethers.parseEther("0.5");
      
      await truthForgeToken.connect(emergencyAdmin).initiateEmergencyWithdraw(ethers.ZeroAddress, amount);
      
      // Fast forward past timelock
      await time.increase(EMERGENCY_TIMELOCK + 1);
      
      const initialBalance = await ethers.provider.getBalance(owner.address);
      
      await truthForgeToken.connect(emergencyAdmin).executeEmergencyWithdraw();
      
      const finalBalance = await ethers.provider.getBalance(owner.address);
      expect(finalBalance).to.be.gt(initialBalance);
    });

    it("Should not execute before timelock", async function () {
      const amount = ethers.parseEther("0.5");
      
      await truthForgeToken.connect(emergencyAdmin).initiateEmergencyWithdraw(ethers.ZeroAddress, amount);
      
      await expect(truthForgeToken.connect(emergencyAdmin).executeEmergencyWithdraw())
        .to.be.revertedWith("Timelock not met");
    });

    it("Should not allow non-emergency admin to initiate withdrawal", async function () {
      const amount = ethers.parseEther("0.5");
      
      await expect(truthForgeToken.connect(user1).initiateEmergencyWithdraw(ethers.ZeroAddress, amount))
        .to.be.revertedWithCustomError(truthForgeToken, "AccessControlUnauthorizedAccount");
    });
  });

  describe("Burning", function () {
    beforeEach(async function () {
      await truthForgeToken.connect(minter).mint(user1.address, ethers.parseEther("1000"));
    });

    it("Should allow token holder to burn tokens", async function () {
      const burnAmount = ethers.parseEther("100");
      const initialBalance = await truthForgeToken.balanceOf(user1.address);
      
      await truthForgeToken.connect(user1).burn(burnAmount);
      
      const finalBalance = await truthForgeToken.balanceOf(user1.address);
      expect(finalBalance).to.equal(initialBalance - burnAmount);
    });

    it("Should allow burning from allowance", async function () {
      const burnAmount = ethers.parseEther("100");
      
      await truthForgeToken.connect(user1).approve(user2.address, burnAmount);
      await truthForgeToken.connect(user2).burnFrom(user1.address, burnAmount);
      
      expect(await truthForgeToken.balanceOf(user1.address)).to.equal(ethers.parseEther("900"));
    });
  });

  describe("Token Transfers", function () {
    beforeEach(async function () {
      await truthForgeToken.connect(minter).mint(user1.address, ethers.parseEther("1000"));
    });

    it("Should transfer tokens normally", async function () {
      const transferAmount = ethers.parseEther("100");
      
      await truthForgeToken.connect(user1).transfer(user2.address, transferAmount);
      
      expect(await truthForgeToken.balanceOf(user1.address)).to.equal(ethers.parseEther("900"));
      expect(await truthForgeToken.balanceOf(user2.address)).to.equal(transferAmount);
    });

    it("Should handle transferFrom with allowance", async function () {
      const transferAmount = ethers.parseEther("100");
      
      await truthForgeToken.connect(user1).approve(user2.address, transferAmount);
      await truthForgeToken.connect(user2).transferFrom(user1.address, user2.address, transferAmount);
      
      expect(await truthForgeToken.balanceOf(user1.address)).to.equal(ethers.parseEther("900"));
      expect(await truthForgeToken.balanceOf(user2.address)).to.equal(transferAmount);
    });
  });

  describe("Role Management", function () {
    it("Should allow admin to grant and revoke roles", async function () {
      const MINTER_ROLE = await truthForgeToken.MINTER_ROLE();
      
      await truthForgeToken.connect(owner).grantRole(MINTER_ROLE, user1.address);
      expect(await truthForgeToken.hasRole(MINTER_ROLE, user1.address)).to.be.true;
      
      await truthForgeToken.connect(owner).revokeRole(MINTER_ROLE, user1.address);
      expect(await truthForgeToken.hasRole(MINTER_ROLE, user1.address)).to.be.false;
    });

    it("Should not allow non-admin to grant roles", async function () {
      const MINTER_ROLE = await truthForgeToken.MINTER_ROLE();
      
      await expect(truthForgeToken.connect(user1).grantRole(MINTER_ROLE, user2.address))
        .to.be.revertedWithCustomError(truthForgeToken, "AccessControlUnauthorizedAccount");
    });
  });

  describe("Interface Support", function () {
    it("Should support AccessControl interface", async function () {
      const interfaceId = "0x7965db0b"; // AccessControl interface ID
      expect(await truthForgeToken.supportsInterface(interfaceId)).to.be.true;
    });
  });

  describe("Edge Cases", function () {
    it("Should handle zero amount transfers", async function () {
      await truthForgeToken.connect(minter).mint(user1.address, ethers.parseEther("1000"));
      
      await expect(truthForgeToken.connect(user1).transfer(user2.address, 0))
        .to.not.be.reverted;
    });

    it("Should revert on insufficient balance", async function () {
      await truthForgeToken.connect(minter).mint(user1.address, ethers.parseEther("100"));
      
      await expect(truthForgeToken.connect(user1).transfer(user2.address, ethers.parseEther("200")))
        .to.be.revertedWithCustomError(truthForgeToken, "ERC20InsufficientBalance");
    });

    it("Should handle contract receiving ETH", async function () {
      await expect(owner.sendTransaction({
        to: await truthForgeToken.getAddress(),
        value: ethers.parseEther("1")
      })).to.not.be.reverted;
    });
  });
});