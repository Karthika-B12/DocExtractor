# DocExtractor

## Introduction

### About the Project
This project is a foundational-level website designed to streamline the process of managing invoice data. It allows users to:
- Upload PDF invoices.
- Extract and review their contents.
- Edit and store the updated information in a PostgreSQL database.

The system integrates local server-based web technologies and database operations, ensuring efficient handling of file uploads, content processing, and data storage.

### Purpose of the Project
The primary goals of this project are to:
- Automate the extraction of invoice details from uploaded PDF files.
- Enable users to edit extracted data directly on the website.
- Store and manage changes in a robust PostgreSQL database for future reference.

This approach eliminates manual data entry, ensuring an efficient, error-free process for managing invoice information.

---

## Tools and Technologies

### Frontend
- **React (v18.3.1)**: User interface components and state management.
- **React Router (v7.0.2)**: Application routing.
- **CSS**: Styling components and layout.
- **React Icons (v5.4.0)**: Adding icons to the application.

### Backend
- **Node.js (v22.12.0)**: Running server-side code.
- **Express.js (v4.21.2)**: HTTP requests and routing.
- **Multer (v1.4.5)**: Managing file uploads.
- **pdf-parse (v1.1.1)**: Extracting contents from uploaded PDFs.
- **Cors (v2.8.5)**: Cross-Origin Resource Sharing.
- **File System (fs)**: Node.js module for file operations.

### Database
- **PostgreSQL (v17.2)**: Storing and managing invoice data.
- **pg (v8.13.1)**: PostgreSQL database interactions.

### Development Tools
- **Visual Studio Code (v1.96.2)**: Code editor.
- **Postman**: API endpoint testing.

### Other Tools
- **FileReader API**: Reading PDF contents on the client side.
- **Python (v3.12.3)**: Additional backend processing.

---

## Hardware Requirements

- **Development Machine**: Laptop
  - Processor: 12th Gen Intel(R) Core(TM) i5-1235U, 1.30 GHz
  - OS Version: Windows 10.0.22631 Build 22631
  - Installed RAM: 16 GB

---

## Web Pages

1. **Login Page**: User authentication via username and password.
2. **Landing Page**: Main hub with navigation to different sections.
3. **Upload PDFs Page**: 
   - Upload and process PDF invoices.
   - View extracted data in Full View or Summary View.
   - Edit and save data to the database.
4. **Audit Logs Page**: View server interaction logs (Hostname, Time, Date).

---

## Database Design

### Database Used
- **PostgreSQL (v17.2)**

### Tables
1. **Filename Table**: Metadata for uploaded files.
2. **Statement Details Table**: Metadata for extracted invoice contents.

---

## Deployment Instructions

### Prerequisites
Ensure the following are installed:
- Node.js (v22.12.0)
- Python (v3.12.3)
- PostgreSQL (v17.2)
- Git (version control)

### Step-by-Step Guide
1. **Clone the Repository**
   ```bash
   git clone <repository-url>
