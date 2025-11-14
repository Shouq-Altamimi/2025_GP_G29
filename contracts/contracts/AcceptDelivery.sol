// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

interface IPrescription {
    function isValid(uint256 id) external view returns (bool);
}

/// @title DeliveryAccept
/// @notice يسمح لأي عنوان بقبول مهمة توصيل لوصفة صالحة مرة واحدة فقط.
///         لا توجد صلاحيات "صيدلي" — القبول مفتوح للجميع.
///         الأدمن موجود فقط لإدارة الإعدادات أو إلغاء قبول بالخطأ.
contract DeliveryAccept {
    IPrescription public prescription;
    address public admin;

    struct AcceptRecord {
        uint256 prescriptionId;
        address courier;       // العنوان الذي قبل التوصيل (قد يكون أي شخص)
        uint256 timestamp;     // وقت القبول
    }

    // prescriptionId => سجل القبول
    mapping(uint256 => AcceptRecord) public accepts;
    // prescriptionId => هل تم قبولها؟
    mapping(uint256 => bool) public isAccepted;

    event PrescriptionAddressUpdated(address indexed newAddress);
    event Accepted(uint256 indexed prescriptionId, address indexed courier, uint256 timestamp);
    event Unaccepted(uint256 indexed prescriptionId, address indexed by);

    modifier onlyAdmin() {
        require(msg.sender == admin, "Not admin");
        _;
    }

    constructor(address _prescriptionAddress) {
        require(_prescriptionAddress != address(0), "Bad address");
        admin = msg.sender;
        prescription = IPrescription(_prescriptionAddress);
    }

    /// @notice تحديث مرجع عقد الوصفات عند الترقية
    function setPrescriptionContract(address _newAddress) external onlyAdmin {
        require(_newAddress != address(0), "Bad address");
        prescription = IPrescription(_newAddress);
        emit PrescriptionAddressUpdated(_newAddress);
    }

    /// @notice قبول توصيل وصفة (مفتوح لأي عنوان)
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

    /// @notice إلغاء القبول (فقط الأدمن) في حال حصل قبول بالخطأ
    function unaccept(uint256 _prescriptionId) external onlyAdmin {
        require(isAccepted[_prescriptionId], "Not accepted");
        delete accepts[_prescriptionId];
        isAccepted[_prescriptionId] = false;
        emit Unaccepted(_prescriptionId, msg.sender);
    }

    /// @notice إرجاع السجل وحالة القبول
    function getAcceptInfo(uint256 _prescriptionId)
        external
        view
        returns (AcceptRecord memory rec, bool accepted)
    {
        return (accepts[_prescriptionId], isAccepted[_prescriptionId]);
    }
}
