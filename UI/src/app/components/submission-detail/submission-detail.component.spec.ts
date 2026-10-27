import { ComponentFixture, TestBed } from '@angular/core/testing';

import { SubmissionDetailComponent } from './submission-detail.component';

describe('SubmissionDetailComponent', () => {
  let component: SubmissionDetailComponent;
  let fixture: ComponentFixture<SubmissionDetailComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [SubmissionDetailComponent]
    })
    .compileComponents();

    fixture = TestBed.createComponent(SubmissionDetailComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
