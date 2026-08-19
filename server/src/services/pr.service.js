// Personal record detection.
//
// Runs INSIDE the workout-save transaction (it receives the transaction's
// connection), so a workout and the records it produces are committed - or
// rolled back - together.
//
// Record semantics (per user, per exercise):
//   MAX_WEIGHT - heaviest weight lifted for at least one FULL rep.
//                Bodyweight sets (weight 0) never produce a weight record.
//   MAX_REPS   - most full reps in a single set, at any weight.
//                Partial reps never count toward either record.
//
// Each record is one row per (user, exercise, type) - enforced by a UNIQUE
// key - updated in place when beaten. "Current PRs" therefore stays a
// trivial query, and each row remembers when and by which set it was set.
async function upsertRecord(conn, userId, exerciseId, recordType, candidate) {
  const [existing] = await conn.execute(
    `SELECT id, value FROM personal_records
     WHERE user_id = :userId AND exercise_id = :exerciseId AND record_type = :recordType`,
    { userId, exerciseId, recordType }
  );

  if (!existing[0]) {
    await conn.execute(
      `INSERT INTO personal_records
         (user_id, exercise_id, record_type, value, achieved_at, workout_set_id)
       VALUES (:userId, :exerciseId, :recordType, :value, NOW(), :setId)`,
      { userId, exerciseId, recordType, value: candidate.value, setId: candidate.setId }
    );
    return { exerciseId, record_type: recordType, value: candidate.value, previous_value: null };
  }

  const previous = Number(existing[0].value);
  if (candidate.value > previous) {
    await conn.execute(
      `UPDATE personal_records
       SET value = :value, achieved_at = NOW(), workout_set_id = :setId
       WHERE id = :id`,
      { value: candidate.value, setId: candidate.setId, id: existing[0].id }
    );
    return { exerciseId, record_type: recordType, value: candidate.value, previous_value: previous };
  }

  return null;
}

// exerciseSets: [{ exerciseId, sets: [{ setId, weight, reps }] }]
// Returns the records achieved by this workout (possibly empty), each with
// the exercise name attached so the client can render "New PR" notifications
// without a second request.
async function detectAndUpdateRecords(conn, userId, exerciseSets) {
  const achieved = [];

  for (const ex of exerciseSets) {
    let bestWeight = null; // { value, setId }
    let bestReps = null;

    for (const s of ex.sets) {
      if (s.reps >= 1 && s.weight > 0 && (!bestWeight || s.weight > bestWeight.value)) {
        bestWeight = { value: s.weight, setId: s.setId };
      }
      if (s.reps >= 1 && (!bestReps || s.reps > bestReps.value)) {
        bestReps = { value: s.reps, setId: s.setId };
      }
    }

    if (bestWeight) {
      const r = await upsertRecord(conn, userId, ex.exerciseId, 'MAX_WEIGHT', bestWeight);
      if (r) achieved.push(r);
    }
    if (bestReps) {
      const r = await upsertRecord(conn, userId, ex.exerciseId, 'MAX_REPS', bestReps);
      if (r) achieved.push(r);
    }
  }

  if (achieved.length === 0) return [];

  const ids = [...new Set(achieved.map((r) => r.exerciseId))];
  const placeholders = ids.map((_, i) => `:id${i}`).join(', ');
  const params = {};
  ids.forEach((id, i) => {
    params[`id${i}`] = id;
  });
  const [rows] = await conn.execute(
    `SELECT id, name FROM exercises WHERE id IN (${placeholders})`,
    params
  );
  const names = new Map(rows.map((r) => [r.id, r.name]));

  return achieved.map((r) => ({
    exercise_id: r.exerciseId,
    exercise_name: names.get(r.exerciseId) || null,
    record_type: r.record_type,
    value: r.value,
    previous_value: r.previous_value,
  }));
}

module.exports = { detectAndUpdateRecords };
