ALTER TABLE projects
  ADD CONSTRAINT projects_id_user_id_unique UNIQUE (id, user_id);

ALTER TABLE tasks
  ADD COLUMN IF NOT EXISTS schedule_weekdays SMALLINT[],
  ADD COLUMN IF NOT EXISTS tags TEXT[] NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS project_id UUID,
  ADD CONSTRAINT tasks_project_owner_fk
    FOREIGN KEY (project_id, user_id)
    REFERENCES projects(id, user_id)
    ON DELETE SET NULL (project_id);

ALTER TABLE tasks
  ADD CONSTRAINT tasks_schedule_weekdays_valid
    CHECK (
      schedule_weekdays IS NULL
      OR (
        cardinality(schedule_weekdays) BETWEEN 1 AND 7
        AND schedule_weekdays <@ ARRAY[0, 1, 2, 3, 4, 5, 6]::SMALLINT[]
      )
    ),
  ADD CONSTRAINT tasks_tags_valid
    CHECK (
      cardinality(tags) <= 12
      AND array_position(tags, '') IS NULL
    );

CREATE INDEX IF NOT EXISTS idx_tasks_project_owner
  ON tasks(project_id, user_id) WHERE project_id IS NOT NULL;
