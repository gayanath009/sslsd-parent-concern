import { useEffect, useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import * as XLSX from 'xlsx';
import { supabase } from '../../SupabaseClient';
import { useUser } from '../context/UserContext';
import './ConcernAnalytics.css';

// Safe date parsers that avoid timezone/string parsing discrepancies across browsers
const parseStartOfDay = (dateStr) => {
    if (!dateStr) return new Date(2020, 0, 1, 0, 0, 0, 0);
    const parts = dateStr.split('-').map(Number);
    if (parts.length !== 3 || parts.some(isNaN)) return new Date(2020, 0, 1, 0, 0, 0, 0);
    return new Date(parts[0], parts[1] - 1, parts[2], 0, 0, 0, 0);
};

const parseEndOfDay = (dateStr) => {
    if (!dateStr) return new Date(2099, 11, 31, 23, 59, 59, 999);
    const parts = dateStr.split('-').map(Number);
    if (parts.length !== 3 || parts.some(isNaN)) return new Date(2099, 11, 31, 23, 59, 59, 999);
    return new Date(parts[0], parts[1] - 1, parts[2], 23, 59, 59, 999);
};

export default function ConcernAnalytics() {
    const navigate = useNavigate();
    const { name, role } = useUser();

    const [allComplaints, setAllComplaints] = useState([]);
    const [loading, setLoading] = useState(true);

    // Filter states
    const [timePreset, setTimePreset] = useState('all'); // Default to 'all' so data is immediately visible
    const [startDate, setStartDate] = useState('2020-01-01');
    const [endDate, setEndDate] = useState(() => new Date().toISOString().split('T')[0]);
    const [statusFilter, setStatusFilter] = useState('all'); // 'all', 'new', 'forwarded', 'open', 'closed'
    const [priorityFilter, setPriorityFilter] = useState('all'); // 'all', 'urgent', 'high', 'medium', 'low'
    const [typeFilter, setTypeFilter] = useState('all');
    const [searchQuery, setSearchQuery] = useState('');

    const [hoveredBar, setHoveredBar] = useState(null);
    const [hoveredDonut, setHoveredDonut] = useState(null);

    useEffect(() => {
        fetchComplaints();
    }, []);

    const fetchComplaints = async () => {
        setLoading(true);
        try {
            const { data, error } = await supabase
                .from('complaint')
                .select('*')
                .order('created_at', { ascending: true });

            if (error) {
                console.error('Error fetching complaints:', error);
                setAllComplaints([]);
            } else {
                setAllComplaints(data || []);
            }
        } catch (err) {
            console.error('Unexpected error fetching complaints:', err);
        } finally {
            setLoading(false);
        }
    };

    // Preset time range selection
    const handlePresetChange = (preset) => {
        setTimePreset(preset);
        const today = new Date();
        const endStr = today.toISOString().split('T')[0];
        setEndDate(endStr);

        let start = new Date();
        if (preset === '7d') {
            start.setDate(today.getDate() - 7);
            setStartDate(start.toISOString().split('T')[0]);
        } else if (preset === '30d') {
            start.setDate(today.getDate() - 30);
            setStartDate(start.toISOString().split('T')[0]);
        } else if (preset === '90d') {
            start.setDate(today.getDate() - 90);
            setStartDate(start.toISOString().split('T')[0]);
        } else if (preset === 'year') {
            const startOfYear = new Date(today.getFullYear(), 0, 1);
            setStartDate(startOfYear.toISOString().split('T')[0]);
        } else if (preset === 'all') {
            setStartDate('2020-01-01');
        }
    };

    // Category helper for status codes
    const getStatusCategory = (code) => {
        if (code === 1) return 'new'; // Initiated by Parent
        if (code === 3) return 'forwarded'; // Forwarded to Principal / With Principal
        if (code === 2 || code === 4 || code === 6 || code === 9) return 'open'; // Open / In Progress
        if (code === 5 || code === 7) return 'closed'; // Closed
        return 'other';
    };

    const getStatusBadgeLabel = (code) => {
        switch (code) {
            case 1: return { text: 'Initiated By Parent', className: 'badge-status-new' };
            case 3: return { text: 'With Principal', className: 'badge-status-fwd' };
            case 2:
            case 4:
            case 6:
            case 9: return { text: 'Open / In Progress', className: 'badge-status-open' };
            case 5:
            case 7: return { text: 'Closed', className: 'badge-status-closed' };
            default: return { text: `Status ${code}`, className: 'bg-secondary' };
        }
    };

    // Available unique concern types from data
    const availableTypes = useMemo(() => {
        const types = new Set();
        allComplaints.forEach((c) => {
            if (c.type) types.add(c.type);
        });
        return Array.from(types);
    }, [allComplaints]);

    // Apply Time, Status, Priority, Type and Search Filters
    const filteredComplaints = useMemo(() => {
        if (!allComplaints || allComplaints.length === 0) return [];
        const start = parseStartOfDay(startDate);
        const end = parseEndOfDay(endDate);

        return allComplaints.filter((c) => {
            // Time filter
            if (c.created_at) {
                const created = new Date(c.created_at);
                if (created < start || created > end) return false;
            }

            // Status filter
            if (statusFilter !== 'all') {
                const cat = getStatusCategory(c.stat_code);
                if (cat !== statusFilter) return false;
            }

            // Priority filter
            if (priorityFilter !== 'all') {
                const p = (c.priority || 'medium').toLowerCase();
                if (p !== priorityFilter.toLowerCase()) return false;
            }

            // Type filter
            if (typeFilter !== 'all') {
                if ((c.type || 'General') !== typeFilter) return false;
            }

            // Search query
            if (searchQuery.trim()) {
                const q = searchQuery.toLowerCase();
                const titleMatch = c.title && c.title.toLowerCase().includes(q);
                const descMatch = c.description && c.description.toLowerCase().includes(q);
                const studentMatch = c.student_name && c.student_name.toLowerCase().includes(q);
                if (!titleMatch && !descMatch && !studentMatch) return false;
            }

            return true;
        });
    }, [allComplaints, startDate, endDate, statusFilter, priorityFilter, typeFilter, searchQuery]);

    // Metrics for summary cards
    const metrics = useMemo(() => {
        let initiatedCount = 0;
        let forwardedCount = 0;
        let openCount = 0;
        let closedCount = 0;

        filteredComplaints.forEach((c) => {
            const cat = getStatusCategory(c.stat_code);
            if (cat === 'new') initiatedCount++;
            else if (cat === 'forwarded') forwardedCount++;
            else if (cat === 'open') openCount++;
            else if (cat === 'closed') closedCount++;
        });

        const total = filteredComplaints.length;
        const resolutionRate = total > 0 ? Math.round((closedCount / total) * 100) : 0;

        return {
            total,
            initiatedCount,
            forwardedCount,
            openCount,
            closedCount,
            resolutionRate
        };
    }, [filteredComplaints]);

    // Timeline data for visual bar graph
    const timelineData = useMemo(() => {
        if (filteredComplaints.length === 0) return [];

        // Group complaints by date (YYYY-MM-DD)
        const dateGroups = {};
        filteredComplaints.forEach((c) => {
            if (!c.created_at) return;
            const d = new Date(c.created_at);
            const dateKey = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
            const label = d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });

            if (!dateGroups[dateKey]) {
                dateGroups[dateKey] = {
                    key: dateKey,
                    label,
                    initiated: 0,
                    forwarded: 0,
                    open: 0,
                    closed: 0,
                    total: 0
                };
            }

            const cat = getStatusCategory(c.stat_code);
            if (cat === 'new') dateGroups[dateKey].initiated++;
            else if (cat === 'forwarded') dateGroups[dateKey].forwarded++;
            else if (cat === 'open') dateGroups[dateKey].open++;
            else if (cat === 'closed') dateGroups[dateKey].closed++;
            dateGroups[dateKey].total++;
        });

        // Sort chronologically
        return Object.values(dateGroups).sort((a, b) => a.key.localeCompare(b.key));
    }, [filteredComplaints]);

    // Max value for timeline scale
    const maxTimelineVal = useMemo(() => {
        if (timelineData.length === 0) return 5;
        const max = Math.max(...timelineData.map((d) => d.total), 1);
        return Math.max(max + 1, Math.ceil(max * 1.3));
    }, [timelineData]);

    // Donut chart segments
    const donutSegments = useMemo(() => {
        const { total, initiatedCount, forwardedCount, openCount, closedCount } = metrics;
        if (total === 0) return [];

        const data = [
            { id: 'closed', label: 'Closed', count: closedCount, color: '#10b981' },
            { id: 'open', label: 'Open / In Progress', count: openCount, color: '#e5ba41' },
            { id: 'forwarded', label: 'With Principal', count: forwardedCount, color: '#9b5de5' },
            { id: 'new', label: 'Initiated By Parent', count: initiatedCount, color: '#219ebc' }
        ];

        const r = 70;
        const circumference = 2 * Math.PI * r;
        let cumulativeAngle = 0;

        return data.map((item) => {
            const percent = total > 0 ? item.count / total : 0;
            const strokeDasharray = `${percent * circumference} ${circumference}`;
            const strokeDashoffset = -cumulativeAngle * circumference;
            cumulativeAngle += percent;

            return {
                ...item,
                percent: Math.round(percent * 100),
                strokeDasharray,
                strokeDashoffset,
                r
            };
        });
    }, [metrics]);

    // Priority breakdown
    const priorityBreakdown = useMemo(() => {
        const counts = { urgent: 0, high: 0, medium: 0, low: 0 };
        filteredComplaints.forEach((c) => {
            const p = (c.priority || 'medium').toLowerCase();
            if (counts[p] !== undefined) counts[p]++;
            else counts.medium++;
        });
        return counts;
    }, [filteredComplaints]);

    // Category breakdown
    const categoryBreakdown = useMemo(() => {
        const counts = {};
        filteredComplaints.forEach((c) => {
            const t = c.type || 'General';
            counts[t] = (counts[t] || 0) + 1;
        });
        return Object.entries(counts)
            .sort((a, b) => b[1] - a[1])
            .slice(0, 5);
    }, [filteredComplaints]);

    // Export period to Excel
    const handleExportExcel = () => {
        if (filteredComplaints.length === 0) {
            alert('No concerns found with the current filters.');
            return;
        }

        const exportRows = filteredComplaints.map((c, i) => ({
            'Complaint Number': c.complaint_id,
            'No': i + 1,
            'Title': c.title || '',
            'Description': c.description || '',
            'Type': c.type || '',
            'Priority': (c.priority || 'N/A').toUpperCase(),
            'Status': getStatusBadgeLabel(c.stat_code).text,
            'Student Name': c.student_name || '',
            'Student No': c.student_no || '',
            'Grade': c.grade || '',
            'Section': c.section || '',
            'Created Datetime': new Date(c.created_at).toLocaleString()
        }));

        const ws = XLSX.utils.json_to_sheet(exportRows);
        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, ws, "Concerns_Analytics");
        XLSX.writeFile(wb, `Concerns_Analytics_${new Date().toISOString().split('T')[0]}.xlsx`);
    };

    return (
        <div className="analytics-container">
            {/* Top Navigation Bar */}
            <nav className="navbar navbar-dark analytics-navbar">
                <div className="container-fluid d-flex justify-content-between align-items-center">
                    <div className="d-flex align-items-center gap-3">
                        <button onClick={() => navigate('/dashboard')} className="back-btn d-flex align-items-center gap-2">
                            <span>←</span> Back to Dashboard
                        </button>
                        <span className="navbar-brand mb-0 h1 fw-bold text-white fs-5">
                            📊 Concern Status Analytics & Visual Graphs
                        </span>
                    </div>
                    <div className="d-flex align-items-center gap-3">
                        <span className="text-white-50 small d-none d-md-inline">
                            Welcome, <strong className="text-white">{name || role || 'User'}</strong>
                        </span>
                    </div>
                </div>
            </nav>

            <div className="container-fluid px-4 py-4">
                {/* Comprehensive Filters Bar */}
                <div className="card analytics-card mb-4">
                    <div className="card-body p-3">
                        {/* Row 1: Time Range Presets & Custom Pickers */}
                        <div className="row align-items-center g-3 mb-3">
                            <div className="col-xl-6 col-lg-7">
                                <label className="form-label text-muted small fw-bold mb-2 text-uppercase">
                                    ⏱️ Time Period:
                                </label>
                                <div className="d-flex flex-wrap gap-2">
                                    <button
                                        className={`time-pill-btn ${timePreset === 'all' ? 'active' : ''}`}
                                        onClick={() => handlePresetChange('all')}
                                    >
                                        All Time
                                    </button>
                                    <button
                                        className={`time-pill-btn ${timePreset === '7d' ? 'active' : ''}`}
                                        onClick={() => handlePresetChange('7d')}
                                    >
                                        Last 7 Days
                                    </button>
                                    <button
                                        className={`time-pill-btn ${timePreset === '30d' ? 'active' : ''}`}
                                        onClick={() => handlePresetChange('30d')}
                                    >
                                        Last 30 Days
                                    </button>
                                    <button
                                        className={`time-pill-btn ${timePreset === '90d' ? 'active' : ''}`}
                                        onClick={() => handlePresetChange('90d')}
                                    >
                                        Last 90 Days
                                    </button>
                                    <button
                                        className={`time-pill-btn ${timePreset === 'year' ? 'active' : ''}`}
                                        onClick={() => handlePresetChange('year')}
                                    >
                                        This Year
                                    </button>
                                </div>
                            </div>

                            <div className="col-xl-4 col-lg-5 col-md-8">
                                <label className="form-label text-muted small fw-bold mb-2 text-uppercase">
                                    📅 Custom Date Range:
                                </label>
                                <div className="d-flex align-items-center gap-2">
                                    <input
                                        type="date"
                                        className="form-control form-control-sm"
                                        value={startDate}
                                        onChange={(e) => {
                                            setStartDate(e.target.value);
                                            setTimePreset('custom');
                                        }}
                                    />
                                    <span className="text-muted fw-bold">to</span>
                                    <input
                                        type="date"
                                        className="form-control form-control-sm"
                                        value={endDate}
                                        onChange={(e) => {
                                            setEndDate(e.target.value);
                                            setTimePreset('custom');
                                        }}
                                    />
                                </div>
                            </div>

                            <div className="col-xl-2 col-lg-12 text-xl-end">
                                <button
                                    className="btn btn-outline-success btn-sm w-100 fw-bold"
                                    onClick={handleExportExcel}
                                    disabled={filteredComplaints.length === 0}
                                >
                                    📥 Export (.xlsx)
                                </button>
                            </div>
                        </div>

                        <hr className="my-2" style={{ opacity: 0.15 }} />

                        {/* Row 2: Status, Priority, Type, and Search Filters */}
                        <div className="row align-items-center g-3 pt-2">
                            {/* Status Filter Buttons */}
                            <div className="col-lg-5 col-md-12">
                                <label className="form-label text-muted small fw-bold mb-1 text-uppercase">
                                    📌 Filter Status:
                                </label>
                                <div className="btn-group w-100" role="group">
                                    <button
                                        className={`btn btn-sm ${statusFilter === 'all' ? 'btn-primary' : 'btn-outline-primary'}`}
                                        onClick={() => setStatusFilter('all')}
                                    >
                                        All Statuses
                                    </button>
                                    <button
                                        className={`btn btn-sm ${statusFilter === 'new' ? 'btn-primary' : 'btn-outline-primary'}`}
                                        onClick={() => setStatusFilter('new')}
                                    >
                                        Initiated
                                    </button>
                                    <button
                                        className={`btn btn-sm ${statusFilter === 'forwarded' ? 'btn-primary' : 'btn-outline-primary'}`}
                                        onClick={() => setStatusFilter('forwarded')}
                                    >
                                        With Principal
                                    </button>
                                    <button
                                        className={`btn btn-sm ${statusFilter === 'open' ? 'btn-primary' : 'btn-outline-primary'}`}
                                        onClick={() => setStatusFilter('open')}
                                    >
                                        Open
                                    </button>
                                    <button
                                        className={`btn btn-sm ${statusFilter === 'closed' ? 'btn-primary' : 'btn-outline-primary'}`}
                                        onClick={() => setStatusFilter('closed')}
                                    >
                                        Closed
                                    </button>
                                </div>
                            </div>

                            {/* Priority Filter */}
                            <div className="col-lg-2 col-md-4">
                                <label className="form-label text-muted small fw-bold mb-1 text-uppercase">
                                    ⚡ Priority:
                                </label>
                                <select
                                    className="form-select form-select-sm"
                                    value={priorityFilter}
                                    onChange={(e) => setPriorityFilter(e.target.value)}
                                >
                                    <option value="all">All Priorities</option>
                                    <option value="urgent">Urgent</option>
                                    <option value="high">High</option>
                                    <option value="medium">Medium</option>
                                    <option value="low">Low</option>
                                </select>
                            </div>

                            {/* Concern Type Filter */}
                            <div className="col-lg-2 col-md-4">
                                <label className="form-label text-muted small fw-bold mb-1 text-uppercase">
                                    🏷️ Category:
                                </label>
                                <select
                                    className="form-select form-select-sm"
                                    value={typeFilter}
                                    onChange={(e) => setTypeFilter(e.target.value)}
                                >
                                    <option value="all">All Categories</option>
                                    {availableTypes.map((t) => (
                                        <option key={t} value={t}>{t}</option>
                                    ))}
                                </select>
                            </div>

                            {/* Search Box */}
                            <div className="col-lg-3 col-md-4">
                                <label className="form-label text-muted small fw-bold mb-1 text-uppercase">
                                    🔍 Search:
                                </label>
                                <input
                                    type="text"
                                    className="form-control form-control-sm"
                                    placeholder="Search title, student..."
                                    value={searchQuery}
                                    onChange={(e) => setSearchQuery(e.target.value)}
                                />
                            </div>
                        </div>
                    </div>
                </div>

                {loading ? (
                    <div className="text-center py-5">
                        <div className="spinner-border text-light" style={{ width: '3rem', height: '3rem' }} role="status">
                            <span className="visually-hidden">Loading data...</span>
                        </div>
                        <p className="text-white mt-3 fw-semibold">Loading concern status analytics...</p>
                    </div>
                ) : (
                    <>
                        {/* Summary KPI Stat Cards */}
                        <div className="row g-3 mb-4">
                            <div className="col-6 col-lg">
                                <div className="kpi-card kpi-total">
                                    <div className="kpi-icon">📋</div>
                                    <div className="kpi-info">
                                        <h3>{metrics.total}</h3>
                                        <p>Total Concerns</p>
                                    </div>
                                </div>
                            </div>
                            <div className="col-6 col-lg">
                                <div className="kpi-card kpi-new">
                                    <div className="kpi-icon">🔵</div>
                                    <div className="kpi-info">
                                        <h3>{metrics.initiatedCount}</h3>
                                        <p>Initiated</p>
                                    </div>
                                </div>
                            </div>
                            <div className="col-6 col-lg">
                                <div className="kpi-card kpi-forwarded">
                                    <div className="kpi-icon">🟣</div>
                                    <div className="kpi-info">
                                        <h3>{metrics.forwardedCount}</h3>
                                        <p>With Principal</p>
                                    </div>
                                </div>
                            </div>
                            <div className="col-6 col-lg">
                                <div className="kpi-card kpi-open">
                                    <div className="kpi-icon">🟡</div>
                                    <div className="kpi-info">
                                        <h3>{metrics.openCount}</h3>
                                        <p>In Progress / Open</p>
                                    </div>
                                </div>
                            </div>
                            <div className="col-6 col-lg">
                                <div className="kpi-card kpi-closed">
                                    <div className="kpi-icon">🟢</div>
                                    <div className="kpi-info">
                                        <h3>{metrics.closedCount}</h3>
                                        <p>Closed ({metrics.resolutionRate}%)</p>
                                    </div>
                                </div>
                            </div>
                        </div>

                        {/* Visual Graphs Section */}
                        <div className="row g-4 mb-4">
                            {/* Graph 1: Timeline Trend Graph (Interactive Stacked Column Chart) */}
                            <div className="col-xl-8 col-lg-7">
                                <div className="card analytics-card h-100">
                                    <div className="analytics-card-header">
                                        <h5>
                                            <span>📈</span> Status Over Time Graph
                                        </h5>
                                        <div className="d-flex align-items-center gap-3 small flex-wrap">
                                            <span className="d-flex align-items-center gap-1">
                                                <span style={{ width: 12, height: 12, background: '#219ebc', borderRadius: 3 }}></span> Initiated
                                            </span>
                                            <span className="d-flex align-items-center gap-1">
                                                <span style={{ width: 12, height: 12, background: '#9b5de5', borderRadius: 3 }}></span> With Principal
                                            </span>
                                            <span className="d-flex align-items-center gap-1">
                                                <span style={{ width: 12, height: 12, background: '#e5ba41', borderRadius: 3 }}></span> Open
                                            </span>
                                            <span className="d-flex align-items-center gap-1">
                                                <span style={{ width: 12, height: 12, background: '#10b981', borderRadius: 3 }}></span> Closed
                                            </span>
                                        </div>
                                    </div>
                                    <div className="card-body p-4 position-relative">
                                        {timelineData.length === 0 ? (
                                            <div className="text-center py-5 text-muted">
                                                <h6>No concerns match the selected time period and filters.</h6>
                                                <p className="small">Try selecting "All Time" or adjusting the status/priority filters.</p>
                                            </div>
                                        ) : (
                                            <div style={{ width: '100%', height: 320 }}>
                                                <svg viewBox="0 0 800 320" preserveAspectRatio="none" style={{ height: '100%', width: '100%' }}>
                                                    {/* Y-Axis Grid Lines & Values */}
                                                    {[0, 0.25, 0.5, 0.75, 1].map((ratio, idx) => {
                                                        const y = 270 - ratio * 220;
                                                        const val = Math.round(ratio * maxTimelineVal);
                                                        return (
                                                            <g key={idx}>
                                                                <line x1="50" y1={y} x2="780" y2={y} className="chart-grid-line" />
                                                                <text x="40" y={y + 4} textAnchor="end" className="chart-axis-text">
                                                                    {val}
                                                                </text>
                                                            </g>
                                                        );
                                                    })}

                                                    {/* Stacked Bars */}
                                                    {(() => {
                                                        const plotWidth = 720;
                                                        const n = timelineData.length;
                                                        const slotWidth = plotWidth / n;
                                                        const barWidth = Math.max(14, Math.min(60, slotWidth * 0.6));

                                                        return timelineData.map((bucket, index) => {
                                                            const x = 55 + index * slotWidth + (slotWidth - barWidth) / 2;
                                                            const closedH = (bucket.closed / maxTimelineVal) * 220;
                                                            const openH = (bucket.open / maxTimelineVal) * 220;
                                                            const fwdH = (bucket.forwarded / maxTimelineVal) * 220;
                                                            const initH = (bucket.initiated / maxTimelineVal) * 220;

                                                            const yBase = 270;
                                                            const yClosed = yBase - closedH;
                                                            const yOpen = yClosed - openH;
                                                            const yFwd = yOpen - fwdH;
                                                            const yInit = yFwd - initH;

                                                            const isHovered = hoveredBar === bucket;

                                                            return (
                                                                <g
                                                                    key={bucket.key}
                                                                    onMouseEnter={() => setHoveredBar(bucket)}
                                                                    onMouseLeave={() => setHoveredBar(null)}
                                                                    style={{ cursor: 'pointer' }}
                                                                >
                                                                    {/* Column Hover Background */}
                                                                    {isHovered && (
                                                                        <rect
                                                                            x={55 + index * slotWidth}
                                                                            y="40"
                                                                            width={slotWidth}
                                                                            height="235"
                                                                            fill="#f1f5f9"
                                                                            rx="8"
                                                                            opacity="0.8"
                                                                        />
                                                                    )}

                                                                    {/* Closed Segment */}
                                                                    {closedH > 0 && (
                                                                        <rect
                                                                            x={x}
                                                                            y={yClosed}
                                                                            width={barWidth}
                                                                            height={closedH}
                                                                            fill="#10b981"
                                                                            rx="3"
                                                                            className="chart-bar-rect"
                                                                        />
                                                                    )}

                                                                    {/* Open Segment */}
                                                                    {openH > 0 && (
                                                                        <rect
                                                                            x={x}
                                                                            y={yOpen}
                                                                            width={barWidth}
                                                                            height={openH}
                                                                            fill="#e5ba41"
                                                                            rx="3"
                                                                            className="chart-bar-rect"
                                                                        />
                                                                    )}

                                                                    {/* Forwarded Segment */}
                                                                    {fwdH > 0 && (
                                                                        <rect
                                                                            x={x}
                                                                            y={yFwd}
                                                                            width={barWidth}
                                                                            height={fwdH}
                                                                            fill="#9b5de5"
                                                                            rx="3"
                                                                            className="chart-bar-rect"
                                                                        />
                                                                    )}

                                                                    {/* Initiated Segment */}
                                                                    {initH > 0 && (
                                                                        <rect
                                                                            x={x}
                                                                            y={yInit}
                                                                            width={barWidth}
                                                                            height={initH}
                                                                            fill="#219ebc"
                                                                            rx="3"
                                                                            className="chart-bar-rect"
                                                                        />
                                                                    )}

                                                                    {/* Total count badge on top of bar */}
                                                                    {bucket.total > 0 && (
                                                                        <text
                                                                            x={x + barWidth / 2}
                                                                            y={yInit - 6}
                                                                            textAnchor="middle"
                                                                            fill="#334155"
                                                                            fontSize="12"
                                                                            fontWeight="bold"
                                                                        >
                                                                            {bucket.total}
                                                                        </text>
                                                                    )}

                                                                    {/* X Axis Label */}
                                                                    <text
                                                                        x={x + barWidth / 2}
                                                                        y="292"
                                                                        textAnchor="middle"
                                                                        className="chart-axis-text"
                                                                        fontWeight={isHovered ? 'bold' : 'normal'}
                                                                    >
                                                                        {bucket.label}
                                                                    </text>
                                                                </g>
                                                            );
                                                        });
                                                    })()}
                                                </svg>

                                                {/* Tooltip Overlay */}
                                                {hoveredBar && (
                                                    <div
                                                        className="position-absolute bg-dark text-white p-2 rounded shadow-lg chart-tooltip"
                                                        style={{
                                                            top: '12px',
                                                            right: '20px',
                                                            fontSize: '0.85rem',
                                                            zIndex: 10,
                                                            border: '1px solid rgba(255,255,255,0.2)'
                                                        }}
                                                    >
                                                        <strong className="d-block mb-1 text-info">{hoveredBar.label}</strong>
                                                        <div className="d-flex justify-content-between gap-3">
                                                            <span>Total Concerns:</span>
                                                            <strong>{hoveredBar.total}</strong>
                                                        </div>
                                                        <div className="d-flex justify-content-between gap-3" style={{ color: '#10b981' }}>
                                                            <span>Closed:</span>
                                                            <strong>{hoveredBar.closed}</strong>
                                                        </div>
                                                        <div className="d-flex justify-content-between gap-3" style={{ color: '#e5ba41' }}>
                                                            <span>Open:</span>
                                                            <strong>{hoveredBar.open}</strong>
                                                        </div>
                                                        <div className="d-flex justify-content-between gap-3" style={{ color: '#9b5de5' }}>
                                                            <span>With Principal:</span>
                                                            <strong>{hoveredBar.forwarded}</strong>
                                                        </div>
                                                        <div className="d-flex justify-content-between gap-3" style={{ color: '#219ebc' }}>
                                                            <span>Initiated:</span>
                                                            <strong>{hoveredBar.initiated}</strong>
                                                        </div>
                                                    </div>
                                                )}
                                            </div>
                                        )}
                                    </div>
                                </div>
                            </div>

                            {/* Graph 2: Status Distribution Donut Chart */}
                            <div className="col-xl-4 col-lg-5">
                                <div className="card analytics-card h-100">
                                    <div className="analytics-card-header">
                                        <h5>
                                            <span>🍩</span> Status Distribution
                                        </h5>
                                        <span className="badge bg-light text-dark fw-bold border">
                                            {metrics.total} Concerns
                                        </span>
                                    </div>
                                    <div className="card-body p-4 d-flex flex-column justify-content-center">
                                        {metrics.total === 0 ? (
                                            <div className="text-center py-5 text-muted">
                                                No concerns found for the selected filters.
                                            </div>
                                        ) : (
                                            <>
                                                {/* SVG Donut */}
                                                <div className="d-flex justify-content-center my-2 position-relative">
                                                    <svg width="210" height="210" viewBox="0 0 200 200" style={{ transform: 'rotate(-90deg)' }}>
                                                        <circle
                                                            cx="100"
                                                            cy="100"
                                                            r="70"
                                                            fill="transparent"
                                                            stroke="#f1f5f9"
                                                            strokeWidth="24"
                                                        />
                                                        {donutSegments.map((segment) => {
                                                            const isHovered = hoveredDonut === segment.id;
                                                            return (
                                                                <circle
                                                                    key={segment.id}
                                                                    cx="100"
                                                                    cy="100"
                                                                    r={segment.r}
                                                                    fill="transparent"
                                                                    stroke={segment.color}
                                                                    strokeWidth={isHovered ? 28 : 24}
                                                                    strokeDasharray={segment.strokeDasharray}
                                                                    strokeDashoffset={segment.strokeDashoffset}
                                                                    style={{
                                                                        transition: 'all 0.3s ease',
                                                                        cursor: 'pointer',
                                                                        opacity: hoveredDonut && !isHovered ? 0.5 : 1
                                                                    }}
                                                                    onMouseEnter={() => setHoveredDonut(segment.id)}
                                                                    onMouseLeave={() => setHoveredDonut(null)}
                                                                />
                                                            );
                                                        })}
                                                    </svg>

                                                    {/* Center Display */}
                                                    <div
                                                        className="position-absolute top-50 start-50 translate-middle text-center"
                                                        style={{ pointerEvents: 'none' }}
                                                    >
                                                        <div className="display-6 fw-bold text-dark lh-1">{metrics.total}</div>
                                                        <div className="text-muted small fw-semibold text-uppercase" style={{ fontSize: '0.72rem' }}>Total</div>
                                                    </div>
                                                </div>

                                                {/* Interactive Legend List */}
                                                <div className="mt-2">
                                                    {donutSegments.map((item) => (
                                                        <div
                                                            key={item.id}
                                                            className="legend-item"
                                                            style={{
                                                                borderLeft: `4px solid ${item.color}`,
                                                                background: hoveredDonut === item.id ? '#e2e8f0' : '#f8fafc'
                                                            }}
                                                            onMouseEnter={() => setHoveredDonut(item.id)}
                                                            onMouseLeave={() => setHoveredDonut(null)}
                                                        >
                                                            <div className="d-flex align-items-center">
                                                                <span className="legend-color-dot" style={{ background: item.color }}></span>
                                                                <span className="fw-semibold text-dark small">{item.label}</span>
                                                            </div>
                                                            <div className="text-end">
                                                                <span className="fw-bold me-2">{item.count}</span>
                                                                <span className="badge bg-light text-muted border">{item.percent}%</span>
                                                            </div>
                                                        </div>
                                                    ))}
                                                </div>
                                            </>
                                        )}
                                    </div>
                                </div>
                            </div>
                        </div>

                        {/* Additional Breakdowns: Priority & Categories */}
                        <div className="row g-4 mb-4">
                            {/* Priority Breakdown */}
                            <div className="col-lg-6">
                                <div className="card analytics-card h-100">
                                    <div className="analytics-card-header">
                                        <h5><span>⚡</span> Concerns by Priority</h5>
                                    </div>
                                    <div className="card-body p-4">
                                        {[
                                            { label: 'Urgent', count: priorityBreakdown.urgent, color: '#dc3545' },
                                            { label: 'High', count: priorityBreakdown.high, color: '#fd7e14' },
                                            { label: 'Medium', count: priorityBreakdown.medium, color: '#0dcaf0' },
                                            { label: 'Low', count: priorityBreakdown.low, color: '#6c757d' }
                                        ].map((p) => {
                                            const pct = metrics.total > 0 ? Math.round((p.count / metrics.total) * 100) : 0;
                                            return (
                                                <div key={p.label} className="mb-3">
                                                    <div className="d-flex justify-content-between small fw-bold mb-1">
                                                        <span>{p.label}</span>
                                                        <span>{p.count} ({pct}%)</span>
                                                    </div>
                                                    <div className="priority-progress-bar">
                                                        <div
                                                            className="priority-progress-fill"
                                                            style={{ width: `${pct}%`, backgroundColor: p.color }}
                                                        ></div>
                                                    </div>
                                                </div>
                                            );
                                        })}
                                    </div>
                                </div>
                            </div>

                            {/* Top Categories */}
                            <div className="col-lg-6">
                                <div className="card analytics-card h-100">
                                    <div className="analytics-card-header">
                                        <h5><span>🏷️</span> Concerns by Category / Type</h5>
                                    </div>
                                    <div className="card-body p-4">
                                        {categoryBreakdown.length === 0 ? (
                                            <p className="text-muted text-center py-3">No categories recorded.</p>
                                        ) : (
                                            categoryBreakdown.map(([type, count]) => {
                                                const pct = metrics.total > 0 ? Math.round((count / metrics.total) * 100) : 0;
                                                return (
                                                    <div key={type} className="mb-3">
                                                        <div className="d-flex justify-content-between small fw-bold mb-1">
                                                            <span>{type}</span>
                                                            <span>{count} ({pct}%)</span>
                                                        </div>
                                                        <div className="priority-progress-bar">
                                                            <div
                                                                className="priority-progress-fill"
                                                                style={{ width: `${pct}%`, backgroundColor: '#3b82f6' }}
                                                            ></div>
                                                        </div>
                                                    </div>
                                                );
                                            })
                                        )}
                                    </div>
                                </div>
                            </div>
                        </div>

                        {/* Filtered Concerns Records Table */}
                        <div className="card analytics-card">
                            <div className="analytics-card-header">
                                <h5><span>📄</span> Filtered Concerns Records ({filteredComplaints.length})</h5>
                                <button className="btn btn-sm btn-outline-primary" onClick={handleExportExcel}>
                                    📊 Export to Excel
                                </button>
                            </div>
                            <div className="card-body p-0">
                                <div className="table-responsive">
                                    <table className="table table-hover analytics-table mb-0">
                                        <thead>
                                            <tr>
                                                <th>Concern #</th>
                                                <th>Title</th>
                                                <th>Type</th>
                                                <th>Student</th>
                                                <th>Priority</th>
                                                <th>Status</th>
                                                <th>Created Date</th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {filteredComplaints.length === 0 ? (
                                                <tr>
                                                    <td colSpan="7" className="text-center py-4 text-muted">
                                                        No concerns match the active filters.
                                                    </td>
                                                </tr>
                                            ) : (
                                                filteredComplaints.map((c, idx) => {
                                                    const badgeInfo = getStatusBadgeLabel(c.stat_code);
                                                    return (
                                                        <tr key={c.complaint_id || idx}>
                                                            <td className="fw-bold text-primary small">#{c.complaint_id}</td>
                                                            <td className="fw-semibold text-dark">{c.title || 'Untitled'}</td>
                                                            <td>
                                                                <span className="badge bg-light text-dark border">{c.type || 'General'}</span>
                                                            </td>
                                                            <td>{c.student_name || 'N/A'} {c.grade ? `(Gr ${c.grade})` : ''}</td>
                                                            <td>
                                                                <span className={`badge ${c.priority === 'urgent' ? 'bg-danger' : c.priority === 'high' ? 'bg-warning text-dark' : 'bg-info text-dark'}`}>
                                                                    {(c.priority || 'medium').toUpperCase()}
                                                                </span>
                                                            </td>
                                                            <td>
                                                                <span className={`badge ${badgeInfo.className}`}>
                                                                    {badgeInfo.text}
                                                                </span>
                                                            </td>
                                                            <td className="text-muted small">
                                                                {new Date(c.created_at).toLocaleDateString('en-US', {
                                                                    year: 'numeric',
                                                                    month: 'short',
                                                                    day: 'numeric'
                                                                })}
                                                            </td>
                                                        </tr>
                                                    );
                                                })
                                            )}
                                        </tbody>
                                    </table>
                                </div>
                            </div>
                        </div>
                    </>
                )}
            </div>
        </div>
    );
}
