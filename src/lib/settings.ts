import { pool } from "./db";
import { DEFAULT_TEMPLATE, isTemplate, type TemplateName } from "./render";

export type UserSettings = {
  template: TemplateName;
};

// Read the user's current settings. Falls back to defaults if the row is
// missing for any reason (e.g. migration hasn't been run yet on a stale env).
export async function getUserSettings(): Promise<UserSettings> {
  try {
    const r = await pool.query("SELECT template FROM user_settings WHERE id = 1");
    const raw = r.rows[0]?.template;
    return { template: typeof raw === "string" && isTemplate(raw) ? raw : DEFAULT_TEMPLATE };
  } catch {
    return { template: DEFAULT_TEMPLATE };
  }
}

export async function setUserSettings(s: UserSettings): Promise<UserSettings> {
  const r = await pool.query(
    `INSERT INTO user_settings (id, template, updated_at)
     VALUES (1, $1, now())
     ON CONFLICT (id) DO UPDATE SET template = EXCLUDED.template, updated_at = now()
     RETURNING template`,
    [s.template],
  );
  return { template: r.rows[0].template as TemplateName };
}
