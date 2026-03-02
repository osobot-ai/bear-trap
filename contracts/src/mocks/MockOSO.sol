// SPDX-License-Identifier: MIT
pragma solidity 0.8.23;

import {ERC20} from "openzeppelin/contracts/token/ERC20/ERC20.sol";

/// @title MockOSO
/// @notice Mintable ERC20 for testnet. Anyone can mint.
contract MockOSO is ERC20 {
    constructor() ERC20("Mock OSO", "OSO") {}

    /// @notice Mint tokens to any address. Public — for testnet use only.
    function mint(address to, uint256 amount) external {
        _mint(to, amount);
    }
}
