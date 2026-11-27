// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {CribsheetLessons, ICribsheetToken} from "../src/CribsheetLessons.sol";

// The few Foundry cheatcodes these tests use, declared here so the repo needs no library.
interface Vm {
    function prank(address) external;
    function warp(uint256) external;
    function expectRevert(bytes calldata) external;
    function expectEmit(bool, bool, bool, bool) external;
}

/// @dev ERC-20 with burn, like $CRIBSHEET. `feeBps` simulates a token that takes a cut on transfer.
contract MockToken is ICribsheetToken {
    mapping(address => uint256) public balanceOf;
    mapping(address => mapping(address => uint256)) public allowance;
    uint256 public totalSupply;
    uint256 public feeBps;

    function mint(address to, uint256 amount) external {
        balanceOf[to] += amount;
        totalSupply += amount;
    }

    function setFee(uint256 bps) external {
        feeBps = bps;
    }

    function approve(address spender, uint256 amount) external returns (bool) {
        allowance[msg.sender][spender] = amount;
        return true;
    }

    function transfer(address to, uint256 amount) external returns (bool) {
        _move(msg.sender, to, amount);
        return true;
    }

    function transferFrom(address from, address to, uint256 amount) external returns (bool) {
        allowance[from][msg.sender] -= amount;
        _move(from, to, amount);
        return true;
    }

    function burn(uint256 amount) external {
        balanceOf[msg.sender] -= amount;
        totalSupply -= amount;
    }

    function _move(address from, address to, uint256 amount) private {
        uint256 fee = amount * feeBps / 10_000;
        balanceOf[from] -= amount;
        balanceOf[to] += amount - fee;
        totalSupply -= fee;
    }
}

contract CribsheetLessonsTest {
    Vm constant vm = Vm(address(uint160(uint256(keccak256("hevm cheat code")))));
    address constant JUDGE = address(0x1D6E);
    address constant ALICE = address(0xA11CE);
    address constant BOB = address(0xB0B);
    uint256 constant STAKE = 1_000e18;
    uint256 constant REWARD = 500e18;
    bytes32 constant EV = bytes32(uint256(0xE1));
    uint256 constant T0 = 1_800_000_000;

    MockToken tok;
    CribsheetLessons les;

    event Submitted(uint256 indexed id, address indexed author, uint8 kind, string text);
    event Kept(uint256 indexed id, bytes32 evidence, uint256 paid);
    event Burned(uint256 indexed id, bytes32 evidence, uint256 burned);

    function setUp() public {
        vm.warp(T0);
        tok = new MockToken();
        les = new CribsheetLessons(tok, JUDGE, STAKE, 5_000);
        tok.mint(address(les), 100 * REWARD); // the pool
        tok.mint(ALICE, 100 * STAKE);
        tok.mint(BOB, 100 * STAKE);
        vm.prank(ALICE);
        tok.approve(address(les), type(uint256).max);
        vm.prank(BOB);
        tok.approve(address(les), type(uint256).max);
    }

    function _submit(address who, uint8 kind) internal returns (uint256) {
        vm.prank(who);
        return les.submit("Count launches with topic0 filter, not by scanning all logs.", kind);
    }

    // ------------------------------------------------------------ config

    function test_numbersFixedAtDeploy() public view {
        require(les.stake() == STAKE, "stake");
        require(les.rewardBps() == 5_000, "bps");
        require(les.reward() == REWARD, "reward");
        require(les.judge() == JUDGE, "judge");
        require(address(les.token()) == address(tok), "token");
    }

    function test_badConfigReverts() public {
        vm.expectRevert(abi.encodeWithSelector(CribsheetLessons.BadConfig.selector));
        new CribsheetLessons(tok, JUDGE, 0, 5_000);
        vm.expectRevert(abi.encodeWithSelector(CribsheetLessons.BadConfig.selector));
        new CribsheetLessons(tok, JUDGE, STAKE, 10_001);
        vm.expectRevert(abi.encodeWithSelector(CribsheetLessons.BadConfig.selector));
        new CribsheetLessons(tok, address(0), STAKE, 5_000);
        vm.expectRevert(abi.encodeWithSelector(CribsheetLessons.BadConfig.selector));
        new CribsheetLessons(ICribsheetToken(address(0)), JUDGE, STAKE, 5_000);
    }

    // ------------------------------------------------------------ submit

    function test_submitTakesStakeAndReserves() public {
        uint256 poolBefore = les.pool();
        vm.expectEmit(true, true, false, true);
        emit Submitted(0, ALICE, 5, "Count launches with topic0 filter, not by scanning all logs.");
        uint256 id = _submit(ALICE, 5);
        require(id == 0 && les.count() == 1, "id");
        require(tok.balanceOf(ALICE) == 99 * STAKE, "stake not taken");
        require(les.reserved() == STAKE + REWARD, "reserved");
        require(les.active() == 1, "active");
        require(les.pool() == poolBefore - REWARD, "pool");
        CribsheetLessons.Lesson memory l = les.lessonOf(0);
        require(l.author == ALICE && l.kind == 5 && l.status == CribsheetLessons.Status.Testing, "lesson");
        require(l.submittedAt == T0, "time");
    }

    function test_textRules() public {
        vm.prank(ALICE);
        vm.expectRevert(abi.encodeWithSelector(CribsheetLessons.BadText.selector));
        les.submit("", 0);

        bytes memory long = new bytes(281);
        for (uint256 i = 0; i < long.length; ++i) long[i] = "a";
        vm.prank(ALICE);
        vm.expectRevert(abi.encodeWithSelector(CribsheetLessons.BadText.selector));
        les.submit(string(long), 0);

        vm.prank(ALICE);
        vm.expectRevert(abi.encodeWithSelector(CribsheetLessons.BadText.selector));
        les.submit("tab\there", 0);

        // exactly 280 bytes, a line break and UTF-8 are fine
        bytes memory max = new bytes(280);
        for (uint256 i = 0; i < max.length; ++i) max[i] = "b";
        vm.prank(ALICE);
        les.submit(string(max), 0);
        vm.prank(ALICE);
        les.submit(unicode"line one\nline two → ok", 0);
    }

    function test_kindRule() public {
        vm.prank(ALICE);
        vm.expectRevert(abi.encodeWithSelector(CribsheetLessons.BadKind.selector));
        les.submit("x", 8);
        vm.prank(ALICE);
        les.submit("x", 7);
    }

    function test_twelveActiveAtMost() public {
        for (uint8 i = 0; i < 12; ++i) _submit(ALICE, i % 8);
        vm.prank(BOB);
        vm.expectRevert(abi.encodeWithSelector(CribsheetLessons.Full.selector));
        les.submit("x", 0);
        // a burned lesson frees its slot
        vm.warp(T0 + 3 hours);
        vm.prank(JUDGE);
        les.settle(0, false, EV);
        _submit(BOB, 0);
    }

    function test_keptLessonsStillCountAsActive() public {
        for (uint8 i = 0; i < 12; ++i) _submit(ALICE, 0);
        vm.warp(T0 + 3 hours);
        vm.prank(JUDGE);
        les.settle(0, true, EV);
        vm.prank(BOB);
        vm.expectRevert(abi.encodeWithSelector(CribsheetLessons.Full.selector));
        les.submit("x", 0);
        // retiring frees it
        vm.prank(JUDGE);
        les.retire(0, EV);
        _submit(BOB, 0);
    }

    function test_poolMustCoverReward() public {
        CribsheetLessons empty = new CribsheetLessons(tok, JUDGE, STAKE, 5_000);
        vm.prank(ALICE);
        tok.approve(address(empty), type(uint256).max);
        vm.prank(ALICE);
        vm.expectRevert(abi.encodeWithSelector(CribsheetLessons.PoolTooSmall.selector, 0, REWARD));
        empty.submit("x", 0);
        // anyone can fund the pool with a plain transfer
        tok.mint(address(empty), REWARD);
        vm.prank(ALICE);
        empty.submit("x", 0);
        require(empty.pool() == 0, "reward reserved");
        vm.prank(BOB);
        tok.approve(address(empty), type(uint256).max);
        vm.prank(BOB);
        vm.expectRevert(abi.encodeWithSelector(CribsheetLessons.PoolTooSmall.selector, 0, REWARD));
        empty.submit("x", 0);
    }

    function test_zeroRewardNeedsNoPool() public {
        CribsheetLessons noReward = new CribsheetLessons(tok, JUDGE, STAKE, 0);
        vm.prank(ALICE);
        tok.approve(address(noReward), type(uint256).max);
        vm.prank(ALICE);
        noReward.submit("x", 0);
    }

    function test_feeOnTransferNeverLeavesStakesUnbacked() public {
        // a pool exactly the size of one reward: a 1% cut on the stake would leave it short
        CribsheetLessons tight = new CribsheetLessons(tok, JUDGE, STAKE, 5_000);
        tok.mint(address(tight), REWARD);
        vm.prank(ALICE);
        tok.approve(address(tight), type(uint256).max);
        tok.setFee(100);
        vm.prank(ALICE);
        vm.expectRevert(abi.encodeWithSelector(CribsheetLessons.Underfunded.selector, REWARD + STAKE * 99 / 100, STAKE + REWARD));
        tight.submit("x", 0);
    }

    // ------------------------------------------------------------ settle

    function test_keptPaysStakePlusReward() public {
        _submit(ALICE, 2);
        vm.warp(T0 + 3 hours);
        vm.expectEmit(true, false, false, true);
        emit Kept(0, EV, STAKE + REWARD);
        vm.prank(JUDGE);
        les.settle(0, true, EV);
        require(tok.balanceOf(ALICE) == 100 * STAKE + REWARD, "not paid");
        require(les.reserved() == 0, "reserved");
        require(les.active() == 1, "kept stays active");
        CribsheetLessons.Lesson memory l = les.lessonOf(0);
        require(l.status == CribsheetLessons.Status.Kept && l.evidence == EV && l.settledAt == T0 + 3 hours, "lesson");
    }

    function test_notKeptBurnsStake() public {
        _submit(ALICE, 2);
        uint256 supply = tok.totalSupply();
        uint256 poolBefore = les.pool();
        vm.warp(T0 + 4 hours);
        vm.expectEmit(true, false, false, true);
        emit Burned(0, EV, STAKE);
        vm.prank(JUDGE);
        les.settle(0, false, EV);
        require(tok.totalSupply() == supply - STAKE, "not burned");
        require(tok.balanceOf(ALICE) == 99 * STAKE, "author paid");
        require(les.pool() == poolBefore + REWARD, "reward not released");
        require(les.active() == 0 && les.reserved() == 0, "counters");
    }

    function test_onlyJudgeSettles() public {
        _submit(ALICE, 0);
        vm.warp(T0 + 3 hours);
        vm.prank(ALICE);
        vm.expectRevert(abi.encodeWithSelector(CribsheetLessons.NotJudge.selector));
        les.settle(0, true, EV);
        vm.prank(ALICE);
        vm.expectRevert(abi.encodeWithSelector(CribsheetLessons.NotJudge.selector));
        les.retire(0, EV);
    }

    function test_settleNotBeforeThreeHours() public {
        _submit(ALICE, 0);
        vm.warp(T0 + 3 hours - 1);
        vm.prank(JUDGE);
        vm.expectRevert(abi.encodeWithSelector(CribsheetLessons.TooEarly.selector, T0 + 3 hours));
        les.settle(0, false, EV);
    }

    function test_settleNotAfterWindow() public {
        _submit(ALICE, 0);
        vm.warp(T0 + 7 days + 1);
        vm.prank(JUDGE);
        vm.expectRevert(abi.encodeWithSelector(CribsheetLessons.TooLate.selector, T0 + 7 days));
        les.settle(0, false, EV);
    }

    function test_settleOnce() public {
        _submit(ALICE, 0);
        vm.warp(T0 + 3 hours);
        vm.prank(JUDGE);
        les.settle(0, true, EV);
        vm.prank(JUDGE);
        vm.expectRevert(abi.encodeWithSelector(CribsheetLessons.WrongStatus.selector, 0, CribsheetLessons.Status.Kept));
        les.settle(0, false, EV);
    }

    function test_settleNeedsEvidence() public {
        _submit(ALICE, 0);
        vm.warp(T0 + 3 hours);
        vm.prank(JUDGE);
        vm.expectRevert(abi.encodeWithSelector(CribsheetLessons.EmptyEvidence.selector));
        les.settle(0, true, bytes32(0));
    }

    // ------------------------------------------------------------ retire, withdraw, reclaim

    function test_retireOnlyKeptAndNoPenalty() public {
        _submit(ALICE, 0);
        vm.prank(JUDGE);
        vm.expectRevert(abi.encodeWithSelector(CribsheetLessons.WrongStatus.selector, 0, CribsheetLessons.Status.Testing));
        les.retire(0, EV);
        vm.warp(T0 + 3 hours);
        vm.prank(JUDGE);
        les.settle(0, true, EV);
        uint256 bal = tok.balanceOf(ALICE);
        vm.warp(T0 + 51 hours);
        vm.prank(JUDGE);
        les.retire(0, bytes32(uint256(0xE2)));
        require(tok.balanceOf(ALICE) == bal, "penalty");
        CribsheetLessons.Lesson memory l = les.lessonOf(0);
        require(l.status == CribsheetLessons.Status.Retired && l.evidence == EV, "keep verdict lost");
        require(les.active() == 0, "active");
    }

    function test_authorWithdrawsKept() public {
        _submit(ALICE, 0);
        vm.warp(T0 + 3 hours);
        vm.prank(JUDGE);
        les.settle(0, true, EV);
        vm.prank(BOB);
        vm.expectRevert(abi.encodeWithSelector(CribsheetLessons.NotAuthor.selector));
        les.withdraw(0);
        vm.prank(ALICE);
        les.withdraw(0);
        require(les.active() == 0, "active");
    }

    function test_reclaimAfterWindowOnly() public {
        _submit(ALICE, 0);
        vm.warp(T0 + 7 days);
        vm.prank(ALICE);
        vm.expectRevert(abi.encodeWithSelector(CribsheetLessons.TooEarly.selector, T0 + 7 days));
        les.reclaim(0);
        vm.warp(T0 + 7 days + 1);
        vm.prank(BOB);
        vm.expectRevert(abi.encodeWithSelector(CribsheetLessons.NotAuthor.selector));
        les.reclaim(0);
        uint256 poolBefore = les.pool();
        vm.prank(ALICE);
        les.reclaim(0);
        require(tok.balanceOf(ALICE) == 100 * STAKE, "stake not back");
        require(les.pool() == poolBefore + REWARD, "reward not released");
        require(les.active() == 0 && les.reserved() == 0, "counters");
        vm.prank(ALICE);
        vm.expectRevert(abi.encodeWithSelector(CribsheetLessons.WrongStatus.selector, 0, CribsheetLessons.Status.Reclaimed));
        les.reclaim(0);
    }

    // ------------------------------------------------------------ fuzz

    /// The contract always holds at least what it owes, whatever order lessons settle in.
    function testFuzz_alwaysSolvent(uint256 seed) public {
        for (uint256 i = 0; i < 12; ++i) _submit(i % 2 == 0 ? ALICE : BOB, uint8(i % 8));
        vm.warp(T0 + 3 hours);
        for (uint256 i = 0; i < 12; ++i) {
            uint256 r = uint256(keccak256(abi.encode(seed, i))) % 3;
            if (r == 0) {
                vm.prank(JUDGE);
                les.settle(i, true, EV);
            } else if (r == 1) {
                vm.prank(JUDGE);
                les.settle(i, false, EV);
            }
            require(tok.balanceOf(address(les)) >= les.reserved(), "insolvent");
        }
        vm.warp(T0 + 8 days);
        for (uint256 i = 0; i < 12; ++i) {
            if (les.lessonOf(i).status == CribsheetLessons.Status.Testing) {
                vm.prank(les.lessonOf(i).author);
                les.reclaim(i);
            }
        }
        require(les.reserved() == 0, "reserved left");
        require(tok.balanceOf(ALICE) >= 94 * STAKE && tok.balanceOf(BOB) >= 94 * STAKE, "stakes lost");
    }
}
