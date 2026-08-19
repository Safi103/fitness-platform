-- ===========================================================================
-- Fitness Management and Analytics Platform - MySQL 8 schema
-- Run:  mysql -u root -p < database/schema.sql
--
-- Deletion semantics:
--   * Ownership chains CASCADE (a user's routines, sessions, sets and PRs
--     are removed with the user).
--   * workout_sessions.routine_id is SET NULL so workout history survives
--     when a routine is deleted.
--   * routine_exercises.exercise_id CASCADEs: deleting a custom exercise
--     drops it from the routines that prescribe it (intentional - a routine
--     is an editable plan, not a record of what happened).
--   * session_exercises and personal_records RESTRICT, so an exercise that
--     was actually lifted can never be deleted.
-- ===========================================================================

CREATE DATABASE IF NOT EXISTS fitness_db
  CHARACTER SET utf8mb4
  COLLATE utf8mb4_unicode_ci;

USE fitness_db;

-- 1. Registered accounts and baseline profile metrics
CREATE TABLE IF NOT EXISTS users (
  id              INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  name            VARCHAR(100)     NOT NULL,
  email           VARCHAR(255)     NOT NULL UNIQUE,
  password_hash   VARCHAR(255)     NOT NULL,
  age             TINYINT UNSIGNED NULL,
  body_weight     DECIMAL(5,2)     NULL COMMENT 'in the user preferred unit',
  height          DECIMAL(5,2)     NULL COMMENT 'centimeters',
  unit_preference ENUM('KG','LBS') NOT NULL DEFAULT 'KG',
  created_at      DATETIME         NOT NULL DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB;

-- 2. Exercise catalog: global rows have is_custom = FALSE and created_by
--    NULL; user-defined rows point at their creator.
CREATE TABLE IF NOT EXISTS exercises (
  id           INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  name         VARCHAR(100) NOT NULL,
  muscle_group ENUM('CHEST','BACK','LEGS','SHOULDERS','ARMS','CORE','FULL_BODY') NOT NULL,
  category     ENUM('STRENGTH','HYPERTROPHY','CARDIO') NOT NULL,
  is_custom    BOOLEAN NOT NULL DEFAULT FALSE,
  created_by   INT UNSIGNED NULL,
  CONSTRAINT fk_exercises_user FOREIGN KEY (created_by)
    REFERENCES users (id) ON DELETE SET NULL,
  INDEX idx_exercises_name (name),
  INDEX idx_exercises_muscle (muscle_group),
  INDEX idx_exercises_category (category)
) ENGINE=InnoDB;

-- 3. Named workout programs owned by one user
CREATE TABLE IF NOT EXISTS routines (
  id          INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  user_id     INT UNSIGNED NOT NULL,
  name        VARCHAR(100) NOT NULL,
  description TEXT NULL,
  created_at  DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_routines_user FOREIGN KEY (user_id)
    REFERENCES users (id) ON DELETE CASCADE
) ENGINE=InnoDB;

-- 4. Exercises inside a routine, with prescribed targets
CREATE TABLE IF NOT EXISTS routine_exercises (
  id              INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  routine_id      INT UNSIGNED NOT NULL,
  exercise_id     INT UNSIGNED NOT NULL,
  order_index     INT UNSIGNED NOT NULL DEFAULT 0,
  target_sets     TINYINT UNSIGNED NOT NULL,
  target_reps_min TINYINT UNSIGNED NOT NULL,
  target_reps_max TINYINT UNSIGNED NOT NULL,
  rest_seconds    SMALLINT UNSIGNED NULL,
  CONSTRAINT fk_re_routine  FOREIGN KEY (routine_id)
    REFERENCES routines (id) ON DELETE CASCADE,
  CONSTRAINT fk_re_exercise FOREIGN KEY (exercise_id)
    REFERENCES exercises (id) ON DELETE CASCADE,
  CONSTRAINT chk_re_sets CHECK (target_sets >= 1),
  CONSTRAINT chk_re_reps CHECK (target_reps_min <= target_reps_max)
) ENGINE=InnoDB;

-- 5. Weekday assignments (0 = Sunday ... 6 = Saturday)
CREATE TABLE IF NOT EXISTS routine_schedules (
  id          INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  routine_id  INT UNSIGNED NOT NULL,
  day_of_week TINYINT UNSIGNED NOT NULL,
  CONSTRAINT fk_rs_routine FOREIGN KEY (routine_id)
    REFERENCES routines (id) ON DELETE CASCADE,
  CONSTRAINT chk_rs_day CHECK (day_of_week BETWEEN 0 AND 6),
  UNIQUE KEY uq_routine_day (routine_id, day_of_week)
) ENGINE=InnoDB;

-- 6. One logged workout. routine_id NULL means an "empty workout".
CREATE TABLE IF NOT EXISTS workout_sessions (
  id           INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  user_id      INT UNSIGNED NOT NULL,
  routine_id   INT UNSIGNED NULL,
  started_at   DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  completed_at DATETIME NULL,
  CONSTRAINT fk_ws_user    FOREIGN KEY (user_id)
    REFERENCES users (id) ON DELETE CASCADE,
  CONSTRAINT fk_ws_routine FOREIGN KEY (routine_id)
    REFERENCES routines (id) ON DELETE SET NULL,
  INDEX idx_ws_user_started (user_id, started_at)
) ENGINE=InnoDB;

-- 7. Exercises actually performed in a session (+ optional note)
CREATE TABLE IF NOT EXISTS session_exercises (
  id          INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  session_id  INT UNSIGNED NOT NULL,
  exercise_id INT UNSIGNED NOT NULL,
  order_index INT UNSIGNED NOT NULL DEFAULT 0,
  note        TEXT NULL,
  CONSTRAINT fk_se_session  FOREIGN KEY (session_id)
    REFERENCES workout_sessions (id) ON DELETE CASCADE,
  CONSTRAINT fk_se_exercise FOREIGN KEY (exercise_id)
    REFERENCES exercises (id) ON DELETE RESTRICT
) ENGINE=InnoDB;

-- 8. The atomic log line: one performed set
CREATE TABLE IF NOT EXISTS workout_sets (
  id                  INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  session_exercise_id INT UNSIGNED NOT NULL,
  set_number          TINYINT UNSIGNED NOT NULL,
  weight              DECIMAL(6,2) NOT NULL,
  reps                TINYINT UNSIGNED NOT NULL,
  partial_reps        TINYINT UNSIGNED NOT NULL DEFAULT 0,
  CONSTRAINT fk_sets_se FOREIGN KEY (session_exercise_id)
    REFERENCES session_exercises (id) ON DELETE CASCADE
) ENGINE=InnoDB;

-- 9. Current best per (user, exercise, type); updated in place when beaten.
CREATE TABLE IF NOT EXISTS personal_records (
  id             INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  user_id        INT UNSIGNED NOT NULL,
  exercise_id    INT UNSIGNED NOT NULL,
  record_type    ENUM('MAX_WEIGHT','MAX_REPS') NOT NULL,
  value          DECIMAL(6,2) NOT NULL,
  achieved_at    DATETIME NOT NULL,
  workout_set_id INT UNSIGNED NULL,
  CONSTRAINT fk_pr_user     FOREIGN KEY (user_id)
    REFERENCES users (id) ON DELETE CASCADE,
  CONSTRAINT fk_pr_exercise FOREIGN KEY (exercise_id)
    REFERENCES exercises (id) ON DELETE RESTRICT,
  CONSTRAINT fk_pr_set      FOREIGN KEY (workout_set_id)
    REFERENCES workout_sets (id) ON DELETE SET NULL,
  UNIQUE KEY uq_pr (user_id, exercise_id, record_type)
) ENGINE=InnoDB;
