import { CommonModule } from '@angular/common';
import { HttpErrorResponse } from '@angular/common/http';
import { Component, DestroyRef, OnInit, inject } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { AttemptService } from '../../core/services/attempt.service';
import { AttemptDecision } from '../../models/attempt.model';
import { GradingReview, ReviewTestResult } from '../../models/grading-review.model';

@Component({
  selector: 'app-grading-report',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterLink],
  templateUrl: './grading-report.component.html',
  styleUrl: './grading-report.component.css'
})
export class GradingReportComponent implements OnInit {
  private readonly destroyRef = inject(DestroyRef);
  private readonly route = inject(ActivatedRoute);
  private readonly attemptService = inject(AttemptService);

  attempt: GradingReview | null = null;
  loading = false;
  saving = false;
  error = '';
  decisionError = '';
  success = '';
  decision: AttemptDecision = 'APPROVED';
  reason = '';

  ngOnInit(): void {
    this.loadReport();
  }

  loadReport(): void {
    const attemptId = Number(this.route.snapshot.paramMap.get('attemptId'));
    if (!Number.isSafeInteger(attemptId) || attemptId <= 0) {
      this.error = 'Invalid attempt ID.';
      return;
    }
    this.loading = true;
    this.error = '';
    this.attemptService.getManagerReview(attemptId)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: ({ attempt }) => {
          this.attempt = attempt;
          this.loading = false;
        },
        error: (error: unknown) => {
          this.error = this.errorMessage(error, 'Could not load the grading report. Please try again.');
          this.loading = false;
        }
      });
  }

  visibleResults(results: ReviewTestResult[] | null): ReviewTestResult[] {
    return (results ?? []).filter(result => result.visibility !== 'HIDDEN_B');
  }

  submitDecision(): void {
    if (!this.attempt || this.saving || this.attempt.status !== 'GRADED') return;
    this.decisionError = '';
    if (this.decision === 'REJECTED' && !this.reason.trim()) {
      this.decisionError = 'A reason is required when rejecting an attempt.';
      return;
    }
    this.saving = true;
    this.attemptService.recordDecision(this.attempt.id, this.decision, this.decision === 'REJECTED' ? this.reason.trim() : '')
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: ({ attempt, message }) => {
          if (this.attempt) {
            this.attempt = { ...this.attempt, ...attempt };
          }
          this.saving = false;
          this.success = message;
        },
        error: (error: unknown) => {
          this.saving = false;
          this.decisionError = this.errorMessage(error, 'Could not save the decision. Please try again.');
        }
      });
  }

  private errorMessage(error: unknown, fallback: string): string {
    if (error instanceof HttpErrorResponse) {
      if (error.status === 403) return 'You do not manage the employee for this attempt.';
      if (error.status === 404) return 'Attempt not found.';
      if (error.status === 409) return 'The attempt has changed. Refresh the report before deciding.';
      if (error.status === 401) return 'Your session has expired. Please sign in again.';
    }
    return fallback;
  }
}
