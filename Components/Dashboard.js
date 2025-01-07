import React from 'react';
import { Link } from 'react-router-dom';

const Dashboard = () => {
  return (
    <div className="dashboard-container">
      <h1>KODIVIAN</h1>
      <nav className="menu">
        <ul>
          <li>
            <Link to="/dashboard">Dashboard</Link>
          </li>
          <li>
            <Link to="/upload-pdfs">Upload PDFs</Link>
          </li>
          <li>
            <Link to="/audit-logs">Audit Logs</Link>
          </li>
        </ul>
      </nav>
    </div>
  );
};

export default Dashboard;
