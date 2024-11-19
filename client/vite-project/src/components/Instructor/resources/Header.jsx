import React, { useState, useEffect } from 'react';
import casLogo from '../../../assets/cas-logo.jpg';
import 'bootstrap/dist/css/bootstrap.min.css';
import '../../css/Dashboard.css';
import '../../css/Dashboard2.css';

const Header = ({ userName }) => {
    const [profilePic, setProfilePic] = useState(null);

    useEffect(() => {
        const photoURL = localStorage.getItem('userPhoto');
        if (photoURL) {
            setProfilePic(photoURL);
        }
    }, []);

    return (
        <div className="top-row d-flex align-items-center">
            <header className="col-8 d-flex justify-content-center align-items-center">
                <img src={casLogo} alt="CAS Logo" className="cas-logo" />
            </header>
            <div className="col-2 user-info ms-auto d-flex align-items-center">
                {profilePic ? (
                    <img 
                        src={profilePic} 
                        alt="Profile" 
                        className="img-fluid rounded-circle"
                        style={{ width: '50px', height: '50px' }}
                    />
                ) : (
                    <i className="fas fa-user-circle fa-2x me-2"></i>
                )}
                <div className="user-details">
                    <p className="user-name">{userName}</p>
                    <p className="user-role">Instructor</p>
                </div>
            </div>
        </div>
    );
};

export default Header;
