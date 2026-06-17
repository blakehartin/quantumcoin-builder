// Sample contract (Mini §6.3) seeded into a fresh workspace.
export const STORAGE_SOL = `// SPDX-License-Identifier: MIT
pragma solidity 0.7.6;

contract Storage {
    uint256 private value;

    function setValue(uint256 v) public {
        value = v;
    }

    function getValue() public view returns (uint256) {
        return value;
    }
}
`;
