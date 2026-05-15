import { Hono } from 'hono';
import { Env, Variables } from '../../types/hono';
import { SsoController } from '../../controllers/SsoController';

const sso = new Hono<{ Bindings: Env; Variables: Variables }>();

sso.get('/init', SsoController.init);
sso.post('/callback', SsoController.callback);

export default sso;
