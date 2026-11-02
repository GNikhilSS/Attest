
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
  password = '';
  loading = false;
  errorMessage = '';
  registeredEmployeeId: number | null = null;

  constructor(
    private authService: AuthService,
    private router: Router
  ) {}

  onSubmit(): void {
    this.errorMessage = '';

    const trimmedName = this.employeeName.trim();

    if (!/^[a-zA-Z0-9_-]{4,25}$/.test(trimmedName)) {
      this.errorMessage =
        'Name must be 4–25 characters and contain only letters, numbers, underscores, or hyphens.';
      return;
    }

    if (
      this.password.length < 4 ||
      this.password.length > 16 ||
      !/[A-Z]/.test(this.password)
    ) {
      this.errorMessage =
        'Password must be 4–16 characters and contain at least one uppercase letter.';
      return;
    }

    this.loading = true;

    this.authService.register(trimmedName, this.password).subscribe({
      next: (res) => {
        this.registeredEmployeeId = res.employeeId;
        this.loading = false;
      },
      error: (error) => {
        this.loading = false;
        this.errorMessage =
          error.error?.message ?? 'Registration failed. Please try again.';
      }
    });
  }

  continueToDashboard(): void {
    this.router.navigate(['/dashboard']);
  }
}
