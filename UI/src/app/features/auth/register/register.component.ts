import { Component } from '@angular/core';
import { AuthService } from '../../../core/services/auth.service';
import { Router, RouterLink } from '@angular/router';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';

@Component({
  selector: 'app-register',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterLink],
  templateUrl: './register.component.html',
  styleUrl: './register.component.css'
})
export class RegisterComponent {
  employeeName = '';
  loading = false;
  errorMessage = '';
  registeredEmployeeId: number | null = null;

  constructor(
    private authService: AuthService,
    private router: Router
  ) {}

  onSubmit(): void {
    this.errorMessage = '';
    this.employeeName = this.employeeName.trim();

    if (!this.employeeName) {
      this.errorMessage = 'Please enter your name';
      return;
    }

    this.loading = true;

    this.authService.register(this.employeeName).subscribe({
      next: (res) => {
        this.registeredEmployeeId = res.employee.id;
        this.loading = false;
      },
      error: (error) => {
        this.loading = false;
        this.errorMessage = error.error?.message ?? 'Registration failed. Please try again.';
      }
    });
  }

  continueToDashboard(): void {
    this.router.navigate(['/dashboard']);
  }
}
