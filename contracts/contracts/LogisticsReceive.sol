// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

interface IPrescription {
    function isValid(uint256 id) external view returns (bool);
}

interface IDeliveryAccept {
    function isAccepted(uint256 id) external view returns (bool);
}

/// @title LogisticsReceive
/// @notice يؤكد أن الوصفة تم استلامها من الصيدلية (من طرف الواجهة اللوجستية / الصيدلية)
///         بدون أدوار خاصة: أي عنوان يقدر يستدعي الدالة، لكن لازم:
///         - الوصفة صالحة على عقد Prescription
///         - الوصفة مقبولة للتوصيل على عقد DeliveryAccept
///         - ما تم تأكيد استلامها قبل كذا
contract LogisticsReceive {
    IPrescription public prescription;
    IDeliveryAccept public deliveryAccept;
    address public admin;

    struct ReceiveRecord {
        uint256 prescriptionId; // رقم الوصفة على البلوك تشين
        address who;            // العنوان اللي أكد الاستلام (صيدلية / لوجستكس)
        uint256 timestamp;      // وقت الاستلام
    }

    // prescriptionId => سجل الاستلام
    mapping(uint256 => ReceiveRecord) public receives;
    // prescriptionId => هل تم استلامها؟
    mapping(uint256 => bool) public isReceived;

    event PrescriptionAddressUpdated(address indexed newAddress);
    event AcceptAddressUpdated(address indexed newAddress);
    event Received(uint256 indexed prescriptionId, address indexed who, uint256 timestamp);
    event Unreceived(uint256 indexed prescriptionId, address indexed by);

    modifier onlyAdmin() {
        require(msg.sender == admin, "Not admin");
        _;
    }

    constructor(address _prescriptionAddress, address _acceptAddress) {
        require(_prescriptionAddress != address(0) && _acceptAddress != address(0), "Bad address");
        admin = msg.sender;
        prescription = IPrescription(_prescriptionAddress);
        deliveryAccept = IDeliveryAccept(_acceptAddress);
    }

    /// @notice تحديث مرجع عقد الوصفات عند الترقية
    function setPrescriptionContract(address _newAddress) external onlyAdmin {
        require(_newAddress != address(0), "Bad address");
        prescription = IPrescription(_newAddress);
        emit PrescriptionAddressUpdated(_newAddress);
    }

    /// @notice تحديث مرجع عقد القبول عند الترقية
    function setAcceptContract(address _newAddress) external onlyAdmin {
        require(_newAddress != address(0), "Bad address");
        deliveryAccept = IDeliveryAccept(_newAddress);
        emit AcceptAddressUpdated(_newAddress);
    }

    /// @notice تأكيد استلام الوصفة من الصيدلية
    ///         أي عنوان يقدر يستدعيها، لكن مع الشروط الثلاثة تحت.
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

    /// @notice إلغاء الاستلام (فقط الأدمن) إذا تم التأكيد بالخطأ
    function unreceiveFromPharmacy(uint256 _prescriptionId) external onlyAdmin {
        require(isReceived[_prescriptionId], "Not received");
        delete receives[_prescriptionId];
        isReceived[_prescriptionId] = false;
        emit Unreceived(_prescriptionId, msg.sender);
    }

    /// @notice إرجاع سجل الاستلام وحالة الاستلام
    function getReceiveInfo(uint256 _prescriptionId)
        external
        view
        returns (ReceiveRecord memory rec, bool received)
    {
        return (receives[_prescriptionId], isReceived[_prescriptionId]);
    }
}
