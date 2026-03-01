// SPDX-License-Identifier: MIT
pragma solidity 0.8.23;

import {Script, console2} from "forge-std/Script.sol";
import {BearTrap, IERC20} from "../src/BearTrap.sol";
import {ZKPEnforcer} from "../src/ZKPEnforcer.sol";
import {IRiscZeroVerifier} from "risc0/IRiscZeroVerifier.sol";

/// @title Deploy — Deploy Bear Trap contracts
/// @dev Run with:
///   source .env
///   forge script contracts/scripts/Deploy.s.sol --rpc-url ${RPC_URL} --broadcast -vv
contract Deploy is Script {
    function run() external {
        // Read environment variables
        address verifierAddress = vm.envAddress("VERIFIER_ADDRESS");
        address osoTokenAddress = vm.envAddress("OSO_TOKEN");
        uint256 ticketPrice = vm.envUint("TICKET_PRICE");
        address ownerAddress = vm.envAddress("OWNER_ADDRESS");

        console2.log("Deploying Bear Trap contracts...");
        console2.log("Verifier:", verifierAddress);
        console2.log("OSO Token:", osoTokenAddress);
        console2.log("Ticket Price:", ticketPrice);
        console2.log("Owner:", ownerAddress);

        vm.startBroadcast();

        // Deploy ZKPEnforcer
        ZKPEnforcer zkpEnforcer = new ZKPEnforcer(
            IRiscZeroVerifier(verifierAddress)
        );
        console2.log("ZKPEnforcer deployed at:", address(zkpEnforcer));

        // Deploy BearTrap with owner (who is also the operator)
        BearTrap bearTrap = new BearTrap(
            IERC20(osoTokenAddress),
            ticketPrice,
            ownerAddress
        );
        console2.log("BearTrap deployed at:", address(bearTrap));

        vm.stopBroadcast();

        console2.log("");
        console2.log("=== Deployment Complete ===");
        console2.log("ZKPEnforcer:", address(zkpEnforcer));
        console2.log("BearTrap:", address(bearTrap));
        console2.log("");
        console2.log("Next steps:");
        console2.log("1. Set BEAR_TRAP_ADDRESS in .env");
        console2.log("2. Create a delegation from Treasury Safe with ZKPEnforcer caveat");
        console2.log("3. Create puzzles via bearTrap.createPuzzle()");
    }
}
