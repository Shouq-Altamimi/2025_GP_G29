// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

/// @title TrustDose - Simple Prescription (Doctor only)
/// @notice 
contract Prescription {
    uint256 public constant VALIDITY = 48 hours;

    //list of all doctors
    mapping(address => bool) public isDoctor;

    //counter
    uint256 private _counter;

    //table
    struct PrescriptionData {
        uint256 id;
        bytes32 patientHash;
        string  medicine;
        string  dose;
        string  frequency;
        string  durationText;
        address doctor;
        uint256 createdAt;
        uint256 expiresAt;
    }

    //mapping to store prescriptions
    mapping(uint256 => PrescriptionData) public prescriptions;

    //creat
    event PrescriptionCreated(
        uint256 indexed id,
        address indexed doctor,
        bytes32 indexed patientHash,
        string medicine,
        string dose,
        string frequency,
        string durationText,
        uint256 createdAt,
        uint256 expiresAt
    );

    //auth
    constructor(address _doctor) {
        isDoctor[_doctor] = true;
    }

    //from out
    function createPrescription(
        bytes32 patientHash,
        string memory medicine,
        string memory dose,
        string memory frequency,
        string memory durationText
    ) external returns (uint256) {

        //requirements
        require(isDoctor[msg.sender], "Only doctor");
        require(patientHash != bytes32(0), "Invalid patientHash");

        _counter++;
        uint256 created = block.timestamp;
        uint256 expires = created + VALIDITY;

        prescriptions[_counter] = PrescriptionData({
            id: _counter,
            patientHash: patientHash,
            medicine: medicine,
            dose: dose,
            frequency: frequency,
            durationText: durationText,
            doctor: msg.sender,
            createdAt: created,
            expiresAt: expires
        });

        emit PrescriptionCreated(
            _counter,
            msg.sender,
            patientHash,
            medicine,
            dose,
            frequency,
            durationText,
            created,
            expires
        );

        return _counter;
    }

    function getPrescription(uint256 id)
        external
        view
        returns (
            bytes32 patientHash,
            string memory medicine,
            string memory dose,
            string memory frequency,
            string memory durationText,
            address doctor,
            uint256 createdAt,
            uint256 expiresAt
        )
    {
        require(_exists(id), "Invalid ID");
        PrescriptionData storage p = prescriptions[id];
        return (
            p.patientHash,
            p.medicine,
            p.dose,
            p.frequency,
            p.durationText,
            p.doctor,
            p.createdAt,
            p.expiresAt
        );
    }

    function isValid(uint256 id) public view returns (bool) {
        if (!_exists(id)) return false;
        PrescriptionData memory p = prescriptions[id];
        return block.timestamp <= p.expiresAt;
    }

    function _exists(uint256 id) internal view returns (bool) {
        return id > 0 && id <= _counter;
    }
}
