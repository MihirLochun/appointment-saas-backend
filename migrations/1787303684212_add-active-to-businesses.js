export const up = (pgm) => {
  pgm.addColumn('businesses', {
    is_active: {
      type: 'boolean',
      notNull: true,
      default: true,
    },
  });
};

export const down = (pgm) => {
  pgm.dropColumn('businesses', 'is_active');
};