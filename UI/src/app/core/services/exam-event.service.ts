import { inject, Injectable } from '@angular/core';
import { ExamEventType } from '../../models/exam-event.model';
import { debounceTime, Subject } from 'rxjs';
import { HttpClient } from '@angular/common/http';

@Injectable({
    providedIn: 'root',
})
export class ExamEventService {
    private readonly http = inject(HttpClient);

    private readonly apiUrl = 'http://localhost:3000/attempts';

    private readonly codeEdits = new Subject<{
        attemptId: number;
        questionId: number;
        characterCount: number;
    }>();

    constructor() {
        this.codeEdits.pipe(debounceTime(1500)).subscribe(edit => {
            this.track(
                edit.attemptId,
                'CODE_EDITED',
                edit.questionId,
                { characterCount: edit.characterCount },
            );
        });
    }

    track(
        attemptId: number,
        eventType: ExamEventType,
        questionId?: number,
        metadata?: Record<string, unknown>,
    ): void {
        const payload = {
            ...(questionId !== undefined ? { questionId } : {}),
            ...metadata,
        };

        this.http
            .post(`${this.apiUrl}/${attemptId}/events`, {
                type: eventType,
                payload,
            })
            .subscribe({
                next: response => console.log('[Exam Event Saved]', response),
                error: error => console.error('Failed to save exam event:', error),
            });
    }

    trackCodeEdited(
        attemptId: number,
        questionId: number,
        characterCount: number,
    ): void {
        this.codeEdits.next({ attemptId, questionId, characterCount });
    }
}