import { CommonModule } from '@angular/common';
import { Component, EventEmitter, OnInit, Output } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Skill, SkillService } from '../../../core/services/skill.service';
import { AttemptService } from '../../../core/services/attempt.service';

@Component({
  selector: 'app-create-request',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './create-request.component.html',
  styleUrl: './create-request.component.css'
})
export class CreateRequestComponent implements OnInit {
  skills: Skill[] = [];

  selectedSkillId: number | null = null;
  proficiencyLevel = 2;

  loadingSkills = false;
  errorMessage = '';

  @Output() requestCreated = new EventEmitter<void>();

  loadingSubmit = false;
  submitError = '';
  submitSuccess = false;

  constructor(
    private skillService: SkillService,
    private attemptService: AttemptService
  ) {}

  ngOnInit(): void {
    this.loadSkills();
  }

  loadSkills(): void {
    this.loadingSkills = true;
    this.errorMessage = '';

    this.skillService.getSkills().subscribe({
      next: (res) => {
        this.skills = res.skills;
        this.loadingSkills = false;
      },
      error: () => {
        this.errorMessage = 'Could not load available skills.';
        this.loadingSkills = false;
      }
    });
  }

  submitRequest(): void {
    if (this.selectedSkillId === null || this.loadingSubmit) {
      return;
    }

    this.loadingSubmit = true;
    this.submitError = '';

    this.attemptService.createAttemptRequest(
      this.selectedSkillId, 
      this.proficiencyLevel
    ).subscribe({
      next: () => {
        this.loadingSubmit = false;
        this.requestCreated.emit();
      },
      error: () => {
        this.loadingSubmit = false;
        this.submitError = 'Could not create request. Please try again.'
      }
    })
  }
}
