import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import api from '../api/client';

const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

function messageFrom(err) {
  return (
    (err.response && err.response.data && err.response.data.error) ||
    'Something went wrong. Try again.'
  );
}

// Programs and their weekly schedule. Each weekday chip toggles membership
// and sends the full day set to the API (replace-all semantics); the chips
// re-render from the server's response, so the UI always mirrors the DB.
export default function RoutinesPage() {
  const [routines, setRoutines] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const { data } = await api.get('/routines');
      setRoutines(data.routines);
    } catch (err) {
      setError(messageFrom(err));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, []);

  async function toggleDay(routine, day) {
    const has = routine.scheduled_days.includes(day);
    const days = has
      ? routine.scheduled_days.filter((d) => d !== day)
      : [...routine.scheduled_days, day];
    setError(null);
    try {
      const { data } = await api.put(`/routines/${routine.id}/schedule`, { days });
      setRoutines((rs) =>
        rs.map((r) => (r.id === routine.id ? { ...r, scheduled_days: data.days } : r))
      );
    } catch (err) {
      setError(messageFrom(err));
    }
  }

  async function removeRoutine(routine) {
    if (
      !window.confirm(`Delete "${routine.name}"? Logged workouts keep their history.`)
    ) {
      return;
    }
    setError(null);
    try {
      await api.delete(`/routines/${routine.id}`);
      load();
    } catch (err) {
      setError(messageFrom(err));
    }
  }

  return (
    <>
      <div className="page-head">
        <div>
          <h1>Routines</h1>
          <p className="lead">Your programs, their targets, and the days they run.</p>
        </div>
        <Link to="/routines/new" className="btn btn-primary">
          New routine
        </Link>
      </div>

      {error && (
        <div className="form-error" role="alert">
          {error}
        </div>
      )}

      {loading ? (
        <p className="lead">Loading routines...</p>
      ) : routines.length === 0 ? (
        <div className="empty-state">
          <p>No routines yet.</p>
          <Link to="/routines/new" className="btn btn-primary">
            Build your first program
          </Link>
        </div>
      ) : (
        routines.map((r) => (
          <div className="card" key={r.id}>
            <div className="card-head">
              <div>
                <h2>{r.name}</h2>
                {r.description && <p className="routine-meta">{r.description}</p>}
                <p className="routine-meta">
                  <span className="mono">{r.exercise_count}</span> exercises
                </p>
              </div>
              <div className="card-actions">
                <Link to={`/routines/${r.id}/edit`}>Edit</Link>
                <button
                  type="button"
                  className="link-danger"
                  onClick={() => removeRoutine(r)}
                >
                  Delete
                </button>
              </div>
            </div>
            <div className="day-chips" role="group" aria-label={`Schedule for ${r.name}`}>
              {DAYS.map((label, day) => (
                <button
                  key={day}
                  type="button"
                  className={
                    r.scheduled_days.includes(day) ? 'day-chip active' : 'day-chip'
                  }
                  aria-pressed={r.scheduled_days.includes(day)}
                  onClick={() => toggleDay(r, day)}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>
        ))
      )}
    </>
  );
}
