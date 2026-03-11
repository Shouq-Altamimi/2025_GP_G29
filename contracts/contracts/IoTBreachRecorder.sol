// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

contract IoTBreachRecorder {
    struct BreachRecord {
        uint256 prescriptionOnchainId;
        string breachType;
        int256 measuredValue;
        int256 minAllowed;
        int256 maxAllowed;
        uint256 breachTime;
        address recordedBy;
    }

    mapping(uint256 => bool) public breachRecorded;
    mapping(uint256 => BreachRecord) public breachByPrescription;

    event BreachRecorded(
        uint256 indexed prescriptionOnchainId,
        string breachType,
        int256 measuredValue,
        int256 minAllowed,
        int256 maxAllowed,
        uint256 breachTime,
        address recordedBy
    );

    function recordBreach(
        uint256 prescriptionOnchainId,
        string memory breachType,
        int256 measuredValue,
        int256 minAllowed,
        int256 maxAllowed,
        uint256 breachTime
    ) external {
        require(prescriptionOnchainId > 0, "Invalid prescription ID");
        require(!breachRecorded[prescriptionOnchainId], "Breach already recorded");

        breachRecorded[prescriptionOnchainId] = true;

        breachByPrescription[prescriptionOnchainId] = BreachRecord({
            prescriptionOnchainId: prescriptionOnchainId,
            breachType: breachType,
            measuredValue: measuredValue,
            minAllowed: minAllowed,
            maxAllowed: maxAllowed,
            breachTime: breachTime,
            recordedBy: msg.sender
        });

        emit BreachRecorded(
            prescriptionOnchainId,
            breachType,
            measuredValue,
            minAllowed,
            maxAllowed,
            breachTime,
            msg.sender
        );
    }

    function getBreach(uint256 prescriptionOnchainId)
        external
        view
        returns (BreachRecord memory)
    {
        require(breachRecorded[prescriptionOnchainId], "No breach recorded");
        return breachByPrescription[prescriptionOnchainId];
    }
}