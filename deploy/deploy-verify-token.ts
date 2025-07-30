import { Wallet, utils } from "zksync-ethers";
import * as ethers from "ethers";
import { HardhatRuntimeEnvironment } from "hardhat/types";
import { Deployer } from "@matterlabs/hardhat-zksync-deploy";

export default async function (hre: HardhatRuntimeEnvironment) {
  console.log(`Running deploy script for the VerifyToken contract`);

  // Initialize the wallet
  const wallet = new Wallet(process.env.PRIVATE_KEY || "");

  // Create deployer object and load the artifact of the contract you want to deploy
  const deployer = new Deployer(hre, wallet);
  const artifact = await deployer.loadArtifact("VerifyToken");

  // Estimate contract deployment fee
  const deploymentFee = await deployer.estimateDeployFee(artifact, [wallet.address]);

  // OPTIONAL: Deposit funds to L2
  // Comment this block if you already have funds on zkSync.
  const depositHandle = await deployer.zkWallet.deposit({
    to: deployer.zkWallet.address,
    token: utils.ETH_ADDRESS,
    amount: deploymentFee.mul(2),
  });
  // Wait until the deposit is processed on zkSync
  await depositHandle.wait();

  // Deploy this contract. The returned object will be of a `Contract` type, similar to ones in `ethers`.
  // `initialOwner` is an argument for the contract constructor.
  const parsedBalance = ethers.utils.formatEther(deploymentFee);
  console.log(`The deployment is estimated to cost ${parsedBalance} ETH`);

  const verifyTokenContract = await deployer.deploy(artifact, [wallet.address]);

  //obtain the Constructor Arguments
  console.log("Constructor args:", verifyTokenContract.interface.encodeDeploy([wallet.address]));

  // Show the contract info.
  const contractAddress = verifyTokenContract.address;
  console.log(`${artifact.contractName} was deployed to ${contractAddress}`);

  // Verify contract programmatically
  //
  // Contract MUST be fully qualified name (e.g. path/sourceName:contractName)
  const contractFullyQualifedName = "contracts/TruthForgeToken.sol:VerifyToken";
  const verificationId = await hre.run("verify:verify", {
    address: contractAddress,
    contract: contractFullyQualifedName,
    constructorArguments: [wallet.address],
    bytecode: artifact.bytecode,
  });
  console.log(`Verification ID: ${verificationId}`);

  // Contract interaction examples
  console.log("\n=== Contract Deployment Summary ===");
  console.log(`Contract Address: ${contractAddress}`);
  console.log(`Initial Owner: ${wallet.address}`);
  console.log(`Total Supply Cap: ${await verifyTokenContract.TOTAL_SUPPLY_CAP()}`);
  console.log(`Contract Name: ${await verifyTokenContract.name()}`);
  console.log(`Contract Symbol: ${await verifyTokenContract.symbol()}`);
  console.log(`Owner Balance: ${await verifyTokenContract.balanceOf(wallet.address)}`);

  return verifyTokenContract;
}