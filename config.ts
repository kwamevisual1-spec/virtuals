/** Email that automatically becomes the admin (must match supabase/schema.sql). */
export const ADMIN_EMAIL = (
  process.env.ADMIN_EMAIL || "stevewealthstrategist@gmail.com"
)
  .trim()
  .toLowerCase();
