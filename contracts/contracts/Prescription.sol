// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

/// @title TrustDose Prescription Registry
/// @notice يسجّل الوصفات على السلسلة.
contract Prescription {
    // ======= إعدادات عامة =======
    uint256 public constant DEFAULT_VALIDITY = 48 hours;   // الصلاحية الافتراضية
    uint256 public constant MAX_EXTENSION    = 30 days;    // حد أقصى للتمديد في الطلب الواحد

    // ======= صلاحيات بسيطة بدون مكتبات خارجية =======
    address public admin;
    mapping(address => bool) public isDoctor;
    mapping(address => bool) public isPharmacist;

    modifier onlyAdmin()      { require(msg.sender == admin, "Not admin"); _; }
    modifier onlyDoctor()     { require(isDoctor[msg.sender] || msg.sender == admin, "Not doctor"); _; }
    modifier onlyPharmacist() { require(isPharmacist[msg.sender] || msg.sender == admin, "Not pharmacist"); _; }

    event RoleUpdated(string role, address account, bool enabled);

    function setDoctor(address account, bool enabled) external onlyAdmin {
        isDoctor[account] = enabled;
        emit RoleUpdated("DOCTOR", account, enabled);
    }
    function setPharmacist(address account, bool enabled) external onlyAdmin {
        isPharmacist[account] = enabled;
        emit RoleUpdated("PHARMACIST", account, enabled);
    }

    // ======= نموذج الوصفة و التخزين =======
    struct PrescriptionData {
        uint256 id;
        bytes32 patientHash;     // SHA-256 للهوية بصيغة bytes32
        string  medicine;
        string  dose;
        string  frequency;
        string  durationText;    // "10 days" مثلًا
        address doctor;          // من أنشأ الوصفة
        uint256 createdAt;
        uint256 expiresAt;       // وقت انتهاء الصلاحية
        bool    isActive;        // يمكن تعطيلها
    }

    // طلب تمديد من صيدلي (معلّق حتى موافقة طبيب)
    struct ExtensionRequest {
        uint256 extraSeconds;
        address pharmacist;
        bool    exists;
    }

    uint256 private _counter;
    mapping(uint256 => PrescriptionData) public prescriptions;
    mapping(uint256 => ExtensionRequest) public extensionRequests;

    // ======= أحداث =======
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
    event PrescriptionDeactivated(uint256 indexed id, address indexed by);
    event ExtensionRequested(uint256 indexed id, address indexed pharmacist, uint256 extraSeconds);
    event ExtensionApproved(uint256 indexed id, address indexed doctor, uint256 newExpiresAt);
    event ExtensionRejected(uint256 indexed id, address indexed by);

    // ======= مُنشئ =======
    constructor() {
        admin = msg.sender;              // أو عيّنيها بترحيل Truffle إن رغبتِ
        isDoctor[msg.sender] = true;     // مبدئيًا الأدمن طبيب أيضًا
    }

    // ======= إنشاء وصفة (الطبيب فقط) =======
    function createPrescription(
        bytes32 patientHash,
        string memory medicine,
        string memory dose,
        string memory frequency,
        string memory durationText
    ) external onlyDoctor returns (uint256) {
        require(patientHash != bytes32(0), "Invalid patientHash");

        _counter += 1;

        uint256 created = block.timestamp;
        uint256 expires = created + DEFAULT_VALIDITY;

        prescriptions[_counter] = PrescriptionData({
            id: _counter,
            patientHash: patientHash,
            medicine: medicine,
            dose: dose,
            frequency: frequency,
            durationText: durationText,
            doctor: msg.sender,
            createdAt: created,
            expiresAt: expires,
            isActive: true
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

    // ======= طلب تمديد (الصيدلي) =======
    function requestExtension(uint256 id, uint256 extraSeconds) external onlyPharmacist {
        require(_exists(id), "No such prescription");
        require(extraSeconds > 0 && extraSeconds <= MAX_EXTENSION, "Bad extraSeconds");

        extensionRequests[id] = ExtensionRequest({
            extraSeconds: extraSeconds,
            pharmacist: msg.sender,
            exists: true
        });

        emit ExtensionRequested(id, msg.sender, extraSeconds);
    }

    // ======= موافقة التمديد (الطبيب/الأدمن) =======
    function approveExtension(uint256 id) external onlyDoctor {
        require(_exists(id), "No such prescription");
        ExtensionRequest memory req = extensionRequests[id];
        require(req.exists, "No pending request");

        PrescriptionData storage p = prescriptions[id];
        // لو منتهية أصلًا: نبدأ من الآن، وإلا من انتهاءها الحالي
        uint256 base = block.timestamp > p.expiresAt ? block.timestamp : p.expiresAt;
        p.expiresAt = base + req.extraSeconds;

        delete extensionRequests[id];
        emit ExtensionApproved(id, msg.sender, p.expiresAt);
    }

    // ======= رفض/إلغاء طلب التمديد =======
    function rejectExtension(uint256 id) external onlyDoctor {
        require(_exists(id), "No such prescription");
        require(extensionRequests[id].exists, "No pending request");
        delete extensionRequests[id];
        emit ExtensionRejected(id, msg.sender);
    }

    // ======= تعطيل الوصفة =======
    function deactivate(uint256 id) external onlyDoctor {
        require(_exists(id), "No such prescription");
        require(prescriptions[id].doctor == msg.sender || msg.sender == admin, "Not owner doctor");
        prescriptions[id].isActive = false;
        emit PrescriptionDeactivated(id, msg.sender);
    }

    // ======= أدوات استعلام =======
    function getCount() external view returns (uint256) { return _counter; }

    function isValid(uint256 id) public view returns (bool) {
        if (!_exists(id)) return false;
        PrescriptionData memory p = prescriptions[id];
        return p.isActive && block.timestamp <= p.expiresAt;
    }

    function remainingSeconds(uint256 id) external view returns (uint256) {
        if (!_exists(id)) return 0;
        PrescriptionData memory p = prescriptions[id];
        if (block.timestamp >= p.expiresAt) return 0;
        return p.expiresAt - block.timestamp;
    }

    // ======= داخلية =======
    function _exists(uint256 id) internal view returns (bool) {
        return id > 0 && id <= _counter;
    }
}
