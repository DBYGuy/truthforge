#!/bin/bash

echo "🚀 Running TruthForge Ecosystem Test Suite"
echo "================================================"
echo "Note: Tests must run on --network hardhat to have enough signers available"
echo "The zkSync testnet (default network) doesn't provide enough test signers"
echo ""

# Colors for output
GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m' # No Color

# Function to run test with status
run_test() {
    local test_file=$1
    local test_name=$2
    
    echo -e "${BLUE}📋 Running $test_name...${NC}"
    if npx hardhat test $test_file --network hardhat; then
        echo -e "${GREEN}✅ $test_name PASSED${NC}"
        return 0
    else
        echo -e "${RED}❌ $test_name FAILED${NC}"
        return 1
    fi
    echo ""
}

# Track results
failed_tests=0
total_tests=0

echo -e "${YELLOW}🔧 Compiling contracts...${NC}"
npx hardhat compile
echo ""

# Run individual contract tests
echo -e "${BLUE}🧪 Running Individual Contract Tests${NC}"
echo "======================================"

((total_tests++))
if ! run_test "test/VerifyToken.test.ts" "VerifyToken Contract Tests"; then
    ((failed_tests++))
fi

((total_tests++))
if ! run_test "test/ValidationPool.test.ts" "ValidationPool Contract Tests"; then
    ((failed_tests++))
fi

((total_tests++))
if ! run_test "test/PoolFactory.test.ts" "PoolFactory Contract Tests"; then
    ((failed_tests++))
fi

# Run integration tests
echo -e "${BLUE}🔗 Running Integration Tests${NC}"
echo "============================="

((total_tests++))
if ! run_test "test/TruthForgeIntegration.test.ts" "TruthForge Ecosystem Integration Tests"; then
    ((failed_tests++))
fi

# Run all tests together for final verification
echo -e "${BLUE}🏃 Running Complete Test Suite${NC}"
echo "==============================="

((total_tests++))
if npx hardhat test test/*.test.ts --network hardhat; then
    echo -e "${GREEN}✅ Complete Test Suite PASSED${NC}"
else
    echo -e "${RED}❌ Complete Test Suite FAILED${NC}"
    ((failed_tests++))
fi

# Final results
echo ""
echo "================================================"
if [ $failed_tests -eq 0 ]; then
    echo -e "${GREEN}🎉 ALL TESTS PASSED! ($total_tests/$total_tests)${NC}"
    echo -e "${GREEN}✨ TruthForge ecosystem is ready for deployment!${NC}"
else
    echo -e "${RED}❌ $failed_tests/$total_tests test suites failed${NC}"
    echo -e "${YELLOW}🔧 Please fix the failing tests before deployment${NC}"
fi

echo ""
echo "📖 Available test commands:"
echo "  Individual tests:"
echo "    npx hardhat test test/VerifyToken.test.ts --network hardhat"
echo "    npx hardhat test test/ValidationPool.test.ts --network hardhat"
echo "    npx hardhat test test/PoolFactory.test.ts --network hardhat"
echo "    npx hardhat test test/TruthForgeIntegration.test.ts --network hardhat"
echo ""
echo "  Test specific functionality:"
echo "    npx hardhat test --network hardhat --grep 'Deployment'"
echo "    npx hardhat test --network hardhat --grep 'Staking'"
echo "    npx hardhat test --network hardhat --grep 'Pool Creation'"
echo "    npx hardhat test --network hardhat --grep 'Integration'"

exit $failed_tests