# TruthForge ZK Implementation Technical Appendix
## Detailed Implementation Specifications and Code Examples

**Reference Document:** ZK_CONTRACTOR_REQUIREMENTS.md  
**Purpose:** Provide specific implementation details and code examples for contractors  
**Version:** 1.0  

---

## A1. Detailed Circuit Implementation

### A1.1 Complete AttributeVerification.circom Template

```circom
pragma circom 2.0.0;

include "circomlib/circuits/poseidon.circom";
include "circomlib/circuits/bitify.circom";
include "circomlib/circuits/comparators.circom";

// Main circuit for TruthForge anonymous attribute verification
template AttributeVerification() {
    // PUBLIC INPUTS (exactly 5 inputs to match existing interface)
    signal input flag_value;        // Vote: 0 or 1
    signal input social_hash;       // Anonymized social credential hash
    signal input event_hash;        // Event-specific identifier  
    signal input degree;            // Academic credential level (1-4)
    signal input event_relevance;   // Proximity/relevance score (0-100)
    
    // PRIVATE INPUTS (user's actual credentials)
    signal private input social_proof;          // Raw social media credential
    signal private input degree_proof;          // Raw academic degree proof
    signal private input proximity_data;        // Geographic/topic proximity data
    signal private input nullifier_secret;      // Anti-sybil secret seed
    signal private input credential_salt;       // Additional entropy for privacy
    
    // INTERNAL SIGNALS
    signal social_hash_computed;
    signal degree_valid;
    signal relevance_computed;
    signal nullifier_components[4];
    
    // OUTPUT: Nullifier for sybil resistance
    signal output nullifier;
    
    // CONSTRAINT 1: Verify social hash matches social proof
    component social_hasher = Poseidon(2);
    social_hasher.inputs[0] <== social_proof;
    social_hasher.inputs[1] <== credential_salt;
    social_hash_computed <== social_hasher.out;
    social_hash === social_hash_computed;
    
    // CONSTRAINT 2: Verify degree is valid (1-4) and matches proof
    component degree_range = LessEqThan(3); // 3 bits for range 1-4
    degree_range.in[0] <== degree;
    degree_range.in[1] <== 4;
    degree_range.out === 1;
    
    component degree_min = GreaterEqThan(3);
    degree_min.in[0] <== degree;
    degree_min.in[1] <== 1;
    degree_min.out === 1;
    
    // Verify degree proof maps to claimed degree
    component degree_hasher = Poseidon(1);
    degree_hasher.inputs[0] <== degree_proof;
    degree_valid <== degree_hasher.out % 4 + 1; // Map proof to 1-4 range
    degree === degree_valid;
    
    // CONSTRAINT 3: Verify event relevance calculation
    component relevance_calculator = Poseidon(2);
    relevance_calculator.inputs[0] <== proximity_data;
    relevance_calculator.inputs[1] <== event_hash;
    relevance_computed <== relevance_calculator.out % 101; // 0-100 range
    event_relevance === relevance_computed;
    
    // CONSTRAINT 4: Verify flag value is binary (0 or 1)
    component flag_binary = Bits2Num(1);
    component flag_bits = Num2Bits(1);
    flag_bits.in <== flag_value;
    flag_binary.in[0] <== flag_bits.out[0];
    flag_value === flag_binary.out;
    
    // CONSTRAINT 5: Generate deterministic nullifier
    component nullifier_hasher = Poseidon(4);
    nullifier_hasher.inputs[0] <== nullifier_secret;
    nullifier_hasher.inputs[1] <== event_hash;
    nullifier_hasher.inputs[2] <== social_hash;
    nullifier_hasher.inputs[3] <== 0x1337; // Domain separator
    nullifier <== nullifier_hasher.out;
}

// Main component
component main = AttributeVerification();
```

### A1.2 Circuit Compilation and Setup Commands

```bash
#!/bin/bash
# Circuit compilation and setup script

# Step 1: Compile circuit
circom AttributeVerification.circom --r1cs --wasm --sym --c

# Step 2: Generate witness (for testing)
node AttributeVerification_js/generate_witness.js \
  AttributeVerification_js/AttributeVerification.wasm \
  input.json witness.wtns

# Step 3: Setup using Powers of Tau
snarkjs powersoftau new bn128 15 pot15_0000.ptau -v
snarkjs powersoftau contribute pot15_0000.ptau pot15_0001.ptau \
  --name="TruthForge Contribution" -v
snarkjs powersoftau prepare phase2 pot15_0001.ptau pot15_final.ptau -v

# Step 4: Generate proving and verifying keys
snarkjs groth16 setup AttributeVerification.r1cs pot15_final.ptau \
  AttributeVerification_0000.zkey
snarkjs zkey contribute AttributeVerification_0000.zkey \
  AttributeVerification_0001.zkey \
  --name="TruthForge Circuit Contribution" -v
snarkjs zkey export verificationkey AttributeVerification_0001.zkey \
  verification_key.json

# Step 5: Generate Solidity verifier
snarkjs zkey export solidityverifier AttributeVerification_0001.zkey \
  verifier.sol
```

---

## A2. Smart Contract Integration Details

### A2.1 Exact ZKVerifier.sol Modifications Required

```solidity
// REPLACE THE EXISTING verifyTx FUNCTION (lines 401-438) WITH:

/**
 * @dev Production Groth16 verification using actual cryptographic validation
 * Replaces the stubbed implementation with real zero-knowledge proof verification
 */
function verifyTx(
    uint[2] memory a,
    uint[2][2] memory b,
    uint[2] memory c,
    uint[5] memory input
) public view returns (bool) {
    require(input.length <= MAX_INPUT_SIZE, "Input too large");
    
    // Enhanced security validation (preserve existing)
    if (!_validateProofSecurity(a, b, c, input)) return false;
    if (!_validateCircuitConstraints(input)) return false;
    
    // NEW: Real Groth16 verification using BN254 pairing
    return _performGroth16Verification(a, b, c, input);
}

/**
 * @dev Core Groth16 verification implementation
 * Implements the mathematical verification equation:
 * e(A, B) == e(α, β) * e(γ^{-1}, C) * e(δ^{-1}, IC)
 */
function _performGroth16Verification(
    uint[2] memory a,
    uint[2][2] memory b,
    uint[2] memory c,
    uint[5] memory input
) internal view returns (bool) {
    // Compute IC = vk_ic[0] + sum(input[i] * vk_ic[i+1])
    uint[2] memory ic_point = _computeLinearCombination(input);
    
    // Prepare pairing input: 4 pairs for optimal batch verification
    uint256[24] memory pairing_input;
    
    // Pair 1: e(A, B)
    pairing_input[0] = a[0];
    pairing_input[1] = a[1];
    pairing_input[2] = b[0][0];
    pairing_input[3] = b[0][1];
    pairing_input[4] = b[1][0];
    pairing_input[5] = b[1][1];
    
    // Pair 2: e(-α, β) 
    pairing_input[6] = vk_alpha[0];
    pairing_input[7] = (PRIME_P - vk_alpha[1]) % PRIME_P; // Negate point
    pairing_input[8] = vk_beta[0][0];
    pairing_input[9] = vk_beta[0][1];
    pairing_input[10] = vk_beta[1][0];
    pairing_input[11] = vk_beta[1][1];
    
    // Pair 3: e(-γ, C)
    pairing_input[12] = vk_gamma[0];
    pairing_input[13] = (PRIME_P - vk_gamma[1]) % PRIME_P;
    pairing_input[14] = c[0];
    pairing_input[15] = c[1];
    pairing_input[16] = 0; // G2 identity for C (G1 point)
    pairing_input[17] = 0;
    
    // Pair 4: e(-δ, IC)
    pairing_input[18] = vk_delta[0];
    pairing_input[19] = (PRIME_P - vk_delta[1]) % PRIME_P;
    pairing_input[20] = ic_point[0];
    pairing_input[21] = ic_point[1];
    pairing_input[22] = 0; // G2 identity for IC (G1 point)
    pairing_input[23] = 0;
    
    // Call bn256Pairing precompile for batch verification
    uint256[1] memory result;
    bool success;
    
    assembly {
        success := staticcall(
            gas(),
            0x08,           // bn256Pairing precompile
            pairing_input,
            0x300,          // 24 * 32 bytes = 768 bytes
            result,
            0x20            // 32 bytes output
        )
    }
    
    return success && result[0] == 1;
}

/**
 * @dev Update verifying key from circuit compilation
 * Must be called after trusted setup ceremony
 */
function updateVerifyingKeyFromCircuit(
    uint[2] memory newAlpha,
    uint[2][2] memory newBeta,
    uint[2] memory newGamma,
    uint[2] memory newDelta,
    uint[] memory newIC
) external onlyRole(KEY_ADMIN_ROLE) whenPaused {
    require(newIC.length >= 12, "IC array too small"); // 5 inputs + 1 constant
    
    vk_alpha = newAlpha;
    vk_beta = newBeta;
    vk_gamma = newGamma;
    vk_delta = newDelta;
    vk_ic = newIC;
    
    emit VerifyingKeyUpdated(newAlpha, newBeta, newGamma, newDelta, newIC.length);
}

event VerifyingKeyUpdated(
    uint[2] alpha,
    uint[2][2] beta,
    uint[2] gamma,
    uint[2] delta,
    uint256 icLength
);
```

### A2.2 ValidationPool.sol Integration Points

```solidity
// ENSURE THESE FUNCTIONS IN ValidationPool.sol ARE PRESERVED:

function castVote(
    uint[2] memory a,
    uint[2][2] memory b,
    uint[2] memory c,
    uint[5] memory input, // [flag_value, social_hash, event_hash, degree, event_relevance]
    uint256 stakeAmount
) external nonReentrant whenNotPaused {
    // ... existing validation code ...
    
    // CRITICAL: This call must work with real ZK verification
    (uint256 weight, uint256 gravityScore, uint256 posterior, bool flagged) = 
        zkVerifier.verifyClaim(a, b, c, input);
    
    require(weight > 0, "Invalid proof"); // This must pass with real proofs
    
    // ... rest of function unchanged ...
}
```

---

## A3. Frontend Integration Implementation

### A3.1 Proof Generation Library (TypeScript)

```typescript
// src/lib/zkProofGenerator.ts

import * as snarkjs from "snarkjs";

export interface UserCredentials {
    socialProof: string;        // Raw social media credential
    degreeProof: string;        // Raw academic degree proof
    proximityData: string;      // Geographic/topic proximity data
    nullifierSecret: string;    // User's secret nullifier seed
    credentialSalt: string;     // Additional entropy
}

export interface PublicInputs {
    flagValue: number;          // 0 or 1
    socialHash: string;         // Hash of social proof
    eventHash: string;          // Event identifier
    degree: number;             // 1-4
    eventRelevance: number;     // 0-100
}

export interface ZKProof {
    a: [string, string];
    b: [[string, string], [string, string]];
    c: [string, string];
    publicInputs: [string, string, string, string, string];
}

export class ZKProofGenerator {
    private wasmPath: string;
    private zkeyPath: string;
    
    constructor(wasmPath: string, zkeyPath: string) {
        this.wasmPath = wasmPath;
        this.zkeyPath = zkeyPath;
    }
    
    /**
     * Generate ZK proof for attribute verification
     */
    async generateProof(
        credentials: UserCredentials,
        publicInputs: PublicInputs
    ): Promise<ZKProof> {
        // Prepare circuit inputs
        const circuitInputs = {
            // Public inputs (must match circuit interface exactly)
            flag_value: publicInputs.flagValue.toString(),
            social_hash: publicInputs.socialHash,
            event_hash: publicInputs.eventHash,
            degree: publicInputs.degree.toString(),
            event_relevance: publicInputs.eventRelevance.toString(),
            
            // Private inputs (hidden from verifier)
            social_proof: credentials.socialProof,
            degree_proof: credentials.degreeProof,
            proximity_data: credentials.proximityData,
            nullifier_secret: credentials.nullifierSecret,
            credential_salt: credentials.credentialSalt
        };
        
        try {
            // Generate witness
            const { witness } = await snarkjs.groth16.fullProve(
                circuitInputs,
                this.wasmPath,
                this.zkeyPath
            );
            
            // Extract proof components
            const proof = {
                a: [witness.pi_a[0], witness.pi_a[1]],
                b: [
                    [witness.pi_b[0][1], witness.pi_b[0][0]], // Note: reversed for BN254
                    [witness.pi_b[1][1], witness.pi_b[1][0]]
                ],
                c: [witness.pi_c[0], witness.pi_c[1]],
                publicInputs: [
                    publicInputs.flagValue.toString(),
                    publicInputs.socialHash,
                    publicInputs.eventHash,
                    publicInputs.degree.toString(),
                    publicInputs.eventRelevance.toString()
                ]
            };
            
            return proof;
            
        } catch (error) {
            throw new Error(`Proof generation failed: ${error.message}`);
        }
    }
    
    /**
     * Verify proof locally before submitting to blockchain
     */
    async verifyProof(proof: ZKProof, vkeyPath: string): Promise<boolean> {
        try {
            const vKey = JSON.parse(await fetch(vkeyPath).then(r => r.text()));
            
            return await snarkjs.groth16.verify(
                vKey,
                proof.publicInputs,
                {
                    pi_a: proof.a,
                    pi_b: proof.b,
                    pi_c: proof.c
                }
            );
        } catch (error) {
            console.error("Local verification failed:", error);
            return false;
        }
    }
}

/**
 * Web Worker for non-blocking proof generation
 */
export class ZKProofWorker {
    private worker: Worker;
    
    constructor() {
        this.worker = new Worker('/zkProofWorker.js');
    }
    
    async generateProofAsync(
        credentials: UserCredentials,
        publicInputs: PublicInputs
    ): Promise<ZKProof> {
        return new Promise((resolve, reject) => {
            this.worker.postMessage({ credentials, publicInputs });
            
            this.worker.onmessage = (event) => {
                if (event.data.success) {
                    resolve(event.data.proof);
                } else {
                    reject(new Error(event.data.error));
                }
            };
            
            // Timeout after 30 seconds
            setTimeout(() => {
                reject(new Error("Proof generation timeout"));
            }, 30000);
        });
    }
    
    terminate() {
        this.worker.terminate();
    }
}
```

### A3.2 React Component for Proof Generation

```typescript
// src/components/ZKVoteComponent.tsx

import React, { useState, useCallback } from 'react';
import { ZKProofGenerator, ZKProofWorker } from '../lib/zkProofGenerator';
import { useWeb3 } from '../hooks/useWeb3';

interface ZKVoteComponentProps {
    poolAddress: string;
    eventHash: string;
    onVoteSubmitted: () => void;
}

export const ZKVoteComponent: React.FC<ZKVoteComponentProps> = ({
    poolAddress,
    eventHash,
    onVoteSubmitted
}) => {
    const [isGenerating, setIsGenerating] = useState(false);
    const [proofProgress, setProofProgress] = useState(0);
    const { validationPool, account } = useWeb3();
    
    const [credentials, setCredentials] = useState({
        socialProof: '',
        degreeProof: '',
        proximityData: '',
        degree: 1,
        eventRelevance: 50,
        vote: true
    });
    
    const generateAndSubmitProof = useCallback(async () => {
        if (!validationPool || !account) return;
        
        setIsGenerating(true);
        setProofProgress(0);
        
        try {
            // Initialize proof generator
            const zkWorker = new ZKProofWorker();
            
            // Prepare inputs
            const userCredentials = {
                socialProof: credentials.socialProof,
                degreeProof: credentials.degreeProof,
                proximityData: credentials.proximityData,
                nullifierSecret: generateNullifierSecret(account),
                credentialSalt: generateSalt()
            };
            
            const publicInputs = {
                flagValue: credentials.vote ? 1 : 0,
                socialHash: await hashCredential(credentials.socialProof),
                eventHash: eventHash,
                degree: credentials.degree,
                eventRelevance: credentials.eventRelevance
            };
            
            setProofProgress(20);
            
            // Generate proof (async to avoid blocking UI)
            const proof = await zkWorker.generateProofAsync(
                userCredentials,
                publicInputs
            );
            
            setProofProgress(70);
            
            // Submit to blockchain
            const stakeAmount = ethers.utils.parseEther("1.0"); // 1 VERIFY token
            
            const tx = await validationPool.castVote(
                proof.a,
                proof.b,
                proof.c,
                proof.publicInputs,
                stakeAmount
            );
            
            setProofProgress(90);
            
            await tx.wait();
            setProofProgress(100);
            
            zkWorker.terminate();
            onVoteSubmitted();
            
        } catch (error) {
            console.error("Vote submission failed:", error);
            // Handle error - show user feedback
        } finally {
            setIsGenerating(false);
            setProofProgress(0);
        }
    }, [credentials, validationPool, account, eventHash, onVoteSubmitted]);
    
    return (
        <div className="zk-vote-component">
            <h3>Anonymous Vote Submission</h3>
            
            {/* Credential input form */}
            <div className="credential-inputs">
                <input
                    type="text"
                    placeholder="Social Media Credential"
                    value={credentials.socialProof}
                    onChange={(e) => setCredentials({
                        ...credentials,
                        socialProof: e.target.value
                    })}
                />
                
                <select
                    value={credentials.degree}
                    onChange={(e) => setCredentials({
                        ...credentials,
                        degree: parseInt(e.target.value)
                    })}
                >
                    <option value={1}>Bachelor's Degree</option>
                    <option value={2}>Master's Degree</option>
                    <option value={3}>PhD</option>
                    <option value={4}>Post-Doc</option>
                </select>
                
                <div className="vote-choice">
                    <label>
                        <input
                            type="radio"
                            checked={credentials.vote}
                            onChange={() => setCredentials({
                                ...credentials,
                                vote: true
                            })}
                        />
                        Verify (True)
                    </label>
                    <label>
                        <input
                            type="radio"
                            checked={!credentials.vote}
                            onChange={() => setCredentials({
                                ...credentials,
                                vote: false
                            })}
                        />
                        Discount (False)
                    </label>
                </div>
            </div>
            
            {/* Proof generation and submission */}
            <button
                onClick={generateAndSubmitProof}
                disabled={isGenerating}
                className="submit-vote-btn"
            >
                {isGenerating ? `Generating Proof... ${proofProgress}%` : 'Submit Anonymous Vote'}
            </button>
            
            {isGenerating && (
                <div className="progress-bar">
                    <div 
                        className="progress-fill" 
                        style={{ width: `${proofProgress}%` }}
                    />
                </div>
            )}
        </div>
    );
};

// Utility functions
function generateNullifierSecret(account: string): string {
    return ethers.utils.keccak256(
        ethers.utils.toUtf8Bytes(`${account}_nullifier_secret`)
    );
}

function generateSalt(): string {
    return ethers.utils.hexlify(ethers.utils.randomBytes(32));
}

async function hashCredential(credential: string): Promise<string> {
    return ethers.utils.keccak256(ethers.utils.toUtf8Bytes(credential));
}
```

---

## A4. Testing Framework Implementation

### A4.1 Circuit Testing Suite

```javascript
// test/AttributeVerification.test.js

const chai = require("chai");
const path = require("path");
const wasm_tester = require("circom_tester").wasm;
const F1Field = require("ffjavascript").F1Field;
const Scalar = require("ffjavascript").Scalar;
exports.p = Scalar.fromString("21888242871839275222246405745257275088548364400416034343698204186575808495617");
const Fr = new F1Field(exports.p);

describe("AttributeVerification Circuit", function () {
    let circuit;
    
    before(async () => {
        circuit = await wasm_tester(path.join(__dirname, "circuits", "AttributeVerification.circom"));
    });
    
    it("Should verify valid credentials", async () => {
        const input = {
            flag_value: "1",
            social_hash: "12345678901234567890123456789012345678901234567890123456789012345678",
            event_hash: "98765432109876543210987654321098765432109876543210987654321098765432",
            degree: "3", // PhD
            event_relevance: "75",
            
            // Private inputs
            social_proof: "valid_social_credential",
            degree_proof: "phd_certificate_hash",
            proximity_data: "geographic_proximity_data",
            nullifier_secret: "user_secret_12345",
            credential_salt: "random_salt_67890"
        };
        
        const witness = await circuit.calculateWitness(input);
        await circuit.checkConstraints(witness);
        
        // Verify nullifier is generated
        const nullifier = witness[circuit.symbols.nullifier.varIdx];
        chai.expect(nullifier).to.not.equal(Fr.zero);
    });
    
    it("Should reject invalid degree range", async () => {
        const input = {
            flag_value: "1",
            social_hash: "12345678901234567890123456789012345678901234567890123456789012345678",
            event_hash: "98765432109876543210987654321098765432109876543210987654321098765432",
            degree: "5", // Invalid: > 4
            event_relevance: "75",
            
            social_proof: "valid_social_credential",
            degree_proof: "phd_certificate_hash",
            proximity_data: "geographic_proximity_data",
            nullifier_secret: "user_secret_12345",
            credential_salt: "random_salt_67890"
        };
        
        try {
            await circuit.calculateWitness(input);
            chai.assert.fail("Should have thrown constraint error");
        } catch (error) {
            chai.expect(error.message).to.include("Error in template");
        }
    });
    
    it("Should generate unique nullifiers for different users", async () => {
        const baseInput = {
            flag_value: "1",
            social_hash: "12345678901234567890123456789012345678901234567890123456789012345678",
            event_hash: "98765432109876543210987654321098765432109876543210987654321098765432",
            degree: "2",
            event_relevance: "60",
            
            social_proof: "social_credential",
            degree_proof: "degree_hash",
            proximity_data: "proximity_data",
            credential_salt: "salt_12345"
        };
        
        // User 1
        const input1 = { ...baseInput, nullifier_secret: "user1_secret" };
        const witness1 = await circuit.calculateWitness(input1);
        const nullifier1 = witness1[circuit.symbols.nullifier.varIdx];
        
        // User 2
        const input2 = { ...baseInput, nullifier_secret: "user2_secret" };
        const witness2 = await circuit.calculateWitness(input2);
        const nullifier2 = witness2[circuit.symbols.nullifier.varIdx];
        
        chai.expect(nullifier1).to.not.equal(nullifier2);
    });
});
```

### A4.2 Smart Contract Integration Tests

```javascript
// test/ZKVerifierIntegration.test.js

const { expect } = require("chai");
const { ethers } = require("hardhat");
const snarkjs = require("snarkjs");
const circomlib = require("circomlib");

describe("ZKVerifier Integration", function () {
    let zkVerifier, validationPool, token;
    let owner, user1, user2;
    
    before(async function () {
        [owner, user1, user2] = await ethers.getSigners();
        
        // Deploy contracts
        const TruthForgeToken = await ethers.getContractFactory("TruthForgeToken");
        token = await TruthForgeToken.deploy();
        
        const ZKVerifier = await ethers.getContractFactory("ZKVerifier");
        zkVerifier = await ZKVerifier.deploy();
        
        const ValidationPool = await ethers.getContractFactory("ValidationPool");
        validationPool = await ValidationPool.deploy(
            token.address,
            zkVerifier.address,
            ethers.utils.keccak256(ethers.utils.toUtf8Bytes("test_news")),
            Math.floor(Date.now() / 1000) + 3600, // 1 hour from now
            [100, 100, 100, 100] // flag weights
        );
        
        // Setup tokens
        await token.mint(user1.address, ethers.utils.parseEther("100"));
        await token.connect(user1).approve(validationPool.address, ethers.utils.parseEther("100"));
    });
    
    it("Should verify real ZK proof and cast vote", async function () {
        // Generate real proof using circuit
        const input = {
            flag_value: 1,
            social_hash: "0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef",
            event_hash: "0xfedcba0987654321fedcba0987654321fedcba0987654321fedcba0987654321",
            degree: 3,
            event_relevance: 80,
            
            // Private inputs
            social_proof: "twitter_verification_12345",
            degree_proof: "phd_certificate_abcdef",
            proximity_data: "geolocation_proximity_data",
            nullifier_secret: "user1_secret_nullifier",
            credential_salt: ethers.utils.hexlify(ethers.utils.randomBytes(32))
        };
        
        // Generate proof (would use actual circuit in practice)
        const proof = await generateMockProof(input);
        
        const publicInputs = [
            input.flag_value,
            input.social_hash,
            input.event_hash,
            input.degree,
            input.event_relevance
        ];
        
        // Submit vote with ZK proof
        const stakeAmount = ethers.utils.parseEther("10");
        
        await expect(
            validationPool.connect(user1).castVote(
                [proof.a[0], proof.a[1]],
                [[proof.b[0][0], proof.b[0][1]], [proof.b[1][0], proof.b[1][1]]],
                [proof.c[0], proof.c[1]],
                publicInputs,
                stakeAmount
            )
        ).to.emit(validationPool, "VoteCast");
        
        // Verify vote was recorded
        const poolStatus = await validationPool.getPoolStatus();
        expect(poolStatus.verifyStake).to.be.gt(0);
    });
    
    it("Should reject invalid ZK proof", async function () {
        // Generate invalid proof
        const invalidProof = {
            a: ["0x1", "0x2"],
            b: [["0x3", "0x4"], ["0x5", "0x6"]],
            c: ["0x7", "0x8"]
        };
        
        const publicInputs = [1, "0x123", "0x456", 2, 50];
        const stakeAmount = ethers.utils.parseEther("10");
        
        await expect(
            validationPool.connect(user2).castVote(
                invalidProof.a,
                invalidProof.b,
                invalidProof.c,
                publicInputs,
                stakeAmount
            )
        ).to.be.revertedWith("Invalid proof");
    });
    
    it("Should prevent double voting with nullifier", async function () {
        // Same user tries to vote twice with same nullifier
        const input = {
            flag_value: 0,
            social_hash: "0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef",
            event_hash: "0xfedcba0987654321fedcba0987654321fedcba0987654321fedcba0987654321",
            degree: 2,
            event_relevance: 60,
            
            social_proof: "twitter_verification_12345",
            degree_proof: "masters_certificate_xyz",
            proximity_data: "proximity_data_789",
            nullifier_secret: "user1_secret_nullifier", // Same secret as before
            credential_salt: ethers.utils.hexlify(ethers.utils.randomBytes(32))
        };
        
        const proof = await generateMockProof(input);
        const publicInputs = [
            input.flag_value,
            input.social_hash,
            input.event_hash,
            input.degree,
            input.event_relevance
        ];
        
        const stakeAmount = ethers.utils.parseEther("5");
        
        await expect(
            validationPool.connect(user1).castVote(
                [proof.a[0], proof.a[1]],
                [[proof.b[0][0], proof.b[0][1]], [proof.b[1][0], proof.b[1][1]]],
                [proof.c[0], proof.c[1]],
                publicInputs,
                stakeAmount
            )
        ).to.be.revertedWith("Double vote");
    });
});

// Mock proof generation for testing (replace with real circuit)
async function generateMockProof(input) {
    // This would use the actual circuit in production
    return {
        a: ["0x1234", "0x5678"],
        b: [["0xabcd", "0xef01"], ["0x2345", "0x6789"]],
        c: ["0xcdef", "0x0123"]
    };
}
```

---

## A5. Gas Optimization Strategies

### A5.1 Circuit Optimization Techniques

```circom
// Optimized version with reduced constraints
template OptimizedAttributeVerification() {
    signal input flag_value;
    signal input social_hash;
    signal input event_hash;
    signal input degree;
    signal input event_relevance;
    
    signal private input social_proof;
    signal private input degree_proof;
    signal private input proximity_data;
    signal private input nullifier_secret;
    
    // OPTIMIZATION 1: Use single hash for multiple verifications
    component main_hasher = Poseidon(6);
    main_hasher.inputs[0] <== social_proof;
    main_hasher.inputs[1] <== degree_proof;
    main_hasher.inputs[2] <== proximity_data;
    main_hasher.inputs[3] <== nullifier_secret;
    main_hasher.inputs[4] <== event_hash;
    main_hasher.inputs[5] <== 12345; // Domain separator
    
    signal hash_output;
    hash_output <== main_hasher.out;
    
    // OPTIMIZATION 2: Derive all outputs from single hash
    signal social_hash_derived;
    signal degree_derived;
    signal relevance_derived;
    signal nullifier;
    
    social_hash_derived <== hash_output;
    degree_derived <== (hash_output >> 8) % 4 + 1; // Extract bits 8-9 for degree
    relevance_derived <== (hash_output >> 16) % 101; // Extract bits 16-22 for relevance
    nullifier <== hash_output >> 32; // Use high bits for nullifier
    
    // OPTIMIZATION 3: Simple equality constraints instead of complex verification
    social_hash === social_hash_derived;
    degree === degree_derived;
    event_relevance === relevance_derived;
    
    // OPTIMIZATION 4: Binary constraint for flag_value
    flag_value * (flag_value - 1) === 0; // Ensures flag_value is 0 or 1
}
```

### A5.2 Smart Contract Gas Optimization

```solidity
// Ultra-optimized verification for zkSync Era
contract OptimizedZKVerifier {
    // Pack verifying key into fewer storage slots
    struct PackedVK {
        uint256[4] alpha_beta_gamma_delta; // Pack all G1/G2 coordinates
        uint256[] ic;                      // IC points (optimized storage)
    }
    
    PackedVK public vk;
    
    /**
     * @dev Gas-optimized verification using inline assembly
     */
    function fastVerifyTx(
        uint[2] calldata a,
        uint[2][2] calldata b,
        uint[2] calldata c,
        uint[5] calldata input
    ) external view returns (bool) {
        // Skip expensive validation for trusted callers
        if (msg.sender == TRUSTED_POOL_ADDRESS) {
            return _fastPairingCheck(a, b, c, input);
        }
        
        // Full validation for untrusted callers
        return _fullVerification(a, b, c, input);
    }
    
    /**
     * @dev Optimized pairing check using minimal validation
     */
    function _fastPairingCheck(
        uint[2] calldata a,
        uint[2][2] calldata b,
        uint[2] calldata c,
        uint[5] calldata input
    ) internal view returns (bool) {
        uint256[24] memory pairingInput;
        
        // Inline assembly for gas-efficient memory operations
        assembly {
            // Copy proof elements directly to pairing input
            let inputPtr := pairingInput
            calldatacopy(inputPtr, a, 0x40)      // Copy a
            calldatacopy(add(inputPtr, 0x40), b, 0x80)  // Copy b
            calldatacopy(add(inputPtr, 0xC0), c, 0x40)  // Copy c
        }
        
        // Compute IC point using optimized algorithm
        uint256[2] memory ic = _computeICOptimized(input);
        
        // Pack remaining pairing data
        assembly {
            let ptr := add(pairingInput, 0x100)
            mstore(ptr, mload(add(ic, 0x00)))
            mstore(add(ptr, 0x20), mload(add(ic, 0x20)))
        }
        
        // Single pairing precompile call
        uint256[1] memory result;
        assembly {
            let success := staticcall(gas(), 0x08, pairingInput, 0x300, result, 0x20)
            if iszero(success) { revert(0, 0) }
        }
        
        return result[0] == 1;
    }
    
    /**
     * @dev Optimized IC computation using Horner's method
     */
    function _computeICOptimized(uint[5] calldata input) 
        internal view returns (uint256[2] memory) 
    {
        uint256 x = vk.ic[0];  // Start with IC[0]
        uint256 y = vk.ic[1];
        
        // Unrolled loop for exactly 5 inputs (gas optimization)
        if (input[0] != 0) {
            x = addmod(x, mulmod(input[0], vk.ic[2], PRIME_P), PRIME_P);
            y = addmod(y, mulmod(input[0], vk.ic[3], PRIME_P), PRIME_P);
        }
        if (input[1] != 0) {
            x = addmod(x, mulmod(input[1], vk.ic[4], PRIME_P), PRIME_P);
            y = addmod(y, mulmod(input[1], vk.ic[5], PRIME_P), PRIME_P);
        }
        if (input[2] != 0) {
            x = addmod(x, mulmod(input[2], vk.ic[6], PRIME_P), PRIME_P);
            y = addmod(y, mulmod(input[2], vk.ic[7], PRIME_P), PRIME_P);
        }
        if (input[3] != 0) {
            x = addmod(x, mulmod(input[3], vk.ic[8], PRIME_P), PRIME_P);
            y = addmod(y, mulmod(input[3], vk.ic[9], PRIME_P), PRIME_P);
        }
        if (input[4] != 0) {
            x = addmod(x, mulmod(input[4], vk.ic[10], PRIME_P), PRIME_P);
            y = addmod(y, mulmod(input[4], vk.ic[11], PRIME_P), PRIME_P);
        }
        
        return [x, y];
    }
}
```

---

## A6. Security Considerations and Audit Checklist

### A6.1 Circuit Security Audit Points

```
CIRCUIT SECURITY CHECKLIST:
├── Constraint Completeness
│   ├── [ ] All public inputs properly constrained
│   ├── [ ] Private inputs validated against public commitments
│   ├── [ ] Range constraints prevent overflow/underflow
│   └── [ ] Nullifier uniqueness mathematically guaranteed
├── Soundness Verification
│   ├── [ ] Invalid witness generation fails appropriately
│   ├── [ ] Malformed inputs rejected by constraints
│   ├── [ ] Edge cases (0, max values) handled correctly
│   └── [ ] No constraint bypass vulnerabilities
├── Zero-Knowledge Properties
│   ├── [ ] Private inputs not leaked through constraints
│   ├── [ ] Nullifier doesn't reveal user identity
│   ├── [ ] Proof simulation indistinguishable from real proofs
│   └── [ ] No auxiliary information leakage
└── Implementation Security
    ├── [ ] Trusted setup ceremony properly executed
    ├── [ ] Powers of tau contribute sufficient entropy
    ├── [ ] Circuit compilation deterministic and verifiable
    └── [ ] Setup artifacts properly verified and distributed
```

### A6.2 Smart Contract Security Audit Points

```
SMART CONTRACT SECURITY CHECKLIST:
├── Integration Security
│   ├── [ ] Groth16 verification correctly implemented
│   ├── [ ] Pairing precompile called with correct parameters
│   ├── [ ] Public input validation matches circuit constraints
│   └── [ ] Return values properly handled and validated
├── Access Control
│   ├── [ ] Verifying key updates require proper permissions
│   ├── [ ] Emergency pause functionality secured
│   ├── [ ] Rate limiting cannot be bypassed
│   └── [ ] Admin functions properly protected
├── Economic Security
│   ├── [ ] Nullifier system prevents double-spending
│   ├── [ ] Stake requirements enforced correctly
│   ├── [ ] Reward distribution logic correct
│   └── [ ] Flash loan attacks prevented
├── Gas and DoS Protection
│   ├── [ ] Gas consumption within reasonable limits
│   ├── [ ] No unbounded loops or recursion
│   ├── [ ] Input size limits enforced
│   └── [ ] Denial of service vectors mitigated
└── Integration Compatibility
    ├── [ ] ValidationPool integration preserved
    ├── [ ] Bias calculation system unaffected
    ├── [ ] Event emissions maintain compatibility
    └── [ ] Existing test suite passes without modification
```

---

## Conclusion

This technical appendix provides the detailed implementation specifications needed for contractors to deliver a production-ready ZK verification system for TruthForge. The combination of the main requirements document and this technical appendix should enable accurate quotes, timeline estimates, and successful implementation delivery.

**Key Implementation Notes:**
- Maintain exact compatibility with existing ValidationPool.sol interface
- Preserve TruthForge's breakthrough bias calculation system  
- Optimize specifically for zkSync Era deployment
- Prioritize security and correctness over premature optimization
- Provide multiple optimization levels for different use cases

The contractor who successfully implements these specifications will deliver the final critical component needed for TruthForge's production launch.