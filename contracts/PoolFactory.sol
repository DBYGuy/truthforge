// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import "./TruthForgeToken.sol";
import "./ValidationPool.sol";
import "./ZKVerifier.sol";
import "@openzeppelin/contracts/access/AccessControl.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "@openzeppelin/contracts/utils/Pausable.sol";

/**
 * @title PoolFactory
 * @dev Factory for creating validation pools from news inputs. User/oracle-driven, micro-consensus to skip ZK, time-bound closures.
 * Features:
 * - Fee in $VERIFY to create pool.
 * - Oracle auto-creation from feeds if contentious.
 * - Micro-pool for sentiment (oracle/owner call).
 * - Flag weight assignment on creation (story subject determines relevance).
 * - Events for dApp.
 * - Bitchat edge: dApp queues hash/object, syncs via UI.
 * - Revisions: Added ZKVerifier dep (pass to Pool for interop), flag weights as uint[].
 */
contract PoolFactory is AccessControl, ReentrancyGuard, Pausable {
    TruthForgeToken public token;
    ZKVerifier public zkVerifier;
    uint256 public poolCreationFee = 10 * 10**18;
    uint256 public microPoolDuration = 2 hours;
    uint256 public mainPoolDuration = 24 hours;
    uint256 public verifiableThreshold = 80;
    
    address public oracleAddress;
    address public owner;
    
    bytes32 public constant ORACLE_ROLE = keccak256("ORACLE_ROLE");
    bytes32 public constant POOL_ADMIN_ROLE = keccak256("POOL_ADMIN_ROLE");
    
    uint256 public constant MAX_FLAG_WEIGHTS = 10;
    uint256 public constant MIN_POOL_DURATION = 1 hours;
    uint256 public constant MAX_POOL_DURATION = 7 days;
    
    mapping(bytes32 => address) public pools;
    mapping(bytes32 => bool) public easilyVerifiable;
    mapping(bytes32 => uint256[]) public storyFlagWeights; // _newsHash -> flag relevances
    
    // Enhanced events for better frontend integration
    event PoolCreated(bytes32 indexed newsHash, address poolAddress, uint256 startTime, bool fromOracle, uint256[] flagWeights);
    event MicroConsensusReached(bytes32 indexed newsHash, uint8 consensusPercent, bool skipZK);
    event PoolClosed(bytes32 indexed newsHash, address poolAddress, bool earlyClosure);
    event PoolMetricsUpdated(
        bytes32 indexed newsHash,
        uint256 participantCount,
        uint256 totalStake,
        uint256 consensusPercentage
    );
    event DailyPoolStats(
        uint256 indexed day,
        uint256 poolsCreated,
        uint256 totalFees,
        uint256 activeUsers
    );
    event FeeTransferFailed(address indexed user, uint256 amount);
    
    constructor(TruthForgeToken _token, ZKVerifier _zkVerifier, address _oracle) {
        require(address(_token) != address(0), "Invalid token address");
        require(address(_zkVerifier) != address(0), "Invalid zkVerifier address");
        require(_oracle != address(0), "Invalid oracle address");
        
        token = _token;
        zkVerifier = _zkVerifier;
        oracleAddress = _oracle;
        owner = msg.sender;
        
        _grantRole(DEFAULT_ADMIN_ROLE, msg.sender);
        _grantRole(POOL_ADMIN_ROLE, msg.sender);
        _grantRole(ORACLE_ROLE, _oracle);
    }
    
    // User creation: Pay fee, submit hash/weights
    function createPool(bytes32 _newsHash, uint256[] calldata _flagWeights) external nonReentrant whenNotPaused {
        require(pools[_newsHash] == address(0), "Pool exists");
        require(_newsHash != bytes32(0), "Invalid news hash");
        require(_flagWeights.length <= MAX_FLAG_WEIGHTS, "Too many flag weights");
        require(poolCreationFee > 0, "Fee not set");
        
        // Validate flag weights
        for (uint i = 0; i < _flagWeights.length; i++) {
            require(_flagWeights[i] <= 1000, "Flag weight too high"); // Max 10x multiplier
        }
        
        // Enhanced fee handling with better error reporting
        uint256 allowance = token.allowance(msg.sender, address(this));
        require(allowance >= poolCreationFee, "Insufficient allowance");
        
        // Implement fee escrow pattern for security
        bool feeTransferSuccess = token.transferFrom(msg.sender, address(this), poolCreationFee);
        if (!feeTransferSuccess) {
            emit FeeTransferFailed(msg.sender, poolCreationFee);
            revert("Fee transfer failed");
        }
        
        // Create pool with flag weights
        ValidationPool newPool = new ValidationPool(
            token, 
            zkVerifier, 
            _newsHash, 
            block.timestamp + mainPoolDuration,
            _flagWeights
        );
        
        pools[_newsHash] = address(newPool);
        storyFlagWeights[_newsHash] = _flagWeights;
        allPoolHashes.push(_newsHash); // Track for discovery
        
        // Update daily stats
        uint256 today = block.timestamp / 86400;
        dailyPoolCount[today]++;
        dailyFeeTotal[today] += poolCreationFee;
        
        emit PoolCreated(_newsHash, address(newPool), block.timestamp, false, _flagWeights);
        emit DailyPoolStats(today, dailyPoolCount[today], dailyFeeTotal[today], 0);
    }
    
    // Oracle auto-creation
    function createPoolFromOracle(bytes32 _newsHash, uint256[] calldata _flagWeights) external onlyRole(ORACLE_ROLE) whenNotPaused {
        require(pools[_newsHash] == address(0), "Pool exists");
        require(_newsHash != bytes32(0), "Invalid news hash");
        require(_flagWeights.length <= MAX_FLAG_WEIGHTS, "Too many flag weights");
        
        // Validate flag weights
        for (uint i = 0; i < _flagWeights.length; i++) {
            require(_flagWeights[i] <= 1000, "Flag weight too high");
        }
        
        ValidationPool newPool = new ValidationPool(
            token, 
            zkVerifier, 
            _newsHash, 
            block.timestamp + mainPoolDuration,
            _flagWeights
        );
        
        pools[_newsHash] = address(newPool);
        storyFlagWeights[_newsHash] = _flagWeights;
        allPoolHashes.push(_newsHash); // Track for discovery
        
        // Update daily stats (oracle pools don't charge fees)
        uint256 today = block.timestamp / 86400;
        dailyPoolCount[today]++;
        
        emit PoolCreated(_newsHash, address(newPool), block.timestamp, true, _flagWeights);
        emit DailyPoolStats(today, dailyPoolCount[today], dailyFeeTotal[today], 0);
    }
    
    // Micro-pool resolution
    function resolveMicroPool(bytes32 _newsHash, uint8 consensusPercent) external {
        require(hasRole(ORACLE_ROLE, msg.sender) || hasRole(POOL_ADMIN_ROLE, msg.sender), "Unauthorized");
        require(pools[_newsHash] != address(0), "Pool not exists");
        require(consensusPercent <= 100, "Invalid consensus percent");
        
        ValidationPool pool = ValidationPool(pools[_newsHash]);
        require(block.timestamp <= pool.endTime() - mainPoolDuration + microPoolDuration, "Micro-pool ended");
        
        if (consensusPercent >= verifiableThreshold) {
            easilyVerifiable[_newsHash] = true;
            pool.setEasilyVerifiable(true);
        }
        
        emit MicroConsensusReached(_newsHash, consensusPercent, easilyVerifiable[_newsHash]);
    }
    
    // Close pool
    function closePool(bytes32 _newsHash) public {
        ValidationPool pool = ValidationPool(pools[_newsHash]);
        require(address(pool) != address(0), "Pool not exists");
        
        if (hasRole(POOL_ADMIN_ROLE, msg.sender)) {
            // Admin can force close anytime
            pool.forceClose();
        } else {
            // Regular close requires time or easy verification
            bool canClose = block.timestamp >= pool.endTime() || easilyVerifiable[_newsHash];
            require(canClose, "Pool active");
            pool.closeAndDistribute();
        }
        
        emit PoolClosed(_newsHash, address(pool), block.timestamp < pool.endTime());
    }
    
    // Admin setters
    function setCreationFee(uint256 _newFee) external onlyRole(POOL_ADMIN_ROLE) {
        require(_newFee > 0, "Fee must be positive");
        poolCreationFee = _newFee;
    }
    
    function setDurations(uint256 _micro, uint256 _main) external onlyRole(POOL_ADMIN_ROLE) {
        require(_micro >= MIN_POOL_DURATION && _micro <= MAX_POOL_DURATION, "Invalid micro duration");
        require(_main >= MIN_POOL_DURATION && _main <= MAX_POOL_DURATION, "Invalid main duration");
        require(_micro <= _main, "Micro duration must be <= main duration");
        
        microPoolDuration = _micro;
        mainPoolDuration = _main;
    }
    
    function setThreshold(uint256 _newThreshold) external onlyRole(POOL_ADMIN_ROLE) {
        require(_newThreshold > 0 && _newThreshold <= 100, "Invalid threshold");
        verifiableThreshold = _newThreshold;
    }
    
    function setOracle(address _newOracle) external onlyRole(DEFAULT_ADMIN_ROLE) {
        require(_newOracle != address(0), "Invalid oracle address");
        
        // Revoke old oracle role
        if (oracleAddress != address(0)) {
            _revokeRole(ORACLE_ROLE, oracleAddress);
        }
        
        // Grant new oracle role
        oracleAddress = _newOracle;
        _grantRole(ORACLE_ROLE, _newOracle);
    }
    
    // Withdraw fees
    function withdrawFees() external onlyRole(POOL_ADMIN_ROLE) nonReentrant {
        uint256 balance = token.balanceOf(address(this));
        require(balance > 0, "No fees to withdraw");
        
        // Send to the owner (deployer) 
        require(token.transfer(owner, balance), "Fee withdrawal failed");
    }
    
    // Emergency pause
    function pause() external onlyRole(POOL_ADMIN_ROLE) {
        _pause();
    }
    
    function unpause() external onlyRole(POOL_ADMIN_ROLE) {
        _unpause();
    }
    
    // Enhanced view functions for frontend integration
    bytes32[] public allPoolHashes; // Track all created pools
    mapping(uint256 => uint256) public dailyPoolCount; // day => count
    mapping(uint256 => uint256) public dailyFeeTotal; // day => total fees
    
    // Pool discovery functions
    function getAllActivePools() external view returns (bytes32[] memory) {
        // Filter for pools that still exist and aren't closed
        bytes32[] memory activePools = new bytes32[](allPoolHashes.length);
        uint256 activeCount = 0;
        
        for (uint256 i = 0; i < allPoolHashes.length; i++) {
            bytes32 poolHash = allPoolHashes[i];
            if (pools[poolHash] != address(0)) {
                activePools[activeCount] = poolHash;
                activeCount++;
            }
        }
        
        // Resize array to actual count
        bytes32[] memory result = new bytes32[](activeCount);
        for (uint256 i = 0; i < activeCount; i++) {
            result[i] = activePools[i];
        }
        
        return result;
    }
    
    function getPoolsByTimeRange(uint256 /* startTime */, uint256 /* endTime */) 
        external view returns (bytes32[] memory) {
        // Implementation would require tracking creation timestamps
        // For now, return all active pools (simplified)
        return this.getAllActivePools();
    }
    
    function getFactoryStats() external view returns (
        uint256 totalPools,
        uint256 activePools,
        uint256 totalFees,
        uint256 totalParticipants
    ) {
        uint256 activeCount = 0;
        for (uint256 i = 0; i < allPoolHashes.length; i++) {
            if (pools[allPoolHashes[i]] != address(0)) {
                activeCount++;
            }
        }
        
        return (
            allPoolHashes.length,
            activeCount,
            token.balanceOf(address(this)), // Current fee balance
            0 // Would need to aggregate from pools
        );
    }
    
    // Get pool info
    function getPoolInfo(bytes32 _newsHash) external view returns (
        address poolAddress,
        bool exists,
        bool isEasilyVerifiable,
        uint256[] memory flagWeights
    ) {
        return (
            pools[_newsHash],
            pools[_newsHash] != address(0),
            easilyVerifiable[_newsHash],
            storyFlagWeights[_newsHash]
        );
    }
    
    // Support interface detection
    function supportsInterface(bytes4 interfaceId) public view virtual override(AccessControl) returns (bool) {
        return super.supportsInterface(interfaceId);
    }
}