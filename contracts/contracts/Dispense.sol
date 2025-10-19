// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

/* واجهة مبسطة من عقد الوصفة: نحتاج فقط isValid(id) */
interface IPrescription {
    function isValid(uint256 id) external view returns (bool);
}

contract Dispense {
    IPrescription public prescription;
    address public admin;

    // إدارة صيدليين بسيط داخل عقد الصرف (ممكن تربطيه لاحقًا بعقد الوصفة لو تحبين)
    mapping(address => bool) public isPharmacist;

    struct DispenseRecord {
        uint256 prescriptionId;
        address pharmacist;
        uint256 timestamp;
    }

    // سجلات الصرف وحالة الصرف
    mapping(uint256 => DispenseRecord) public dispenses;
    mapping(uint256 => bool) public isDispensed;

    event PharmacistUpdated(address indexed account, bool enabled);
    event PrescriptionAddressUpdated(address indexed newAddress);
    event Dispensed(uint256 indexed prescriptionId, address indexed pharmacist, uint256 timestamp);

    modifier onlyAdmin() {
        require(msg.sender == admin, "Not admin");
        _;
    }

    modifier onlyPharmacist() {
        require(isPharmacist[msg.sender], "Not pharmacist");
        _;
    }

    constructor(address _prescriptionAddress) {
        require(_prescriptionAddress != address(0), "Bad address");
        admin = msg.sender;
        prescription = IPrescription(_prescriptionAddress);
    }

    // تحديث عنوان عقد الوصفة
    function setPrescriptionContract(address _newAddress) external onlyAdmin {
        require(_newAddress != address(0), "Bad address");
        prescription = IPrescription(_newAddress);
        emit PrescriptionAddressUpdated(_newAddress);
    }

    // إضافة/إزالة صيدلي
    function setPharmacist(address account, bool enabled) external onlyAdmin {
        require(account != address(0), "Bad pharmacist");
        isPharmacist[account] = enabled;
        emit PharmacistUpdated(account, enabled);
    }

    // صرف وصفة
    function dispense(uint256 _prescriptionId) external onlyPharmacist {
        require(!isDispensed[_prescriptionId], "Already dispensed");
        require(prescription.isValid(_prescriptionId), "Invalid/expired");

        dispenses[_prescriptionId] = DispenseRecord({
            prescriptionId: _prescriptionId,
            pharmacist: msg.sender,
            timestamp: block.timestamp
        });

        isDispensed[_prescriptionId] = true;
        emit Dispensed(_prescriptionId, msg.sender, block.timestamp);
    }

    // قراءة سجل الصرف + حالة الصرف
    function getDispenseInfo(uint256 _prescriptionId)
        external
        view
        returns (DispenseRecord memory rec, bool dispensed)
    {
        return (dispenses[_prescriptionId], isDispensed[_prescriptionId]);
    }
}
