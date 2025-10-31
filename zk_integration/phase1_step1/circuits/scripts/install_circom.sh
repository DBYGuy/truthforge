#!/bin/bash
# Install circom compiler for CIRCOM circuit development
# Version: 2.1.6 or later required

set -e

echo "Installing circom compiler..."

# Check if Rust is installed
if ! command -v cargo &> /dev/null; then
    echo "Rust is not installed. Installing Rust..."
    curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh -s -- -y
    source "$HOME/.cargo/env"
fi

echo "Rust version: $(rustc --version)"

# Clone and build circom
cd /tmp
git clone https://github.com/iden3/circom.git
cd circom
cargo build --release
cargo install --path circom

echo "Verifying circom installation..."
circom --version

echo "Circom installed successfully!"
echo "Location: $(which circom)"
