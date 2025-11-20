// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

/**
 * LogisticsAccept
 * - يأخذ قائمة شركات اللوجستيك من Ganache وقت النشر
 * - كل لوجستيك يقدر يقبل توصيل وصفة معينة (prescriptionId / onchainId)
 */
contract LogisticsAccept {

    struct Delivery {
        bool accepted;          // هل تم قبول التوصيل؟
        address logistics;      // شركة اللوجستيك اللي قبلت
        uint256 acceptedAt;     // وقت القبول
    }

    // قائمة اللوجستيك المسموح لهم
    mapping(address => bool) public isLogistics;

    // حالة قبول كل وصفة
    mapping(uint256 => Delivery) public deliveries;

    // يتم إطلاقه عند قبول الوصفة
    event DeliveryAccepted(uint256 indexed prescriptionId, address indexed logistics);

    constructor(address[] memory logisticsList) {
        // تفعيل كل شركات اللوجستيك الممرّرة من Ganache
        for (uint256 i = 0; i < logisticsList.length; i++) {
            isLogistics[logisticsList[i]] = true;
        }
    }

    /// قبول توصيل وصفة معيّنة
    function acceptDelivery(uint256 prescriptionId) external {
        require(isLogistics[msg.sender], "Not logistics"); // فقط اللوجستيك

        Delivery storage d = deliveries[prescriptionId];
        require(!d.accepted, "Already accepted");          // لمنع التكرار

        d.accepted = true;
        d.logistics = msg.sender;
        d.acceptedAt = block.timestamp;

        emit DeliveryAccepted(prescriptionId, msg.sender);
    }
}
