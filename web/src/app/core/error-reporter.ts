import { ErrorHandler, inject, Injectable } from '@angular/core';

import { type ClientError, redactPath } from '@siteline/shared';

import { environment } from '../../environments/environment';
import { FirebaseService } from './firebase';

const MAX_REPORTS_PER_PAGE_LOAD = 10;

/**
 * Logs uncaught errors and reports them through the `logClientError` callable, without
 * personal data: paths are redacted and only the error's name, message and stack are sent.
 */
@Injectable()
export class ErrorReporter implements ErrorHandler {
  private readonly firebase = inject(FirebaseService);
  private reported = 0;

  handleError(error: unknown): void {
    console.error(error);
    if (this.reported >= MAX_REPORTS_PER_PAGE_LOAD) return;
    this.reported++;
    const report: ClientError = {
      name: error instanceof Error ? error.name.slice(0, 100) : undefined,
      message: (error instanceof Error ? error.message : String(error)).slice(0, 500),
      stack: error instanceof Error ? error.stack?.slice(0, 4000) : undefined,
      path: redactPath(location.pathname),
      release: environment.release,
    };
    this.firebase.call('logClientError', report).catch(() => {
      // Reporting is best effort.
    });
  }
}
