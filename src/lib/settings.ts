import { pool } from "./db";
import { DEFAULT_TEMPLATE, isTemplate, type TemplateName } from "./render";

export type UserSettings = {
  template: TemplateName;
};

// Read the user's current settings. Falls back to defaults if the row is
// missing for any reason (e.g. the user has never saved a setting).
export async function getUserSettings(userId: string): Promise<UserSettings> {
  try {
    const r = await pool.query(
      "SELECT template FROM user_settings WHERE user_id = $1",
      [userId],
    );
    const raw = r.rows[0]?.template;
    return { template: typeof raw === "string" && isTemplate(raw) ? raw : DEFAULT_TEMPLATE };
  } catch {
    return { template: DEFAULT_TEMPLATE };
  }
}

export async function setUserSettings(
  userId: string,
  s: UserSettings,
): Promise<UserSettings> {
  const r = await pool.query(
    `INSERT INTO user_settings (user_id, template, updated_at)
     VALUES ($1, $2, now())
     ON CONFLICT (user_id) DO UPDATE SET template = EXCLUDED.template, updated_at = now()
     RETURNING template`,
    [userId, s.template],
  );
  return { template: r.rows[0].template as TemplateName };
}