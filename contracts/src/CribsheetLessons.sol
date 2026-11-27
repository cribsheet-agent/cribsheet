// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

/// @notice The parts of $CRIBSHEET this contract uses.
interface ICribsheetToken {
    function balanceOf(address account) external view returns (uint256);
    function transfer(address to, uint256 amount) external returns (bool);
    function transferFrom(address from, address to, uint256 amount) external returns (bool);
    function burn(uint256 amount) external;
}

/// @title CribsheetLessons
/// @notice Holders stake $CRIBSHEET with one lesson for the Crowd arm. A copy of Crowd reads the
///         lesson for three exam hours; the judge then settles it. Kept: the stake comes back plus
///         a reward from the pool. Not kept: the stake is burned. A kept lesson can later be
///         retired without penalty.
/// @dev The stake, the reward rate and the judge are fixed at deployment. There is no owner and no
///      upgrade path. Tokens sent to this contract beyond what it owes are the reward pool; they
///      can leave only as rewards. Each submission reserves its reward up front, so a lesson that
///      is kept is always paid in full. If the judge never settles a lesson, its author takes the
///      stake back after `SETTLE_WINDOW`. The judge settles from the public test record at
///      https://cribsheet.pro/data/lessons/<id>/verdict.json; `evidence` is the SHA-256 of that file.
contract CribsheetLessons {
    enum Status {
        None,
        Testing,
        Kept,
        Burned,
        Retired,
        Reclaimed
    }

    struct Lesson {
        address author;
        uint8 kind;
        Status status;
        uint64 submittedAt;
        uint64 settledAt;
        bytes32 evidence;
        string text;
    }

    /// @notice Longest lesson, in bytes.
    uint256 public constant MAX_BYTES = 280;
    /// @notice Lessons that are testing or kept at the same time.
    uint256 public constant MAX_ACTIVE = 12;
    /// @notice Question kinds, in this order: curve, creator, launch_block, creator_tax,
    ///         graduated, hour_launch_count, creator_24h, creator_7d.
    uint8 public constant KINDS = 8;
    /// @notice Earliest settlement after submission: three exam hours.
    uint256 public constant MIN_TEST = 3 hours;
    /// @notice After this, only the author can close a lesson that is still testing, and gets the stake back.
    uint256 public constant SETTLE_WINDOW = 7 days;

    ICribsheetToken public immutable token;
    /// @notice The only address that may settle or retire lessons.
    address public immutable judge;
    /// @notice Tokens staked with every lesson (18 decimals).
    uint256 public immutable stake;
    /// @notice Reward for a kept lesson, in basis points of the stake.
    uint256 public immutable rewardBps;
    /// @notice Reward for a kept lesson, in tokens.
    uint256 public immutable reward;

    /// @notice Stakes plus rewards reserved for lessons that are testing.
    uint256 public reserved;
    /// @notice Lessons that are testing or kept.
    uint256 public active;

    Lesson[] private lessons;

    event Submitted(uint256 indexed id, address indexed author, uint8 kind, string text);
    event Kept(uint256 indexed id, bytes32 evidence, uint256 paid);
    event Burned(uint256 indexed id, bytes32 evidence, uint256 burned);
    event Retired(uint256 indexed id, bytes32 evidence);
    event Reclaimed(uint256 indexed id, uint256 returned);

    error NotJudge();
    error NotAuthor();
    error BadText();
    error BadKind();
    error Full();
    error PoolTooSmall(uint256 free, uint256 needed);
    error Underfunded(uint256 balance, uint256 owed);
    error WrongStatus(uint256 id, Status status);
    error TooEarly(uint256 at);
    error TooLate(uint256 deadline);
    error EmptyEvidence();
    error TransferFailed();
    error BadConfig();

    constructor(ICribsheetToken token_, address judge_, uint256 stake_, uint256 rewardBps_) {
        if (address(token_) == address(0) || judge_ == address(0) || stake_ == 0 || rewardBps_ > 10_000) revert BadConfig();
        token = token_;
        judge = judge_;
        stake = stake_;
        rewardBps = rewardBps_;
        reward = stake_ * rewardBps_ / 10_000;
    }

    // ---------------------------------------------------------------- views

    function count() external view returns (uint256) {
        return lessons.length;
    }

    function lessonOf(uint256 id) external view returns (Lesson memory) {
        return lessons[id];
    }

    /// @notice Tokens free to back new rewards.
    function pool() public view returns (uint256) {
        uint256 bal = token.balanceOf(address(this));
        return bal > reserved ? bal - reserved : 0;
    }

    // ---------------------------------------------------------------- holders

    /// @notice Stakes `stake` tokens (approve first) with a lesson of at most 280 bytes of plain
    ///         text, aimed at question kind `kind`.
    function submit(string calldata text, uint8 kind) external returns (uint256 id) {
        bytes calldata b = bytes(text);
        if (b.length == 0 || b.length > MAX_BYTES) revert BadText();
        for (uint256 i = 0; i < b.length; ++i) {
            uint8 c = uint8(b[i]);
            // no control characters except a line break; UTF-8 bytes (>= 0x80) are allowed
            if ((c < 0x20 && c != 0x0a) || c == 0x7f) revert BadText();
        }
        if (kind >= KINDS) revert BadKind();
        if (active >= MAX_ACTIVE) revert Full();
        uint256 free = pool();
        if (free < reward) revert PoolTooSmall(free, reward);

        id = lessons.length;
        lessons.push(Lesson({
            author: msg.sender,
            kind: kind,
            status: Status.Testing,
            submittedAt: uint64(block.timestamp),
            settledAt: 0,
            evidence: bytes32(0),
            text: text
        }));
        ++active;
        reserved += stake + reward;
        emit Submitted(id, msg.sender, kind, text);

        if (!token.transferFrom(msg.sender, address(this), stake)) revert TransferFailed();
        // after the transfer the contract must hold everything it owes; a token that takes a cut
        // on transfer could otherwise leave reserved stakes unbacked
        uint256 bal = token.balanceOf(address(this));
        if (bal < reserved) revert Underfunded(bal, reserved);
    }

    /// @notice The author closes a lesson the judge did not settle in time and takes the stake back.
    function reclaim(uint256 id) external {
        Lesson storage l = lessons[id];
        if (msg.sender != l.author) revert NotAuthor();
        if (l.status != Status.Testing) revert WrongStatus(id, l.status);
        uint256 deadline = uint256(l.submittedAt) + SETTLE_WINDOW;
        if (block.timestamp <= deadline) revert TooEarly(deadline);
        l.status = Status.Reclaimed;
        l.settledAt = uint64(block.timestamp);
        --active;
        reserved -= stake + reward;
        emit Reclaimed(id, stake);
        if (!token.transfer(l.author, stake)) revert TransferFailed();
    }

    /// @notice The author takes a kept lesson out of Crowd. Nothing is owed either way.
    function withdraw(uint256 id) external {
        Lesson storage l = lessons[id];
        if (msg.sender != l.author) revert NotAuthor();
        _retire(id, l, bytes32(0));
    }

    // ---------------------------------------------------------------- judge

    /// @notice Settles a lesson after its test. `evidence` is the SHA-256 of its public verdict file.
    function settle(uint256 id, bool kept, bytes32 evidence) external {
        if (msg.sender != judge) revert NotJudge();
        if (evidence == bytes32(0)) revert EmptyEvidence();
        Lesson storage l = lessons[id];
        if (l.status != Status.Testing) revert WrongStatus(id, l.status);
        uint256 earliest = uint256(l.submittedAt) + MIN_TEST;
        if (block.timestamp < earliest) revert TooEarly(earliest);
        uint256 deadline = uint256(l.submittedAt) + SETTLE_WINDOW;
        if (block.timestamp > deadline) revert TooLate(deadline);

        l.settledAt = uint64(block.timestamp);
        l.evidence = evidence;
        reserved -= stake + reward;
        if (kept) {
            l.status = Status.Kept;
            emit Kept(id, evidence, stake + reward);
            if (!token.transfer(l.author, stake + reward)) revert TransferFailed();
        } else {
            l.status = Status.Burned;
            --active;
            emit Burned(id, evidence, stake);
            token.burn(stake);
        }
    }

    /// @notice Retires a kept lesson that no longer helps on its re-test. No penalty.
    function retire(uint256 id, bytes32 evidence) external {
        if (msg.sender != judge) revert NotJudge();
        if (evidence == bytes32(0)) revert EmptyEvidence();
        _retire(id, lessons[id], evidence);
    }

    function _retire(uint256 id, Lesson storage l, bytes32 evidence) private {
        if (l.status != Status.Kept) revert WrongStatus(id, l.status);
        // `evidence` and `settledAt` keep the keep verdict; the re-test's evidence is in the event
        l.status = Status.Retired;
        --active;
        emit Retired(id, evidence);
    }
}
