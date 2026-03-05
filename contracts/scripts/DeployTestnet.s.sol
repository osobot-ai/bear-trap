// SPDX-License-Identifier: MIT
pragma solidity 0.8.23;

import {Script, console2} from "forge-std/Script.sol";
import {BearTrap, IERC20} from "../src/BearTrap.sol";
import {ZKPEnforcer} from "../src/ZKPEnforcer.sol";
import {IRiscZeroVerifier} from "risc0/IRiscZeroVerifier.sol";
import {MockRiscZeroVerifier} from "../src/mocks/MockRiscZeroVerifier.sol";
import {MockOSO} from "../src/mocks/MockOSO.sol";

/// @title DeployTestnet — Deploy Bear Trap contracts to Base Sepolia with mocks
/// @dev Run with:
///   forge script contracts/scripts/DeployTestnet.s.sol --rpc-url ${RPC_URL} --broadcast -vv
contract DeployTestnet is Script {
    function run() external {
        uint256 ticketPrice = 1000 * 1e18; // 1000 OSO per ticket

        console2.log("=== Deploying Bear Trap (TESTNET) to Base Sepolia ===");
        console2.log("");

        vm.startBroadcast();

        // 1. Deploy MockRiscZeroVerifier
        MockRiscZeroVerifier mockVerifier = new MockRiscZeroVerifier();
        console2.log("MockRiscZeroVerifier deployed at:", address(mockVerifier));

        // 2. Deploy MockOSO
        MockOSO mockOSO = new MockOSO();
        console2.log("MockOSO deployed at:", address(mockOSO));

        // 3. Deploy ZKPEnforcer (using MockRiscZeroVerifier)
        ZKPEnforcer zkpEnforcer = new ZKPEnforcer(IRiscZeroVerifier(address(mockVerifier)));
        console2.log("ZKPEnforcer deployed at:", address(zkpEnforcer));

        // 4. Deploy BearTrap (using MockOSO, owner = deployer)
        BearTrap bearTrap = new BearTrap(IERC20(address(mockOSO)), ticketPrice, msg.sender);
        console2.log("BearTrap deployed at:", address(bearTrap));

        vm.stopBroadcast();

        console2.log("");
        console2.log("=== Testnet Deployment Complete ===");
        console2.log("MockRiscZeroVerifier:", address(mockVerifier));
        console2.log("MockOSO:", address(mockOSO));
        console2.log("ZKPEnforcer:", address(zkpEnforcer));
        console2.log("BearTrap:", address(bearTrap));
        console2.log("Ticket Price:", ticketPrice);
        console2.log("");
        console2.log("Next steps:");
        console2.log("1. Set BEAR_TRAP_ADDRESS and OSO_TOKEN_ADDRESS in .env");
        console2.log("2. Mint test OSO tokens: MockOSO.mint(yourAddress, amount)");
        console2.log("3. Create a delegation from your wallet with ZKPEnforcer caveat");
        console2.log("4. Create puzzles via bearTrap.createPuzzle()");
    }
}
