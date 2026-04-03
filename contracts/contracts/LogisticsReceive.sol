// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

interface IPrescription {
    function isValid(uint256 id) external view returns (bool);
}

interface IDeliveryAccept {
    function isAccepted(uint256 id) external view returns (bool);
}

contract LogisticsReceive {
    IPrescription public prescription;
    IDeliveryAccept public deliveryAccept;
    address public admin;

    struct ReceiveRecord {
        uint256 prescriptionId;
        address who;
        uint256 timestamp;
    }

    mapping(uint256 => ReceiveRecord) public receives;
    mapping(uint256 => bool) public isReceived;

    event PrescriptionAddressUpdated(address indexed newAddress);
    event AcceptAddressUpdated(address indexed newAddress);
    event Received(uint256 indexed prescriptionId, address indexed who, uint256 timestamp);
    event Unreceived(uint256 indexed prescriptionId, address indexed by);
    event ReceivedMany(uint256[] prescriptionIds, address indexed who, uint256 timestamp);

    modifier onlyAdmin() {
        require(msg.sender == admin, "Not admin");
        _;
    }

    constructor(address _prescriptionAddress, address _acceptAddress) {
        require(
            _prescriptionAddress != address(0) && _acceptAddress != address(0),
            "Bad address"
        );
        admin = msg.sender;
        prescription = IPrescription(_prescriptionAddress);
        deliveryAccept = IDeliveryAccept(_acceptAddress);
    }

    function setPrescriptionContract(address _newAddress) external onlyAdmin {
        require(_newAddress != address(0), "Bad address");
        prescription = IPrescription(_newAddress);
        emit PrescriptionAddressUpdated(_newAddress);
    }

    function setAcceptContract(address _newAddress) external onlyAdmin {
        require(_newAddress != address(0), "Bad address");
        deliveryAccept = IDeliveryAccept(_newAddress);
        emit AcceptAddressUpdated(_newAddress);
    }

    function receiveFromPharmacy(uint256 _prescriptionId) external {
        require(!isReceived[_prescriptionId], "Already received");
        require(prescription.isValid(_prescriptionId), "Invalid/expired");
        require(deliveryAccept.isAccepted(_prescriptionId), "Not accepted for delivery");

        receives[_prescriptionId] = ReceiveRecord({
            prescriptionId: _prescriptionId,
            who: msg.sender,
            timestamp: block.timestamp
        });

        isReceived[_prescriptionId] = true;
        emit Received(_prescriptionId, msg.sender, block.timestamp);
    }

    function receiveMultipleFromPharmacy(uint256[] calldata _prescriptionIds) external {
        require(_prescriptionIds.length > 0, "Empty list");

        uint256 ts = block.timestamp;

        for (uint256 i = 0; i < _prescriptionIds.length; i++) {
            uint256 id = _prescriptionIds[i];

            require(!isReceived[id], "Already received");
            require(prescription.isValid(id), "Invalid/expired");
            require(deliveryAccept.isAccepted(id), "Not accepted for delivery");

            receives[id] = ReceiveRecord({
                prescriptionId: id,
                who: msg.sender,
                timestamp: ts
            });

            isReceived[id] = true;
            emit Received(id, msg.sender, ts);
        }

        emit ReceivedMany(_prescriptionIds, msg.sender, ts);
    }

    function unreceiveFromPharmacy(uint256 _prescriptionId) external onlyAdmin {
        require(isReceived[_prescriptionId], "Not received");
        delete receives[_prescriptionId];
        isReceived[_prescriptionId] = false;
        emit Unreceived(_prescriptionId, msg.sender);
    }

    function getReceiveInfo(uint256 _prescriptionId)
        external
        view
        returns (ReceiveRecord memory rec, bool received)
    {
        return (receives[_prescriptionId], isReceived[_prescriptionId]);
    }
}