import { inject, Injectable } from '@angular/core';
import { NgbModal, NgbModalRef } from '@ng-bootstrap/ng-bootstrap';
import { SpinnerComponent } from '../../components/spinner/spinner.component';

@Injectable({
  providedIn: 'root',
})
export class SpinnerService {
  private modalService = inject(NgbModal);
  private modalRef?: NgbModalRef;

  openGlobalSpinner() {
    this.modalRef = this.modalService.open(SpinnerComponent, {
      backdrop: 'static',
      centered: true,
      windowClass: 'modalClass d-flex justify-content-center',
      keyboard: false,
    });
  }
  closeGlobalSpinner() {
    this.modalRef?.close();
  }
  constructor() {}
}
