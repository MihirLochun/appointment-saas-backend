export const shorthands = undefined;

export const up = (pgm) => {
  // Drop the old single-column primary key first.
  pgm.dropConstraint('business_hours', 'business_hours_pkey');

  pgm.addColumn('business_hours', {
    business_id: { type: 'integer', references: 'businesses', onDelete: 'RESTRICT' },
  });

  pgm.sql(`UPDATE business_hours SET business_id = 1`);

  pgm.alterColumn('business_hours', 'business_id', { notNull: true });

  // Composite primary key: the combination of business_id + day_of_week
  // must be unique, instead of day_of_week alone.
  pgm.addConstraint('business_hours', 'business_hours_pkey', {
    primaryKey: ['business_id', 'day_of_week'],
  });
};

export const down = (pgm) => {
  pgm.dropConstraint('business_hours', 'business_hours_pkey');
  pgm.dropColumn('business_hours', 'business_id');
  pgm.addConstraint('business_hours', 'business_hours_pkey', {
    primaryKey: 'day_of_week',
  });
};