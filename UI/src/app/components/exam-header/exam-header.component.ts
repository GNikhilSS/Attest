
import {
  ChangeDetectionStrategy,
  Component,
  computed,
  input,
  output,
} from '@angular/core';

@Component({
  selector: 'app-exam-header',
  standalone: true,
  templateUrl: './exam-header.component.html',
  styleUrl: './exam-header.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ExamHeaderComponent {
  title = input('Skill Verification Exam');
  remainingSeconds = input(90 * 60);

  submitExam = output<void>();

  formattedTime = computed(() => {
    const total = Math.max(0, this.remainingSeconds());
    const hours = Math.floor(total / 3600);
    const minutes = Math.floor((total % 3600) / 60);
    const seconds = total % 60;

    return [hours, minutes, seconds]
      .map(value => String(value).padStart(2, '0'))
      .join(':');
  });

  isTimerWarning = computed(
    () => this.remainingSeconds() <= 5 * 60
  );
}
