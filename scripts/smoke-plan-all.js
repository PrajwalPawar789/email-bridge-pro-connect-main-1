import { runPlanSmokeTest } from './smoke-plan-constraints.js';

const plans = ['free', 'growth', 'scale', 'enterprise'];

const run = async () => {
  for (const planId of plans) {
    await runPlanSmokeTest({ planId });
  }
};

run().catch((error) => {
  console.error(String(error?.stack || error));
  process.exit(1);
});
