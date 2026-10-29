import { HttpClient } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { Observable } from 'rxjs';
import {
  CodeExecution,
  CodeExecutionResult,
  RunAllTestsResult,
} from '../../models/codingQuestion.model';

@Injectable({
  providedIn: 'root',
})
export class ExecutionService {
  private http = inject(HttpClient);
  private url = 'http://localhost:3000/grading';
 
  executeCode(
    attemptId: number,
    questionId: number,
    sourceCode: string,
    stdin: string
  ): Observable<CodeExecutionResult> {
    return this.http.post<CodeExecutionResult>(
      `${this.url}/${attemptId}/questions/${questionId}/run`,
      { sourceCode, stdin }
    );
  }

  runAllTests(
    attemptId: number,
    questionId: number,
    sourceCode: string
  ): Observable<RunAllTestsResult> {
    return this.http.post<RunAllTestsResult>(
      `${this.url}/${attemptId}/questions/${questionId}/runAllTests`,
      { sourceCode }
    );
  }

  saveDraft(
    attemptId: number,
    questionId: number,
    sourceCode: string
  ): Observable<unknown> {
    return this.http.put(
      `${this.url}/${attemptId}/questions/${questionId}/draft`,
      { sourceCode }
    );
  }

  submitAttempt(attemptId: number): Observable<{
    message: string;
    attemptId: number;
    status: string;
    gradingStatus: string;
  }> {
    return this.http.post<{
      message: string;
      attemptId: number;
      status: string;
      gradingStatus: string;
    }>(`${this.url}/${attemptId}/submit`, {});
  }

  getGradingReport(attemptId: number): Observable<{
    attemptId: number;
    attemptStatus: string;
    report: unknown;
  }> {
    return this.http.get<{
      attemptId: number;
      attemptStatus: string;
      report: unknown;
    }>(`${this.url}/${attemptId}/report`);
  }
}
