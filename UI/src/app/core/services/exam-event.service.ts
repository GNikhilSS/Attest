import { Injectable } from '@angular/core';
import { ExamEvent, ExamEventType } from '../../models/exam-event.model';
import { debounceTime, Subject } from 'rxjs';

@Injectable({
  providedIn: 'root',
})
export class ExamEventService {
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
        const event: ExamEvent = {
        attemptId,
        eventType,
        timestamp: new Date().toISOString(),
        ...(questionId !== undefined ? { questionId } : {}),
        ...(metadata ? { metadata } : {}),
        };

        // Temporary: verify event tracking in the browser console.
        // Later, replace this with a POST to the backend.
        console.log('[Exam Event]', event);
    }

    trackCodeEdited(
        attemptId: number,
        questionId: number,
        characterCount: number,
    ): void {
        this.codeEdits.next({ attemptId, questionId, characterCount });
    }
}