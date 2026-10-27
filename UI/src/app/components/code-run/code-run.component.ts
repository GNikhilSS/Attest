import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { CodeExecutionResult } from '../../models/codingQuestion.model';

@Component({
  selector: 'app-code-run',
  imports: [FormsModule],
  templateUrl: './code-run.component.html',
  styleUrl: './code-run.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class CodeRunComponent {
  codeRunOutput = input<CodeExecutionResult>();
  hasErrorCompilation(): boolean {
    return this.codeRunOutput()?.status === 'Compilation Error';
  }
}
