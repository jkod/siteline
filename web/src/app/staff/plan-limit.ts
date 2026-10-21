import { inject } from '@angular/core';
import { Router } from '@angular/router';

import { TranslateService } from '@ngx-translate/core';

import { Session } from '../core/session';
import { Dialogs } from '../shared/ui/dialog';

/**
 * Explains a plan limit the server enforced and offers an upgrade (PRD F2). Owners go to
 * billing; admins are told to ask an owner.
 */
export function usePlanLimitDialog() {
  const dialogs = inject(Dialogs);
  const translate = inject(TranslateService);
  const router = inject(Router);
  const session = inject(Session);
  return async (): Promise<void> => {
    const t = (key: string) => translate.instant(key) as string;
    const isOwner = session.role() === 'owner';
    const upgrade = await dialogs.confirm({
      title: t('planLimit.title'),
      message: t(isOwner ? 'planLimit.bodyOwner' : 'planLimit.bodyAdmin'),
      confirmLabel: t(isOwner ? 'planLimit.seePlans' : 'common.ok'),
      cancelLabel: t('common.close'),
    });
    if (upgrade && isOwner) await router.navigateByUrl('/app/settings/billing');
  };
}
