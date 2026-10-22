import worker from './index.js';
export default { fetch(request,env,ctx) { return worker.fetch(request,{...env,APP_MODE:'external'},ctx); } };
