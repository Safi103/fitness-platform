-- Built-in global exercise catalog.
-- Safe to re-run: each row is inserted only if a global exercise with that
-- name does not already exist.
-- User-created custom exercises are never touched.
USE fitness_db;

INSERT INTO exercises (name, muscle_group, category, is_custom, created_by)
SELECT c.name, c.muscle_group, c.category, FALSE, NULL
FROM (
            SELECT 'Barbell Bench Press'    AS name, 'CHEST'     AS muscle_group, 'STRENGTH'    AS category
  UNION ALL SELECT 'Incline Dumbbell Press',       'CHEST',                       'HYPERTROPHY'
  UNION ALL SELECT 'Cable Fly',                    'CHEST',                       'HYPERTROPHY'
  UNION ALL SELECT 'Push-up',                      'CHEST',                       'STRENGTH'
  UNION ALL SELECT 'Deadlift',                     'BACK',                        'STRENGTH'
  UNION ALL SELECT 'Pull-up',                      'BACK',                        'STRENGTH'
  UNION ALL SELECT 'Barbell Row',                  'BACK',                        'STRENGTH'
  UNION ALL SELECT 'Lat Pulldown',                 'BACK',                        'HYPERTROPHY'
  UNION ALL SELECT 'Seated Cable Row',             'BACK',                        'HYPERTROPHY'
  UNION ALL SELECT 'Barbell Squat',                'LEGS',                        'STRENGTH'
  UNION ALL SELECT 'Romanian Deadlift',            'LEGS',                        'STRENGTH'
  UNION ALL SELECT 'Leg Press',                    'LEGS',                        'HYPERTROPHY'
  UNION ALL SELECT 'Walking Lunge',                'LEGS',                        'HYPERTROPHY'
  UNION ALL SELECT 'Leg Curl',                     'LEGS',                        'HYPERTROPHY'
  UNION ALL SELECT 'Standing Calf Raise',          'LEGS',                        'HYPERTROPHY'
  UNION ALL SELECT 'Overhead Press',               'SHOULDERS',                   'STRENGTH'
  UNION ALL SELECT 'Lateral Raise',                'SHOULDERS',                   'HYPERTROPHY'
  UNION ALL SELECT 'Face Pull',                    'SHOULDERS',                   'HYPERTROPHY'
  UNION ALL SELECT 'Barbell Curl',                 'ARMS',                        'HYPERTROPHY'
  UNION ALL SELECT 'Hammer Curl',                  'ARMS',                        'HYPERTROPHY'
  UNION ALL SELECT 'Triceps Pushdown',             'ARMS',                        'HYPERTROPHY'
  UNION ALL SELECT 'Skull Crusher',                'ARMS',                        'HYPERTROPHY'
  UNION ALL SELECT 'Plank',                        'CORE',                        'STRENGTH'
  UNION ALL SELECT 'Hanging Leg Raise',            'CORE',                        'STRENGTH'
  UNION ALL SELECT 'Cable Crunch',                 'CORE',                        'HYPERTROPHY'
  UNION ALL SELECT 'Kettlebell Swing',             'FULL_BODY',                   'STRENGTH'
  UNION ALL SELECT 'Burpee',                       'FULL_BODY',                   'CARDIO'
  UNION ALL SELECT 'Rowing Machine',               'FULL_BODY',                   'CARDIO'
  UNION ALL SELECT 'Treadmill Run',                'FULL_BODY',                   'CARDIO'
) AS c
WHERE NOT EXISTS (
  SELECT 1 FROM exercises e
  WHERE e.name = c.name AND e.is_custom = FALSE
);