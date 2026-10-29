
import {
  ChangeDetectionStrategy,
  Component,
  input,
  output,
} from '@angular/core';
import { AttemptQuestion } from '../../models/attempt-question.model';

@Component({
  selector: 'app-question-navigation',
  standalone: true,
  templateUrl: './question-navigation.component.html',
  styleUrl: './question-navigation.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class QuestionNavigationComponent {
  questions = input<AttemptQuestion[]>([]);
  selectedIndex = input(0);

  questionSelected = output<number>();
}
