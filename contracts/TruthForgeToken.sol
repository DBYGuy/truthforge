// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import "@openzeppelin/contracts/token/ERC20/extensions/ERC20Burnable.sol";
import "@openzeppelin/contracts/token/ERC20/extensions/ERC20Pausable.sol";
import "@openzeppelin/contracts/access/AccessControl.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";

/**
 * @title TruthForge Token ($VERIFY)
 * @dev ERC-20 token optimized for TruthForge protocol: validation pool deposits, proximity weighting, and ZK integration.
 * Key Features (Simplified for MVP):
 * - Fixed supply cap with controlled minting for rewards (called by other contracts like ZKVerifier/ValidationPool).
 * - Burn for slashes (called by ValidationPool).
 * - Pause/unpause for emergencies.
 * - Timelocked emergency withdraw for security.
 * - No staking or ZK rewards here—moved to ValidationPool (staking/deposits) and ZKVerifier (proof rewards) for modularity.
 * - No deflation mechanisms (removed burns on transfers).
 * Changes: Removed all staking-related functions, mappings, structs, and events (now in ValidationPool.sol). Removed verification rewards (now in ZKVerifier.sol). Kept mint with cap check for called rewards. Updated constructor and overrides accordingly.
 */
contract TruthForgeToken is ERC20, ERC20Burnable, ERC20Pausable, AccessControl, ReentrancyGuard {
    uint256 public constant TOTAL_SUPPLY_CAP = 100_000_000_000 * 10**18; // Capped at 100B per original spec
    uint256 public mintedSupply = 0; // Track to enforce cap
    
    bytes32 public constant MINTER_ROLE = keccak256("MINTER_ROLE");
    bytes32 public constant PAUSER_ROLE = keccak256("PAUSER_ROLE");
    bytes32 public constant EMERGENCY_ROLE = keccak256("EMERGENCY_ROLE");
    
    // Emergency timelock
    uint256 public constant EMERGENCY_TIMELOCK = 1 days;
    
    struct EmergencyWithdrawal {
        address token;
        uint256 amount;
        uint256 executeAfter;
        bool active;
    }
    
    EmergencyWithdrawal public pendingWithdrawal;
    
    // Treasury address for emergency withdrawals
    address public immutable treasury;
    
    constructor(address initialOwner, address _treasury) ERC20("TruthForge Token", "VERIFY") {
        require(_treasury != address(0), "Treasury cannot be zero address");
        treasury = _treasury;
        
        _grantRole(DEFAULT_ADMIN_ROLE, initialOwner);
        _grantRole(MINTER_ROLE, initialOwner);
        _grantRole(PAUSER_ROLE, initialOwner);
        _grantRole(EMERGENCY_ROLE, initialOwner);
        
        // Don't mint full supply in constructor to fix critical vulnerability
        mintedSupply = 0;
    }
    
    // Events for better frontend integration
    event TokenMinted(address indexed to, uint256 amount, uint256 newTotalSupply, address indexed minter);
    event EmergencyWithdrawalInitiated(address indexed token, uint256 amount, uint256 executeAfter);
    event EmergencyWithdrawalExecuted(address indexed token, uint256 amount, address indexed recipient);

    // Controlled mint (called by ZKVerifier/ValidationPool for rewards; with cap)
    function mint(address to, uint256 amount) external onlyRole(MINTER_ROLE) nonReentrant {
        require(to != address(0), "Cannot mint to zero address");
        require(amount > 0, "Amount must be positive");
        
        // Fix overflow vulnerability with SafeMath equivalent
        uint256 newMintedSupply = mintedSupply + amount;
        require(newMintedSupply <= TOTAL_SUPPLY_CAP, "Exceeds supply cap");
        require(newMintedSupply >= mintedSupply, "Mint overflow detected");
        
        mintedSupply = newMintedSupply;
        _mint(to, amount);
        
        emit TokenMinted(to, amount, mintedSupply, msg.sender);
    }
    
    // Pause/unpause
    function pause() external onlyRole(PAUSER_ROLE) {
        _pause();
    }
    
    function unpause() external onlyRole(PAUSER_ROLE) {
        _unpause();
    }
    
    // Timelocked emergency withdraw
    function initiateEmergencyWithdraw(address _token, uint256 _amount) external onlyRole(EMERGENCY_ROLE) {
        require(!pendingWithdrawal.active, "Withdrawal already pending");
        require(_amount > 0, "Amount must be positive");
        
        uint256 executeAfter = block.timestamp + EMERGENCY_TIMELOCK;
        pendingWithdrawal = EmergencyWithdrawal({
            token: _token,
            amount: _amount,
            executeAfter: executeAfter,
            active: true
        });
        
        emit EmergencyWithdrawalInitiated(_token, _amount, executeAfter);
    }
    
    function executeEmergencyWithdraw() external onlyRole(EMERGENCY_ROLE) nonReentrant {
        require(pendingWithdrawal.active, "No withdrawal pending");
        require(block.timestamp >= pendingWithdrawal.executeAfter, "Timelock not met");
        
        address tokenAddr = pendingWithdrawal.token;
        uint256 amount = pendingWithdrawal.amount;
        
        // Clear pending withdrawal
        delete pendingWithdrawal;
        
        // Send to designated treasury address (security fix)
        address recipient = treasury;
        
        if (tokenAddr == address(0)) {
            require(address(this).balance >= amount, "Insufficient ETH balance");
            (bool success, ) = payable(recipient).call{value: amount}("");
            require(success, "ETH withdrawal failed");
        } else {
            require(IERC20(tokenAddr).balanceOf(address(this)) >= amount, "Insufficient token balance");
            require(IERC20(tokenAddr).transfer(recipient, amount), "Token transfer failed");
        }
        
        emit EmergencyWithdrawalExecuted(tokenAddr, amount, recipient);
    }
    
    // Required overrides (no custom logic needed)
    function _update(address from, address to, uint256 value) internal override(ERC20, ERC20Pausable) {
        super._update(from, to, value);
    }
    
    // Support interface detection
    function supportsInterface(bytes4 interfaceId) public view virtual override(AccessControl) returns (bool) {
        return super.supportsInterface(interfaceId);
    }
    
    // View functions for better frontend integration
    function getSupplyInfo() external view returns (uint256 minted, uint256 cap, uint256 remaining) {
        return (mintedSupply, TOTAL_SUPPLY_CAP, TOTAL_SUPPLY_CAP - mintedSupply);
    }
    
    function getSupplyPercentage() external view returns (uint256) {
        return (mintedSupply * 100) / TOTAL_SUPPLY_CAP;
    }
    
    receive() external payable {}
}