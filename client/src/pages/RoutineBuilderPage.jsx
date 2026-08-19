import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import api from '../api/client';

function messageFrom(err) {
  return (
    (err.response && err.response.data && err.response.data.error) ||
    'Something went wrong. Try again.'
  );
}

const DEFAULT_TARGETS = {
  target_sets: '3',
  target_reps_min: '8',
  target_reps_max: '12',
  rest_seconds: '90',
};

// Create and edit routines. Inputs hold raw strings so typing stays natural;
// values are converted and validated on save (the API re-validates
// everything server-side). Row order in the list IS the routine order -
// the API assigns order_index from array position.
export default function RoutineBuilderPage() {
  const { id } = useParams();
  const editing = Boolean(id);
  const navigate = useNavigate();

  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [rows, setRows] = useState([]);
  const [catalog, setCatalog] = useState([]);
  const [pickerId, setPickerId] = useState('');
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const { data } = await api.get('/exercises');
        if (cancelled) return;
        setCatalog(data.exercises);
        if (editing) {
          const res = await api.get(`/routines/${id}`);
          if (cancelled) return;
          const routine = res.data.routine;
          setName(routine.name);
          setDescription(routine.description || '');
          setRows(
            routine.exercises.map((ex) => ({
              exercise_id: ex.exercise_id,
              target_sets: String(ex.target_sets),
              target_reps_min: String(ex.target_reps_min),
              target_reps_max: String(ex.target_reps_max),
              rest_seconds: ex.rest_seconds === null ? '' : String(ex.rest_seconds),
            }))
          );
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
  }, [id, editing]);

  const nameById = useMemo(
    () => new Map(catalog.map((e) => [e.id, e.name])),
    [catalog]
  );

  function addRow() {
    const exerciseId = Number(pickerId);
    if (!exerciseId) return;
    setRows((rs) => [...rs, { exercise_id: exerciseId, ...DEFAULT_TARGETS }]);
    setPickerId('');
  }

  function updateRow(index, field, value) {
    setRows((rs) => rs.map((row, i) => (i === index ? { ...row, [field]: value } : row)));
  }

  function removeRow(index) {
    setRows((rs) => rs.filter((_, i) => i !== index));
  }

  function moveRow(index, delta) {
    setRows((rs) => {
      const target = index + delta;
      if (target < 0 || target >= rs.length) return rs;
      const next = [...rs];
      const tmp = next[index];
      next[index] = next[target];
      next[target] = tmp;
      return next;
    });
  }

  async function save(event) {
    event.preventDefault();
    setError(null);
    if (rows.length === 0) {
      setError('Add at least one exercise before saving.');
      return;
    }
    const payload = {
      name,
      description: description.trim() || null,
      exercises: rows.map((row) => ({
        exercise_id: row.exercise_id,
        target_sets: Number(row.target_sets),
        target_reps_min: Number(row.target_reps_min),
        target_reps_max: Number(row.target_reps_max),
        rest_seconds: row.rest_seconds === '' ? null : Number(row.rest_seconds),
      })),
    };
    setSaving(true);
    try {
      if (editing) {
        await api.put(`/routines/${id}`, payload);
      } else {
        await api.post('/routines', payload);
      }
      navigate('/routines');
    } catch (err) {
      setError(messageFrom(err));
      setSaving(false);
    }
  }

  if (loading) {
    return <p className="lead">Loading...</p>;
  }

  return (
    <>
      <div className="page-head">
        <h1>{editing ? 'Edit routine' : 'New routine'}</h1>
      </div>

      {error && (
        <div className="form-error" role="alert">
          {error}
        </div>
      )}

      <form onSubmit={save}>
        <div className="card">
          <div className="field">
            <label htmlFor="r-name">Name</label>
            <input
              id="r-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Push day"
              minLength={2}
              maxLength={100}
              required
            />
          </div>
          <div className="field">
            <label htmlFor="r-desc">
              Description <span className="hint">(optional)</span>
            </label>
            <textarea
              id="r-desc"
              rows={2}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
            />
          </div>
        </div>

        <div className="card">
          <h2>Exercises</h2>
          <div className="picker-row">
            <select
              value={pickerId}
              onChange={(e) => setPickerId(e.target.value)}
              aria-label="Pick an exercise to add"
            >
              <option value="">Pick an exercise...</option>
              {catalog.map((ex) => (
                <option key={ex.id} value={ex.id}>
                  {ex.name} - {ex.muscle_group.replace('_', ' ')}
                </option>
              ))}
            </select>
            <button
              type="button"
              className="btn btn-primary"
              onClick={addRow}
              disabled={!pickerId}
            >
              Add
            </button>
          </div>

          {rows.length === 0 ? (
            <p className="lead">Nothing here yet. Pick an exercise above to start the program.</p>
          ) : (
            <>
              <div className="builder-row builder-head" aria-hidden="true">
                <span>Exercise</span>
                <span>Sets</span>
                <span>Reps min</span>
                <span>Reps max</span>
                <span>Rest (s)</span>
                <span></span>
              </div>
              {rows.map((row, i) => (
                <div className="builder-row" key={`${row.exercise_id}-${i}`}>
                  <span className="name">
                    {nameById.get(row.exercise_id) || `#${row.exercise_id}`}
                  </span>
                  <input
                    type="number"
                    min={1}
                    max={20}
                    value={row.target_sets}
                    onChange={(e) => updateRow(i, 'target_sets', e.target.value)}
                    aria-label="Target sets"
                    required
                  />
                  <input
                    type="number"
                    min={1}
                    max={100}
                    value={row.target_reps_min}
                    onChange={(e) => updateRow(i, 'target_reps_min', e.target.value)}
                    aria-label="Minimum reps"
                    required
                  />
                  <input
                    type="number"
                    min={1}
                    max={100}
                    value={row.target_reps_max}
                    onChange={(e) => updateRow(i, 'target_reps_max', e.target.value)}
                    aria-label="Maximum reps"
                    required
                  />
                  <input
                    type="number"
                    min={0}
                    max={3600}
                    value={row.rest_seconds}
                    onChange={(e) => updateRow(i, 'rest_seconds', e.target.value)}
                    aria-label="Rest seconds"
                    placeholder="none"
                  />
                  <span className="row-actions">
                    <button
                      type="button"
                      className="icon-btn"
                      onClick={() => moveRow(i, -1)}
                      disabled={i === 0}
                    >
                      Up
                    </button>
                    <button
                      type="button"
                      className="icon-btn"
                      onClick={() => moveRow(i, 1)}
                      disabled={i === rows.length - 1}
                    >
                      Down
                    </button>
                    <button
                      type="button"
                      className="link-danger"
                      onClick={() => removeRow(i)}
                    >
                      Remove
                    </button>
                  </span>
                </div>
              ))}
            </>
          )}
        </div>

        <div className="builder-actions">
          <button type="submit" className="btn btn-primary" disabled={saving}>
            {saving ? 'Saving...' : editing ? 'Save changes' : 'Create routine'}
          </button>
          <Link to="/routines">Cancel</Link>
        </div>
      </form>
    </>
  );
}
