import { runPlanSmokeTest } from './smoke-plan-constraints.js';

runPlanSmokeTest({ planId: 'scale' }).catch((error) => {
  console.error(String(error?.stack || error));
  process.exit(1);
});
