// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

/// @title CribsheetSeals
/// @notice One hash per exam hour, written once and never changed.
/// @dev `root` is the SHA-256 of the hour's seal bytes (spec/seal.md), served at
///      https://cribsheet.pro/data/seal/<hour>. Anyone can recompute it and compare.
///      The sealer is fixed at deployment. If its key is ever lost or leaked, a new
///      contract is deployed and announced; this one is never upgraded.
contract CribsheetSeals {
    /// @notice The only address that can seal.
    address public immutable sealer;

    /// @notice Root of each sealed hour; zero means not sealed.
    mapping(uint256 hour => bytes32 root) public rootOf;

    /// @notice Block timestamp at which each hour was sealed.
    mapping(uint256 hour => uint256 timestamp) public sealedAt;

    event Sealed(uint256 indexed hour, bytes32 root);

    error NotSealer();
    error AlreadySealed(uint256 hour);
    error EmptyRoot();

    constructor(address sealer_) {
        sealer = sealer_;
    }

    /// @notice Writes the root of `hour`. Can be called once per hour.
    function seal(uint256 hour, bytes32 root) external {
        if (msg.sender != sealer) revert NotSealer();
        if (root == bytes32(0)) revert EmptyRoot();
        if (rootOf[hour] != bytes32(0)) revert AlreadySealed(hour);
        rootOf[hour] = root;
        sealedAt[hour] = block.timestamp;
        emit Sealed(hour, root);
    }
}
