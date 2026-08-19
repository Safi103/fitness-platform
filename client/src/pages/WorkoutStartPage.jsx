import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import api from '../api/client';

function messageFrom(err) {
  return (
    (err.response && err.response.data && err.response.data.error) ||
    'Something went wrong. Try again.'
  );
}

// Choose how the session begins: from a routine (targets pre-filled) or an
// empty workout. Routines scheduled for today sort first and get a badge -
// getDay() uses 0 = Sunday, the same convention as the schedule API.
export default function WorkoutStartPage() {
  const [routines, setRoutines] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const today = new Date().getDay();

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const { data } = await api.get('/routines');
        if (!cancelled) {
          const sorted = [...data.routines].sort(
            (a, b) =>
              Number(b.scheduled_days.includes(today)) -
              Number(a.scheduled_days.includes(today))
          );
          setRoutines(sorted);
        }
      } catch (err) {
        if (!cancelled) setError(messageFrom(err));
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    load();
    return () => {
      cancelled = true;
    };
  }, [today]);

  return (
    <>
      <div className="page-head">
        <div>
          <h1>Start a workout</h1>
          <p className="lead">Run a program, or log freestyle with an empty workout.</p>
        </div>
        <Link to="/workout/live" className="btn btn-primary">
          Start empty workout
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
          <p>No routines yet. Build one, or start an empty workout above.</p>
          <Link to="/routines/new" className="btn btn-primary">
            Build a routine
          </Link>
        </div>
      ) : (
        routines.map((r) => (
          <div className="list-row" key={r.id}>
            <div>
              <span className="name">{r.name}</span>
              <div className="row-tags">
                <span className="tag">
                  <span className="mono">{r.exercise_count}</span> exercises
                </span>
                {r.scheduled_days.includes(today) && (
                  <span className="tag tag-today">Scheduled today</span>
                )}
              </div>
            </div>
            <Link to={`/workout/live?routine=${r.id}`} className="btn btn-primary start-btn">
              Start
            </Link>
          </div>
        ))
      )}
    </>
  );
}
