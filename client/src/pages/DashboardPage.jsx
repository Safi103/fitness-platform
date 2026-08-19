import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  Bar,
  BarChart,
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import api from '../api/client';
import { useAuth } from '../context/AuthContext';

// Recharts needs concrete color values, so the plate palette is mirrored
// here from the CSS variables in styles.css.
const PLATE = {
  red: '#d5382e',
  blue: '#2456a6',
  yellow: '#f0b429',
  green: '#1f8a4c',
  line: '#d4d9de',
  soft: '#5a6470',
};

const RECORD_LABELS = { MAX_WEIGHT: 'Max weight', MAX_REPS: 'Max reps' };

function messageFrom(err) {
  return (
    (err.response && err.response.data && err.response.data.error) ||
    'Something went wrong. Try again.'
  );
}

function labelize(value) {
  return value.replace('_', ' ');
}

function shortDate(value) {
  return String(value).slice(5);
}

// The payoff screen: headline stats, volume trend, muscle distribution,
// per-exercise progression, and the current records - all read-only calls
// to the analytics endpoints, sharing the one volume formula.
export default function DashboardPage() {
  const { user } = useAuth();

  const [summary, setSummary] = useState(null);
  const [muscle, setMuscle] = useState([]);
  const [records, setRecords] = useState([]);
  const [catalog, setCatalog] = useState([]);
  const [groupBy, setGroupBy] = useState('week');
  const [volume, setVolume] = useState([]);
  const [progressId, setProgressId] = useState('');
  const [metric, setMetric] = useState('max_weight');
  const [progression, setProgression] = useState(null);
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const [s, m, r, c] = await Promise.all([
          api.get('/analytics/summary'),
          api.get('/analytics/volume-by-muscle'),
          api.get('/records'),
          api.get('/exercises'),
        ]);
        if (cancelled) return;
        setSummary(s.data.summary);
        setMuscle(m.data.groups.map((g) => ({ ...g, label: labelize(g.muscle_group) })));
        setRecords(r.data.records);
        setCatalog(c.data.exercises);
      } catch (err) {
        if (!cancelled) setError(messageFrom(err));
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const { data } = await api.get('/analytics/volume', {
          params: { group_by: groupBy },
        });
        if (!cancelled) setVolume(data.points);
      } catch (err) {
        if (!cancelled) setError(messageFrom(err));
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [groupBy]);

  useEffect(() => {
    if (!progressId) {
      setProgression(null);
      return undefined;
    }
    let cancelled = false;
    (async () => {
      try {
        const { data } = await api.get(`/analytics/progression/${progressId}`);
        if (!cancelled) setProgression(data);
      } catch (err) {
        if (!cancelled) setError(messageFrom(err));
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [progressId]);

  if (loading) {
    return <p className="lead">Loading your dashboard...</p>;
  }

  const hasData = summary && summary.total_workouts > 0;

  return (
    <>
      <div className="page-head">
        <div>
          <h1>Welcome back, {user ? user.name : ''}</h1>
          <p className="lead">Your training at a glance.</p>
        </div>
        <Link to="/workout" className="btn btn-primary">
          Start a workout
        </Link>
      </div>

      {error && (
        <div className="form-error" role="alert">
          {error}
        </div>
      )}

      {!hasData ? (
        <div className="empty-state">
          <p>No workouts logged yet - the charts light up after your first session.</p>
          <Link to="/workout" className="btn btn-primary">
            Log your first workout
          </Link>
        </div>
      ) : (
        <>
          <div className="stat-grid">
            <div className="stat-card">
              <span className="stat-value mono">{summary.total_workouts}</span>
              <span className="stat-label">Workouts</span>
            </div>
            <div className="stat-card">
              <span className="stat-value mono">{summary.workouts_last_30_days}</span>
              <span className="stat-label">Last 30 days</span>
            </div>
            <div className="stat-card">
              <span className="stat-value mono">
                {Number(summary.total_volume).toLocaleString()}
              </span>
              <span className="stat-label">Total volume</span>
            </div>
            <div className="stat-card">
              <span className="stat-value mono">{summary.records_count}</span>
              <span className="stat-label">Records held</span>
            </div>
          </div>

          <div className="chart-grid">
            <div className="card chart-card">
              <div className="card-head">
                <h2>Training volume</h2>
                <div className="seg">
                  <button
                    type="button"
                    className={groupBy === 'day' ? 'seg-btn active' : 'seg-btn'}
                    onClick={() => setGroupBy('day')}
                  >
                    Day
                  </button>
                  <button
                    type="button"
                    className={groupBy === 'week' ? 'seg-btn active' : 'seg-btn'}
                    onClick={() => setGroupBy('week')}
                  >
                    Week
                  </button>
                </div>
              </div>
              <ResponsiveContainer width="100%" height={240}>
                <BarChart data={volume}>
                  <CartesianGrid stroke={PLATE.line} vertical={false} />
                  <XAxis
                    dataKey="period"
                    tickFormatter={shortDate}
                    stroke={PLATE.soft}
                    fontSize={12}
                  />
                  <YAxis stroke={PLATE.soft} fontSize={12} width={54} />
                  <Tooltip />
                  <Bar
                    dataKey="total_volume"
                    name="Volume"
                    fill={PLATE.blue}
                    radius={[3, 3, 0, 0]}
                  />
                </BarChart>
              </ResponsiveContainer>
            </div>

            <div className="card chart-card">
              <div className="card-head">
                <h2>Volume by muscle group</h2>
              </div>
              <ResponsiveContainer width="100%" height={240}>
                <BarChart data={muscle} layout="vertical">
                  <CartesianGrid stroke={PLATE.line} horizontal={false} />
                  <XAxis type="number" stroke={PLATE.soft} fontSize={12} />
                  <YAxis
                    type="category"
                    dataKey="label"
                    stroke={PLATE.soft}
                    fontSize={12}
                    width={92}
                  />
                  <Tooltip />
                  <Bar
                    dataKey="total_volume"
                    name="Volume"
                    fill={PLATE.red}
                    radius={[0, 3, 3, 0]}
                  />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>

          <div className="card chart-card">
            <div className="card-head">
              <h2>Exercise progression</h2>
              <div className="chart-controls">
                <select
                  value={progressId}
                  onChange={(e) => setProgressId(e.target.value)}
                  aria-label="Exercise to chart"
                >
                  <option value="">Pick an exercise...</option>
                  {catalog.map((e) => (
                    <option key={e.id} value={e.id}>
                      {e.name}
                    </option>
                  ))}
                </select>
                <div className="seg">
                  <button
                    type="button"
                    className={metric === 'max_weight' ? 'seg-btn active' : 'seg-btn'}
                    onClick={() => setMetric('max_weight')}
                  >
                    Max weight
                  </button>
                  <button
                    type="button"
                    className={metric === 'total_volume' ? 'seg-btn active' : 'seg-btn'}
                    onClick={() => setMetric('total_volume')}
                  >
                    Volume
                  </button>
                </div>
              </div>
            </div>
            {!progression ? (
              <p className="lead">Pick an exercise to see its trend over time.</p>
            ) : progression.points.length === 0 ? (
              <p className="lead">
                No sessions logged for {progression.exercise.name} yet.
              </p>
            ) : (
              <ResponsiveContainer width="100%" height={260}>
                <LineChart data={progression.points}>
                  <CartesianGrid stroke={PLATE.line} vertical={false} />
                  <XAxis
                    dataKey="date"
                    tickFormatter={shortDate}
                    stroke={PLATE.soft}
                    fontSize={12}
                  />
                  <YAxis stroke={PLATE.soft} fontSize={12} width={54} domain={['auto', 'auto']} />
                  <Tooltip />
                  <Line
                    type="monotone"
                    dataKey={metric}
                    name={metric === 'max_weight' ? 'Max weight' : 'Volume'}
                    stroke={PLATE.red}
                    strokeWidth={2.5}
                    dot={{ r: 4, fill: PLATE.red }}
                  />
                </LineChart>
              </ResponsiveContainer>
            )}
          </div>

          <div className="card">
            <div className="card-head">
              <h2>Personal records</h2>
              <Link to="/history">View history</Link>
            </div>
            {records.length === 0 ? (
              <p className="lead">
                No records yet - they appear automatically when you beat a best.
              </p>
            ) : (
              records.map((r, i) => (
                <div className="record-row" key={i}>
                  <span className="name">{r.exercise_name}</span>
                  <span className="tag tag-custom">
                    {RECORD_LABELS[r.record_type] || r.record_type}
                  </span>
                  <span className="mono record-value">{r.value}</span>
                  <span className="routine-meta">{String(r.achieved_at).slice(0, 10)}</span>
                </div>
              ))
            )}
          </div>
        </>
      )}
    </>
  );
}
