// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

contract AccessControl {
    enum Role { None, Admin, Doctor, Pharmacy, Logistics, Patient }

    struct User {
        Role role;
        string accessId;
    }

    mapping(address => User) public users;
    address public owner;

    event UserAdded(address indexed user, Role role, string accessId);


    constructor() {
    owner = msg.sender;
    users[msg.sender] = User({ role: Role.Admin, accessId: "ADMIN-001" });
    }



    modifier onlyAdmin() {
        require(users[msg.sender].role == Role.Admin, "Not admin");
        _;
    }

    function addUser(address _user, Role _role, string memory _accessId) external onlyAdmin {
        users[_user] = User(_role, _accessId);
        emit UserAdded(_user, _role, _accessId);
    }

    function getUser(address _user) external view returns (Role, string memory) {
        User memory u = users[_user];
        return (u.role, u.accessId);
    }
}
