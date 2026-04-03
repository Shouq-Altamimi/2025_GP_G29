// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

interface IPrescription {
    function isValid(uint256 id) external view returns (bool);
}

contract DeliveryAccept {
    IPrescription public prescription;
    address public admin;

    struct AcceptRecord {
        uint256 prescriptionId;
        address courier;
        uint256 timestamp;
    }

    mapping(uint256 => AcceptRecord) public accepts;
    mapping(uint256 => bool) public isAccepted;

    event PrescriptionAddressUpdated(address indexed newAddress);
    event Accepted(uint256 indexed prescriptionId, address indexed courier, uint256 timestamp);
    event Unaccepted(uint256 indexed prescriptionId, address indexed by);
    event AcceptedMany(uint256[] prescriptionIds, address indexed courier, uint256 timestamp);

    modifier onlyAdmin() {
        require(msg.sender == admin, "Not admin");
        _;
    }

    constructor(address _prescriptionAddress) {
        require(_prescriptionAddress != address(0), "Bad address");
        admin = msg.sender;
        prescription = IPrescription(_prescriptionAddress);
    }

    function setPrescriptionContract(address _newAddress) external onlyAdmin {
        require(_newAddress != address(0), "Bad address");
        prescription = IPrescription(_newAddress);
        emit PrescriptionAddressUpdated(_newAddress);
    }

    function accept(uint256 _prescriptionId) external {
        require(!isAccepted[_prescriptionId], "Already accepted");
        require(prescription.isValid(_prescriptionId), "Invalid/expired");

        accepts[_prescriptionId] = AcceptRecord({
            prescriptionId: _prescriptionId,
            courier: msg.sender,
            timestamp: block.timestamp
        });

        isAccepted[_prescriptionId] = true;
        emit Accepted(_prescriptionId, msg.sender, block.timestamp);
    }

    function acceptMany(uint256[] calldata _prescriptionIds) external {
        _acceptBatch(_prescriptionIds);
    }

    function acceptMultiple(uint256[] calldata _prescriptionIds) external {
        _acceptBatch(_prescriptionIds);
    }

    function _acceptBatch(uint256[] calldata _prescriptionIds) internal {
        require(_prescriptionIds.length > 0, "Empty list");

        uint256 ts = block.timestamp;

        for (uint256 i = 0; i < _prescriptionIds.length; i++) {
            uint256 id = _prescriptionIds[i];

            require(!isAccepted[id], "Already accepted");
            require(prescription.isValid(id), "Invalid/expired");

            accepts[id] = AcceptRecord({
                prescriptionId: id,
                courier: msg.sender,
                timestamp: ts
            });

            isAccepted[id] = true;
            emit Accepted(id, msg.sender, ts);
        }

        emit AcceptedMany(_prescriptionIds, msg.sender, ts);
    }

    function unaccept(uint256 _prescriptionId) external onlyAdmin {
        require(isAccepted[_prescriptionId], "Not accepted");
        delete accepts[_prescriptionId];
        isAccepted[_prescriptionId] = false;
        emit Unaccepted(_prescriptionId, msg.sender);
    }

    function getAcceptInfo(uint256 _prescriptionId)
        external
        view
        returns (AcceptRecord memory rec, bool accepted)
    {
        return (accepts[_prescriptionId], isAccepted[_prescriptionId]);
    }
}