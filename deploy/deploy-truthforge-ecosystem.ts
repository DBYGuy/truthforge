import { Wallet, utils } from "zksync-ethers";
import * as ethers from "ethers";
import { HardhatRuntimeEnvironment } from "hardhat/types";
import { Deployer } from "@matterlabs/hardhat-zksync-deploy";

export default async function (hre: HardhatRuntimeEnvironment) {
  console.log(`Running deploy script for TruthForge Ecosystem`);

  // Initialize the wallet
  const wallet = new Wallet(process.env.PRIVATE_KEY || "");

  // Create deployer object
  const deployer = new Deployer(hre, wallet);
  
  console.log(`Deployer wallet address: ${deployer.zkWallet.address}`);
  console.log(`Deployer wallet balance: ${ethers.utils.formatEther(
    await deployer.zkWallet.getBalance()
  )} ETH`);

  // Load artifacts
  const verifyTokenArtifact = await deployer.loadArtifact("VerifyToken");
  const poolFactoryArtifact = await deployer.loadArtifact("PoolFactory");

  // Estimate deployment fees
  const verifyTokenFee = await deployer.estimateDeployFee(verifyTokenArtifact, [wallet.address]);
  const poolFactoryFee = await deployer.estimateDeployFee(poolFactoryArtifact, ["0x0000000000000000000000000000000000000000", wallet.address]); // placeholder addresses
  
  const totalFee = verifyTokenFee.add(poolFactoryFee);
  console.log(`Total deployment cost: ${ethers.utils.formatEther(totalFee)} ETH`);

  // OPTIONAL: Deposit funds to L2 if needed
  const currentBalance = await deployer.zkWallet.getBalance();
  if (currentBalance.lt(totalFee.mul(2))) {
    console.log("Depositing funds to L2...");
    const depositHandle = await deployer.zkWallet.deposit({
      to: deployer.zkWallet.address,
      token: utils.ETH_ADDRESS,
      amount: totalFee.mul(3), // 3x the required amount for safety
    });
    await depositHandle.wait();
    console.log("Deposit completed");
  }

  // 1. Deploy VerifyToken
  console.log("\n=== Deploying VerifyToken ===");
  const verifyToken = await deployer.deploy(verifyTokenArtifact, [wallet.address]);
  await verifyToken.deployed();
  console.log(`VerifyToken deployed to: ${verifyToken.address}`);

  // 2. Deploy PoolFactory
  console.log("\n=== Deploying PoolFactory ===");
  const poolFactory = await deployer.deploy(poolFactoryArtifact, [
    verifyToken.address,
    wallet.address // Initial oracle address
  ]);
  await poolFactory.deployed();
  console.log(`PoolFactory deployed to: ${poolFactory.address}`);

  // 3. Initial setup
  console.log("\n=== Initial Setup ===");
  
  // Transfer some tokens to PoolFactory for testing (optional)
  const setupAmount = ethers.utils.parseEther("10000"); // 10K tokens
  await verifyToken.transfer(poolFactory.address, setupAmount);
  console.log(`Transferred ${ethers.utils.formatEther(setupAmount)} VERIFY to PoolFactory`);

  // Display deployment summary
  console.log("\n=== Deployment Summary ===");
  console.log(`Network: ${hre.network.name}`);
  console.log(`Deployer: ${wallet.address}`);
  console.log(`VerifyToken: ${verifyToken.address}`);
  console.log(`PoolFactory: ${poolFactory.address}`);
  
  // Contract details
  console.log("\n=== Contract Details ===");
  console.log(`VerifyToken Total Supply: ${ethers.utils.formatEther(await verifyToken.TOTAL_SUPPLY_CAP())}`);
  console.log(`PoolFactory Creation Fee: ${ethers.utils.formatEther(await poolFactory.poolCreationFee())} VERIFY`);
  console.log(`Pool Duration: ${await poolFactory.mainPoolDuration()} seconds`);

  // Verify contracts (if on testnet/mainnet)
  if (hre.network.name !== "hardhat") {
    console.log("\n=== Verifying Contracts ===");
    
    try {
      await hre.run("verify:verify", {
        address: verifyToken.address,
        contract: "contracts/TruthForgeToken.sol:VerifyToken",
        constructorArguments: [wallet.address],
      });
      console.log("VerifyToken verified");
    } catch (error) {
      console.log("VerifyToken verification failed:", error);
    }

    try {
      await hre.run("verify:verify", {
        address: poolFactory.address,
        contract: "contracts/PoolFactory.sol:PoolFactory",
        constructorArguments: [verifyToken.address, wallet.address],
      });
      console.log("PoolFactory verified");
    } catch (error) {
      console.log("PoolFactory verification failed:", error);
    }
  }

  // Save deployment addresses to file for tests/frontend
  const deploymentInfo = {
    network: hre.network.name,
    deployer: wallet.address,
    contracts: {
      VerifyToken: verifyToken.address,
      PoolFactory: poolFactory.address,
    },
    timestamp: new Date().toISOString(),
  };

  const fs = require('fs');
  fs.writeFileSync(
    './deployments.json',
    JSON.stringify(deploymentInfo, null, 2)
  );
  console.log("\nDeployment info saved to deployments.json");

  return { verifyToken, poolFactory };
}