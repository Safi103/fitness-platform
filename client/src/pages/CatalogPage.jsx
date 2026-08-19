import { useEffect, useState } from 'react';
import api from '../api/client';

const MUSCLE_GROUPS = ['CHEST', 'BACK', 'LEGS', 'SHOULDERS', 'ARMS', 'CORE', 'FULL_BODY'];
const CATEGORIES = ['STRENGTH', 'HYPERTROPHY', 'CARDIO'];

function labelize(value) {
  return value.replace('_', ' ');
}

function messageFrom(err) {
  return (
    (err.response && err.response.data && err.response.data.error) ||
    'Something went wrong. Try again.'
  );
}

// The catalog: the built-in library plus the user's own custom exercises.
// Search and filters are server-side (the API composes them with AND);
// typing is debounced so we do not query on every keystroke.
export default function CatalogPage() {
  const [search, setSearch] = useState('');
  const [muscleGroup, setMuscleGroup] = useState('');
  const [category, setCategory] = useState('');
  const [reloadKey, setReloadKey] = useState(0);

  const [exercises, setExercises] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ name: '', muscle_group: 'CHEST', category: 'STRENGTH' });
  const [formError, setFormError] = useState(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let cancelled = false;
    const timer = setTimeout(async () => {
      setLoading(true);
      setError(null);
      try {
        const params = {};
        if (search.trim()) params.search = search.trim();
        if (muscleGroup) params.muscle_group = muscleGroup;
        if (category) params.category = category;
        const { data } = await api.get('/exercises', { params });
        if (!cancelled) setExercises(data.exercises);
      } catch (err) {
        if (!cancelled) setError(messageFrom(err));
      } finally {
        if (!cancelled) setLoading(false);
      }
    }, 250);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [search, muscleGroup, category, reloadKey]);

  function reload() {
    setReloadKey((k) => k + 1);
  }

  async function createExercise(event) {
    event.preventDefault();
    setFormError(null);
    setSaving(true);
    try {
      await api.post('/exercises', { ...form, name: form.name.trim() });
      setForm({ name: '', muscle_group: 'CHEST', category: 'STRENGTH' });
      setShowForm(false);
      reload();
    } catch (err) {
      setFormError(messageFrom(err));
    } finally {
      setSaving(false);
    }
  }

  async function removeExercise(exercise) {
    const ok = window.confirm(
      `Delete "${exercise.name}"?\n\n` +
        'It will also be removed from any routine that prescribes it. ' +
        'Logged workout history and personal records are never affected.'
    );
    if (!ok) return;
    setError(null);
    try {
      await api.delete(`/exercises/${exercise.id}`);
      reload();
    } catch (err) {
      // The API answers 409 when the exercise appears in logged workouts.
      setError(messageFrom(err));
    }
  }

  return (
    <>
      <div className="page-head">
        <div>
          <h1>Exercise catalog</h1>
          <p className="lead">The built-in library plus your own custom exercises.</p>
        </div>
        <button
          type="button"
          className="btn btn-primary"
          onClick={() => setShowForm((v) => !v)}
        >
          {showForm ? 'Close' : 'Add custom exercise'}
        </button>
      </div>

      {showForm && (
        <div className="card inline-form">
          <h2>New custom exercise</h2>
          {formError && (
            <div className="form-error" role="alert">
              {formError}
            </div>
          )}
          <form onSubmit={createExercise} className="form-grid">
            <div className="field">
              <label htmlFor="ex-name">Name</label>
              <input
                id="ex-name"
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                minLength={2}
                maxLength={100}
                required
              />
            </div>
            <div className="field">
              <label htmlFor="ex-mg">Muscle group</label>
              <select
                id="ex-mg"
                value={form.muscle_group}
                onChange={(e) => setForm({ ...form, muscle_group: e.target.value })}
              >
                {MUSCLE_GROUPS.map((m) => (
                  <option key={m} value={m}>
                    {labelize(m)}
                  </option>
                ))}
              </select>
            </div>
            <div className="field">
              <label htmlFor="ex-cat">Category</label>
              <select
                id="ex-cat"
                value={form.category}
                onChange={(e) => setForm({ ...form, category: e.target.value })}
              >
                {CATEGORIES.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
            </div>
            <button type="submit" className="btn btn-primary" disabled={saving}>
              {saving ? 'Saving...' : 'Save exercise'}
            </button>
          </form>
        </div>
      )}

      <div className="toolbar">
        <input
          type="search"
          placeholder="Search exercises"
          aria-label="Search exercises"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <select
          value={muscleGroup}
          onChange={(e) => setMuscleGroup(e.target.value)}
          aria-label="Filter by muscle group"
        >
          <option value="">All muscle groups</option>
          {MUSCLE_GROUPS.map((m) => (
            <option key={m} value={m}>
              {labelize(m)}
            </option>
          ))}
        </select>
        <select
          value={category}
          onChange={(e) => setCategory(e.target.value)}
          aria-label="Filter by category"
        >
          <option value="">All categories</option>
          {CATEGORIES.map((c) => (
            <option key={c} value={c}>
              {c}
            </option>
          ))}
        </select>
      </div>

      {error && (
        <div className="form-error" role="alert">
          {error}
        </div>
      )}

      {loading ? (
        <p className="lead">Loading catalog...</p>
      ) : exercises.length === 0 ? (
        <div className="empty-state">
          No exercises match. Clear the filters or add a custom exercise.
        </div>
      ) : (
        <div>
          {exercises.map((ex) => (
            <div className="list-row" key={ex.id}>
              <div>
                <span className="name">{ex.name}</span>
                <div className="row-tags">
                  <span className={`tag tag-${ex.category.toLowerCase()}`}>{ex.category}</span>
                  <span className="tag">{labelize(ex.muscle_group)}</span>
                  {!!ex.is_custom && <span className="tag tag-custom">Custom</span>}
                </div>
              </div>
              {!!ex.is_custom && (
                <button
                  type="button"
                  className="link-danger"
                  onClick={() => removeExercise(ex)}
                >
                  Delete
                </button>
              )}
            </div>
          ))}
        </div>
      )}
    </>
  );
}
