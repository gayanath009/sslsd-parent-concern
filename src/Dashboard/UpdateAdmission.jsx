import { useState, useRef, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../../SupabaseClient';
import * as XLSX from 'xlsx';
import './AdminDashboard.css';

function UpdateAdmission() {
    const navigate = useNavigate();
    const fileInputRef = useRef(null);

    const [fileName, setFileName] = useState('');
    const [previewData, setPreviewData] = useState([]);
    const [isUploading, setIsUploading] = useState(false);
    const [statusMessage, setStatusMessage] = useState('');
    const [statusType, setStatusType] = useState(''); // 'success' | 'error' | 'info'
    const [authChecked, setAuthChecked] = useState(false);

    // Auth + role guard — runs on mount
    useEffect(() => {
        const checkAuth = async () => {
            const { data: { session } } = await supabase.auth.getSession();
            if (!session) {
                navigate('/login');
                return;
            }

            // Verify the logged-in user is an admin
            const { data: userRecord } = await supabase
                .from('appusers')
                .select('role')
                .eq('email', session.user.email)
                .maybeSingle();

            if (!userRecord || userRecord.role !== 'admin') {
                navigate('/dashboard');
                return;
            }

            setAuthChecked(true);
        };
        checkAuth();
    }, [navigate]);

    // Show spinner while verifying auth
    if (!authChecked) {
        return (
            <div className="d-flex justify-content-center align-items-center" style={{ minHeight: '100vh' }}>
                <div className="spinner-border text-primary" role="status">
                    <span className="visually-hidden">Loading...</span>
                </div>
            </div>
        );
    }

    const handleFileChange = (e) => {
        const file = e.target.files[0];
        if (!file) return;

        if (!file.name.match(/\.(xlsx|xls)$/i)) {
            setStatusMessage('❌ Please select a valid Excel file (only .xlsx or .xls)');
            setStatusType('error');
            return;
        }

        setFileName(file.name);
        setStatusMessage('');
        setPreviewData([]);

        const reader = new FileReader();
        reader.onload = (evt) => {
            try {
                const workbook = XLSX.read(evt.target.result, { type: 'binary' });
                const sheetName = workbook.SheetNames[0];
                const worksheet = workbook.Sheets[sheetName];
                const jsonData = XLSX.utils.sheet_to_json(worksheet, { header: 1, defval: '' });

                if (jsonData.length < 2) {
                    setStatusMessage('❌ The file appears to be empty or has no data rows.');
                    setStatusType('error');
                    return;
                }

                // Show preview (first 10 rows, skipping header)
                const rows = jsonData.slice(1).filter(row => row[0] !== '' || row[1] !== '');
                setPreviewData(rows.slice(0, 10));
                setStatusMessage(`✅ File loaded: ${rows.length} record(s) found. Preview shows the first 10.`);
                setStatusType('info');
            } catch (err) {
                setStatusMessage('❌ Failed to read the Excel file. Please check the format.');
                setStatusType('error');
            }
        };
        reader.readAsBinaryString(file);
    };

    const handleUpload = async () => {
        const file = fileInputRef.current?.files[0];
        if (!file) {
            setStatusMessage('❌ Please select an Excel file first.');
            setStatusType('error');
            return;
        }

        const confirmed = window.confirm(
            '⚠️ This will delete all existing admission records and insert the new ones from the file.\n\n Are you sure you want to continue?'
        );
        if (!confirmed) return;

        setIsUploading(true);
        setStatusMessage('⏳ Processing...');
        setStatusType('info');

        const reader = new FileReader();
        reader.onload = async (evt) => {
            try {
                const workbook = XLSX.read(evt.target.result, { type: 'binary' });
                const sheetName = workbook.SheetNames[0];
                const worksheet = workbook.Sheets[sheetName];
                const jsonData = XLSX.utils.sheet_to_json(worksheet, { header: 1, defval: '' });

                // Skip header row, filter empty rows
                const dataRows = jsonData.slice(1).filter(row => row[0] !== '' || row[1] !== '');

                if (dataRows.length === 0) {
                    setStatusMessage('❌ No valid data rows found in the file.');
                    setStatusType('error');
                    setIsUploading(false);
                    return;
                }

                // Step 1: Purge all existing records
                setStatusMessage('⏳ Deleting existing admission records...');
                const { error: deleteError } = await supabase
                    .from('admission')
                    .delete()
                    .neq('id', 0);

                if (deleteError) {
                    const { error: deleteError2 } = await supabase
                        .from('admission')
                        .delete()
                        .gte('id', 0);

                    if (deleteError2) {
                        console.error('Delete error:', deleteError2);
                        setStatusMessage(`❌ Failed to clear existing records: ${deleteError2.message}`);
                        setStatusType('error');
                        setIsUploading(false);
                        return;
                    }
                }

                // Step 2: Prepare insert payload
                // Excel columns: Column A = Id, Column B = admsn_no
                const insertPayload = dataRows
                    .map(row => ({
                        id: row[0],
                        admsn_no: String(row[1]).trim()
                    }))
                    .filter(r => r.id !== '' && r.admsn_no !== '');

                if (insertPayload.length === 0) {
                    setStatusMessage('❌ No valid records to insert. Check that columns A (Id) and B (admsn_no) have data.');
                    setStatusType('error');
                    setIsUploading(false);
                    return;
                }

                // Step 3: Insert in batches of 500
                const BATCH_SIZE = 500;
                let inserted = 0;
                for (let i = 0; i < insertPayload.length; i += BATCH_SIZE) {
                    const batch = insertPayload.slice(i, i + BATCH_SIZE);
                    const { error: insertError } = await supabase
                        .from('admission')
                        .insert(batch);

                    if (insertError) {
                        console.error('Insert error:', insertError);
                        setStatusMessage(`❌ Failed to insert records: ${insertError.message}`);
                        setStatusType('error');
                        setIsUploading(false);
                        return;
                    }
                    inserted += batch.length;
                    setStatusMessage(`⏳ Inserting... ${inserted} / ${insertPayload.length} records done.`);
                }

                setStatusMessage(`✅ Success! ${inserted} admission record(s) have been uploaded.`);
                setStatusType('success');
                setPreviewData([]);
                setFileName('');
                if (fileInputRef.current) fileInputRef.current.value = '';

            } catch (err) {
                console.error('Unexpected error:', err);
                setStatusMessage('❌ An unexpected error occurred: ' + err.message);
                setStatusType('error');
            } finally {
                setIsUploading(false);
            }
        };
        reader.readAsBinaryString(file);
    };

    const handleBack = () => {
        navigate('/dashboard');
    };

    return (
        <div className="admin-dashboard-container">
            {/* Navbar — same as AdminDashboard */}
            <nav className="navbar navbar-expand-lg navbar-dark bg-gradient">
                <div className="container-fluid">
                    <span className="navbar-brand mb-0 h1">🎓 Update Admission Numbers</span>
                    <button onClick={handleBack} className="btn btn-outline-light logout-btn">
                        Admin Dashboard
                    </button>
                </div>
            </nav>

            <div className="container-fluid py-4">
                {/* Page Header */}
                <div className="row mb-4">
                    <div className="col-12">
                        <div className="card shadow">
                            <div className="card-body">
                                <h2 className="mb-0">Upload Admission Numbers</h2>
                                <p className="text-muted mb-0"></p>
                            </div>
                        </div>
                    </div>
                </div>

                <div className="row justify-content-center">
                    <div className="col-lg-8">


                        <div className="card shadow mb-4">
                            <div className="card-body">
                                <h5 className="mb-3">📋 Instructions</h5>
                                <ul className="mb-0" style={{ lineHeight: '2' }}>
                                    <li>Upload an Excel file to refresh the admission numbers in the system</li>
                                    <li>Prepare an Excel file <strong>(.xlsx or .xls)</strong> with exactly <strong>2 columns</strong>:</li>
                                    <ul>
                                        <li><strong>Column A</strong> → (numeric ID)</li>
                                        <li><strong>Column B</strong> → (admission number)</li>
                                    </ul>
                                    <li>The <strong>first row</strong> should be a header row — it will be skipped automatically.</li>
                                    <li>
                                        <span className="text-danger fw-semibold">⚠️ Note:</span> All existing admission records will be purged before the new data is inserted.
                                    </li>
                                </ul>
                            </div>
                        </div>

                        {/* Upload Card */}
                        <div className="card shadow">
                            <div className="card-body p-4">

                                {/* File Input */}
                                <div className="mb-4">
                                    <label className="form-label fw-semibold" htmlFor="excelFile">
                                        Select Excel File <span className="text-danger">*</span>
                                    </label>
                                    <input
                                        ref={fileInputRef}
                                        type="file"
                                        className="form-control"
                                        id="excelFile"
                                        accept=".xlsx,.xls"
                                        onChange={handleFileChange}
                                    />
                                    {fileName && (
                                        <div className="form-text mt-1 text-muted">
                                            📄 Selected: <strong>{fileName}</strong>
                                        </div>
                                    )}
                                </div>

                                {/* Status Message */}
                                {statusMessage && (
                                    <div
                                        className={`alert mb-4 ${statusType === 'success'
                                            ? 'alert-success'
                                            : statusType === 'error'
                                                ? 'alert-danger'
                                                : 'alert-info'}`}
                                        role="alert"
                                    >
                                        {statusMessage}
                                    </div>
                                )}

                                {/* Preview Table */}
                                {previewData.length > 0 && (
                                    <div className="mb-4">
                                        <h6 className="mb-3">👁️ Preview (first 10 rows)</h6>
                                        <div className="table-responsive">
                                            <table className="table table-hover">
                                                <thead>
                                                    <tr>
                                                        <th style={{ width: '50%' }}>Id (Column A)</th>
                                                        <th style={{ width: '50%' }}>admsn_no (Column B)</th>
                                                    </tr>
                                                </thead>
                                                <tbody>
                                                    {previewData.map((row, idx) => (
                                                        <tr key={idx}>
                                                            <td>{row[0]}</td>
                                                            <td>{row[1]}</td>
                                                        </tr>
                                                    ))}
                                                </tbody>
                                            </table>
                                        </div>
                                    </div>
                                )}

                                {/* Action Buttons */}
                                <div className="d-flex gap-3 justify-content-end">
                                    <button
                                        type="button"
                                        className="btn btn-secondary"
                                        onClick={handleBack}
                                        disabled={isUploading}
                                    >
                                        Cancel
                                    </button>
                                    <button
                                        type="button"
                                        className="btn btn-warning fw-semibold"
                                        onClick={handleUpload}
                                        disabled={isUploading || !fileName}
                                    >
                                        {isUploading ? (
                                            <>
                                                <span className="spinner-border spinner-border-sm me-2" role="status" aria-hidden="true"></span>
                                                Uploading...
                                            </>
                                        ) : (
                                            '📤 Upload Admission Nos'
                                        )}
                                    </button>
                                </div>

                            </div>
                        </div>

                    </div>
                </div>
            </div>
        </div>
    );
}

export default UpdateAdmission;
