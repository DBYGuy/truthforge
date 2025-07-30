# TruthForge Project Configuration

## Project Overview
TruthForge is a decentralized protocol for real-time news validation using blockchain and zero-knowledge proofs (ZK-SNARKs) on zkSync. Goal: Combat fake news by enabling anonymous attribute-based voting (e.g., "expert in politics") with weighted consensus (stake * weight * gravity). Key components:
- TruthForgeToken.sol: ERC-20 for $VERIFY staking/rewards.
- PoolFactory.sol: Creates validation pools from news hashes.
- ValidationPool.sol: Manages staking, voting, and distribution.
- ZKVerifier.sol: Verifies ZK proofs, computes scores (weight, gravity, bias).
MVP target: Q3 2025, with full launch Q1 2026. Built with Next.js dApp, Supabase for flags, and Circom/snarkjs for ZK.

## Custom Instructions
- **Coding Style**: Use Solidity ^0.8.26, OpenZeppelin (@openzeppelin/contracts) for security, and NatSpec comments for docs. Keep functions <300 gas where possible on zkSync.
- **Workflow**: Off-chain ZK proof generation (Circom -> snarkjs export), on-chain verification. Commit changes with `git commit -m "feat: <desc>"`.
- **Testing**: Write unit tests (Foundry/Hardhat) for each function, functional tests for interop (e.g., Factory -> Pool -> ZKVerifier), and audit with Claude Code (target 100% pass).
- **Privacy**: Ensure no wallet/social linkage (use nullifiers, Pedersen commitments for attributes).
- **Dependencies**: Install via npm/yarn (e.g., "circomlib": "^0.5.6", "snarkjs": "^0.4.27").

## Terminology
- **Module**: Refers to a Solidity contract (e.g., ValidationPool) or Circom circuit file, not a generic JS module.
- **Weight**: Credibility multiplier (degree * attribute / (1 + bias)), 0-100.
- **Gravity**: Event relevance factor (100 - (bias * distance_factor)), 0-100.
- **Nullifier**: Unique hash per user/event to prevent double-signing.

## Recent Security Improvements (Completed)
- **Nullifier Security Fixed**: Removed MEV-manipulable inputs (block.chainid), implemented secure entropy sources with domain separation
- **Enhanced Events**: Added comprehensive events for frontend integration across all contracts
- **Emergency Withdrawal Security**: Fixed privilege escalation vulnerability in TruthForgeToken.sol
- **Frontend Integration**: Added batch query functions, transaction preview capabilities, and enhanced view functions

## Critical Security Tasks (In Progress)
- **MEV-Resistant Bias Calculation**: Developed bias_implementation_v2.jl with corrected Beta(2,5) distribution. Original implementation had 97% mean error and failed validation. V2 uses proper breakpoints (3300, 7500) and quadratic tail growth.
- **Validation Scripts**: Use `julia bias_implementation_v2.jl` to validate corrected implementation before deploying to ZKVerifier.sol
- **Production Blockers**: ZK verification still stubbed (CRITICAL), flash loan bypasses need removal, overflow protection needed

## Commands
- `/project:create-pool <newsHash> <flagWeights>`: Generate PoolFactory createPool call with weights.
- `/zk:gen-proof <circuit> <inputs>`: Run Circom/snarkjs to generate ZK proof offline.
- `/test:unit <contract>`: Execute Foundry unit tests for specified contract.
- `/audit:check <file>`: Run Claude Code audit on file, flag errors (>80% pass).
- `/doc:update`: Auto-generate NatSpec docs for latest changes.
- `/validate:bias`: Run Julia validation scripts (bias_analysis.jl, bias_validation.jl, bias_implementation_v2.jl)

## Hooks
- **Pre-Edit**: Run `npm run prettier -- --check .` to format code.
- **Post-Edit**: Run `npm run lint` and `forge test` to validate.
- **Settings**: Defined in `.claude/settings.json`:
  ```json
  {
    "preEdit": "npm run prettier -- --check .",
    "postEdit": "npm run lint && forge test",
    "globalMemory": {
      "defaultGasLimit": 300000
    }
  }
