import { useState } from 'react';
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
    const [email] = useState(isAnonymous ? `anonymous_${Math.floor(Math.random() * 10000)}@example.com` : userEmail);

    const [complaint, setComplaint] = useState('');
    const [subject, setSubject] = useState('');
    const [priority, setPriority] = useState('');
    const [isPaymentIssue, setIsPaymentIssue] = useState(false);
    const [isSubmitting, setIsSubmitting] = useState(false);

    const handleSubmit = async (e) => {
        e.preventDefault();
        setIsSubmitting(true);

        try {
            let userId = null;

            if (!isAnonymous) {
                // Get user_id from the user table based on email
                const { data: usrData, error: usrError } = await supabase
                    .from('user')
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
                .from('user')
                .select('user_id')
                .eq('role', 'representative')
                .maybeSingle(); // Get one representative, or null if none exist

            const assignedRepId = repData?.user_id || 0; // Default to 0 or null if no rep found

            if (repError) {
                console.warn('Error fetching representative:', repError);
                // We proceed even if assigning fails, maybe log it
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
                        is_payment_issue: isPaymentIssue,
                        status: 'new',
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
                setPriority('');
                setIsPaymentIssue(false);
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
                        )}

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

                                    {/* Subject Field */}
                                    <div className="mb-4">
                                        <label htmlFor="subject" className="form-label fw-semibold">
                                            Subject <span className="text-danger">*</span>
                                        </label>
                                        <input
                                            type="text"
                                            className="form-control"
                                            id="subject"
                                            placeholder="Brief description of your concern"
                                            value={subject}
                                            onChange={(e) => setSubject(e.target.value)}
                                            required
                                        />
                                    </div>

                                    {/* Priority Dropdown */}
                                    {/* <div className="mb-4">
                                        <label htmlFor="priority" className="form-label fw-semibold">
                                            Priority Level
                                        </label>
                                        <select
                                            className="form-select"
                                            id="priority"
                                            value={priority}
                                            onChange={(e) => setPriority(e.target.value)}
                                        >
                                            <option value="">Select Priority (Optional)</option>
                                            <option value="low">🟢 Low</option>
                                            <option value="medium">🟡 Medium</option>
                                            <option value="high">🟠 High</option>
                                            <option value="urgent">🔴 Urgent</option>
                                        </select>
                                    </div> */}

                                    {/* Payment Issue Checkbox */}
                                    <div className="mb-4">
                                        <div className="form-check custom-checkbox">
                                            <input
                                                className="form-check-input"
                                                type="checkbox"
                                                id="paymentIssue"
                                                checked={isPaymentIssue}
                                                onChange={(e) => setIsPaymentIssue(e.target.checked)}
                                            />
                                            <label className="form-check-label fw-semibold" htmlFor="paymentIssue">
                                                💰 This is a payment-related issue
                                            </label>
                                        </div>
                                    </div>

                                    {/* Complaint Field */}
                                    <div className="mb-4">
                                        <label htmlFor="complaint" className="form-label fw-semibold">
                                            Detailed Concern <span className="text-danger">*</span>
                                        </label>
                                        <textarea
                                            className="form-control"
                                            id="complaint"
                                            rows="6"
                                            placeholder="Please provide detailed information about your concern..."
                                            value={complaint}
                                            onChange={(e) => setComplaint(e.target.value)}
                                            required
                                        ></textarea>
                                        <div className="form-text">
                                            {complaint.length} characters
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
