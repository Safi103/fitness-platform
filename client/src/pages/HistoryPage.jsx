import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import api from '../api/client';

const PAGE_SIZE = 10;

function messageFrom(err) {
  return (
    (err.response && err.response.data && err.response.data.error) ||
    'Something went wrong. Try again.'
  );
}

function formatDate(iso) {
  return iso ? String(iso).slice(0, 10) : '';
}

// The feed: every logged session, newest first, with the per-session
// aggregates the API computes (exercise count, set count, volume).
// Pagination is a simple "load more" that appends the next page.
export default function HistoryPage() {
  const [workouts, setWorkouts] = useState([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState(null);

  async function fetchPage(offset) {
    const { data } = await api.get('/workouts', {
      params: { limit: PAGE_SIZE, offset },
    });
    return data;
  }

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const data = await fetchPage(0);
        if (!cancelled) {
          setWorkouts(data.workouts);
          setTotal(data.total);
        }
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

  async function loadMore() {
    setLoadingMore(true);
    setError(null);
    try {
      const data = await fetchPage(workouts.length);
      setWorkouts((w) => [...w, ...data.workouts]);
      setTotal(data.total);
    } catch (err) {
      setError(messageFrom(err));
    } finally {
      setLoadingMore(false);
    }
  }

  return (
    <>
      <div className="page-head">
        <div>
          <h1>Workout history</h1>
          <p className="lead">Every logged session, newest first.</p>
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

      {loading ? (
        <p className="lead">Loading history...</p>
      ) : workouts.length === 0 ? (
        <div className="empty-state">
          <p>Nothing logged yet. Your first session starts the story.</p>
          <Link to="/workout" className="btn btn-primary">
            Start a workout
          </Link>
        </div>
      ) : (
        <>
          {workouts.map((w) => (
            <Link to={`/history/${w.id}`} className="history-row" key={w.id}>
              <div>
                <span className="name">{w.routine_name || 'Empty workout'}</span>
                <p className="routine-meta">{formatDate(w.started_at)}</p>
              </div>
              <div className="history-stats">
                <span>
                  <span className="mono">{w.exercise_count}</span> exercises
                </span>
                <span>
                  <span className="mono">{w.set_count}</span> sets
                </span>
                <span>
                  <span className="mono">{Number(w.total_volume).toLocaleString()}</span>{' '}
                  volume
                </span>
              </div>
            </Link>
          ))}
          {workouts.length < total && (
            <div className="load-more">
              <button
                type="button"
                className="btn btn-primary"
                onClick={loadMore}
                disabled={loadingMore}
              >
                {loadingMore ? 'Loading...' : `Load more (${workouts.length} of ${total})`}
              </button>
            </div>
          )}
        </>
      )}
    </>
  );
}
