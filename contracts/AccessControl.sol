// SPDX-License-Identifier: MIT
pragma solidity >=0.8.0 <0.8.20;

contract AccessControl {
    enum Role { None, Admin, Doctor, Pharmacy, Logistics, Patient }

    struct User {
        Role role;
        string accessId;
        bytes32 tempPassHash;
    }

    // ✅ هنا التصحيح: بدون '>' وبدون 'Users'
    mapping(address => User) public users;

    address public owner;

    event UserAdded(address indexed user, Role role, string accessId, bytes32 tempPassHash);

    constructor() {
        owner = msg.sender;
        users[msg.sender] = User({ 
            role: Role.Admin, 
            accessId: "ADMIN-001", 
            tempPassHash: bytes32(0) 
        });
    }

    modifier onlyAdmin() {
        require(users[msg.sender].role == Role.Admin, "Not admin");
        _;
    }

    function addUser(
        address _user,
        Role _role,
        string memory _accessId,
        string memory _tempPassword
    ) external onlyAdmin {
        bytes32 hashed = keccak256(abi.encodePacked(_tempPassword));
        users[_user] = User(_role, _accessId, hashed);
        emit UserAdded(_user, _role, _accessId, hashed);
    }

    function getUser(address _user) external view returns (Role, string memory, bytes32) {
        User memory u = users[_user];
        return (u.role, u.accessId, u.tempPassHash);
    }
}
