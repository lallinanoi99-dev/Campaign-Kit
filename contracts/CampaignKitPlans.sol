// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/// @title Campaign Kit — campaign plans stamped on BOT Chain
/// @notice Only a fingerprint of the plan goes on-chain, plus its title, goal, launch date and milestone count.
///         Drafts never go on-chain. No tokens, no payments, no admin.
contract CampaignKitPlans {
    struct Plan {
        address owner;
        bytes32 planHash;
        string title;
        uint8 goal;        // 0 Launch · 1 Signups · 2 Sales · 3 Awareness · 4 Event attendance
        uint64 launchDate; // unix seconds (UTC midnight of the launch day)
        uint8 milestones;  // 1..30 — the launch checklist items
        uint8 done;        // milestones ticked so far
        uint64 at;         // block time of the stamp
    }

    uint8 public constant MAX_MILESTONES = 30;
    uint8 public constant GOALS = 5;
    uint256 public constant MAX_TITLE_BYTES = 48;

    Plan[] public plans; // plan id = index in this array (first plan is id 0)
    mapping(uint256 => mapping(uint8 => bool)) public milestoneDone;
    mapping(address => uint256[]) private plansOf;
    uint256 public milestonesTicked;

    event PlanStamped(uint256 indexed id, address indexed owner, uint8 goal);
    event MilestoneDone(uint256 indexed id, uint8 index, uint8 done);
    event PlanUpdated(uint256 indexed id, bytes32 planHash);

    error EmptyHash();
    error BadTitle();
    error BadGoal();
    error BadLaunchDate();
    error BadMilestones();
    error NotFound();
    error NotOwner();
    error BadIndex();
    error AlreadyDone();

    function stampPlan(bytes32 planHash, string calldata title, uint8 goal, uint64 launchDate, uint8 milestones)
        external
        returns (uint256 id)
    {
        if (planHash == bytes32(0)) revert EmptyHash();
        uint256 len = bytes(title).length;
        if (len == 0 || len > MAX_TITLE_BYTES) revert BadTitle();
        if (goal >= GOALS) revert BadGoal();
        if (launchDate == 0) revert BadLaunchDate();
        if (milestones == 0 || milestones > MAX_MILESTONES) revert BadMilestones();

        id = plans.length;
        plans.push(Plan(msg.sender, planHash, title, goal, launchDate, milestones, 0, uint64(block.timestamp)));
        plansOf[msg.sender].push(id);
        emit PlanStamped(id, msg.sender, goal);
    }

    function tick(uint256 id, uint8 index) external {
        Plan storage p = _plan(id);
        if (p.owner != msg.sender) revert NotOwner();
        if (index >= p.milestones) revert BadIndex();
        if (milestoneDone[id][index]) revert AlreadyDone();
        milestoneDone[id][index] = true;
        unchecked {
            p.done += 1;
            milestonesTicked += 1;
        }
        emit MilestoneDone(id, index, p.done);
    }

    function updateHash(uint256 id, bytes32 newHash) external {
        Plan storage p = _plan(id);
        if (p.owner != msg.sender) revert NotOwner();
        if (newHash == bytes32(0)) revert EmptyHash();
        p.planHash = newHash;
        emit PlanUpdated(id, newHash);
    }

    // ---------- views ----------

    function getPlan(uint256 id) external view returns (Plan memory) {
        return _plan(id);
    }

    function plansOfOwner(address owner) external view returns (uint256[] memory) {
        return plansOf[owner];
    }

    /// @return done milestones ticked · total milestones · mask bit i set = milestone i ticked
    function progress(uint256 id) external view returns (uint8 done, uint8 total, uint32 mask) {
        Plan storage p = _plan(id);
        for (uint8 i = 0; i < p.milestones; i++) {
            if (milestoneDone[id][i]) mask |= uint32(1) << i;
        }
        return (p.done, p.milestones, mask);
    }

    /// @return planCount plans stamped · ticked milestones ticked across all plans
    function stats() external view returns (uint256 planCount, uint256 ticked) {
        return (plans.length, milestonesTicked);
    }

    function _plan(uint256 id) private view returns (Plan storage) {
        if (id >= plans.length) revert NotFound();
        return plans[id];
    }
}
