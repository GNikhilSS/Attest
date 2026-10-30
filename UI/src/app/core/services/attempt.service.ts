import { HttpClient } from '@angular/common/http';
import { Injectable } from '@angular/core';
import { Observable } from 'rxjs';
import { Attempt, AttemptDecision } from '../../models/attempt.model';
import { GradingReview } from '../../models/grading-review.model';
import { AttemptQuestion, AttemptQuestionWithTime } from '../../models/attempt-question.model';

@Injectable({
  providedIn: 'root'
})
export class AttemptService {
  private readonly apiUrl = 'http://localhost:3000/attempts';

  constructor(private http: HttpClient) {}

  getManagerReview(attemptId: number): Observable<{ attempt: GradingReview }> {
    return this.http.get<{ attempt: GradingReview }>(
      `http://localhost:3000/decisions/${attemptId}`
    );
  }

  recordDecision(
    attemptId: number,
    decision: AttemptDecision,
    decisionReason: string
  ): Observable<{ message: string; attempt: Attempt }> {
    return this.http.post<{ message: string; attempt: Attempt }>(
      `http://localhost:3000/decisions/${attemptId}`,
      { decision, decisionReason }
    );
  }

  getEmployeeAttempts(): Observable<{ attempts: Attempt[] }> {
    return this.http.get<{ attempts: Attempt[] }>(
      `${this.apiUrl}/employee`
    );
  }

  getManagerAttempts(): Observable<{ attempts: Attempt[] }> {
    return this.http.get<{ attempts: Attempt[] }>(
      `${this.apiUrl}/manager`
    );
  }

  createAttemptRequest(
    skillId: number,
    proficiencyLevel: number
  ): Observable<{ attempt: Attempt }> {
    return this.http.post<{ attempt: Attempt }>(
      this.apiUrl,
      { skillId, proficiencyLevel }
    );
  }

  approveAttemptRequest(attemptId: number): Observable<unknown> {
    return this.http.post<unknown>(
      `${this.apiUrl}/${attemptId}/approve`,
      {}
    );
  }

  deleteAttemptRequest(attemptId: number): Observable<unknown> {
    return this.http.delete<unknown>(
      `${this.apiUrl}/${attemptId}`
    );
  }

  startAttemptExam(attemptId: number) {
    return this.http.post<AttemptQuestionWithTime>(`${this.apiUrl}/${attemptId}/start`, {});
  }

  viewAttemptExam(attemptId: number) {
    return this.http.get<AttemptQuestionWithTime>(`${this.apiUrl}/${attemptId}/view`, {});
  }
}
