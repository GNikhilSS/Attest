import { ComponentFixture, TestBed } from '@angular/core/testing';

import { QuestionNavigationComponent } from './question-navigation.component';

describe('QuestionNavigationComponent', () => {
  let component: QuestionNavigationComponent;
  let fixture: ComponentFixture<QuestionNavigationComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [QuestionNavigationComponent]
    })
    .compileComponents();

    fixture = TestBed.createComponent(QuestionNavigationComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
