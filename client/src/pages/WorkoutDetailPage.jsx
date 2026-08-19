import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import api from '../api/client';

function messageFrom(err) {
  return (
    (err.response && err.response.data && err.response.data.error) ||
    'Something went wrong. Try again.'
  );
}

function formatDate(iso) {
  return iso ? String(iso).slice(0, 10) : '';
}

// Volume uses the same formula everywhere in the app: weight x reps summed
// over sets, partials excluded - so this always matches the feed and charts.
function exerciseVolume(sets) {
  return sets.reduce((sum, s) => sum + Number(s.weight) * Number(s.reps), 0);
}

export default function WorkoutDetailPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [workout, setWorkout] = useState(null);
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const { data } = await api.get(`/workouts/${id}`);
        if (!cancelled) setWorkout(data.workout);
      } catch (err) {
        if (!cancelled) setError(messageFrom(err));
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [id]);

  async function remove() {
    if (!window.confirm('Delete this workout? Personal records keep their values.')) {
      return;
    }
    setError(null);
    try {
      await api.delete(`/workouts/${id}`);
      navigate('/history');
    } catch (err) {
      setError(messageFrom(err));
    }
  }

  if (loading) {
    return <p className="lead">Loading workout...</p>;
  }

  if (!workout) {
    return (
      <>
        {error && (
          <div className="form-error" role="alert">
            {error}
          </div>
        )}
        <p className="lead">
          Workout not found. <Link to="/history">Back to history</Link>
        </p>
      </>
    );
  }

  const totalVolume = workout.exercises.reduce(
    (sum, ex) => sum + exerciseVolume(ex.sets),
    0
  );

  return (
    <>
      <div className="page-head">
        <div>
          <h1>{workout.routine_name || 'Empty workout'}</h1>
          <p className="lead">
            {formatDate(workout.started_at)} |{' '}
            <span className="mono">{workout.exercises.length}</span> exercises | total
            volume <span className="mono">{totalVolume.toLocaleString()}</span>
          </p>
        </div>
        <div className="card-actions">
          <Link to="/history">Back to history</Link>
          <button type="button" className="link-danger" onClick={remove}>
            Delete
          </button>
        </div>
      </div>

      {error && (
        <div className="form-error" role="alert">
          {error}
        </div>
      )}

      {workout.exercises.map((ex) => (
        <div className="card" key={ex.id}>
          <div className="card-head">
            <div>
              <h2>{ex.name}</h2>
              <p className="routine-meta">
                {ex.muscle_group.replace('_', ' ')} | volume{' '}
                <span className="mono">{exerciseVolume(ex.sets).toLocaleString()}</span>
              </p>
            </div>
          </div>
          {ex.note && <p className="exercise-note">{ex.note}</p>}
          <table className="sets-table">
            <thead>
              <tr>
                <th>#</th>
                <th>Weight</th>
                <th>Reps</th>
                <th>Partials</th>
              </tr>
            </thead>
            <tbody>
              {ex.sets.map((s) => (
                <tr key={s.set_number}>
                  <td className="mono">{s.set_number}</td>
                  <td className="mono">{s.weight}</td>
                  <td className="mono">{s.reps}</td>
                  <td className="mono">{s.partial_reps || '-'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ))}
    </>
  );
}
