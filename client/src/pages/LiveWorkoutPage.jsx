import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import api from '../api/client';
import { useAuth } from '../context/AuthContext';

function messageFrom(err) {
  return (
    (err.response && err.response.data && err.response.data.error) ||
    'Something went wrong. Try again.'
  );
}

function formatClock(total) {
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  const mm = String(m).padStart(2, '0');
  const ss = String(s).padStart(2, '0');
  return h > 0 ? `${h}:${mm}:${ss}` : `${m}:${ss}`;
}

const RECORD_LABELS = { MAX_WEIGHT: 'Max weight', MAX_REPS: 'Max reps' };
const DEFAULT_REST_SECONDS = 90;

// In-progress drafts live in localStorage, one key per user so a shared
// browser never offers one account's session to another. Every helper
// swallows storage errors (quota, private mode, storage disabled): the draft
// is a convenience, and the workout must keep working without it.
const DRAFT_KEY_PREFIX = 'fitness_platform_workout_draft';

function draftKeyFor(userId) {
  return `${DRAFT_KEY_PREFIX}:${userId}`;
}

function readDraft(key) {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return null;
    const draft = JSON.parse(raw);
    const valid =
      draft &&
      Array.isArray(draft.exercises) &&
      draft.exercises.length > 0 &&
      typeof draft.startedAt === 'string' &&
      Number.isFinite(Date.parse(draft.startedAt));
    return valid ? draft : null;
  } catch {
    return null;
  }
}

function writeDraft(key, draft) {
  try {
    localStorage.setItem(key, JSON.stringify(draft));
  } catch {
    // Best effort - never let a full or unavailable store break the session.
  }
}

function clearDraft(key) {
  try {
    localStorage.removeItem(key);
  } catch {
    // Same as above.
  }
}

// The live session. The CLIENT owns all in-progress state (per the batch-save
// design); pressing Finish sends the entire payload once. started_at is
// captured the moment this page mounts. Untouched pre-filled rows are simply
// skipped at save time, so abandoning a planned set never blocks finishing.
//
// Rest timer: marking a set Done starts a countdown using the exercise's
// rest_seconds target (or 90s). One rest runs at a time - logging the next
// set replaces it. The switch in the header disables the feature entirely.
export default function LiveWorkoutPage() {
  const [searchParams] = useSearchParams();
  const routineId = searchParams.get('routine');
  const navigate = useNavigate();
  const { user } = useAuth();
  const draftKey = draftKeyFor(user.id);

  const startedAtRef = useRef(new Date().toISOString());
  const keyRef = useRef(0);
  const nextKey = () => {
    keyRef.current += 1;
    return keyRef.current;
  };

  // A draft found on mount, held until the user chooses resume or discard.
  // Read synchronously (lazy initializer) so the prompt is the first thing
  // rendered and nothing below can touch storage before the decision.
  const [pendingDraft, setPendingDraft] = useState(() => readDraft(draftKey));
  // Set when a draft is resumed so the routine fetch, which may still be in
  // flight, doesn't pre-fill over the restored exercise list.
  const resumedRef = useRef(false);

  const [routineName, setRoutineName] = useState(null);
  const [exercises, setExercises] = useState([]);
  const [catalog, setCatalog] = useState([]);
  const [pickerId, setPickerId] = useState('');
  const [elapsed, setElapsed] = useState(0);
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [finished, setFinished] = useState(null);

  const [timerEnabled, setTimerEnabled] = useState(true);
  const [rest, setRest] = useState(null); // { remaining, total, name }

  function emptySet() {
    return { weight: '', reps: '', partial_reps: '', done: false };
  }

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const { data } = await api.get('/exercises');
        if (cancelled) return;
        setCatalog(data.exercises);
        if (routineId) {
          const res = await api.get(`/routines/${routineId}`);
          if (cancelled) return;
          const routine = res.data.routine;
          setRoutineName(routine.name);
          if (resumedRef.current) return; // the resumed draft owns the exercise list
          setExercises(
            routine.exercises.map((ex) => ({
              key: nextKey(),
              exercise_id: ex.exercise_id,
              name: ex.name,
              targetHint: `${ex.target_sets} x ${ex.target_reps_min}-${ex.target_reps_max}`,
              repHint: `${ex.target_reps_min}-${ex.target_reps_max}`,
              restSeconds: ex.rest_seconds,
              note: '',
              showNote: false,
              sets: Array.from({ length: ex.target_sets }, emptySet),
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
  }, [routineId]);

  useEffect(() => {
    if (finished) return undefined;
    const id = setInterval(() => setElapsed((s) => s + 1), 1000);
    return () => clearInterval(id);
  }, [finished]);

  // Countdown: a self-rescheduling one-second timeout while a rest is live.
  useEffect(() => {
    if (!rest || rest.remaining <= 0) return undefined;
    const id = setTimeout(
      () => setRest((r) => (r ? { ...r, remaining: r.remaining - 1 } : r)),
      1000
    );
    return () => clearTimeout(id);
  }, [rest]);

  // Auto-save: persist the session on every change. Paused while a draft
  // prompt is unanswered (so the stored draft can't be overwritten before the
  // user decides) and once the workout has been saved. An empty exercise
  // list has nothing worth resuming, so it clears the draft instead.
  useEffect(() => {
    if (pendingDraft || finished) return;
    if (exercises.length === 0) {
      clearDraft(draftKey);
      return;
    }
    writeDraft(draftKey, { exercises, startedAt: startedAtRef.current, routineId });
  }, [exercises, routineId, pendingDraft, finished, draftKey]);

  const nameById = useMemo(
    () => new Map(catalog.map((e) => [e.id, e.name])),
    [catalog]
  );

  function addExercise() {
    const exerciseId = Number(pickerId);
    if (!exerciseId) return;
    setExercises((xs) => [
      ...xs,
      {
        key: nextKey(),
        exercise_id: exerciseId,
        name: nameById.get(exerciseId) || `#${exerciseId}`,
        targetHint: null,
        repHint: 'reps',
        restSeconds: null,
        note: '',
        showNote: false,
        sets: [emptySet()],
      },
    ]);
    setPickerId('');
  }

  function patchExercise(key, patch) {
    setExercises((xs) => xs.map((ex) => (ex.key === key ? { ...ex, ...patch } : ex)));
  }

  function removeExercise(key) {
    setExercises((xs) => xs.filter((ex) => ex.key !== key));
  }

  function addSet(key) {
    setExercises((xs) =>
      xs.map((ex) => (ex.key === key ? { ...ex, sets: [...ex.sets, emptySet()] } : ex))
    );
  }

  function removeSet(key, index) {
    setExercises((xs) =>
      xs.map((ex) =>
        ex.key === key ? { ...ex, sets: ex.sets.filter((_, i) => i !== index) } : ex
      )
    );
  }

  function updateSet(key, index, field, value) {
    setExercises((xs) =>
      xs.map((ex) =>
        ex.key === key
          ? {
              ...ex,
              sets: ex.sets.map((s, i) => (i === index ? { ...s, [field]: value } : s)),
            }
          : ex
      )
    );
  }

  function toggleDone(exercise, index) {
    const wasDone = exercise.sets[index].done;
    updateSet(exercise.key, index, 'done', !wasDone);
    if (!wasDone && timerEnabled) {
      const total = exercise.restSeconds || DEFAULT_REST_SECONDS;
      setRest({ remaining: total, total, name: exercise.name });
    }
  }

  async function finishWorkout() {
    setError(null);
    const payloadExercises = [];
    for (const ex of exercises) {
      const sets = [];
      for (let i = 0; i < ex.sets.length; i++) {
        const s = ex.sets[i];
        const isEmpty = s.weight === '' && s.reps === '' && s.partial_reps === '';
        if (isEmpty) continue;
        const weight = Number(s.weight);
        const reps = s.reps === '' ? 0 : Number(s.reps);
        const partials = s.partial_reps === '' ? 0 : Number(s.partial_reps);
        if (s.weight === '' || !Number.isFinite(weight) || weight < 0) {
          setError(`${ex.name}, set ${i + 1}: enter a weight (0 is fine for bodyweight).`);
          return;
        }
        if (reps + partials < 1) {
          setError(`${ex.name}, set ${i + 1}: log at least one rep or partial rep.`);
          return;
        }
        sets.push({ weight, reps, partial_reps: partials });
      }
      if (sets.length > 0) {
        payloadExercises.push({
          exercise_id: ex.exercise_id,
          note: ex.note.trim() || null,
          sets,
        });
      }
    }

    if (payloadExercises.length === 0) {
      setError('Log at least one set before finishing.');
      return;
    }

    setSaving(true);
    try {
      const body = { started_at: startedAtRef.current, exercises: payloadExercises };
      if (routineId) body.routine_id = Number(routineId);
      const { data } = await api.post('/workouts', body);
      clearDraft(draftKey);
      setRest(null);
      setFinished(data);
    } catch (err) {
      setError(messageFrom(err));
      setSaving(false);
    }
  }

  function discard() {
    if (window.confirm('Discard this workout? Nothing has been saved.')) {
      clearDraft(draftKey);
      navigate('/workout');
    }
  }

    function resumeDraft() {
    const draft = pendingDraft;
    resumedRef.current = true;
    startedAtRef.current = draft.startedAt;
    // Re-key: the counter restarted with the page, and a routine pre-fill
    // may already have handed out some of the stored keys.
    setExercises(draft.exercises.map((ex) => ({ ...ex, key: nextKey() })));
    setElapsed(Math.max(0, Math.floor((Date.now() - Date.parse(draft.startedAt)) / 1000)));
    setPendingDraft(null);
    // The draft belongs to the routine it was started from, not to whatever
    // ?routine= is in the URL now (e.g. after "Start empty workout").
    const draftRoutineId = draft.routineId || null;
    if (draftRoutineId !== routineId) {
      navigate(draftRoutineId ? `/workout/live?routine=${draftRoutineId}` : '/workout/live', {
        replace: true,
      });
    }
  }

  function discardDraft() {
    clearDraft(draftKey);
    setPendingDraft(null);
  }

    if (pendingDraft) {
    const count = pendingDraft.exercises.length;
    const startedAt = new Date(pendingDraft.startedAt).toLocaleString(undefined, {
      weekday: 'short',
      hour: 'numeric',
      minute: '2-digit',
    });
    return (
      <div className="card finish-card">
        <h1>Resume your workout?</h1>
        <p className="lead">
          You have an unfinished session with <span className="mono">{count}</span>{' '}
          {count === 1 ? 'exercise' : 'exercises'}, started{' '}
          <span className="mono">{startedAt}</span>.
        </p>
        <div className="builder-actions">
          <button type="button" className="btn btn-primary" onClick={resumeDraft}>
            Resume
          </button>
          <button type="button" className="link-danger" onClick={discardDraft}>
            Discard
          </button>
        </div>
      </div>
    );
  }

  if (loading) {
    return <p className="lead">Setting up your session...</p>;
  }

  if (finished) {
    const totalSets = finished.workout.exercises.reduce(
      (sum, ex) => sum + ex.sets.length,
      0
    );
    return (
      <div className="card finish-card">
        <h1>Workout saved</h1>
        <p className="lead">
          <span className="mono">{formatClock(elapsed)}</span> on the clock,{' '}
          <span className="mono">{finished.workout.exercises.length}</span> exercises,{' '}
          <span className="mono">{totalSets}</span> sets.
        </p>
        {finished.new_records.length > 0 && (
          <div className="pr-list">
            {finished.new_records.map((r, i) => (
              <div className="pr-banner" key={i}>
                <span className="pr-flag">New PR</span>
                <span className="pr-text">
                  {r.exercise_name} - {RECORD_LABELS[r.record_type] || r.record_type}{' '}
                  <span className="mono">{r.value}</span>
                  {r.previous_value !== null && (
                    <span className="pr-prev">
                      {' '}
                      (was <span className="mono">{r.previous_value}</span>)
                    </span>
                  )}
                </span>
              </div>
            ))}
          </div>
        )}
        <div className="builder-actions">
          <Link to="/" className="btn btn-primary">
            Back to dashboard
          </Link>
          <Link to="/workout">Start another</Link>
        </div>
      </div>
    );
  }

  return (
    <>
      <div className="page-head live-head">
        <div>
          <h1>{routineName || 'Empty workout'}</h1>
          <p className="lead">
            Elapsed <span className="mono">{formatClock(elapsed)}</span>
          </p>
        </div>
        <div className="live-actions">
          <label className="timer-switch">
            <input
              type="checkbox"
              checked={timerEnabled}
              onChange={(e) => {
                setTimerEnabled(e.target.checked);
                if (!e.target.checked) setRest(null);
              }}
            />
            Rest timer
          </label>
          <button
            type="button"
            className="btn btn-primary"
            onClick={finishWorkout}
            disabled={saving}
          >
            {saving ? 'Saving...' : 'Finish workout'}
          </button>
          <button type="button" className="link-danger" onClick={discard}>
            Discard
          </button>
        </div>
      </div>

      {error && (
        <div className="form-error" role="alert">
          {error}
        </div>
      )}

      {exercises.map((ex) => (
        <div className="card exercise-block" key={ex.key}>
          <div className="card-head">
            <div>
              <h2>{ex.name}</h2>
              {ex.targetHint && (
                <p className="routine-meta">
                  Target <span className="mono">{ex.targetHint}</span>
                  {ex.restSeconds ? (
                    <span>
                      {' '}
                      | Rest <span className="mono">{ex.restSeconds}s</span>
                    </span>
                  ) : null}
                </p>
              )}
            </div>
            <div className="card-actions">
              <button
                type="button"
                className="icon-btn"
                onClick={() => patchExercise(ex.key, { showNote: !ex.showNote })}
              >
                {ex.showNote ? 'Hide note' : 'Add note'}
              </button>
              <button
                type="button"
                className="link-danger"
                onClick={() => removeExercise(ex.key)}
              >
                Remove
              </button>
            </div>
          </div>

          {ex.showNote && (
            <div className="field note-area">
              <label htmlFor={`note-${ex.key}`}>Note</label>
              <textarea
                id={`note-${ex.key}`}
                rows={2}
                maxLength={1000}
                placeholder="Form cue, seat height, anything worth remembering"
                value={ex.note}
                onChange={(e) => patchExercise(ex.key, { note: e.target.value })}
              />
            </div>
          )}

          <div className="set-row set-head" aria-hidden="true">
            <span>#</span>
            <span>Weight</span>
            <span>Reps</span>
            <span>Partials</span>
            <span></span>
            <span></span>
          </div>
          {ex.sets.map((s, i) => (
            <div className={s.done ? 'set-row set-done' : 'set-row'} key={i}>
              <span className="set-num mono">{i + 1}</span>
              <input
                type="number"
                min={0}
                max={9999.99}
                step="0.5"
                placeholder="0"
                aria-label={`${ex.name} set ${i + 1} weight`}
                value={s.weight}
                onChange={(e) => updateSet(ex.key, i, 'weight', e.target.value)}
              />
              <input
                type="number"
                min={0}
                max={100}
                placeholder={ex.repHint}
                aria-label={`${ex.name} set ${i + 1} reps`}
                value={s.reps}
                onChange={(e) => updateSet(ex.key, i, 'reps', e.target.value)}
              />
              <input
                type="number"
                min={0}
                max={100}
                placeholder="0"
                aria-label={`${ex.name} set ${i + 1} partial reps`}
                value={s.partial_reps}
                onChange={(e) => updateSet(ex.key, i, 'partial_reps', e.target.value)}
              />
              <button
                type="button"
                className={s.done ? 'done-btn active' : 'done-btn'}
                aria-pressed={s.done}
                onClick={() => toggleDone(ex, i)}
              >
                {s.done ? 'Logged' : 'Done'}
              </button>
              <button
                type="button"
                className="link-danger"
                onClick={() => removeSet(ex.key, i)}
                aria-label={`Remove set ${i + 1}`}
              >
                Remove
              </button>
            </div>
          ))}
          <button type="button" className="icon-btn add-set" onClick={() => addSet(ex.key)}>
            Add set
          </button>
        </div>
      ))}

      <div className="card">
        <h2>Add exercise</h2>
        <div className="picker-row">
          <select
            value={pickerId}
            onChange={(e) => setPickerId(e.target.value)}
            aria-label="Pick an exercise to add"
          >
            <option value="">Pick an exercise...</option>
            {catalog.map((e) => (
              <option key={e.id} value={e.id}>
                {e.name} - {e.muscle_group.replace('_', ' ')}
              </option>
            ))}
          </select>
          <button
            type="button"
            className="btn btn-primary"
            onClick={addExercise}
            disabled={!pickerId}
          >
            Add
          </button>
        </div>
      </div>

      {rest && (
        <div
          className={rest.remaining === 0 ? 'rest-bar rest-over' : 'rest-bar'}
          role="timer"
          aria-live="polite"
        >
          <div
            className="rest-track"
            style={{ width: `${(rest.remaining / rest.total) * 100}%` }}
          />
          <div className="rest-content">
            <span className="rest-label">
              {rest.remaining === 0 ? 'Rest over - go' : `Rest - ${rest.name}`}
            </span>
            <span className="rest-clock mono">{formatClock(rest.remaining)}</span>
            <button type="button" className="btn btn-ghost" onClick={() => setRest(null)}>
              {rest.remaining === 0 ? 'Dismiss' : 'Skip'}
            </button>
          </div>
        </div>
      )}
    </>
  );
}
