import { Component } from '@angular/core';
import { RouterOutlet } from '@angular/router';

/**
 * Frame for the client view. M1 adds the firm's branding (name, logo and accent colour) and the
 * "Updates by Siteline" footer on the free plans (PRD F3).
 */
@Component({
  selector: 'sl-client-shell',
  imports: [RouterOutlet],
  template: `<router-outlet />`,
})
export class ClientShell {}
