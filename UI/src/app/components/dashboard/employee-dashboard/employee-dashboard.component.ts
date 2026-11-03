import { CommonModule } from '@angular/common';
import { Component, OnInit } from '@angular/core';
import { Attempt } from '../../../models/attempt.model';
import { AttemptService } from '../../../core/services/attempt.service';
import { CreateRequestComponent } from '../create-request/create-request.component';
import { Router } from '@angular/router';
import { AuthService } from '../../../core/services/auth.service';
import { Employee } from '../../../models/employee.model';
import { FormsModule } from '@angular/forms';
import { EmployeeService, EmployeeListItem } from '../../../core/services/employee.service';

@Component({
  selector: 'app-employee-dashboard',
  standalone: true,
  imports: [CommonModule, FormsModule, CreateRequestComponent],
  templateUrl: './employee-dashboard.component.html',
  styleUrl: './employee-dashboard.component.css'
})
export class EmployeeDashboardComponent implements OnInit {
  activeTab: string = 'employee';

  employee: Employee | null = null;

  employeeAttempts: Attempt[] = [];
  managerAttempts: Attempt[] = [];
  allAttempts: Attempt[] = [];
  employeesList: EmployeeListItem[] = [];
  loadingEmployees = false;
  mappingMessage = '';

  loadingEmployee = false;
  loadingManager = false;

  employeeError = '';
  managerError = '';

  constructor(
    private attemptService: AttemptService,
    private authService: AuthService,
    private router: Router,
    private employeeService: EmployeeService
  ) {}

  // logout
  logout(): void {
    this.authService.logout();
    this.router.navigate(['/login'])
  }

  // Call attempt apis

  ngOnInit(): void {
    this.employee = this.authService.getEmployee();
    this.loadEmployeeAttempts();
    //only show managee's req if they have direct reports
    if (this.employee?.hasReports) {
      this.loadManagerAttempts();
    }
    if (this.employee?.role === 'ADMIN' || this.employee?.role === 'SUPER_ADMIN') {
      this.activeTab = 'all';
      this.attemptService.getAllAttempts().subscribe(res => this.allAttempts = res.attempts);
    }
    if (this.employee?.role === 'SUPER_ADMIN') {
      this.loadEmployees();
    }
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

  loadEmployees(): void {
    this.loadingEmployees = true;
    this.employeeService.getAllEmployees().subscribe({
      next: (res) => {
        this.employeesList = res.employees;
        this.loadingEmployees = false;
      },
      error: (err) => {
        console.error('Failed to load employees', err);
        this.loadingEmployees = false;
      }
    });
  }

  onAssignManager(employeeId: number, managerId: number | null): void {
    this.mappingMessage = '';
    this.employeeService.assignManager(employeeId, managerId).subscribe({
      next: (res) => {
        const emp = this.employeesList.find(e => e.id === employeeId);
        if (emp) {
          emp.managedById = res.employee.managedById;
          emp.manager = res.employee.manager;
        }
        this.mappingMessage = `Updated manager for ${res.employee.name}!`;
        setTimeout(() => { this.mappingMessage = ''; }, 3000);
      },
      error: (err) => {
        alert(err.error?.message || 'Failed to assign manager');
      }
    });
  }

  setTab(tab: string): void {
    this.activeTab = tab;
    if (tab === 'manage-employees' && this.employeesList.length === 0) {
      this.loadEmployees();
    }
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
          this.allAttempts = this.allAttempts.filter(a => a.id !== attempt.id);
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
