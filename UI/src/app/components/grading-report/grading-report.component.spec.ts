import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ActivatedRoute, convertToParamMap, provideRouter } from '@angular/router';
import { HttpErrorResponse } from '@angular/common/http';
import { of, Subject, throwError } from 'rxjs';
import { AttemptService } from '../../core/services/attempt.service';
import { GradingReview } from '../../models/grading-review.model';
import { GradingReportComponent } from './grading-report.component';

describe('GradingReportComponent', () => {
  let component: GradingReportComponent;
  let fixture: ComponentFixture<GradingReportComponent>;
  let service: jasmine.SpyObj<AttemptService>;
  let review: GradingReview;

  beforeEach(async () => {
    review = {
      id: 4, employeeId: 2, skillId: 1, proficiencyLevel: 2, status: 'GRADED',
      createdAt: '2026-10-26T08:00:00Z', startTime: null, deadline: null,
      approvedById: 1, decision: null, decisionReason: null,
      skill: { id: 1, skillName: 'Node.js' },
      attemptBy: { id: 2, name: 'Employee One' },
      gradingReport: {
        status: 'COMPLETED', score: 50, totalTestCases: 2, passedTestCases: 1,
        completedAt: null, integritySummary: { totalEvents: 2, eventsByType: { TAB_SWITCH: 2 } }
      },
      questions: [{
        questionId: 1, position: 1,
        question: { questionContent: 'Return the sum.', questionType: 'DEBUG' },
        submissions: [{
          id: 9, submittedAnswer: 'function sum() { return 6; }',
          submittedAt: '2026-10-26T08:10:00Z', isCorrect: false,
          testResults: [
            { testCaseId: 1, visibility: 'VISIBLE', passed: true, status: 'ACCEPTED', actualOutput: '6' },
            { testCaseId: 2, visibility: 'HIDDEN_B', passed: false, status: 'WRONG_ANSWER', actualOutput: null }
          ]
        }]
      }]
    };
    service = jasmine.createSpyObj<AttemptService>('AttemptService', ['getManagerReview', 'recordDecision']);
    service.getManagerReview.and.returnValue(of({ attempt: review }));
    await TestBed.configureTestingModule({
      imports: [GradingReportComponent],
      providers: [
        provideRouter([]),
        { provide: ActivatedRoute, useValue: { snapshot: { paramMap: convertToParamMap({ attemptId: '4' }) } } },
        { provide: AttemptService, useValue: service }
      ]
    })
    .compileComponents();

    fixture = TestBed.createComponent(GradingReportComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('loads the manager report and displays score, answer and integrity summary', () => {
    expect(service.getManagerReview).toHaveBeenCalledWith(4);
    const text = fixture.nativeElement.textContent;
    expect(text).toContain('50%');
    expect(text).toContain('Employee One');
    expect(text).toContain('function sum() { return 6; }');
    expect(text).toContain('TAB_SWITCH');
    expect(text).not.toContain('HIDDEN_B');
  });

  it('requires a non-blank rejection reason', () => {
    component.decision = 'REJECTED';
    component.reason = '   ';
    component.submitDecision();
    expect(service.recordDecision).not.toHaveBeenCalled();
    expect(component.decisionError).toContain('reason is required');
  });

  it('saves a decision once and makes the attempt read-only', () => {
    const response = new Subject<{ message: string; attempt: GradingReview }>();
    service.recordDecision.and.returnValue(response);
    component.decision = 'REJECTED';
    component.reason = ' Needs more practice ';
    component.submitDecision();
    component.submitDecision();
    expect(service.recordDecision).toHaveBeenCalledOnceWith(4, 'REJECTED', 'Needs more practice');
    response.next({
      message: 'Decision saved',
      attempt: { ...review, status: 'DECIDED', decision: 'REJECTED', decisionReason: 'Needs more practice' }
    });
    fixture.detectChanges();
    expect(fixture.nativeElement.textContent).toContain('This attempt is read-only.');
    expect(fixture.nativeElement.querySelector('form')).toBeNull();
    expect(component.saving).toBeFalse();
  });

  it('does not offer a decision while grading is pending', () => {
    component.attempt = { ...review, status: 'SUBMITTED', gradingReport: null };
    fixture.detectChanges();
    expect(fixture.nativeElement.textContent).toContain('No grading report is available');
    expect(fixture.nativeElement.querySelector('form')).toBeNull();
    component.submitDecision();
    expect(service.recordDecision).not.toHaveBeenCalled();
  });

  it('shows access errors instead of a report', () => {
    service.getManagerReview.and.returnValue(throwError(() => new HttpErrorResponse({ status: 403 })));
    component.loadReport();
    fixture.detectChanges();
    expect(fixture.nativeElement.textContent).toContain('You do not manage');
    expect(fixture.nativeElement.querySelector('form')).toBeNull();
  });

  it('surfaces decision conflicts and allows refresh', () => {
    service.recordDecision.and.returnValue(throwError(() => new HttpErrorResponse({ status: 409 })));
    component.submitDecision();
    fixture.detectChanges();
    expect(fixture.nativeElement.textContent).toContain('Refresh the report before deciding');
    expect(component.saving).toBeFalse();
  });
});
