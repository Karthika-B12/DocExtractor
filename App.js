
import React, { useState } from 'react';
import { Navigate, Route, BrowserRouter as Router, Routes } from 'react-router-dom';
import AuditLogs from './components/AuditLogs';
import Dashboard from './components/Dashboard';
import Login from './components/login';
import UploadPDFs from './components/UploadPDFs';

const App = () => {
  const [isAuthenticated, setIsAuthenticated] = useState(false);

  const handleLogin = () => {
    setIsAuthenticated(true);
  };

  return (
    <Router>
      <Routes>
        {!isAuthenticated ? (
          <Route path="/" element={<Login onLogin={handleLogin} />} />
        ) : (
          <>
            <Route path="/" element={<Navigate to="/dashboard" />} />
            <Route path="/dashboard" element={<Dashboard />} />
            <Route path="/upload-pdfs" element={<UploadPDFs />} />
            <Route path="/audit-logs" element={<AuditLogs />} />
          </>
        )}
      </Routes>
    </Router>
  );
};

export default App;
