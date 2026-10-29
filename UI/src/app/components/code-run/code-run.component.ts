import {
  ChangeDetectionStrategy,
  Component,
  computed,
  input,
} from '@angular/core';

import {
  CodeExecutionResult,
  TestCaseRunResult,
} from '../../models/codingQuestion.model';

@Component({
  selector: 'app-code-run',
  standalone: true,
  templateUrl: './code-run.component.html',
  styleUrl: './code-run.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class CodeRunComponent {
  codeRunOutput = input<CodeExecutionResult | null>(null);
  testCaseResults = input<TestCaseRunResult[]>([]);

  passedCount = computed(
    () => this.testCaseResults().filter(result => result.passed).length
  );

  visibleResults = computed(() =>
    this.testCaseResults().filter(result => result.input !== 'HIDDEN')
  );

  hiddenResults = computed(() =>
    this.testCaseResults().filter(result => result.input === 'HIDDEN')
  );

  visiblePassedCount = computed(() =>
    this.visibleResults().filter(result => result.passed).length
  );

  hiddenPassedCount = computed(() =>
    this.hiddenResults().filter(result => result.passed).length
  );

  hasErrorCompilation(): boolean {
    return this.codeRunOutput()?.status === 'Compilation Error';
  }
}