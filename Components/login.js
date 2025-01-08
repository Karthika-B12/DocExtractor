import React, { useState } from 'react';
import './login.css'; // Import the login.css file

const Login = ({ onLogin }) => {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');

  const validUsername = 'user';
  const validPassword = 'pass123';

  const handleLogin = () => {
    if (username === validUsername && password === validPassword) {
      onLogin();
    } else {
      alert('Invalid username or password');
    }
  };

  return (
    <div className="login-container">
      <div className="login-left">
        <h2>LOGIN HERE</h2>
      </div>
      <div className="login-right">
        <h3>Sign in</h3>
        <input
          type="text"
          placeholder="Username"
          value={username}
          onChange={(e) => setUsername(e.target.value)}
        />
        <input
          type="password"
          placeholder="Password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
        />
        <button className="login-btn-signin" onClick={handleLogin}>
          Sign In
        </button>
      </div>
    </div>
  );
};

export default Login;
