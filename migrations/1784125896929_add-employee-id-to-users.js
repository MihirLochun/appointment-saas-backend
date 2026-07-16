export const shorthands = undefined;

export const up = (pgm) => {
  pgm.addColumn('users', {
    employee_id: {
      type: 'integer',
      references: 'employees',
      onDelete: 'SET NULL',
    },
  });
};

export const down = (pgm) => {
  pgm.dropColumn('users', 'employee_id');
};