import { useEffect, useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import * as XLSX from 'xlsx';
import { supabase } from '../../SupabaseClient';
import { useUser } from '../context/UserContext';
import './ConcernAnalytics.css';

export default function ConcernAnalytics() {
    const navigate = useNavigate();
    const { name, role } = useUser();

    const [allComplaints, setAllComplaints] = useState([]);
    const [loading, setLoading] = useState(true);

    // Time filter state
    const [timePreset, setTimePreset] = useState('30d'); // '7d', '30d', '90d', 'year', 'all', 'custom'
    const [startDate, setStartDate] = useState(() => {
        const d = new Date();
        d.setDate(d.getDate() - 30);
        return d.toISOString().split('T')[0];
    });
    const [endDate, setEndDate] = useState(() => {
        return new Date().toISOString().split('T')[0];
    });

    const [hoveredBar, setHoveredBar] = useState(null);
    const [hoveredDonut, setHoveredDonut] = useState(null);
    const [searchTable, setSearchTable] = useState('');

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

    // Handle time preset changes
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

    // Filter complaints within selected time period
    const filteredComplaints = useMemo(() => {
        if (!allComplaints || allComplaints.length === 0) return [];
        const start = new Date(`${startDate}T00:00:00`);
        const end = new Date(`${endDate}T23:59:59`);

        return allComplaints.filter((c) => {
            if (!c.created_at) return false;
            const created = new Date(c.created_at);
            return created >= start && created <= end;
        });
    }, [allComplaints, startDate, endDate]);

    // Categorize status code
    const getStatusCategory = (code) => {
        if (code === 1) return 'new'; // Initiated by parent
        if (code === 3) return 'forwarded'; // Forwarded to Principal
        if (code === 2 || code === 4 || code === 6 || code === 9) return 'open'; // Open
        if (code === 5 || code === 7) return 'closed'; // Closed
        return 'other';
    };

    const getStatusBadgeLabel = (code) => {
        switch (code) {
            case 1: return { text: 'Initiated By Parent', className: 'badge-status-new' };
            case 3: return { text: 'Forwarded to Principal', className: 'badge-status-fwd' };
            case 2:
            case 4:
            case 6:
            case 9: return { text: 'Open', className: 'badge-status-open' };
            case 5:
            case 7: return { text: 'Closed', className: 'badge-status-closed' };
            default: return { text: `Status ${code}`, className: 'bg-secondary' };
        }
    };

    // Calculate status counts & metrics
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

    // Priority breakdown
    const priorityBreakdown = useMemo(() => {
        const counts = { urgent: 0, high: 0, medium: 0, low: 0, unassigned: 0 };
        filteredComplaints.forEach((c) => {
            const p = (c.priority || 'unassigned').toLowerCase();
            if (counts[p] !== undefined) counts[p]++;
            else counts.unassigned++;
        });
        return counts;
    }, [filteredComplaints]);

    // Type / Category breakdown
    const typeBreakdown = useMemo(() => {
        const counts = {};
        filteredComplaints.forEach((c) => {
            const t = c.type || 'General';
            counts[t] = (counts[t] || 0) + 1;
        });
        return Object.entries(counts)
            .sort((a, b) => b[1] - a[1])
            .slice(0, 5);
    }, [filteredComplaints]);

    // Build timeline buckets for the bar chart
    const timelineData = useMemo(() => {
        if (!startDate || !endDate) return [];
        const start = new Date(startDate);
        const end = new Date(endDate);
        const diffDays = Math.max(1, Math.ceil((end - start) / (1000 * 60 * 60 * 24)));

        // Mode: 'daily', 'weekly', 'monthly'
        const mode = diffDays <= 31 ? 'daily' : diffDays <= 120 ? 'weekly' : 'monthly';
        const buckets = [];

        if (mode === 'daily') {
            const curr = new Date(start);
            while (curr <= end) {
                const dateKey = curr.toISOString().split('T')[0];
                const label = curr.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
                buckets.push({
                    key: dateKey,
                    label,
                    date: new Date(curr),
                    initiated: 0,
                    forwarded: 0,
                    open: 0,
                    closed: 0,
                    total: 0
                });
                curr.setDate(curr.getDate() + 1);
            }

            filteredComplaints.forEach((c) => {
                const dateKey = new Date(c.created_at).toISOString().split('T')[0];
                const b = buckets.find((item) => item.key === dateKey);
                if (b) {
                    const cat = getStatusCategory(c.stat_code);
                    if (cat === 'new') b.initiated++;
                    else if (cat === 'forwarded') b.forwarded++;
                    else if (cat === 'open') b.open++;
                    else if (cat === 'closed') b.closed++;
                    b.total++;
                }
            });
        } else if (mode === 'weekly') {
            const curr = new Date(start);
            while (curr <= end) {
                const weekStart = new Date(curr);
                const weekEnd = new Date(curr);
                weekEnd.setDate(weekEnd.getDate() + 6);
                const label = `${weekStart.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}`;
                buckets.push({
                    key: weekStart.toISOString().split('T')[0],
                    label,
                    weekStart: new Date(weekStart),
                    weekEnd: new Date(weekEnd),
                    initiated: 0,
                    forwarded: 0,
                    open: 0,
                    closed: 0,
                    total: 0
                });
                curr.setDate(curr.getDate() + 7);
            }

            filteredComplaints.forEach((c) => {
                const d = new Date(c.created_at);
                const b = buckets.find((item) => d >= item.weekStart && d <= item.weekEnd);
                if (b) {
                    const cat = getStatusCategory(c.stat_code);
                    if (cat === 'new') b.initiated++;
                    else if (cat === 'forwarded') b.forwarded++;
                    else if (cat === 'open') b.open++;
                    else if (cat === 'closed') b.closed++;
                    b.total++;
                }
            });
        } else {
            // Monthly
            const curr = new Date(start.getFullYear(), start.getMonth(), 1);
            const finalEnd = new Date(end.getFullYear(), end.getMonth() + 1, 0);

            while (curr <= finalEnd) {
                const monthKey = `${curr.getFullYear()}-${String(curr.getMonth() + 1).padStart(2, '0')}`;
                const label = curr.toLocaleDateString('en-US', { month: 'short', year: '2-digit' });
                buckets.push({
                    key: monthKey,
                    label,
                    year: curr.getFullYear(),
                    month: curr.getMonth(),
                    initiated: 0,
                    forwarded: 0,
                    open: 0,
                    closed: 0,
                    total: 0
                });
                curr.setMonth(curr.getMonth() + 1);
            }

            filteredComplaints.forEach((c) => {
                const d = new Date(c.created_at);
                const b = buckets.find((item) => d.getFullYear() === item.year && d.getMonth() === item.month);
                if (b) {
                    const cat = getStatusCategory(c.stat_code);
                    if (cat === 'new') b.initiated++;
                    else if (cat === 'forwarded') b.forwarded++;
                    else if (cat === 'open') b.open++;
                    else if (cat === 'closed') b.closed++;
                    b.total++;
                }
            });
        }

        return buckets;
    }, [filteredComplaints, startDate, endDate]);

    // Max value for timeline chart Y-axis scale
    const maxTimelineVal = useMemo(() => {
        const max = Math.max(...timelineData.map((d) => d.total), 1);
        return Math.ceil(max * 1.25);
    }, [timelineData]);

    // Donut chart segments
    const donutSegments = useMemo(() => {
        const { total, initiatedCount, forwardedCount, openCount, closedCount } = metrics;
        if (total === 0) return [];

        const data = [
            { id: 'closed', label: 'Closed', count: closedCount, color: '#10b981' },
            { id: 'open', label: 'Open', count: openCount, color: '#e5ba41' },
            { id: 'forwarded', label: 'Forwarded to Principal', count: forwardedCount, color: '#9b5de5' },
            { id: 'new', label: 'Initiated By Parent', count: initiatedCount, color: '#219ebc' }
        ];

        const r = 75;
        const circumference = 2 * Math.PI * r;
        let cumulativeAngle = 0;

        return data.map((item) => {
            const percent = item.count / total;
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

    // Export current filtered period to Excel
    const handleExportPeriod = () => {
        if (filteredComplaints.length === 0) {
            alert('No complaints in this period to export.');
            return;
        }

        const exportData = filteredComplaints.map((c, idx) => ({
            'No': idx + 1,
            'Title': c.title || '',
            'Description': c.description || '',
            'Type': c.type || '',
            'Priority': c.priority || 'N/A',
            'Status': getStatusBadgeLabel(c.stat_code).text,
            'Student Name': c.student_name || '',
            'Student No': c.student_no || '',
            'Grade': c.grade || '',
            'Section': c.section || '',
            'Created Datetime': new Date(c.created_at).toLocaleString()
        }));

        const ws = XLSX.utils.json_to_sheet(exportData);
        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, ws, "Period_Concerns");
        XLSX.writeFile(wb, `Concerns_${startDate}_to_${endDate}.xlsx`);
    };

    // Filter table search
    const displayedTableComplaints = useMemo(() => {
        if (!searchTable.trim()) return filteredComplaints;
        const query = searchTable.toLowerCase();
        return filteredComplaints.filter((c) =>
            (c.title && c.title.toLowerCase().includes(query)) ||
            (c.student_name && c.student_name.toLowerCase().includes(query)) ||
            (c.type && c.type.toLowerCase().includes(query))
        );
    }, [filteredComplaints, searchTable]);

    return (
        <div className="analytics-container">
            {/* Top Navigation */}
            <nav className="navbar navbar-dark analytics-navbar">
                <div className="container-fluid d-flex justify-content-between align-items-center">
                    <div className="d-flex align-items-center gap-3">
                        <button onClick={() => navigate('/dashboard')} className="back-btn d-flex align-items-center gap-2">
                            <span>←</span> Back to Dashboard
                        </button>
                        <span className="navbar-brand mb-0 h1 fw-bold text-white fs-5">
                            📊 Concern Status Analytics & Graphs
                        </span>
                    </div>
                    <div className="d-flex align-items-center gap-3">
                        <span className="text-white-50 small d-none d-md-inline">
                            Logged in as <strong className="text-white">{name || role || 'User'}</strong>
                        </span>
                    </div>
                </div>
            </nav>

            <div className="container-fluid px-4 py-4">
                {/* Time Period Filter Bar */}
                <div className="card analytics-card mb-4">
                    <div className="card-body p-3">
                        <div className="row align-items-center g-3">
                            {/* Preset Buttons */}
                            <div className="col-xl-6 col-lg-7">
                                <label className="form-label text-muted small fw-bold mb-2 text-uppercase">Time Period Preset:</label>
                                <div className="d-flex flex-wrap gap-2">
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
                                    <button
                                        className={`time-pill-btn ${timePreset === 'all' ? 'active' : ''}`}
                                        onClick={() => handlePresetChange('all')}
                                    >
                                        All Time
                                    </button>
                                </div>
                            </div>

                            {/* Custom Date Pickers */}
                            <div className="col-xl-4 col-lg-5 col-md-8">
                                <label className="form-label text-muted small fw-bold mb-2 text-uppercase">Custom Date Range:</label>
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

                            {/* Export button */}
                            <div className="col-xl-2 col-lg-12 text-xl-end">
                                <button
                                    className="btn btn-outline-success btn-sm w-100 fw-bold"
                                    onClick={handleExportPeriod}
                                    disabled={filteredComplaints.length === 0}
                                >
                                    📥 Export Period (.xlsx)
                                </button>
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
                        {/* Summary KPI Cards */}
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
                                        <p>Forwarded</p>
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
                            {/* Graph 1: Timeline Trend Graph (Stacked Bar Chart) */}
                            <div className="col-xl-8 col-lg-7">
                                <div className="card analytics-card h-100">
                                    <div className="analytics-card-header">
                                        <h5>
                                            <span>📈</span> Status Over Time Trend
                                        </h5>
                                        <div className="d-flex align-items-center gap-3 small">
                                            <span className="d-flex align-items-center gap-1">
                                                <span style={{ width: 10, height: 10, background: '#219ebc', borderRadius: 2 }}></span> Initiated
                                            </span>
                                            <span className="d-flex align-items-center gap-1">
                                                <span style={{ width: 10, height: 10, background: '#9b5de5', borderRadius: 2 }}></span> Forwarded
                                            </span>
                                            <span className="d-flex align-items-center gap-1">
                                                <span style={{ width: 10, height: 10, background: '#e5ba41', borderRadius: 2 }}></span> Open
                                            </span>
                                            <span className="d-flex align-items-center gap-1">
                                                <span style={{ width: 10, height: 10, background: '#10b981', borderRadius: 2 }}></span> Closed
                                            </span>
                                        </div>
                                    </div>
                                    <div className="card-body p-4 position-relative">
                                        {timelineData.length === 0 ? (
                                            <div className="text-center py-5 text-muted">
                                                No concern data recorded in the selected period.
                                            </div>
                                        ) : (
                                            <div style={{ width: '100%', height: 320 }}>
                                                {/* SVG Timeline Chart */}
                                                <svg viewBox="0 0 800 320" className="chart-svg" preserveAspectRatio="none" style={{ height: '100%', width: '100%' }}>
                                                    {/* Horizontal Grid Lines */}
                                                    {[0, 0.25, 0.5, 0.75, 1].map((ratio, idx) => {
                                                        const y = 280 - ratio * 240;
                                                        const val = Math.round(ratio * maxTimelineVal);
                                                        return (
                                                            <g key={idx}>
                                                                <line x1="45" y1={y} x2="780" y2={y} className="chart-grid-line" />
                                                                <text x="35" y={y + 4} textAnchor="end" className="chart-axis-text">
                                                                    {val}
                                                                </text>
                                                            </g>
                                                        );
                                                    })}

                                                    {/* Bars */}
                                                    {(() => {
                                                        const plotWidth = 735;
                                                        const n = timelineData.length;
                                                        const slotWidth = plotWidth / n;
                                                        const barWidth = Math.max(6, Math.min(36, slotWidth * 0.65));

                                                        return timelineData.map((bucket, index) => {
                                                            const x = 55 + index * slotWidth + (slotWidth - barWidth) / 2;
                                                            const totalH = (bucket.total / maxTimelineVal) * 240;
                                                            const closedH = (bucket.closed / maxTimelineVal) * 240;
                                                            const openH = (bucket.open / maxTimelineVal) * 240;
                                                            const fwdH = (bucket.forwarded / maxTimelineVal) * 240;
                                                            const initH = (bucket.initiated / maxTimelineVal) * 240;

                                                            // Stack segments from bottom up
                                                            const yBase = 280;
                                                            const yClosed = yBase - closedH;
                                                            const yOpen = yClosed - openH;
                                                            const yFwd = yOpen - fwdH;
                                                            const yInit = yFwd - initH;

                                                            const isHovered = hoveredBar === bucket;

                                                            // Skip x-axis label every other if too many buckets
                                                            const showLabel = n <= 16 || index % Math.ceil(n / 14) === 0 || index === n - 1;

                                                            return (
                                                                <g
                                                                    key={bucket.key || index}
                                                                    onMouseEnter={() => setHoveredBar(bucket)}
                                                                    onMouseLeave={() => setHoveredBar(null)}
                                                                    style={{ cursor: 'pointer' }}
                                                                >
                                                                    {/* Background highlight on hover */}
                                                                    {isHovered && (
                                                                        <rect
                                                                            x={55 + index * slotWidth}
                                                                            y="30"
                                                                            width={slotWidth}
                                                                            height="250"
                                                                            fill="#f1f5f9"
                                                                            rx="6"
                                                                            opacity="0.7"
                                                                        />
                                                                    )}

                                                                    {/* Closed segment */}
                                                                    {closedH > 0 && (
                                                                        <rect
                                                                            x={x}
                                                                            y={yClosed}
                                                                            width={barWidth}
                                                                            height={closedH}
                                                                            fill="#10b981"
                                                                            rx="2"
                                                                            className="chart-bar-rect"
                                                                        />
                                                                    )}
                                                                    {/* Open segment */}
                                                                    {openH > 0 && (
                                                                        <rect
                                                                            x={x}
                                                                            y={yOpen}
                                                                            width={barWidth}
                                                                            height={openH}
                                                                            fill="#e5ba41"
                                                                            rx="2"
                                                                            className="chart-bar-rect"
                                                                        />
                                                                    )}
                                                                    {/* Forwarded segment */}
                                                                    {fwdH > 0 && (
                                                                        <rect
                                                                            x={x}
                                                                            y={yFwd}
                                                                            width={barWidth}
                                                                            height={fwdH}
                                                                            fill="#9b5de5"
                                                                            rx="2"
                                                                            className="chart-bar-rect"
                                                                        />
                                                                    )}
                                                                    {/* Initiated segment */}
                                                                    {initH > 0 && (
                                                                        <rect
                                                                            x={x}
                                                                            y={yInit}
                                                                            width={barWidth}
                                                                            height={initH}
                                                                            fill="#219ebc"
                                                                            rx="2"
                                                                            className="chart-bar-rect"
                                                                        />
                                                                    )}

                                                                    {/* X Axis Label */}
                                                                    {showLabel && (
                                                                        <text
                                                                            x={x + barWidth / 2}
                                                                            y="302"
                                                                            textAnchor="middle"
                                                                            className="chart-axis-text"
                                                                        >
                                                                            {bucket.label}
                                                                        </text>
                                                                    )}
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
                                                            <span>Total:</span>
                                                            <strong>{hoveredBar.total}</strong>
                                                        </div>
                                                        <div className="d-flex justify-content-between gap-3 text-emerald" style={{ color: '#10b981' }}>
                                                            <span>Closed:</span>
                                                            <strong>{hoveredBar.closed}</strong>
                                                        </div>
                                                        <div className="d-flex justify-content-between gap-3" style={{ color: '#e5ba41' }}>
                                                            <span>Open:</span>
                                                            <strong>{hoveredBar.open}</strong>
                                                        </div>
                                                        <div className="d-flex justify-content-between gap-3" style={{ color: '#9b5de5' }}>
                                                            <span>Forwarded:</span>
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
                                        <span className="badge bg-light text-dark fw-bold">Period Total</span>
                                    </div>
                                    <div className="card-body p-4 d-flex flex-column justify-content-center">
                                        {metrics.total === 0 ? (
                                            <div className="text-center py-5 text-muted">
                                                No concerns found in this time range.
                                            </div>
                                        ) : (
                                            <>
                                                {/* SVG Donut */}
                                                <div className="d-flex justify-content-center my-3 position-relative">
                                                    <svg width="220" height="220" viewBox="0 0 200 200" style={{ transform: 'rotate(-90deg)' }}>
                                                        {/* Base circle background */}
                                                        <circle
                                                            cx="100"
                                                            cy="100"
                                                            r="75"
                                                            fill="transparent"
                                                            stroke="#f1f5f9"
                                                            strokeWidth="24"
                                                        />
                                                        {/* Segments */}
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
                                                                        opacity: hoveredDonut && !isHovered ? 0.6 : 1
                                                                    }}
                                                                    onMouseEnter={() => setHoveredDonut(segment.id)}
                                                                    onMouseLeave={() => setHoveredDonut(null)}
                                                                />
                                                            );
                                                        })}
                                                    </svg>

                                                    {/* Donut Center Display */}
                                                    <div
                                                        className="position-absolute top-50 start-50 translate-middle text-center"
                                                        style={{ pointerEvents: 'none' }}
                                                    >
                                                        <div className="display-6 fw-bold text-dark lh-1">{metrics.total}</div>
                                                        <div className="text-muted small fw-semibold text-uppercase" style={{ fontSize: '0.75rem' }}>Concerns</div>
                                                    </div>
                                                </div>

                                                {/* Status Legend & Percentages */}
                                                <div className="mt-2">
                                                    {donutSegments.map((item) => (
                                                        <div
                                                            key={item.id}
                                                            className="legend-item"
                                                            style={{
                                                                borderLeft: `4px solid ${item.color}`,
                                                                background: hoveredDonut === item.id ? '#f1f5f9' : '#f8fafc'
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

                        {/* Breakdown by Priority & Categories */}
                        <div className="row g-4 mb-4">
                            {/* Priority Distribution */}
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
                                        {typeBreakdown.length === 0 ? (
                                            <p className="text-muted text-center py-3">No concern types recorded.</p>
                                        ) : (
                                            typeBreakdown.map(([type, count]) => {
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

                        {/* Concerns In Selected Period Table */}
                        <div className="card analytics-card">
                            <div className="analytics-card-header">
                                <h5><span>📄</span> Concerns In Selected Period ({filteredComplaints.length})</h5>
                                <div style={{ maxWidth: '300px' }}>
                                    <input
                                        type="text"
                                        className="form-control form-control-sm"
                                        placeholder="🔍 Search in this period..."
                                        value={searchTable}
                                        onChange={(e) => setSearchTable(e.target.value)}
                                    />
                                </div>
                            </div>
                            <div className="card-body p-0">
                                <div className="table-responsive">
                                    <table className="table table-hover analytics-table mb-0">
                                        <thead>
                                            <tr>
                                                <th>#</th>
                                                <th>Title</th>
                                                <th>Type</th>
                                                <th>Student</th>
                                                <th>Priority</th>
                                                <th>Status</th>
                                                <th>Created Date</th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {displayedTableComplaints.length === 0 ? (
                                                <tr>
                                                    <td colSpan="7" className="text-center py-4 text-muted">
                                                        No concerns match the filter/search.
                                                    </td>
                                                </tr>
                                            ) : (
                                                displayedTableComplaints.slice(0, 50).map((c, idx) => {
                                                    const badgeInfo = getStatusBadgeLabel(c.stat_code);
                                                    return (
                                                        <tr key={c.complaint_id || idx}>
                                                            <td className="text-muted small">{idx + 1}</td>
                                                            <td className="fw-semibold text-dark">{c.title || 'Untitled'}</td>
                                                            <td>
                                                                <span className="badge bg-light text-dark border">{c.type || 'N/A'}</span>
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
