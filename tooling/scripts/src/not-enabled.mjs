const stage = process.argv[2] ?? 'this test stage';
const task = process.argv[3] ?? 'a later task';

console.error(
  `NOT_RUN: ${stage} is not enabled until ${task} provides its fixtures.`,
);
process.exit(2);
