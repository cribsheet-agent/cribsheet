// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {CribsheetSeals} from "../src/CribsheetSeals.sol";

// The few Foundry cheatcodes these tests use, declared here so the repo needs no library.
interface Vm {
    function prank(address) external;
    function warp(uint256) external;
    function expectRevert(bytes calldata) external;
    function expectEmit(bool, bool, bool, bool) external;
}

contract CribsheetSealsTest {
    Vm constant vm = Vm(address(uint160(uint256(keccak256("hevm cheat code")))));
    address constant SEALER = address(0x5EA1);
    CribsheetSeals seals;

    event Sealed(uint256 indexed hour, bytes32 root);

    function setUp() public {
        seals = new CribsheetSeals(SEALER);
    }

    function test_sealerSealsOnce() public {
        vm.warp(1_800_000_000);
        vm.expectEmit(true, false, false, true);
        emit Sealed(7, bytes32(uint256(1)));
        vm.prank(SEALER);
        seals.seal(7, bytes32(uint256(1)));
        require(seals.rootOf(7) == bytes32(uint256(1)), "root not stored");
        require(seals.sealedAt(7) == 1_800_000_000, "time not stored");
    }

    function test_secondSealOfAnHourReverts() public {
        vm.prank(SEALER);
        seals.seal(7, bytes32(uint256(1)));
        vm.expectRevert(abi.encodeWithSelector(CribsheetSeals.AlreadySealed.selector, 7));
        vm.prank(SEALER);
        seals.seal(7, bytes32(uint256(2)));
        require(seals.rootOf(7) == bytes32(uint256(1)), "root changed");
    }

    function test_onlySealer() public {
        vm.expectRevert(abi.encodeWithSelector(CribsheetSeals.NotSealer.selector));
        vm.prank(address(0xBAD));
        seals.seal(7, bytes32(uint256(1)));
    }

    function test_emptyRootReverts() public {
        vm.expectRevert(abi.encodeWithSelector(CribsheetSeals.EmptyRoot.selector));
        vm.prank(SEALER);
        seals.seal(7, bytes32(0));
    }

    function testFuzz_anyHourOnce(uint256 hour, bytes32 root) public {
        if (root == bytes32(0)) return;
        vm.prank(SEALER);
        seals.seal(hour, root);
        require(seals.rootOf(hour) == root, "root not stored");
        vm.expectRevert(abi.encodeWithSelector(CribsheetSeals.AlreadySealed.selector, hour));
        vm.prank(SEALER);
        seals.seal(hour, root);
    }
}
