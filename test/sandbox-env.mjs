// Isola anche il processo del runner, oltre alle home distinte dei singoli casi.
import { sandbox } from './helpers.mjs';
const suite = sandbox({ after: cleanup => process.once('exit', cleanup) });
Object.assign(process.env, suite.env);
