import { ComponentFixture, TestBed } from '@angular/core/testing';

import { ExamHeaderComponent } from './exam-header.component';

describe('ExamHeaderComponent', () => {
  let component: ExamHeaderComponent;
  let fixture: ComponentFixture<ExamHeaderComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [ExamHeaderComponent]
    })
    .compileComponents();

    fixture = TestBed.createComponent(ExamHeaderComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
