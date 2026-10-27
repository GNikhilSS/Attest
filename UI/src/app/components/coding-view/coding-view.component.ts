import { NgClass } from '@angular/common';
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
import { concatMap, finalize, from, toArray } from 'rxjs';
import { CodeExecutionResult } from '../../models/codingQuestion.model';
import { CodeRunComponent } from '../code-run/code-run.component';
import { CodeGeneratorService } from '../../core/services/code-generator.service';
import { ExecutionService } from '../../core/services/execution.service';
import { SpinnerService } from '../../core/services/spinner.service';
import { AttemptService } from '../../core/services/attempt.service';
import { ActivatedRoute } from '@angular/router';
import { AttemptQuestion } from '../../core/models/attempt-question.model';
@Component({
  selector: 'app-coding-view',
  imports: [
    EditorComponent,
    FormsModule,
    NgbNavModule,
    CodeRunComponent,
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
        ),
        toArray(),
        concatMap(() =>
          this.executionService.submitAttempt(this.attemptId)
        ),
        finalize(() => this.spinner.closeGlobalSpinner()),
      )
      .subscribe({
        next: result => {
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

    this.spinner.openGlobalSpinner();

    this.executionService
      .executeCode(
        this.attemptId,
        item.questionId,
        this.code(),
        this.codeRunInput(),
      )
      .pipe(
        finalize(() => this.spinner.closeGlobalSpinner()),
      )
      .subscribe({
        next: (result) => {
          console.log('Code execution:', result);
          this.codeRunOutput.set(result);
        },
        error: (error) => {
          console.error('Code execution failed:', error);

          this.codeRunOutput.set({
            message:
              error.error?.message ?? 'Failed to execute code.',
            stderr:
              error.error?.message ?? 'Failed to execute code.',
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
      next: response => this.setExamQuestions(response.attemptQuestions),
      error: error => console.error('Failed to start exam:', error)
    });
  }

  private viewExam(attemptId: number): void {
    this.attemptService.viewAttemptExam(attemptId).subscribe({
      next: response => this.setExamQuestions(response.attemptQuestions),
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

  constructor() {
    this.loadExam();
  }

  // Drafts
  drafts = signal<Record<number, string>>({});

  onCodeChange(value: string): void {
    this.code.set(value);

    const item = this.selectedAttemptQuestion();
    if (!item) return;

    this.drafts.update(current => ({
      ...current,
      [item.questionId]: value,
    }));
  }

}
