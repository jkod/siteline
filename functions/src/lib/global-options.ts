import { setGlobalOptions } from 'firebase-functions/v2';
import { REGION } from '@siteline/shared';

// Imported first in index.ts: ES module imports are evaluated in order, so this must run before
// any module that defines a function, or those functions land in the default region.
setGlobalOptions({ region: REGION });
