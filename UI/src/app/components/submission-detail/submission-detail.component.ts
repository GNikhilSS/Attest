import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import { CodingQuestion } from '../../models/codingQuestion.model';
import { NgClass } from '@angular/common';

@Component({
  selector: 'app-submission-detail',
  imports: [NgClass],
  templateUrl: './submission-detail.component.html',
  styleUrl: './submission-detail.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class SubmissionDetailComponent {
  submissionResult = input<any[]>([]);
  submittedCode = input<string>('');
  language = input<string>('');
  question = input.required<CodingQuestion>();
}
