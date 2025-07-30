# TruthForge Ecosystem Deployment Guide

## 🚀 Quick Start

### Prerequisites
- Node.js 18+ installed
- Hardhat environment configured
- Private key for deployment wallet
- Sufficient ETH for deployment costs

### Environment Setup
```bash
# Install dependencies
npm install

# Set environment variables
export PRIVATE_KEY="your_private_key_here"
export ETHERSCAN_API_KEY="your_etherscan_api_key" # For contract verification
```

## 📋 Pre-Deployment Checklist

### 1. Run Complete Test Suite
```bash
# Run all tests to ensure contracts are working
./scripts/run-tests.sh

# Expected: All tests should pass
# ✅ 34 VerifyToken tests
# ✅ 45+ ValidationPool tests  
# ✅ 40+ PoolFactory tests
# ✅ 20+ Integration tests
```

### 2. Compile Contracts
```bash
npx hardhat compile

# Expected output:
# - No compilation errors
# - TypeChain types generated
# - Artifacts created in artifacts-zk/
```

### 3. Verify Network Configuration
```bash
# Check hardhat.config.ts networks section
# Ensure correct RPC URLs and chain IDs
```

## 🌐 Deployment Options

### Option 1: zkSync Sepolia Testnet (Recommended for Testing)
```bash
npx hardhat deploy-zksync --script deploy-truthforge-ecosystem.ts --network zkSyncSepoliaTestnet
```

### Option 2: zkSync Mainnet (Production)
```bash
npx hardhat deploy-zksync --script deploy-truthforge-ecosystem.ts --network zkSyncMainnet
```

### Option 3: Local Hardhat Network (Development)
```bash
# Start local node in separate terminal
npx hardhat node

# Deploy to local network
npx hardhat deploy-zksync --script deploy-truthforge-ecosystem.ts --network localhost
```

## 📊 Expected Deployment Costs

### zkSync Sepolia Testnet
- **VerifyToken**: ~0.001 ETH
- **PoolFactory**: ~0.002 ETH
- **Total**: ~0.003 ETH + buffer
- **Time**: 2-5 minutes

### zkSync Mainnet
- **VerifyToken**: ~0.01 ETH
- **PoolFactory**: ~0.02 ETH  
- **Total**: ~0.03 ETH + buffer
- **Time**: 5-10 minutes

## 🔧 Post-Deployment Steps

### 1. Verify Deployment
```bash
# Check deployments.json file
cat deployments.json

# Expected output:
{
  "network": "zkSyncSepoliaTestnet",
  "deployer": "0x...",
  "contracts": {
    "VerifyToken": "0x...",
    "PoolFactory": "0x..."
  },
  "timestamp": "2024-..."
}
```

### 2. Verify Contracts on Explorer
Contracts should be automatically verified during deployment. If not:

```bash
# Manual verification
npx hardhat verify --network zkSyncSepoliaTestnet <CONTRACT_ADDRESS> <CONSTRUCTOR_ARGS>
```

### 3. Initial Configuration
```bash
# Connect to deployed contracts and configure
npx hardhat console --network zkSyncSepoliaTestnet

# In console:
const verifyToken = await ethers.getContractAt("VerifyToken", "DEPLOYED_ADDRESS")
const poolFactory = await ethers.getContractAt("PoolFactory", "DEPLOYED_ADDRESS")

# Check initial state
await verifyToken.name() // "Verify"
await verifyToken.symbol() // "VERIFY"
await poolFactory.poolCreationFee() // 10 VERIFY tokens
```

## 🏗️ Integration with Frontend

### Contract Addresses
After deployment, update your frontend with contract addresses from `deployments.json`:

```javascript
// frontend/config/contracts.js
export const CONTRACTS = {
  VERIFY_TOKEN: "0x...", // From deployments.json
  POOL_FACTORY: "0x...", // From deployments.json
}

export const NETWORK = {
  chainId: 300, // zkSync Sepolia
  name: "zkSync Sepolia Testnet",
  rpcUrl: "https://sepolia.era.zksync.dev"
}
```

### ABI Files
Copy ABI files for frontend integration:
```bash
# Copy ABIs to frontend
cp typechain-types/VerifyToken.ts ../frontend/src/abis/
cp typechain-types/PoolFactory.ts ../frontend/src/abis/
cp typechain-types/ValidationPool.ts ../frontend/src/abis/
```

## 🔍 Testing Deployed Contracts

### 1. Basic Functionality Test
```bash
# Test token minting and transfers
npx hardhat run scripts/test-deployment.ts --network zkSyncSepoliaTestnet
```

### 2. Create Test Pool
```javascript
// In hardhat console
const [deployer] = await ethers.getSigners()

// Approve tokens for pool creation
await verifyToken.approve(poolFactory.address, ethers.parseEther("10"))

// Create test pool
const newsHash = ethers.keccak256(ethers.toUtf8Bytes("Test news article"))
await poolFactory.createPool(newsHash)

// Verify pool creation
const poolAddress = await poolFactory.pools(newsHash)
console.log("Pool created at:", poolAddress)
```

## 🚨 Troubleshooting

### Common Issues

#### 1. Insufficient Funds
```
Error: insufficient funds for intrinsic transaction cost
```
**Solution**: Add more ETH to deployment wallet

#### 2. Nonce Issues
```
Error: nonce has already been used
```
**Solution**: Wait a few minutes and retry, or restart hardhat node

#### 3. Contract Size Too Large
```
Error: contract code size exceeds maximum
```
**Solution**: Enable optimizer in hardhat.config.ts (already configured)

#### 4. Verification Failed
```
Error: verification failed
```
**Solution**: Manually verify contracts on zkSync explorer

### Debug Commands
```bash
# Check contract sizes
npx hardhat size-contracts

# Analyze gas usage
npx hardhat test --network hardhat --reporter gas

# Check network connection
npx hardhat console --network zkSyncSepoliaTestnet
```

## 📈 Monitoring Deployment

### 1. Transaction Tracking
- Monitor deployment transactions on [zkSync Explorer](https://sepolia.explorer.zksync.io/)
- Save transaction hashes for future reference

### 2. Contract Events
```javascript
// Listen for pool creation events
poolFactory.on("PoolCreated", (newsHash, poolAddress, startTime, fromOracle) => {
  console.log("New pool created:", {
    newsHash,
    poolAddress, 
    startTime,
    fromOracle
  })
})
```

### 3. Error Monitoring
- Set up monitoring for failed transactions
- Track gas usage patterns
- Monitor token supply changes

## 🎯 Next Steps

1. **Frontend Integration**: Connect React/Next.js frontend to deployed contracts
2. **Oracle Setup**: Configure Chainlink or custom oracle for automated pool creation
3. **Monitoring**: Set up contract monitoring and alerting
4. **Security Audit**: Consider professional security audit before mainnet
5. **Documentation**: Update API documentation with deployed addresses

## 📞 Support

If you encounter issues during deployment:

1. Check the [troubleshooting section](#-troubleshooting)
2. Review contract compilation output
3. Verify network configuration
4. Check that all dependencies are installed
5. Ensure sufficient wallet balance

For additional support, review the test files to understand expected contract behavior.