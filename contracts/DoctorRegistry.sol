// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;
contract DoctorRegistry {
    struct Doctor {
        string  accessId;       //  "Dr-001"
        bytes32 tempPassHash;   // (tempPassword)
        bool    active;         // enable/disable
    }

    address public owner;

    // doctorAddress => Doctor
    mapping(address => Doctor) public doctors;

    // منع تكرار الاكسس اي دي
    mapping(bytes32 => bool) private usedAccessIds;

    event DoctorUpserted(address indexed doctor, string accessId, bytes32 tempPassHash);
    event DoctorActiveSet(address indexed doctor, bool active);
    event AccessIdReleased(bytes32 indexed idHash, string accessId);

    modifier onlyOwner() {
        require(msg.sender == owner, "Not admin");
        _;
    }

    constructor() {
        owner = msg.sender;
    }

    function addDoctor(
        address _doctor,
        string calldata _accessId,
        bytes32 _tempPassHash
    ) external onlyOwner {
        require(_doctor != address(0), "Zero address");
        require(bytes(_accessId).length > 0, "Empty accessId");

        bytes32 newIdHash = keccak256(bytes(_accessId));
        require(!usedAccessIds[newIdHash], "ACCESS_ID_TAKEN");

        Doctor storage d = doctors[_doctor];
        d.accessId     = _accessId;
        d.tempPassHash = _tempPassHash;
        d.active       = true;

        usedAccessIds[newIdHash] = true;

        emit DoctorUpserted(_doctor, _accessId, _tempPassHash);
    }


    function setDoctorActive(address _doctor, bool _active) external onlyOwner {
        require(_doctor != address(0), "Zero address");
        require(bytes(doctors[_doctor].accessId).length != 0, "No such doctor");
        doctors[_doctor].active = _active;
        emit DoctorActiveSet(_doctor, _active);
    }

    function isAccessIdUsed(string calldata _accessId) external view returns (bool) {
        return usedAccessIds[keccak256(bytes(_accessId))];
    }

    function getDoctor(address _doctor)
        external
        view
        returns (string memory accessId, bytes32 tempPassHash, bool active)
    {
        Doctor memory d = doctors[_doctor];
        return (d.accessId, d.tempPassHash, d.active);
    }

    function releaseAccessId(string calldata _accessId) external onlyOwner {
        bytes32 idHash = keccak256(bytes(_accessId));
        require(usedAccessIds[idHash], "ID not used");
        usedAccessIds[idHash] = false;
        emit AccessIdReleased(idHash, _accessId);
    }
}