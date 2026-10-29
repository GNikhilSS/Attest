import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  signal,
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import { NgbNavModule } from '@ng-bootstrap/ng-bootstrap';
import { EditorComponent } from 'ngx-monaco-editor-v2';
import { concatMap, finalize, from, fromEvent, map, of, tap, toArray } from 'rxjs';
import { CodeExecutionResult, TestCaseRunResult, VisibleTestCase } from '../../models/codingQuestion.model';
import { CodeRunComponent } from '../code-run/code-run.component';
import { CodeGeneratorService } from '../../core/services/code-generator.service';
import { ExecutionService } from '../../core/services/execution.service';
import { SpinnerService } from '../../core/services/spinner.service';
import { AttemptService } from '../../core/services/attempt.service';
import { ActivatedRoute } from '@angular/router';
import { AttemptQuestion } from '../../models/attempt-question.model';

import { DestroyRef } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { timer } from 'rxjs';

import { ExamHeaderComponent } from '../exam-header/exam-header.component';
import { QuestionNavigationComponent } from '../question-navigation/question-navigation.component';
import { ExamEventService } from '../../core/services/exam-event.service';
@Component({
  selector: 'app-coding-view',
  imports: [
    EditorComponent,
    FormsModule,
    NgbNavModule,
    CodeRunComponent,
    ExamHeaderComponent,
    QuestionNavigationComponent
  ],
  templateUrl: './coding-view.component.html',
  styleUrl: './coding-view.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class CodingViewComponent {
  codeGeneratorService = inject(CodeGeneratorService);
  executionService = inject(ExecutionService);
  private spinner = inject(SpinnerService);
  private readonly route = inject(ActivatedRoute);
  private readonly attemptService = inject(AttemptService);
  private readonly examEventService = inject(ExamEventService);
  private readonly attemptId = Number(
    this.route.snapshot.paramMap.get('attemptId')
  );

  attemptQuestions = signal<AttemptQuestion[]>([]);
  selectedQuestionIndex = signal(0);

  selectedAttemptQuestion = computed(
    () => this.attemptQuestions()[this.selectedQuestionIndex()]
  )

  language = signal('javascript');
  code = signal('');
  codeRunInput = signal('')
  codeRunOutput = signal<CodeExecutionResult | null>(null);
  active = 'description';
  submissionResult = signal<any>(null);
  testCaseResults = signal<TestCaseRunResult[]>([]);

  editorOptions = computed(() => ({
    language: this.language(),
    scrollBeyondLastLine: false,
    lineHeight: 20,
    fontSize: 14,
    wordWrap: 'on',
    wrappingIndent: 'indent',
    automaticLayout: true,
  }));

  
  
  submitSolution(): void {
    if (!this.attemptId) {
      console.error('Invalid attempt ID');
      return;
    }

    const questions = this.attemptQuestions();

    if (questions.length === 0) {
      console.error('No exam questions loaded');
      return;
    }

    // Capture the latest editor value for the selected question.
    const currentQuestion = this.selectedAttemptQuestion();

    if (currentQuestion) {
      this.drafts.update(current => ({
        ...current,
        [currentQuestion.questionId]: this.code(),
      }));
    }

    this.spinner.openGlobalSpinner();

    from(questions)
      .pipe(
        concatMap(item =>
          this.executionService.saveDraft(
            this.attemptId,
            item.questionId,
            this.drafts()[item.questionId] ?? '',
          )
          .pipe(
            tap(() => {
              this.examEventService.track(
                this.attemptId,
                'DRAFT_SAVED',
                item.questionId,
              );
            }),
          ),
        ),
        toArray(),
        concatMap(() =>
          this.executionService.submitAttempt(this.attemptId)
        ),
        finalize(() => this.spinner.closeGlobalSpinner()),
      )
      .subscribe({
        next: result => {
          this.examEventService.track(this.attemptId, 'EXAM_SUBMITTED');
          this.submissionResult.set(result);
          this.active = 'submission-detail';
        },
        error: error => {
          console.error('Failed to save drafts or submit attempt:', error);
        },
      });
  }



  hasErrorCompilation(): boolean {
    return this.codeRunOutput()?.status === 'Compilation Error';
  }

  
  runCode(): void {
    const item = this.selectedAttemptQuestion();

    if (!item || !this.attemptId) {
      console.error('Missing attempt or question');
      return;
    }

    this.examEventService.track(
      this.attemptId,
      'CODE_RUN',
      item.questionId,
      { language: this.language() },
    );

    const sourceCode = this.code();

    this.testCaseResults.set([]);
    this.codeRunOutput.set(null);
    this.spinner.openGlobalSpinner();

    this.executionService
      .runAllTests(this.attemptId, item.questionId, sourceCode)
      .pipe(
        finalize(() => this.spinner.closeGlobalSpinner())
      )
      .subscribe({
        next: response => {
          const results: TestCaseRunResult[] = response.results.map(
            (entry, index) => {
              const isHidden = entry.visibleinput === 'HIDDEN';
              const result = entry.result;

              return {
                testCaseNumber: index + 1,
                input: isHidden ? 'HIDDEN' : entry.visibleinput,
                expectedOutput: isHidden ? 'HIDDEN' : entry.expectedOutput ?? '',
                actualOutput: result.actualOutput ?? '',
                passed: result.passed,
                executionError:
                  result.passed || result.status === 'Accepted'
                    ? undefined
                    : result.status,
              };
            }
          );

          this.testCaseResults.set(results);
        },
        error: error => {
          console.error('Failed to run test cases:', error);

          this.codeRunOutput.set({
            message:
              error.error?.message ?? 'Failed to execute test cases.',
          });
        },
      });
  }

  runCustomInput(): void {
    const item = this.selectedAttemptQuestion();

    if (!item || !this.attemptId) {
      console.error('Missing attempt or question');
      return;
    }

    this.examEventService.track(
      this.attemptId,
      'CUSTOM_INPUT_RUN',
      item.questionId,
      { language: this.language() },
    );

    this.testCaseResults.set([]);
    this.codeRunOutput.set(null);
    this.spinner.openGlobalSpinner();

    this.executionService
      .executeCode(
        this.attemptId,
        item.questionId,
        this.code(),
        this.codeRunInput()
      )
      .pipe(
        finalize(() => this.spinner.closeGlobalSpinner())
      )
      .subscribe({
        next: result => {
          console.log('Custom execution result:', result);
        this.codeRunOutput.set(result);
        },
        error: error => {
          console.error('Custom execution failed:', error);
          this.codeRunOutput.set({
            message: error.error?.message ?? 'Execution failed.',
          });
        },
      });
  }

  loadExam(): void {
    const attemptId = Number(
      this.route.snapshot.paramMap.get('attemptId')
    );

    if (!attemptId || Number.isNaN(attemptId)) {
      console.error('Invalid attempt ID');
      return;
    }

    this.attemptService.getEmployeeAttempts().subscribe({
      next: ({ attempts }) => {
        const attempt = attempts.find(
          item => item.id === attemptId
        );

        if (!attempt) {
          console.error('Attempt not found');
          return;
        }

        if (attempt.status === 'CREATED') {
          this.startExam(attemptId);
        } else if (attempt.status === 'IN_PROGRESS') {
          this.viewExam(attemptId);
        } else {
          console.error(
            `Cannot open exam in status: ${attempt.status}`
          );
        }
      },
      error: error => {
        console.error('Failed to load attempt:', error);
      }
    });
  }

  private startExam(attemptId: number): void {
    this.attemptService.startAttemptExam(attemptId).subscribe({
      next: response => {
        this.examEventService.track(attemptId, 'EXAM_STARTED');
        this.setExamQuestions(response.attemptQuestions)
        this.enterFullscreen();
      },
      error: error => console.error('Failed to start exam:', error)
    });
  }

  private viewExam(attemptId: number): void {
    this.attemptService.viewAttemptExam(attemptId).subscribe({
      next: response => {
        this.examEventService.track(attemptId, 'EXAM_STARTED');
        this.setExamQuestions(response.attemptQuestions)
        this.enterFullscreen();
      },
      error: error => console.error('Failed to view exam:', error)
    });
  }

  private setExamQuestions(questions: AttemptQuestion[]): void {
    this.attemptQuestions.set(questions);

    this.drafts.set(
      Object.fromEntries(
        questions.map(item => [
          item.questionId,
          item.question.starterCode ?? '',
        ])
      )
    );

    this.selectQuestion(0);
  }

  selectQuestion(index: number): void {
    const item = this.attemptQuestions()[index];
    if (!item) return;

    const previousIndex = this.selectedQuestionIndex();

    if (previousIndex !== index) {
      const previousQuestion = this.attemptQuestions()[previousIndex];

      this.examEventService.track(
        this.attemptId,
        'QUESTION_CHANGED',
        item.questionId,
        {
          fromQuestionId: previousQuestion?.questionId,
          toQuestionId: item.questionId,
        },
      );
    } else {
      this.examEventService.track(
        this.attemptId,
        'QUESTION_VIEWED',
        item.questionId,
      );
    }

    this.selectedQuestionIndex.set(index);

    this.code.set(
      this.drafts()[item.questionId] ??
      item.question.starterCode ??
      ''
    );

    this.codeRunInput.set(
      item.question.testCases[0]?.input ?? ''
    );

    this.codeRunOutput.set(null);
  }

  // Drafts
  drafts = signal<Record<number, string>>({});

  onCodeChange(value: string): void {
    this.code.set(value);

    const item = this.selectedAttemptQuestion();
    if (!item) return;

    this.examEventService.trackCodeEdited(
      this.attemptId,
      item.questionId,
      value.length,
    );

    this.drafts.update(current => ({
      ...current,
      [item.questionId]: value,
    }));
  }

  // Timer
  private readonly destroyRef = inject(DestroyRef);

  readonly remainingSeconds = signal(90 * 60);

  readonly formattedTime = computed(() => {
    const total = this.remainingSeconds();
    const hours = Math.floor(total / 3600);
    const minutes = Math.floor((total % 3600) / 60);
    const seconds = total % 60;

    return [hours, minutes, seconds]
      .map(value => String(value).padStart(2, '0'))
      .join(':');
  });

  constructor() {
    timer(1000, 1000)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(() => {
        this.remainingSeconds.update(value => {
          const nextValue = Math.max(0, value - 1);

          if (value > 0 && nextValue === 0) {
            this.examEventService.track(
              this.attemptId,
              'EXAM_TIME_EXPIRED',
            );
          }

          return nextValue;
        });;
      });
    
    fromEvent(document, 'visibilitychange')
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(() => {
        this.examEventService.track(
          this.attemptId,
          document.hidden ? 'TAB_HIDDEN' : 'TAB_VISIBLE',
        );
      });

    fromEvent(document, 'fullscreenchange')
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(() => {
        this.examEventService.track(
          this.attemptId,
          document.fullscreenElement
            ? 'FULLSCREEN_ENTERED'
            : 'FULLSCREEN_EXITED',
        );
      });

    this.loadExam();
  }

  enterFullscreen(): void {
    const element = document.documentElement;

    if (!document.fullscreenElement) {
      element.requestFullscreen().catch(error => {
        console.error('Failed to enter fullscreen:', error);
      });
    }
  }

}
