import { pool, transaction } from './db.mjs';
import { googleConfigured, startGoogle, finishGoogle } from './google-auth.mjs';
import { createMobileGoogleAuth } from './mobile-google-auth-core.mjs';

export const mobileGoogleAuth = createMobileGoogleAuth({ pool, transaction, startGoogle, finishGoogle, googleConfigured });
