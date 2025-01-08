import React, { useEffect, useState } from 'react';
import './AuditLogs.css'; // Import the CSS file for styling

const AuditLogs = () => {
  const [logs, setLogs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    const fetchAuditLogs = async () => {
      try {
        const response = await fetch('/api/audit-logs');
        if (!response.ok) {
          console.error('Network response was not ok:', response.statusText);
          throw new Error('Network response was not ok');
        }
        const data = await response.json();
        // Sort logs in descending order by timestamp
        const sortedLogs = data.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
        setLogs(sortedLogs);
      } catch (error) {
        console.error('Fetch error:', error);
        setError(error.message);
      } finally {
        setLoading(false);
      }
    };

    fetchAuditLogs();
  }, []);

  const formatTimestamp = (timestamp) => {
    const date = new Date(timestamp);
    return date.toLocaleString(); // Formats the date and time in a readable format
  };

  if (loading) {
    return <div className="audit-logs-container"><p>Loading...</p></div>;
  }

  if (error) {
    return <div className="audit-logs-container"><p>Error: {error}</p></div>;
  }

  return (
    <div className="audit-logs-container">
      <h1>Audit Logs</h1>
      {logs.length > 0 ? (
        <table className="audit-logs-table">
          <thead>
            <tr>
              <th>Time</th>
              <th>Host</th>
              <th>API</th>
            </tr>
          </thead>
          <tbody>
            {logs.map((log, index) => (
              <tr key={index}>
                <td>{formatTimestamp(log.timestamp)}</td>
                <td>{log.host === '::1' ? 'localhost' : log.host}</td>
                <td>{log.method} {log.url}</td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : (
        <p>No audit logs available.</p>
      )}
    </div>
  );
};

export default AuditLogs;
