/** Detect Supabase "table/bucket not created yet" errors. */
export function isMissingSchemaError(err: any): boolean {
  const msg = String(err?.message || "") + " " + String(err?.details || "") + " " + String(err?.hint || "");
  return /does not exist|could not find the table|schema cache|relation .*? is not present/i.test(msg);
}

export const SETUP_HINT =
  "Supabase tables not found yet. Open the Supabase dashboard → SQL Editor and run the contents of supabase/schema.sql, then try again.";
