// Builds the web app for the Firebase project being deployed: the staging configuration for
// siteline-staging, production otherwise. Run by the hosting predeploy step in firebase.json,
// where the Firebase CLI sets GCLOUD_PROJECT.
import { execSync } from 'node:child_process';

const project = process.env.GCLOUD_PROJECT ?? '';
const configuration = project === 'siteline-staging' ? 'staging' : 'production';
console.log(`Building the web app (${configuration}) for ${project || 'an unknown project'}`);
execSync(`npx ng build siteline --configuration ${configuration}`, {
  cwd: new URL('../../..', import.meta.url),
  stdio: 'inherit',
});
