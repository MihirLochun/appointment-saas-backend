export const shorthands = undefined;

export const up = (pgm) => {
  pgm.sql(`ALTER TYPE user_role ADD VALUE 'super_admin'`);
};

export const down = (pgm) => {
  // Postgres doesn't support removing ENUM values directly. A real
  // rollback would require recreating the type entirely -- acceptable
  // to leave this as a no-op for now, since it's rarely actually reversed.
};