// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

/// @title TrustDose Doctor Registry (Upsert)
//  - addDoctor(): يسمح بالإضافة أو التحديث لنفس عنوان المحفظة (upsert)
//  - يمنع تكرار الـ Access ID عبر كل الدكاترة
//  - خيار إداري releaseAccessId() لتحرير ID قديم إذا احتجتِ إعادة استخدامه
contract DoctorRegistry {
    struct Doctor {
        string  accessId;       // e.g. "Dr-001"
        bytes32 tempPassHash;   // keccak256(tempPassword)
        bool    active;         // enable/disable
    }

    address public owner;

    // doctorAddress => Doctor
    mapping(address => Doctor) public doctors;

    // لمنع تكرار الـ Access ID عبر الجميع
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

    /// @notice إضافة أو تحديث دكتور (upsert) — owner فقط
    /// @dev يمنع تكرار الـ Access ID. لو كان الدكتور موجودًا سيتم استبدال
    ///      accessId/tempPassHash وتفعيله.
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

        // ملاحظة: لا نحرر الـ accessId القديم تلقائيًا للحفاظ على عدم تكراره تاريخيًا.
        // إن أردتِ تحريره يدويًا، استخدمي releaseAccessId(accessIdOld).
        d.accessId     = _accessId;
        d.tempPassHash = _tempPassHash;
        d.active       = true;

        usedAccessIds[newIdHash] = true;

        emit DoctorUpserted(_doctor, _accessId, _tempPassHash);
    }

    /// @notice تعطيل/تفعيل دكتور — owner فقط
    function setDoctorActive(address _doctor, bool _active) external onlyOwner {
        require(_doctor != address(0), "Zero address");
        require(bytes(doctors[_doctor].accessId).length != 0, "No such doctor");
        doctors[_doctor].active = _active;
        emit DoctorActiveSet(_doctor, _active);
    }

    /// @notice فحص سريع: هل الـ Access ID مستخدم؟
    function isAccessIdUsed(string calldata _accessId) external view returns (bool) {
        return usedAccessIds[keccak256(bytes(_accessId))];
    }

    /// @notice قراءة بيانات الدكتور
    function getDoctor(address _doctor)
        external
        view
        returns (string memory accessId, bytes32 tempPassHash, bool active)
    {
        Doctor memory d = doctors[_doctor];
        return (d.accessId, d.tempPassHash, d.active);
    }

    /// ====================== (اختياري) إدارة الـ Access ID ======================
    /// @notice تحرير Access ID قديم لإعادة استخدامه لاحقًا — owner فقط
    /// @dev استخدميها فقط إذا كنتِ متأكدة أنه لن يسبب تضاربًا في السجلات خارج السلسلة.
    function releaseAccessId(string calldata _accessId) external onlyOwner {
        bytes32 idHash = keccak256(bytes(_accessId));
        require(usedAccessIds[idHash], "ID not used");
        usedAccessIds[idHash] = false;
        emit AccessIdReleased(idHash, _accessId);
    }
}