import { useState, useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useUser } from '../context/UserContext';
import { supabase } from '../../SupabaseClient';
import './Complaints.css';

function Complaints() {
    const navigate = useNavigate();
    const location = useLocation();
    const { isAnonymous } = location.state || {}; // Check if user is anonymous
    const { email: userEmail, name: userName } = useUser();

    // Set initial values based on anonymous status
    const [name] = useState(isAnonymous ? 'Anonymous' : userName);
    //const [email] = useState(isAnonymous ? `anonymous_${Math.floor(Math.random() * 10000)}@example.com` : userEmail);
    const [email] = useState(isAnonymous ? `anonymous@example.com` : userEmail);

    const [complaint, setComplaint] = useState('');
    const [subject, setSubject] = useState('');
    // const [priority, setPriority] = useState(''); // Removed as per new requirement
    // const [isPaymentIssue, setIsPaymentIssue] = useState(false); // Removed as per new requirement
    const [isSubmitting, setIsSubmitting] = useState(false);

    // New State Variables
    const [complaintType, setComplaintType] = useState('');
    const [contactNumber, setContactNumber] = useState('');
    const [studentName, setStudentName] = useState('');
    const [studentNo, setStudentNo] = useState('');
    const [grade, setGrade] = useState('');
    const [section, setSection] = useState('');
    const [complaintTypesList, setComplaintTypesList] = useState([]);
    const [contactError, setContactError] = useState('');

    // Fetch Complaint Types


    useEffect(() => {
        const fetchComplaintTypes = async () => {
            const { data, error } = await supabase
                .from('complaint_typ')
                .select('typ_name');

            if (error) {
                console.error('Error fetching complaint types:', error);
            } else {
                setComplaintTypesList(data || []);
            }
        };

        fetchComplaintTypes();
    }, []);

    const handleContactChange = (e) => {
        const value = e.target.value;
        const regex = /^[0-9]*$/; // Allow only numbers
        if (regex.test(value)) {
            setContactNumber(value);

            if (value.length > 0 && value.length !== 8) {
                setContactError('Contact number must be 8 digits');
            } else {
                setContactError('');
            }
        }
    };

    const handleSubmit = async (e) => {
        e.preventDefault();

        if (contactError || contactNumber.length !== 8) {
            alert('Please enter a valid 8-digit contact number.');
            return;
        }

        setIsSubmitting(true);

        try {
            let userId = null;

            if (!isAnonymous) {
                // Get user_id from the user table based on email
                const { data: usrData, error: usrError } = await supabase
                    .from('appusers')
                    .select('user_id')
                    .eq('email', email)
                    .single();

                console.log("Supabase user:", usrData?.user_id);

                if (usrError) {
                    console.error('Error fetching user data:', usrError);
                    alert('Error: Could not find user information. Please try again.');
                    setIsSubmitting(false);
                    return;
                }
                userId = usrData?.user_id;
            }

            // Fetch a representative to assign the complaint to
            const { data: repData, error: repError } = await supabase
                .from('appusers')
                .select('user_id')
                .eq('role', 'representative')
                .eq('grade', grade)
                .maybeSingle(); // Get one representative, or null if none exist

            const assignedRepId = repData?.user_id || 0; // Default to 0 or null if no rep found

            if (repError) {
                console.warn('Error fetching representative:', repError);
            }

            // Insert complaint into the complaint table
            const { data, error } = await supabase
                .from('complaint')
                .insert([
                    {
                        user_id: userId,
                        title: subject,
                        description: complaint,
                        priority: null,
                        is_payment_issue: false,
                        type: complaintType,
                        contact_number: contactNumber,
                        student_name: studentName,
                        student_no: studentNo,
                        grade: grade,
                        section: section,
                        stat_code: 1, // 'Initiated'                        
                        created_at: new Date().toISOString(),
                        cmplt_with_userid: assignedRepId
                    }
                ])
                .select();

            if (error) {
                console.error('Error submitting complaint:', error);
                alert('Error submitting complaint. Please try again.');
            } else {
                console.log('Complaint submitted successfully:', data);
                alert('✅ Complaint submitted successfully!');
                // Reset form
                setComplaint('');
                setSubject('');
                setComplaintType('');
                setContactNumber('');
                setStudentName('');
                setStudentNo('');
                setGrade('');
                setSection('');
                // Navigate back to dashboard
                navigate('/dashboard');
            }
        } catch (error) {
            console.error('Unexpected error:', error);
            alert('An unexpected error occurred. Please try again.');
        } finally {
            setIsSubmitting(false);
        }
    };

    const handleBack = () => {
        navigate('/dashboard');
    };

    const homeBack = () => {
        navigate('/');
    };

    const handleViewComplaints = () => {
        navigate('/complaints-list');
    };

    return (
        <div className='complaints-container'>
            {/* Navigation Bar */}
            <nav className="navbar navbar-expand-lg navbar-dark bg-gradient">
                <div className="container-fluid">
                    <span className="navbar-brand mb-0 h1">👪 Parent Portal</span>
                    <div className="d-flex gap-2">
                        {/* <button onClick={handleViewComplaints} className='btn btn-outline-light view-btn'>
                            View My Complaints
                        </button> */}

                        {!isAnonymous && (
                            <button onClick={handleBack} className='btn btn-outline-light back-btn'>
                                Back to Dashboard
                            </button>
                        )}  {
                            isAnonymous && <button onClick={homeBack} className='btn btn-outline-light back-btn'>
                                Back to Home
                            </button>
                        }

                    </div>
                </div>
            </nav>

            {/* Main Content */}
            <div className="container py-5">
                <div className="row justify-content-center">
                    <div className="col-lg-8">
                        {/* Header Card */}
                        <div className="card header-card shadow-lg mb-4">
                            <div className="card-body p-4">
                                <h1 className="card-title mb-2">📢 Submit Your Concern</h1>
                                <p className="card-text text-muted">
                                    We value your feedback. Please share your concerns and we'll address them promptly.
                                </p>
                            </div>
                        </div>

                        {/* Form Card */}
                        <div className="card form-card shadow-lg">
                            <div className="card-body p-5">
                                <form onSubmit={handleSubmit}>
                                    {/* User Info Display */}
                                    <div className="row mb-4">
                                        <div className="col-md-6 mb-3 mb-md-0">
                                            <label className="form-label text-muted fw-semibold">Name</label>
                                            <input
                                                type="text"
                                                className="form-control"
                                                value={name || ''}
                                                disabled
                                            />
                                        </div>
                                        <div className="col-md-6">
                                            <label className="form-label text-muted fw-semibold">Email</label>
                                            <input
                                                type="email"
                                                className="form-control"
                                                value={email || ''}
                                                disabled
                                            />
                                        </div>
                                    </div>

                                    {/* Student Details Section */}
                                    <div className="row mb-4">
                                        <div className="col-md-6 mb-3">
                                            <label htmlFor="studentName" className="form-label fw-semibold">
                                                Student Name <span className="text-danger">*</span>
                                            </label>
                                            <input
                                                type="text"
                                                className="form-control"
                                                id="studentName"
                                                value={studentName}
                                                onChange={(e) => setStudentName(e.target.value)}
                                                required
                                            />
                                        </div>
                                        <div className="col-md-6 mb-3">
                                            <label htmlFor="studentNo" className="form-label fw-semibold">
                                                Student Admission No <span className="text-danger">*</span>
                                            </label>
                                            <input
                                                type="text"
                                                className="form-control"
                                                id="studentNo"
                                                value={studentNo}
                                                onChange={(e) => setStudentNo(e.target.value)}
                                                required
                                            />
                                        </div>
                                        <div className="col-md-6 mb-3">
                                            <label htmlFor="grade" className="form-label fw-semibold">
                                                Grade <span className="text-danger">*</span>
                                            </label>
                                            <select
                                                className="form-select"
                                                id="grade"
                                                value={grade}
                                                onChange={(e) => setGrade(e.target.value)}
                                                required
                                            >
                                                <option value="">Select Grade</option>
                                                <option value="L">LR</option>
                                                <option value="U">UR</option>
                                                {[...Array(13)].map((_, i) => (
                                                    <option key={i + 1} value={`${i + 1}`}>Grade {i + 1}</option>
                                                ))}
                                            </select>
                                        </div>
                                        <div className="col-md-6 mb-3">
                                            <label htmlFor="section" className="form-label fw-semibold">
                                                Section <span className="text-danger">*</span>
                                            </label>
                                            <select
                                                className="form-select"
                                                id="section"
                                                value={section}
                                                onChange={(e) => setSection(e.target.value)}
                                                required
                                            >
                                                <option value="">Select Section</option>
                                                {['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I'].map((sec) => (
                                                    <option key={sec} value={sec}>{sec}</option>
                                                ))}
                                            </select>
                                        </div>
                                    </div>

                                    {/* Contact & Type Section */}
                                    <div className="row mb-4">
                                        <div className="col-md-6 mb-3">
                                            <label htmlFor="contactNumber" className="form-label fw-semibold">
                                                Contact Number <span className="text-danger">*</span>
                                            </label>
                                            <input
                                                type="tel"
                                                className={`form-control ${contactError ? 'is-invalid' : ''}`}
                                                id="contactNumber"
                                                value={contactNumber}
                                                onChange={handleContactChange}
                                                placeholder="XXXXXXXX"
                                                required
                                            />
                                            {contactError && <div className="invalid-feedback">{contactError}</div>}
                                        </div>
                                        <div className="col-md-6 mb-3">
                                            <label htmlFor="complaintType" className="form-label fw-semibold">
                                                Complaint Type <span className="text-danger">*</span>
                                            </label>
                                            <select
                                                className="form-select"
                                                id="complaintType"
                                                value={complaintType}
                                                onChange={(e) => setComplaintType(e.target.value)}
                                                required
                                            >
                                                <option value="">Select Type</option>
                                                {complaintTypesList.map((type) => (
                                                    <option key={type.typ_name} value={type.typ_name}>
                                                        {type.typ_name}
                                                    </option>
                                                ))}
                                            </select>
                                        </div>
                                    </div>

                                    {/* Subject Field */}
                                    <div className="mb-4">
                                        <label htmlFor="subject" className="form-label fw-semibold">
                                            Title <span className="text-danger">*</span>
                                        </label>
                                        <input
                                            type="text"
                                            className="form-control"
                                            id="subject"
                                            placeholder="Brief title of your concern"
                                            value={subject}
                                            onChange={(e) => setSubject(e.target.value)}
                                            required
                                            maxLength={100}
                                        />
                                    </div>

                                    {/* Complaint Field */}
                                    <div className="mb-4">
                                        <label htmlFor="complaint" className="form-label fw-semibold">
                                            Description <span className="text-danger">*</span>
                                        </label>
                                        <textarea
                                            className="form-control"
                                            id="complaint"
                                            rows="8"
                                            placeholder="Please provide detailed information about your concern..."
                                            value={complaint}
                                            onChange={(e) => setComplaint(e.target.value)}
                                            required
                                            maxLength={3000}
                                        ></textarea>
                                        <div className="form-text text-end">
                                            {3000 - complaint.length} characters remaining
                                        </div>
                                    </div>

                                    {/* Action Buttons */}
                                    <div className="d-flex gap-3 justify-content-end">

                                        {!isAnonymous && (
                                            <button
                                                type="button"
                                                onClick={handleBack}
                                                className="btn btn-secondary cancel-btn"
                                                disabled={isSubmitting}
                                            >
                                                Cancel
                                            </button>
                                        )}

                                        <button
                                            type="submit"
                                            className="btn btn-primary submit-btn"
                                            disabled={isSubmitting}
                                        >
                                            {isSubmitting ? (
                                                <>
                                                    <span className="spinner-border spinner-border-sm me-2" role="status" aria-hidden="true"></span>
                                                    Submitting...
                                                </>
                                            ) : (
                                                '📤 Submit Concern'
                                            )}
                                        </button>
                                    </div>
                                </form>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}

export default Complaints;
