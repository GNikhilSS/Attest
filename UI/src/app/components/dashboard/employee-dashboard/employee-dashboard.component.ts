import { CommonModule } from '@angular/common';
import { Component, OnInit } from '@angular/core';
import { Attempt } from '../../../models/attempt.model';
import { AttemptService } from '../../../core/services/attempt.service';
import { CreateRequestComponent } from '../create-request/create-request.component';
import { Router } from '@angular/router';
import { AuthService } from '../../../core/services/auth.service';
import { Employee } from '../../../models/employee.model';

@Component({
  selector: 'app-employee-dashboard',
  standalone: true,
  imports: [CommonModule, CreateRequestComponent],
  templateUrl: './employee-dashboard.component.html',
  styleUrl: './employee-dashboard.component.css'
})
export class EmployeeDashboardComponent implements OnInit {
  activeTab: 'employee' | 'manager' = 'employee';

  employee: Employee | null = null;

  employeeAttempts: Attempt[] = [];
  managerAttempts: Attempt[] = [];

  loadingEmployee = false;
  loadingManager = false;

  employeeError = '';
  managerError = '';

  constructor(
    private attemptService: AttemptService,
    private authService: AuthService,
    private router: Router
  ) {}

  // logout
  logout(): void {
    this.authService.logout();
    this.router.navigate(['/login'])
  }

  // Call attempt apis

  ngOnInit(): void {
    this.loadEmployeeAttempts();
    this.loadManagerAttempts();
    
    this.employee = this.authService.getEmployee();
  }

  loadEmployeeAttempts(): void {
    this.loadingEmployee = true;
    this.employeeError = '';

    this.attemptService.getEmployeeAttempts().subscribe({
      next: (res) => {
        this.employeeAttempts = res.attempts;
        this.loadingEmployee = false;
      },
      error: () => {
        this.employeeError = 'Could not load your attempts.';
        this.loadingEmployee = false;
      }
    });
  }

  loadManagerAttempts(): void {
    this.loadingManager = true;
    this.managerError = '';

    this.attemptService.getManagerAttempts().subscribe({
      next: (res) => {
        this.managerAttempts = res.attempts;
        this.loadingManager = false;
      },
      error: () => {
        this.managerError = 'Could not load your managees attempts.';
        this.loadingManager = false;
      }
    });
  }

  setTab(tab: 'employee' | 'manager'): void {
    this.activeTab = tab;
  }

  // Create Attempt modal

  isCreateRequestOpen = false;

  openCreateRequest(): void {
    this.isCreateRequestOpen = true;
  }

  closeCreateRequest(): void {
    this.isCreateRequestOpen = false;
  }

  onRequestCreated(): void {
    this.closeCreateRequest();
    this.loadEmployeeAttempts();
  }

  // Attempt modal
  selectedAttempt: Attempt | null = null;

  openAttemptDetails(attempt: Attempt): void {
    this.selectedAttempt = attempt;
  }

  closeAttemptDetails(): void {
    this.selectedAttempt = null;
  }

  // Buttons per role in modal
  canTakeExam(attempt: Attempt): boolean {
    return attempt.status === 'CREATED';
  }

  canResumeExam(attempt: Attempt): boolean {
    return attempt.status === 'IN_PROGRESS';
  }

  openExam(attempt: Attempt): void {
    this.closeAttemptDetails();
    this.router.navigate(['/exams', attempt.id]);
  }

  // Manager Approval

  approvingAttemptLoading = false;
  approvalError = '';

  approveRequest(attempt: Attempt): void {
    if (attempt.status !== 'REQUESTED' || this.approvingAttemptLoading) {
      return;
    }

    this.approvingAttemptLoading = true
    this.approvalError = '';  
    
    console.log('Approving attempt:', attempt.id);

    this.attemptService.approveAttemptRequest(attempt.id).subscribe({
      next: (res) => {
        console.log('Approval response:', res);

        this.approvingAttemptLoading = false;
        this.closeAttemptDetails();
        this.loadManagerAttempts();

        console.log('Manager attempts reload triggered');
      },
      error: (error) => {
        console.error('Approval failed:', error);

        this.approvingAttemptLoading = false;
        this.approvalError = 'Could not approve. Please try again';
      },
      complete: () => {
        console.log('Done')
      }
    });
  }

  // Manager delete attempt

  deleteAttemptLoading = false;
  deleteError = '';

  deleteRequest(attempt: Attempt): void {
      if (attempt.status !== 'REQUESTED' || this.deleteAttemptLoading) return;

      const confirmed = window.confirm(`Delete request #${attempt.id} for ${attempt.skill.skillName}?`);

      if (!confirmed) return;

      this.deleteAttemptLoading = true;
      this.deleteError = '';

      this.attemptService.deleteAttemptRequest(attempt.id).subscribe({
        next: () => {
          this.deleteAttemptLoading = false;
          this.closeAttemptDetails();
          this.loadManagerAttempts();
        },
        error: () => {
          this.deleteAttemptLoading = false;
          this.deleteError = 'Could not delete the request.';
        }
      });
  }

  // Grading Report

  openGradingReport(attempt: Attempt): void {
    this.closeAttemptDetails();
    this.router.navigate(['/attempts', attempt.id, 'report']);
  }
}
