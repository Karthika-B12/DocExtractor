import React, { useEffect, useState } from 'react';
import { FaEye } from 'react-icons/fa';
import '../App.css';
import './UploadPDFs.css'; // Import the new CSS file

const UploadPDFs = () => {
  const [extractedData, setExtractedData] = useState({ title: '', tables: [], keyValuePairs: [], accountNumber: '', statementNumber: '', statementDate: '' });
  const [error, setError] = useState('');
  const [pdfText, setPdfText] = useState('');
  const [uploadedFile, setUploadedFile] = useState(null);
  const [fileData, setFileData] = useState(null);
  const [showPDF, setShowPDF] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [showDetails, setShowDetails] = useState(false); // State to control visibility
  const [showExtractedText, setShowExtractedText] = useState(false); // State to control extracted text visibility

  useEffect(() => {
    // Remove statement number and statement date from keyValuePairs if they exist
    const filteredKeyValuePairs = extractedData.keyValuePairs.filter(
      item => item.key !== 'Statement Number' && item.key !== 'Statement Date'
    );
    setExtractedData(prevData => ({
      ...prevData,
      keyValuePairs: filteredKeyValuePairs
    }));
  }, [extractedData.statementNumber, extractedData.statementDate]);

  const handleFileUpload = async (event) => {
    setIsLoading(true);
    const file = event.target.files[0];
    if (!file) {
      setError('Please select a PDF file.');
      setIsLoading(false);
      return;
    }
    setUploadedFile(file);
    setShowDetails(true); // Show details after file is chosen
    const formData = new FormData();
    formData.append('file', file);

    const reader = new FileReader();
    reader.onload = () => {
      setFileData(reader.result);
    };
    reader.readAsDataURL(file);

    try {
      const response = await fetch('http://localhost:3001/upload', {
        method: 'POST',
        body: formData,
      });
      if (!response.ok) {
        throw new Error('Failed to upload file');
      }
      const result = await response.json();
      console.log('Extracted Data:', result); // Log extracted data
      setExtractedData(result);
      setError('');
    } catch (error) {
      console.error('Error uploading file:', error);
      setError('Error uploading file. Please try again.');
    } finally {
      setIsLoading(false);
    }
  };

  const handleButtonClick = async () => {
    if (!uploadedFile) {
      setError('Please upload a PDF file first.');
      return;
    }
    const formData = new FormData();
    formData.append('file', uploadedFile);
    try {
      const response = await fetch('http://localhost:3001/execute', {
        method: 'POST',
        body: formData,
      });
      const result = await response.json();
      setPdfText(result.text);
      setShowExtractedText(true); // Show extracted text after button click
    } catch (error) {
      console.error('Error executing custom code:', error);
    }
  };

  const handleAccountNumberChange = (event) => {
    setExtractedData(prevData => ({ ...prevData, accountNumber: event.target.value }));
  };

  const handleViewPDFClick = () => {
    setShowPDF(true);
  };

  const handleTableCellChange = (event, tableIndex, rowIndex, cellIndex) => {
    const newTables = [...extractedData.tables];
    newTables[tableIndex][rowIndex][cellIndex] = event.target.value;
    setExtractedData(prevData => ({ ...prevData, tables: newTables }));
  };

  const handleSaveButtonClick = async () => {
    if (!extractedData.accountNumber || !extractedData.statementNumber || !extractedData.statementDate) {
      setError('Please fill in all required fields.');
      return;
    }

    console.log('Saving Data:', { filename: uploadedFile.name, ...extractedData }); // Log data to be saved
    try {
      const checkResponse = await fetch('http://localhost:3001/check', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          accountNumber: extractedData.accountNumber,
          statementNumber: extractedData.statementNumber,
        }),
      });

      const checkResult = await checkResponse.json();

      if (checkResult.exists) {
        alert('Data already exists for this account and statement number.');
        setError('Duplicate data entry.');
        return;
      }

      const response = await fetch('http://localhost:3001/save', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          filename: uploadedFile.name,
          tables: extractedData.tables,
          accountNumber: extractedData.accountNumber,
          statementNumber: extractedData.statementNumber,
          statementDate: extractedData.statementDate,
          title: extractedData.title // Include the title in the save request
        }),
      });
      const result = await response.json();
      if (response.ok) {
        alert('Data saved successfully!');
      } else {
        alert('Failed to save data: ' + result.error);
      }
    } catch (error) {
      console.error('Error saving data:', error);
      alert('Failed to save data. Please try again.');
    }
  };

  return (
    <div className="upload-container">
      <h1 className="page-title">PDF Dashboard</h1>
      <div className="content">
        <div className="pdf-viewer">
          <input type="file" accept="application/pdf" onChange={handleFileUpload} className="file-input" />
          {isLoading && <p>Loading...</p>}
          {error && <p className="error-message">{error}</p>}
          <FaEye
            className="view-pdf-icon"
            onClick={handleViewPDFClick}
            title="View PDF"
            style={{ fontSize: '24px', cursor: 'pointer', color: '#007bff' }}
          />
          {showPDF && fileData && (
            <>
              <h3>{extractedData.title || uploadedFile.name}</h3> {/* Display title or filename */}
              <iframe
                src={fileData}
                title="PDF Viewer"
                className="pdf-viewer-iframe"
                frameBorder="0"
              />
            </>
          )}
        </div>
        {showDetails && (
          <div className="text-viewer">
            <button onClick={handleButtonClick} className="custom-button">Extract</button>
            <h3>Title</h3>
            <p>{extractedData.title}</p>
            <h3>Account Number</h3>
            <input
              type="text"
              value={extractedData.accountNumber}
              onChange={handleAccountNumberChange}
              required
              className="input-field"
            />
            <h3>Statement Number</h3>
            <p>{extractedData.statementNumber}</p>
            <h3>Statement Date</h3>
            <p>{extractedData.statementDate}</p>
            <ul>
              {extractedData.keyValuePairs.map((item, index) => (
                <li key={index}>
                  {item.key}: {item.value}
                </li>
              ))}
            </ul>
            <h3>Tables</h3>
            {extractedData.tables.map((table, tableIndex) => (
              <div className="table-container" key={tableIndex}>
                <table>
                  <thead>
                    <tr>
                      <th className="table-header">Sr. No.</th>
                      <th className="table-header">Description</th>
                      <th className="table-header">Amount</th>
                    </tr>
                  </thead>
                  <tbody>
                    {table.filter(row => row[1].trim() !== '').map((row, rowIndex) => (
                      <tr key={rowIndex}>
                        <td className="table-data">{rowIndex + 1}</td>
                        <td className="table-data">
                          <input
                            type="text"
                            value={row[0]}
                            onChange={(event) => handleTableCellChange(event, tableIndex, rowIndex, 0)}
                            className="input-field"
                          />
                        </td>
                        <td className="table-data">
                          <input
                            type="text"
                            value={row[1]}
                            onChange={(event) => handleTableCellChange(event, tableIndex, rowIndex, 1)}
                            className="input-field"
                          />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ))}
            <button onClick={handleSaveButtonClick} className="custom-button">Save</button>
          </div>
        )}
        {showExtractedText && (
          <div className="pdf-extracted-text">
            <h2>Extracted Text</h2>
            <pre>{pdfText || 'No text extracted yet.'}</pre>
          </div>
        )}
      </div>
    </div>
  );
};

export default UploadPDFs;
