import { Component } from '@angular/core';

@Component({
    selector: 'app-spinner',
    template: ` <div
    class="spinner-border d-flex align-self-center"
    style="width: 3rem; height: 3rem;"
    role="status"
  >
    <span class="visually-hidden">Loading...</span>
  </div>`,
    standalone: false
})
export class SpinnerComponent {}
