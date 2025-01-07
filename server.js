/*
const express = require('express');
const multer = require('multer');
const fs = require('fs');
const pdfParse = require('pdf-parse');
const cors = require('cors');
const { Pool } = require('pg');

const app = express();
const upload = multer({ dest: 'uploads/' });

app.use(cors());
app.use(express.json());

// Create a PostgreSQL pool
const pool = new Pool({
  user: 'postgres',
  host: 'localhost',
  database: 'Abits',
  password: 'root',
  port: 5432,
});

// Create the tables if they don't exist
pool.query(`
  CREATE TABLE IF NOT EXISTS filename (
    filename VARCHAR(255),
    account_number VARCHAR(255),
    statement_number INTEGER PRIMARY KEY,
    statement_date DATE
  );

  CREATE TABLE IF NOT EXISTS statement_details (
    id SERIAL PRIMARY KEY,
    statement_number INTEGER,
    sr_no INTEGER,
    description TEXT,
    amount TEXT
  );
`, (err, res) => {
  if (err) {
    console.error('Error creating tables:', err);
  } else {
    console.log('Tables created or already exist');
  }
});

const extractContent = (text) => {
  const lines = text.split('\n');
  let title = '';
  let tables = [];
  let keyValuePairs = [];
  let currentTable = [];
  let inTable = false;
  let accountNumber = '';
  let statementNumber = '';
  let statementDate = '';
  let rowIndex = 0;

  const amountRegex = /\$+(\d+(\.\d{2}))/;
  const cleanDollarRegex = /^\$+/;

  // Extract the title from the first few lines
  for (let i = 0; i < Math.min(lines.length, 10); i++) {
    const line = lines[i].trim();
    if (line.includes('Amazon Web Services Statement')) {
      title = line;
      break;
    }
  }

  lines.forEach((line, index) => {
    const accountNumberMatch = line.match(/Account number:/i);
    if (accountNumberMatch) {
      accountNumber = lines[index + 1].trim(); // Capturing the next line for the account number
    }

    const statementNumberMatch = line.match(/Statement Number:/i);
    if (statementNumberMatch) {
      statementNumber = line.split(':')[1].trim();
    }

    const statementDateMatch = line.match(/Statement Date:/i);
    if (statementDateMatch) {
      statementDate = line.split(':')[1].trim();
    }

    const keyValuePairMatch = line.match(/(.+?):\s*(.+)/);
    if (keyValuePairMatch && !line.toLowerCase().includes('please note') && !line.toLowerCase().includes('https://')) {
      keyValuePairs.push({ key: keyValuePairMatch[1].trim(), value: keyValuePairMatch[2].trim() });
    }

    if (line.match(/Activity By Account|Summary for Linked Account|Detail for Linked Account|Itemized Charges|Service Charges/)) {
      if (currentTable.length) {
        tables.push(currentTable);
        currentTable = [];
      }
      inTable = true;
      rowIndex = 0;
    }

    if (inTable) {
      if (line.trim() === '' && currentTable.length > 0) {
        tables.push(currentTable);
        currentTable = [];
        inTable = false;
      } else {
        const columns = line.trim().split(/\s{2,}/);

        if (columns.length === 1) {
          const match = columns[0].match(amountRegex);
          if (match) {
            let amount = `$${match[1]}`;
            const description = columns[0].replace(match[0], '').trim();
            currentTable.push([description, amount]);
          } else {
            currentTable.push([columns[0], '']);
          }
        } else if (columns.length >= 2) {
          let description = columns.slice(0, -1).join(' ').trim();
          let amount = columns[columns.length - 1].trim();
          amount = amount.replace(cleanDollarRegex, '$');
          if (!amount.startsWith('$')) {
            amount = `$${amount}`;
          }
          const embeddedMatch = description.match(amountRegex);
          if (embeddedMatch) {
            amount = `$${embeddedMatch[1]}`;
            description = description.replace(embeddedMatch[0], '').trim();
          }
          currentTable.push([description, amount]);
        }

        if (rowIndex === 9) { // Check if current row is Sr. No. 10
          tables.push(currentTable);
          currentTable = [];
        }
        rowIndex++;
      }
    }
  });

  if (currentTable.length) {
    tables.push(currentTable);
  }

  tables = tables.map(table => table.filter(row => row[1].trim() !== ''));

  return { title, tables, keyValuePairs, accountNumber, statementNumber, statementDate };
};

app.post('/upload', upload.single('file'), async (req, res) => {
  try {
    const dataBuffer = fs.readFileSync(req.file.path);
    const data = await pdfParse(dataBuffer);
    const extractedContent = extractContent(data.text);
    console.log('Extracted Content:', extractedContent);
    res.json(extractedContent);
  } catch (error) {
    res.status(500).json({ error: 'Failed to parse PDF' });
  }
});

app.post('/execute', upload.single('file'), async (req, res) => {
  try {
    const dataBuffer = fs.readFileSync(req.file.path);
    const data = await pdfParse(dataBuffer);
    res.json({ text: data.text });
  } catch (error) {
    res.status(500).json({ error: 'Failed to execute custom code' });
  }
});

app.post('/check', async (req, res) => {
  const { accountNumber, statementNumber } = req.body;

  try {
    const checkQuery = `
      SELECT 1 FROM filename 
      WHERE account_number = $1 AND statement_number = $2
    `;
    const checkResult = await pool.query(checkQuery, [accountNumber, statementNumber]);

    if (checkResult.rowCount > 0) {
      res.json({ exists: true });
    } else {
      res.json({ exists: false });
    }
  } catch (error) {
    console.error('Error checking for duplicate entry:', error);
    res.status(500).json({ error: 'Failed to check for duplicate entry' });
  }
});

app.post('/save', async (req, res) => {
  const client = await pool.connect();
  try {
    const { filename, tables, accountNumber, statementNumber, statementDate } = req.body;

    if (!accountNumber || !statementNumber || !statementDate) {
      return res.status(400).json({ error: 'Missing required fields.' });
    }

    await client.query('BEGIN');

    const filenameQuery = `
      INSERT INTO filename (filename, account_number, statement_number, statement_date)
      VALUES ($1, $2, $3, $4)
      ON CONFLICT (statement_number) DO NOTHING
    `;
    const filenameValues = [filename, accountNumber, statementNumber, statementDate];
    await client.query(filenameQuery, filenameValues);

    const statementDetailsQuery = `
      INSERT INTO statement_details (statement_number, sr_no, description, amount)
      VALUES ($1, $2, $3, $4)
    `;
    for (let i = 0; i < tables.length; i++) {
      for (let j = 0; j < tables[i].length; j++) {
        const statementDetailsValues = [statementNumber, j + 1, tables[i][j][0].trim(), tables[i][j][1].trim()];
        console.log('Inserting row:', statementDetailsValues); // Log each row being inserted
        await client.query(statementDetailsQuery, statementDetailsValues);
      }
    }

    await client.query('COMMIT');

    res.status(200).json({ message: 'Data saved successfully' });
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Error saving data:', error);
    res.status(500).json({ error: `Failed to save data: ${error.message}` });
  } finally {
    client.release();
  }
});

const PORT = 3001;
app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});*/

/*
const express = require('express');
const multer = require('multer');
const fs = require('fs');
const pdfParse = require('pdf-parse');
const cors = require('cors');
const { Pool } = require('pg');

const app = express();
const upload = multer({ dest: 'uploads/' });

app.use(cors());
app.use(express.json());

// Create a PostgreSQL pool
const pool = new Pool({
  user: 'postgres',
  host: 'localhost',
  database: 'Abits',
  password: 'root',
  port: 5432,
});

// Create the tables if they don't exist
pool.query(`
  CREATE TABLE IF NOT EXISTS filename (
    filename VARCHAR(255),
    account_number VARCHAR(255),
    statement_number INTEGER PRIMARY KEY,
    statement_date DATE,
    title VARCHAR(255)
  );

  CREATE TABLE IF NOT EXISTS statement_details (
    id SERIAL PRIMARY KEY,
    statement_number INTEGER,
    sr_no INTEGER,
    description TEXT,
    amount TEXT
  );
`, (err, res) => {
  if (err) {
    console.error('Error creating tables:', err);
  } else {
    console.log('Tables created or already exist');
  }
});

const extractContent = (text) => {
  const lines = text.split('\n');
  let title = '';
  let tables = [];
  let keyValuePairs = [];
  let currentTable = [];
  let inTable = false;
  let accountNumber = '';
  let statementNumber = '';
  let statementDate = '';
  let rowIndex = 0;

  const amountRegex = /\$+(\d+(\.\d{2}))/;
  const cleanDollarRegex = /^\$+/;

  // Extract the title from the first few lines
  for (let i = 0; i < Math.min(lines.length, 10); i++) {
    const line = lines[i].trim();
    if (line.includes('Amazon Web Services Statement')) {
      title = line;
      break;
    }
  }

  lines.forEach((line, index) => {
    const accountNumberMatch = line.match(/Account number:/i);
    if (accountNumberMatch) {
      accountNumber = lines[index + 1].trim(); // Capturing the next line for the account number
    }

    const statementNumberMatch = line.match(/Statement Number:/i);
    if (statementNumberMatch) {
      statementNumber = line.split(':')[1].trim();
    }

    const statementDateMatch = line.match(/Statement Date:/i);
    if (statementDateMatch) {
      statementDate = line.split(':')[1].trim();
    }

    const keyValuePairMatch = line.match(/(.+?):\s*(.+)/);
    if (keyValuePairMatch && !line.toLowerCase().includes('please note') && !line.toLowerCase().includes('https://')) {
      keyValuePairs.push({ key: keyValuePairMatch[1].trim(), value: keyValuePairMatch[2].trim() });
    }

    if (line.match(/Activity By Account|Summary for Linked Account|Detail for Linked Account|Itemized Charges|Service Charges/)) {
      if (currentTable.length) {
        tables.push(currentTable);
        currentTable = [];
      }
      inTable = true;
      rowIndex = 0;
    }

    if (inTable) {
      if (line.trim() === '' && currentTable.length > 0) {
        tables.push(currentTable);
        currentTable = [];
        inTable = false;
      } else {
        const columns = line.trim().split(/\s{2,}/);

        if (columns.length === 1) {
          const match = columns[0].match(amountRegex);
          if (match) {
            let amount = `$${match[1]}`;
            const description = columns[0].replace(match[0], '').trim();
            currentTable.push([description, amount]);
          } else {
            currentTable.push([columns[0], '']);
          }
        } else if (columns.length >= 2) {
          let description = columns.slice(0, -1).join(' ').trim();
          let amount = columns[columns.length - 1].trim();
          amount = amount.replace(cleanDollarRegex, '$');
          if (!amount.startsWith('$')) {
            amount = `$${amount}`;
          }
          const embeddedMatch = description.match(amountRegex);
          if (embeddedMatch) {
            amount = `$${embeddedMatch[1]}`;
            description = description.replace(embeddedMatch[0], '').trim();
          }
          currentTable.push([description, amount]);
        }

        if (rowIndex === 9) { // Check if current row is Sr. No. 10
          tables.push(currentTable);
          currentTable = [];
        }
        rowIndex++;
      }
    }
  });

  if (currentTable.length) {
    tables.push(currentTable);
  }

  tables = tables.map(table => table.filter(row => row[1].trim() !== ''));

  return { title, tables, keyValuePairs, accountNumber, statementNumber, statementDate };
};

app.post('/upload', upload.single('file'), async (req, res) => {
  try {
    const dataBuffer = fs.readFileSync(req.file.path);
    const data = await pdfParse(dataBuffer);
    const extractedContent = extractContent(data.text);
    console.log('Extracted Content:', extractedContent);
    res.json(extractedContent);
  } catch (error) {
    res.status(500).json({ error: 'Failed to parse PDF' });
  }
});

app.post('/execute', upload.single('file'), async (req, res) => {
  try {
    const dataBuffer = fs.readFileSync(req.file.path);
    const data = await pdfParse(dataBuffer);
    res.json({ text: data.text });
  } catch (error) {
    res.status(500).json({ error: 'Failed to execute custom code' });
  }
});

app.post('/check', async (req, res) => {
  const { accountNumber, statementNumber } = req.body;

  try {
    const checkQuery = `
      SELECT 1 FROM filename 
      WHERE account_number = $1 AND statement_number = $2
    `;
    const checkResult = await pool.query(checkQuery, [accountNumber, statementNumber]);

    if (checkResult.rowCount > 0) {
      res.json({ exists: true });
    } else {
      res.json({ exists: false });
    }
  } catch (error) {
    console.error('Error checking for duplicate entry:', error);
    res.status(500).json({ error: 'Failed to check for duplicate entry' });
  }
});

app.post('/save', async (req, res) => {
  const client = await pool.connect();
  try {
    const { filename, tables, accountNumber, statementNumber, statementDate, title } = req.body;

    if (!accountNumber || !statementNumber || !statementDate || !title) {
      return res.status(400).json({ error: 'Missing required fields.' });
    }

    await client.query('BEGIN');

    const filenameQuery = `
      INSERT INTO filename (filename, account_number, statement_number, statement_date, title)
      VALUES ($1, $2, $3, $4, $5)
      ON CONFLICT (statement_number) DO NOTHING
    `;
    const filenameValues = [filename, accountNumber, statementNumber, statementDate, title];
    await client.query(filenameQuery, filenameValues);

    const statementDetailsQuery = `
      INSERT INTO statement_details (statement_number, sr_no, description, amount)
      VALUES ($1, $2, $3, $4)
    `;
    for (let i = 0; i < tables.length; i++) {
      for (let j = 0; j < tables[i].length; j++) {
        const statementDetailsValues = [statementNumber, j + 1, tables[i][j][0].trim(), tables[i][j][1].trim()];
        console.log('Inserting row:', statementDetailsValues); // Log each row being inserted
        await client.query(statementDetailsQuery, statementDetailsValues);
      }
    }

    await client.query('COMMIT');

    res.status(200).json({ message: 'Data saved successfully' });
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Error saving data:', error);
    res.status(500).json({ error: `Failed to save data: ${error.message}` });
  } finally {
    client.release();
  }
});

const PORT = 3001;
app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});*/

////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
//FINAL CODE WITH AUDIT LOG PART
/*
const express = require('express');
const multer = require('multer');
const fs = require('fs');
const pdfParse = require('pdf-parse');
const cors = require('cors');
const { Pool } = require('pg');
const path = require('path');

const app = express();
const upload = multer({ dest: 'uploads/' });

app.use(cors());
app.use(express.json());

// Middleware to log API calls
app.use((req, res, next) => {
  const log = `${new Date().toISOString()} - ${req.method} ${req.url}\n`;
  fs.appendFile(path.join(__dirname, 'audit.log'), log, (err) => {
    if (err) {
      console.error('Failed to write to log file:', err);
    }
  });
  next();
});

// Create a PostgreSQL pool
const pool = new Pool({
  user: 'postgres',
  host: 'localhost',
  database: 'Abits',
  password: 'root',
  port: 5432,
});

// Create the tables if they don't exist
pool.query(`
  CREATE TABLE IF NOT EXISTS filename (
    filename VARCHAR(255),
    account_number VARCHAR(255),
    statement_number INTEGER PRIMARY KEY,
    statement_date DATE,
    title VARCHAR(255)
  );

  CREATE TABLE IF NOT EXISTS statement_details (
    id SERIAL PRIMARY KEY,
    statement_number INTEGER,
    sr_no INTEGER,
    description TEXT,
    amount TEXT
  );
`, (err, res) => {
  if (err) {
    console.error('Error creating tables:', err);
  } else {
    console.log('Tables created or already exist');
  }
});

const extractContent = (text) => {
  const lines = text.split('\n');
  let title = '';
  let tables = [];
  let keyValuePairs = [];
  let currentTable = [];
  let inTable = false;
  let accountNumber = '';
  let statementNumber = '';
  let statementDate = '';
  let rowIndex = 0;

  const amountRegex = /\$+(\d+(\.\d{2}))/;
  const cleanDollarRegex = /^\$+/;

  // Extract the title from the first few lines
  for (let i = 0; i < Math.min(lines.length, 10); i++) {
    const line = lines[i].trim();
    if (line.includes('Amazon Web Services Statement')) {
      title = line;
      break;
    }
  }

  lines.forEach((line, index) => {
    const accountNumberMatch = line.match(/Account number:/i);
    if (accountNumberMatch) {
      accountNumber = lines[index + 1].trim(); // Capturing the next line for the account number
    }

    const statementNumberMatch = line.match(/Statement Number:/i);
    if (statementNumberMatch) {
      statementNumber = line.split(':')[1].trim();
    }

    const statementDateMatch = line.match(/Statement Date:/i);
    if (statementDateMatch) {
      statementDate = line.split(':')[1].trim();
    }

    const keyValuePairMatch = line.match(/(.+?):\s*(.+)/);
    if (keyValuePairMatch && !line.toLowerCase().includes('please note') && !line.toLowerCase().includes('https://')) {
      keyValuePairs.push({ key: keyValuePairMatch[1].trim(), value: keyValuePairMatch[2].trim() });
    }

    if (line.match(/Activity By Account|Summary for Linked Account|Detail for Linked Account|Itemized Charges|Service Charges/)) {
      if (currentTable.length) {
        tables.push(currentTable);
        currentTable = [];
      }
      inTable = true;
      rowIndex = 0;
    }

    if (inTable) {
      if (line.trim() === '' && currentTable.length > 0) {
        tables.push(currentTable);
        currentTable = [];
        inTable = false;
      } else {
        const columns = line.trim().split(/\s{2,}/);

        if (columns.length === 1) {
          const match = columns[0].match(amountRegex);
          if (match) {
            let amount = `$${match[1]}`;
            const description = columns[0].replace(match[0], '').trim();
            currentTable.push([description, amount]);
          } else {
            currentTable.push([columns[0], '']);
          }
        } else if (columns.length >= 2) {
          let description = columns.slice(0, -1).join(' ').trim();
          let amount = columns[columns.length - 1].trim();
          amount = amount.replace(cleanDollarRegex, '$');
          if (!amount.startsWith('$')) {
            amount = `$${amount}`;
          }
          const embeddedMatch = description.match(amountRegex);
          if (embeddedMatch) {
            amount = `$${embeddedMatch[1]}`;
            description = description.replace(embeddedMatch[0], '').trim();
          }
          currentTable.push([description, amount]);
        }

        if (rowIndex === 9) { // Check if current row is Sr. No. 10
          tables.push(currentTable);
          currentTable = [];
        }
        rowIndex++;
      }
    }
  });

  if (currentTable.length) {
    tables.push(currentTable);
  }

  tables = tables.map(table => table.filter(row => row[1].trim() !== ''));

  return { title, tables, keyValuePairs, accountNumber, statementNumber, statementDate };
};

app.post('/upload', upload.single('file'), async (req, res) => {
  try {
    const dataBuffer = fs.readFileSync(req.file.path);
    const data = await pdfParse(dataBuffer);
    const extractedContent = extractContent(data.text);
    console.log('Extracted Content:', extractedContent);
    res.json(extractedContent);
  } catch (error) {
    res.status(500).json({ error: 'Failed to parse PDF' });
  }
});

app.post('/execute', upload.single('file'), async (req, res) => {
  try {
    const dataBuffer = fs.readFileSync(req.file.path);
    const data = await pdfParse(dataBuffer);
    res.json({ text: data.text });
  } catch (error) {
    res.status(500).json({ error: 'Failed to execute custom code' });
  }
});

app.post('/check', async (req, res) => {
  const { accountNumber, statementNumber } = req.body;

  try {
    const checkQuery = `
      SELECT 1 FROM filename 
      WHERE account_number = $1 AND statement_number = $2
    `;
    const checkResult = await pool.query(checkQuery, [accountNumber, statementNumber]);

    if (checkResult.rowCount > 0) {
      res.json({ exists: true });
    } else {
      res.json({ exists: false });
    }
  } catch (error) {
    console.error('Error checking for duplicate entry:', error);
    res.status(500).json({ error: 'Failed to check for duplicate entry' });
  }
});

app.post('/save', async (req, res) => {
  const client = await pool.connect();
  try {
    const { filename, tables, accountNumber, statementNumber, statementDate, title } = req.body;

    if (!accountNumber || !statementNumber || !statementDate || !title) {
      return res.status(400).json({ error: 'Missing required fields.' });
    }

    await client.query('BEGIN');

    const filenameQuery = `
      INSERT INTO filename (filename, account_number, statement_number, statement_date, title)
      VALUES ($1, $2, $3, $4, $5)
      ON CONFLICT (statement_number) DO NOTHING
    `;
    const filenameValues = [filename, accountNumber, statementNumber, statementDate, title];
    await client.query(filenameQuery, filenameValues);

    const statementDetailsQuery = `
      INSERT INTO statement_details (statement_number, sr_no, description, amount)
      VALUES ($1, $2, $3, $4)
    `;
    for (let i = 0; i < tables.length; i++) {
      for (let j = 0; j < tables[i].length; j++) {
        const statementDetailsValues = [statementNumber, j + 1, tables[i][j][0].trim(), tables[i][j][1].trim()];
        console.log('Inserting row:', statementDetailsValues); // Log each row being inserted
        await client.query(statementDetailsQuery, statementDetailsValues);
      }
    }

    await client.query('COMMIT');

    res.status(200).json({ message: 'Data saved successfully' });
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Error saving data:', error);
    res.status(500).json({ error: `Failed to save data: ${error.message}` });
  } finally {
    client.release();
  }
});

// Endpoint to get audit logs
app.get('/api/audit-logs', (req, res) => {
  fs.readFile(path.join(__dirname, 'audit.log'), 'utf8', (err, data) => {
    if (err) {
      return res.status(500).json({ error: 'Failed to read log file' });
    }
    const logs = data.split('\n').filter(line => line).map(line => ({ message: line }));
    res.json(logs);
  });
});

const PORT = 3001;
app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});*/

/*
const express = require('express');
const multer = require('multer');
const fs = require('fs');
const pdfParse = require('pdf-parse');
const cors = require('cors');
const { Pool } = require('pg');
const path = require('path');

const app = express();
const upload = multer({ dest: 'uploads/' });

app.use(cors());
app.use(express.json());

// Middleware to log API calls
app.use((req, res, next) => {
  const log = `${new Date().toISOString()} - ${req.ip} - ${req.method} ${req.url}\n`;
  fs.appendFile(path.join(__dirname, 'audit.log'), log, (err) => {
    if (err) {
      console.error('Failed to write to log file:', err);
    }
  });
  next();
});

// Create a PostgreSQL pool
const pool = new Pool({
  user: 'postgres',
  host: 'localhost',
  database: 'Abits',
  password: 'root',
  port: 5432,
});

// Create the tables if they don't exist
pool.query(`
  CREATE TABLE IF NOT EXISTS filename (
    filename VARCHAR(255),
    account_number VARCHAR(255),
    statement_number INTEGER PRIMARY KEY,
    statement_date DATE,
    title VARCHAR(255)
  );

  CREATE TABLE IF NOT EXISTS statement_details (
    id SERIAL PRIMARY KEY,
    statement_number INTEGER,
    sr_no INTEGER,
    description TEXT,
    amount TEXT
  );
`, (err, res) => {
  if (err) {
    console.error('Error creating tables:', err);
  } else {
    console.log('Tables created or already exist');
  }
});

const extractContent = (text) => {
  const lines = text.split('\n');
  let title = '';
  let tables = [];
  let keyValuePairs = [];
  let currentTable = [];
  let inTable = false;
  let accountNumber = '';
  let statementNumber = '';
  let statementDate = '';
  let rowIndex = 0;

  const amountRegex = /\$+(\d+(\.\d{2}))/;
  const cleanDollarRegex = /^\$+/;

  // Extract the title from the first few lines
  for (let i = 0; i < Math.min(lines.length, 10); i++) {
    const line = lines[i].trim();
    if (line.includes('Amazon Web Services Statement')) {
      title = line;
      break;
    }
  }

  lines.forEach((line, index) => {
    const accountNumberMatch = line.match(/Account number:/i);
    if (accountNumberMatch) {
      accountNumber = lines[index + 1].trim(); // Capturing the next line for the account number
    }

    const statementNumberMatch = line.match(/Statement Number:/i);
    if (statementNumberMatch) {
      statementNumber = line.split(':')[1].trim();
    }

    const statementDateMatch = line.match(/Statement Date:/i);
    if (statementDateMatch) {
      statementDate = line.split(':')[1].trim();
    }

    const keyValuePairMatch = line.match(/(.+?):\s*(.+)/);
    if (keyValuePairMatch && !line.toLowerCase().includes('please note') && !line.toLowerCase().includes('https://')) {
      keyValuePairs.push({ key: keyValuePairMatch[1].trim(), value: keyValuePairMatch[2].trim() });
    }

    if (line.match(/Activity By Account|Summary for Linked Account|Detail for Linked Account|Itemized Charges|Service Charges/)) {
      if (currentTable.length) {
        tables.push(currentTable);
        currentTable = [];
      }
      inTable = true;
      rowIndex = 0;
    }

    if (inTable) {
      if (line.trim() === '' && currentTable.length > 0) {
        tables.push(currentTable);
        currentTable = [];
        inTable = false;
      } else {
        const columns = line.trim().split(/\s{2,}/);

        if (columns.length === 1) {
          const match = columns[0].match(amountRegex);
          if (match) {
            let amount = `$${match[1]}`;
            const description = columns[0].replace(match[0], '').trim();
            currentTable.push([description, amount]);
          } else {
            currentTable.push([columns[0], '']);
          }
        } else if (columns.length >= 2) {
          let description = columns.slice(0, -1).join(' ').trim();
          let amount = columns[columns.length - 1].trim();
          amount = amount.replace(cleanDollarRegex, '$');
          if (!amount.startsWith('$')) {
            amount = `$${amount}`;
          }
          const embeddedMatch = description.match(amountRegex);
          if (embeddedMatch) {
            amount = `$${embeddedMatch[1]}`;
            description = description.replace(embeddedMatch[0], '').trim();
          }
          currentTable.push([description, amount]);
        }

        if (rowIndex === 9) { // Check if current row is Sr. No. 10
          tables.push(currentTable);
          currentTable = [];
        }
        rowIndex++;
      }
    }
  });

  if (currentTable.length) {
    tables.push(currentTable);
  }

  tables = tables.map(table => table.filter(row => row[1].trim() !== ''));

  return { title, tables, keyValuePairs, accountNumber, statementNumber, statementDate };
};

app.post('/upload', upload.single('file'), async (req, res) => {
  try {
    const dataBuffer = fs.readFileSync(req.file.path);
    const data = await pdfParse(dataBuffer);
    const extractedContent = extractContent(data.text);
    console.log('Extracted Content:', extractedContent);
    res.json(extractedContent);
  } catch (error) {
    res.status(500).json({ error: 'Failed to parse PDF' });
  }
});

app.post('/execute', upload.single('file'), async (req, res) => {
  try {
    const dataBuffer = fs.readFileSync(req.file.path);
    const data = await pdfParse(dataBuffer);
    res.json({ text: data.text });
  } catch (error) {
    res.status(500).json({ error: 'Failed to execute custom code' });
  }
});

app.post('/check', async (req, res) => {
  const { accountNumber, statementNumber } = req.body;

  try {
    const checkQuery = `
      SELECT 1 FROM filename 
      WHERE account_number = $1 AND statement_number = $2
    `;
    const checkResult = await pool.query(checkQuery, [accountNumber, statementNumber]);

    if (checkResult.rowCount > 0) {
      res.json({ exists: true });
    } else {
      res.json({ exists: false });
    }
  } catch (error) {
    console.error('Error checking for duplicate entry:', error);
    res.status(500).json({ error: 'Failed to check for duplicate entry' });
  }
});

app.post('/save', async (req, res) => {
  const client = await pool.connect();
  try {
    const { filename, tables, accountNumber, statementNumber, statementDate, title } = req.body;

    if (!accountNumber || !statementNumber || !statementDate || !title) {
      return res.status(400).json({ error: 'Missing required fields.' });
    }

    await client.query('BEGIN');

    const filenameQuery = `
      INSERT INTO filename (filename, account_number, statement_number, statement_date, title)
      VALUES ($1, $2, $3, $4, $5)
      ON CONFLICT (statement_number) DO NOTHING
    `;
    const filenameValues = [filename, accountNumber, statementNumber, statementDate, title];
    await client.query(filenameQuery, filenameValues);

    const statementDetailsQuery = `
      INSERT INTO statement_details (statement_number, sr_no, description, amount)
      VALUES ($1, $2, $3, $4)
    `;
    for (let i = 0; i < tables.length; i++) {
      for (let j = 0; j < tables[i].length; j++) {
        const statementDetailsValues = [statementNumber, j + 1, tables[i][j][0].trim(), tables[i][j][1].trim()];
        console.log('Inserting row:', statementDetailsValues); // Log each row being inserted
        await client.query(statementDetailsQuery, statementDetailsValues);
      }
    }

    await client.query('COMMIT');

    res.status(200).json({ message: 'Data saved successfully' });
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Error saving data:', error);
    res.status(500).json({ error: `Failed to save data: ${error.message}` });
  } finally {
    client.release();
  }
});

// Endpoint to get audit logs
app.get('/api/audit-logs', (req, res) => {
  fs.readFile(path.join(__dirname, 'audit.log'), 'utf8', (err, data) => {
    if (err) {
      return res.status(500).json({ error: 'Failed to read log file' });
    }
    const logs = data.split('\n').filter(line => line).map(line => {
      const [timestamp, ip, method, url] = line.split(' - ');
      return { timestamp, ip, method, url };
    });
    res.json(logs);
  });
});

const PORT = 3001;
app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});*/

/*
const express = require('express');
const multer = require('multer');
const fs = require('fs');
const pdfParse = require('pdf-parse');
const cors = require('cors');
const { Pool } = require('pg');
const path = require('path');

const app = express();
const upload = multer({ dest: 'uploads/' });

app.use(cors());
app.use(express.json());

// Middleware to log API calls
app.use((req, res, next) => {
  const log = `${new Date().toISOString()} - http://localhost:3000 - ${req.method} ${req.url}\n`;
  fs.appendFile(path.join(__dirname, 'audit.log'), log, (err) => {
    if (err) {
      console.error('Failed to write to log file:', err);
    }
  });
  next();
});

// Create a PostgreSQL pool
const pool = new Pool({
  user: 'postgres',
  host: 'localhost',
  database: 'Abits',
  password: 'root',
  port: 5432,
});

// Create the tables if they don't exist
pool.query(`
  CREATE TABLE IF NOT EXISTS filename (
    filename VARCHAR(255),
    account_number VARCHAR(255),
    statement_number INTEGER PRIMARY KEY,
    statement_date DATE,
    title VARCHAR(255)
  );

  CREATE TABLE IF NOT EXISTS statement_details (
    id SERIAL PRIMARY KEY,
    statement_number INTEGER,
    sr_no INTEGER,
    description TEXT,
    amount TEXT
  );
`, (err, res) => {
  if (err) {
    console.error('Error creating tables:', err);
  } else {
    console.log('Tables created or already exist');
  }
});

const extractContent = (text) => {
  const lines = text.split('\n');
  let title = '';
  let tables = [];
  let keyValuePairs = [];
  let currentTable = [];
  let inTable = false;
  let accountNumber = '';
  let statementNumber = '';
  let statementDate = '';
  let rowIndex = 0;

  const amountRegex = /\$+(\d+(\.\d{2}))/;
  const cleanDollarRegex = /^\$+/;

  // Extract the title from the first few lines
  for (let i = 0; i < Math.min(lines.length, 10); i++) {
    const line = lines[i].trim();
    if (line.includes('Amazon Web Services Statement')) {
      title = line;
      break;
    }
  }

  lines.forEach((line, index) => {
    const accountNumberMatch = line.match(/Account number:/i);
    if (accountNumberMatch) {
      accountNumber = lines[index + 1].trim(); // Capturing the next line for the account number
    }

    const statementNumberMatch = line.match(/Statement Number:/i);
    if (statementNumberMatch) {
      statementNumber = line.split(':')[1].trim();
    }

    const statementDateMatch = line.match(/Statement Date:/i);
    if (statementDateMatch) {
      statementDate = line.split(':')[1].trim();
    }

    const keyValuePairMatch = line.match(/(.+?):\s*(.+)/);
    if (keyValuePairMatch && !line.toLowerCase().includes('please note') && !line.toLowerCase().includes('https://')) {
      keyValuePairs.push({ key: keyValuePairMatch[1].trim(), value: keyValuePairMatch[2].trim() });
    }

    if (line.match(/Activity By Account|Summary for Linked Account|Detail for Linked Account|Itemized Charges|Service Charges/)) {
      if (currentTable.length) {
        tables.push(currentTable);
        currentTable = [];
      }
      inTable = true;
      rowIndex = 0;
    }

    if (inTable) {
      if (line.trim() === '' && currentTable.length > 0) {
        tables.push(currentTable);
        currentTable = [];
        inTable = false;
      } else {
        const columns = line.trim().split(/\s{2,}/);

        if (columns.length === 1) {
          const match = columns[0].match(amountRegex);
          if (match) {
            let amount = `$${match[1]}`;
            const description = columns[0].replace(match[0], '').trim();
            currentTable.push([description, amount]);
          } else {
            currentTable.push([columns[0], '']);
          }
        } else if (columns.length >= 2) {
          let description = columns.slice(0, -1).join(' ').trim();
          let amount = columns[columns.length - 1].trim();
          amount = amount.replace(cleanDollarRegex, '$');
          if (!amount.startsWith('$')) {
            amount = `$${amount}`;
          }
          const embeddedMatch = description.match(amountRegex);
          if (embeddedMatch) {
            amount = `$${embeddedMatch[1]}`;
            description = description.replace(embeddedMatch[0], '').trim();
          }
          currentTable.push([description, amount]);
        }

        if (rowIndex === 9) { // Check if current row is Sr. No. 10
          tables.push(currentTable);
          currentTable = [];
        }
        rowIndex++;
      }
    }
  });

  if (currentTable.length) {
    tables.push(currentTable);
  }

  tables = tables.map(table => table.filter(row => row[1].trim() !== ''));

  return { title, tables, keyValuePairs, accountNumber, statementNumber, statementDate };
};

app.post('/upload', upload.single('file'), async (req, res) => {
  try {
    const dataBuffer = fs.readFileSync(req.file.path);
    const data = await pdfParse(dataBuffer);
    const extractedContent = extractContent(data.text);
    console.log('Extracted Content:', extractedContent);
    res.json(extractedContent);
  } catch (error) {
    res.status(500).json({ error: 'Failed to parse PDF' });
  }
});

app.post('/execute', upload.single('file'), async (req, res) => {
  try {
    const dataBuffer = fs.readFileSync(req.file.path);
    const data = await pdfParse(dataBuffer);
    res.json({ text: data.text });
  } catch (error) {
    res.status(500).json({ error: 'Failed to execute custom code' });
  }
});

app.post('/check', async (req, res) => {
  const { accountNumber, statementNumber } = req.body;

  try {
    const checkQuery = `
      SELECT 1 FROM filename 
      WHERE account_number = $1 AND statement_number = $2
    `;
    const checkResult = await pool.query(checkQuery, [accountNumber, statementNumber]);

    if (checkResult.rowCount > 0) {
      res.json({ exists: true });
    } else {
      res.json({ exists: false });
    }
  } catch (error) {
    console.error('Error checking for duplicate entry:', error);
    res.status(500).json({ error: 'Failed to check for duplicate entry' });
  }
});

app.post('/save', async (req, res) => {
  const client = await pool.connect();
  try {
    const { filename, tables, accountNumber, statementNumber, statementDate, title } = req.body;

    if (!accountNumber || !statementNumber || !statementDate || !title) {
      return res.status(400).json({ error: 'Missing required fields.' });
    }

    await client.query('BEGIN');

    const filenameQuery = `
      INSERT INTO filename (filename, account_number, statement_number, statement_date, title)
      VALUES ($1, $2, $3, $4, $5)
      ON CONFLICT (statement_number) DO NOTHING
    `;
    const filenameValues = [filename, accountNumber, statementNumber, statementDate, title];
    await client.query(filenameQuery, filenameValues);

    const statementDetailsQuery = `
      INSERT INTO statement_details (statement_number, sr_no, description, amount)
      VALUES ($1, $2, $3, $4)
    `;
    for (let i = 0; i < tables.length; i++) {
      for (let j = 0; j < tables[i].length; j++) {
        const statementDetailsValues = [statementNumber, j + 1, tables[i][j][0].trim(), tables[i][j][1].trim()];
        console.log('Inserting row:', statementDetailsValues); // Log each row being inserted
        await client.query(statementDetailsQuery, statementDetailsValues);
      }
    }

    await client.query('COMMIT');

    res.status(200).json({ message: 'Data saved successfully' });
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Error saving data:', error);
    res.status(500).json({ error: `Failed to save data: ${error.message}` });
  } finally {
    client.release();
  }
});

// Endpoint to get audit logs
app.get('/api/audit-logs', (req, res) => {
  fs.readFile(path.join(__dirname, 'audit.log'), 'utf8', (err, data) => {
    if (err) {
      return res.status(500).json({ error: 'Failed to read log file' });
    }
    const logs = data.split('\n').filter(line => line).map(line => {
      const [timestamp, host, methodUrl] = line.split(' - ');
      const [method, url] = methodUrl.split(' ');
      return { timestamp, host, method, url };
    });
    res.json(logs);
  });
});

const PORT = 3001;
app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});*/


const express = require('express');
const multer = require('multer');
const fs = require('fs');
const pdfParse = require('pdf-parse');
const cors = require('cors');
const { Pool } = require('pg');
const path = require('path');

const app = express();
const upload = multer({ dest: 'uploads/' });

app.use(cors());
app.use(express.json());

// Middleware to log API calls
app.use((req, res, next) => {
  const log = `${new Date().toISOString()} - http://localhost:3000 - ${req.method} ${req.url}\n`;
  fs.appendFile(path.join(__dirname, 'audit.log'), log, (err) => {
    if (err) {
      console.error('Failed to write to log file:', err);
    }
  });
  next();
});

// Create a PostgreSQL pool
const pool = new Pool({
  user: 'postgres',
  host: 'localhost',
  database: 'Abits',
  password: 'root',
  port: 5432,
});

// Create the tables if they don't exist
pool.query(`
  CREATE TABLE IF NOT EXISTS filename (
    filename VARCHAR(255),
    account_number VARCHAR(255),
    statement_number INTEGER PRIMARY KEY,
    statement_date DATE,
    title VARCHAR(255)
  );

  CREATE TABLE IF NOT EXISTS statement_details (
    id SERIAL PRIMARY KEY,
    statement_number INTEGER,
    sr_no INTEGER,
    description TEXT,
    amount TEXT
  );
`, (err, res) => {
  if (err) {
    console.error('Error creating tables:', err);
  } else {
    console.log('Tables created or already exist');
  }
});

const extractContent = (text) => {
  const lines = text.split('\n');
  let title = '';
  let tables = [];
  let keyValuePairs = [];
  let currentTable = [];
  let inTable = false;
  let accountNumber = '';
  let statementNumber = '';
  let statementDate = '';
  let rowIndex = 0;

  const amountRegex = /\$+(\d+(\.\d{2}))/;
  const cleanDollarRegex = /^\$+/;

  // Extract the title from the first few lines
  for (let i = 0; i < Math.min(lines.length, 10); i++) {
    const line = lines[i].trim();
    if (line.includes('Amazon Web Services Statement')) {
      title = line;
      break;
    }
  }

  lines.forEach((line, index) => {
    const accountNumberMatch = line.match(/Account number:/i);
    if (accountNumberMatch) {
      accountNumber = lines[index + 1].trim(); // Capturing the next line for the account number
    }

    const statementNumberMatch = line.match(/Statement Number:/i);
    if (statementNumberMatch) {
      statementNumber = line.split(':')[1].trim();
    }

    const statementDateMatch = line.match(/Statement Date:/i);
    if (statementDateMatch) {
      statementDate = line.split(':')[1].trim();
    }

    const keyValuePairMatch = line.match(/(.+?):\s*(.+)/);
    if (keyValuePairMatch && !line.toLowerCase().includes('please note') && !line.toLowerCase().includes('https://')) {
      keyValuePairs.push({ key: keyValuePairMatch[1].trim(), value: keyValuePairMatch[2].trim() });
    }

    if (line.match(/Activity By Account|Summary for Linked Account|Detail for Linked Account|Itemized Charges|Service Charges/)) {
      if (currentTable.length) {
        tables.push(currentTable);
        currentTable = [];
      }
      inTable = true;
      rowIndex = 0;
    }

    if (inTable) {
      if (line.trim() === '' && currentTable.length > 0) {
        tables.push(currentTable);
        currentTable = [];
        inTable = false;
      } else {
        const columns = line.trim().split(/\s{2,}/);

        if (columns.length === 1) {
          const match = columns[0].match(amountRegex);
          if (match) {
            let amount = `$${match[1]}`;
            const description = columns[0].replace(match[0], '').trim();
            currentTable.push([description, amount]);
          } else {
            currentTable.push([columns[0], '']);
          }
        } else if (columns.length >= 2) {
          let description = columns.slice(0, -1).join(' ').trim();
          let amount = columns[columns.length - 1].trim();
          amount = amount.replace(cleanDollarRegex, '$');
          if (!amount.startsWith('$')) {
            amount = `$${amount}`;
          }
          const embeddedMatch = description.match(amountRegex);
          if (embeddedMatch) {
            amount = `$${embeddedMatch[1]}`;
            description = description.replace(embeddedMatch[0], '').trim();
          }
          currentTable.push([description, amount]);
        }

        if (rowIndex === 9) { // Check if current row is Sr. No. 10
          tables.push(currentTable);
          currentTable = [];
        }
        rowIndex++;
      }
    }
  });

  if (currentTable.length) {
    tables.push(currentTable);
  }

  tables = tables.map(table => table.filter(row => row[1].trim() !== ''));

  return { title, tables, keyValuePairs, accountNumber, statementNumber, statementDate };
};

app.post('/upload', upload.single('file'), async (req, res) => {
  try {
    const dataBuffer = fs.readFileSync(req.file.path);
    const data = await pdfParse(dataBuffer);
    const extractedContent = extractContent(data.text);
    console.log('Extracted Content:', extractedContent);
    res.json(extractedContent);
  } catch (error) {
    res.status(500).json({ error: 'Failed to parse PDF' });
  }
});

app.post('/execute', upload.single('file'), async (req, res) => {
  try {
    const dataBuffer = fs.readFileSync(req.file.path);
    const data = await pdfParse(dataBuffer);
    res.json({ text: data.text });
  } catch (error) {
    res.status(500).json({ error: 'Failed to execute custom code' });
  }
});

app.post('/check', async (req, res) => {
  const { accountNumber, statementNumber } = req.body;

  try {
    const checkQuery = `
      SELECT 1 FROM filename 
      WHERE account_number = $1 AND statement_number = $2
    `;
    const checkResult = await pool.query(checkQuery, [accountNumber, statementNumber]);

    if (checkResult.rowCount > 0) {
      res.json({ exists: true });
    } else {
      res.json({ exists: false });
    }
  } catch (error) {
    console.error('Error checking for duplicate entry:', error);
    res.status(500).json({ error: 'Failed to check for duplicate entry' });
  }
});

app.post('/save', async (req, res) => {
  const client = await pool.connect();
  try {
    const { filename, tables, accountNumber, statementNumber, statementDate, title } = req.body;

    if (!accountNumber || !statementNumber || !statementDate || !title) {
      return res.status(400).json({ error: 'Missing required fields.' });
    }

    await client.query('BEGIN');

    const filenameQuery = `
      INSERT INTO filename (filename, account_number, statement_number, statement_date, title)
      VALUES ($1, $2, $3, $4, $5)
      ON CONFLICT (statement_number) DO NOTHING
    `;
    const filenameValues = [filename, accountNumber, statementNumber, statementDate, title];
    await client.query(filenameQuery, filenameValues);

    const statementDetailsQuery = `
      INSERT INTO statement_details (statement_number, sr_no, description, amount)
      VALUES ($1, $2, $3, $4)
    `;
    for (let i = 0; i < tables.length; i++) {
      for (let j = 0; j < tables[i].length; j++) {
        const statementDetailsValues = [statementNumber, j + 1, tables[i][j][0].trim(), tables[i][j][1].trim()];
        console.log('Inserting row:', statementDetailsValues); // Log each row being inserted
        await client.query(statementDetailsQuery, statementDetailsValues);
      }
    }

    await client.query('COMMIT');

    res.status(200).json({ message: 'Data saved successfully' });
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Error saving data:', error);
    res.status(500).json({ error: `Failed to save data: ${error.message}` });
  } finally {
    client.release();
  }
});

// Endpoint to get audit logs
app.get('/api/audit-logs', (req, res) => {
  fs.readFile(path.join(__dirname, 'audit.log'), 'utf8', (err, data) => {
      if (err) {
        console.error('Failed to read log file:', err);
        return res.status(500).json({ error: 'Failed to read log file' });
      }
      const logs = data.split('\n').filter(line => line).map(line => {
        const parts = line.split(' - ');
        if (parts.length < 3) {
          return null; // Skip lines that don't have the expected format
        }
        const [timestamp, host, methodUrl] = parts;
        const [method, url] = methodUrl.split(' ');
        return { timestamp, host, method, url };
      }).filter(log => log !== null); // Filter out any null entries
      res.json(logs);
    });
  });
  
  const PORT = 3001;
  app.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
  });