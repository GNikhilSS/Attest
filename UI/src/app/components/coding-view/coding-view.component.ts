import {
  ChangeDetectionStrategy,
  Component,
  computed,
  HostListener,
  inject,
  signal,
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import { NgbNavModule } from '@ng-bootstrap/ng-bootstrap';
import { EditorComponent } from 'ngx-monaco-editor-v2';
import { concatMap, finalize, from, fromEvent, tap, toArray } from 'rxjs';
import { CodeExecutionResult, TestCaseRunResult } from '../../models/codingQuestion.model';
import { CodeRunComponent } from '../code-run/code-run.component';
import { CodeGeneratorService } from '../../core/services/code-generator.service';
import { ExecutionService } from '../../core/services/execution.service';
import { SpinnerService } from '../../core/services/spinner.service';
import { AttemptService } from '../../core/services/attempt.service';
import { ActivatedRoute, Router } from '@angular/router';
import { AttemptQuestion } from '../../models/attempt-question.model';

import type * as monaco from 'monaco-editor';
import { KeyCode } from 'monaco-editor';

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



  private isSubmitting = false;

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

    if (this.isSubmitting) return;
    this.isSubmitting = true;

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
        finalize(() => {
          this.spinner.closeGlobalSpinner()
          this.isSubmitting = false;
        }),
      )
      .subscribe({
        next: result => {
          this.submissionResult.set(result);
          this.active = 'submission-detail';

          this.examEventService.track(
            this.attemptId,
            'EXAM_SUBMITTED'
          );

          this.router.navigate(['/dashboard']);
        },
        error: error => {
          console.error('Failed to save drafts or submit attempt:', error);
        },
      });
  }

  private autoSubmitExam(): void {
    if (this.isSubmitting) return;

    console.log('Exam time expired. Submitting automatically.');

    this.examEventService.track(
      this.attemptId,
      'EXAM_TIME_EXPIRED'
    );

    this.submitSolution();
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
          if (!attempt.startTime) {
            console.error('In-progress attempt has no start time');
            return;
          }

          this.viewExam(attemptId);
        } else {
          console.error(`Cannot open exam in status: ${attempt.status}`);
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
        this.setExamQuestions(response.attemptQuestions);
        this.initializeTimer(response.startTime);
        this.enterFullscreen();
      },
      error: error => console.error('Failed to start exam:', error)
    });
  }

  private viewExam(attemptId: number): void {
    this.attemptService.viewAttemptExam(attemptId).subscribe({
      next: response => {
        this.examEventService.track(attemptId, 'EXAM_STARTED');
        this.setExamQuestions(response.attemptQuestions);
        this.initializeTimer(response.startTime);
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
    const previousQuestion = this.attemptQuestions()[previousIndex];

    // Save the previous question before switching.
    if (previousQuestion && previousIndex !== index) {
      const sourceCode = this.code();

      this.drafts.update(current => ({
        ...current,
        [previousQuestion.questionId]: sourceCode,
      }));

      this.executionService
        .saveDraft(
          this.attemptId,
          previousQuestion.questionId,
          sourceCode,
        )
        .subscribe({
          next: () => {
            this.examEventService.track(
              this.attemptId,
              'DRAFT_SAVED',
              previousQuestion.questionId,
            );
          },
          error: error => {
            console.error('Failed to save draft:', error);
          },
        });

      this.examEventService.track(
        this.attemptId,
        'QUESTION_CHANGED',
        item.questionId,
        {
          fromQuestionId: previousQuestion.questionId,
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
      '',
    );

    this.codeRunInput.set(
      item.question.testCases[0]?.input ?? '',
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

  private initializeTimer(startTime: string | null): void {
    if (!startTime) {
      console.error('Cannot initialize timer: start time is missing');
      return;
    }

    const durationMs = 90 * 60 * 1000;
    const deadline = new Date(startTime).getTime() + durationMs;

    const updateTimer = () => {
      const remaining = Math.max(
        0,
        Math.ceil((deadline - Date.now()) / 1000)
      );

      this.remainingSeconds.set(remaining);
    };

    updateTimer();

    timer(1000, 1000)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(() => {
        const previous = this.remainingSeconds();
        updateTimer();

        if (previous > 0 && this.remainingSeconds() === 0) {
          this.autoSubmitExam();
          this.examEventService.track(
            this.attemptId,
            'EXAM_TIME_EXPIRED'
          );
        }
      });
  }

  constructor() {
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

  @HostListener('document:copy')
  onDocumentCopy(): void {
    console.log('COPY EVENT DETECTED');

    this.examEventService.track(
      this.attemptId,
      'COPY',
      this.selectedAttemptQuestion()?.questionId,
    );
  }

  @HostListener('document:paste')
  onDocumentPaste(): void {
    console.log('PASTE EVENT DETECTED');

    this.examEventService.track(
      this.attemptId,
      'PASTE',
      this.selectedAttemptQuestion()?.questionId,
    );
  }

  onEditorInit(editorInstance: monaco.editor.IStandaloneCodeEditor): void {

    editorInstance.onKeyDown(event => {
      if (
        event.keyCode === KeyCode.KeyV &&
        (event.ctrlKey || event.metaKey)
      ) {
        this.onEditorPaste();
      }
    });
  }

  onEditorPaste(): void {
    this.examEventService.track(
      this.attemptId,
      'PASTE',
      this.selectedAttemptQuestion()?.questionId,
    );
  }

  enterFullscreen(): void {
    const element = document.documentElement;

    if (!document.fullscreenElement) {
      element.requestFullscreen().catch(error => {
        console.error('Failed to enter fullscreen:', error);
      });
    }
  }

  // Submit route
  private readonly router = inject(Router);

  showSubmitConfirmation = signal(false);

  requestSubmit(): void {
    this.showSubmitConfirmation.set(true);
  }

  cancelSubmit(): void {
    this.showSubmitConfirmation.set(false);
  }

  confirmSubmit(): void {
    this.showSubmitConfirmation.set(false);
    this.submitSolution();
  }

}
