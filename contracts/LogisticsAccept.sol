// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

interface IPrescription {
    function isValid(uint256 id) external view returns (bool);
}

contract LogisticsAccept {

    struct Delivery {
        bool accepted;
        address logistics;
        uint256 acceptedAt;
    }

    IPrescription public prescription;

    mapping(address => bool) public isLogistics;
    mapping(uint256 => Delivery) public deliveries;

    event DeliveryAccepted(uint256 indexed prescriptionId, address indexed logistics);

    constructor(address _prescriptionAddress, address[] memory logisticsList) {
        require(_prescriptionAddress != address(0), "Bad prescription");
        prescription = IPrescription(_prescriptionAddress);

        for (uint256 i = 0; i < logisticsList.length; i++) {
            isLogistics[logisticsList[i]] = true;
        }
    }

    function acceptDelivery(uint256 prescriptionId) external {
        require(isLogistics[msg.sender], "Not logistics");
        require(prescription.isValid(prescriptionId), "Invalid/expired");

        Delivery storage d = deliveries[prescriptionId];
        require(!d.accepted, "Already accepted");

        d.accepted = true;
        d.logistics = msg.sender;
        d.acceptedAt = block.timestamp;

        emit DeliveryAccepted(prescriptionId, msg.sender);
    }
}
