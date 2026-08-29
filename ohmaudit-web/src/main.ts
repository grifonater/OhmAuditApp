import { bootstrapApplication } from '@angular/platform-browser';
import { appConfig } from './app/app.config';
import { AppComponent } from './app/app.component';

void bootstrapApplication(AppComponent, appConfig).catch((error: unknown) => {
  console.error(error);
  const root = document.querySelector('oa-root');
  if (root === null) return;
  const message = document.createElement('main');
  message.className = 'startup-error';
  const heading = document.createElement('h1');
  heading.textContent = navigator.onLine
    ? 'Ohm Audit could not start'
    : 'This device is not offline-ready yet';
  const guidance = document.createElement('p');
  guidance.textContent = navigator.onLine
    ? 'Refresh the page to try again. If the problem continues, contact your administrator.'
    : 'Reconnect once, open Ohm Audit, and download the job before working offline.';
  message.append(heading, guidance);
  root.replaceChildren(message);
});
